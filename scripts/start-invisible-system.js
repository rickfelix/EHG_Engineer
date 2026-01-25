#!/usr/bin/env node

/**
 * Start Invisible Sub-Agent System
 * Launches the middleware service and verifies integration with Claude Code
 */

import { spawn } from 'child_process';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Configuration
const MIDDLEWARE_PORT = process.env.SUBAGENT_PORT || 3457;
const MIDDLEWARE_URL = `http://localhost:${MIDDLEWARE_PORT}`;

async function checkService() {
  try {
    const response = await fetch(`${MIDDLEWARE_URL}/health`);
    return response.ok;
  } catch (_error) {
    return false;
  }
}

async function startMiddleware() {
  console.log('🚀 Starting Invisible Sub-Agent System...\n');
  
  // Check if already running
  if (await checkService()) {
    console.log('✅ Middleware service is already running');
    const health = await fetch(`${MIDDLEWARE_URL}/health`);
    const status = await health.json();
    console.log('📊 Status:', JSON.stringify(status, null, 2));
    return true;
  }
  
  // Start the middleware service
  console.log('🔧 Launching middleware service...');
  
  const service = spawn('node', [
    path.join(__dirname, 'claude-middleware-service.js')
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });
  
  // Handle output
  service.stdout.on('data', (data) => {
    process.stdout.write(data);
  });
  
  service.stderr.on('data', (data) => {
    process.stderr.write(data);
  });
  
  service.on('error', (error) => {
    console.error('❌ Failed to start middleware:', error);
    process.exit(1);
  });
  
  // Wait for service to be ready
  console.log('⏳ Waiting for service to initialize...');
  
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (await checkService()) {
      console.log('\n✅ Middleware service is ready!');
      
      // Get service status
      const health = await fetch(`${MIDDLEWARE_URL}/health`);
      const status = await health.json();
      console.log('\n📊 System Status:');
      console.log(JSON.stringify(status, null, 2));
      
      return true;
    }
  }
  
  console.error('❌ Service failed to start within 30 seconds');
  return false;
}

async function verifyHooks() {
  console.log('\n🔍 Verifying Claude Code integration...');
  
  // Check if hooks are enabled
  try {
    const configPath = path.join(__dirname, '../.claude-code-config.json');
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    
    if (config.hooks && config.hooks.enabled) {
      console.log('✅ Claude Code hooks are enabled');
      console.log('   - Prompt hook:', config.hooks.promptSubmit || 'Not configured');
      console.log('   - Response hook:', config.hooks.responseReceived || 'Not configured');
      return true;
    } else {
      console.log('❌ Claude Code hooks are not enabled');
      console.log('   Run: npm run activate-subagents');
      return false;
    }
  } catch (_error) {
    console.error('❌ Failed to check Claude Code configuration:', error.message);
    return false;
  }
}

async function testIntegration() {
  console.log('\n🧪 Testing sub-agent selection...');
  
  // Test prompt analysis
  try {
    const testPrompt = 'Fix the dark mode toggle in the dashboard';
    
    console.log(`\n📝 Test prompt: "${testPrompt}"`);
    
    const response = await fetch(`${MIDDLEWARE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: testPrompt,
        context: { test: true }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Analysis failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.selected && result.selected.length > 0) {
      console.log('\n✅ Sub-agents selected successfully:');
      result.selected.forEach(agent => {
        console.log(`   🤖 ${agent.agent_name} (${(agent.confidence * 100).toFixed(0)}% confidence)`);
      });
    } else {
      console.log('ℹ️ No sub-agents selected for test prompt');
    }
    
    return true;
    
  } catch (_error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('═'.repeat(60));
  console.log('🤖 INVISIBLE SUB-AGENT SYSTEM ACTIVATION');
  console.log('═'.repeat(60));
  
  // Start middleware
  if (!await startMiddleware()) {
    console.error('\n❌ Failed to start middleware service');
    process.exit(1);
  }
  
  // Verify hooks
  if (!await verifyHooks()) {
    console.warn('\n⚠️ Claude Code hooks need configuration');
  }
  
  // Test integration
  if (await testIntegration()) {
    console.log('\n🎉 Integration test passed!');
  } else {
    console.warn('\n⚠️ Integration test had issues');
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('✅ SYSTEM READY');
  console.log('═'.repeat(60));
  
  console.log('\n📋 Next Steps:');
  console.log('1. The middleware service is now running in the background');
  console.log('2. Claude Code will automatically use the sub-agent system');
  console.log('3. Try a prompt like: "Fix the dark mode toggle"');
  console.log('4. Watch for sub-agent selections in the console');
  console.log('\n💡 The system will enhance responses automatically!');
  
  console.log('\n📊 Dashboard: http://localhost:' + MIDDLEWARE_PORT);
  console.log('📝 Logs: .claude-hook.log');
  console.log('\nPress Ctrl+C to stop the service...');
}

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️ Shutting down invisible sub-agent system...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️ Terminating invisible sub-agent system...');
  process.exit(0);
});

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});