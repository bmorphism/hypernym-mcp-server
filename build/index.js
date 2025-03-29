#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as dotenv from 'dotenv';
import express from 'express';
import { Server as HttpsServer } from 'https';
import * as fs from 'fs';
// Create axios instance with retry logic
const createAxiosInstance = (apiKey) => {
    if (!apiKey) {
        throw new Error('API key is required');
    }
    const instance = axios.create({
        baseURL: 'https://fc-api-development.hypernym.ai',
        headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 second timeout
    });
    // Add response interceptor for retrying on 429 errors
    instance.interceptors.response.use(null, async (error) => {
        if (axios.isAxiosError(error) && error.response) {
            // Handle rate limit (429 Too Many Requests)
            if (error.response.status === 429) {
                const retryAfter = error.response.headers['retry-after']
                    ? parseInt(error.response.headers['retry-after'], 10) * 1000
                    : 10000; // Default to 10 seconds if no header
                console.log(`Rate limited. Waiting ${retryAfter / 1000} seconds before retrying...`);
                await new Promise(resolve => setTimeout(resolve, retryAfter));
                // Retry the request if config exists
                if (error.config) {
                    return instance.request(error.config);
                }
            }
        }
        return Promise.reject(error);
    });
    return instance;
};
dotenv.config();
const API_KEY = process.env.HYPERNYM_API_KEY;
if (!API_KEY) {
    throw new Error('HYPERNYM_API_KEY environment variable is required');
}
const isValidAnalyzeTextArgs = (args) => typeof args === 'object' &&
    args !== null &&
    typeof args.text === 'string' &&
    (args.min_compression_ratio === undefined || typeof args.min_compression_ratio === 'number') &&
    (args.min_semantic_similarity === undefined || typeof args.min_semantic_similarity === 'number');
class HypernymServer {
    constructor() {
        this.server = new Server({
            name: 'hypernym-mcp-server',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        // Use the createAxiosInstance factory with retry logic
        this.axiosInstance = createAxiosInstance(API_KEY);
        this.setupToolHandlers();
        // Error handling
        this.server.onerror = (error) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.server.close();
            if (this.httpServer) {
                this.httpServer.close();
            }
            process.exit(0);
        });
        // Setup Express
        this.app = express();
        this.app.use(express.json());
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'analyze_text',
                    description: 'Analyze text using Hypernym AI for semantic categorization and compression',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            text: {
                                type: 'string',
                                description: 'The text to analyze',
                            },
                            min_compression_ratio: {
                                type: 'number',
                                description: 'Minimum compression ratio (0.0-1.0). Lower values allow more compression (1.0 = no compression, 0.8 = 20% compression, 0.0 = 100% compression)',
                                minimum: 0,
                                maximum: 1,
                            },
                            min_semantic_similarity: {
                                type: 'number',
                                description: 'Minimum semantic similarity to consider for suggested output (0.0-1.0)',
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
                            min_compression_ratio: {
                                type: 'number',
                                description: 'Minimum compression ratio (0.0-1.0). Lower values allow more compression (1.0 = no compression, 0.8 = 20% compression, 0.0 = 100% compression)',
                                minimum: 0,
                                maximum: 1,
                            },
                            min_semantic_similarity: {
                                type: 'number',
                                description: 'Minimum semantic similarity to consider for suggested output (0.0-1.0)',
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
                        throw new McpError(ErrorCode.InvalidParams, 'Invalid analyze_text arguments');
                    }
                    try {
                        const response = await this.axiosInstance.post('/analyze_sync', {
                            essay_text: request.params.arguments.text,
                            params: {
                                min_compression_ratio: request.params.arguments.min_compression_ratio ?? 0.5,
                                min_semantic_similarity: request.params.arguments.min_semantic_similarity ?? 0.8,
                            },
                        });
                        // For the analyze_text tool, return the full analysis
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
                        if (axios.isAxiosError(error)) {
                            let errorMessage = error.response?.data?.message ?? error.message;
                            // Add more descriptive messages for common errors
                            if (error.response?.status === 429) {
                                errorMessage = `Rate limit exceeded with Hypernym API. Please try again later. ${error.response.headers['retry-after'] ? `Retry after: ${error.response.headers['retry-after']} seconds.` : ''}`;
                                console.error('Rate limit exceeded with Hypernym API. Consider implementing a retry mechanism with exponential backoff.');
                            }
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: `Hypernym API error: ${errorMessage}`,
                                    },
                                ],
                                isError: true,
                            };
                        }
                        throw error;
                    }
                case 'semantic_compression':
                    if (!isValidAnalyzeTextArgs(request.params.arguments)) {
                        throw new McpError(ErrorCode.InvalidParams, 'Invalid semantic_compression arguments');
                    }
                    try {
                        const response = await this.axiosInstance.post('/analyze_sync', {
                            essay_text: request.params.arguments.text,
                            params: {
                                min_compression_ratio: request.params.arguments.min_compression_ratio ?? 0.5,
                                min_semantic_similarity: request.params.arguments.min_semantic_similarity ?? 0.8,
                            },
                        });
                        // For the semantic_compression tool, return only the suggested compressed text
                        // The API docs show the structure as response.texts.suggested
                        const compressedText = response.data.response.texts.suggested;
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: compressedText,
                                },
                            ],
                        };
                    }
                    catch (error) {
                        if (axios.isAxiosError(error)) {
                            let errorMessage = error.response?.data?.message ?? error.message;
                            // Add more descriptive messages for common errors
                            if (error.response?.status === 429) {
                                errorMessage = `Rate limit exceeded with Hypernym API. Please try again later. ${error.response.headers['retry-after'] ? `Retry after: ${error.response.headers['retry-after']} seconds.` : ''}`;
                                console.error('Rate limit exceeded with Hypernym API. Consider implementing a retry mechanism with exponential backoff.');
                            }
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: `Hypernym API error: ${errorMessage}`,
                                    },
                                ],
                                isError: true,
                            };
                        }
                        throw error;
                    }
                default:
                    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
            }
        });
    }
    setupExpressRoutes() {
        const self = this;
        // Primary Hypernym API endpoint that matches the official API
        this.app.post('/analyze_sync', async function (req, res) {
            try {
                const { essay_text, params } = req.body;
                if (!essay_text || typeof essay_text !== 'string') {
                    return res.status(400).json({ error: 'Missing or invalid essay_text parameter' });
                }
                try {
                    const response = await self.axiosInstance.post('/analyze_sync', {
                        essay_text,
                        params: {
                            min_compression_ratio: params?.min_compression_ratio ?? 0.5,
                            min_semantic_similarity: params?.min_semantic_similarity ?? 0.8,
                        },
                    });
                    return res.json(response.data);
                }
                catch (error) {
                    if (axios.isAxiosError(error) && error.response?.status === 429) {
                        console.error('Rate limit exceeded with Hypernym API. Consider implementing a retry mechanism with exponential backoff.');
                        return res.status(429).json({
                            error: 'Rate limit exceeded with Hypernym API. Please try again later.',
                            retryAfter: error.response.headers['retry-after'] || '60'
                        });
                    }
                    throw error;
                }
            }
            catch (error) {
                if (axios.isAxiosError(error)) {
                    return res.status(500).json({
                        error: `Hypernym API error: ${error.response?.data?.message ?? error.message}`
                    });
                }
                return res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Add a health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok' });
        });
    }
    async run() {
        // Start the MCP server with stdio transport for backward compatibility
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        // Setup Express routes
        this.setupExpressRoutes();
        const port = parseInt(process.env.PORT || '3000', 10);
        // Check if SSL certificates are available
        const sslKeyPath = process.env.SSL_KEY_PATH;
        const sslCertPath = process.env.SSL_CERT_PATH;
        if (sslKeyPath && sslCertPath) {
            try {
                // Load SSL certificates
                const privateKey = fs.readFileSync(sslKeyPath, 'utf8');
                const certificate = fs.readFileSync(sslCertPath, 'utf8');
                const credentials = { key: privateKey, cert: certificate };
                // Start HTTPS server
                this.httpServer = new HttpsServer(credentials, this.app);
                this.httpServer.listen(port, () => {
                    console.log(`Hypernym MCP server running on https://localhost:${port}`);
                });
            }
            catch (error) {
                console.error('Failed to start HTTPS server:', error);
                console.log('Falling back to HTTP server...');
                this.startHttpServer(port);
            }
        }
        else {
            // Start HTTP server
            this.startHttpServer(port);
        }
    }
    startHttpServer(port) {
        this.httpServer = this.app.listen(port, () => {
            console.log(`Hypernym MCP server running on http://localhost:${port}`);
        });
    }
}
const server = new HypernymServer();
server.run().catch(console.error);
