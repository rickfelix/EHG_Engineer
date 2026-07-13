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
import { fetchScheduledRuns, latestRunPerWorkflow, classifyGhaCronRows } from '../lib/periodic-liveness/gha-run-resolver.mjs';
import { stampFromGithubActionsRun, stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';
import { resolveGitHubRepo } from '../lib/repo-paths.js';

const UNVERIFIED_ESCALATION_MS = 7 * 24 * 60 * 60 * 1000; // FR-5: >7 continuous days

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

async function evaluateRow(row, ctx = {}) {
  if (!row.currently_expected_active) {
    return { process_key: row.process_key, state: STATE.INTENTIONALLY_DOWN };
  }

  let lastFiredAt = row.last_fired_at; // self_stamped default
  let signalNote = null;

  if (row.liveness_source === 'github_actions_api') {
    // FR-2: pre-resolved once per watcher run (see main()) -- a per-row live API call here
    // would multiply GitHub API calls by row count instead of one paginated fetch per cycle.
    const decision = ctx.ghaDecisions?.get(row.process_key);
    if (!decision || decision.decision === 'no_data') {
      // No run data resolvable this cycle (fetch failed, token missing, or genuinely no runs
      // found for this workflow) -- degrade to today's exact state (UNVERIFIED), never a false
      // OVERDUE/OK alarm (FR-2 acceptance criteria).
      return { process_key: row.process_key, state: STATE.UNVERIFIED, reason: 'no_gha_run_data_available' };
    }
    if (decision.decision === 'overdue') {
      // Latest SCHEDULED run failed -- as dead as a missing one (FR-2 acceptance criteria).
      return { process_key: row.process_key, state: STATE.OVERDUE, last_fired_at: decision.ranAtIso, reason: 'latest_scheduled_run_failed' };
    }
    lastFiredAt = decision.ranAtIso;
  } else if (row.liveness_source === 'claude_sessions_heartbeat') {
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

// FR-5: escalate a row that has been continuously UNVERIFIED for >7 days, the same way an
// OVERDUE row is escalated. Mirrors emitOverdueSignal's owner-first routing shape.
async function emitPersistentUnverifiedSignal(row) {
  const ownerTarget = await resolveOwnerTarget(supabase, row.owner);

  const { error } = await supabase.from('session_coordination').insert({
    message_type: 'INFO',
    target_session: ownerTarget.target,
    subject: `[PERIODIC-LIVENESS] ${row.display_name || row.process_key} has been UNVERIFIED for over 7 days`,
    sender_type: 'periodic-liveness-watcher',
    payload: {
      kind: 'periodic_liveness_flag',
      process_key: row.process_key,
      display_name: row.display_name,
      owner: row.owner,
      resolved_target_kind: ownerTarget.kind,
      state: 'UNVERIFIED',
      last_state_changed_at: row.last_state_changed_at,
    },
  });

  return { emitted: !error, error: error || null, ownerTarget };
}

// FR-5: fires ONLY on the tick where the row's continuous-UNVERIFIED age first crosses the
// 7-day threshold -- a per-episode dedup, analogous to the OVERDUE transition check above, but
// UNVERIFIED doesn't transition state at the crossing point (it was already UNVERIFIED and stays
// UNVERIFIED), so last_state alone can't detect it. Uses last_state_changed_at (the anchor, only
// advanced on a genuine state transition -- FR-1) plus the row's own pre-update updated_at
// (bumped every prior cycle regardless of state, so it stands in for "the last tick's time") to
// detect the boundary crossing without a dedicated "already escalated" column.
export function hasCrossedUnverifiedThreshold(row, nowMs) {
  if (!row.last_state_changed_at) return false;
  const changedAtMs = new Date(row.last_state_changed_at).getTime();
  const ageMs = nowMs - changedAtMs;
  if (ageMs <= UNVERIFIED_ESCALATION_MS) return false;
  if (!row.updated_at) return true; // no prior tick recorded -- treat as a fresh crossing
  const previousTickMs = new Date(row.updated_at).getTime();
  return (previousTickMs - changedAtMs) <= UNVERIFIED_ESCALATION_MS;
}

// FR-1/FR-5: last_state_changed_at only advances on a genuine last_state transition, mirroring
// the last_state column's own per-episode dedup discipline (PR #5562) -- never reaffirmed on a
// same-state cycle (TS-8). Kept as its OWN independently fail-soft update, NOT bundled into the
// primary last_state write below -- adversarial-review finding on this SD's own EXEC-TO-PLAN
// evidence (FINDING-1): this code can merge before FR-1's migration is applied out-of-band, so
// last_state_changed_at may not exist yet; bundling it into the same statement as last_state
// would make the WHOLE update fail atomically pre-migration, silently breaking last_state's own
// advancement too -- exactly the failure class this file already guards against for
// consecutive_miss_count a few lines below (see that comment for the precedent).
async function stampStateChangeAnchor(row, evaluation) {
  if (row.last_state === evaluation.state) return;
  const { error } = await supabase
    .from('periodic_process_registry')
    .update({ last_state_changed_at: new Date().toISOString() }) // schema-lint-disable-line
    .eq('process_key', row.process_key);
  if (error) {
    console.error(`[periodic-liveness-watcher] last_state_changed_at stamp FAILED (non-fatal, likely pre-migration) for ${row.process_key}: ${error.message}`);
  }
}

async function main() {
  const { data: rows, error } = await supabase.from('periodic_process_registry').select('*').neq('process_key', WATCHER_SELF_KEY);
  if (error) throw new Error(`registry query failed: ${error.message}`);

  const classes = parseLivenessClasses(process.env.LIVENESS_CLASSES);
  const { evaluate, skipped } = partitionRowsByClasses(rows || [], classes);
  if (classes) {
    console.log(`[periodic-liveness-watcher] class filter active (${[...classes].join(',')}): evaluating ${evaluate.length}, skipping ${skipped.length} row(s) owned by the other venue`);
  }

  // FR-2: resolve all gha_cron:* rows in ONE paginated GitHub API fetch per watcher cycle (not
  // one call per row), and stamp successes before the per-row evaluation loop below.
  const ghaDecisions = new Map();
  const ghaCronRows = evaluate.filter((r) => r.liveness_source === 'github_actions_api');
  if (ghaCronRows.length > 0) {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    // SD-LEO-INFRA-CANONICAL-REPO-APP-001: resolve via the canonical repo-paths registry rather
    // than a hardcoded literal (lint-repo-resolution-drift enforces this).
    const repo = process.env.GITHUB_REPOSITORY || resolveGitHubRepo('EHG_Engineer');
    if (!token) {
      console.error('[periodic-liveness-watcher] GITHUB_TOKEN/GH_TOKEN missing -- gha_cron rows degrade to UNVERIFIED this cycle');
    } else {
      try {
        const runs = await fetchScheduledRuns(repo, token);
        const latestByFile = latestRunPerWorkflow(runs);
        const classified = classifyGhaCronRows(latestByFile, ghaCronRows.map((r) => r.process_key));
        for (const c of classified) {
          ghaDecisions.set(c.processKey, c);
          if (c.decision === 'stamp') {
            await stampFromGithubActionsRun(supabase, c.processKey, c.ranAtIso);
          }
        }
      } catch (err) {
        // Degrades to today's exact state (rows stay UNVERIFIED, ghaDecisions stays empty) -- no
        // false OVERDUE/OK alarms (FR-2 acceptance criteria).
        console.error(`[periodic-liveness-watcher] GHA resolver FAILED (non-fatal): ${err.message}`);
      }
    }
  }

  const results = [];
  const ladderCandidates = [];
  for (const row of evaluate) {
    const evaluation = await evaluateRow(row, { ghaDecisions });
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
        await stampStateChangeAnchor(row, evaluation);
      } else {
        console.error(`[periodic-liveness-watcher] emitOverdueSignal insert FAILED for ${row.process_key}: ${result.error?.message} -- last_state NOT advanced, will retry next cycle`);
      }
    } else if (evaluation.state === STATE.OVERDUE) {
      // Still OVERDUE, not a fresh transition: attempt to climb the ladder (001-B FR-3). Fails
      // soft (see lib/periodic-liveness/ladder-escalation.mjs) if the counter migration hasn't
      // landed yet -- owner-first routing above is unaffected either way. Adversarial-review
      // finding (PR #5940, HIGH): even though the ladder's own internals are individually
      // fail-soft, wrap the whole call here too -- a failure in this brand-new, non-critical
      // escalation feature must never abort evaluation of the REMAINING registry rows this tick,
      // nor skip the self-liveness upsert that follows this loop.
      try {
        const ownerTarget = await resolveOwnerTarget(supabase, row.owner);
        const climb = await climbLadder({ supabase, row, ownerTarget });
        if (climb.laddered) ladderCandidates.push({ process_key: row.process_key, display_name: row.display_name });
      } catch (err) {
        console.error(`[periodic-liveness-watcher] ladder climb FAILED (non-fatal) for ${row.process_key}: ${err.message}`);
      }
      await supabase.from('periodic_process_registry').update({ last_state: evaluation.state }).eq('process_key', row.process_key);
      await stampStateChangeAnchor(row, evaluation);
    } else {
      // OK/UNVERIFIED/INTENTIONALLY_DOWN all end any active OVERDUE episode -- reset the ladder
      // counter for all of them (adversarial-review finding, PR #5940, LOW), not just OK, so a
      // later unrelated episode never inherits a stale carried-forward count.
      await resetConsecutiveMiss(supabase, row.process_key);
      // FR-5: escalate a row that has just crossed >7 continuous days UNVERIFIED, the same way
      // OVERDUE rows are escalated -- fires once per episode (hasCrossedUnverifiedThreshold only
      // returns true on the tick where the threshold is first crossed).
      if (evaluation.state === STATE.UNVERIFIED && hasCrossedUnverifiedThreshold(row, Date.now())) {
        try {
          const result = await emitPersistentUnverifiedSignal(row);
          if (!result.emitted) {
            console.error(`[periodic-liveness-watcher] emitPersistentUnverifiedSignal insert FAILED for ${row.process_key}: ${result.error?.message}`);
          }
        } catch (err) {
          console.error(`[periodic-liveness-watcher] persistent-UNVERIFIED escalation FAILED (non-fatal) for ${row.process_key}: ${err.message}`);
        }
      }
      await supabase.from('periodic_process_registry').update({ last_state: evaluation.state }).eq('process_key', row.process_key);
      await stampStateChangeAnchor(row, evaluation);
    }
  }

  // One ladder digest decision per TICK (001-B FR-3), regardless of how many rows laddered --
  // closes the per-process chairman-flood finding (risk-agent HIGH). Wrapped defensively (PR
  // #5940 adversarial review) so a failure here can never skip the self-liveness upsert below.
  if (ladderCandidates.length > 0) {
    try {
      await emitLadderDigest(supabase, ladderCandidates, { recordPending: recordPendingDecision, escalate: escalateChairmanDecision });
    } catch (err) {
      console.error(`[periodic-liveness-watcher] emitLadderDigest FAILED (non-fatal): ${err.message}`);
    }
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
  // FR-3: this script's own standard_loop:liveness-watcher registry row is distinct from the
  // __watcher_self__ upsert above (a different process_key) -- stampLastFired no-ops harmlessly
  // if that row isn't registered yet, by design (additive registry membership).
  await stampLastFired(supabase, 'standard_loop:liveness-watcher');

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

export { main as runWatcher, evaluateRow, emitOverdueSignal, emitPersistentUnverifiedSignal, stampStateChangeAnchor, STATE, UNVERIFIED_ESCALATION_MS };
