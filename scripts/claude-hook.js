#!/usr/bin/env node

/**
 * Claude Code Hook Script
 * Intercepts prompts and responses to integrate the invisible sub-agent system
 * Called automatically by Claude Code when hooks are enabled
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const MIDDLEWARE_URL = 'http://localhost:3457';
const CACHE_FILE = path.join(__dirname, '../.claude-hook-cache.json');
const LOG_FILE = path.join(__dirname, '../.claude-hook.log');
const CONFIG_FILE = path.join(__dirname, '../config/sub-agent-selection.json');

/**
 * Check for proactive reminder keywords in prompt
 * Prevents bypassing sub-agents (NC-EXEC-004: 15% quality loss)
 * @param {string} prompt - The user prompt to analyze
 * @returns {object|null} - Reminder details if keywords detected, null otherwise
 */
function checkProactiveReminders(prompt) {
  try {
    // Load config synchronously for hook performance (ESM compatible)
    const configData = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    const reminders = configData.proactiveReminders;

    if (!reminders) return null;

    const promptLower = prompt.toLowerCase();
    const results = [];

    for (const [domain, config] of Object.entries(reminders)) {
      if (!config.enabled) continue;

      // Check exclusions first - if prompt contains exclusions, skip this domain
      const hasExclusion = config.exclusions?.some(excl =>
        promptLower.includes(excl.toLowerCase())
      );
      if (hasExclusion) continue;

      // Count keyword matches
      const matches = config.keywords.filter(kw =>
        promptLower.includes(kw.toLowerCase())
      );

      if (matches.length >= config.triggerMinMatches) {
        results.push({
          domain,
          keywords: matches,
          reminder: config.reminderText,
          suggestions: config.suggestCommands
        });
      }
    }

    return results.length > 0 ? results : null;
  } catch (_error) {
    // Fail silently - don't block prompts if config loading fails
    return null;
  }
}

// Utility to log messages
async function log(message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}${data ? ': ' + JSON.stringify(data) : ''}\n`;
  
  try {
    await fs.appendFile(LOG_FILE, logEntry);
  } catch (error) {
    console.error('Failed to write log:', error);
  }
}

// Check if middleware service is running
async function isMiddlewareRunning() {
  try {
    const response = await fetch(`${MIDDLEWARE_URL}/health`, { 
      timeout: 1000 
    });
    return response.ok;
  } catch (_error) {
    return false;
  }
}

// Start middleware service if not running
async function ensureMiddlewareRunning() {
  if (await isMiddlewareRunning()) {
    return true;
  }
  
  console.error('🚀 Starting invisible sub-agent middleware...');
  
  // Start the service
  const { spawn } = await import('child_process');
  const service = spawn('node', [
    path.join(__dirname, 'claude-middleware-service.js')
  ], {
    detached: true,
    stdio: 'ignore'
  });
  
  service.unref();
  
  // Wait for service to start (max 5 seconds)
  for (let i = 0; i < 50; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (await isMiddlewareRunning()) {
      console.error('✅ Middleware started successfully');
      return true;
    }
  }
  
  console.error('❌ Failed to start middleware');
  return false;
}

// Handle prompt submission
async function handlePromptSubmit(prompt, context = {}) {
  await log('Prompt submitted', { prompt: prompt.substring(0, 100) });

  // Check for proactive reminders (prevents NC-EXEC-004 violations)
  const reminders = checkProactiveReminders(prompt);
  if (reminders) {
    console.error('\n' + '='.repeat(70));
    for (const reminder of reminders) {
      console.error(`\n${reminder.reminder}`);
      console.error(`Keywords detected: ${reminder.keywords.join(', ')}`);
      console.error('\nSuggested alternatives:');
      for (const suggestion of reminder.suggestions) {
        console.error(`  → ${suggestion}`);
      }
      await log('Proactive reminder triggered', {
        domain: reminder.domain,
        keywords: reminder.keywords
      });
    }
    console.error('\n' + '='.repeat(70) + '\n');
  }

  // Ensure middleware is running
  if (!await ensureMiddlewareRunning()) {
    console.error('⚠️ Sub-agent system unavailable');
    return;
  }
  
  try {
    // Send prompt to middleware for analysis
    const response = await fetch(`${MIDDLEWARE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        context: {
          ...context,
          timestamp: new Date().toISOString(),
          source: 'claude-hook'
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Analysis failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // Cache the request ID for response enhancement
    const cache = { requestId: result.requestId, timestamp: Date.now() };
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache));
    
    // Log selected agents
    if (result.selected && result.selected.length > 0) {
      console.error(`🤖 Sub-agents selected: ${result.selected.map(a => a.agent_name).join(', ')}`);
      await log('Sub-agents selected', result.selected);
    } else {
      console.error('ℹ️ No sub-agents selected for this prompt');
    }
    
  } catch (error) {
    console.error('❌ Prompt analysis failed:', error.message);
    await log('Error analyzing prompt', { error: error.message });
  }
}

// Handle response received
async function handleResponseReceived(response) {
  await log('Response received', { length: response.length });
  
  // Ensure middleware is running
  if (!await isMiddlewareRunning()) {
    // Return original response if middleware not available
    console.log(response);
    return;
  }
  
  try {
    // Get cached request ID
    let requestId;
    try {
      const cacheData = await fs.readFile(CACHE_FILE, 'utf-8');
      const cache = JSON.parse(cacheData);
      requestId = cache.requestId;
    } catch (_error) {
      // No cache, can't enhance
      console.log(response);
      return;
    }
    
    // Send response for enhancement
    const enhanceResponse = await fetch(`${MIDDLEWARE_URL}/enhance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        response
      })
    });
    
    if (!enhanceResponse.ok) {
      throw new Error(`Enhancement failed: ${enhanceResponse.statusText}`);
    }
    
    const { enhanced } = await enhanceResponse.json();
    
    // Output enhanced response
    console.log(enhanced);
    
    if (enhanced.length > response.length) {
      const added = enhanced.length - response.length;
      await log('Response enhanced', { added_chars: added });
    }
    
  } catch (error) {
    // On error, return original response
    console.error('❌ Response enhancement failed:', error.message);
    await log('Error enhancing response', { error: error.message });
    console.log(response);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  // Get input from stdin
  let input = '';
  process.stdin.setEncoding('utf8');
  
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  
  // Handle different hook types
  switch (command) {
    case 'prompt-submit':
      await handlePromptSubmit(input.trim());
      break;
      
    case 'response-received':
      await handleResponseReceived(input);
      break;
      
    default:
      console.error(`Unknown command: ${command}`);
      console.log(input); // Pass through unchanged
  }
}

// Error handling
process.on('uncaughtException', async (error) => {
  await log('Uncaught exception', { error: error.message });
  console.error('Fatal error:', error);
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  await log('Unhandled rejection', { reason });
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

// Run main function
main().catch(async (error) => {
  await log('Main function error', { error: error.message });
  console.error('Error:', error);
  process.exit(1);
});