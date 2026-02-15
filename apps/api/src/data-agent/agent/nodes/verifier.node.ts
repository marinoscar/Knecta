import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { DataAgentStateType } from '../state';
import { VerificationReport, VerificationCheck } from '../types';
import { EmitFn } from '../graph';
import { buildVerifierPrompt } from '../prompts/verifier.prompt';
import { SandboxService } from '../../../sandbox/sandbox.service';
import { extractTokenUsage } from '../utils/token-tracker';
import { DataAgentTracer } from '../utils/data-agent-tracer';

export function createVerifierNode(llm: any, sandboxService: SandboxService, emit: EmitFn, tracer: DataAgentTracer) {
  return async (state: DataAgentStateType): Promise<Partial<DataAgentStateType>> => {
    emit({ type: 'phase_start', phase: 'verifier', description: 'Verifying results' });

    try {
      const plan = state.plan!;
      const stepResults = state.stepResults || [];

      // For simple queries, skip verification
      if (plan.complexity === 'simple') {
        const passReport: VerificationReport = {
          passed: true,
          checks: [{ name: 'simple_query_bypass', passed: true, message: 'Simple query — verification skipped' }],
          diagnosis: '',
          recommendedTarget: null,
        };
        emit({ type: 'phase_artifact', phase: 'verifier', artifact: passReport });
        emit({ type: 'phase_complete', phase: 'verifier' });
        return {
          verificationReport: passReport,
          currentPhase: 'verifier',
          tokensUsed: { prompt: 0, completion: 0, total: 0 },
        };
      }

      // Check if all steps errored — nothing to verify
      const hasResults = stepResults.some((r) => r.sqlResult || r.pythonResult);
      if (!hasResults) {
        const failReport: VerificationReport = {
          passed: false,
          checks: [{ name: 'no_results', passed: false, message: 'No execution results to verify' }],
          diagnosis: 'All execution steps failed to produce results.',
          recommendedTarget: 'sql_builder',
        };
        emit({ type: 'phase_artifact', phase: 'verifier', artifact: failReport });
        emit({ type: 'phase_complete', phase: 'verifier' });
        return {
          verificationReport: failReport,
          currentPhase: 'verifier',
          revisionCount: state.revisionCount + 1,
          revisionDiagnosis: failReport.diagnosis,
          revisionTarget: 'sql_builder',
          tokensUsed: { prompt: 0, completion: 0, total: 0 },
        };
      }

      // Generate verification Python code
      const prompt = buildVerifierPrompt(plan, stepResults);
      const messages = [
        new SystemMessage('You are a Python code generator. Output ONLY executable Python code. No markdown fences. The code must print a JSON object as its last output line.'),
        new HumanMessage(prompt),
      ];
      const { response: codeResponse } = await tracer.trace(
        { phase: 'verifier', purpose: 'verification_code', structuredOutput: false },
        messages,
        () => llm.invoke(messages),
      );
      const nodeTokens = extractTokenUsage(codeResponse);

      let code = typeof codeResponse.content === 'string' ? codeResponse.content : '';
      code = code.replace(/^```(?:python)?\n?/m, '').replace(/\n?```\s*$/m, '').trim();

      let report: VerificationReport;

      if (code) {
        emit({ type: 'tool_start', phase: 'verifier', name: 'run_python', args: { code: code.substring(0, 200) + '...' } });
        const pyResult = await sandboxService.executeCode(code, 30);
        emit({ type: 'tool_end', phase: 'verifier', name: 'run_python', result: (pyResult.stdout || '').substring(0, 500) });

        // Parse the JSON output from the last line of stdout
        const stdout = pyResult.stdout || '';
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1] || '';

        try {
          const parsed = JSON.parse(lastLine);
          const checks: VerificationCheck[] = (parsed.checks || []).map((c: any) => ({
            name: c.name || 'unknown',
            passed: Boolean(c.passed),
            message: c.message || '',
          }));

          const passed = Boolean(parsed.passed);
          report = {
            passed,
            checks,
            diagnosis: passed ? '' : checks.filter((c) => !c.passed).map((c) => c.message).join('; '),
            recommendedTarget: passed ? null : 'sql_builder',
          };
        } catch {
          // JSON parse failed — treat as pass with warning
          report = {
            passed: true,
            checks: [{ name: 'parse_warning', passed: true, message: 'Verification output could not be parsed; assuming pass' }],
            diagnosis: '',
            recommendedTarget: null,
          };
        }
      } else {
        // No code generated — treat as pass
        report = {
          passed: true,
          checks: [{ name: 'no_code', passed: true, message: 'No verification code generated; assuming pass' }],
          diagnosis: '',
          recommendedTarget: null,
        };
      }

      emit({ type: 'phase_artifact', phase: 'verifier', artifact: report });
      emit({ type: 'token_update', phase: 'verifier', tokensUsed: nodeTokens });
      emit({ type: 'phase_complete', phase: 'verifier' });

      const stateUpdate: Partial<DataAgentStateType> = {
        verificationReport: report,
        currentPhase: 'verifier',
        tokensUsed: nodeTokens,
      };

      if (!report.passed) {
        stateUpdate.revisionCount = state.revisionCount + 1;
        stateUpdate.revisionDiagnosis = report.diagnosis;
        stateUpdate.revisionTarget = report.recommendedTarget;
      }

      return stateUpdate;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // On error, treat as pass (don't block the answer)
      const passReport: VerificationReport = {
        passed: true,
        checks: [{ name: 'error_bypass', passed: true, message: `Verification error (bypassed): ${msg}` }],
        diagnosis: '',
        recommendedTarget: null,
      };
      emit({ type: 'phase_artifact', phase: 'verifier', artifact: passReport });
      emit({ type: 'phase_complete', phase: 'verifier' });
      return {
        verificationReport: passReport,
        currentPhase: 'verifier',
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
      };
    }
  };
}
