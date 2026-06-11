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
 * SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001 (FR-4): best-effort token attribution
 * for the sub-agent stamp seam. The CLI captured model identity only, so every
 * sub-agent row landed with zero tokens (28/28 Opus rows token-less, 12h probe)
 * and per-arm cost comparison was impossible. Source: the invoking sub-agent's
 * own transcript JSONL (agent-*.jsonl in the session's Claude Code project dir,
 * most recently modified within a freshness window — the invoker is by far the
 * most likely writer). Fail-soft: any error returns null and the row logs as
 * before. Reuses the effort-experiment JSONL reader (sumUsageInWindow).
 */
async function attributeAgentTokens() {
  try {
    const { defaultTranscriptDir, sumUsageInWindow } = await import('./effort-experiment/attribute-tokens.mjs');
    const dir = defaultTranscriptDir();
    if (!fs.existsSync(dir)) return null;
    const FRESH_MS = 30 * 60_000;
    const now = Date.now();
    let best = null;
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith('agent-') || !name.endsWith('.jsonl')) continue;
      const full = path.join(dir, name);
      const mtime = fs.statSync(full).mtimeMs;
      if (now - mtime > FRESH_MS) continue;
      if (!best || mtime > best.mtime) best = { full, name, mtime };
    }
    if (!best) return null;
    const { totals, turns } = await sumUsageInWindow(best.full); // whole file = this agent's own run
    if (!turns) return null;
    return {
      input_tokens: totals.input_tokens + totals.cache_creation_input_tokens + totals.cache_read_input_tokens,
      output_tokens: totals.output_tokens,
      tokens_source: 'agent_transcript_jsonl',
      tokens_transcript: best.name,
      tokens_turns: turns
    };
  } catch {
    return null; // fail-soft — identity logging must never break on attribution
  }
}

/**
 * Log model usage to database
 */
async function logModelUsage(data) {
  const supabase = await createSupabaseServiceClient('engineer');

  const configMatches = computeConfigMatch(data.configuredModel, data.modelId);

  // FR-4: explicit tokens (data.inputTokens/outputTokens) win; otherwise attempt
  // transcript attribution; otherwise log identity-only as before.
  let tokenMeta = {};
  if (Number.isFinite(data.inputTokens) || Number.isFinite(data.outputTokens)) {
    tokenMeta = {
      input_tokens: Number(data.inputTokens) || 0,
      output_tokens: Number(data.outputTokens) || 0,
      tokens_source: 'caller'
    };
  } else {
    tokenMeta = (await attributeAgentTokens()) || {};
  }

  const record = {
    session_id: data.sessionId || null,
    sd_id: data.sdId || null,
    phase: data.phase || 'UNKNOWN',
    subagent_type: data.subagentType,
    subagent_configured_model: data.configuredModel,
    reported_model_name: data.modelName,
    reported_model_id: data.modelId,
    config_matches_reported: configMatches,
    metadata: { ...(data.metadata || {}), ...tokenMeta }
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

  // FR-4: optional --input-tokens N / --output-tokens N (extracted before positionals)
  const takeFlag = (name) => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const v = Number(args[i + 1]);
    args.splice(i, 2);
    return Number.isFinite(v) ? v : undefined;
  };
  const inputTokens = takeFlag('--input-tokens');
  const outputTokens = takeFlag('--output-tokens');

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
    sessionId: sessionId || null,
    inputTokens,
    outputTokens
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
