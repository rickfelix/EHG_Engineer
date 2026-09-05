#!/usr/bin/env node
/**
 * PreToolUse Hook: Task Sub-Agent Recording
 *
 * LEO Protocol v4.4.3
 * SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-HARDENING-001 (FR-3)
 *
 * Records all Task/Agent tool invocations with subagent_type to the database
 * for stop-hook enforcement visibility.
 *
 * SD-LEO-INFRA-RESTORE-AGENT-TOOL-001: this hook had NEVER recorded a live row -- it read
 * process.env.CLAUDE_TOOL_INPUT, which the verified PostToolUse/PreToolUse hook contract
 * (scripts/hooks/__tests__/session-id-propagation-canary.test.js:29-30) confirms is NOT
 * propagated to hooks. Input now arrives on stdin as the PreToolUse JSON payload, matching the
 * verified contract (and the same channel task-subagent-recorder.cjs already reads).
 *
 * Environment variables used:
 * - SUPABASE_URL: Database URL
 * - SUPABASE_SERVICE_ROLE_KEY: Database key
 *
 * Exit codes:
 *   0 - Recording successful or not applicable
 *   0 - Recording failed (non-blocking, just logs)
 */

import { createClient } from '@supabase/supabase-js';
import { drainAndExit } from '../../lib/hooks/drain-undici.cjs'; // QF-20260719-890: drain before post-fetch exits
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

/**
 * Read the PreToolUse hook's stdin payload (SD-LEO-INFRA-RESTORE-AGENT-TOOL-001).
 * process.env.CLAUDE_TOOL_INPUT is NOT propagated to hooks (verified contract,
 * scripts/hooks/__tests__/session-id-propagation-canary.test.js:29-30) -- the real input
 * arrives as JSON on stdin, the same channel task-subagent-recorder.cjs already reads.
 * @returns {Promise<string>}
 */
// SD-LEO-INFRA-RESTORE-AGENT-TOOL-001: subagent_activations.activating_agent and .phase both
// carry CHECK constraints (database/schema-reference-snapshot.json --
// subagent_activations_activating_agent_check: LEAD|PLAN|EXEC only;
// subagent_activations_phase_check: planning|implementation|verification only). The PREVIOUS
// code wrote a free-text hook name and process.env.CLAUDE_CURRENT_PHASE||'unknown' -- both would
// have violated these constraints on every insert, a SECOND independent reason this hook had
// never written a live row (verified empirically: fixing only the stdin bug produced a real,
// different insert failure on first live attempt). Both are derived from the SD's own
// current_phase instead, grounded in the live, paginated distribution of every value that column
// actually takes (CANCELLED/COMPLETED/EXEC/EXEC_COMPLETE/LEAD/LEAD_APPROVAL/LEAD_COMPLETE/
// LEAD_FINAL/LEAD_FINAL_APPROVAL/PLAN_PRD/PLAN_VERIFICATION, measured 2026-09-05). Terminal
// phases (CANCELLED/COMPLETED) and anything unrecognized map to null -- the caller skips the
// insert entirely rather than guess and risk a constraint violation.
const CURRENT_PHASE_TO_ACTIVATING_AGENT = Object.freeze({
  LEAD: 'LEAD', LEAD_APPROVAL: 'LEAD', LEAD_COMPLETE: 'LEAD', LEAD_FINAL: 'LEAD', LEAD_FINAL_APPROVAL: 'LEAD',
  PLAN_PRD: 'PLAN', PLAN_VERIFICATION: 'PLAN',
  EXEC: 'EXEC', EXEC_COMPLETE: 'EXEC',
});
const CURRENT_PHASE_TO_PHASE_BUCKET = Object.freeze({
  LEAD: 'planning', LEAD_APPROVAL: 'planning', LEAD_COMPLETE: 'planning', LEAD_FINAL: 'planning', LEAD_FINAL_APPROVAL: 'planning',
  PLAN_PRD: 'planning', PLAN_VERIFICATION: 'verification',
  EXEC: 'implementation', EXEC_COMPLETE: 'implementation',
});

/**
 * Pure: map an SD's current_phase to the subagent_activations.activating_agent CHECK vocabulary,
 * or null when unmappable (terminal/unknown phase) -- the caller must skip the insert on null.
 * @param {string|null} currentPhase
 * @returns {'LEAD'|'PLAN'|'EXEC'|null}
 */
export function mapToActivatingAgent(currentPhase) {
  return CURRENT_PHASE_TO_ACTIVATING_AGENT[currentPhase] ?? null;
}

/**
 * Pure: map an SD's current_phase to the subagent_activations.phase CHECK vocabulary, or null
 * when unmappable.
 * @param {string|null} currentPhase
 * @returns {'planning'|'implementation'|'verification'|null}
 */
export function mapToPhaseBucket(currentPhase) {
  return CURRENT_PHASE_TO_PHASE_BUCKET[currentPhase] ?? null;
}

export function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
    // Safety timeout so a hung stdin never blocks the tool call it is observing.
    setTimeout(() => resolve(data), 4000);
  });
}

/**
 * Pure: builds the subagent_activations record from already-resolved values (exported for unit
 * testing without stdin/DB I/O, mirroring task-subagent-recorder.cjs's buildSubAgentRecord()).
 *
 * SD-LEO-INFRA-RESTORE-AGENT-TOOL-001: the PREVIOUS record shape (agent_type, triggered_by,
 * activation_time, context) named columns that do NOT exist on the live table -- verified live
 * against the real schema (database/schema-reference-snapshot.json's tables.subagent_activations,
 * confirmed column-by-column via direct PostgREST probes): the actual columns are subagent_code,
 * subagent_name, activating_agent, activation_trigger, activation_context, status, activated_at.
 * This was a SECOND, independent defect from the stdin/env-var bug -- fixing stdin alone would
 * still have produced a silent insert failure on every call (confirmed empirically: the pre-fix
 * shape failed with "Could not find the 'activation_time' column ... in the schema cache" the
 * moment stdin reading was corrected and the insert was actually attempted for the first time in
 * this hook's history).
 * @param {{sdId: string, phaseBucket: string, activatingAgent: string, subagentType: string, input: object}} args
 * @returns {object}
 */
export function buildActivationRecord({ sdId, phaseBucket, activatingAgent, subagentType, input }) {
  return {
    sd_id: sdId,
    phase: phaseBucket,
    subagent_code: subagentType.toUpperCase(),
    subagent_name: subagentType.toUpperCase(),
    activating_agent: activatingAgent,
    activation_trigger: 'Task/Agent tool invocation',
    activation_context: {
      description: input.description || input.prompt?.substring(0, 100) || 'Task invocation',
      model: input.model || 'default'
    },
    status: 'activated',
    activated_at: new Date().toISOString()
  };
}

async function main() {
  try {
    // 1. Read the PreToolUse hook payload from stdin (SD-LEO-INFRA-RESTORE-AGENT-TOOL-001 --
    // process.env.CLAUDE_TOOL_INPUT was never propagated, so this hook had never fired from a
    // live tool call in its history).
    const raw = await readStdin();
    if (!raw || !raw.trim()) {
      // No input - nothing to record
      await drainAndExit(0);
      return;
    }

    // 2. Parse the input
    let hookInput;
    try {
      hookInput = JSON.parse(raw);
    } catch (_parseErr) {
      // Not JSON - not a call we care about
      await drainAndExit(0);
      return;
    }

    // 3. The PreToolUse contract carries the tool's arguments under tool_input (verified,
    // session-id-propagation-canary.test.js:25-30) -- subagent_type lives there, not at the
    // top level of the hook payload.
    const input = hookInput.tool_input || {};
    const subagentType = input.subagent_type;
    if (!subagentType) {
      // No subagent_type - not a sub-agent invocation
      await drainAndExit(0);
      return;
    }

    // 4. Connect to database
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error('[task-recorder] Missing database credentials');
      process.exit(0); // Don't block if no credentials
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 5. Detect current SD (and its live current_phase) from git branch
    let sdId = null;
    let currentPhase = null;
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
      // Pattern: SD-XXX-YYY-001 or feat/SD-XXX-YYY-001 etc
      const sdMatch = branch.match(/SD-[A-Z]+-(?:[A-Z]+-)*\d+/i);
      if (sdMatch) {
        const sdKey = sdMatch[0].toUpperCase();
        // Look up UUID + current_phase from sd_key
        const { data: sd } = await supabase
          .from('strategic_directives_v2')
          .select('id, current_phase')
          .eq('sd_key', sdKey)
          .single();
        if (sd) {
          sdId = sd.id;
          currentPhase = sd.current_phase;
        }
      }
    } catch (_gitError) {
      // Can't detect SD - continue without it
    }

    // 6. Map the SD's live current_phase to this table's CHECK-constrained vocabularies
    // (SD-LEO-INFRA-RESTORE-AGENT-TOOL-001). No SD resolved, or a terminal/unmappable phase
    // (CANCELLED/COMPLETED/null) -> skip the insert rather than guess and violate a constraint.
    const activatingAgent = mapToActivatingAgent(currentPhase);
    const phaseBucket = mapToPhaseBucket(currentPhase);
    if (!sdId || !activatingAgent || !phaseBucket) {
      await drainAndExit(0);
      return;
    }

    // 7. Record to subagent_activations
    const record = buildActivationRecord({
      sdId, phaseBucket, activatingAgent, subagentType, input,
    });

    const { error } = await supabase
      .from('subagent_activations')
      .insert(record);

    if (error) {
      // Log but don't block
      console.error(`[task-recorder] Failed to record: ${error.message}`);
    }

    // Success - exit cleanly
    await drainAndExit(0);

  } catch (err) {
    // Any error - log but don't block
    console.error(`[task-recorder] Error: ${err.message}`);
    await drainAndExit(0);
  }
}

// Only run the stdin hook when executed directly — importing this module (unit tests) must not
// block on stdin or touch a live DB (mirrors task-subagent-recorder.cjs's require.main guard).
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${(process.argv[1] || '').replace(/\\/g, '/')}`) {
  main();
}
