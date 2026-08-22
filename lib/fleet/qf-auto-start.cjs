// SD-LEO-INFRA-QF-SUPPLY-PREDICATE-AUTO-START-001 (FR-1): extracted from
// scripts/worker-checkin.cjs so belt-depth accounting (lib/fleet/belt-depth.cjs) can share
// the SAME predicate the worker claim path uses, instead of the looser
// lib/coordinator/qf-supply-predicate.cjs (which deliberately excludes only fixture rows —
// not staleness/tier/factory-lane/chairman-gate — for a different consumer,
// detectThunderingHerd). Moved verbatim; behavior is byte-identical to the pre-extraction
// inline version. worker-checkin.cjs now imports isAutoStartableQF from here (FR-2).
//
/**
 * Pure predicate: is this quick_fixes row safe to AUTO-start via the worker
 * self-claim path? Mirrors (inverts) the verify-first gate in
 * scripts/modules/sd-next/display/quick-fixes.js. Re-implemented INLINE because
 * this predicate is CommonJS and that module is ESM (package.json type:module),
 * so it cannot be require()d there. SD-LEO-INFRA-MAKE-OPEN-QFS-001.
 *
 * *** CORRECTION (SD-LEO-INFRA-REPO-WIDE-TIMEZONE-001). THE REASON ABOVE IS FALSE, AND
 * BELIEVING IT COST FOUR INCOMPLETE FIXES. *** CJS can require ESM: it has been stable
 * since Node 22.12 and this fleet runs 24. It was tested, not assumed — requiring the ESM
 * parseAsUTC from a .cjs returns a working function. The retained text above is left
 * visible rather than deleted because it is the primary evidence for WHY the timezone bug
 * class survived four separate fixes without ever reaching this file: each pass read this
 * docblock, believed reuse was impossible here, and stopped.
 *
 * The one real limit is narrower: require() fails with ERR_REQUIRE_ASYNC_MODULE against a
 * module carrying a TOP-LEVEL AWAIT. That is why the canonical normalizer lives at
 * lib/time/pg-timestamp.cjs — a CJS home carries no such constraint, and ESM can import
 * CJS unconditionally.
 *
 * THE DUPLICATION ITSELF IS STILL REAL and is NOT resolved by this SD: this predicate and
 * scripts/modules/sd-next/display/quick-fixes.js:275 remain independent implementations
 * that both carried the identical timezone defect. Consolidating them is follow-on work.
 */

// SD-LEO-INFRA-REPO-WIDE-TIMEZONE-001: quick_fixes.created_at is `timestamp without time zone`,
// so PostgREST returns it with no designator and Date.parse reads it as LOCAL — shifting every
// age below by the host's UTC offset. Canonical normalizer, deliberately CJS so this file can
// require it directly.
const { pgTimestampMs } = require('../time/pg-timestamp.cjs');
// SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001: canonical chairman-gated-hold predicate (shared
// with sd-next data-loaders + the coordinator dashboard so the sites can never drift).
const { isChairmanGatedQF } = require('./qf-gated-hold.cjs');

// TR-3: this is a shared home for the WORKER's copy only, NOT a full consolidation.
// scripts/modules/sd-next/display/quick-fixes.js:36 independently re-reads the same
// SD_NEXT_QF_STALE_DAYS env var into its own STALE_QF_DAYS constant (ESM, that module cannot
// require() this CJS file without becoming this SD's third cross-module-type merge). Two live
// representations of the same threshold, not one — a future reader should not assume moving the
// worker-checkin.cjs copy here unified all copies.
const STALE_QF_DAYS = Number(process.env.SD_NEXT_QF_STALE_DAYS) || 3;  // verify-first freshness boundary (shared with sd-next display)

// Tier-3 risk keywords (CLAUDE.md Work Item Routing). Auto-self-claim is for small,
// low-risk QFs only. The sd-next display path excludes _escalate via a LIVE re-triage
// (runTriageGate, ESM); a .cjs can't run that pipeline, so we approximate parity with the
// PERSISTED routing_tier PLUS this keyword scan — holding risk-bearing QFs for the
// triage/human path. SD-LEO-INFRA-MAKE-OPEN-QFS-001 (SECURITY re-triage-parity advisory).
const TIER3_RISK_RE = /\b(auth|authentication|authorization|rls|payments?|credentials?|migration|schema|alter\s+table|create\s+table|drop\s+table)\b/i;

// Every gate EXCEPT staleness. Shared by isAutoStartableQF and isClaimableWithVerify
// (QF-20260821-032) so the two predicates can never drift on anything but the age check.
function passesNonStaleGates(qf, nowMs) {
  if (!qf || qf.status !== 'open') return false;
  // SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C FR-1: fixture rows are never self-claimable.
  //
  // THIS IS THE CONSEQUENTIAL SITE IN THE WHOLE SD. Everywhere else an unfiltered fixture row makes
  // a number wrong; HERE it is handed to a REAL WORKER, who then builds against a row that was never
  // real work. The other converted surfaces protect gauges — this one protects a person's afternoon.
  //
  // The defect was INCONSISTENCY, not absence: five surfaces already filter quick_fixes with this
  // exact predicate (recursion-governor.js:128, adam-github-assessment.mjs:136,
  // adam-self-adherence-review.mjs:105, fleet-dashboard.cjs:476 and sd-next/data-loaders.js:473 —
  // the dispatch queue itself) while the CLAIM PATH did not. Five consumers agreed on a convention
  // and the door that hands out work was left out of it.
  //
  // ADDED, never substituted: every exclusion below is a different concern and all of them still run.
  // Degrade-safe like the surrounding predicate, but LOUDLY — an unreported fallback here is
  // indistinguishable from a working filter, and this is the last gate before a worker is dispatched.
  try {
    const { isFixtureQf } = require('../governance/fixture-exclusion.mjs');
    if (isFixtureQf(qf)) return false;
  } catch (e) {
    console.error(`[qf-auto-start] fixture predicate unavailable — self-claim UNFILTERED: ${e?.message || e}`);
  }
  if (qf.pr_url || qf.commit_sha) return false;        // already in PR/commit (verify-first / merge-race guard)
  // SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001: quick_fixes.factory_lane is the structured
  // "coordinator-dispatch only, not worker-self-claimable" marker (replaces the pre-fix free-text
  // "FACTORY-LANE:" convention buried in description, which this predicate could not see -- live
  // incident: QF-20260712-481 self-claimed despite being factory-lane). Fail-closed: any truthy
  // value excludes; only exactly false (the column default) allows self-claim.
  if (qf.factory_lane) return false;
  if (qf.routing_tier != null && Number(qf.routing_tier) >= 3) return false;  // persisted Tier-3 -> full SD, not auto-QF
  // QF-20260725-244: scan TITLE **and** DESCRIPTION. Title-only let QF-20260725-096 through --
  // an auth/security QF whose implied fix ("thread the internal API key into the fetch headers")
  // would publish an app-wide admin-bypass secret to an UNAUTHENTICATED page. Its title reads
  // "internal-API-key", which has no word-boundary `auth`, while its description is saturated
  // with auth / authorization / credential. Verified by executing this exact regex against that
  // row: title=false, description=true. scripts/classify-quick-fix.js already gates on
  // DESCRIPTION and FAILS that QF, so description is the correct surface -- reading the title
  // alone is what let the two surfaces disagree. `description` is already in
  // QF_CANDIDATE_COLUMNS, so this needs no query change.
  if (TIER3_RISK_RE.test(`${qf.title || ''} ${qf.description || ''}`)) return false; // risk-keyword drift -> hold for triage/human
  // SD-LEO-FIX-QUICK-FIXES-NEEDS-001: durable time-gated defer -- a QF genuinely not ready
  // yet (e.g. needs a clean 24h observation window) stays status='open' but is ineligible
  // for claim until not_before passes. Prevents the same worker re-claiming it every cycle.
  if (qf.not_before) {
    const notBefore = Date.parse(qf.not_before);
    if (Number.isFinite(notBefore) && notBefore > nowMs) return false;
  }
  // SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001: chairman-gated hold (owner='chairman' +
  // release_condition) -- the QF-508/QF-970 class whose APPLY awaits a chairman condition.
  // Stays status='open' but is false open work for a worker: exclude until released via
  // scripts/release-chairman-gated-qf.js. Visible on the coordinator surface, never lost.
  if (isChairmanGatedQF(qf)) return false;
  return true;
}

// SD-LEO-INFRA-REPO-WIDE-TIMEZONE-001: naive created_at, see the require at the top of this file.
//
// SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001 (FR-6): a disposition-sweep re-verify
// (verified_at) resets the staleness clock the same way a fresh created_at would. Take the
// MOST RECENT of the two -- Math.max on epoch ms, since a larger ms value is more recent.
// qf.verified_at is undefined pre-migration (and on any caller not yet selecting the column),
// which degrades safely to the created_at-only behavior below -- no special-casing needed.
// pgTimestampMs() returns NaN (never 0) for an absent/unparseable timestamp, and Math.max()
// with a NaN argument returns NaN, so candidates are filtered to finite values BEFORE the max
// (an unfiltered Math.max(pgTimestampMs(a), pgTimestampMs(b)) would silently break to NaN --
// and NaN < STALE_QF_DAYS is always false -- whenever either timestamp is absent).
// Returns null when neither timestamp is parseable (no age can be computed).
function ageDaysOf(qf, nowMs) {
  const candidates = [qf.verified_at, qf.created_at]
    .map((v) => (v ? pgTimestampMs(v) : NaN))
    .filter(Number.isFinite);
  if (candidates.length === 0) return null;
  const ageSourceMs = Math.max(...candidates);
  return (nowMs - ageSourceMs) / (24 * 60 * 60 * 1000);
}

function isAutoStartableQF(qf, nowMs) {
  if (!passesNonStaleGates(qf, nowMs)) return false;
  const ageDays = ageDaysOf(qf, nowMs);
  return ageDays !== null && ageDays < STALE_QF_DAYS;   // exclude stale/verify-first QFs
}

// QF-20260821-032 (coordinator rec 1863ab8b): a QF that clears every gate EXCEPT staleness
// isn't "no supply" -- it needs a disposition-sweep re-verify, not more QFs. Separate predicate
// so the forecaster / idle-hint surfaces can report that count on its own instead of folding
// verify-gated supply into the same 0 as genuinely-empty supply. Deliberately does NOT touch
// STALE_QF_DAYS or widen the window -- same boundary, read from the other side.
function isClaimableWithVerify(qf, nowMs) {
  if (!passesNonStaleGates(qf, nowMs)) return false;
  const ageDays = ageDaysOf(qf, nowMs);
  return ageDays !== null && ageDays >= STALE_QF_DAYS;
}

module.exports = { isAutoStartableQF, isClaimableWithVerify, TIER3_RISK_RE, STALE_QF_DAYS };
