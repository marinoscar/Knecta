import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DataAgentStateType } from '../state';
import { StepResult, TrackedToolCall } from '../types';
import { EmitFn } from '../graph';
import { buildExecutorRepairPrompt, buildPythonGenerationPrompt, buildChartSpecPrompt } from '../prompts/executor.prompt';
import { DiscoveryService } from '../../../discovery/discovery.service';
import { SandboxService } from '../../../sandbox/sandbox.service';
import { extractTokenUsage, mergeTokenUsage } from '../utils/token-tracker';
import { DataAgentTracer } from '../utils/data-agent-tracer';
import { extractTextContent } from '../utils/content-extractor';
import { z } from 'zod';
import { ChartSpec } from '../types';

// ─── Chart Specification Validation Schema ───

const ChartSeriesSchema = z.object({
  label: z.string().describe('Series name shown in legend'),
  data: z.array(z.number()).describe('Numeric values, one per category'),
});

const ChartSliceSchema = z.object({
  label: z.string().describe('Slice label'),
  value: z.number().describe('Slice value (converted to percentage)'),
});

const ChartPointSchema = z.object({
  x: z.number().describe('X coordinate'),
  y: z.number().describe('Y coordinate'),
  label: z.string().optional().describe('Optional point label for hover tooltip'),
});

export const ChartSpecSchema = z.object({
  type: z.enum(['bar', 'line', 'pie', 'scatter'])
    .describe('Chart type (determines MUI X component)'),
  title: z.string()
    .min(1)
    .max(60)
    .describe('Concise chart title (max 60 chars)'),
  xAxisLabel: z.string().optional()
    .describe('X-axis label with units (e.g., "Month", "Region")'),
  yAxisLabel: z.string().optional()
    .describe('Y-axis label with units (e.g., "Revenue ($M)")'),
  categories: z.array(z.string()).optional()
    .describe('X-axis category labels (for bar/line charts)'),
  series: z.array(ChartSeriesSchema).optional()
    .describe('Data series for bar/line charts (can be multiple)'),
  slices: z.array(ChartSliceSchema).max(8).optional()
    .describe('Pie chart slices (max 8, group remaining as "Other")'),
  points: z.array(ChartPointSchema).optional()
    .describe('Scatter plot points (x/y coordinates)'),
  layout: z.enum(['vertical', 'horizontal']).optional()
    .describe('Chart orientation (bar charts only, default: vertical)'),
});

export function createExecutorNode(
  llm: any,
  structuredLlm: any,
  discoveryService: DiscoveryService,
  sandboxService: SandboxService,
  connectionId: string,
  databaseName: string,
  emit: EmitFn,
  tracer: DataAgentTracer,
  webSearchTool: Record<string, unknown> | null = null,
) {
  // Bind web search (server-side) once at node creation time so all invocations
  // within this node share the same bound LLM instance.
  const invoker = webSearchTool ? llm.bindTools([webSearchTool]) : llm;

  return async (state: DataAgentStateType): Promise<Partial<DataAgentStateType>> => {
    emit({ type: 'phase_start', phase: 'executor', description: 'Executing queries and analysis' });

    const stepResults: StepResult[] = [];
    const trackedToolCalls: TrackedToolCall[] = [];
    const plan = state.plan!;
    let nodeTokens = { prompt: 0, completion: 0, total: 0 };

    // Build schema reference string from joinPlan YAML for repair/python prompts
    const joinPlan = state.joinPlan;
    const datasetSchemas = joinPlan?.relevantDatasets
      .map((ds) => `### ${ds.name} (${ds.source})\n\`\`\`yaml\n${ds.yaml}\n\`\`\``)
      .join('\n\n') || '';

    try {
      for (const step of plan.steps) {
        emit({ type: 'step_start', stepId: step.id, description: step.description, strategy: step.strategy });

        const stepResult: StepResult = {
          stepId: step.id,
          description: step.description,
          strategy: step.strategy,
        };

        // Build context from dependent steps
        const priorContext = step.dependsOn
          .map((depId) => stepResults.find((r) => r.stepId === depId))
          .filter(Boolean)
          .map((r) => {
            let ctx = `Step ${r!.stepId} (${r!.description}):`;
            if (r!.sqlResult) ctx += `\n${r!.sqlResult.data}`;
            if (r!.pythonResult) ctx += `\n${r!.pythonResult.stdout}`;
            return ctx;
          })
          .join('\n\n');

        // ── SQL Execution ──
        if (step.strategy === 'sql' || step.strategy === 'sql_then_python') {
          const querySpec = state.querySpecs?.find((q) => q.stepId === step.id);
          if (querySpec) {
            let fullSql = querySpec.fullSql;

            // Run pilot query first
            try {
              emit({ type: 'tool_start', phase: 'executor', stepId: step.id, name: 'query_database', args: { sql: querySpec.pilotSql } });
              const pilotResult = await discoveryService.executeQuery(connectionId, querySpec.pilotSql, 10, databaseName);
              emit({ type: 'tool_end', phase: 'executor', stepId: step.id, name: 'query_database', result: `Pilot OK: ${pilotResult.data.rowCount} rows` });
              trackedToolCalls.push({ phase: 'executor', stepId: step.id, name: 'query_database', args: { sql: querySpec.pilotSql }, result: `Pilot OK: ${pilotResult.data.rowCount} rows` });
            } catch (pilotError) {
              // Pilot failed — attempt SQL repair
              const errMsg = pilotError instanceof Error ? pilotError.message : String(pilotError);
              emit({ type: 'tool_error', phase: 'executor', stepId: step.id, name: 'query_database', error: errMsg });

              try {
                const dialectType = (state.databaseType === 's3' || state.databaseType === 'azure_blob') ? 'DuckDB' : state.databaseType;
                const repairPrompt = buildExecutorRepairPrompt(step.description, querySpec.pilotSql, errMsg, dialectType, datasetSchemas);
                const repairMessages = [
                  new SystemMessage('You are a SQL repair expert. Fix the broken SQL query and return ONLY the corrected SQL.'),
                  new HumanMessage(repairPrompt),
                ];
                const { response: repairResponse } = await tracer.trace<any>(
                  { phase: 'executor', stepId: step.id, purpose: `sql_repair_step_${step.id}`, structuredOutput: false },
                  repairMessages,
                  () => invoker.invoke(repairMessages),
                );
                nodeTokens = mergeTokenUsage(nodeTokens, extractTokenUsage(repairResponse));
                const repairedSql = extractTextContent(repairResponse.content).trim();
                if (repairedSql) {
                  fullSql = repairedSql;
                }
              } catch {
                // Repair failed, continue with original fullSql
              }
            }

            // Run full query
            try {
              emit({ type: 'tool_start', phase: 'executor', stepId: step.id, name: 'query_database', args: { sql: fullSql } });
              const fullResult = await discoveryService.executeQuery(connectionId, fullSql, 500, databaseName);
              const { data } = fullResult;

              // Format as pipe-separated table (truncate to 100 rows for state)
              const header = data.columns.join(' | ');
              const separator = data.columns.map(() => '---').join(' | ');
              const rows = data.rows
                .slice(0, 100)
                .map((row: any[]) => row.map((v) => (v === null ? 'NULL' : String(v))).join(' | '))
                .join('\n');

              stepResult.sqlResult = {
                rowCount: data.rowCount,
                columns: data.columns,
                data: `${header}\n${separator}\n${rows}`,
              };

              emit({ type: 'tool_end', phase: 'executor', stepId: step.id, name: 'query_database', result: `${data.rowCount} rows returned` });
              trackedToolCalls.push({ phase: 'executor', stepId: step.id, name: 'query_database', args: { sql: fullSql }, result: `${data.rowCount} rows` });
            } catch (sqlError) {
              const sqlMsg = sqlError instanceof Error ? sqlError.message : String(sqlError);
              stepResult.error = `SQL Error: ${sqlMsg}`;
              emit({ type: 'tool_error', phase: 'executor', stepId: step.id, name: 'query_database', error: sqlMsg });
            }
          }
        }

        // ── Chart Spec Generation (replaces Python for visualization steps) ──
        if (step.chartType && (stepResult.sqlResult || priorContext)) {
          try {
            const chartPrompt = buildChartSpecPrompt(
              step.description,
              step.chartType,
              stepResult.sqlResult?.data || null,
              priorContext,
            );

            const chartMessages = [
              new SystemMessage('You are a data visualization expert. Extract chart data from execution results and output a structured chart specification.'),
              new HumanMessage(chartPrompt),
            ];

            const structuredChart = structuredLlm.withStructuredOutput(ChartSpecSchema, {
              name: 'create_chart',
              includeRaw: true,
            });

            const { response: chartResponse } = await tracer.trace<any>(
              {
                phase: 'executor',
                stepId: step.id,
                purpose: `chart_gen_step_${step.id}`,
                structuredOutput: true,
              },
              chartMessages,
              () => structuredChart.invoke(chartMessages),
            );

            stepResult.chartSpec = chartResponse.parsed as ChartSpec;

            nodeTokens = mergeTokenUsage(
              nodeTokens,
              extractTokenUsage(chartResponse.raw),
            );

            emit({
              type: 'tool_end',
              phase: 'executor',
              stepId: step.id,
              name: 'create_chart',
              result: `${step.chartType} chart: ${stepResult.chartSpec.title}`,
            });

            trackedToolCalls.push({
              phase: 'executor',
              stepId: step.id,
              name: 'create_chart',
              args: { chartType: step.chartType },
              result: stepResult.chartSpec.title,
            });
          } catch (chartError) {
            const chartMsg =
              chartError instanceof Error ? chartError.message : String(chartError);

            if (!stepResult.error) stepResult.error = '';
            stepResult.error += `Chart Generation Error: ${chartMsg}`;

            emit({
              type: 'tool_error',
              phase: 'executor',
              stepId: step.id,
              name: 'create_chart',
              error: chartMsg,
            });
          }
        }

        // ── Python Execution ──
        if (
          (step.strategy === 'python' || step.strategy === 'sql_then_python') &&
          !step.chartType
        ) {
          try {
            const prompt = buildPythonGenerationPrompt(
              step.description,
              step.strategy,
              stepResult.sqlResult?.data || null,
              priorContext,
              datasetSchemas,
              webSearchTool !== null,
            );

            const codeMessages = [
              new SystemMessage('You are a Python code generator. Output ONLY executable Python code. No markdown fences, no explanation.'),
              new HumanMessage(prompt),
            ];
            const { response: codeResponse } = await tracer.trace<any>(
              { phase: 'executor', stepId: step.id, purpose: `python_gen_step_${step.id}`, structuredOutput: false },
              codeMessages,
              () => invoker.invoke(codeMessages),
            );
            nodeTokens = mergeTokenUsage(nodeTokens, extractTokenUsage(codeResponse));

            let code = extractTextContent(codeResponse.content);
            // Strip markdown fences if present
            code = code.replace(/^```(?:python)?\n?/m, '').replace(/\n?```\s*$/m, '').trim();

            if (code) {
              emit({ type: 'tool_start', phase: 'executor', stepId: step.id, name: 'run_python', args: { code: code.substring(0, 200) + '...' } });
              const pyResult = await sandboxService.executeCode(code, 30);

              let stdout = pyResult.stdout || '';
              if (pyResult.stderr && pyResult.returnCode !== 0) {
                stdout += `\nError: ${pyResult.stderr}`;
              }

              const charts = (pyResult.files || []).map(
                (f: any) => `data:${f.mimeType};base64,${f.base64}`,
              );

              stepResult.pythonResult = { stdout, charts };

              emit({ type: 'tool_end', phase: 'executor', stepId: step.id, name: 'run_python', result: stdout.substring(0, 500) });
              trackedToolCalls.push({ phase: 'executor', stepId: step.id, name: 'run_python', args: { code: code.substring(0, 200) }, result: stdout.substring(0, 500) });
            }
          } catch (pyError) {
            const pyMsg = pyError instanceof Error ? pyError.message : String(pyError);
            if (!stepResult.error) stepResult.error = '';
            stepResult.error += `Python Error: ${pyMsg}`;
            emit({ type: 'tool_error', phase: 'executor', stepId: step.id, name: 'run_python', error: pyMsg });
          }
        }

        stepResults.push(stepResult);
        emit({ type: 'step_complete', stepId: step.id });
      }

      emit({ type: 'phase_artifact', phase: 'executor', artifact: stepResults });
      emit({ type: 'token_update', phase: 'executor', tokensUsed: nodeTokens });
      emit({ type: 'phase_complete', phase: 'executor' });

      return {
        stepResults,
        currentPhase: 'executor',
        toolCalls: trackedToolCalls,
        tokensUsed: nodeTokens,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      emit({ type: 'phase_complete', phase: 'executor' });
      return {
        stepResults,
        currentPhase: 'executor',
        error: `Executor error: ${msg}`,
        tokensUsed: nodeTokens,
      };
    }
  };
}
