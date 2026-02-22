import { StateGraph, START, END } from '@langchain/langgraph';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { SpreadsheetAgentState, SpreadsheetAgentStateType } from './state';
import { SpreadsheetAgentEvent } from './types';
import { createIngestNode } from './nodes/ingest';
import { createAnalyzeNode } from './nodes/analyze';
import { createDesignNode } from './nodes/design';
import { createExtractNode } from './nodes/extract';

export type EmitFn = (event: SpreadsheetAgentEvent) => void;

// ─── Graph Dependencies ───

export interface GraphDeps {
  llm: BaseChatModel;
}

// ─── Routing Functions ───

function routeAfterDesign(
  state: SpreadsheetAgentStateType,
): 'extract' | typeof END {
  if (state.config.reviewMode === 'review') {
    return END;
  }
  return 'extract';
}

function routeAfterValidation(
  state: SpreadsheetAgentStateType,
): 'persist' | 'extract' | 'design' {
  const report = state.validationReport;
  if (!report || report.passed) return 'persist';
  if (state.revisionCount >= 3) return 'persist';
  if (report.recommendedTarget === 'schema_designer') return 'design';
  return 'extract';
}

// ─── Stub Node Factories ───
// validate and persist will be replaced with real implementations in subsequent phases.

function createValidateNode(emit: EmitFn) {
  return async (_state: SpreadsheetAgentStateType) => {
    emit({ type: 'phase_start', phase: 'validate', label: 'Validating results' });
    // TODO: Implement in Phase 4E
    emit({ type: 'phase_complete', phase: 'validate' });
    return {
      currentPhase: 'validate',
      validationReport: {
        passed: true,
        tables: [],
        diagnosis: null,
        recommendedTarget: null,
      },
    };
  };
}

function createPersistNode(emit: EmitFn) {
  return async (_state: SpreadsheetAgentStateType) => {
    emit({ type: 'phase_start', phase: 'persist', label: 'Persisting results' });
    // TODO: Implement in Phase 4F
    emit({ type: 'phase_complete', phase: 'persist' });
    return { currentPhase: 'persist' };
  };
}

// ─── Graph Builder ───

export function buildSpreadsheetAgentGraph(deps: GraphDeps, emit: EmitFn) {
  const workflow = new StateGraph(SpreadsheetAgentState)
    .addNode('ingest', createIngestNode(emit))
    .addNode('analyze', createAnalyzeNode({ llm: deps.llm, emit }))
    .addNode('design', createDesignNode({ llm: deps.llm, emit }))
    .addNode('extract', createExtractNode(emit))
    .addNode('validate', createValidateNode(emit))
    .addNode('persist', createPersistNode(emit))
    .addEdge(START, 'ingest')
    .addEdge('ingest', 'analyze')
    .addEdge('analyze', 'design')
    .addConditionalEdges('design', routeAfterDesign)
    .addEdge('extract', 'validate')
    .addConditionalEdges('validate', routeAfterValidation)
    .addEdge('persist', END);

  return workflow.compile();
}
