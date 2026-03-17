#!/usr/bin/env node
/**
 * Model Self-Identification Capture
 * Purpose: Called at start of sub-agent execution to capture model identity
 *
 * This script is designed to be called by sub-agents themselves.
 * The sub-agent passes its self-reported identity, which is then logged.
 *
 * Usage from sub-agent prompt:
 *   "Before proceeding, identify yourself by running:
 *    node scripts/model-self-identify.js <subagent_type> <sd_id> <phase>"
 *
 * The sub-agent then provides its model info via stdin or arguments.
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get configured model from agent file frontmatter
 */
function getConfiguredModel(subagentType) {
  try {
    const projectPath = path.join(__dirname, '..', '.claude', 'agents', `${subagentType}.md`);

    if (fs.existsSync(projectPath)) {
      const content = fs.readFileSync(projectPath, 'utf8');
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        const modelMatch = match[1].match(/^model:\s*(\w+)/m);
        if (modelMatch) {
          return modelMatch[1].toLowerCase();
        }
      }
    }
    return null;
  } catch (_err) {
    return null;
  }
}

/**
 * Try to get current session ID from local files
 */
function getCurrentSessionId() {
  try {
    const sessionFile = path.join(__dirname, '..', '.leo-session-id');
    if (fs.existsSync(sessionFile)) {
      return fs.readFileSync(sessionFile, 'utf8').trim();
    }
  } catch (_err) {
    // Ignore
  }
  return null;
}

/**
 * Parse model info from JSON string
 */
function parseModelInfo(jsonStr) {
  try {
    const data = JSON.parse(jsonStr.replace(/```json\n?|\n?```/g, '').trim());
    return {
      modelName: data.model_name || data.modelName,
      modelId: data.model_id || data.modelId
    };
  } catch (err) {
    console.error('Failed to parse model info:', err.message);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Check for --interactive flag or direct args
  if (args.includes('--help') || args.length === 0) {
    console.log(`
Model Self-Identification Capture

Usage:
  # Direct mode (all args provided):
  node model-self-identify.js <subagent_type> <model_name> <model_id> [sd_id] [phase]

  # Interactive mode (reads JSON from stdin):
  echo '{"model_name":"Sonnet 4.5","model_id":"claude-sonnet-4-5-20250929"}' | \\
    node model-self-identify.js --stdin <subagent_type> [sd_id] [phase]

Examples:
  node model-self-identify.js testing-agent "Sonnet 4.5" claude-sonnet-4-5-20250929 SD-TEST-001 EXEC
`);
    process.exit(0);
  }

  let subagentType, modelName, modelId, sdId, phase;

  if (args[0] === '--stdin') {
    // Interactive mode - read JSON from stdin
    subagentType = args[1];
    sdId = args[2] || null;
    phase = args[3] || null;

    // Read from stdin
    const rl = readline.createInterface({ input: process.stdin });
    let input = '';
    for await (const line of rl) {
      input += line;
    }

    const parsed = parseModelInfo(input);
    if (!parsed) {
      console.error('Could not parse model info from stdin');
      process.exit(1);
    }
    modelName = parsed.modelName;
    modelId = parsed.modelId;
  } else {
    // Direct mode
    [subagentType, modelName, modelId, sdId, phase] = args;
  }

  if (!subagentType || !modelName || !modelId) {
    console.error('Missing required arguments: subagent_type, model_name, model_id');
    process.exit(1);
  }

  const configuredModel = getConfiguredModel(subagentType);
  const sessionId = getCurrentSessionId();

  // Log to database
  const supabase = await createSupabaseServiceClient('engineer');

  const record = {
    session_id: sessionId,
    sd_id: sdId || null,
    phase: phase || 'UNKNOWN',
    subagent_type: subagentType,
    subagent_configured_model: configuredModel,
    reported_model_name: modelName,
    reported_model_id: modelId,
    metadata: {
      capture_method: args[0] === '--stdin' ? 'stdin' : 'direct',
      captured_by: 'model-self-identify.js'
    }
  };

  const { data: result, error } = await supabase
    .from('model_usage_log')
    .insert(record)
    .select()
    .single();

  if (error) {
    // Table might not exist yet
    if (error.message.includes('does not exist')) {
      console.log('⚠️  model_usage_log table not found. Run migration first.');
      console.log('   Migration: database/migrations/20251204_model_usage_tracking.sql');
    } else {
      console.error('Database error:', error.message);
    }
    process.exit(1);
  }

  // Output for logging
  const matchStatus = result.config_matches_reported === false ? '❌ MISMATCH' : '✅ OK';
  console.log(`📊 Model tracked: ${subagentType} → ${modelName} (${modelId}) [${matchStatus}]`);

  // Return JSON for programmatic use
  console.log(JSON.stringify({
    success: true,
    id: result.id,
    subagent: subagentType,
    configured: configuredModel,
    reported: modelId,
    matches: result.config_matches_reported
  }));
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
