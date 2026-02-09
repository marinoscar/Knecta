import { AgentStateType } from '../state';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';
import { SemanticModelsService } from '../../semantic-models.service';
import { validateAndFixModel } from '../validation/structural-validator';
import { buildQualityReviewPrompt } from '../prompts/validate-prompt';
import { extractTokenUsage } from '../utils';
import { Logger } from '@nestjs/common';

const logger = new Logger('ValidateModel');

export function createValidateModelNode(
  llm: BaseChatModel,
  semanticModelsService: SemanticModelsService,
  runId: string,
  emitProgress: (event: object) => void,
) {
  return async (state: AgentStateType) => {
    if (!state.semanticModel) {
      return { error: 'No semantic model to validate' };
    }

    // Step 1: Programmatic structural validation (no LLM)
    const result = validateAndFixModel(state.semanticModel);

    if (result.fixedIssues.length > 0) {
      logger.log(`Auto-fixed ${result.fixedIssues.length} issues: ${result.fixedIssues.join('; ')}`);
    }

    if (result.warnings.length > 0) {
      logger.warn(`Validation warnings: ${result.warnings.join('; ')}`);
    }

    if (!result.isValid) {
      logger.error(`Fatal validation issues: ${result.fatalIssues.join('; ')}`);
      // Still persist — the model has fatal issues but we save what we can
      return {
        semanticModel: state.semanticModel,
        error: `Structural validation found ${result.fatalIssues.length} fatal issue(s): ${result.fatalIssues.slice(0, 3).join('; ')}`,
      };
    }

    // Step 2: Optional LLM quality review (1 call max)
    let tokensUsed = state.tokensUsed;
    try {
      const modelJson = JSON.stringify(state.semanticModel, null, 2);
      // Only do quality review if model is small enough to fit in context
      if (modelJson.length < 100000) {
        const prompt = buildQualityReviewPrompt(modelJson);
        const response = await llm.invoke([new HumanMessage(prompt)]);

        const callTokens = extractTokenUsage(response);
        tokensUsed = {
          prompt: tokensUsed.prompt + callTokens.prompt,
          completion: tokensUsed.completion + callTokens.completion,
          total: tokensUsed.total + callTokens.total,
        };

        emitProgress({ type: 'token_update', tokensUsed });

        const content = typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);

        if (content.trim().startsWith('QUALITY_ISSUES')) {
          logger.warn(`Quality review found issues: ${content}`);
          // Log but don't block — quality issues are informational
        } else {
          logger.log('Quality review passed');
        }
      } else {
        logger.log('Model too large for quality review, skipping');
      }
    } catch (err: any) {
      logger.warn(`Quality review failed (non-blocking): ${err.message}`);
    }

    // Update progress
    await semanticModelsService.updateRunProgress(runId, {
      currentStep: 'validate_model',
      currentStepLabel: 'Validating Model',
      percentComplete: 95,
      tokensUsed,
      steps: [],
    }).catch(() => {});

    logger.log('Validation complete');

    return {
      semanticModel: state.semanticModel,
      tokensUsed,
    };
  };
}
