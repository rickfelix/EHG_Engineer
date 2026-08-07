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
import { createRequire } from 'module';

// SD-LEO-INFRA-SHIP-AUTO-HANDOFF-001 (FR-3): the hold SSOT lives in a CommonJS module, so it is
// pulled in via createRequire rather than re-implemented on this side of the boundary. Re-stating
// the hold vocabulary here is exactly the second fence-reader FR-3 forbids — a copy drifts the
// first time either side learns a new hold key, and the drift is silent because both halves keep
// returning plausible answers.
const { resolveHoldProvenance, formatHoldProvenance } = createRequire(import.meta.url)('../lib/fleet/claim-eligibility.cjs');

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
//
// SD-LEO-INFRA-SHIP-AUTO-HANDOFF-001 (FR-1): `metadata` is now read so a RECORDED HOLD can refuse
// the chain. Previously this function could not see holds at all, so /ship step 6.5 would drive an
// SD that TESTING and VALIDATION had deliberately fenced at LEAD_FINAL straight through to
// completed — and NO GATE WOULD HAVE FAILED, because each handoff is legitimately satisfied on its
// own terms. The SD simply ARRIVES at completed with the work undelivered, and `completed` is
// affirmatively excluded from every sweep, so nothing downstream can ever detect it.
//
// The only thing that previously prevented this was a worker happening to know
// LEO_AUTOHANDOFF_ENABLED=false exists. Safety that depends on the operator already knowing the
// escape hatch is not safety, so the default is inverted: held SDs are refused unless something
// says otherwise, rather than advanced unless someone opts out.
//
// Stays PURE — metadata is passed in by the caller that already fetched the row, and
// resolveHoldProvenance is itself pure over metadata. That purity is what keeps FR-4's regression
// test a plain unit test with no database, no merge and no spawn.
export function classifyState({ status, current_phase, metadata }) {
  if (status === 'completed' || current_phase === 'LEAD-FINAL-APPROVAL') {
    return { action: 'idempotent_skip', reason: 'already_completed_no_op' };
  }
  // Checked BEFORE the advance decision and after the no-op check: an already-completed SD has
  // nothing to refuse, but everything still in flight must be tested for a hold first so the
  // refusal reason is the informative one rather than a generic phase skip.
  //
  // FR-3: resolveHoldProvenance is reused verbatim — it is described in its own source as "the SSOT
  // coalescer for the ad-hoc hold-reason keys". Deliberately NOT classifyDispatchIneligibility:
  // that answers "may a worker CLAIM this?", a different question. claim-eligibility.cjs:187
  // records that metadata.exec_boundary_hold is claim-ALLOWING by design, so the claim verdict is
  // blind to at least one real hold, and axes like orchestrator_parent say nothing about whether a
  // built SD should be completed. Aliasing it would import the wrong question.
  const hold = resolveHoldProvenance(metadata);
  if (hold && hold.reason) {
    return { action: 'refuse_held', reason: 'sd_on_hold', hold };
  }
  if (current_phase === 'LEAD' && status === 'draft') {
    return { action: 'warn_skip', reason: 'no_exec_work_to_advance' };
  }
  if (['EXEC', 'PLAN_PRD', 'PLAN', 'PLAN_VERIFICATION'].includes(current_phase)) {
    return { action: 'advance', reason: 'ready_for_handoff_chain' };
  }
  return { action: 'warn_skip', reason: `unexpected_phase_${current_phase}_status_${status}` };
}

function defaultRunner(cmd, args, opts = {}) {
  const env = opts.env || process.env;
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'], env });
  return { exitCode: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/**
 * Derive an active session_id from a merged-branch name when CLAUDE_SESSION_ID is missing.
 *
 * SD-LEO-INFRA-POST-MERGE-AUTO-001 FR-2: replaces the lines 52-54 hard-fail with a
 * unique-active-session lookup, falling back to fail-loud-when-ambiguous.
 *
 * Resolution rules (LEAD decision D4):
 *   - count == 1                                      → return session_id
 *   - count == 0                                      → exit 2 (no_active_session_for_branch)
 *   - count >= 2, top.heartbeat_at - next > 2 seconds → return top.session_id (warn)
 *   - count >= 2, within ±2s                          → exit 2 (ambiguous_concurrent_sessions)
 *
 * Status filter (status='active') and 60s heartbeat freshness window prevent SIGKILLed
 * sessions from impersonating dead workers (risk-agent NEW-RISK-1+2 mitigation).
 */
export async function deriveSessionFromBranch(supabase, mergedBranch) {
  const STALE_HEARTBEAT_SEC = 60;
  const TIE_BREAK_MS = 2000;
  const cutoff = new Date(Date.now() - STALE_HEARTBEAT_SEC * 1000).toISOString();

  const { data, error } = await supabase
    .from('claude_sessions')
    .select('session_id, heartbeat_at')
    .eq('current_branch', mergedBranch)
    .is('released_at', null)
    .eq('status', 'active')
    .gt('heartbeat_at', cutoff)
    .order('heartbeat_at', { ascending: false })
    .limit(2);

  if (error) {
    return { ok: false, reason: 'db_query_failed', detail: error.message };
  }

  const rows = data || [];
  if (rows.length === 0) {
    return { ok: false, reason: 'no_active_session_for_branch', merged_branch: mergedBranch };
  }
  if (rows.length === 1) {
    return { ok: true, session_id: rows[0].session_id, source: 'unique_match' };
  }
  const topMs = new Date(rows[0].heartbeat_at).getTime();
  const nextMs = new Date(rows[1].heartbeat_at).getTime();
  if (topMs - nextMs > TIE_BREAK_MS) {
    return { ok: true, session_id: rows[0].session_id, source: 'most_recent_heartbeat_warn', heartbeat_delta_ms: topMs - nextMs };
  }
  return { ok: false, reason: 'ambiguous_concurrent_sessions', heartbeat_delta_ms: topMs - nextMs };
}

// Orchestrator with injectable supabase + runner for tests.
export async function runOrchestrator({ sdKey, supabase, runner = defaultRunner, env = process.env, mergedBranch = null }) {
  // SD-LEO-INFRA-POST-MERGE-AUTO-001 FR-2: env CLAUDE_SESSION_ID still wins;
  // --merged-branch DB-derive is the unique-match fallback.
  let resolvedSession = env.CLAUDE_SESSION_ID;
  let sessionSource = resolvedSession ? 'env' : null;
  if (!resolvedSession && mergedBranch) {
    const derived = await deriveSessionFromBranch(supabase, mergedBranch);
    if (derived.ok) {
      resolvedSession = derived.session_id;
      sessionSource = derived.source;
      logEvent({ event: 'session_derived', sd_key: sdKey, merged_branch: mergedBranch, source: derived.source, session_id: resolvedSession });
    } else {
      logEvent({ event: 'orchestrator_end', sd_key: sdKey, status: 'session_derive_failed', reason: derived.reason, merged_branch: mergedBranch, exit_code: 2 });
      return { exitCode: 2, error: `deriveSessionFromBranch: ${derived.reason}`, step: 'preflight', detail: derived };
    }
  }
  if (!resolvedSession) {
    logEvent({ event: 'orchestrator_end', sd_key: sdKey, status: 'no_session', exit_code: 2 });
    return { exitCode: 2, error: 'CLAUDE_SESSION_ID required for handoff claim validity (no env, no --merged-branch)', step: 'preflight' };
  }
  // Propagate the resolved session into the env for downstream subprocesses.
  env = { ...env, CLAUDE_SESSION_ID: resolvedSession };
  logEvent({ event: 'orchestrator_start', sd_key: sdKey, session_source: sessionSource });
  const startTs = Date.now();

  const { data: sd, error: lookupErr } = await supabase
    .from('strategic_directives_v2')
    // FR-1: metadata is REQUIRED here — classifyState cannot see a hold that was never fetched,
    // and an unselected column arrives as undefined rather than as an error, so omitting it would
    // silently restore the old advance-everything behaviour with every test still green.
    .select('status, current_phase, sd_key, metadata')
    .eq('sd_key', sdKey)
    .maybeSingle();
  if (lookupErr || !sd) {
    logEvent({ event: 'orchestrator_end', sd_key: sdKey, status: 'sd_not_found', exit_code: 3 });
    return { exitCode: 3, error: `SD ${sdKey} not found`, step: 'preflight' };
  }

  const decision = classifyState(sd);

  // SD-LEO-INFRA-SHIP-AUTO-HANDOFF-001 (FR-2): a refusal is NOT an idempotent skip and must not be
  // reported as one. Every non-advance action previously logged 'idempotent_skip' and returned
  // exitCode 0 — so a fenced SD would have been recorded as a routine no-op and reported success to
  // /ship. A refusal gets its own event and its own exit code precisely so the caller can tell
  // "refused because held" from "nothing to do" and from "the chain broke".
  //
  // It RENDERS the holder and the release condition rather than failing silently: a silent no-op
  // teaches the operator nothing and is indistinguishable from a bug, which is how the escape-hatch
  // flag came to be the only thing anyone knew about.
  if (decision.action === 'refuse_held') {
    const h = decision.hold || {};
    logEvent({
      event: 'refused_held', sd_key: sdKey, reason: decision.reason,
      hold_reason: h.reason, hold_set_by: h.set_by, hold_source_key: h.source_key,
    });
    console.error(`⛔ REFUSED: ${sdKey} carries a recorded hold — auto-handoff will not advance it.`);
    console.error(`   ${typeof formatHoldProvenance === 'function' ? formatHoldProvenance(h) : h.reason}`);
    console.error('   The hold must be released by the party that set it; this is not a bug and');
    console.error('   LEO_AUTOHANDOFF_ENABLED=false is not the remedy — the fence is doing its job.');
    return { exitCode: 5, action: decision.action, reason: decision.reason, hold: h };
  }

  if (decision.action !== 'advance') {
    logEvent({ event: 'idempotent_skip', sd_key: sdKey, reason: decision.reason, action: decision.action });
    return { exitCode: 0, action: decision.action, reason: decision.reason };
  }

  for (const handoff of HANDOFF_CHAIN) {
    const subagent = SUBAGENT_FOR[handoff];
    if (subagent) {
      const subStart = Date.now();
      logEvent({ event: 'subagent_start', sd_key: sdKey, subagent, phase: handoff });
      const sub = runner('node', ['lib/sub-agent-executor.js', subagent, sdKey], { env });
      logEvent({ event: 'subagent_end', sd_key: sdKey, subagent, exit_code: sub.exitCode, duration_ms: Date.now() - subStart });
      if (sub.exitCode !== 0) {
        logEvent({ event: 'orchestrator_end', sd_key: sdKey, status: 'subagent_failed', step: handoff, exit_code: 4 });
        return { exitCode: 4, error: `${subagent} sub-agent failed before ${handoff}`, step: handoff, stderr: sub.stderr };
      }
    }
    const hStart = Date.now();
    logEvent({ event: 'handoff_start', sd_key: sdKey, handoff });
    const h = runner('node', ['scripts/handoff.js', 'execute', handoff, sdKey], { env });
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
  const mergedBranchArg = process.argv.find(a => a.startsWith('--merged-branch='));
  if (!sdKeyArg) {
    process.stderr.write('Usage: post-merge-handoff-orchestrator.js --sd-key=<SD-KEY> [--merged-branch=<branch>]\n');
    process.exit(1);
  }
  const sdKey = sdKeyArg.split('=')[1];
  const mergedBranch = mergedBranchArg ? mergedBranchArg.split('=')[1] : null;
  const { createSupabaseServiceClient } = await import('../lib/supabase-connection.js');
  const supabase = await createSupabaseServiceClient();
  const result = await runOrchestrator({ sdKey, supabase, mergedBranch });
  process.exit(result.exitCode);
}
