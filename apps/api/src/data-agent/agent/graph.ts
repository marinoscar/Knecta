import { StateGraph, START, END } from '@langchain/langgraph';
import { DataAgentState, DataAgentStateType } from './state';
import {
  createPlannerNode,
  createNavigatorNode,
  createSqlBuilderNode,
  createExecutorNode,
  createVerifierNode,
  createExplainerNode,
} from './nodes';
import { DataAgentTracer } from './utils/data-agent-tracer';

// ─── Event emitter type ───
export type EmitFn = (event: { type: string; [key: string]: any }) => void;

// ─── Dependencies injected into the graph builder ───
export interface DataAgentGraphDeps {
  llm: any;
  structuredLlm: any;
  neoOntologyService: any;
  discoveryService: any;
  sandboxService: any;
  ontologyId: string;
  connectionId: string;
  databaseName: string;
  databaseType: string;
  emit: EmitFn;
  tracer: DataAgentTracer;
  webSearchTool: Record<string, unknown> | null; // null = disabled
}

// ─── Conditional routing after planner ───
function routeAfterPlanner(state: DataAgentStateType): 'navigator' | 'explainer' | '__end__' {
  // Clarification needed — terminate graph early
  if (state.plan?.shouldClarify && state.plan.clarificationQuestions?.length > 0) {
    return '__end__';
  }
  // Conversational — no data needed, answer directly
  if (state.plan?.complexity === 'conversational') {
    return 'explainer';
  }
  // ALL data queries go through Navigator (both simple and analytical)
  return 'navigator';
}

// ─── Conditional routing after navigator ───
function routeAfterNavigator(state: DataAgentStateType): 'sql_builder' | 'explainer' {
  // Navigator determined the ontology can't support this query
  if (state.cannotAnswer) {
    return 'explainer';
  }
  return 'sql_builder';
}

// ─── Conditional routing after verifier ───
function routeAfterVerification(
  state: DataAgentStateType,
): 'explainer' | 'navigator' | 'sql_builder' {
  const report = state.verificationReport;

  // Pass → explainer
  if (!report || report.passed) {
    return 'explainer';
  }

  // Fail but max revisions reached → explainer with caveats
  if (state.revisionCount >= 3) {
    return 'explainer';
  }

  // Fail → route to recommended target
  if (report.recommendedTarget === 'navigator') {
    return 'navigator';
  }
  return 'sql_builder';
}

// ─── Graph builder ───
export function buildDataAgentGraph(deps: DataAgentGraphDeps) {
  const { llm, structuredLlm, neoOntologyService, discoveryService, sandboxService, ontologyId, connectionId, databaseName, databaseType, emit, tracer, webSearchTool } = deps;

  const workflow = new StateGraph(DataAgentState)
    .addNode('planner', createPlannerNode(structuredLlm, emit, tracer, webSearchTool))
    .addNode('navigator', createNavigatorNode(llm, neoOntologyService, ontologyId, emit, tracer, webSearchTool))
    .addNode('sql_builder', createSqlBuilderNode(structuredLlm, neoOntologyService, ontologyId, databaseType, emit, tracer, webSearchTool))
    .addNode('executor', createExecutorNode(llm, structuredLlm, discoveryService, sandboxService, connectionId, databaseName, emit, tracer, webSearchTool))
    .addNode('verifier', createVerifierNode(llm, sandboxService, emit, tracer, webSearchTool))
    .addNode('explainer', createExplainerNode(llm, sandboxService, emit, tracer, webSearchTool))
    .addEdge(START, 'planner')
    .addConditionalEdges('planner', routeAfterPlanner, {
      navigator: 'navigator',
      explainer: 'explainer',
      __end__: END,
    })
    .addConditionalEdges('navigator', routeAfterNavigator, {
      sql_builder: 'sql_builder',
      explainer: 'explainer',
    })
    .addEdge('sql_builder', 'executor')
    .addEdge('executor', 'verifier')
    .addConditionalEdges('verifier', routeAfterVerification, {
      explainer: 'explainer',
      navigator: 'navigator',
      sql_builder: 'sql_builder',
    })
    .addEdge('explainer', END);

  return workflow.compile();
}

// Export routing functions for testing
export { routeAfterPlanner, routeAfterNavigator, routeAfterVerification };
