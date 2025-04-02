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
const ENDPOINT = process.argv[2] || 'health';

// Prepare request options
const options = {
  method: ENDPOINT === 'health' ? 'GET' : 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
};

// Add request body for non-health endpoints
if (ENDPOINT !== 'health') {
  // Read sample text from hamlet_soliloquy.txt
  const sampleText = fs.readFileSync(resolve(__dirname, 'hamlet_soliloquy.txt'), 'utf8');
  
  if (ENDPOINT === 'analyze_sync') {
    options.body = JSON.stringify({
      essay_text: sampleText,
      params: {
        min_compression_ratio: 0.5,
        min_semantic_similarity: 0.8
      }
    });
  } else if (ENDPOINT === 'semantic_compression') {
    // For MCP tool testing
    options.body = JSON.stringify({
      jsonrpc: "2.0", 
      id: "1", 
      method: "callTool",
      params: {
        name: "semantic_compression",
        arguments: {
          text: sampleText,
          min_compression_ratio: 0.5,
          min_semantic_similarity: 0.8
        }
      }
    });
  }
}

// Construct the URL
const url = `${PROTOCOL}://localhost:${PORT}/${ENDPOINT}`;

console.log(`Testing ${options.method} ${url}...`);
if (options.body) {
  console.log(`Request body: ${options.body.length > 100 ? options.body.substring(0, 100) + '...' : options.body}`);
}

// Make the request
if (PROTOCOL === 'https') {
  options.rejectUnauthorized = false;
}

fetch(url, options)
  .then(async (res) => {
    console.log(`Status: ${res.status} ${res.statusText}`);
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return res.json();
    } else {
      return res.text();
    }
  })
  .then((data) => {
    if (typeof data === 'object') {
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      console.log('Response:', data);
    }
  })
  .catch((err) => console.error('Error:', err.message));