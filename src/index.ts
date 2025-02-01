#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

const API_KEY = process.env.HYPERNYM_API_KEY;
if (!API_KEY) {
  throw new Error('HYPERNYM_API_KEY environment variable is required');
}

interface AnalyzeTextArgs {
  text: string;
  minCompressionRatio?: number;
  minSemanticSimilarity?: number;
}

const isValidAnalyzeTextArgs = (args: any): args is AnalyzeTextArgs =>
  typeof args === 'object' &&
  args !== null &&
  typeof args.text === 'string' &&
  (args.minCompressionRatio === undefined || typeof args.minCompressionRatio === 'number') &&
  (args.minSemanticSimilarity === undefined || typeof args.minSemanticSimilarity === 'number');

class HypernymServer {
  private server: Server;
  private axiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: 'hypernym-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: 'https://fc_api_backend.hypernym.ai',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
    });

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'analyze_text',
          description: 'Analyze text using Hypernym AI for semantic analysis and compression',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'The text to analyze',
              },
              minCompressionRatio: {
                type: 'number',
                description: 'Minimum compression ratio (0.0-1.0)',
                minimum: 0,
                maximum: 1,
              },
              minSemanticSimilarity: {
                type: 'number',
                description: 'Minimum semantic similarity (0.0-1.0)',
                minimum: 0,
                maximum: 1,
              },
            },
            required: ['text'],
          },
        },
        {
          name: 'semantic_compression',
          description: 'Get compressed version of text using Hypernym AI',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'The text to compress',
              },
              minCompressionRatio: {
                type: 'number',
                description: 'Minimum compression ratio (0.0-1.0)',
                minimum: 0,
                maximum: 1,
              },
              minSemanticSimilarity: {
                type: 'number',
                description: 'Minimum semantic similarity (0.0-1.0)',
                minimum: 0,
                maximum: 1,
              },
            },
            required: ['text'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'analyze_text':
          if (!isValidAnalyzeTextArgs(request.params.arguments)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Invalid analyze_text arguments'
            );
          }

          try {
            const response = await this.axiosInstance.post('/analyze_sync', {
              essay_text: request.params.arguments.text,
              params: {
                min_compression_ratio: request.params.arguments.minCompressionRatio ?? 0.5,
                min_semantic_similarity: request.params.arguments.minSemanticSimilarity ?? 0.8,
              },
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } catch (error) {
            if (axios.isAxiosError(error)) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Hypernym API error: ${error.response?.data?.message ?? error.message}`,
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }

        case 'semantic_compression':
          if (!isValidAnalyzeTextArgs(request.params.arguments)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Invalid semantic_compression arguments'
            );
          }

          try {
            const response = await this.axiosInstance.post('/analyze_sync', {
              essay_text: request.params.arguments.text,
              params: {
                min_compression_ratio: request.params.arguments.minCompressionRatio ?? 0.5,
                min_semantic_similarity: request.params.arguments.minSemanticSimilarity ?? 0.8,
              },
            });

            return {
              content: [
                {
                  type: 'text',
                  text: response.data.response.texts.suggested,
                },
              ],
            };
          } catch (error) {
            if (axios.isAxiosError(error)) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Hypernym API error: ${error.response?.data?.message ?? error.message}`,
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Hypernym MCP server running on stdio');
  }
}

const server = new HypernymServer();
server.run().catch(console.error);
