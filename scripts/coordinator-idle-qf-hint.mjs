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
import { liveFleetWorkers } from '../lib/fleet/genuine-worker.mjs';
import { getActiveCoordinatorId } from '../lib/coordinator/resolve.cjs';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
const { isAutoStartableQF, sortQfCandidatesBySeverity } = require('./worker-checkin.cjs');
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
 * Deliberately simple, conservative tier-fit: routing_tier is a QF SIZE/RISK axis (1=auto-
 * approve, 2=standard), not the same scale as worker capability tier_rank — no existing
 * primitive compares them (assertWorkerTierAllowed explicitly exempts QFs from tier gating
 * entirely). Reserve anything above the simplest routing tier for the fleet's top capability
 * rung; never the reverse (errs toward under-hinting complex work, never over-hinting it).
 */
export function tierFitOk(qf, workerSession) {
  const routingTier = Number(qf.routing_tier);
  if (!Number.isFinite(routingTier) || routingTier <= 1) return true;
  return resolveWorkerTierRank(workerSession) === 1;
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

export function eligibleIdleWorkers(liveWorkers, nowMs) {
  return (liveWorkers || []).filter((w) => {
    if (w.sd_key) return false; // already claiming something — not idle
    const createdAt = w.created_at ? Date.parse(w.created_at) : NaN;
    return Number.isFinite(createdAt) && (nowMs - createdAt) >= SPIN_UP_GRACE_MS;
  });
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
  const summary = { idleWorkers: 0, hinted: 0, skippedGated: 0, attempted: 0, undelivered: 0, undeliveredReasons: [] };

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
  const live = liveFleetWorkers(sessions || [], coordinatorId, nowMs);
  const idle = eligibleIdleWorkers(live, nowMs);
  summary.idleWorkers = idle.length;
  if (idle.length === 0) return summary;

  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: quick_fixes is unbounded and this
  // open-backlog read feeds the ranked hint list below — paginate to completion; fail-open to [].
  let qfs;
  try {
    qfs = await fetchAllPaginated(() => supabase
      .from('quick_fixes')
      .select('id, title, description, severity, status, pr_url, commit_sha, created_at, routing_tier, not_before, owner, release_condition')
      .eq('status', 'open')
      .is('pr_url', null)
      .is('commit_sha', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch { qfs = []; }

  const ranked = eligibleQfCandidates(qfs, nowMs);
  summary.skippedGated = (qfs || []).length - ranked.length;
  if (ranked.length === 0) return summary;

  return deliverHints(idle, ranked, { summary, supabase, coordinatorId, dryRun });
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
export async function deliverHints(idle, ranked, { summary, supabase, coordinatorId, dryRun = false, insertRow = insertCoordinationRow } = {}) {
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
      try {
        await insertRow(supabase, buildHintRow({ qf, coordinatorId, targetSession: worker.session_id }));
      } catch (e) {
        summary.undelivered += 1;
        summary.undeliveredReasons.push(`${String(worker.session_id).slice(0, 8)}:${e && e.code ? e.code : (e && e.message) || 'unknown'}`);
        // Put the QF back: this worker could not be reached, but the work is still unhinted and
        // another worker in THIS pass may fit it. Dropping it would silently reduce supply — the
        // exact failure mode the rest of this SD exists to remove.
        remaining.splice(idx, 0, qf);
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
  console.log(
    `IDLE_QF_HINT idleWorkers=${summary.idleWorkers} delivered=${summary.hinted} attempted=${summary.attempted}`
    + ` ratio=${pct} undelivered=${summary.undelivered} skippedGated=${summary.skippedGated}${dryRun ? ' (dry-run)' : ''}`,
  );
  if (shouldAlarmDelivery({ delivered: summary.hinted, attempted: summary.attempted })) {
    // Loud on stderr AND a stable token, so this is greppable rather than buried in a count.
    console.error(
      `[coordinator-idle-qf-hint] DELIVERY_DEGRADED ratio=${pct} delivered=${summary.hinted}/${summary.attempted}`
      + ` threshold=${DELIVERY_ALARM_THRESHOLD} undelivered=[${summary.undeliveredReasons.join(', ')}]`,
    );
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error(`[coordinator-idle-qf-hint] FATAL: ${e.message}`);
    process.exit(1);
  });
}
