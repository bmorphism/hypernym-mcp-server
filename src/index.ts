#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as dotenv from 'dotenv';
import express, { Request, Response, Application } from 'express';
import { Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import * as fs from 'fs';
import * as path from 'path';

// Create axios instance with retry logic
const createAxiosInstance = (apiKey: string | undefined) => {
  if (!apiKey) {
    throw new Error('API key is required');
  }
  
  const instance = axios.create({
    baseURL: 'https://fc-api-development.hypernym.ai',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'hypernym-mcp-server/1.0.0',
    },
    timeout: 60000, // 60 second timeout for large texts
  });

  // Add response interceptor for retrying on certain errors
  instance.interceptors.response.use(
    // On successful response
    (response) => {
      // Just return the response if it looks valid
      return response;
    },
    // On error response
    async (error) => {
      if (!axios.isAxiosError(error)) {
        return Promise.reject(error);
      }
      
      if (!error.config) {
        return Promise.reject(error);
      }
      
      // Track retries to avoid infinite loops
      const config = error.config;
      const retryCountHeader = config.headers?.['x-retry-count'];
      const retryCount = retryCountHeader && typeof retryCountHeader === 'string' 
        ? parseInt(retryCountHeader, 10) 
        : 0;
      
      // Max 3 retries
      if (retryCount >= 3) {
        console.error(`Max retries (${retryCount}) reached for request to ${config.url}`);
        return Promise.reject(error);
      }
      
      // Handle different error cases
      if (error.response) {
        const status = error.response.status || 0;
        
        // Server responded with error status
        switch (status) {
          case 429: // Too Many Requests
            const retryAfterHeader = error.response.headers?.['retry-after'];
            const retryAfter = retryAfterHeader && typeof retryAfterHeader === 'string'
              ? parseInt(retryAfterHeader, 10) * 1000 
              : 10000; // Default to 10 seconds if no header
            
            console.log(`Rate limited. Waiting ${retryAfter / 1000} seconds before retry ${retryCount + 1}/3...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter));
            break;
            
          case 500: // Server error
          case 502: // Bad Gateway  
          case 503: // Service Unavailable
          case 504: // Gateway Timeout
            const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
            console.log(`Server error (${status}). Retrying in ${backoffDelay/1000}s (${retryCount + 1}/3)...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            break;
            
          default:
            // Don't retry other status codes
            return Promise.reject(error);
        }
        
        // Update retry count and try again
        const newConfig = { ...config };
        
        // Use a type assertion to handle the headers more flexibly
        const headers = { ...(newConfig.headers || {}) };
        headers['x-retry-count'] = (retryCount + 1).toString();
        
        // Type assertion to make TypeScript happy with the headers
        newConfig.headers = headers as any;
        
        return instance.request(newConfig);
        
      } else if (error.request) {
        // Request made but no response received (network error)
        if (retryCount < 2) {
          // Exponential backoff for network errors
          const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
          console.log(`Network error. Retrying in ${backoffDelay/1000}s (${retryCount + 1}/3)...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          
          // Update retry count and try again
          const newConfig = { ...config };
          
          // Use a type assertion to handle the headers more flexibly
          const headers = { ...(newConfig.headers || {}) };
          headers['x-retry-count'] = (retryCount + 1).toString();
          
          // Type assertion to make TypeScript happy with the headers
          newConfig.headers = headers as any;
          
          return instance.request(newConfig);
        }
      }
      
      // For all other errors or if we've exhausted retries
      return Promise.reject(error);
    }
  );
  
  return instance;
};

dotenv.config();

const API_KEY = process.env.HYPERNYM_API_KEY;
if (!API_KEY) {
  throw new Error('HYPERNYM_API_KEY environment variable is required');
}

interface AnalyzeTextArgs {
  text: string;
  min_semantic_similarity?: number;
  min_compression_ratio?: number;
}

const isValidAnalyzeTextArgs = (args: any): args is AnalyzeTextArgs =>
  typeof args === 'object' &&
  args !== null &&
  typeof args.text === 'string' &&
  (args.min_compression_ratio === undefined || typeof args.min_compression_ratio === 'number') &&
  (args.min_semantic_similarity === undefined || typeof args.min_semantic_similarity === 'number');

class HypernymServer {
  private server: Server;
  private axiosInstance;
  private app: Application;
  private httpServer!: HttpServer | HttpsServer;

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

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'analyze_text',
          description: 'Analyze text using Hypernym AI for semantic categorization and compression. Returns detailed JSON with semantic categories, compression ratios, and more.',
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
                default: 0.5,
              },
              min_semantic_similarity: {
                type: 'number',
                description: 'Minimum semantic similarity to consider for suggested output (0.0-1.0)',
                minimum: 0,
                maximum: 1,
                default: 0.8,
              },
            },
            required: ['text'],
          },
        },
        {
          name: 'semantic_compression',
          description: 'Get compressed version of text using Hypernym AI. Returns only the compressed text as a string, not the full analysis.',
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
                default: 0.5,
              },
              min_semantic_similarity: {
                type: 'number',
                description: 'Minimum semantic similarity to consider for suggested output (0.0-1.0)',
                minimum: 0,
                maximum: 1,
                default: 0.8,
              },
            },
            required: ['text'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'analyze_text':
            if (!isValidAnalyzeTextArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'Invalid analyze_text arguments: expected {text: string, min_compression_ratio?: number, min_semantic_similarity?: number}'
              );
            }

            try {
              console.log(`Processing analyze_text request with ${request.params.arguments.text.length} characters`);
              
              const response = await this.axiosInstance.post('/analyze_sync', {
                essay_text: request.params.arguments.text,
                params: {
                  min_compression_ratio: request.params.arguments.min_compression_ratio ?? 0.5,
                  min_semantic_similarity: request.params.arguments.min_semantic_similarity ?? 0.8,
                },
              });

              console.log('Successfully received response from Hypernym API');
              
              // For the analyze_text tool, return the full analysis
              // Make sure we're returning properly formatted JSON
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response.data, null, 2),
                  },
                ],
              };
            } catch (error) {
              console.error('Error in analyze_text tool:', error);
              
              if (axios.isAxiosError(error)) {
                let errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
                
                // Add more descriptive messages for common errors
                if (error.response) {
                  const status = error.response.status || 0;
                  if (status === 429) {
                    const retryAfter = error.response.headers?.['retry-after'];
                    errorMessage = `Rate limit exceeded with Hypernym API. Please try again later. ${retryAfter ? `Retry after: ${retryAfter} seconds.` : ''}`;
                    console.error('Rate limit exceeded with Hypernym API.');
                  } else if (status === 400) {
                    errorMessage = `Bad request: ${errorMessage}`;
                  } else if (status === 401 || status === 403) {
                    errorMessage = 'Authentication error with Hypernym API. Please check your API key.';
                  } else if (status >= 500) {
                    errorMessage = 'Hypernym API server error. Please try again later.';
                  }
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
              throw new McpError(
                ErrorCode.InvalidParams,
                'Invalid semantic_compression arguments: expected {text: string, min_compression_ratio?: number, min_semantic_similarity?: number}'
              );
            }

            try {
              console.log(`Processing semantic_compression request with ${request.params.arguments.text.length} characters`);
              
              const response = await this.axiosInstance.post('/analyze_sync', {
                essay_text: request.params.arguments.text,
                params: {
                  min_compression_ratio: request.params.arguments.min_compression_ratio ?? 0.5,
                  min_semantic_similarity: request.params.arguments.min_semantic_similarity ?? 0.8,
                },
              });

              console.log('Successfully received response from Hypernym API');
              
              // For the semantic_compression tool, return only the suggested compressed text
              // Make sure we handle potential API response structure changes gracefully
              let compressedText = '';
              
              if (response.data && response.data.results && response.data.results.response && response.data.results.response.texts) {
                compressedText = response.data.results.response.texts.suggested || response.data.results.response.texts.compressed || '';
              } else {
                console.warn('Unexpected API response structure:', JSON.stringify(response.data).substring(0, 200) + '...');
                throw new Error('Unexpected API response structure');
              }

              return {
                content: [
                  {
                    type: 'text',
                    text: compressedText,
                  },
                ],
              };
            } catch (error) {
              console.error('Error in semantic_compression tool:', error);
              
              if (axios.isAxiosError(error)) {
                let errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
                
                // Add more descriptive messages for common errors
                if (error.response) {
                  const status = error.response.status || 0;
                  if (status === 429) {
                    const retryAfter = error.response.headers?.['retry-after'];
                    errorMessage = `Rate limit exceeded with Hypernym API. Please try again later. ${retryAfter ? `Retry after: ${retryAfter} seconds.` : ''}`;
                    console.error('Rate limit exceeded with Hypernym API.');
                  } else if (status === 400) {
                    errorMessage = `Bad request: ${errorMessage}`;
                  } else if (status === 401 || status === 403) {
                    errorMessage = 'Authentication error with Hypernym API. Please check your API key.';
                  } else if (status >= 500) {
                    errorMessage = 'Hypernym API server error. Please try again later.';
                  }
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
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        console.error('Uncaught error in tool handler:', error);
        
        if (error instanceof McpError) {
          throw error;
        }
        
        // Handle unknown errors safely
        const errorMessage = error instanceof Error 
          ? error.message 
          : 'Unknown error occurred';
        
        throw new McpError(
          ErrorCode.InternalError,
          `Internal error: ${errorMessage}`
        );
      }
    });
  }

  private setupExpressRoutes() {
    const self = this;
    
    // Add MCP HTTP endpoint to handle MCP requests over HTTP
    this.app.post('/', async function(req: Request, res: Response) {
      try {
        const mcpRequest = req.body;
        
        // Validate it's a proper MCP request (jsonrpc 2.0)
        if (!mcpRequest || typeof mcpRequest !== 'object' || !mcpRequest.jsonrpc || mcpRequest.jsonrpc !== '2.0') {
          return res.status(400).json({ 
            jsonrpc: "2.0",
            id: mcpRequest?.id || null,
            error: {
              code: -32600,
              message: "Invalid request: Not a valid JSON-RPC 2.0 request"
            }
          });
        }

        // Ensure method is supported
        if (mcpRequest.method !== 'callTool' && mcpRequest.method !== 'listTools') {
          return res.status(400).json({
            jsonrpc: "2.0",
            id: mcpRequest?.id || null,
            error: {
              code: -32601,
              message: `Method not found: ${mcpRequest.method}`
            }
          });
        }
        
        // Handle listTools request
        if (mcpRequest.method === 'listTools') {
          return res.json({
            jsonrpc: "2.0",
            id: mcpRequest.id,
            result: {
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
                        description: 'Minimum compression ratio (0.0-1.0). Lower values allow more compression',
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
                        description: 'Minimum compression ratio (0.0-1.0). Lower values allow more compression',
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
            }
          });
        }
        
        // Handle the MCP call tool request
        if (mcpRequest.method === 'callTool') {
          const toolName = mcpRequest.params?.name;
          const toolArgs = mcpRequest.params?.arguments;
          
          // Validate tool name exists
          if (!toolName) {
            return res.status(400).json({
              jsonrpc: "2.0",
              id: mcpRequest.id,
              error: {
                code: -32602,
                message: "Invalid params: Missing tool name"
              }
            });
          }
          
          if (toolName === 'analyze_text') {
            if (!toolArgs || typeof toolArgs.text !== 'string') {
              return res.status(400).json({
                jsonrpc: "2.0",
                id: mcpRequest.id,
                error: {
                  code: -32602,
                  message: "Invalid params: Missing or invalid 'text' parameter"
                }
              });
            }
            
            try {
              const response = await self.axiosInstance.post('/analyze_sync', {
                essay_text: toolArgs.text,
                params: {
                  min_compression_ratio: toolArgs.min_compression_ratio ?? 0.5,
                  min_semantic_similarity: toolArgs.min_semantic_similarity ?? 0.8,
                },
              });
              
              // Format the response according to MCP standards
              // Return properly formatted JSON for the MCP response
              return res.json({
                jsonrpc: "2.0",
                id: mcpRequest.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(response.data, null, 2),
                    },
                  ],
                }
              });
            } catch (error) {
              if (axios.isAxiosError(error)) {
                // Map HTTP error codes to appropriate JSON-RPC error codes
                let code = -32603; // Default internal error
                let status = 500;
                
                if (error.response) {
                  status = error.response.status || 500;
                  
                  if (status === 429) {
                    code = -32000; // Custom error for rate limiting
                  } else if (status === 400) {
                    code = -32602; // Invalid params
                  } else if (status === 404) {
                    code = -32601; // Method not found
                  }
                }
                
                return res.status(status).json({
                  jsonrpc: "2.0",
                  id: mcpRequest.id,
                  error: {
                    code,
                    message: `Hypernym API error: ${error.response?.data?.message ?? error.message}`
                  }
                });
              }
              throw error;
            }
          } else if (toolName === 'semantic_compression') {
            if (!toolArgs || typeof toolArgs.text !== 'string') {
              return res.status(400).json({
                jsonrpc: "2.0",
                id: mcpRequest.id,
                error: {
                  code: -32602,
                  message: "Invalid params: Missing or invalid 'text' parameter"
                }
              });
            }
            
            try {
              const response = await self.axiosInstance.post('/analyze_sync', {
                essay_text: toolArgs.text,
                params: {
                  min_compression_ratio: toolArgs.min_compression_ratio ?? 0.5,
                  min_semantic_similarity: toolArgs.min_semantic_similarity ?? 0.8,
                },
              });
              
              // Return just the compressed text as per MCP format
              let compressedText = '';
              
              if (response.data && response.data.results && response.data.results.response && response.data.results.response.texts) {
                compressedText = response.data.results.response.texts.suggested || response.data.results.response.texts.compressed || '';
              } else {
                console.warn('Unexpected API response structure in HTTP handler');
              }
              
              return res.json({
                jsonrpc: "2.0",
                id: mcpRequest.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: compressedText,
                    },
                  ],
                }
              });
            } catch (error) {
              if (axios.isAxiosError(error)) {
                // Map HTTP error codes to appropriate JSON-RPC error codes
                let code = -32603; // Default internal error
                let status = 500;
                
                if (error.response) {
                  status = error.response.status || 500;
                  
                  if (status === 429) {
                    code = -32000; // Custom error for rate limiting
                  } else if (status === 400) {
                    code = -32602; // Invalid params
                  } else if (status === 404) {
                    code = -32601; // Method not found
                  }
                }
                
                return res.status(status).json({
                  jsonrpc: "2.0",
                  id: mcpRequest.id,
                  error: {
                    code,
                    message: `Hypernym API error: ${error.response?.data?.message ?? error.message}`
                  }
                });
              }
              throw error;
            }
          } else {
            return res.status(400).json({
              jsonrpc: "2.0",
              id: mcpRequest.id,
              error: {
                code: -32601,
                message: `Method not found: ${toolName}`
              }
            });
          }
        }
      } catch (error) {
        console.error('Error handling MCP request:', error);
        return res.status(500).json({ 
          jsonrpc: "2.0", 
          id: req.body?.id || null,
          error: { 
            code: -32603, 
            message: "Internal error"
          }
        });
      }
    });
    
    // Primary Hypernym API endpoint that matches the official API
    this.app.post('/analyze_sync', async function(req: Request, res: Response) {
      try {
        const { essay_text, params } = req.body;
        
        if (!essay_text || typeof essay_text !== 'string') {
          return res.status(400).json({ error: 'Missing or invalid essay_text parameter' });
        }

        // Extract API key from header if provided (for direct API usage)
        const apiKey = req.headers['x-api-key'] as string || process.env.HYPERNYM_API_KEY;
        
        if (!apiKey) {
          return res.status(401).json({ error: 'API key is required in X-API-Key header' });
        }
        
        try {
          // Create a custom instance for this request if a different API key is provided
          const instance = req.headers['x-api-key'] !== process.env.HYPERNYM_API_KEY
            ? createAxiosInstance(apiKey)
            : self.axiosInstance;
          
          const response = await instance.post('/analyze_sync', {
            essay_text,
            params: {
              min_compression_ratio: params?.min_compression_ratio ?? 0.5,
              min_semantic_similarity: params?.min_semantic_similarity ?? 0.8,
            },
          });
          
          return res.json(response.data);
        } catch (error) {
          if (axios.isAxiosError(error)) {
            // Forward the same status code from upstream API
            if (error.response) {
              const status = error.response.status || 500;
              const responseData = error.response.data || { error: error.message };
              
              // Special handling for rate limiting
              if (status === 429) {
                console.error('Rate limit exceeded with Hypernym API.');
                const retryAfter = error.response.headers?.['retry-after'] || '60';
                return res.status(429).json({
                  error: 'Rate limit exceeded with Hypernym API. Please try again later.',
                  retryAfter: retryAfter
                });
              }
              
              return res.status(status).json(responseData);
            }
          }
          throw error;
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status || 500;
          return res.status(status).json(
            error.response?.data || { 
              error: `Hypernym API error: ${error.message}`
            }
          );
        }
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Add a health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ 
        status: 'ok',
        version: '1.0.0',
        name: 'hypernym-mcp-server',
        tools: ['analyze_text', 'semantic_compression'],
        uptime: process.uptime()
      });
    });
  }

  async run() {
    // Setup Express routes without stdio transport
    this.setupExpressRoutes();
    const port = parseInt(process.env.PORT || '3022', 10);
    
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
      } catch (error) {
        console.error('Failed to start HTTPS server:', error);
        console.log('Falling back to HTTP server...');
        this.startHttpServer(port);
      }
    } else {
      // Start HTTP server
      this.startHttpServer(port);
    }
  }
  
  private startHttpServer(port: number) {
    this.httpServer = this.app.listen(port, () => {
      console.log(`Hypernym MCP server running on http://localhost:${port}`);
    });
  }
}

const server = new HypernymServer();
server.run().catch(console.error);