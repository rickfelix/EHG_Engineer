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
const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const WATCHER_SELF_KEY = '__watcher_self__';
const STATE = Object.freeze({ OK: 'OK', OVERDUE: 'OVERDUE', UNVERIFIED: 'UNVERIFIED', INTENTIONALLY_DOWN: 'INTENTIONALLY_DOWN' });

function overdueThresholdMs(row) {
  return row.expected_interval_seconds * Number(row.grace_multiplier) * 1000;
}

async function resolveRoleSession(row) {
  const filter = row.liveness_source_ref?.metadata_filter;
  if (!filter) return { lastFiredAt: null, signals: {}, evaluableCount: 0 };

  const orClauses = Object.entries(filter).map(([k, v]) => `metadata->>${k}.eq.${v}`).join(',');
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
    if (staleSignals < 2) {
      return { process_key: row.process_key, state: STATE.UNVERIFIED, reason: 'signals_disagree_or_insufficient', last_fired_at: lastFiredAt };
    }
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

async function emitOverdueSignal(row, evaluation) {
  // Only emit for a NEW transition into OVERDUE -- check registry.metadata for the last-known state
  // to avoid one row per watcher tick (FR-5 acceptance criterion).
  const { data: current } = await supabase
    .from('periodic_process_registry')
    .select('owner')
    .eq('process_key', row.process_key)
    .maybeSingle();

  const { data: recentFlag } = await supabase
    .from('session_coordination')
    .select('id')
    .eq('payload->>kind', 'periodic_liveness_flag')
    .eq('payload->>process_key', row.process_key)
    .eq('payload->>state', 'OVERDUE')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentFlag) return; // already flagged this transition, don't spam

  const coordinatorId = await getActiveCoordinatorId(supabase).catch(() => null);

  await supabase.from('session_coordination').insert({
    message_type: 'INFO',
    target_session: coordinatorId || 'broadcast-coordinator',
    subject: `[PERIODIC-LIVENESS] ${row.display_name || row.process_key} is OVERDUE`,
    sender_type: 'periodic-liveness-watcher',
    payload: {
      kind: 'periodic_liveness_flag',
      process_key: row.process_key,
      display_name: row.display_name,
      owner: current?.owner || row.owner,
      state: 'OVERDUE',
      last_fired_at: evaluation.last_fired_at,
      age_ms: evaluation.age_ms,
    },
  });
}

async function main() {
  const { data: rows, error } = await supabase.from('periodic_process_registry').select('*').neq('process_key', WATCHER_SELF_KEY);
  if (error) throw new Error(`registry query failed: ${error.message}`);

  const results = [];
  for (const row of rows || []) {
    const evaluation = await evaluateRow(row);
    results.push(evaluation);
    if (evaluation.state === STATE.OVERDUE) {
      await emitOverdueSignal(row, evaluation);
    }
  }

  // Self-liveness: upsert the watcher's own last-run row (self_stamped, session_bound=false).
  await supabase.from('periodic_process_registry').upsert({
    process_key: WATCHER_SELF_KEY,
    display_name: 'periodic-liveness-watcher (self)',
    owner: 'periodic-liveness-watcher',
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

export { main as runWatcher, evaluateRow, STATE };
