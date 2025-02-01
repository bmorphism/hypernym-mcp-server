import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  // Start the MCP server
  const server = spawn('node', ['../build/index.js'], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: process.env
  });

  // Create MCP client
  const transport = new StdioClientTransport(server.stdout, server.stdin);
  const client = new Client();
  await client.connect(transport);

  try {
    // Read Jabberwocky text
    const text = readFileSync(join(__dirname, 'jabberwocky.txt'), 'utf-8');
    
    // Call semantic_compression
    const result = await client.callTool({
      name: 'semantic_compression',
      arguments: {
        text,
        minCompressionRatio: 0.3,
        minSemanticSimilarity: 0.7
      }
    });

    const content = result.content as Array<{type: string, text: string}>;
    
    console.log('Original text:\n', text);
    console.log('\nCompressed text:\n', content[0].text);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    server.kill();
  }
}

main().catch(console.error);
