import { Injectable, Logger } from '@nestjs/common';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { OntologiesService } from '../ontologies/ontologies.service';
import { NeoOntologyService } from '../ontologies/neo-ontology.service';
import { DataAgentService } from '../data-agent/data-agent.service';
import { DataAgentAgentService } from '../data-agent/agent/agent.service';
import { UserSettingsService } from '../settings/user-settings/user-settings.service';
import { SystemSettingsService } from '../settings/system-settings/system-settings.service';
import { PERMISSIONS } from '../common/constants/roles.constants';
import { DataAgentMessageMetadata } from '../data-agent/agent/types';

/**
 * MCP Server Service
 *
 * Creates and configures MCP Server instances with:
 * - Resources for browsing ontologies and dataset schemas
 * - Tools for asking natural language questions via the Data Agent
 */
@Injectable()
export class McpServerService {
  private readonly logger = new Logger(McpServerService.name);

  constructor(
    private readonly ontologiesService: OntologiesService,
    private readonly neoOntologyService: NeoOntologyService,
    private readonly dataAgentService: DataAgentService,
    private readonly agentService: DataAgentAgentService,
    private readonly userSettingsService: UserSettingsService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  /**
   * Create a new MCP server instance for a specific user.
   * The userId and permissions are captured in closures for all handlers.
   */
  createServerForUser(
    userId: string,
    userPermissions: string[],
    clientName = 'MCP Client',
  ): McpServer {
    const server = new McpServer({
      name: 'Knecta Data Agent',
      version: '1.0.0',
      capabilities: {
        resources: {},
        tools: {},
      },
    });

    this.logger.log(`Creating MCP server for user ${userId}`);

    // ─── Resource: List Ontologies ───
    server.resource(
      'ontologies',
      'knecta://ontologies',
      async () => {
        this.checkPermission(userPermissions, PERMISSIONS.ONTOLOGIES_READ);

        const result = await this.ontologiesService.list({
          page: 1,
          pageSize: 100,
          sortBy: 'name',
          sortOrder: 'asc',
        } as any);

        // Filter to ready status only
        const readyOntologies = result.items.filter(
          (o: any) => o.status === 'ready',
        );

        return {
          contents: [
            {
              uri: 'knecta://ontologies',
              mimeType: 'application/json',
              text: JSON.stringify(
                readyOntologies.map((o: any) => ({
                  id: o.id,
                  name: o.name,
                  description: o.description || '',
                  datasetCount: o.nodeCount || 0,
                  fieldCount: o.relationshipCount || 0,
                })),
              ),
            },
          ],
        };
      },
    );

    // ─── Resource Template: Ontology Details ───
    server.resource(
      'ontology-details',
      new ResourceTemplate('knecta://ontologies/{id}'),
      async (uri: URL) => {
        this.checkPermission(userPermissions, PERMISSIONS.ONTOLOGIES_READ);

        // Extract ID from URI
        const match = uri.href.match(/knecta:\/\/ontologies\/([^/]+)$/);
        if (!match) {
          throw new Error('Invalid ontology URI');
        }
        const ontologyId = match[1];

        // Get ontology metadata
        const ontology = await this.ontologiesService.getById(ontologyId);
        if (ontology.status !== 'ready') {
          throw new Error('Ontology is not ready');
        }

        // Get list of datasets from Neo4j
        const datasets = await this.neoOntologyService.listDatasets(
          ontologyId,
        );

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                ontology: {
                  id: ontology.id,
                  name: ontology.name,
                  description: ontology.description || '',
                },
                datasets: datasets.map((d) => ({
                  name: d.name,
                  description: d.description || '',
                  source: d.source || '',
                })),
              }),
            },
          ],
        };
      },
    );

    // ─── Resource Template: Dataset Schema ───
    server.resource(
      'dataset-schema',
      new ResourceTemplate('knecta://ontologies/{ontologyId}/datasets/{datasetName}'),
      async (uri: URL) => {
        this.checkPermission(userPermissions, PERMISSIONS.ONTOLOGIES_READ);

        // Extract ontologyId and datasetName from URI
        const match = uri.href.match(
          /knecta:\/\/ontologies\/([^/]+)\/datasets\/(.+)$/,
        );
        if (!match) {
          throw new Error('Invalid dataset URI');
        }
        const [, ontologyId, datasetName] = match;

        // Get dataset YAML from Neo4j
        const datasets = await this.neoOntologyService.getDatasetsByNames(
          ontologyId,
          [datasetName],
        );

        if (datasets.length === 0) {
          throw new Error(`Dataset ${datasetName} not found`);
        }

        return {
          contents: [
            {
              uri,
              mimeType: 'text/yaml',
              text: datasets[0].yaml,
            },
          ],
        };
      },
    );

    // ─── Tool: Ask Question ───
    server.tool(
      'ask_question',
      'Ask a natural language question about data in an ontology. Returns a narrative answer with optional structured chart specifications and data lineage.',
      {
        ontologyId: z
          .string()
          .uuid()
          .describe(
            'The ontology ID to query. Browse available ontologies using the knecta://ontologies resource.',
          ),
        question: z
          .string()
          .min(1)
          .max(2000)
          .describe('The natural language question about the data.'),
      },
      async ({ ontologyId, question }: { ontologyId: string; question: string }) => {
        this.checkPermission(userPermissions, PERMISSIONS.DATA_AGENT_WRITE);

        // 1. Load user's default provider
        const userSettings = await this.userSettingsService.getSettings(userId);
        const provider = userSettings.defaultProvider || undefined;

        // 2. Load system settings for provider config
        const systemSettings = await this.systemSettingsService.getSettings();
        const providerConfig = provider
          ? systemSettings.dataAgent?.[provider as 'openai' | 'anthropic' | 'azure']
          : undefined;

        // 3. Auto-generate chat title
        const chatName = `MCP: ${clientName} — ${question.substring(0, 60)}`;

        // 4. Create chat
        const chat = await this.dataAgentService.createChat(
          { name: chatName, ontologyId, llmProvider: provider },
          userId,
        );

        // 5. Create message pair
        const { assistantMessage } = await this.dataAgentService.createMessagePair(
          chat.id,
          question,
          userId,
        );

        // 6. Claim the message
        const claimed = await this.dataAgentService.claimMessage(
          assistantMessage.id,
        );
        if (!claimed) {
          return {
            content: [
              {
                type: 'text',
                text: 'Failed to process request. Please try again.',
              },
            ],
          };
        }

        // 7. Execute the agent pipeline (collect events synchronously)
        const events: any[] = [];
        await this.agentService.executeAgent(
          chat.id,
          assistantMessage.id,
          question,
          userId,
          (event) => events.push(event),
          provider,
          providerConfig,
        );

        // 8. Build response from events
        const completeEvent = events.find((e) => e.type === 'message_complete');
        const errorEvent = events.find((e) => e.type === 'message_error');

        if (errorEvent) {
          return {
            content: [{ type: 'text', text: `Error: ${errorEvent.message}` }],
            isError: true,
          };
        }

        if (!completeEvent) {
          return {
            content: [
              { type: 'text', text: 'Agent did not produce a response.' },
            ],
            isError: true,
          };
        }

        // 9. Check for clarification
        if (completeEvent.status === 'clarification_needed') {
          const metadata = completeEvent.metadata as DataAgentMessageMetadata;
          const questions = metadata?.clarificationQuestions || [];
          return {
            content: [
              {
                type: 'text',
                text:
                  `I need clarification before answering:\n\n` +
                  questions
                    .map(
                      (q: any, i: number) =>
                        `${i + 1}. **${q.question}**\n   Default assumption: ${q.assumption}`,
                    )
                    .join('\n\n') +
                  `\n\nPlease answer these questions and ask again with your clarifications.`,
              },
            ],
          };
        }

        // 10. Build structured response
        const content: Array<{ type: 'text'; text: string }> = [];

        // Narrative text
        content.push({ type: 'text', text: completeEvent.content || '' });

        // Chart specs (structured data, not images)
        const metadata = completeEvent.metadata as DataAgentMessageMetadata;
        if (metadata?.stepResults) {
          const chartSpecs = metadata.stepResults
            .filter((r: any) => r.chartSpec)
            .map((r: any) => r.chartSpec);

          if (chartSpecs.length > 0) {
            content.push({
              type: 'text',
              text: JSON.stringify({ _type: 'chart_specs', charts: chartSpecs }),
            });
          }
        }

        // Data lineage
        if (metadata?.dataLineage) {
          content.push({
            type: 'text',
            text: JSON.stringify({
              _type: 'data_lineage',
              ...metadata.dataLineage,
            }),
          });
        }

        // Caveats (verification failures)
        if (
          metadata?.verificationReport &&
          !metadata.verificationReport.passed
        ) {
          const failedChecks = metadata.verificationReport.checks
            .filter((c: any) => !c.passed)
            .map((c: any) => c.message);
          if (failedChecks.length > 0) {
            content.push({
              type: 'text',
              text: `**Caveats:** ${failedChecks.join('; ')}`,
            });
          }
        }

        return { content };
      },
    );

    return server;
  }

  /**
   * Check if user has a required permission
   */
  private checkPermission(userPermissions: string[], required: string): void {
    if (!userPermissions.includes(required)) {
      throw new Error(`Insufficient permissions: ${required} is required`);
    }
  }
}
