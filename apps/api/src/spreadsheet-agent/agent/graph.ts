import { StateGraph, END, START } from '@langchain/langgraph';
import { SpreadsheetAgentState } from './state';
import { createParseSheetsNode } from './nodes/parse-sheets';
import { createInferSchemaNode } from './nodes/infer-schema';
import { createConvertAndUploadNode } from './nodes/convert-and-upload';
import { createPersistResultsNode } from './nodes/persist-results';
import { ObjectsService } from '../../storage/objects/objects.service';
import { SpreadsheetAgentService } from '../spreadsheet-agent.service';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StorageProvider } from '../../storage/providers/storage-provider.interface';

export function buildSpreadsheetAgentGraph(
  llm: BaseChatModel,
  objectsService: ObjectsService,
  storageProvider: StorageProvider,
  spreadsheetService: SpreadsheetAgentService,
  runId: string,
  emitProgress: (event: object) => void,
) {
  const workflow = new StateGraph(SpreadsheetAgentState)
    .addNode('parse_sheets', createParseSheetsNode(
      objectsService, runId, emitProgress,
    ))
    .addNode('infer_schema', createInferSchemaNode(
      llm, spreadsheetService, runId, emitProgress,
    ))
    .addNode('convert_and_upload', createConvertAndUploadNode(
      storageProvider, spreadsheetService, runId, emitProgress,
    ))
    .addNode('persist_results', createPersistResultsNode(
      spreadsheetService, runId, emitProgress,
    ))
    .addEdge(START, 'parse_sheets')
    .addEdge('parse_sheets', 'infer_schema')
    .addEdge('infer_schema', 'convert_and_upload')
    .addEdge('convert_and_upload', 'persist_results')
    .addEdge('persist_results', END);

  return workflow.compile();
}
