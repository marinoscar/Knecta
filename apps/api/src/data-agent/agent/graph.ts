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
  neoOntologyService: any;
  discoveryService: any;
  sandboxService: any;
  ontologyId: string;
  connectionId: string;
  databaseType: string;
  emit: EmitFn;
  tracer: DataAgentTracer;
}

// ─── Conditional routing after planner ───
function routeAfterPlanner(state: DataAgentStateType): 'navigator' | 'executor' {
  if (state.plan?.complexity === 'simple') {
    return 'executor';
  }
  return 'navigator';
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
  const { llm, neoOntologyService, discoveryService, sandboxService, ontologyId, connectionId, databaseType, emit, tracer } = deps;

  const workflow = new StateGraph(DataAgentState)
    .addNode('planner', createPlannerNode(llm, emit, tracer))
    .addNode('navigator', createNavigatorNode(llm, neoOntologyService, ontologyId, emit, tracer))
    .addNode('sql_builder', createSqlBuilderNode(llm, neoOntologyService, ontologyId, databaseType, emit, tracer))
    .addNode('executor', createExecutorNode(llm, discoveryService, sandboxService, connectionId, emit, tracer))
    .addNode('verifier', createVerifierNode(llm, sandboxService, emit, tracer))
    .addNode('explainer', createExplainerNode(llm, sandboxService, emit, tracer))
    .addEdge(START, 'planner')
    .addConditionalEdges('planner', routeAfterPlanner, {
      navigator: 'navigator',
      executor: 'executor',
    })
    .addEdge('navigator', 'sql_builder')
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
