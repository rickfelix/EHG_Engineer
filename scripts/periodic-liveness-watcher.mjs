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
// FR-3a: same venue predicate the sweep uses (stale-session-sweep.cjs:545), so both consumers
// abstain on the same evidence rather than each deciding for itself what "no answer" means.
const { pidVenueCapability } = require('../lib/fleet/pid-venue.cjs');
import { parseLivenessClasses, partitionRowsByClasses } from '../lib/periodic-liveness/class-split.mjs';
import { resolveOwnerTarget } from '../lib/periodic-liveness/owner-target-resolver.mjs';
import { climbLadder, resetConsecutiveMiss, emitLadderDigest } from '../lib/periodic-liveness/ladder-escalation.mjs';
import { gapAdjustedAgeMs } from '../lib/periodic-liveness/cron-gap.mjs';
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

// SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (FR-3c) — evaluate EVERY seat, not one.
//
// THE MEASURED RESIDUAL THIS CLOSES. The SD recorded that the session-bound loop DID fire — Golf-3
// was stamped at 14:46:49, inside a :47 slot — yet the OTHER FOUR dead seats carried no stale
// marker at all, and warned: "a venue fix that leaves four of five deaths undetected would ship
// green and change nothing." This is that fifth-of-five, and it is not invoker fragility.
//
// This function used to end in `.order('heartbeat_at', {ascending:false}).limit(1).maybeSingle()`.
// It examined exactly ONE seat per class — the single FRESHEST-heartbeat row — and let that one
// row's verdict stand for the entire class. Every other seat in the class was never looked at, on
// any run, however durable the invoker. Worse, ordering by heartbeat_at DESC selects for the very
// pathology the SD was filed about: a dead seat whose immortal tick kept stamping fresh heartbeats
// SORTS FIRST, so the one row examined was preferentially the forged one, and it reported OK.
//
// A class-level "is anything in this role alive" question is a legitimate thing for the registry
// row to ask, so the aggregate verdict semantics are UNCHANGED (any genuinely-fresh seat => OK;
// the existing comment explains why false-positive-alive is the safe direction here). What changes
// is that the answer is now derived from ALL seats, the per-seat dead ones are named rather than
// silently skipped, and the row count examined is stated so "found nothing" can never again be
// mistaken for "looked at everything".
async function resolveRoleSession(row, pidVenue = pidVenueCapability()) {
  const empty = { lastFiredAt: null, signals: {}, evaluableCount: 0, examined: 0, seats: [] };
  const filter = row.liveness_source_ref?.metadata_filter;
  if (!filter) return empty;

  const safeEntries = Object.entries(filter).filter(([k]) => ALLOWED_METADATA_FILTER_KEYS.has(k));
  if (safeEntries.length === 0) return empty;

  const orClauses = safeEntries.map(([k, v]) => `metadata->>${k}.eq.${v}`).join(',');
  const { data, error } = await supabase
    .from('claude_sessions')
    .select('session_id, heartbeat_at, terminal_id, tty, process_alive_at, is_alive')
    .or(orClauses)
    .order('heartbeat_at', { ascending: false });

  if (error || !data || data.length === 0) return empty;

  const nowMs = Date.now();
  // FR-3a IN THIS FILE TOO. stale-session-sweep.cjs:2165 already derives `pidUnverifiable =
  // !pidVenue.capable` — "not 'the PID is not alive', but 'we are somewhere the answer was never
  // written'". The watcher had NO such gate, so in a PID-blind venue every stale-heartbeat seat
  // produced a hard pidAlive=false that COUNTED AS A CORROBORATING STALE SIGNAL.
  //
  // Why the per-seat guard below cannot carry this on its own: session_id is TEXT NOT NULL UNIQUE
  // (20251204_multi_session_coordination.sql), so `terminal_id != null || session_id != null` is
  // ALWAYS TRUE on a production row. The ternary could therefore never yield null, and hasPidAlive
  // returns a bare false for BOTH "marker says the process is gone" (a real negative) and "no
  // marker exists anywhere" (no answer at all). Conflating those is exactly the defect this SD
  // exists to eliminate, and it was live in the file implementing FR-3c.
  //
  // `pidVenue` is a PARAMETER with a live default rather than a call here, because
  // lib/fleet/pid-venue.cjs loads through createRequire() and vi.mock() is a silent no-op on that
  // path (this file's test header documents the same trap for session-liveness.cjs). An injected
  // seam is the only way a hermetic test can drive BOTH venue verdicts; production is unchanged.
  const seats = data.map((seat) => {
    const s = {
      heartbeatFresh: seat.heartbeat_at != null ? hasFreshHeartbeat(seat, nowMs) : null,
      // FR-1 (C2) made hasPidAlive resolvable from session_id alone, so a NULL terminal_id is no
      // longer a reason to skip the PID rung — gating on terminal_id here would discard a real
      // answer for the 25% of live rows that carry no terminal_id but do have a marker.
      // The venue check is the OUTER gate: where no marker was ever written, the rung ABSTAINS
      // (null) rather than voting. Where markers DO exist, "no marker for this seat" stays a real
      // negative the class verdict may act on — the distinction pid-venue.cjs:59 draws deliberately.
      pidAlive: !pidVenue.capable
        ? null
        : (seat.terminal_id != null || seat.session_id != null) ? hasPidAlive(seat) : null,
      tickAlive: seat.process_alive_at != null ? hasTickAlive(seat, nowMs) : null,
    };
    return {
      session_id: seat.session_id,
      heartbeat_at: seat.heartbeat_at,
      signals: s,
      evaluableCount: Object.values(s).filter((v) => v !== null).length,
      anyFresh: Object.values(s).some((v) => v === true),
    };
  });

  // The class is alive if ANY seat is positively alive — but lastFiredAt still reports the
  // freshest heartbeat in the class, preserving the existing age comparison downstream.
  const freshest = seats.find((s) => s.heartbeat_at != null) || seats[0];
  const aliveSeats = seats.filter((s) => s.anyFresh);
  const representative = aliveSeats[0] || freshest;

  return {
    lastFiredAt: freshest?.heartbeat_at ?? null,
    signals: representative.signals,
    evaluableCount: representative.evaluableCount,
    examined: seats.length,
    seats,
    aliveCount: aliveSeats.length,
    // Named, not merely counted: a seat that is evaluable and NOT alive is a candidate death the
    // old single-row probe could not have surfaced even in principle.
    deadSeatIds: seats.filter((s) => !s.anyFresh && s.evaluableCount >= 2).map((s) => s.session_id),
  };
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
  // TR-6 (SD-FDBK-ENH-PERIODIC-LIVENESS-WATCHER-001): injectable clock seam, same style as the
  // existing pidVenue seam (see the class-split doc comment above) -- required so gap/lag-relative
  // test scenarios (TS-1, TS-2, TS-4, TS-9) can deterministically control whether `now` falls
  // inside/outside a declared cron gap, rather than depending on the wall-clock hour a test
  // happens to run in.
  const { now = Date.now() } = ctx;
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
    const resolved = await resolveRoleSession(row, ctx.pidVenue);
    lastFiredAt = resolved.lastFiredAt;
    const staleSignals = Object.entries(resolved.signals).filter(([, v]) => v === false).length;
    const freshSignals = Object.entries(resolved.signals).filter(([, v]) => v === true).length;
    // A single FRESH signal is unambiguous positive evidence -- no ambiguity risk in declaring OK
    // (the "insufficient signals" gate below exists to protect the DEATH declaration only; a
    // false-positive-alive is harmless, a false-positive-dead is the fleet's own documented
    // recurring failure mode). Check this BEFORE the evaluable-count gate.
    // FR-3c: state the population on EVERY return path. A class-level OK that silently covers N-1
    // unexamined seats is how four of five dead seats stayed invisible; the count is what makes
    // "all clear" distinguishable from "barely looked".
    const seatCensus = `examined ${resolved.examined} seat(s), ${resolved.aliveCount ?? 0} alive`;
    const deadNote = resolved.deadSeatIds?.length
      ? `; ${resolved.deadSeatIds.length} evaluable-but-not-alive: ${resolved.deadSeatIds.join(', ')}`
      : '';
    if (freshSignals > 0) {
      // The class is alive, but individual dead seats inside it are REPORTED rather than absorbed.
      return {
        process_key: row.process_key,
        state: STATE.OK,
        last_fired_at: lastFiredAt,
        reason: `${seatCensus}${deadNote}`,
        seats_examined: resolved.examined,
        dead_seat_ids: resolved.deadSeatIds ?? [],
      };
    }
    if (resolved.evaluableCount < 2) {
      return { process_key: row.process_key, state: STATE.UNVERIFIED, reason: `fewer_than_2_evaluable_signals (${seatCensus})`, last_fired_at: lastFiredAt, seats_examined: resolved.examined };
    }
    // freshSignals===0 is guaranteed here (the freshSignals>0 branch above already returned), and
    // evaluableCount>=2 is guaranteed here too -- so staleSignals (evaluableCount - freshSignals)
    // is always >=2 at this point. There is no reachable "signals disagree" state with this
    // 3-signal model (adversarial review, PR #5562 INFO): any single fresh signal short-circuits
    // to OK above before this line is reached.
    signalNote = `${staleSignals} corroborating stale signals (${seatCensus}${deadNote})`;
  } else if (row.liveness_source === 'eva_scheduler_heartbeat') {
    const resolved = await resolveSchedulerRound(row);
    lastFiredAt = resolved.lastFiredAt;
  }
  // self_stamped: lastFiredAt already = row.last_fired_at

  if (!lastFiredAt) {
    // SD-LEO-INFRA-STAMP-ARMING-TIME-001 FR-2 — a null last_fired_at CONFLATES two states:
    // "not due yet" and "never produced when it should have". That conflation is why AC-8/FR-7 of
    // SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B shipped UNMET: the alarm works once a report has
    // succeeded ONCE, and is blind precisely for a report that has NEVER been produced — which is
    // the state at merge and the most missing a report can be.
    //
    // An arming time separates them, so BOTH acceptance criteria survive: FR-7 gets its alarm, and
    // the never-false-OVERDUE criterion is untouched because this branch requires an EXPLICIT
    // armed_at that only registration writes.
    //
    // THE GUARD IS THE POINT, not a formality. This early return is reached by far more than armed
    // rows. Measured live before writing this: of the 66 rows carrying a null last_fired_at, only
    // 27 are self_stamped; the other 39 resolve lastFiredAt in the branches above and 16 of them
    // already read OK. Keying this on row age instead of an explicit armed_at would have emitted
    // 60 alarms, roughly 33 of them false — role_session:adam/coordinator/solomon sit at ~1487
    // cadences elapsed with a null last_fired_at and last_state OK. Requiring armed_at makes this
    // branch STRUCTURALLY unable to reach them.
    const armedAt = row.liveness_source_ref?.armed_at;
    const armedMs = armedAt ? Date.parse(armedAt) : NaN;
    // A malformed armed_at falls through to UNVERIFIED — an unparseable timestamp is not evidence
    // that something is overdue, and fail-soft here keeps the never-false-OVERDUE property.
    // overdueThresholdMs does Number(row.grace_multiplier), and Number(null) is 0 — a row carrying
    // an armed_at but no grace_multiplier would get a threshold of 0 and alarm INSTANTLY. Today
    // that is unreachable because the only writer of armed_at also writes grace_multiplier, which
    // is precisely the kind of cross-file coupling a later edit breaks silently. Require a real
    // positive window.
    const thresholdMs = overdueThresholdMs(row);
    if (Number.isFinite(armedMs) && Number.isFinite(thresholdMs) && thresholdMs > 0) {
      // FR-1: gap-adjusted, not raw, elapsed time -- a declared cron gap between arming and the
      // process's first-ever fire must not count against "armed but never produced" any more than
      // it counts against ordinary staleness below. Falls back to raw elapsed time when the row
      // carries no workflow_cron (every row that predates this fix).
      const armedAgeMs = gapAdjustedAgeMs(row.liveness_source_ref?.workflow_cron, armedMs, now);
      if (armedAgeMs > thresholdMs) {
        return {
          process_key: row.process_key,
          state: STATE.OVERDUE,
          armed_at: armedAt,
          age_ms: armedAgeMs,
          reason: 'armed_never_produced',
        };
      }
    }
    return { process_key: row.process_key, state: STATE.UNVERIFIED, reason: 'no_last_fired_data_available' };
  }

  // FR-1/FR-2: gap-adjusted elapsed time. A row carrying liveness_source_ref.workflow_cron gets
  // its declared cron gaps subtracted (never resetting the underlying staleness signal -- see
  // gapAdjustedAgeMs's own doc comment / TS-9); a row without one falls back to plain elapsed
  // time unchanged, so FR-2's stochastic-lag tolerance stays entirely in grace_multiplier, not a
  // second code path.
  const ageMs = gapAdjustedAgeMs(row.liveness_source_ref?.workflow_cron, new Date(lastFiredAt).getTime(), now);
  const state = ageMs > overdueThresholdMs(row) ? STATE.OVERDUE : STATE.OK;
  return { process_key: row.process_key, state, last_fired_at: lastFiredAt, age_ms: ageMs, reason: signalNote };
}

/**
 * FR-3 (SD-FDBK-ENH-PERIODIC-LIVENESS-WATCHER-001): derive a stable failure-signature string from
 * an evaluation result, for the ladder's per-process relapse-vs-new-failure discriminator. Falls
 * back to a generic label for the plain flat-threshold-exceeded case (evaluateRow's main OVERDUE
 * path leaves `reason` null for a self_stamped row -- signalNote is only ever set inside the
 * claude_sessions_heartbeat branch), so every OVERDUE row gets SOME signature, never undefined.
 *
 * Adversarial-review finding (PR #7300): claude_sessions_heartbeat's `reason` (signalNote, set at
 * line ~240) embeds live per-tick seat-census detail -- session IDs, alive/dead counts -- that
 * naturally churns tick-to-tick even for the SAME ongoing outage. Using it verbatim as a
 * signature would defeat FR-3's same-pattern dismissal match for exactly the highest-profile
 * role_session processes (adam/solomon/coordinator), re-escalating a just-dismissed recurring
 * failure because its seat census happened to differ this tick. Use a stable label for that
 * source instead; every other source's `reason` is already a stable enumerated string.
 */
function deriveFailureSignature(row, evaluation) {
  if (row.liveness_source === 'claude_sessions_heartbeat') return 'stale_heartbeat';
  if (evaluation.reason) return evaluation.reason;
  return evaluation.state === STATE.OVERDUE ? 'threshold_exceeded' : 'unknown';
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

/**
 * @param {{includeFixtures?: boolean}} [opts] — includeFixtures:true KEEPS __e2e_ rows in the
 *   evaluation set. Exists for ONE caller: tests/integration/periodic-process-liveness-realdb.test.js,
 *   whose fixtures are themselves named __e2e_periodic_liveness_*__ and which asserts that this
 *   watcher EMITS OVERDUE for them. That suite needs the real path over synthetic rows, so filtering
 *   them would break the regression suite that guards this very file. It is the same shape as the
 *   reaper: a consumer for which seeing fixture rows IS the function.
 *   THE OPT-OUT ANNOUNCES ITSELF on every use — an escape hatch that engages silently is the
 *   fence-bypass class, and this one is quiet by nature because it only ever runs in tests.
 */
async function main({ includeFixtures = false } = {}) {
  const { data: rows, error } = await supabase.from('periodic_process_registry').select('*').neq('process_key', WATCHER_SELF_KEY);
  if (error) throw new Error(`registry query failed: ${error.message}`);

  // SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-B FR-4: drop e2e fixture residue before evaluating liveness.
  //
  // This is the ALARM PRODUCER, so an unfiltered fixture row here does not merely look wrong on a
  // panel — it emits a real OVERDUE signal for a process that was never meant to exist, and the
  // resulting noise is what trains people to ignore the alarm.
  //
  // ADDED, NOT SUBSTITUTED: the .neq above is a SELF-exclusion (the watcher not evaluating itself)
  // and isFixtureProcessKey('__watcher_self__') is FALSE, so replacing one with the other would put
  // the watcher back into its own evaluation set. Two different concerns.
  //
  // Keyed on '__e2e_' ONLY, never the canonical FIXTURE_KEY_RE: that regex carries a bare ^__ branch
  // which would classify the REAL rows __watcher_self__ and __eva_scheduler_watcher_self__ as
  // fixtures and blind the very instrument this watcher exists to keep honest.
  let liveRows = rows || [];
  if (includeFixtures) {
    console.log('[periodic-liveness-watcher] includeFixtures=true — EVALUATING __e2e_ FIXTURE ROWS. This opt-out exists for the realdb regression suite only; it must never be set in production.');
  } else try {
    const { isFixtureProcessKey } = await import('../lib/governance/fixture-exclusion.mjs');
    const before = liveRows.length;
    liveRows = liveRows.filter((r) => !isFixtureProcessKey(r.process_key));
    const dropped = before - liveRows.length;
    if (dropped > 0) console.log(`[periodic-liveness-watcher] excluded ${dropped} e2e fixture row(s) from evaluation`);
  } catch (e) {
    // Announce rather than silently evaluating unfiltered — an unreported fallback is
    // indistinguishable from a working filter.
    console.error(`[periodic-liveness-watcher] fixture predicate unavailable, EVALUATING UNFILTERED: ${e?.message || e}`);
  }

  const classes = parseLivenessClasses(process.env.LIVENESS_CLASSES);
  const { evaluate, skipped } = partitionRowsByClasses(liveRows, classes);
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
        if (climb.laddered) ladderCandidates.push({ process_key: row.process_key, display_name: row.display_name, signature: deriveFailureSignature(row, evaluation) });
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
    // FR-2: calibrated from measured live GHA delivery lag for this exact cron (*/15 * * * *) --
    // observed gaps up to 83min (~5.5x the 900s base interval) in a single ~13.5h sample window
    // (LEAD-phase discovery). grace_multiplier=7 gives a 105min threshold, comfortably above the
    // measured ceiling with headroom, replacing the column default (3, giving only 45min -- the
    // exact miscalibration this SD fixes).
    grace_multiplier: 7,
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
