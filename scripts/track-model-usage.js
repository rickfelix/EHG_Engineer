#!/usr/bin/env node
/**
 * Model Usage Tracking Script
 * Purpose: Log model self-identification to database for routing verification
 *
 * Usage:
 *   node track-model-usage.js <subagent_type> <model_name> <model_id> [sd_id] [phase] [session_id]
 *
 * Called by hooks or sub-agent execution framework
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get configured model from agent file frontmatter
 */
function getConfiguredModel(subagentType) {
  try {
    // Try project-level first
    const projectPath = path.join(__dirname, '..', '.claude', 'agents', `${subagentType}.md`);
    let content = null;

    if (fs.existsSync(projectPath)) {
      content = fs.readFileSync(projectPath, 'utf8');
    } else {
      // Try user-level
      const userPath = path.join(process.env.HOME, '.claude', 'agents', `${subagentType}.md`);
      if (fs.existsSync(userPath)) {
        content = fs.readFileSync(userPath, 'utf8');
      }
    }

    if (content) {
      // Parse YAML frontmatter
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        const frontmatter = match[1];
        const modelMatch = frontmatter.match(/^model:\s*(\w+)/m);
        if (modelMatch) {
          return modelMatch[1].toLowerCase();
        }
      }
    }

    return null;
  } catch (err) {
    console.error('Error reading agent config:', err.message);
    return null;
  }
}

/**
 * Compute if config matches reported model
 */
function computeConfigMatch(configuredModel, reportedModelId) {
  if (!configuredModel || !reportedModelId) return null;

  const configLower = configuredModel.toLowerCase();
  const reportedLower = reportedModelId.toLowerCase();

  if (configLower === 'sonnet' && reportedLower.includes('sonnet')) return true;
  if (configLower === 'opus' && reportedLower.includes('opus')) return true;
  if (configLower === 'haiku' && reportedLower.includes('haiku')) return true;

  return false;
}

/**
 * Log model usage to database
 */
async function logModelUsage(data) {
  const supabase = await createSupabaseServiceClient('engineer');

  const configMatches = computeConfigMatch(data.configuredModel, data.modelId);

  const record = {
    session_id: data.sessionId || null,
    sd_id: data.sdId || null,
    phase: data.phase || 'UNKNOWN',
    subagent_type: data.subagentType,
    subagent_configured_model: data.configuredModel,
    reported_model_name: data.modelName,
    reported_model_id: data.modelId,
    config_matches_reported: configMatches,
    metadata: data.metadata || {}
  };

  const { data: result, error } = await supabase
    .from('model_usage_log')
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('Failed to log model usage:', error.message);
    return null;
  }

  return result;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('Usage: track-model-usage.js <subagent_type> <model_name> <model_id> [sd_id] [phase] [session_id]');
    console.log('');
    console.log('Example:');
    console.log('  track-model-usage.js testing-agent "Sonnet 4.5" claude-sonnet-4-5-20250929 SD-TEST-001 EXEC session_abc123');
    process.exit(1);
  }

  const [subagentType, modelName, modelId, sdId, phase, sessionId] = args;

  // Get configured model from agent file
  const configuredModel = getConfiguredModel(subagentType);

  console.log('📊 Logging model usage:');
  console.log(`   Sub-agent: ${subagentType}`);
  console.log(`   Configured: ${configuredModel || 'unknown'}`);
  console.log(`   Reported: ${modelName} (${modelId})`);
  console.log(`   SD: ${sdId || 'none'}, Phase: ${phase || 'unknown'}`);

  const result = await logModelUsage({
    subagentType,
    modelName,
    modelId,
    configuredModel,
    sdId: sdId || null,
    phase: phase || null,
    sessionId: sessionId || null
  });

  if (result) {
    console.log(`   ✅ Logged with ID: ${result.id}`);

    // Check for mismatch
    if (result.config_matches_reported === false) {
      console.log(`   ⚠️  WARNING: Config mismatch! Expected ${configuredModel}, got ${modelId}`);
    }
  }
}

// Export for use as module
export { logModelUsage, getConfiguredModel };

// Run if executed directly
main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
