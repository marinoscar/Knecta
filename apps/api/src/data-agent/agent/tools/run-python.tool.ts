import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { SandboxService } from '../../../sandbox/sandbox.service';

export function createRunPythonTool(
  sandboxService: SandboxService,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'run_python',
    description:
      'Execute Python code for data analysis and visualization. Available libraries: pandas, numpy, matplotlib, seaborn, scipy. Use matplotlib to create charts — they will be automatically saved and returned. Print results to stdout for text output.',
    schema: z.object({
      code: z
        .string()
        .describe(
          'Python code to execute. Use print() for text output. Use matplotlib for charts (they are auto-saved).',
        ),
    }),
    func: async ({ code }) => {
      try {
        const result = await sandboxService.executeCode(code, 30);

        let output = '';

        if (result.stdout) {
          output += result.stdout;
        }

        if (result.stderr && result.returnCode !== 0) {
          output += `\nError: ${result.stderr}`;
        }

        if (result.files && result.files.length > 0) {
          for (const file of result.files) {
            output += `\n\n![${file.name}](data:${file.mimeType};base64,${file.base64})`;
          }
        }

        if (!output.trim()) {
          output = 'Code executed successfully with no output.';
        }

        return output;
      } catch (error) {
        return `Python execution error: ${error.message}`;
      }
    },
  });
}
