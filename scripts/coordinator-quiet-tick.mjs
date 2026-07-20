#!/usr/bin/env node
/**
 * coordinator-quiet-tick.mjs — the coordinator hibernation aggregator
 * (SD-LEO-INFRA-FLEET-HIBERNATION-MECHANISM-001, FR-1/FR-4/FR-5/FR-6).
 *
 * ONE process that composes the EXISTING modular coordinator cores into a single
 * fail-soft tick, emits ONE summary line, and self-paces its own next wake —
 * replacing the N separate fixed crons (~37/hr -> ~4-6/hr) during quiescence.
 *
 * Reuse, do not rewrite: each core is the existing, tested CLI script, run
 * fail-soft via runCoresFailSoft (a throw/non-zero exit is logged + the tick
 * continues). Mode is sourced from lib/coordinator/fleet-quiescence.cjs
 * (assessFleetActivity) — QUIESCENT skips the expensive cores
 * (forecast/backlog/audit), ACTIVE runs the full set.
 *
 * Output ends with a single QUIET_TICK= line carrying the recommended
 * ScheduleWakeup delay so the calling /loop session can self-pace (FR-5/FR-6).
 *
 * Usage: node scripts/coordinator-quiet-tick.mjs [--json]
 */
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import 'dotenv/config';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const { assessFleetActivity } = require('../lib/coordinator/fleet-quiescence.cjs');
const { decideCadence, detectSalientDelta, runCoresFailSoft } = require('../lib/coordinator/quiet-tick.cjs');
const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
const { hasUndeliveredChairmanEscalation } = require('../lib/coordinator/undelivered-escalation.cjs');
// QF-20260719-138: emit the cross-party ping row ourselves (mechanical, byte-identical) rather
// than instructing the coordinator to hand-insert it every tick (that tripped the RCA 3x guard).
const { emitCrossPartyPing } = require('../lib/coordinator/cross-party-ping.cjs');
// QF-20260719-298: read-only count of unactioned adam_advisory rows (payload.kind, retired by
// payload.actioned_at) — the inbox core counts only payload.signal_type rows, so this lane had
// ZERO tick representation.
const { selectUnactionedAdvisories } = require('../lib/coordinator/adam-advisory-store.cjs');
const { DIRECTIVE_KINDS, PAYLOAD_KINDS } = require('../lib/fleet/worker-status.cjs');
// SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C (Child B) FR-4: readSalientState's openSignalCount below
// generalizes beyond payload.signal_type-only salience via this registry-reader — deliberately NOT
// touching selectUnactionedAdvisories's actioned_at-coupled retirement logic above (out of scope,
// see FR-4/TR-5: that coupling makes a kind-filter generalization there unsafe).
import { resolveRecognizedKinds } from '../lib/fleet/drain-set-registry.js';
// SD-LEO-INFRA-FLEET-ACCOUNT-IDENTITY-001 (FR-2): surface which Claude account this fleet is
// running under in the tick's status line.
const { getAccountIdentity } = require('../lib/fleet/account-identity.cjs');
// SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001 FR-1 (adversarial-review finding): a
// chairman_directive rides on target_session='broadcast' (never a real session id — see
// scripts/issue-chairman-directive.cjs), so it can NEVER match the target_session=coordinatorId
// filter a plain session_coordination query uses. Its own compliance tracking is a SEPARATE
// mechanism (chairman_directive_ack rows, keyed by directive_id + role, not read_at at all) —
// reuse the existing, purpose-built gauge rather than re-deriving broadcast-lane detection.
const { loadRoleDirectiveStatus } = require('../lib/coordinator/chairman-directive-gauge.cjs');

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const LAST_STATE_FILE = join(REPO_ROOT, '.coord-quiet-tick-last.json');
const COORD_PARTY_OFFSET_S = 0; // coordinator parks at the base offset; Adam phases at +420 (FR-5).

function makeClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  return createClient(url, key);
}

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * The cores this tick folds, with the cron each one replaces at operator cutover.
 * `quiescentSkip` = the core is suppressed in QUIESCENT mode (expensive, no value
 * when nothing is moving). `safety` cores always run (claim-reaping / inbox arrival).
 * Exported so the loop-parity test proves nothing is silently dropped when the
 * STANDARD_LOOPS cutover removes the corresponding separate crons.
 */
export const COMPOSED_CORES = [
  { key: 'sweep', script: 'stale-session-sweep.cjs', args: ['scripts/stale-session-sweep.cjs'], quiescentSkip: false, safety: true },
  { key: 'inbox', script: 'fleet-dashboard.cjs', args: ['scripts/fleet-dashboard.cjs', 'inbox'], quiescentSkip: false, safety: true },
  { key: 'charter-audit', script: 'coordinator-charter-audit.mjs', args: ['scripts/coordinator-charter-audit.mjs'], quiescentSkip: true },
  { key: 'capacity-forecast', script: 'coordinator-capacity-forecast.mjs', args: ['scripts/coordinator-capacity-forecast.mjs', '--dispatch'], quiescentSkip: true },
  // NOT quiescentSkip (SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-A): a cheap single-table
  // scan+write, and exactly the state where a fresh draft SD needs a rank before the next worker
  // wakes and self-claims — skipping it here left claimable-but-unranked SDs stuck whenever this
  // tick's STANDARD_LOOPS sibling cron was also unarmed (coordinator teardown-discipline gap).
  { key: 'backlog-rank', script: 'coordinator-backlog-rank.mjs', args: ['scripts/coordinator-backlog-rank.mjs'], quiescentSkip: false },
  // NOT quiescentSkip (SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-D): observability for the
  // belt-and-suspenders above — cheap (reuses backlog-rank's own claimable computation), and most
  // valuable exactly when the fleet is quiet (a parked fleet is when rank-on-transition gaps and
  // periodic-cron lag are most likely to have gone unnoticed).
  { key: 'unranked-gauge', script: 'gauge-unranked-claimable-leaves.mjs', args: ['scripts/gauge-unranked-claimable-leaves.mjs'], quiescentSkip: false },
  { key: 'audit', script: 'coordinator-audit.mjs', args: ['scripts/coordinator-audit.mjs'], quiescentSkip: true },
  // SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-1/FR-2: NOT
  // quiescentSkip -- a queued relay-request is exactly as urgent when the fleet is
  // otherwise quiet (a quiet fleet is precisely when a relay is most likely to sit
  // undrained, per confirmed incident #1).
  { key: 'relay-drain', script: 'coordinator-relay-drain.cjs', args: ['scripts/coordinator-relay-drain.cjs'], quiescentSkip: false },
  // FR-3: cheap read + fail-open write; valuable exactly when quiet for the same reason.
  { key: 'relay-drop-gauge', script: 'coordinator-relay-drop-gauge.cjs', args: ['scripts/coordinator-relay-drop-gauge.cjs'], quiescentSkip: false },
  // QF-20260705-797: solomon-ledger-pending-resurface.cjs shipped with no scheduled invoker
  // anywhere (npm script only) -- 0 session_coordination rows ever emitted. Cheap (single SELECT
  // + per-row dedup check), fail-open (no active Adam -> no-op), and self-rate-limits to once per
  // stale ledger row per day via its own payload.dedup_key, so running it every tick is safe. NOT
  // quiescentSkip: an aged pending recommendation is exactly as stale-and-worth-surfacing during a
  // quiet fleet window as during an active one.
  { key: 'solomon-ledger-resurface', script: 'solomon-ledger-pending-resurface.cjs', args: ['scripts/solomon-ledger-pending-resurface.cjs'], quiescentSkip: false },
];

/** Build the fail-soft core list for the current mode (quiescent skips the expensive cores). */
export function buildCores(quiescent) {
  return COMPOSED_CORES.map((c) => scriptCore(c.key, c.args, { skip: quiescent && c.quiescentSkip }));
}

/** A core that shells the existing tested CLI script, fail-soft. */
function scriptCore(key, args, { skip = false } = {}) {
  return {
    key,
    skip,
    run: async () => {
      // --dry-run composes + lists WITHOUT executing the (side-effectful) cores,
      // so the tick can be smoke-tested without reaping claims / dispatching.
      if (DRY_RUN) return 'dry';
      const { stdout } = await execFileAsync('node', args, { cwd: REPO_ROOT, timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
      const tail = String(stdout || '').trim().split('\n').slice(-1)[0] || 'ok';
      return tail.slice(0, 100);
    },
  };
}

/**
 * Compute the salient state used for FR-4 cross-party no-delta suppression.
 * Exported (SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C Child B FR-4) so tests can drive it directly
 * with a mocked resolveRecognizedKinds response, proving the openSignalCount generalization.
 */
export async function readSalientState(sb) {
  const state = { beltZero: true, openSignalCount: 0, venture1State: null };
  try {
    const { data: claimable } = await sb
      .from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft');
    // head+count returns count on the response; fall back to length if absent.
    state.beltZero = !(claimable && claimable.length > 0);
  } catch { /* fail-soft: leave default */ }
  try {
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    // SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C (Child B) FR-4: the 2026-07-19 lane-blindness
    // incident (commit bb661ec627e, QF-20260719-298) — this count originally read ONLY
    // payload->>signal_type IS NOT NULL, structurally blind to payload.kind-only rows (14
    // adam_advisory rows sat unactioned with zero tick representation). OR-in a payload.kind
    // term sourced from the coordinator's registry-resolved recognized kinds (fails open to
    // DRAIN_SETS.coordinator while role_drain_sets remains unapplied) so ANY future kind added
    // to the coordinator's drain set gets salience representation automatically — not just
    // adam_advisory. cross_party_ping is subtracted: it is Adam/coordinator quiet-tick's OWN
    // mechanical STUB row (emitCrossPartyPing, imported above), so counting it here would be a
    // self-referential feedback loop, not a genuine new-work signal.
    // EXEC-phase SECURITY review: resolvedCoordinatorKinds is interpolated directly into a
    // PostgREST .or() filter string below (supabase-js forwards it verbatim, unescaped). Not
    // reachable today (hard-coded DRAIN_SETS.coordinator literals) nor once role_drain_sets is
    // applied (service-role-write-only, chairman-seeded, no user-facing write path) — but the
    // kind column itself has no DB-side vocabulary CHECK until Child A's migration is amended, so
    // this filter is defense in depth against a future less-trusted write path, not a fix for a
    // currently-reachable issue.
    const SAFE_KIND_TOKEN = /^[A-Za-z][A-Za-z0-9_]*$/;
    const resolvedCoordinatorKinds = (await resolveRecognizedKinds({ supabase: sb, role: 'coordinator' }))
      .filter((k) => k !== PAYLOAD_KINDS.CROSS_PARTY_PING && SAFE_KIND_TOKEN.test(k));
    const orFilter = resolvedCoordinatorKinds.length > 0
      ? `payload->>signal_type.not.is.null,payload->>kind.in.(${resolvedCoordinatorKinds.join(',')})`
      : 'payload->>signal_type.not.is.null';
    const { data: sigs } = await sb
      .from('session_coordination')
      .select('id')
      .or(orFilter)
      .is('acknowledged_at', null)
      .gte('created_at', since);
    state.openSignalCount = (sigs || []).length;
  } catch { /* fail-soft */ }
  return state;
}

function loadLastState() {
  try { return JSON.parse(readFileSync(LAST_STATE_FILE, 'utf8')); } catch { return null; }
}
function saveLastState(s) {
  try { writeFileSync(LAST_STATE_FILE, JSON.stringify(s)); } catch { /* fail-soft: never block the tick */ }
}

/**
 * SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001 FR-1: is there a session-targeted
 * DIRECTIVE_KINDS row targeting the coordinator that has not yet been genuinely
 * surfaced/actioned (read_at IS NULL)? Reuses the SAME allowlist and targeting
 * pattern as the existing 'inbox' core (fleet-dashboard.cjs printInbox) and
 * scripts/hooks/coordination-inbox.cjs — never a second hand-rolled copy of
 * DIRECTIVE_KINDS (QF-20260610-545 lesson).
 *
 * Does NOT cover chairman_directive — see hasOutstandingChairmanDirective below,
 * a deliberately SEPARATE check (adversarial-review finding on PR #5794): a
 * chairman_directive is issued with target_session='broadcast' (a literal sentinel,
 * never a real session id — scripts/issue-chairman-directive.cjs), so it can never
 * match this function's target_session=coordinatorId filter, and its compliance is
 * tracked by a wholly different mechanism (chairman_directive_ack rows, not read_at).
 *
 * Fail-soft: a query error returns false (never blocks the tick, never forces a
 * false hard-wake on an unrelated DB hiccup).
 */
export async function hasUnactionedDirective(sb, coordinatorId) {
  if (!coordinatorId) return false;
  try {
    const { data, error } = await sb
      .from('session_coordination')
      .select('id')
      .eq('target_session', coordinatorId)
      .in('payload->>kind', DIRECTIVE_KINDS)
      .is('read_at', null)
      .limit(1);
    if (error) return false;
    return Boolean(data && data.length > 0);
  } catch {
    return false;
  }
}

/**
 * SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001 FR-1 (adversarial-review finding):
 * is there an OUTSTANDING chairman_directive applying to the 'coordinator' role — the
 * flagship, incident-motivating case (a chairman burn-now directive sat unactioned for
 * 25+ minutes)? Reuses the existing, purpose-built compliance gauge
 * (lib/coordinator/chairman-directive-gauge.cjs loadRoleDirectiveStatus) rather than
 * re-deriving the SUPERSEDES-per-directive-id / ack-by-role logic it already implements.
 * Fail-soft: loadRoleDirectiveStatus itself never throws (returns [] on error).
 */
export async function hasOutstandingChairmanDirective(sb) {
  try {
    const rows = await loadRoleDirectiveStatus(sb, 'coordinator');
    return rows.some((r) => r.status === 'outstanding');
  } catch {
    return false;
  }
}

async function main() {
  const asJson = process.argv.includes('--json');
  const sb = makeClient();

  // FR-5: mode decision from the canonical quiescence gate (do not re-derive).
  let quiescent = false;
  let modeReason = 'assume-active';
  try {
    const q = await assessFleetActivity(sb, {});
    quiescent = q.quiescent === true;
    modeReason = q.reason;
  } catch (e) {
    quiescent = false; // fail-open to ACTIVE — never silence the fleet on a query error.
    modeReason = 'assess_error_fail_active: ' + (e && e.message);
  }

  // FR-1: compose existing cores. QUIESCENT -> skip the expensive cores; always
  // run the cheap safety set (inbox arrival + stale-sweep). ACTIVE -> full set.
  const tick = await runCoresFailSoft(buildCores(quiescent));

  // FR-4: cross-party no-delta ping suppression.
  const salient = await readSalientState(sb);
  const delta = detectSalientDelta(loadLastState(), salient);
  saveLastState(salient);

  // SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001 FR-1: a DIRECTIVE_KINDS row
  // targeting the coordinator, OR an outstanding chairman_directive (broadcast lane,
  // separate ack mechanism — adversarial-review finding on PR #5794), must hard-wake
  // the loop regardless of quiescent state (see the incident this SD fixes: a
  // chairman directive sat unactioned for 25+ minutes because decideCadence had no
  // awareness of it and self-scheduled a 900s park).
  // Round-2 adversarial-review finding: getActiveCoordinatorId() has unguarded
  // network awaits (lib/coordinator/resolve.cjs) — running it BEFORE the chairman-
  // directive check inside one shared try/catch let an identity-resolution error
  // suppress the chairman-directive check too, even though that check needs no
  // coordinatorId at all. Run the two checks independently so a resolve.cjs hiccup
  // never masks the flagship (broadcast, coordinator-identity-agnostic) case.
  // SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-H (FR-3): the undelivered pick-class
  // chairman-escalation check runs as its OWN independent leg (internally fail-soft),
  // so a hiccup in either directive detector can never mask it and vice versa.
  const [sessionDirective, chairmanDirective, undeliveredEscalation] = await Promise.all([
    (async () => {
      try {
        const coordinatorId = await getActiveCoordinatorId(sb);
        return await hasUnactionedDirective(sb, coordinatorId);
      } catch {
        return false; // fail-soft: never block the tick on identity/query errors
      }
    })(),
    hasOutstandingChairmanDirective(sb), // already internally fail-soft
    hasUndeliveredChairmanEscalation(sb), // already internally fail-soft
  ]);
  const unactionedDirective = sessionDirective || chairmanDirective;

  // QF-20260719-298 (LIVE INCIDENT 2026-07-19): 14 adam_advisory rows incl a chairman decision
  // sat unactioned while every QUIET_TICK line read clean — the inbox core counts only
  // payload.signal_type rows, so adam_advisory (payload.kind, retired ONLY by actioned_at) had
  // zero tick representation. Surface the unactioned count so a pending advisory forces a
  // non-NO-OP ping within one tick cycle. Fail-soft: the count never blocks the tick.
  let unactionedAdamAdvisories = 0;
  try {
    const coordinatorIdForAdvisories = await getActiveCoordinatorId(sb);
    const { rows } = await selectUnactionedAdvisories(sb, coordinatorIdForAdvisories, { limit: 200 });
    unactionedAdamAdvisories = (rows || []).length;
  } catch { /* fail-soft: advisory count never blocks the tick */ }

  // SD-LEO-INFRA-FLEET-ACCOUNT-IDENTITY-001 (FR-2): fail-safe — null/unavailable prints 'unknown'
  // rather than crashing the tick.
  const currentIdentity = getAccountIdentity();
  const acctLabel = (currentIdentity && currentIdentity.email) || 'unknown';

  // FR-5/FR-6: self-paced next wake (capped at 15min when quiescent, never 300s;
  // overridden to a short hard-wake band when a directive is pending, per FR-1 above).
  const delaySeconds = decideCadence({
    quiescent,
    partyOffsetS: COORD_PARTY_OFFSET_S,
    hasUnactionedDirective: unactionedDirective,
    hasUndeliveredChairmanEscalation: undeliveredEscalation,
  });

  try {
    await stampLastFired(sb, 'standard_loop:quiet-tick');
  } catch (err) {
    console.error(`[coordinator-quiet-tick] stampLastFired failed (non-fatal): ${err.message}`);
  }

  const result = {
    mode: quiescent ? 'QUIESCENT' : 'ACTIVE',
    modeReason: `${modeReason}${unactionedDirective ? ' [DIRECTIVE_HARD_WAKE]' : ''}${undeliveredEscalation ? ' [ESCALATION_HARD_WAKE]' : ''}`,
    acct: acctLabel,
    cores: tick.summary,
    failedCount: tick.failedCount,
    skippedCount: tick.skippedCount,
    crossPartyPing: delta.changed,
    pingFields: delta.fields,
    adamAdvisoriesPending: unactionedAdamAdvisories,
    nextWakeSeconds: delaySeconds,
  };

  // QF-20260719-138: a real salient delta emits the cross_party_ping row HERE (side-effect in
  // both --json and human modes); the console line below is a record-of-sent, not an instruction.
  const pingSent = delta.changed ? await emitCrossPartyPing(sb, { from: 'coordinator', fields: delta.fields }) : false;

  if (asJson) {
    console.log(JSON.stringify(result));
  } else {
    // ONE summary line for the whole tick.
    console.log(
      `QUIET_TICK=coordinator mode=${result.mode} acct=${acctLabel} cores=[${tick.summary}] ` +
      `fail=${tick.failedCount} skip=${tick.skippedCount} ` +
      `ping=${delta.changed ? delta.fields.join(',') : 'suppressed'} ` +
      `ADAM_ADVISORIES_PENDING=${unactionedAdamAdvisories} ` +
      `nextWakeSeconds=${delaySeconds} :: ${modeReason}`
    );
    // QF-20260719-298: force a non-NO-OP turn when advisories are unactioned. QUIET_TICK_PING is
    // in the coordinator startup-check's actionable-token allowlist, so this makes the tick act
    // instead of silently NO-OPing past a pending chairman decision.
    if (unactionedAdamAdvisories > 0) {
      console.log(`QUIET_TICK_PING=adam-advisories-pending count=${unactionedAdamAdvisories} (unactioned adam_advisory rows targeting the coordinator — ACTION each now, then stamp payload.actioned_at; read_at is NOT the retirement stamp)`);
    }
    if (delta.changed) {
      console.log(`QUIET_TICK_PING=coordinator->adam reason=${delta.fields.join(',')} sent=${pingSent} (cross_party_ping row emitted by the tick — record of sent, not an instruction)`);
    }
  }
  return result;
}

// Only run the tick when invoked directly — importing for tests must not exec.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(() => process.exit(0)).catch((e) => {
    console.error('QUIET_TICK_ERROR=coordinator', e && e.message ? e.message : e);
    process.exit(1);
  });
}
