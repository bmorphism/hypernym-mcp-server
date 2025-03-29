import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import axios from 'axios';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  // Start the MCP server in the background
  const server = spawn('node', [join(process.cwd(), 'build', 'index.js')], {
    stdio: 'inherit',
    env: process.env,
    detached: false
  });
  
  // Wait for server to start
  console.log('Starting server...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const PORT = process.env.PORT || 3000;
  const API_URL = `http://localhost:${PORT}`;

  try {
    // Read Jabberwocky text
    const text = readFileSync(join(__dirname, 'jabberwocky.txt'), 'utf-8');
    
    // Call Hypernym API using the official API endpoint
    const response = await axios.post(`${API_URL}/analyze_sync`, {
      essay_text: text,
      params: {
        min_compression_ratio: 0.3,
        min_semantic_similarity: 0.7
      }
    });
    
    console.log('Full API response:', JSON.stringify(response.data, null, 2));
    console.log('Original text:\n', text);
    
    // Access the suggested compressed text based on documentation
    const suggested = response.data.response?.texts?.suggested;
    console.log('\nCompressed text:\n', suggested || 'No compressed text available');
  } catch (error) {
    console.error('Error:', error);
    if (axios.isAxiosError(error)) {
      console.error('API Error:', error.response?.data || error.message);
    }
  } finally {
    // Shutdown server
    server.kill();
  }
}

main().catch(console.error);
