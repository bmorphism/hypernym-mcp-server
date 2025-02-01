#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const axios_1 = __importDefault(require("axios"));
const API_KEY = process.env.HYPERNYM_API_KEY;
if (!API_KEY) {
    throw new Error('HYPERNYM_API_KEY environment variable is required');
}
const isValidAnalyzeTextArgs = (args) => typeof args === 'object' &&
    args !== null &&
    typeof args.text === 'string' &&
    (args.minCompressionRatio === undefined || typeof args.minCompressionRatio === 'number') &&
    (args.minSemanticSimilarity === undefined || typeof args.minSemanticSimilarity === 'number');
class HypernymServer {
    constructor() {
        this.server = new index_js_1.Server({
            name: 'hypernym-mcp-server',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.axiosInstance = axios_1.default.create({
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
    setupToolHandlers() {
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
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
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            switch (request.params.name) {
                case 'analyze_text':
                    if (!isValidAnalyzeTextArgs(request.params.arguments)) {
                        throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, 'Invalid analyze_text arguments');
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
                    }
                    catch (error) {
                        if (axios_1.default.isAxiosError(error)) {
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
                        throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, 'Invalid semantic_compression arguments');
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
                    }
                    catch (error) {
                        if (axios_1.default.isAxiosError(error)) {
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
                    throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
            }
        });
    }
    async run() {
        const transport = new stdio_js_1.StdioServerTransport();
        await this.server.connect(transport);
        console.error('Hypernym MCP server running on stdio');
    }
}
const server = new HypernymServer();
server.run().catch(console.error);
