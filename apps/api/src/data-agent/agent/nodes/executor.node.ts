import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DataAgentStateType } from '../state';
import { StepResult, TrackedToolCall } from '../types';
import { EmitFn } from '../graph';
import { buildExecutorRepairPrompt, buildPythonGenerationPrompt } from '../prompts/executor.prompt';
import { DiscoveryService } from '../../../discovery/discovery.service';
import { SandboxService } from '../../../sandbox/sandbox.service';

export function createExecutorNode(
  llm: any,
  discoveryService: DiscoveryService,
  sandboxService: SandboxService,
  connectionId: string,
  emit: EmitFn,
) {
  return async (state: DataAgentStateType): Promise<Partial<DataAgentStateType>> => {
    emit({ type: 'phase_start', phase: 'executor', description: 'Executing queries and analysis' });

    const stepResults: StepResult[] = [];
    const trackedToolCalls: TrackedToolCall[] = [];
    const plan = state.plan!;

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
              const pilotResult = await discoveryService.executeQuery(connectionId, querySpec.pilotSql, state.userId, 10);
              emit({ type: 'tool_end', phase: 'executor', stepId: step.id, name: 'query_database', result: `Pilot OK: ${pilotResult.data.rowCount} rows` });
              trackedToolCalls.push({ phase: 'executor', stepId: step.id, name: 'query_database', args: { sql: querySpec.pilotSql }, result: `Pilot OK: ${pilotResult.data.rowCount} rows` });
            } catch (pilotError) {
              // Pilot failed — attempt SQL repair
              const errMsg = pilotError instanceof Error ? pilotError.message : String(pilotError);
              emit({ type: 'tool_error', phase: 'executor', stepId: step.id, name: 'query_database', error: errMsg });

              try {
                const repairPrompt = buildExecutorRepairPrompt(step.description, querySpec.pilotSql, errMsg, state.databaseType);
                const repairResponse = await llm.invoke([new SystemMessage(repairPrompt)]);
                const repairedSql = typeof repairResponse.content === 'string' ? repairResponse.content.trim() : '';
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
              const fullResult = await discoveryService.executeQuery(connectionId, fullSql, state.userId, 500);
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

        // ── Python Execution ──
        if (step.strategy === 'python' || step.strategy === 'sql_then_python') {
          try {
            const prompt = buildPythonGenerationPrompt(
              step.description,
              step.strategy,
              stepResult.sqlResult?.data || null,
              priorContext,
            );

            const codeResponse = await llm.invoke([
              new SystemMessage('You are a Python code generator. Output ONLY executable Python code. No markdown fences, no explanation.'),
              new HumanMessage(prompt),
            ]);

            let code = typeof codeResponse.content === 'string' ? codeResponse.content : '';
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
      emit({ type: 'phase_complete', phase: 'executor' });

      return {
        stepResults,
        currentPhase: 'executor',
        toolCalls: trackedToolCalls,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      emit({ type: 'phase_complete', phase: 'executor' });
      return {
        stepResults,
        currentPhase: 'executor',
        error: `Executor error: ${msg}`,
      };
    }
  };
}
