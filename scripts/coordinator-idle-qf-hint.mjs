#!/usr/bin/env node
/**
 * coordinator-idle-qf-hint.mjs — standing coordinator-loop core that auto-absorbs idle worker
 * capacity into ranked, eligible open QFs via directed claim-hints. QF-20260720-638
 * (Solomon-designed verdict ca1be286/6eb7cf54, coordinator-traced b16aebb1, Adam-sourced).
 *
 * CONTEXT: idle workers were not self-claiming non-critical open QFs because the
 * directed-dispatch grace window fences non-critical QFs from self-claim until the coordinator
 * routes them or grace ages out (anti reverse-starvation of SDs — WORKING AS DESIGNED; QF-161
 * proved the aging path fires unhinted too). Solomon's verdict: do NOT shorten the grace on one
 * day's evidence — encode the coordinator's manual hint intervention as STANDING behavior. This
 * is the directed-dispatch consumer arriving ON TIME to absorb idle, NOT a fence bypass — the
 * SD-priority fence still protects SDs when the fleet is busy.
 *
 * PROPOSE-ONLY (mirrors adam-coordinator-health.mjs's CONST-002): this core NEVER claims or
 * mutates quick_fixes state — it only reads and, per eligible idle worker, writes ONE advisory
 * session_coordination hint row. qf-start.js's own claim-guard resolves any race; a stale/
 * already-claimed hint is a harmless no-op for the worker that receives it.
 *
 * GOVERNANCE (2026-07-20 near-miss hardening): during a MANUAL idle-remediation hint, the ad-hoc
 * isChairmanGatedQF() guard alone let QF-20260719-281 (chairman-gated DDL) through into a hint
 * to a worker — caught and retracted before the worker acted. The chairman-gated exclusion here
 * is BELT-AND-SUSPENDERS: exclude on ANY of four independent signals firing —
 *   (1) not_before-in-future            — via isAutoStartableQF (the 2027-park orphan class)
 *   (2) title/description text heuristic — CHAIRMAN_GATED_TEXT_RE, independent of any column
 *   (3) an explicit exclude-list         — KNOWN_GATED_QF_IDS, seeded with the near-miss QF
 *   (4) isChairmanGatedQF()              — via isAutoStartableQF (owner/release_condition)
 * A standing hint that bypasses a chairman gate even once is a governance-fence breach — this
 * guard is the load-bearing safety of the whole enhancement.
 *
 * Usage: node scripts/coordinator-idle-qf-hint.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { RECENTLY_RELEASED_WINDOW_MS } from '../lib/fleet/genuine-worker.mjs';
import { liveDispatchableFleetMembers } from '../lib/fleet/session-predicates.mjs';
import { getActiveCoordinatorId } from '../lib/coordinator/resolve.cjs';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';
import { isOracleHeldQF } from '../lib/fleet/hold-writer.js';
import { seatIdleVerdict } from '../lib/fleet/seat-idle-predicate.mjs';
import { resolveIdleCtx } from '../lib/fleet/idle-ctx-population.mjs';

const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
const { logCoordinationEvent } = require('../lib/coordinator/coordination-events.cjs');
const { isAutoStartableQF, isClaimableWithVerify, sortQfCandidatesBySeverity } = require('./worker-checkin.cjs');
const { resolveWorkerTierRank } = require('../lib/fleet/tier-ladder.cjs');
const { workClassIneligibilityReason } = require('../lib/fleet/work-class.cjs');

// A worker whose session just (re)started gets a grace period to resolve its own state
// (resume/self-claim) before the coordinator auto-hints it — prevents hinting mid-restart.
export const SPIN_UP_GRACE_MS = 3 * 60 * 1000; // 3 min

// GOVERNANCE layer 2 (belt-and-suspenders): independent of isChairmanGatedQF's owner/
// release_condition columns — catches a QF whose content clearly signals a chairman-gated
// apply even if those columns are unset/stale.
// NB: @approved-by/@delegated-by are NOT \b-wrapped — '@' is a non-word char, so a \b
// immediately before it never matches (no \w/\W transition at that position).
export const CHAIRMAN_GATED_TEXT_RE = /\b(?:CHAIRMAN[- ]GATED|migration|DDL|gated)\b|@approved-by|@delegated-by/i;

// GOVERNANCE layer 3 (belt-and-suspenders): explicit exclude-list, seeded with the QF that
// slipped past isChairmanGatedQF() alone in the 2026-07-20 near-miss.
export const KNOWN_GATED_QF_IDS = new Set(['QF-20260719-281']);

/** Belt-and-suspenders governance layers 2+3 (layers 1+4 already run inside isAutoStartableQF). */
export function isHintExcludedGated(qf) {
  if (KNOWN_GATED_QF_IDS.has(qf.id)) return true;
  return CHAIRMAN_GATED_TEXT_RE.test(`${qf.title || ''} ${qf.description || ''}`);
}

/**
 * QF-20260831-419 (chairman order): tier-fit ENFORCEMENT retired — routing_tier vs worker
 * capability tier_rank is now advisory only (logged, never fences a hint). Any seat may
 * receive a hint for any routing_tier.
 */
export function tierFitOk(qf, workerSession) {
  const routingTier = Number(qf.routing_tier);
  if (Number.isFinite(routingTier) && routingTier > 1 && resolveWorkerTierRank(workerSession) !== 1) {
    console.info(`[idle-qf-hint] ADVISORY (not blocking): routing_tier ${routingTier} QF hinted to a non-top-rung worker per QF-20260831-419.`);
  }
  return true;
}

/** Pure: idle, past-spin-up fleet workers eligible to receive a hint this tick. */
/**
 * Delivery ratio for a hint pass — SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 (FR-6).
 *
 * A LOGGED SKIP COUNT IS NOT A CONTROL, IT IS A RECORD NOBODY READS. `hinted=N` is internally
 * self-consistent at 1-of-10, 9-of-10, 10-of-10 and 0-of-1 alike: with no denominator, no case can
 * contradict another, so the metric can never fail and therefore can never detect. Carrying
 * `attempted` is what makes a degraded pass observable.
 *
 * Pure, and shaped after lib/chairman/sms-channel-health.js — the one existing in-repo
 * ratio-with-alarm — so this is not a new pattern to maintain.
 *
 * @param {{delivered:number, attempted:number}} counts
 * @returns {{ratio:number|null, delivered:number, attempted:number}} ratio null when nothing was attempted
 */
export function computeDeliveryRatio({ delivered = 0, attempted = 0 } = {}) {
  // attempted === 0 is an IDLE tick (no eligible workers), not a failure. Returning null rather
  // than 0 or NaN keeps "nothing to do" distinguishable from "delivered to nobody".
  if (!attempted) return { ratio: null, delivered: 0, attempted: 0 };
  return { ratio: delivered / attempted, delivered, attempted };
}

/** Minimum attempts before a ratio may raise an alarm — suppresses the 0-of-1 tick. */
export const DELIVERY_MIN_SAMPLE = 3;
/** Below this delivered/attempted ratio the pass is degraded. */
export const DELIVERY_ALARM_THRESHOLD = 0.8;

/**
 * Should a degraded-delivery alarm fire for this pass? (FR-6)
 *
 * The minSample floor is why 0-of-1 is silent while 0-of-10 is not: a single undeliverable target
 * on a quiet tick is noise, ten of them is an outage. Without the floor the alarm cries wolf on
 * every one-worker tick and gets ignored, which returns us to a metric nobody reads.
 */
export function shouldAlarmDelivery({ delivered = 0, attempted = 0, threshold = DELIVERY_ALARM_THRESHOLD, minSample = DELIVERY_MIN_SAMPLE } = {}) {
  const { ratio } = computeDeliveryRatio({ delivered, attempted });
  if (ratio === null) return false;          // idle tick
  if (attempted < minSample) return false;   // too few attempts to mean anything
  return ratio < threshold;
}

/** Event type for the durable degraded-delivery alarm (FR-6). Stable and greppable. */
export const DELIVERY_ALARM_EVENT = 'IDLE_QF_HINT_DELIVERY_DEGRADED';
/** Dedup bucket for the alarm — one durable record per window per degraded condition. */
export const DELIVERY_ALARM_WINDOW_MS = 60 * 60 * 1000; // 1h

/** Stable per-window dedup key, so a condition that persists across ticks records ONCE. */
export function deliveryAlarmDedupKey(now = Date.now(), windowMs = DELIVERY_ALARM_WINDOW_MS) {
  return `idle-qf-hint-delivery-degraded:${Math.floor(now / windowMs)}`;
}

/** Default dedup probe: has this window's alarm already been recorded? Throws on a read fault. */
async function defaultHasPriorAlarm(supabase, dedupKey, sinceIso) {
  const res = await supabase
    .from('coordination_events')
    .select('id')
    .eq('event_type', DELIVERY_ALARM_EVENT)
    .gte('created_at', sinceIso)
    .contains('payload', { dedup_key: dedupKey })
    .limit(1);
  if (res && res.error) throw new Error(res.error.message);
  return Boolean(res && res.data && res.data.length);
}

/**
 * Raise a DURABLE degraded-delivery alarm (FR-6).
 *
 * WHY console.error WAS NOT ENOUGH, IN THIS SD'S OWN TERMS. FR-6 opens "a logged skip count is a
 * record nobody reads" — and a stderr line in an unattended coordinator tick is exactly that. The
 * alarm has to land somewhere queryable or the metric repeats the defect it was built to detect.
 * Shaped after lib/chairman/sms-channel-health.js:66-115 (the one existing in-repo ratio-with-alarm)
 * and emitted through the EXISTING bus, logCoordinationEvent, rather than inventing a channel.
 *
 * @returns {Promise<{alarmed:boolean, ratio?:number|null, reason?:string, dedup_key?:string, event_id?:string}>}
 */
export async function emitDeliveryAlarm(supabase, {
  delivered = 0, attempted = 0, undelivered = 0, undeliveredReasons = [],
  threshold = DELIVERY_ALARM_THRESHOLD, minSample = DELIVERY_MIN_SAMPLE,
  windowMs = DELIVERY_ALARM_WINDOW_MS, now = Date.now(),
  emit = logCoordinationEvent, hasPriorAlarm = defaultHasPriorAlarm, logger = console,
} = {}) {
  if (!shouldAlarmDelivery({ delivered, attempted, threshold, minSample })) {
    return { alarmed: false, reason: 'not_degraded' };
  }
  const { ratio } = computeDeliveryRatio({ delivered, attempted });
  const dedupKey = deliveryAlarmDedupKey(now, windowMs);

  // DEDUP FAILS OPEN, DELIBERATELY. A degraded condition persists across ticks, so without
  // suppression the bus fills with identical rows and the alarm becomes the noise it exists to cut
  // through. But a dedup READ that faults must never swallow the alarm: a duplicate record is
  // cheap, a lost outage signal is the whole failure class of this SD.
  try {
    if (await hasPriorAlarm(supabase, dedupKey, new Date(now - windowMs).toISOString())) {
      return { alarmed: false, ratio, reason: 'deduped', dedup_key: dedupKey };
    }
  } catch { /* fail open — emit anyway */ }

  const res = await emit(supabase, {
    event_type: DELIVERY_ALARM_EVENT,
    severity: 'warning',
    payload: {
      dedup_key: dedupKey,
      ratio, delivered, attempted, undelivered,
      threshold, min_sample: minSample, window_ms: windowMs,
      undelivered_reasons: (undeliveredReasons || []).slice(0, 20),
      sd: 'SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001',
    },
  });

  // FAIL-SOFT BUT NEVER SILENT. logCoordinationEvent is fail-open BY CONTRACT — it returns
  // {ok:false} instead of throwing. An unchecked call would therefore report a degraded pass as
  // "alarmed" while nothing was written: reporting success having delivered nothing, one layer up
  // from the bug this SD removes. Mirrors the CANARY warn in lib/chairman/sms-channel-health.js.
  if (!res || !res.ok) {
    logger.warn?.(
      `[coordinator-idle-qf-hint] CANARY: degraded-delivery alarm write FAILED (${(res && res.error) || 'unknown'})`
      + ` — ratio ${delivered}/${attempted} remains UNRECORDED.`,
    );
    return { alarmed: false, ratio, reason: 'alarm_write_failed', dedup_key: dedupKey };
  }
  return { alarmed: true, ratio, dedup_key: dedupKey, event_id: res.id };
}

// SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-D / FR-2: this function is the FIRST of four consumers migrated
// onto the shared predicate (lib/fleet/seat-idle-predicate.mjs), and is the REFERENCE implementation
// the other three are migrated to reproduce -- it was already the richest of the four idle bodies
// (already directed-work aware) before this SD existed. The public signature, every default, and
// every exclusion reason are UNCHANGED; only the mechanism moved to the shared axes
// (sd-holder-authoritative / QF-20260830-885, qf-holder-authoritative / SD-LEO-INFRA-SILENT-HOLDER-AUDIT-001,
// directed-work / QF-20260830-454, recently-released / SD-LEO-INFRA-UNIFY-FLEET-LIVENESS-001,
// spin-up-grace). The default sdHolderSessionIds=null is preserved exactly, so the fail-open-to-mirror
// behaviour fires identically to before migration.
//
// QF-20260903-789: sdHolderFreshnessWindowMs is the ONE new axis wired in here (the reference
// consumer). A held SD claim excludes from idle only while the seat is genuinely ADVANCING
// (last_tool_at fresh within this window) -- Solomon's operating definition: busy=advancing,
// held=blocked-but-available-for-other-work, idle=owns nothing. 15min matches
// RECENTLY_RELEASED_WINDOW_MS and the coordinator-idle-qf-hint cron cadence (backlog-rank-cron.yml,
// every 15min) -- the same "check interval" this fleet already uses elsewhere for seat liveness.
export const SD_HOLDER_FRESHNESS_WINDOW_MS = 15 * 60 * 1000; // 15 min
export function eligibleIdleWorkers(liveWorkers, nowMs, qfHolderSessionIds = new Set(), seatBusySessionIds = new Set(), sdHolderSessionIds = null) {
  return (liveWorkers || []).filter((w) => seatIdleVerdict(w, {
    nowMs,
    sdHolderSessionIds,
    qfHolderSessionIds,
    seatBusySessionIds,
    recentlyReleasedWindowMs: RECENTLY_RELEASED_WINDOW_MS,
    spinUpGraceMs: SPIN_UP_GRACE_MS,
    sdHolderFreshnessWindowMs: SD_HOLDER_FRESHNESS_WINDOW_MS,
  }).idle);
}

/** Pure: the ranked, eligible-for-hint QF candidate list (belt-and-suspenders governance applied). */
export function eligibleQfCandidates(qfs, nowMs) {
  return sortQfCandidatesBySeverity(qfs || []).filter(
    (qf) => isAutoStartableQF(qf, nowMs) && !isHintExcludedGated(qf)
  );
}

function buildHintRow({ qf, coordinatorId, targetSession }) {
  const subject = `Claim hint: ${qf.id} available (idle-absorb)`;
  const body = `IDLE-CAPACITY CLAIM HINT (Adam-authorized, coordinator-relayed): an open unclaimed QF is available for you to absorb idle capacity: ${qf.id} — ${(qf.title || '').slice(0, 120)}. To claim+start: node scripts/qf-start.js ${qf.id}. This is a suggestion, not a hard fence; if you are already mid-work ignore it. If ${qf.id} is already claimed when you try, pick any other open QF or resume your loop.`;
  return {
    sender_type: 'coordinator',
    sender_session: coordinatorId,
    target_session: targetSession,
    message_type: 'INFO',
    subject,
    body,
    payload: { kind: 'coordinator_request', chairman_directive: false, qf_id: qf.id, reply_class: 'fire-and-forget' },
  };
}

export async function runIdleQfHintCore(supabase, { nowMs = Date.now(), dryRun = false } = {}) {
  // SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 (FR-5/FR-6): `attempted` and `undelivered` are the
  // denominator half. `hinted` alone cannot separate 1-of-10 from 9-of-10 — a pass that reports
  // completion while reaching a minority is the same camouflage as a stranded QF that the gauge
  // still counts, which is the other half of this SD.
  // QF-20260808-782: skippedCapped/capUnknown were initialised to 0 rather than left undefined —
  // a counter that only appears once it fires cannot be distinguished from one that never ran.
  // QF-20260903-789: that same reasoning now demands a THIRD distinguishable state, not just two —
  // skippedGated/heldSkipped/claimableWithVerify/skippedCapped/capUnknown all default to null
  // (UNDETERMINED: this pass never reached the section that measures it, e.g. the idle-empty or
  // ranked-empty early returns below) and are overwritten with a real number ONLY once the code
  // that computes them actually runs -- 0 is reserved for a section that ran and genuinely found
  // nothing, never for a section that never ran. The key is always present (same QF-808-782
  // concern), just with a sentinel that cannot be confused with a real measurement.
  const summary = { idleWorkers: 0, hinted: 0, skippedGated: null, heldSkipped: null, claimableWithVerify: null, attempted: 0, undelivered: 0, undeliveredReasons: [], skippedCapped: null, capUnknown: null };

  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: claude_sessions is unbounded and this
  // read has no heartbeat/status filter at all (the QF-763 `.order()` only avoids a STALENESS bias
  // in a capped read, it does not bound the read) — paginate to completion. Fail-open to [] mirrors
  // the prior undefined-on-error → `sessions || []` fallback below.
  let sessions;
  try {
    sessions = await fetchAllPaginated(() => supabase
      .from('claude_sessions')
      .select('*')
      .order('heartbeat_at', { ascending: false })
      .order('session_id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch { sessions = []; }
  const coordinatorId = await getActiveCoordinatorId(supabase).catch(() => null);
  // QF-20260903-831: liveDispatchableFleetMembers (not liveFleetWorkers) so a freshly-spawned,
  // never-claimed, live seat is not filtered out before eligibleIdleWorkers' own spin-up-grace
  // logic ever sees it -- see lib/fleet/session-predicates.mjs for the full rationale.
  const live = liveDispatchableFleetMembers(sessions || [], coordinatorId, nowMs);
  // SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-D FR-2 AC#2/AC#3: this consumer's 3 ctx-population queries
  // (qfHolderSessionIds/seatBusySessionIds/sdHolderSessionIds) are now the shared
  // lib/fleet/idle-ctx-population.mjs resolver -- lifted verbatim, so this remains the reference
  // ctx-population the other three consumers import, not a fourth independent copy.
  const { qfHolderSessionIds, seatBusySessionIds, sdHolderSessionIds, undeliveredReasons } =
    await resolveIdleCtx(supabase, { nowMs });
  summary.undeliveredReasons.push(...undeliveredReasons);
  const idle = eligibleIdleWorkers(live, nowMs, qfHolderSessionIds, seatBusySessionIds, sdHolderSessionIds);
  summary.idleWorkers = idle.length;
  if (idle.length === 0) return summary;

  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: quick_fixes is unbounded and this
  // open-backlog read feeds the ranked hint list below — paginate to completion; fail-open to [].
  //
  // SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001 FR-6: verified_at is a staged (not-yet-applied)
  // column read by isAutoStartableQF() (via eligibleQfCandidates below) as an alternate
  // staleness-clock source. Probe for it first rather than selecting it unconditionally --
  // fetchAllPaginated throws a wrapped Error on any page failure (losing the structured
  // error.code), and this call site's existing catch is a blanket fail-open to qfs=[], so an
  // unconditional select would silently zero out every idle-hint candidate until the migration
  // lands (the QF-20260720-763 / QF-20260724-598 outage class the other readers guard against
  // with a post-error layered retry -- this call site probes first instead, since
  // fetchAllPaginated's thrown error doesn't preserve .code for a post-error retry to key on).
  const QF_HINT_BASE_COLUMNS = 'id, title, description, severity, status, pr_url, commit_sha, created_at, routing_tier, not_before, owner, release_condition';
  let verifiedAtSelectable = true;
  try {
    const { error: probeErr } = await supabase.from('quick_fixes').select('verified_at').limit(1); // schema-lint-disable-line: verified_at is staged (database/migrations/20260816_add_quick_fixes_disposition_columns.sql), probed here before use
    verifiedAtSelectable = !(probeErr && probeErr.code === '42703');
  } catch { verifiedAtSelectable = false; }

  let qfs;
  try {
    qfs = await fetchAllPaginated(() => supabase
      .from('quick_fixes')
      .select(verifiedAtSelectable ? `${QF_HINT_BASE_COLUMNS}, verified_at` : QF_HINT_BASE_COLUMNS)
      .eq('status', 'open')
      .is('pr_url', null)
      .is('commit_sha', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch { qfs = []; }

  const ranked = eligibleQfCandidates(qfs, nowMs);
  summary.skippedGated = (qfs || []).length - ranked.length;
  // QF-20260821-032: of skippedGated, how many are held ONLY by staleness. Computed before the
  // ranked-empty early return -- "ranked empty but claimableWithVerify > 0" is the case this exists to surface.
  summary.claimableWithVerify = (qfs || []).filter(
    (qf) => isClaimableWithVerify(qf, nowMs) && !isHintExcludedGated(qf)
  ).length;
  // SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-6): heldSkipped is a NAMED SUBSET of skippedGated --
  // a batch hold that fences 100% of open QFs must not be invisible to this pass's own summary.
  // Computed BEFORE the ranked-empty early return, mirroring the claimableWithVerify precedent
  // above (both exist so a coordinator reading a zero-ranked pass can tell WHY it was zero).
  summary.heldSkipped = (qfs || []).filter((qf) => isOracleHeldQF(qf)).length;
  if (ranked.length === 0) return summary;

  return deliverHints(idle, ranked, { summary, supabase, coordinatorId, dryRun });
}

/** One place both non-delivery shapes (thrown, and resolved-with-error) record themselves. */
function recordUndelivered(summary, worker, reason) {
  summary.undelivered += 1;
  summary.undeliveredReasons.push(`${String(worker.session_id).slice(0, 8)}:${reason}`);
}

/**
 * Deliver one hint per worker, skipping addressees that cannot be reached.
 * SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 (FR-5/FR-6).
 *
 * SPLIT OUT FROM runIdleQfHintCore SO THE DELIVERY CONTRACT IS TESTABLE WITHOUT A DATABASE. The
 * gathering half needs claude_sessions and quick_fixes; the delivery half — the half that broke —
 * needs neither. Faking the whole fetch layer to reach this loop would have produced a test more
 * complicated than the code, and the FR-5 regression is precisely a LOOP-CONTROL property.
 *
 * `insertRow` is injectable and defaults to the real writer, so production behaviour is unchanged.
 *
 * @param {Array} idle - eligible idle workers
 * @param {Array} ranked - hintable QFs, best first
 * @param {{summary:object, supabase:object, coordinatorId:string, dryRun:boolean, insertRow?:Function}} deps
 */
/**
 * QF-20260808-782: how many hints for THIS (qf, target) pair already exist.
 *
 * UNKNOWN IS NOT ZERO — and that distinction is the whole guard. If this read fails, or PostgREST
 * returns a null count (which a `head:true` count does on a table it cannot see, WITHOUT an error),
 * returning 0 would silently re-uncap the sender: every tick would look like "first hint" forever,
 * which is precisely the 82-identical-sends bug this QF exists to stop. So an unreadable count
 * returns null, the caller treats null as UNKNOWN, and the uncertainty is COUNTED in the summary
 * rather than resolved in the sender's favour.
 */
async function countPriorHintsDefault(supabase, { qfId, targetSession }) {
  try {
    const { count, error } = await supabase
      .from('session_coordination')
      .select('id', { count: 'exact', head: true })
      .eq('target_session', targetSession)
      .eq('payload->>qf_id', qfId);
    if (error) return null;
    return typeof count === 'number' ? count : null;
  } catch {
    // A THROW IS JUST ANOTHER WAY OF "CANNOT READ THE COUNT". It must not kill the sweep — this
    // file already learned that lesson once (FR-5: one unreachable addressee starved every worker
    // later in the loop, observed 2026-07-26). Returning null routes a throw to the same UNKNOWN
    // branch as an error or a null count, so the blindness is COUNTED rather than swallowed.
    return null;
  }
}

/**
 * QF-20260808-782: at most this many hints for one (qf, target) pair, ever.
 * Measured motivation: 82 byte-identical hints for ONE qf to ONE seat in 5.7h (04:08–09:50),
 * plus 12 and 2 for two others — 96 of that seat's last 127 inbox rows, burying a direct
 * coordinator feedback request for 2h20m. An unacked hint after 3 sends means the reader is not
 * reading that lane; it does not mean the reader needs 79 more.
 */
export const HINT_SEND_CAP = 3;

export async function deliverHints(idle, ranked, { summary, supabase, coordinatorId, dryRun = false, insertRow = insertCoordinationRow, countPriorHints = countPriorHintsDefault } = {}) {
  // QF-20260903-789: this section is genuinely REACHED now -- promote its owned counters from
  // UNDETERMINED (null) to a real measurement (0) even if the loop below never increments them.
  // `??` (not `||`) so an already-real 0/number from a prior call in the same object is preserved.
  if (summary) {
    summary.skippedCapped = summary.skippedCapped ?? 0;
    summary.capUnknown = summary.capUnknown ?? 0;
  }
  // One-hint-per-worker, one-QF-per-hint this tick: consume the ranked list as we go so no QF
  // is double-hinted and no worker gets more than one suggestion.
  const remaining = [...ranked];
  for (const worker of idle) {
    const sessionModel = worker.metadata && worker.metadata.model;
    const idx = remaining.findIndex(
      (qf) => tierFitOk(qf, worker) && (typeof sessionModel !== 'string' || !workClassIneligibilityReason(qf, sessionModel))
    );
    if (idx === -1) continue;
    const [qf] = remaining.splice(idx, 1);

    // QF-20260808-782: CAP AND STOP. Checked BEFORE `attempted` because a capped pair was never
    // attempted — counting it would inflate the denominator of the delivery ratio and make a
    // working cap look like degraded delivery.
    //
    // The QF goes BACK on the list: this WORKER has heard about it enough times, but the work is
    // still unhinted and another worker in this pass may fit it. Dropping it would silently reduce
    // supply — the same reasoning the throw/error paths below already use.
    if (!dryRun) {
      const prior = await countPriorHints(supabase, { qfId: qf.id, targetSession: worker.session_id });
      if (prior === null) {
        // Blind, not clean. Send (matching today's behaviour rather than starving the seat), but
        // COUNT the blindness so a cap that cannot see is visible instead of indistinguishable
        // from a cap that saw nothing.
        summary.capUnknown = (summary.capUnknown || 0) + 1;
      } else if (prior >= HINT_SEND_CAP) {
        summary.skippedCapped = (summary.skippedCapped || 0) + 1;
        remaining.splice(idx, 0, qf);
        continue;
      }
    }

    summary.attempted += 1;
    if (!dryRun) {
      // FR-5: SKIP-AND-CONTINUE. insertCoordinationRow -> assertDispatchTarget FAILS CLOSED and
      // THROWS (DISPATCH_TARGET_INVALID / UNKNOWN / LOOKUP_FAILED). Bare, that propagates out of
      // this function to main().catch and exits the process — so ONE seat whose heartbeat aged past
      // the cutoff starved every worker later in this loop, fleet-wide. Observed 2026-07-26.
      //
      // Skipping costs nothing and that was VERIFIED, not assumed: eligibleIdleWorkers is a PURE
      // function over live state with no persistence, no backoff and no memory of who was hinted,
      // so the candidate list is rebuilt from scratch and a skipped target is re-evaluated on the
      // NEXT tick. Had that not held, skip would have converted one loud outage into permanent
      // silent starvation for that seat, and aborting would have been the safer choice.
      let res;
      try {
        res = await insertRow(supabase, buildHintRow({ qf, coordinatorId, targetSession: worker.session_id }));
      } catch (e) {
        recordUndelivered(summary, worker, e && e.code ? e.code : (e && e.message) || 'unknown');
        // Put the QF back: this worker could not be reached, but the work is still unhinted and
        // another worker in THIS pass may fit it. Dropping it would silently reduce supply — the
        // exact failure mode the rest of this SD exists to remove.
        remaining.splice(idx, 0, qf);
        continue;
      }
      // A RESOLVED FAILURE IS STILL A FAILURE — AND IT IS THE COMMON ONE. insertCoordinationRow
      // throws on exactly ONE class (the enum violation, QF-20260725-367) and deliberately returns
      // {data, error} for everything else, "so callers that legitimately inspect {data, error} for
      // transient faults keep today's behaviour" (lib/coordinator/dispatch.cjs). This IS such a
      // caller, so catching only throws counts an RLS denial or a transient insert fault as a
      // DELIVERY. That would seat this SD's own camouflage inside the metric built to detect it:
      // the ratio reads a confident 10-of-10 while every row was dropped. Both fail-shapes have to
      // land in the same denominator or the denominator is decorative.
      if (res && res.error) {
        recordUndelivered(summary, worker, res.error.code || 'INSERT_ERROR');
        remaining.splice(idx, 0, qf); // same reasoning as the throw path above
        continue;
      }
    }
    summary.hinted += 1;
  }
  return summary;
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[coordinator-idle-qf-hint] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const supabase = createClient(url, key);
  const dryRun = process.argv.includes('--dry-run');
  const summary = await runIdleQfHintCore(supabase, { dryRun });
  // FR-6: BOTH numbers, never one. delivered/attempted is what separates 1-of-10 from 9-of-10;
  // `hinted` alone reports "done" in both cases.
  const { ratio } = computeDeliveryRatio({ delivered: summary.hinted, attempted: summary.attempted });
  const pct = ratio === null ? 'n/a' : `${Math.round(ratio * 100)}%`;
  // QF-20260903-789: null means UNDETERMINED (the section that measures it never ran this pass) —
  // render that plainly rather than coercing it to 0, which would misreport "never measured" as
  // "measured and healthy".
  const fmtUndetermined = (n) => (n === null ? 'undetermined' : n);
  console.log(
    `IDLE_QF_HINT idleWorkers=${summary.idleWorkers} delivered=${summary.hinted} attempted=${summary.attempted}`
    + ` ratio=${pct} undelivered=${summary.undelivered} skippedGated=${fmtUndetermined(summary.skippedGated)}`
    + ` heldSkipped=${fmtUndetermined(summary.heldSkipped)}`
    + ` claimableWithVerify=${fmtUndetermined(summary.claimableWithVerify)}`
    + ` skippedCapped=${fmtUndetermined(summary.skippedCapped)} capUnknown=${fmtUndetermined(summary.capUnknown)}${dryRun ? ' (dry-run)' : ''}`,
  );
  // FR-6: the alarm must be DURABLE, not just loud. emitDeliveryAlarm no-ops unless the pass is
  // genuinely degraded (threshold + minSample floor both applied inside).
  const alarm = await emitDeliveryAlarm(supabase, {
    delivered: summary.hinted, attempted: summary.attempted,
    undelivered: summary.undelivered, undeliveredReasons: summary.undeliveredReasons,
  });
  if (alarm.reason !== 'not_degraded') {
    // Loud on stderr AND a stable token, so this is greppable rather than buried in a count. The
    // `durable=` field states whether the queryable record actually landed — never let the stderr
    // line imply a durable alarm that failed to write.
    console.error(
      `[coordinator-idle-qf-hint] DELIVERY_DEGRADED ratio=${pct} delivered=${summary.hinted}/${summary.attempted}`
      + ` threshold=${DELIVERY_ALARM_THRESHOLD} durable=${alarm.alarmed ? alarm.event_id : alarm.reason}`
      + ` undelivered=[${summary.undeliveredReasons.join(', ')}]`,
    );
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error(`[coordinator-idle-qf-hint] FATAL: ${e.message}`);
    process.exit(1);
  });
}
