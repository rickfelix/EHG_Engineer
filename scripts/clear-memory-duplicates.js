#!/usr/bin/env node

// Simple script to clear in-memory duplicates by restarting the server
// This script will kill the server process and then restart it

import { exec } from 'child_process';

console.log('🔄 Clearing in-memory duplicates by restarting server...');

// Kill any existing server processes
exec('pkill -f "node server.js"', (error) => {
  if (error) {
    console.log('ℹ️  No existing server processes found');
  } else {
    console.log('🛑 Killed existing server processes');
  }
  
  setTimeout(() => {
    console.log('🚀 Starting fresh server...');
    exec('cd /mnt/c/_EHG/EHG_Engineer && PORT=3000 node server.js', (error, stdout, stderr) => {
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
});