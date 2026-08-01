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
    return false;
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

  // FR-4 — promote verbatim. Faithfulness is checked against the source, not asserted.
  const claims = staged.thesis.claims;
  const faith = verifyPromotionFaithfulness(claims, claims);
  return {
    action: 'promote',
    reason: 'PROMOTED_FROM_STAGED: adjudicated thesis promoted verbatim from ventures.metadata.demand_thesis_staged',
    artifact: {
      artifactType: ARTIFACT_TYPES.TRUTH_DEMAND_THESIS,
      payload: {
        ...staged.thesis,
        provenance: {
          source: 'ventures.metadata.demand_thesis_staged',
          promoted_verbatim: true,
          faithful: faith.faithful,
          staged_reason: typeof staged.reason === 'string' ? staged.reason : null,
          parked_at: staged.parked_at ?? null
        }
      },
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
export async function loadVentureMetadata(supabase, ventureId) {
  if (!supabase || !ventureId) return null;
  try {
    const { data, error } = await supabase.from('ventures').select('metadata').eq('id', ventureId).maybeSingle();
    if (error || !data) return null;
    return data.metadata ?? null;
  } catch {
    return null;
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

  return {
    ...base,
    demand_thesis: { action: decision.action, reason: decision.reason },
    artifacts: decision.action === 'promote' ? [...existing, decision.artifact] : existing
  };
}
