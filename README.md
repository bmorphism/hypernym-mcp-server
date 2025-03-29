# Hypernym MCP Server

A Model Context Protocol (MCP) server providing semantic text analysis and compression tools via Hypernym AI's API. This server allows LLMs to access Hypernym's semantic categorization and compression capabilities through standardized MCP interfaces.

## What is Hypernym AI?

Hypernym AI offers advanced semantic analysis tools that can:
- Categorize text into precise semantic buckets
- Generate adaptive compression while maintaining meaning
- Provide similarity scoring for content density
- Extract key details from complex text

## Features

- Implements the Model Context Protocol (MCP) specification
- Provides MCP tools for text analysis and semantic compression
- Supports both standard MCP CLI interface through stdio transport
- Offers HTTP/HTTPS JSON-RPC 2.0 endpoints via Express
- Includes retry logic with exponential backoff for API requests
- HTTPS support for secure connections
- Properly formatted MCP tool descriptions and schemas

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/hypernym/hypernym-mcp-server.git
   cd hypernym-mcp-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file:
   ```bash
   touch .env
   ```

4. Add your Hypernym API key to the `.env` file:
   ```
   HYPERNYM_API_KEY=your_api_key_here
   PORT=3022
   ```

## Setting up HTTPS (recommended for production)

Generate self-signed certificates for development:

```bash
npm run generate-certs
```

Or provide your own certificates and update the paths in `.env`:

```
SSL_KEY_PATH=/path/to/your/server.key
SSL_CERT_PATH=/path/to/your/server.crt
```

## Usage

1. Build the project:
   ```bash
   npm run build
   ```

2. Start the server:

   a. HTTP/HTTPS mode:
   ```bash
   npm start
   ```
   The server will start on port 3022 by default (or the port specified in your `.env` file).

   b. stdio transport mode (for MCP integration):
   ```bash
   npm run start:stdio
   ```
   This is the mode you should use when configuring the server in a `.mcp.json` file.

## MCP Tools

The server provides the following tools through the Model Context Protocol:

### analyze_text

Full semantic analysis of text including categorization and compression metrics.

**Parameters:**
- `text` (required): The input text to analyze
- `min_compression_ratio` (optional): Target compression ratio (0.0-1.0, default: 0.5)
  - 1.0 = no compression
  - 0.8 = 20% compression
  - 0.5 = 50% compression
  - 0.0 = maximum compression
- `min_semantic_similarity` (optional): Minimum semantic similarity threshold (0.0-1.0, default: 0.8)
  - Higher values preserve more original meaning

**Returns:** 
Complete JSON analysis including semantic categories, compression metrics, and reconstructed text.

### semantic_compression

Direct text compression that maintains semantic meaning.

**Parameters:**
- `text` (required): The input text to compress
- `min_compression_ratio` (optional): Target compression ratio (0.0-1.0, default: 0.5)
- `min_semantic_similarity` (optional): Minimum semantic similarity threshold (0.0-1.0, default: 0.8)

**Returns:** 
Only the compressed text that preserves core meaning while maintaining readability.

## Environment Variables

- `HYPERNYM_API_KEY` (required): Your Hypernym AI API key
- `PORT` (optional): Port to run the server on (default: 3022)
- `SSL_KEY_PATH` (optional): Path to SSL key file
- `SSL_CERT_PATH` (optional): Path to SSL certificate file
- `MCP_USE_STDIO` (optional): Set to 'true' to force stdio transport mode

## MCP Integration

To use this server with MCP-compatible AI platforms, add the following configuration to your `.mcp.json` file:

```json
{
  "mcpServers": {
    "hypernym": {
      "type": "stdio",
      "command": "cd /path/to/hypernym-mcp-server && npm run start:stdio",
      "description": "Hypernym semantic analysis and compression tool",
      "tools": ["analyze_text", "semantic_compression"]
    }
  }
}
```

This allows AI models to access Hypernym's capabilities through MCP's standardized tool interface.

## HTTP Endpoints

The server exposes these HTTP endpoints:

- `POST /` - MCP JSON-RPC 2.0 endpoint for tool calls and listings
- `POST /analyze_sync` - Direct Hypernym API passthrough
- `GET /health` - Health check endpoint

## Testing

Test the server with provided sample texts:

```bash
# Test server health
npm run test:server

# Test direct API endpoint
npm run test:analyze

# Test MCP semantic compression
npm run test:semantic

# Test MCP analyze_text
npm run test:analyze-mcp
```

## JSON-RPC 2.0 Examples

### List available tools:

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "listTools"
}
```

### Call the semantic_compression tool:

```json
{
  "jsonrpc": "2.0",
  "id": "2", 
  "method": "callTool",
  "params": {
    "name": "semantic_compression",
    "arguments": {
      "text": "Your text to compress here",
      "min_compression_ratio": 0.5,
      "min_semantic_similarity": 0.8
    }
  }
}
```

## API Response Example

When using the `analyze_text` tool, you'll receive a JSON response like:

```json
{
  "metadata": {
    "version": "0.1.0",
    "timestamp": "2024-03-21T00:00:00Z",
    "tokens": {
      "in": 1000,
      "out": 500,
      "total": 1500
    }
  },
  "response": {
    "meta": {
      "embedding": {
        "version": "0.1.0",
        "dimensions": 512
      }
    },
    "texts": {
      "compressed": "Philosophy::subject=existence;theme=mortality",
      "suggested": "To be or not to be - an examination of human mortality and the consequences of action versus inaction."
    },
    "segments": [
      {
        "was_compressed": true,
        "semantic_category": "Philosophical contemplation of existence",
        "semantic_similarity": 0.81,
        "compression_ratio": 0.61
      }
    ]
  }
}
```

For more information on the Hypernym API or to obtain an API key, contact the Hypernym team.
