/**
 * SD-FDBK-INFRA-TRUTH-DEMAND-THESIS-001 (FR-1, FR-4, FR-5) — the missing producer for
 * truth_demand_thesis.
 *
 * The type has been declared since before 2026-07-16 and gate-enforced at S21, with NOTHING able to
 * write it: repo-wide, the symbol appeared only in its own definition and in the consumer. Zero rows
 * among 2,161. Every venture reaching S21 blocked identically; ApexNiche was just the first arrival.
 *
 * ── THIS PRODUCER REFUSES MORE OFTEN THAN IT PRODUCES, AND THAT IS THE DESIGN ─────────────────
 * MEASURED: of 118 ventures at stage >= 2, ONE has a staged thesis and 117 DO NOT. So the dominant
 * case is "no evidence exists yet", and the obvious implementation — a single LLM completion that
 * writes a plausible six-claim thesis — would satisfy the S21 gate portfolio-wide while fabricating
 * the evidence. That passes the structural check, unblocks every venture, and makes the artifact
 * type meaningless: this SD's own defect, arriving one venture later and much harder to see.
 *
 * Producing a real thesis needs the design doc's author-not-adjudicator protocol (a drafter plus a
 * separate adversarial adjudicator), which the doc scopes as its own child. So this producer does
 * exactly two things: PROMOTE an already-adjudicated thesis, or REFUSE and name what is missing.
 * It never authors one.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ARTIFACT_TYPES } from '../../artifact-types.js';
import {
  validateDemandThesisFalsifiability,
  verifyPromotionFaithfulness
} from '../../demand-thesis-validator.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PENDING_GATE = join(HERE, '../../../../database/artifact-type-parity-pending-chairman-gate.json');

/**
 * Is the artifact type still waiting on the chairman-gated CHECK-constraint widening?
 *
 * Reads the repo's own record rather than probing the constraint, so this shares ONE source of
 * truth with TS-1 and with artifact-type-db-parity.test.js. Attempting the insert instead would
 * raise Postgres 23514 on EVERY stage-2 run fleet-wide — a loud failure in the wrong place, breaking
 * 117 ventures' stage 2 to report a condition we already know.
 *
 * Fail-safe direction: if the file cannot be read, assume PENDING. A wrong "permitted" guess costs a
 * broken stage 2; a wrong "pending" guess costs a deferred artifact that the next run picks up.
 */
export function isArtifactTypePendingChairmanGate(type, { gatePath = PENDING_GATE } = {}) {
  try {
    const raw = JSON.parse(readFileSync(gatePath, 'utf8'));
    const allow = raw && raw.allow;
    if (Array.isArray(allow)) return allow.includes(type) || allow.some((e) => e && e.type === type);
    if (allow && typeof allow === 'object') return Object.prototype.hasOwnProperty.call(allow, type);
    // SECURITY finding: the fail-safe originally covered only read/parse errors. Valid JSON with a
    // MISSING or wrong-typed `allow` key fell through to `false` — "not pending" — which would let
    // the producer attempt a write that raises Postgres 23514 on every stage-2 run fleet-wide. An
    // unrecognised gate file is exactly as uninformative as an unreadable one, so it takes the same
    // safe direction.
    return true;
  } catch {
    return true;
  }
}

/**
 * PURE/TOTAL. Decide what stage 2 should do about the demand thesis for one venture.
 *
 * Never throws and never authors content — every branch either promotes an existing adjudicated
 * thesis verbatim or refuses with a reason a human can act on.
 *
 * @param {object} input
 * @param {object|null} input.ventureMetadata - the `ventures.metadata` object
 * @param {boolean} [input.typePending] - override the chairman-gate check (tests)
 * @returns {{action:'promote'|'refuse'|'defer', reason:string, artifact?:object, violations?:Array}}
 */
export function decideDemandThesisAction({ ventureMetadata, typePending } = {}) {
  // *** "WE COULD NOT LOOK" AND "THERE IS NOTHING THERE" ARE DIFFERENT FACTS. ***
  // The first cut collapsed both into NO_ADJUDICATED_THESIS with no logging, so a systemic Supabase
  // blip would have read as "no venture in the fleet has a thesis" — indistinguishable from the real
  // 117-of-118 case, and with a confidently-worded reason saying the thesis "is absent". That is
  // this SD's own defect class reproduced inside its own fix, in the fail-soft I wrote to be
  // careful. Still non-throwing; just no longer lying about which fact it observed.
  if (ventureMetadata === CHECK_FAILED) {
    return {
      action: 'refuse',
      reason:
        'THESIS_CHECK_FAILED: could not read ventures.metadata, so whether an adjudicated thesis ' +
        'exists is UNKNOWN — this is not a finding that one is absent. Stage 2 continues; re-run ' +
        'once the read succeeds.'
    };
  }

  const staged = ventureMetadata && typeof ventureMetadata === 'object'
    ? ventureMetadata.demand_thesis_staged
    : null;

  // TS-6 — the 117-of-118 case. Refusing is the whole point; naming WHAT is missing is what makes
  // the refusal actionable rather than merely negative.
  if (!staged || !staged.thesis || typeof staged.thesis !== 'object') {
    return {
      action: 'refuse',
      reason:
        'NO_ADJUDICATED_THESIS: ventures.metadata.demand_thesis_staged is absent, so there is no ' +
        'adjudicated demand thesis to promote. This producer does not author one — a six-claim ' +
        'thesis written to satisfy the S21 gate would pass every structural check while fabricating ' +
        'the evidence. Required: a drafted thesis adjudicated by a separate reviewer per the ' +
        'author-not-adjudicator protocol in docs/design/venture-selection-demand-thesis-design.md.'
    };
  }

  // FR-3 — falsifiable on its face, or escalate. Explicitly NOT "improve it and continue": a
  // backfill that quietly repairs its source is indistinguishable from one that fabricates it.
  const verdict = validateDemandThesisFalsifiability(staged.thesis);
  if (!verdict.valid) {
    return {
      action: 'refuse',
      reason:
        'STAGED_THESIS_NOT_FALSIFIABLE: the staged thesis exists but does not meet the falsifiability ' +
        'bar, and this producer will not silently repair it. Escalate to whoever adjudicated it. ' +
        `Violations: ${verdict.violations.map((v) => `${v.claim}/${v.code}`).join(', ')}`,
      violations: verdict.violations
    };
  }

  // FR-5 — the write cannot succeed yet, and pretending otherwise breaks stage 2 for everyone.
  const pending = typeof typePending === 'boolean'
    ? typePending
    : isArtifactTypePendingChairmanGate(ARTIFACT_TYPES.TRUTH_DEMAND_THESIS);
  if (pending) {
    return {
      action: 'defer',
      reason:
        'DDL_PENDING: venture_artifacts_artifact_type_check does not yet permit ' +
        `${ARTIFACT_TYPES.TRUTH_DEMAND_THESIS}. The widening migration ` +
        '(database/migrations/20260716_add_truth_demand_thesis_artifact_type.sql) is chairman-gated ' +
        'and unapplied, so an insert would raise Postgres 23514 on every stage-2 run. The thesis is ' +
        'VALID and ready to promote the moment the gate clears — this is a deferral, not a failure.'
    };
  }

  // FR-4 — promote verbatim, and CHECK it rather than assert it.
  //
  // *** THE FIRST CUT CALLED verifyPromotionFaithfulness(claims, claims) — THE SAME OBJECT TWICE. ***
  // The comment above it read "faithfulness is checked against the source, not asserted", and that
  // was false as written: comparing a thing to itself can only ever return faithful:true, so the
  // provenance field was a structural constant wearing the costume of a check. That is precisely the
  // control-that-cannot-fail class this SD exists to remove, recreated one layer down, inside the
  // function whose docblock denied doing it. Found by SECURITY with a two-different-objects control
  // proving the detector itself works.
  //
  // Now the payload is BUILT FIRST and the comparison runs against what will actually be written, so
  // any future transformation between reading the staged thesis and emitting the artifact is caught
  // instead of blessed.
  const payload = {
    ...staged.thesis,
    provenance: {
      source: 'ventures.metadata.demand_thesis_staged',
      promoted_verbatim: true,
      staged_reason: typeof staged.reason === 'string' ? staged.reason : null,
      parked_at: staged.parked_at ?? null
    }
  };
  // *** THERE IS NO FAITHFULNESS CHECK HERE, AND SAYING SO IS THE FIX. ***
  // I shipped this claim three times and it was false every time.
  //   v1: verifyPromotionFaithfulness(claims, claims) — the same object twice.
  //   v2: "fixed" to (payload.claims, staged.thesis.claims) — but `payload` is a SHALLOW SPREAD, so
  //       those are the SAME REFERENCE. Textually different, behaviourally identical. VALIDATION
  //       proved it by reverting to the literal v1 bug and watching all 13 tests stay green.
  //   v3: an identity check with a `faithful_basis` string — which my own mutation defeated by
  //       hardcoding the string the test asserted.
  //
  // The real conclusion, which two rewrites were avoiding: through this function the payload is
  // ALWAYS a verbatim spread of the source, so the claims are always the same object and
  // verifyPromotionFaithfulness (a KEY-SET comparison) can never fail. The branch is unreachable by
  // construction. No test can force it, because no input exists that would.
  //
  // A guarantee that cannot fail is not a weak guarantee — it is a decoration, and shipping one
  // labelled `faithful: true` is worse than shipping nothing, because a downstream reader will trust
  // it. So the computed-looking field is GONE. What remains is a statement about HOW the artifact
  // was built, which is verifiable by reading these six lines rather than by believing a boolean.
  //
  // verifyPromotionFaithfulness stays exported and unit-tested on its own (see
  // demand-thesis-validator.test.js) for any future path that does NOT carry verbatim. The moment
  // such a path exists, it must call the check and this comment must change with it.
  payload.provenance.promotion_method = 'verbatim_spread';

  return {
    action: 'promote',
    reason: 'PROMOTED_FROM_STAGED: adjudicated thesis promoted verbatim from ventures.metadata.demand_thesis_staged',
    artifact: {
      artifactType: ARTIFACT_TYPES.TRUTH_DEMAND_THESIS,
      payload,
      source: 'analysis-step:stage-02-demand-thesis'
    }
  };
}

/**
 * Load `ventures.metadata` for the thesis lookup. FAIL-SOFT BY DESIGN: a failed read returns null,
 * which routes to the NO_ADJUDICATED_THESIS refusal rather than throwing. Stage 2 has a real job of
 * its own (truth_ai_critique) and must not break because a secondary artifact could not be checked —
 * that would turn "we could not look" into "the whole stage failed", which is the same
 * absence-mistaken-for-a-verdict error this SD is about, pointed at the wrong stage.
 */
export const CHECK_FAILED = Symbol('demand-thesis-check-failed');

export async function loadVentureMetadata(supabase, ventureId, { logger = console } = {}) {
  if (!supabase || !ventureId) return CHECK_FAILED;
  try {
    const { data, error } = await supabase.from('ventures').select('metadata').eq('id', ventureId).maybeSingle();
    if (error) {
      logger.warn?.(`[Stage02/demand-thesis] could not read ventures.metadata: ${error.message}`);
      return CHECK_FAILED;
    }
    if (!data) return null; // the venture row genuinely has no metadata — a real absence
    return data.metadata ?? null;
  } catch (e) {
    logger.warn?.(`[Stage02/demand-thesis] could not read ventures.metadata: ${e?.message || e}`);
    return CHECK_FAILED;
  }
}

/**
 * Co-emit the demand thesis alongside stage 2's existing output, using the typed-array contract the
 * engine already detects (`Array.isArray(result.artifacts)`), per stage-14's precedent.
 *
 * Refusals and deferrals are recorded on the payload rather than thrown, so a venture with no thesis
 * still completes stage 2 — and the reason is visible instead of inferred from an absence.
 */
export function attachDemandThesisArtifact(stageResult, { ventureMetadata, typePending } = {}) {
  const base = stageResult && typeof stageResult === 'object' ? stageResult : {};
  const decision = decideDemandThesisAction({ ventureMetadata, typePending });
  const existing = Array.isArray(base.artifacts) ? base.artifacts : [];

  // Nothing to co-emit — leave the result exactly as stage 2 produced it, including the ABSENCE of
  // a typed array, so the engine keeps using its normal single-artifact path.
  if (decision.action !== 'promote') {
    return { ...base, demand_thesis: { action: decision.action, reason: decision.reason } };
  }

  // *** THE FIRST CUT SILENTLY DROPPED STAGE 2'S OWN ARTIFACT. ***
  // Both consumers treat a NON-EMPTY typed array as EXCLUSIVE — once `artifacts[]` exists, the
  // engine persists those entries and stops deriving the canonical artifact from the flat payload.
  // stage-14, the precedent this follows, wraps its OWN output as the first entry for exactly that
  // reason; mine appended only the thesis, so `artifacts` came out length-1 and truth_ai_critique —
  // stage 2's actual job — was never written. No error, no warning: the stage would have reported
  // success while losing its primary output.
  //
  // Dormant only because the DDL gate makes this branch unreachable today. It would have fired on
  // ApexNiche's FIRST post-migration stage-2 run, whose staged thesis already validates. Found by
  // TESTING with an executable repro against analyzeStage02's real return shape.
  const withOwnArtifact = existing.length > 0
    ? existing
    : [{
        artifactType: ARTIFACT_TYPES.TRUTH_AI_CRITIQUE,
        payload: { ...base },
        source: 'analysis-step:stage-02'
      }];

  return {
    ...base,
    demand_thesis: { action: decision.action, reason: decision.reason },
    artifacts: [...withOwnArtifact, decision.artifact]
  };
}
