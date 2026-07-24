/**
 * Chairman Decision Watcher
 *
 * Monitors chairman_decisions table for status changes via Supabase Realtime.
 * Falls back to polling when Realtime is unavailable.
 *
 * Part of SD-EVA-FEAT-CHAIRMAN-API-001
 */

import { ServiceError } from './shared-services.js';
import { computeHealthScore } from './health-score-computer.js';
// SD-LEO-INFRA-DFE-CHAIRMAN-FORWARD-GATE-001: ADVISORY/log-only forward gate.
// Scores each chairman decision via the pure evaluateDecision() engine and records the
// verdict to audit_log ONLY — never mutates chairman_decisions, never blocks (fail-open).
import { recordForwardGateScore } from './forward-gate.js';

const POLLING_INTERVAL_MS = 10_000; // 10 seconds
const REALTIME_CHANNEL = 'chairman-decisions';

// QF-20260703-236: name-pattern defense-in-depth for fixture ventures that omit is_demo --
// is_demo is the primary gate; this catches a fixture factory that forgot to set it.
// Deliberately excludes __citest* -- tests/integration/chairman-decision-api.test.js's
// __citest_chairman__:<run> venture intentionally exercises this module's REAL write path
// end-to-end (its own root cause was the CI workflow running that suite unintentionally
// against production, fixed separately in package.json's test:coverage script), so it must
// still be able to create decisions when the suite is run intentionally.
// QF-20260710-243: widened to also match the `__e2e_*__` e2e-fixture naming convention.
// SD-FDBK-FIX-ISFIXTUREVENTURE-FALSE-POSITIVES-001: further widened with TEST-HARNESS-/
// TS-fixture- (additive, on top of the existing patterns -- never narrowed) as compensating
// defense-in-depth for is_demo-omitting fixture factories, since launch_mode is no longer a
// usable signal (see isFixtureVenture's doc comment for why).
const FIXTURE_VENTURE_NAME_RE = /^(parity-test-|test-stub|__e2e_|TEST-HARNESS-|TS-fixture-)/i;

/**
 * Pure: is this venture a test/CI fixture that must never reach the live chairman queue?
 * is_demo=true is the primary signal; the name pattern is defense-in-depth for fixture
 * factories that omit it.
 *
 * SD-FDBK-FIX-ISFIXTUREVENTURE-FALSE-POSITIVES-001 (CONFIRMED, Adam grep-verified 2026-07-12):
 * launch_mode='simulated' was PREVIOUSLY also treated as a fixture signal here, on the false
 * premise that "no real venture is ever launch_mode=simulated". That premise is wrong --
 * database/migrations/20260703_ventures_launch_mode.sql defines launch_mode NOT NULL DEFAULT
 * 'simulated', and 20260705_launch_mode_flip_guard.sql's own INSERT-guard comment states
 * "ventures are BORN simulated": EVERY real venture starts life at launch_mode='simulated' and
 * is promoted to 'live' only later via an audited flip. Keying fixture-detection on launch_mode
 * therefore misclassified every real venture as a fixture for its entire pre-promotion window,
 * silently self-skipping mintStageZeroGate (confirmed live on both the Image Alt Text Generator
 * and ApexNiche ventures) -- the chairman could see and approve the Stage-0 gate card, but no
 * chairman_decisions row ever minted for the approval-to-activation path to consume. Removed.
 * @param {{is_demo?: boolean, name?: string}|null|undefined} venture
 * @returns {boolean}
 */
export function isFixtureVenture(venture) {
  if (!venture) return false;
  if (venture.is_demo === true) return true;
  return typeof venture.name === 'string' && FIXTURE_VENTURE_NAME_RE.test(venture.name);
}

/**
 * I/O: fetches {is_demo, name} for the fixture-venture check. Fail-open (returns
 * null, never throws) — a lookup fault must never block a legitimate chairman decision,
 * matching this module's existing resolveDecisionHealth fail-open contract.
 * @param {Object} supabase
 * @param {string} ventureId
 * @param {Object} [logger]
 * @returns {Promise<{is_demo?: boolean, name?: string}|null>}
 */
export async function fetchVentureForFixtureCheck(supabase, ventureId, logger = console) {
  try {
    const { data, error } = await supabase.from('ventures').select('is_demo, name').eq('id', ventureId).maybeSingle();
    if (error) {
      logger.warn(`[FixtureVentureCheck] Lookup errored for venture ${ventureId}, proceeding as non-fixture: ${error.message}`);
      return null;
    }
    return data || null;
  } catch (err) {
    logger.warn(`[FixtureVentureCheck] Lookup failed for venture ${ventureId}, proceeding as non-fixture: ${err.message}`);
    return null;
  }
}

// SD-LEO-REFAC-GATE-DECISION-CREATION-001 FR-1: stage_config-derived runtime lookup.
// Authoritative answer comes from RPC stage_creates_decision (predicate:
// gate_type IN ('kill','promotion') OR review_mode='review'). FALLBACK_STAGES below
// is used ONLY when the RPC is unavailable (network error, role-grant misconfig,
// migration not yet deployed); a WARN log fires so operators can investigate.
// CI parity check (TS-7) asserts FALLBACK_STAGES === stage_config-derived set,
// so this constant cannot silently drift again.
export const FALLBACK_DECISION_CREATING_STAGES = new Set([
  // 21 added by SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-B: S21 (Distribution Setup) is now a
  // spend_approval chairman gate (venture_stages.review_mode='review'), so it creates a
  // chairman decision and PAUSES before any budget is committed (advances 21->22 on
  // Continue). Kept in parity with the DB-derived set (TS-7
  // tests/ci/decision-creating-set-parity.test.js).
  // 22 added by SD-LEO-FEAT-CONVERT-STAGE-VISUAL-001: S22 (Visual Assets) is now a
  // creative_handoff chairman gate (venture_stages.review_mode='review'), so it
  // creates a chairman decision. Kept in parity with the DB-derived set (same TS-7 parity test).
  3, 5, 7, 8, 9, 10, 11, 13, 16, 17, 18, 19, 21, 22, 23, 24, 25,
]);

/**
 * Authoritative gate predicate. Returns { creates_decision, gate_type, review_mode }.
 * On RPC error, falls back to FALLBACK_DECISION_CREATING_STAGES and logs WARN.
 *
 * @param {number} stageNumber
 * @param {Object} supabase
 * @param {Object} [options]
 * @param {Object} [options.logger=console]
 * @returns {Promise<{creates_decision: boolean, gate_type: string|null, review_mode: string|null, source: 'rpc'|'fallback'}>}
 */
export async function isDecisionCreatingStage(stageNumber, supabase, { logger = console } = {}) {
  try {
    const { data, error } = await supabase.rpc('stage_creates_decision', { p_stage_number: stageNumber });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row.creates_decision === 'boolean') {
      return {
        creates_decision: row.creates_decision,
        gate_type: row.gate_type ?? null,
        review_mode: row.review_mode ?? null,
        source: 'rpc',
      };
    }
    throw new Error('stage_creates_decision returned malformed payload');
  } catch (err) {
    const creates = FALLBACK_DECISION_CREATING_STAGES.has(stageNumber);
    logger.warn(`[Decision] Lookup fell back to in-process Set (creates=${creates} for stage ${stageNumber}); reason: ${err?.message || err}`);
    return { creates_decision: creates, gate_type: null, review_mode: null, source: 'fallback' };
  }
}

/**
 * Wait for a specific decision to be resolved (approved or rejected).
 *
 * @param {Object} options
 * @param {string} options.decisionId - UUID of the decision to watch
 * @param {Object} options.supabase - Supabase client
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.timeoutMs] - Optional timeout in ms (0 = no timeout)
 * @returns {Promise<{status: string, rationale: string|null, decision: string}>}
 */
export async function waitForDecision({ decisionId, supabase, logger = console, timeoutMs = 0 }) {
  if (!decisionId || !supabase) {
    throw new ServiceError('INVALID_ARGS', 'decisionId and supabase are required', 'ChairmanDecisionWatcher');
  }

  // First check if already resolved
  const { data: current } = await supabase
    .from('chairman_decisions')
    .select('status, rationale, decision')
    .eq('id', decisionId)
    .single();

  if (current && current.status !== 'pending') {
    logger.log(`   Decision ${decisionId} already resolved: ${current.status}`);
    return current;
  }

  return new Promise((resolve, reject) => {
    let subscription = null;
    let pollingTimer = null;
    let timeoutTimer = null;
    let resolved = false;

    function cleanup() {
      if (resolved) return;
      resolved = true;
      if (subscription) {
        supabase.removeChannel(subscription);
        subscription = null;
      }
      if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
      }
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
    }

    function onResolved(data) {
      cleanup();
      resolve({
        status: data.status,
        rationale: data.rationale || null,
        decision: data.decision || null,
      });
    }

    // Try Realtime first
    try {
      subscription = supabase
        .channel(REALTIME_CHANNEL)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'chairman_decisions',
            filter: `id=eq.${decisionId}`,
          },
          (payload) => {
            const newRow = payload.new;
            if (newRow && newRow.status !== 'pending') {
              logger.log(`   Realtime: Decision ${decisionId} → ${newRow.status}`);
              onResolved(newRow);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            logger.log(`   Realtime subscription active for decision ${decisionId}`);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            logger.warn(`   Realtime unavailable (${status}), using polling fallback`);
            // QF-20260701-762: drop the reference only -- do NOT call unsubscribe() or
            // supabase.removeChannel() from inside this callback. Both internally invoke
            // phoenix's Channel.leave(), which can synchronously re-fire this same status
            // callback before settling, causing unbounded recursion (RangeError: Maximum
            // call stack size exceeded) regardless of which teardown method is used.
            // Proven pattern from ae499d9957 / QF-20260701-709 (same fix applied to the
            // sibling reality-gates.js / stage-governance.js channels). cleanup()'s own
            // `if (subscription)` guard now naturally skips removeChannel() here since
            // subscription is already null -- it only ever fires on a channel that
            // resolved via a healthy Realtime event, never one that errored.
            subscription = null;
            startPolling();
          }
        });
    } catch (err) {
      logger.warn(`   Realtime setup failed: ${err.message}, using polling fallback`);
      startPolling();
    }

    // Polling fallback
    function startPolling() {
      if (pollingTimer || resolved) return;
      logger.log(`   Polling fallback active (every ${POLLING_INTERVAL_MS / 1000}s)`);

      pollingTimer = setInterval(async () => {
        if (resolved) return;
        try {
          const { data } = await supabase
            .from('chairman_decisions')
            .select('status, rationale, decision')
            .eq('id', decisionId)
            .single();

          if (data && data.status !== 'pending') {
            logger.log(`   Poll: Decision ${decisionId} → ${data.status}`);
            onResolved(data);
          }
        } catch (err) {
          logger.warn(`   Poll error: ${err.message}`);
        }
      }, POLLING_INTERVAL_MS);
    }

    // Always start polling as a safety net alongside Realtime
    // This ensures detection even if Realtime misses an event
    setTimeout(() => {
      if (!resolved) startPolling();
    }, 5000); // Give Realtime 5s head start

    // Optional timeout
    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        if (!resolved) {
          cleanup();
          reject(new ServiceError('DECISION_TIMEOUT', `Decision ${decisionId} timed out after ${timeoutMs}ms`, 'ChairmanDecisionWatcher'));
        }
      }, timeoutMs);
    }
  });
}

/**
 * Create a PENDING chairman decision for a gate stage.
 *
 * If a PENDING decision already exists for this venture+stage, returns it.
 * Uses ON CONFLICT to handle race conditions.
 *
 * @param {Object} options
 * @param {string} options.ventureId - UUID of the venture
 * @param {number} options.stageNumber - Lifecycle stage number (0, 10, 22, 25)
 * @param {Object} [options.briefData] - Venture brief context
 * @param {string} [options.summary] - One-line summary
 * @param {string} [options.decisionType='stage_gate'] - Decision type (stage_gate, review, etc.)
 * @param {Object} options.supabase - Supabase client
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{id: string, isNew: boolean}>}
 */
// SD-LEO-INFRA-CHAIRMAN-DECISION-HEALTH-PROVENANCE-001 FR-3: extract the gate's quality breakdown
// from a stage's advisory_data so the chairman decision's brief_data carries the REVIEW BASIS
// (quality score, completeness %, critical gaps, gate rationale) instead of an empty header. Tolerates
// the several shapes producers use (top-level or nested under quality/gate). Pure + exported.
export function extractGateQuality(advisoryData) {
  const a = (advisoryData && typeof advisoryData === 'object') ? advisoryData : {};
  const q = (a.quality && typeof a.quality === 'object') ? a.quality : a;
  const gate = (a.gate && typeof a.gate === 'object') ? a.gate : a;
  const num = (...vals) => { for (const v of vals) { const n = Number(v); if (Number.isFinite(n)) return n; } return null; };
  const gaps = a.critical_gaps ?? q.critical_gaps ?? gate.critical_gaps;
  const out = {
    quality_score: num(a.quality_score, q.quality_score, q.overall_quality, a.overall_quality),
    completeness_pct: num(a.completeness_pct, q.completeness_pct, a.completeness, q.completeness),
    critical_gaps: Array.isArray(gaps) ? gaps : (typeof gaps === 'number' ? gaps : (gaps != null ? [gaps] : [])),
    gate_rationale: a.gate_rationale ?? q.gate_rationale ?? gate.rationale ?? a.gate_recommendation ?? null,
  };
  // Only include keys that resolved to something — keep brief_data clean.
  const cleaned = {};
  for (const [k, v] of Object.entries(out)) {
    if (v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    cleaned[k] = v;
  }
  return cleaned;
}

// SD-LEO-INFRA-CHAIRMAN-DECISION-HEALTH-PROVENANCE-001 FR-1: read the health_score for THIS stage
// only (scoped lookup), so a chairman decision never inherits a different stage's verdict. Returns
// the traffic-light string ('green'|'yellow'|'red') or null if the current stage has no health yet.
// Fail-open: any read error returns null (non-fatal — better unknown than a wrong inherited value).
export async function readCurrentStageHealth(supabase, ventureId, stageNumber) {
  try {
    const { data } = await supabase
      .from('venture_stage_work')
      .select('health_score')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', stageNumber)
      .maybeSingle();
    return data?.health_score || null;
  } catch (_) {
    return null;
  }
}

// SD-LEO-INFRA-GATE-NULL-HEALTH-RESOLUTION-001: resolve the health_score the decision is minted with,
// NEVER returning null for a first-visit (clone) stage whose venture_stage_work.health_score column has
// not been written yet. RCA e22d572e: the decision is minted BEFORE the worker's _writeHealthScore runs,
// so readCurrentStageHealth reads an empty column and the mint nulls out → the auto-gate wedges (a NULL
// health cannot be classified green→auto-proceed). venture-1 self-heals on a later poll via the reuse-
// refresh; a clone wedges first and never reaches that poll.
//
// Fix: prefer the stored, stage-scoped value (preserves SD-LEO-INFRA-CHAIRMAN-DECISION-HEALTH-PROVENANCE-001
// — no cross-stage inheritance); when it is null, compute the CURRENT stage's health directly from THIS
// stage's advisory_data so the mint is self-sufficient regardless of caller ordering. Strictly scoped to
// stageNumber — no ORDER BY lifecycle_stage DESC LIMIT 1, so PROVENANCE-001 is not regressed.
export async function resolveDecisionHealth(supabase, ventureId, stageNumber, logger = console) {
  const stored = await readCurrentStageHealth(supabase, ventureId, stageNumber);
  if (stored !== null) return stored;
  try {
    const { data } = await supabase
      .from('venture_stage_work')
      .select('advisory_data')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', stageNumber)
      .maybeSingle();
    // computeHealthScore returns a traffic-light string, or numeric 0 for missing/invalid advisory
    // (a latent shape quirk: that 0 violates the health_score CHECK constraint, which is part of how the
    // column stayed null in the first place). Normalize any non-string to 'red' — a deterministic non-null
    // verdict the gate can act on (no advisory = no artifact to pass), never a wedge.
    const computed = computeHealthScore(data?.advisory_data);
    return typeof computed === 'string' ? computed : 'red';
  } catch (e) {
    // Fail-open: on a read error, preserve the prior behavior (null) rather than guess.
    logger?.warn?.(`[Decision] health fallback failed (non-fatal): ${e.message}`);
    return null;
  }
}

// SD-LEO-INFRA-HEALTH-ROLLUP-CORRECTNESS-001 FR-2: a kill-gate HOLD / route-to-review is NOT a
// failure — the gate verdict ('pass' = numeric pass routed for review, 'conditional_pass' =
// pass-with-review) must drive the held venture's health, not the sparse advisory_data which would
// otherwise resolve to a blanket RED. Map the gate decision to a traffic-light; return null for a
// genuine fail / unknown so the normal advisory-derived resolution still applies.
export function gateDecisionToHealth(decision) {
  if (decision === 'pass') return 'green';
  if (decision === 'conditional_pass') return 'yellow';
  return null;
}

export async function createOrReusePendingDecision({
  ventureId,
  stageNumber,
  briefData = null,
  summary = null,
  decisionType = 'stage_gate',
  // SD-LEO-INFRA-HEALTH-ROLLUP-CORRECTNESS-001 FR-2: when the caller knows the authoritative gate
  // verdict (e.g. a route-to-review HOLD), it supplies the gate-derived health here; it takes
  // precedence over resolveDecisionHealth so a numeric-PASS HOLD is not stamped RED.
  healthOverride = null,
  // SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001 (FR-3): optional explicit attempt_number for a
  // caller doing multi-attempt/re-review tracking. attempt_number otherwise defaults to a
  // hardcoded 1 at the DB level (no caller in this codebase ever incremented it before now) --
  // omit this param to preserve that exact pre-existing behavior for every other caller.
  attemptNumber = null,
  // SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001: stage 0 is deliberately ABSENT from
  // stage_config (adding it would break the TS-7 decision-creating-set parity test and feed
  // can_auto_advance/stage-execution machinery), so stage_creates_decision(0) returns false and
  // this helper would self-skip. The Stage-0 ready path — the one caller that IS the gate — passes
  // forceDecisionCreation:true to skip ONLY the stage predicate. The fixture-venture guard below
  // still runs first and wins: test/demo ventures never mint even with this flag.
  forceDecisionCreation = false,
  // SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 (FR-2): the caller supplies whether this stage
  // is chairman-designated high-consequence (via stage-governance.js isHighConsequence) —
  // this function stays classification-agnostic and just persists what it's told. Defaults
  // false so every pre-existing caller that hasn't been updated keeps today's exact behavior.
  blocking = false,
  supabase,
  logger = console,
}) {
  if (!ventureId || stageNumber === undefined || !supabase) {
    throw new ServiceError('INVALID_ARGS', 'ventureId, stageNumber, and supabase are required', 'ChairmanDecisionWatcher');
  }

  // QF-20260703-236: test/CI fixture ventures (is_demo=true or a fixture-name pattern) must
  // never mint a chairman decision — two specimens (parity-test-* Stage 17, __citest_chairman__
  // Stage 3) leaked into the live queue, one reaching the chairman's email.
  if (isFixtureVenture(await fetchVentureForFixtureCheck(supabase, ventureId, logger))) {
    logger.log(`[Decision] Skipping decision creation for fixture venture ${ventureId} (stage ${stageNumber})`);
    return { id: null, isNew: false, skipped: true, reason: 'fixture_venture' };
  }

  // SD-LEO-REFAC-GATE-DECISION-CREATION-001 FR-2: stage_config-derived gate check.
  // Predicate now lives in RPC stage_creates_decision (FALLBACK_DECISION_CREATING_STAGES
  // used only when RPC is unavailable). Existing observability log line preserved.
  // SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001: skipped only under forceDecisionCreation
  // (Stage-0 chairman gate — see the param doc above).
  if (!forceDecisionCreation) {
    const gate = await isDecisionCreatingStage(stageNumber, supabase, { logger });
    if (!gate.creates_decision) {
      logger.log(`[Decision] Skipping decision creation for non-gate stage ${stageNumber}`);
      return { id: null, isNew: false, skipped: true };
    }
  }

  // SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A: retroactive-halt guard. A venture already sitting
  // at a stage that this SD's migration retroactively cuts over to is_high_consequence=true
  // (stages 3/19/24) must NOT get a blocking decision minted for that pre-existing stage-visit —
  // see venture_stage_cutover_grandfather (database/migrations/20260722_high_consequence_
  // actuation_completeness.sql). Only consulted when the caller actually wants a BLOCKING
  // decision — every other caller passes blocking=false (the overwhelming majority) and never
  // pays this extra query. The grandfather row is intentionally NOT deleted here: this function
  // is invoked repeatedly (once per daemon poll tick) while the venture sits at the gated stage,
  // and deleting on the first check would un-grandfather the SAME stage-visit on the very next
  // tick. It is consumed (deleted) only when the venture actually advances past the stage — see
  // fn_advance_venture_stage / lib/eva/stage-execution-worker.js _advanceStage — so a genuine
  // future re-entry into the same stage_number (if that were ever possible; normal advancement is
  // strictly forward) would not find a stale exemption. Fails CLOSED toward blocking=true (the
  // caller's original request) on a lookup error — safer to occasionally over-hold a grandfathered
  // venture on a transient DB blip than to silently under-enforce a genuinely non-grandfathered
  // high-consequence stage.
  let effectiveBlocking = blocking;
  if (blocking) {
    try {
      const { data: grandfathered, error: grandfatherErr } = await supabase
        .from('venture_stage_cutover_grandfather')
        .select('venture_id')
        .eq('venture_id', ventureId)
        .eq('stage_number', stageNumber)
        .maybeSingle();
      if (grandfatherErr) throw grandfatherErr;
      if (grandfathered) {
        logger.log(`[Decision] Stage ${stageNumber} grandfathered pre-cutover for venture ${ventureId} — minting non-blocking (SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A retroactive-halt guard)`);
        effectiveBlocking = false;
      }
    } catch (e) {
      logger.warn(`[Decision] Grandfather lookup failed for venture ${ventureId} stage ${stageNumber}, proceeding as NOT grandfathered (fail-closed toward blocking): ${e.message}`);
    }
  }

  // Only reuse PENDING decisions of the SAME decision_type — never reuse approved decisions from
  // prior visits, and never merge two distinct decision_types into one row. SD-LEO-INFRA-CHAIRMAN-
  // PRODUCT-REVIEW-001: this lookup previously matched on (venture_id, lifecycle_stage, status)
  // alone, so a caller minting a NEW decision_type at a stage that already had a pending decision
  // of a DIFFERENT type (e.g. a fresh 'product_review' at a stage with a pending 'stage_gate')
  // would silently reuse the wrong row instead of creating its own — two independently-tracked
  // verdicts would collapse into one. Each stage visit requires a fresh chairman decision PER TYPE
  // to ensure current-state validation.
  const { data: existing } = await supabase
    .from('chairman_decisions')
    .select('id, brief_data, blocking')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', stageNumber)
    .eq('decision_type', decisionType)
    .eq('status', 'pending')
    .single();

  if (existing) {
    // SD-LEO-INFRA-CHAIRMAN-DECISION-HEALTH-PROVENANCE-001 FR-1/FR-2: refresh health_score on REUSE
    // too. A reused PENDING decision previously kept its original (possibly stale/wrong) health_score
    // forever — so a re-grounded/approved stage that flipped GREEN still showed RED. Re-read the
    // CURRENT stage's health and update it alongside brief_data.
    const refreshedHealth = healthOverride != null ? healthOverride : await resolveDecisionHealth(supabase, ventureId, stageNumber, logger);
    // SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 (adversarial-review fix, PR #6104): a REUSED pending
    // decision previously never had its `blocking` column synced to the caller's current
    // classification, so a stage reclassified high-consequence AFTER a non-blocking decision was
    // already pending would stay blocking=false forever (the chokepoints' blocking=true EXISTS
    // check would never see it) -- contradicting "reclassifying a stage takes effect immediately".
    const blockingChanged = existing.blocking !== effectiveBlocking;
    if (briefData || refreshedHealth !== null || blockingChanged) {
      const update = {};
      // SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001: MERGE into the existing brief_data, never replace
      // it outright. escalateChairmanDecision stamps escalation_email_sent_at/digest_sent_at directly
      // onto this same brief_data column to dedup its "one email per decision" contract -- a bare
      // replace on every reuse silently erased that marker, so a caller that re-mints on a poll loop
      // (e.g. requestProductReview, called on every blocked _advanceStage tick) would re-send the
      // chairman email on every single tick instead of exactly once.
      if (briefData) { update.brief_data = { ...(existing.brief_data || {}), ...briefData }; update.summary = summary; }
      if (refreshedHealth !== null) update.health_score = refreshedHealth;
      if (blockingChanged) update.blocking = effectiveBlocking;
      await supabase
        .from('chairman_decisions')
        .update(update)
        .eq('id', existing.id);
    }
    logger.log(`   Reusing existing PENDING decision: ${existing.id}`);
    // ADVISORY/log-only forward gate (fail-open, idempotent — never blocks/alters the decision).
    await recordForwardGateScore(
      { id: existing.id, lifecycle_stage: stageNumber, brief_data: briefData, summary, decision_type: decisionType },
      { supabase, logger },
    );
    return { id: existing.id, isNew: false };
  }

  // SD-LEO-INFRA-CHAIRMAN-DECISION-HEALTH-PROVENANCE-001 FR-1: the decision's health_score must
  // reflect the CURRENT stage's verdict — NOT the latest-across-stages value. The prior lookup used
  // ORDER BY lifecycle_stage DESC LIMIT 1 with no stage filter, so it inherited a different stage's
  // health (chairman saw RED on a GREEN-passing gate). Scope the lookup to THIS stage.
  // SD-LEO-INFRA-GATE-NULL-HEALTH-RESOLUTION-001: resolveDecisionHealth never returns null for a
  // first-visit clone stage — it falls back to the current stage's advisory_data so the mint can be
  // resolved by the auto-gate instead of wedging on a NULL health_score.
  const healthScore = healthOverride != null ? healthOverride : await resolveDecisionHealth(supabase, ventureId, stageNumber, logger);

  // Create new PENDING decision — always set decision_type to avoid NULL
  // (SD-MAN-FIX-FIX-DUPLICATE-ARTIFACTS-001: NULL decision_type breaks .neq filters)
  const { data: created, error } = await supabase
    .from('chairman_decisions')
    .insert({
      venture_id: ventureId,
      lifecycle_stage: stageNumber,
      status: 'pending',
      decision: 'pending',
      decision_type: decisionType,
      summary: summary || `Gate decision required for stage ${stageNumber}`,
      brief_data: briefData,
      health_score: healthScore,
      blocking: effectiveBlocking,
      ...(attemptNumber != null ? { attempt_number: attemptNumber } : {}),
    })
    .select('id')
    .single();

  if (error) {
    // Handle unique constraint violation (race condition or re-entry after approval)
    if (error.code === '23505') {
      // First check for pending decisions (race condition). SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001:
      // scoped to decisionType — without it, a 23505 raised by inserting decision_type='product_review'
      // (attempt_number default collision, see database/migrations/20260704_chairman_decisions_decision_type_uniqueness.sql)
      // would find and return the UNRELATED pre-existing 'stage_gate' pending decision at this same
      // stage, silently merging two independently-tracked decision_types into one row — exactly the
      // bug class already fixed in the pre-check lookup above; it also lived here, unfixed, until now.
      const { data: raced } = await supabase
        .from('chairman_decisions')
        .select('id')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', stageNumber)
        .eq('decision_type', decisionType)
        .eq('status', 'pending')
        .single();

      if (raced) {
        logger.log(`   Race condition handled, reusing: ${raced.id}`);
        return { id: raced.id, isNew: false };
      }

      // SD-VW-FIX-WORKER-GATE-REENTRY-001: Check for already-resolved decisions
      // (re-entry after approval). Return the existing decision so the caller
      // can detect it's already been handled. Scoped to decisionType for the same reason as above.
      const { data: resolved } = await supabase
        .from('chairman_decisions')
        .select('id')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', stageNumber)
        .eq('decision_type', decisionType)
        .in('status', ['approved', 'rejected'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (resolved) {
        logger.log(`   Re-entry detected: decision ${resolved.id} already resolved`);
        return { id: resolved.id, isNew: false };
      }
    }
    throw new ServiceError('DECISION_CREATE_FAILED', `Failed to create decision: ${error.message}`, 'ChairmanDecisionWatcher');
  }

  logger.log(`   New PENDING decision created: ${created.id}`);
  // ADVISORY/log-only forward gate (fail-open, idempotent — never blocks/alters the decision).
  await recordForwardGateScore(
    { id: created.id, lifecycle_stage: stageNumber, brief_data: briefData, summary, decision_type: decisionType, health_score: healthScore },
    { supabase, logger },
  );
  return { id: created.id, isNew: true };
}

/**
 * Create a non-blocking advisory notification for informational stages.
 *
 * Unlike createOrReusePendingDecision(), advisory notifications are
 * fire-and-forget: they do not block the pipeline and failures are
 * logged but never propagated.
 *
 * @param {Object} options
 * @param {string} options.ventureId - UUID of the venture
 * @param {number} options.stageNumber - Lifecycle stage number (3, 5, 16, 23)
 * @param {Object} [options.briefData] - Stage output data for the brief
 * @param {string} [options.summary] - One-line summary of the advisory
 * @param {Object} options.supabase - Supabase client
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{id: string}|null>} Created record or null on failure
 */
export async function createAdvisoryNotification({
  ventureId,
  stageNumber,
  briefData = null,
  summary = null,
  supabase,
  logger = console,
}) {
  try {
    if (!ventureId || stageNumber === undefined || !supabase) {
      logger.warn('[Advisory] Missing required args (ventureId, stageNumber, supabase)');
      return null;
    }

    // QF-20260703-236: same fixture-venture guard as createOrReusePendingDecision.
    if (isFixtureVenture(await fetchVentureForFixtureCheck(supabase, ventureId, logger))) {
      logger.log(`[Advisory] Skipping notification for fixture venture ${ventureId} (stage ${stageNumber})`);
      return null;
    }

    const { data, error } = await supabase
      .from('chairman_decisions')
      .insert({
        venture_id: ventureId,
        lifecycle_stage: stageNumber,
        status: 'approved',
        decision: 'advisory',
        decision_type: 'advisory',
        blocking: false,
        summary: summary || `Advisory checkpoint for stage ${stageNumber}`,
        brief_data: briefData,
      })
      .select('id')
      .single();

    if (error) {
      logger.warn(`[Advisory] Insert failed for stage ${stageNumber}: ${error.message}`);
      return null;
    }

    logger.log(`[Advisory] Notification created for stage ${stageNumber}: ${data.id}`);
    return { id: data.id };
  } catch (err) {
    logger.warn(`[Advisory] Unexpected error for stage ${stageNumber}: ${err.message}`);
    return null;
  }
}
