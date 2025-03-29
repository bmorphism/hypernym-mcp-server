#!/usr/bin/env node
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

// Import fetch for Node.js environments that don't have it natively
let fetch;
try {
  // For Node.js >=18
  fetch = globalThis.fetch;
} catch (e) {
  try {
    // For Node.js <18, use node-fetch
    const nodeFetch = await import('node-fetch');
    fetch = nodeFetch.default;
  } catch (err) {
    console.error('Error: fetch is not available. For Node.js <18, install node-fetch:');
    console.error('npm install node-fetch');
    process.exit(1);
  }
}

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

// Get port from environment variables or default to 3022
const PORT = process.env.PORT || 3022;
const PROTOCOL = process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH ? 'https' : 'http';
const TOOL_NAME = process.argv[2] || 'semantic_compression';

// Read sample text from hamlet_soliloquy.txt
const sampleText = fs.readFileSync(resolve(__dirname, 'hamlet_soliloquy.txt'), 'utf8');

// Prepare MCP request - this follows JSON-RPC 2.0 format that MCP uses
const mcpRequest = {
  jsonrpc: "2.0",
  id: "1",
  method: "callTool",
  params: {
    name: TOOL_NAME,
    arguments: {
      text: sampleText,
      min_compression_ratio: 0.5,
      min_semantic_similarity: 0.8
    }
  }
};

// Make the request to the HTTP transport for MCP
console.log(`Testing MCP tool '${TOOL_NAME}' at ${PROTOCOL}://localhost:${PORT}...`);

// Make the actual request
fetch(`${PROTOCOL}://localhost:${PORT}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(mcpRequest)
})
.then(async (res) => {
  console.log(`Status: ${res.status} ${res.statusText}`);
  return res.json();
})
.then((data) => {
  console.log('MCP Response:', JSON.stringify(data, null, 2));
  
  if (data.result && data.result.content && data.result.content.length > 0) {
    console.log('\nTool Output:');
    data.result.content.forEach((item, i) => {
      console.log(`Content ${i+1} (${item.type}):`);
      console.log(item.text);
    });
  } else if (data.error) {
    console.error('MCP Error:', data.error);
  }
})
.catch((err) => {
  console.error('Request Error:', err.message);
});