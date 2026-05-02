#!/usr/bin/env node
/**
 * Post-merge handoff orchestrator (SD-FDBK-ENH-POST-MERGE-AUTO-001)
 *
 * Wires LEO Protocol phase handoffs (EXEC-TO-PLAN, PLAN-TO-LEAD,
 * LEAD-FINAL-APPROVAL) into /ship Step 6.5 after PR merge.
 *
 * Idempotent: re-running on a completed SD is a no-op.
 * Honors GATE_SUBAGENT_EVIDENCE by invoking lib/sub-agent-executor.js
 * for TESTING (before EXEC-TO-PLAN) and RETRO (before PLAN-TO-LEAD).
 */

import { spawnSync } from 'child_process';
import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const LOG_FILE = join(process.cwd(), '.claude', 'post-merge-orchestrator.log');
const HANDOFF_CHAIN = ['EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'];
const SUBAGENT_FOR = { 'EXEC-TO-PLAN': 'TESTING', 'PLAN-TO-LEAD': 'RETRO' };

function logEvent(event) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...event }) + '\n';
  process.stdout.write(line);
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    appendFileSync(LOG_FILE, line);
  } catch { /* log file is best-effort */ }
}

// Classify SD state for routing. Pure function — no side effects.
export function classifyState({ status, current_phase }) {
  if (status === 'completed' || current_phase === 'LEAD-FINAL-APPROVAL') {
    return { action: 'idempotent_skip', reason: 'already_completed_no_op' };
  }
  if (current_phase === 'LEAD' && status === 'draft') {
    return { action: 'warn_skip', reason: 'no_exec_work_to_advance' };
  }
  if (['EXEC', 'PLAN_PRD', 'PLAN', 'PLAN_VERIFICATION'].includes(current_phase)) {
    return { action: 'advance', reason: 'ready_for_handoff_chain' };
  }
  return { action: 'warn_skip', reason: `unexpected_phase_${current_phase}_status_${status}` };
}

function defaultRunner(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'], env: process.env });
  return { exitCode: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// Orchestrator with injectable supabase + runner for tests.
export async function runOrchestrator({ sdKey, supabase, runner = defaultRunner, env = process.env }) {
  if (!env.CLAUDE_SESSION_ID) {
    logEvent({ event: 'orchestrator_end', sd_key: sdKey, status: 'no_session', exit_code: 2 });
    return { exitCode: 2, error: 'CLAUDE_SESSION_ID required for handoff claim validity', step: 'preflight' };
  }
  logEvent({ event: 'orchestrator_start', sd_key: sdKey });
  const startTs = Date.now();

  const { data: sd, error: lookupErr } = await supabase
    .from('strategic_directives_v2')
    .select('status, current_phase, sd_key')
    .eq('sd_key', sdKey)
    .maybeSingle();
  if (lookupErr || !sd) {
    logEvent({ event: 'orchestrator_end', sd_key: sdKey, status: 'sd_not_found', exit_code: 3 });
    return { exitCode: 3, error: `SD ${sdKey} not found`, step: 'preflight' };
  }

  const decision = classifyState(sd);
  if (decision.action !== 'advance') {
    logEvent({ event: 'idempotent_skip', sd_key: sdKey, reason: decision.reason, action: decision.action });
    return { exitCode: 0, action: decision.action, reason: decision.reason };
  }

  for (const handoff of HANDOFF_CHAIN) {
    const subagent = SUBAGENT_FOR[handoff];
    if (subagent) {
      const subStart = Date.now();
      logEvent({ event: 'subagent_start', sd_key: sdKey, subagent, phase: handoff });
      const sub = runner('node', ['lib/sub-agent-executor.js', subagent, sdKey]);
      logEvent({ event: 'subagent_end', sd_key: sdKey, subagent, exit_code: sub.exitCode, duration_ms: Date.now() - subStart });
      if (sub.exitCode !== 0) {
        logEvent({ event: 'orchestrator_end', sd_key: sdKey, status: 'subagent_failed', step: handoff, exit_code: 4 });
        return { exitCode: 4, error: `${subagent} sub-agent failed before ${handoff}`, step: handoff, stderr: sub.stderr };
      }
    }
    const hStart = Date.now();
    logEvent({ event: 'handoff_start', sd_key: sdKey, handoff });
    const h = runner('node', ['scripts/handoff.js', 'execute', handoff, sdKey]);
    logEvent({ event: 'handoff_end', sd_key: sdKey, handoff, exit_code: h.exitCode, duration_ms: Date.now() - hStart });
    if (h.exitCode !== 0) {
      logEvent({ event: 'orchestrator_end', sd_key: sdKey, status: 'handoff_failed', step: handoff, exit_code: 5 });
      return { exitCode: 5, error: `${handoff} failed`, step: handoff, stderr: h.stderr };
    }
  }
  logEvent({ event: 'orchestrator_end', sd_key: sdKey, status: 'success', duration_ms: Date.now() - startTs, exit_code: 0 });
  return { exitCode: 0, action: 'completed' };
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && process.argv[1] === __filename) {
  const sdKeyArg = process.argv.find(a => a.startsWith('--sd-key='));
  if (!sdKeyArg) {
    process.stderr.write('Usage: post-merge-handoff-orchestrator.js --sd-key=<SD-KEY>\n');
    process.exit(1);
  }
  const sdKey = sdKeyArg.split('=')[1];
  const { createSupabaseServiceClient } = await import('../lib/supabase-connection.js');
  const supabase = await createSupabaseServiceClient();
  const result = await runOrchestrator({ sdKey, supabase });
  process.exit(result.exitCode);
}
