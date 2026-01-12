#!/usr/bin/env node

// Simple script to clear in-memory duplicates by restarting the server
// This script will kill the server process and then restart it
// Cross-platform compatible (Windows/Linux/macOS)

import { exec } from 'child_process';
import { killByName } from '../lib/utils/process-utils.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const engineerRoot = path.resolve(__dirname, '..');

console.log('🔄 Clearing in-memory duplicates by restarting server...');

// Kill any existing server processes (cross-platform)
async function restartServer() {
  try {
    const killed = await killByName('server.js');
    if (killed > 0) {
      console.log(`🛑 Killed ${killed} existing server process(es)`);
    } else {
      console.log('ℹ️  No existing server processes found');
    }
  } catch (error) {
    console.log('ℹ️  No existing server processes found');
  }

  setTimeout(() => {
    console.log('🚀 Starting fresh server...');
    const envPrefix = process.platform === 'win32' ? 'set PORT=3000 &&' : 'PORT=3000';
    exec(`cd "${engineerRoot}" && ${envPrefix} node server.js`, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Error starting server:', error);
        return;
      }
      console.log('✅ Server restarted successfully');
      console.log('Output:', stdout);
      if (stderr) {
        console.log('Stderr:', stderr);
      }
    });
  }, 1000);
}

restartServer();
