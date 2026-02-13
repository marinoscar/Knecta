import { DataAgentStateType } from '../state';
import { EmitFn } from '../graph';

/**
 * Stub node factories for the data agent graph.
 * Each will be replaced by a real implementation in subsequent commits.
 */

export function createPlannerNode(llm: any, emit: EmitFn) {
  return async (state: DataAgentStateType): Promise<Partial<DataAgentStateType>> => {
    // TODO: Implement planner node
    return {};
  };
}

export function createNavigatorNode(
  llm: any,
  neoOntologyService: any,
  ontologyId: string,
  emit: EmitFn,
) {
  return async (state: DataAgentStateType): Promise<Partial<DataAgentStateType>> => {
    // TODO: Implement navigator node
    return {};
  };
}

export function createSqlBuilderNode(
  llm: any,
  neoOntologyService: any,
  ontologyId: string,
  databaseType: string,
  emit: EmitFn,
) {
  return async (state: DataAgentStateType): Promise<Partial<DataAgentStateType>> => {
    // TODO: Implement sql_builder node
    return {};
  };
}

export function createExecutorNode(
  llm: any,
  discoveryService: any,
  sandboxService: any,
  connectionId: string,
  emit: EmitFn,
) {
  return async (state: DataAgentStateType): Promise<Partial<DataAgentStateType>> => {
    // TODO: Implement executor node
    return {};
  };
}

export function createVerifierNode(llm: any, sandboxService: any, emit: EmitFn) {
  return async (state: DataAgentStateType): Promise<Partial<DataAgentStateType>> => {
    // TODO: Implement verifier node
    return {};
  };
}

export function createExplainerNode(llm: any, sandboxService: any, emit: EmitFn) {
  return async (state: DataAgentStateType): Promise<Partial<DataAgentStateType>> => {
    // TODO: Implement explainer node
    return {};
  };
}
