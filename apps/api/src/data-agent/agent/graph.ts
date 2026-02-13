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

// ─── Event emitter type ───
export type EmitFn = (event: object) => void;

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
  const { llm, neoOntologyService, discoveryService, sandboxService, ontologyId, connectionId, databaseType, emit } = deps;

  const workflow = new StateGraph(DataAgentState)
    .addNode('planner', createPlannerNode(llm, emit))
    .addNode('navigator', createNavigatorNode(llm, neoOntologyService, ontologyId, emit))
    .addNode('sql_builder', createSqlBuilderNode(llm, neoOntologyService, ontologyId, databaseType, emit))
    .addNode('executor', createExecutorNode(llm, discoveryService, sandboxService, connectionId, emit))
    .addNode('verifier', createVerifierNode(llm, sandboxService, emit))
    .addNode('explainer', createExplainerNode(llm, sandboxService, emit))
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
