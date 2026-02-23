import { StateGraph, START, END } from '@langchain/langgraph';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { PrismaService } from '../../prisma/prisma.service';
import { SpreadsheetAgentState, SpreadsheetAgentStateType } from './state';
import { SpreadsheetAgentEvent } from './types';
import { createIngestNode } from './nodes/ingest';
import { createAnalyzeNode } from './nodes/analyze';
import { createDesignNode } from './nodes/design';
import { createExtractNode } from './nodes/extract';
import { createValidateNode } from './nodes/validate';
import { createPersistNode } from './nodes/persist';

export type EmitFn = (event: SpreadsheetAgentEvent) => void;

// ─── Graph Dependencies ───

export interface GraphDeps {
  llm: BaseChatModel;
  prisma: PrismaService;
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

// ─── Graph Builder ───

export function buildSpreadsheetAgentGraph(deps: GraphDeps, emit: EmitFn) {
  const workflow = new StateGraph(SpreadsheetAgentState)
    .addNode('ingest', createIngestNode(emit))
    .addNode('analyze', createAnalyzeNode({ llm: deps.llm, emit }))
    .addNode('design', createDesignNode({ llm: deps.llm, emit }))
    .addNode('extract', createExtractNode(emit))
    .addNode('validate', createValidateNode(emit))
    .addNode('persist', createPersistNode({ prisma: deps.prisma, emit }))
    .addEdge(START, 'ingest')
    .addEdge('ingest', 'analyze')
    .addEdge('analyze', 'design')
    .addConditionalEdges('design', routeAfterDesign)
    .addEdge('extract', 'validate')
    .addConditionalEdges('validate', routeAfterValidation)
    .addEdge('persist', END);

  return workflow.compile();
}
