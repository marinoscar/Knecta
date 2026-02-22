import { StateGraph, START, END } from '@langchain/langgraph';
import { SpreadsheetAgentState, SpreadsheetAgentStateType } from './state';
import { SpreadsheetAgentEvent } from './types';

export type EmitFn = (event: SpreadsheetAgentEvent) => void;

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
// Each returns an async function that takes state and returns partial state updates.
// These will be replaced with real implementations in Phase 4.

function createIngestNode(emit: EmitFn) {
  return async (_state: SpreadsheetAgentStateType) => {
    emit({ type: 'phase_start', phase: 'ingest', label: 'Ingesting files' });
    // TODO: Implement in Phase 4A
    emit({ type: 'phase_complete', phase: 'ingest' });
    return { currentPhase: 'ingest', fileInventory: [] };
  };
}

function createAnalyzeNode(emit: EmitFn) {
  return async (_state: SpreadsheetAgentStateType) => {
    emit({ type: 'phase_start', phase: 'analyze', label: 'Analyzing sheets' });
    // TODO: Implement in Phase 4B
    emit({ type: 'phase_complete', phase: 'analyze' });
    return { currentPhase: 'analyze', sheetAnalyses: [] };
  };
}

function createDesignNode(emit: EmitFn) {
  return async (_state: SpreadsheetAgentStateType) => {
    emit({ type: 'phase_start', phase: 'design', label: 'Designing extraction schema' });
    // TODO: Implement in Phase 4C
    emit({ type: 'phase_complete', phase: 'design' });
    return { currentPhase: 'design', extractionPlan: null };
  };
}

function createExtractNode(emit: EmitFn) {
  return async (state: SpreadsheetAgentStateType) => {
    emit({ type: 'phase_start', phase: 'extract', label: 'Extracting tables' });
    // TODO: Implement in Phase 4D
    emit({ type: 'phase_complete', phase: 'extract' });
    return {
      currentPhase: 'extract',
      extractionResults: [],
      revisionCount:
        state.revisionCount +
        (state.validationReport && !state.validationReport.passed ? 1 : 0),
    };
  };
}

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

export function buildSpreadsheetAgentGraph(emit: EmitFn) {
  const workflow = new StateGraph(SpreadsheetAgentState)
    .addNode('ingest', createIngestNode(emit))
    .addNode('analyze', createAnalyzeNode(emit))
    .addNode('design', createDesignNode(emit))
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
