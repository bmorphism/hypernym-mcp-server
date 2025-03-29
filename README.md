# Hypernym MCP Server

MCP server providing semantic text analysis and compression tools via Hypernym AI.

## Features

- Provides MCP tools for text analysis and semantic compression
- Supports both standard MCP CLI through stdio transport
- Offers REST API endpoints via Express
- Supports HTTPS for secure connections

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/hypernym-mcp-server.git
   cd hypernym-mcp-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` and add your Hypernym API key:
   ```
   HYPERNYM_API_KEY=your_api_key_here
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
   ```bash
   npm start
   ```

The server will start on port 3000 by default (or the port specified in your `.env` file).

## Tools

### analyze_text
Full semantic analysis of text including categorization and compression metrics.

Parameters:
- `text` (required): Input text
- `minCompressionRatio` (optional): Target compression (0.0-1.0, default: 0.5)
- `minSemanticSimilarity` (optional): Target similarity (0.0-1.0, default: 0.8)

Returns: Full analysis including semantic categories, compression metrics, and reconstructed text.

### semantic_compression
Direct text compression maintaining semantic meaning.

Parameters:
- `text` (required): Input text
- `minCompressionRatio` (optional): Target compression (0.0-1.0, default: 0.5)
- `minSemanticSimilarity` (optional): Target similarity (0.0-1.0, default: 0.8)

Returns: Suggested text that preserves core meaning while maintaining readability.

## Environment Variables

- `HYPERNYM_API_KEY` (required): Your Hypernym API key
- `PORT` (optional): Port to run the server on (default: 3000)
- `SSL_KEY_PATH` (optional): Path to SSL key
- `SSL_CERT_PATH` (optional): Path to SSL certificate

## REST API

The server exposes these REST endpoints:

- `POST /analyze_text` - Analyze text using Hypernym AI
- `POST /semantic_compression` - Get compressed version of text
- `GET /health` - Health check endpoint

## Testing

Run the compression test:

```bash
npm run test:compression
```

Contact: chris@hypernym.ai
