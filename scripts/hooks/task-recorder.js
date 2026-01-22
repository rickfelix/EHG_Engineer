#!/usr/bin/env node
/**
 * PreToolUse Hook: Task Sub-Agent Recording
 *
 * LEO Protocol v4.4.3
 * SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-HARDENING-001 (FR-3)
 *
 * Records all Task tool invocations with subagent_type to the database
 * for stop-hook enforcement visibility.
 *
 * Environment variables used:
 * - CLAUDE_TOOL_INPUT: JSON input to the Task tool
 * - SUPABASE_URL: Database URL
 * - SUPABASE_SERVICE_ROLE_KEY: Database key
 *
 * Exit codes:
 *   0 - Recording successful or not applicable
 *   0 - Recording failed (non-blocking, just logs)
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Load environment
dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function main() {
  try {
    // 1. Get the tool input from environment
    const toolInput = process.env.CLAUDE_TOOL_INPUT;

    if (!toolInput) {
      // No input - nothing to record
      process.exit(0);
    }

    // 2. Parse the input
    let input;
    try {
      input = JSON.parse(toolInput);
    } catch (_parseErr) {
      // Not JSON - not a Task call we care about
      process.exit(0);
    }

    // 3. Check if this is a sub-agent Task call
    const subagentType = input.subagent_type;
    if (!subagentType) {
      // No subagent_type - not a sub-agent invocation
      process.exit(0);
    }

    // 4. Connect to database
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error('[task-recorder] Missing database credentials');
      process.exit(0); // Don't block if no credentials
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 5. Detect current SD from git branch
    let sdId = null;
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
      // Pattern: SD-XXX-YYY-001 or feat/SD-XXX-YYY-001 etc
      const sdMatch = branch.match(/SD-[A-Z]+-(?:[A-Z]+-)*\d+/i);
      if (sdMatch) {
        const sdKey = sdMatch[0].toUpperCase();
        // Look up UUID from sd_key
        const { data: sd } = await supabase
          .from('strategic_directives_v2')
          .select('id')
          .eq('sd_key', sdKey)
          .single();
        if (sd) {
          sdId = sd.id;
        }
      }
    } catch (_gitError) {
      // Can't detect SD - continue without it
    }

    // 6. Detect current phase (heuristic based on context)
    // This could be improved with more context
    const phase = process.env.CLAUDE_CURRENT_PHASE || 'unknown';

    // 7. Record to subagent_activations
    const record = {
      sd_id: sdId,
      phase: phase,
      agent_type: subagentType.toUpperCase(),
      triggered_by: 'Task tool invocation',
      activation_time: new Date().toISOString(),
      context: {
        description: input.description || input.prompt?.substring(0, 100) || 'Task invocation',
        model: input.model || 'default',
        recorded_by: 'task-recorder-hook'
      }
    };

    const { error } = await supabase
      .from('subagent_activations')
      .insert(record);

    if (error) {
      // Log but don't block
      console.error(`[task-recorder] Failed to record: ${error.message}`);
    }

    // Success - exit cleanly
    process.exit(0);

  } catch (err) {
    // Any error - log but don't block
    console.error(`[task-recorder] Error: ${err.message}`);
    process.exit(0);
  }
}

main();
