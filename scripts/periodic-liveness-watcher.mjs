#!/usr/bin/env node
/**
 * The single watcher-of-watchers (SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001, FR-3/FR-4/FR-5).
 *
 * Iterates every periodic_process_registry row, resolves its last-fired timestamp from its
 * declared liveness_source, and flags OVERDUE/UNVERIFIED/INTENTIONALLY_DOWN/OK. Detection only --
 * remediation stays with the owning role (out of scope by design).
 *
 * 2+-signal rule scope note: the coordinator's binding constraint ("never declare a process dead
 * on ONE signal") targets SESSION liveness false-reads specifically (fleet memory: invocation-
 * driven sessions false-read as dead on one signal) -- so it is applied here ONLY to
 * claude_sessions_heartbeat (role_session) entries, via 3 independent signal fields
 * (heartbeat_at, terminal_id/PID, process_alive_at) reused from lib/fleet/session-liveness.cjs.
 * eva_scheduler_heartbeat (scheduler_round) and self_stamped entries have no equivalent
 * "session might be alive some other way" ambiguity -- a stale round/self-stamp timestamp vs
 * interval*grace is unambiguous ground truth, so those use a direct single-timestamp comparison.
 *
 * Writes its own last-run timestamp to periodic_process_registry.process_key='__watcher_self__'
 * (a self-registered self_stamped row) so a stale watcher is self-evident on the same dashboard
 * surface it renders to -- closing the who-watches-the-watcher recursion via human-visible referent.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { hasFreshHeartbeat, hasTickAlive, hasPidAlive } = require('../lib/fleet/session-liveness.cjs');
import { parseLivenessClasses, partitionRowsByClasses } from '../lib/periodic-liveness/class-split.mjs';
import { resolveOwnerTarget } from '../lib/periodic-liveness/owner-target-resolver.mjs';
import { climbLadder, resetConsecutiveMiss, emitLadderDigest } from '../lib/periodic-liveness/ladder-escalation.mjs';
import { recordPendingDecision, escalateChairmanDecision } from '../lib/chairman/record-pending-decision.mjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const WATCHER_SELF_KEY = '__watcher_self__';
const STATE = Object.freeze({ OK: 'OK', OVERDUE: 'OVERDUE', UNVERIFIED: 'UNVERIFIED', INTENTIONALLY_DOWN: 'INTENTIONALLY_DOWN' });

// SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-A (FR-5/TR-1): class-split invocation — see
// lib/periodic-liveness/class-split.mjs for the venue rationale (CI must never evaluate
// role_session rows; hasPidAlive is host-local).

function overdueThresholdMs(row) {
  return row.expected_interval_seconds * Number(row.grace_multiplier) * 1000;
}

// Adversarial-review finding (PR #5562, WARNING): liveness_source_ref.metadata_filter is stored
// in a jsonb column and was previously spliced unallowlisted into a raw PostgREST .or() filter
// string -- safe today only because RLS restricts writes to service_role and the only writer
// (seed-periodic-process-registry.mjs) hardcodes trusted values, but a jsonb key can legally
// contain commas/dots that would corrupt or extend the filter clause boundary if a future,
// less-careful writer ever populated this column. Allowlist the permitted keys at the point of
// use so this can never become exploitable even if that assumption changes later.
const ALLOWED_METADATA_FILTER_KEYS = new Set(['role', 'is_coordinator']);

async function resolveRoleSession(row) {
  const filter = row.liveness_source_ref?.metadata_filter;
  if (!filter) return { lastFiredAt: null, signals: {}, evaluableCount: 0 };

  const safeEntries = Object.entries(filter).filter(([k]) => ALLOWED_METADATA_FILTER_KEYS.has(k));
  if (safeEntries.length === 0) return { lastFiredAt: null, signals: {}, evaluableCount: 0 };

  const orClauses = safeEntries.map(([k, v]) => `metadata->>${k}.eq.${v}`).join(',');
  const { data, error } = await supabase
    .from('claude_sessions')
    .select('heartbeat_at, terminal_id, tty, process_alive_at, is_alive')
    .or(orClauses)
    .order('heartbeat_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return { lastFiredAt: null, signals: {}, evaluableCount: 0 };

  const nowMs = Date.now();
  const signals = {
    heartbeatFresh: data.heartbeat_at != null ? hasFreshHeartbeat(data, nowMs) : null,
    pidAlive: data.terminal_id != null ? hasPidAlive(data) : null,
    tickAlive: data.process_alive_at != null ? hasTickAlive(data, nowMs) : null,
  };
  const evaluableCount = Object.values(signals).filter((v) => v !== null).length;

  return { lastFiredAt: data.heartbeat_at, signals, evaluableCount };
}

async function resolveSchedulerRound(row) {
  const ref = row.liveness_source_ref || {};
  // eva_scheduler_heartbeat is a singleton-row table -- always resolve against whichever row is
  // CURRENTLY live, never a fixed instance_id (a restart changes instance_id; the registry entry
  // must not become permanently orphaned when that happens -- confirmed live mid-EXEC on this SD).
  const { data, error } = await supabase
    .from('eva_scheduler_heartbeat')
    .select('last_poll_at, metadata')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return { lastFiredAt: null };

  if (ref.column === 'last_poll_at') return { lastFiredAt: data.last_poll_at };

  const epochMs = data.metadata?.[ref.metadata_path]?.[ref.round_key];
  return { lastFiredAt: epochMs ? new Date(epochMs).toISOString() : null };
}

async function evaluateRow(row) {
  if (!row.currently_expected_active) {
    return { process_key: row.process_key, state: STATE.INTENTIONALLY_DOWN };
  }

  let lastFiredAt = row.last_fired_at; // self_stamped default
  let signalNote = null;

  if (row.liveness_source === 'claude_sessions_heartbeat') {
    const resolved = await resolveRoleSession(row);
    lastFiredAt = resolved.lastFiredAt;
    const staleSignals = Object.entries(resolved.signals).filter(([, v]) => v === false).length;
    const freshSignals = Object.entries(resolved.signals).filter(([, v]) => v === true).length;
    // A single FRESH signal is unambiguous positive evidence -- no ambiguity risk in declaring OK
    // (the "insufficient signals" gate below exists to protect the DEATH declaration only; a
    // false-positive-alive is harmless, a false-positive-dead is the fleet's own documented
    // recurring failure mode). Check this BEFORE the evaluable-count gate.
    if (freshSignals > 0) {
      return { process_key: row.process_key, state: STATE.OK, last_fired_at: lastFiredAt };
    }
    if (resolved.evaluableCount < 2) {
      return { process_key: row.process_key, state: STATE.UNVERIFIED, reason: 'fewer_than_2_evaluable_signals', last_fired_at: lastFiredAt };
    }
    // freshSignals===0 is guaranteed here (the freshSignals>0 branch above already returned), and
    // evaluableCount>=2 is guaranteed here too -- so staleSignals (evaluableCount - freshSignals)
    // is always >=2 at this point. There is no reachable "signals disagree" state with this
    // 3-signal model (adversarial review, PR #5562 INFO): any single fresh signal short-circuits
    // to OK above before this line is reached.
    signalNote = `${staleSignals} corroborating stale signals`;
  } else if (row.liveness_source === 'eva_scheduler_heartbeat') {
    const resolved = await resolveSchedulerRound(row);
    lastFiredAt = resolved.lastFiredAt;
  }
  // self_stamped: lastFiredAt already = row.last_fired_at

  if (!lastFiredAt) {
    return { process_key: row.process_key, state: STATE.UNVERIFIED, reason: 'no_last_fired_data_available' };
  }

  const ageMs = Date.now() - new Date(lastFiredAt).getTime();
  const state = ageMs > overdueThresholdMs(row) ? STATE.OVERDUE : STATE.OK;
  return { process_key: row.process_key, state, last_fired_at: lastFiredAt, age_ms: ageMs, reason: signalNote };
}

// SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-B (FR-1/FR-2): owner-first routing, resolved via
// owner-target-resolver (coordinator fallback baked in -- never dead-letters). Returns whether
// the insert actually succeeded so the caller can latch last_state/consecutive_miss_count ONLY
// on confirmed success (LEAD risk-agent HIGH finding: the prior unconditional latch silently and
// permanently suppressed retries on a failed insert).
async function emitOverdueSignal(row, evaluation) {
  const ownerTarget = await resolveOwnerTarget(supabase, row.owner);

  const { error } = await supabase.from('session_coordination').insert({
    message_type: 'INFO',
    target_session: ownerTarget.target,
    subject: `[PERIODIC-LIVENESS] ${row.display_name || row.process_key} is OVERDUE`,
    sender_type: 'periodic-liveness-watcher',
    payload: {
      kind: 'periodic_liveness_flag',
      process_key: row.process_key,
      display_name: row.display_name,
      owner: row.owner,
      resolved_target_kind: ownerTarget.kind,
      state: 'OVERDUE',
      last_fired_at: evaluation.last_fired_at,
      age_ms: evaluation.age_ms,
    },
  });

  return { emitted: !error, error: error || null, ownerTarget };
}

async function main() {
  const { data: rows, error } = await supabase.from('periodic_process_registry').select('*').neq('process_key', WATCHER_SELF_KEY);
  if (error) throw new Error(`registry query failed: ${error.message}`);

  const classes = parseLivenessClasses(process.env.LIVENESS_CLASSES);
  const { evaluate, skipped } = partitionRowsByClasses(rows || [], classes);
  if (classes) {
    console.log(`[periodic-liveness-watcher] class filter active (${[...classes].join(',')}): evaluating ${evaluate.length}, skipping ${skipped.length} row(s) owned by the other venue`);
  }

  const results = [];
  const ladderCandidates = [];
  for (const row of evaluate) {
    const evaluation = await evaluateRow(row);
    results.push(evaluation);

    // Adversarial-review finding (PR #5562, CRITICAL): dedup must be a per-episode STATE
    // TRANSITION check (row.last_state !== OVERDUE -> OVERDUE), never "has this process_key ever
    // been flagged" -- the latter is a one-shot latch that goes permanently blind to every
    // subsequent recovery-then-relapse, reproducing the exact silent-death failure class this SD
    // exists to prevent. A process that goes OK and later OVERDUE again is correctly re-flagged.
    if (evaluation.state === STATE.OVERDUE && row.last_state !== STATE.OVERDUE) {
      // First miss (fresh transition): owner-first routing (001-B FR-1/FR-2). last_state is
      // latched ONLY on confirmed insert success -- an unconfirmed latch would silently and
      // permanently suppress the retry on the next cycle (risk-agent HIGH finding), since the
      // transition-dedup above would then see no change forever. Deliberately does NOT touch
      // consecutive_miss_count here: that column may not exist yet (chairman-gated migration,
      // FR-3), and bundling it into this update would make the WHOLE statement fail atomically
      // pre-migration, silently breaking the last_state latch too. The ladder's own atomic RPC
      // increment (lib/periodic-liveness/ladder-escalation.mjs) starts counting fresh from NULL
      // on the row's first non-transition OVERDUE tick, which IS the second consecutive miss --
      // no separate seed-to-1 needed here.
      const result = await emitOverdueSignal(row, evaluation);
      if (result.emitted) {
        await supabase
          .from('periodic_process_registry')
          .update({ last_state: evaluation.state })
          .eq('process_key', row.process_key);
      } else {
        console.error(`[periodic-liveness-watcher] emitOverdueSignal insert FAILED for ${row.process_key}: ${result.error?.message} -- last_state NOT advanced, will retry next cycle`);
      }
    } else if (evaluation.state === STATE.OVERDUE) {
      // Still OVERDUE, not a fresh transition: attempt to climb the ladder (001-B FR-3). Fails
      // soft (see lib/periodic-liveness/ladder-escalation.mjs) if the counter migration hasn't
      // landed yet -- owner-first routing above is unaffected either way.
      const ownerTarget = await resolveOwnerTarget(supabase, row.owner);
      const climb = await climbLadder({ supabase, row, ownerTarget });
      if (climb.laddered) ladderCandidates.push({ process_key: row.process_key, display_name: row.display_name });
      await supabase.from('periodic_process_registry').update({ last_state: evaluation.state }).eq('process_key', row.process_key);
    } else {
      if (evaluation.state === STATE.OK) await resetConsecutiveMiss(supabase, row.process_key);
      await supabase.from('periodic_process_registry').update({ last_state: evaluation.state }).eq('process_key', row.process_key);
    }
  }

  // One ladder digest decision per TICK (001-B FR-3), regardless of how many rows laddered --
  // closes the per-process chairman-flood finding (risk-agent HIGH).
  if (ladderCandidates.length > 0) {
    await emitLadderDigest(supabase, ladderCandidates, { recordPending: recordPendingDecision, escalate: escalateChairmanDecision });
  }

  // Self-liveness: upsert the watcher's own last-run row (self_stamped, session_bound=false).
  await supabase.from('periodic_process_registry').upsert({
    process_key: WATCHER_SELF_KEY,
    display_name: 'periodic-liveness-watcher (self)',
    // FR-6 (-001-A): the watchdog's own row is owned by an addressable agent (coordinator interim
    // per the reassignment worklist), not by its own self-label — a dead watcher must escalate to
    // someone who can restart it, not to itself.
    owner: 'coordinator-fleet',
    process_type: 'standalone_cron',
    expected_interval_seconds: 900,
    liveness_source: 'self_stamped',
    session_bound: false,
    currently_expected_active: true,
    last_fired_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'process_key' });

  const summary = results.reduce((acc, r) => { acc[r.state] = (acc[r.state] || 0) + 1; return acc; }, {});
  console.log(`[periodic-liveness-watcher] evaluated ${results.length} process(es): ${JSON.stringify(summary)}`);
  for (const r of results) {
    if (r.state !== STATE.OK) console.log(`  ${r.state.padEnd(18)} ${r.process_key}${r.reason ? ` (${r.reason})` : ''}`);
  }

  return results;
}

// Only auto-run when invoked directly (not when imported by tests/dashboard).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`[periodic-liveness-watcher] FAILED: ${err.message}`);
    process.exit(1);
  });
}

export { main as runWatcher, evaluateRow, emitOverdueSignal, STATE };
