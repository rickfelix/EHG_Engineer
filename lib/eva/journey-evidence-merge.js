/**
 * Journey Evidence Merge — folds journey-walk outcomes into Child B's EXISTING
 * post_build_verdicts rows (read-then-append, monotonic disposition upgrade
 * only), rather than inventing a new rubric dimension.
 *
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-E (FR-4/FR-5). post_build_verdicts is
 * current-snapshot-only — Child B's runArtifactWalk() DELETEs and rewrites
 * claim-level rows on every invocation, and upsertVerdict() overwrites (no
 * append, no provenance). This module MUST run strictly AFTER Child B's walk
 * completes and BEFORE Child C's convergence loop scores, within the same
 * S19-exit pipeline invocation. Child D (SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-D,
 * "S19->S20 Gate Wiring") shipped ahead of this SD and wires Child C's convergence
 * loop only — it does not call this evidence layer, so the intended caller is a
 * still-pending follow-up wiring step; this module enforces the ordering via a
 * required `walkCompletedAt` marker rather than assuming callers get it right.
 *
 * @module lib/eva/journey-evidence-merge
 */

// @wire-check-exempt: Child E library, same status as persona-generator.js and
// journey-walk-driver.js (same SD) — complete and unit-tested, awaiting a follow-up
// wiring step as its real caller.

import { upsertVerdict } from './post-build-verdict-engine.js';

/** Disposition rank for monotonic-upgrade-only comparisons — higher is "more built".
 *  DEVIATED_* dispositions are left alone by this module (a journey run confirming
 *  a route says nothing about whether a documented deviation is sensible — that
 *  judgment belongs to Child C's reason-quality scoring, not this evidence layer). */
const UPGRADEABLE_FROM = new Set(['MISSING', 'PARTIAL']);

/**
 * Read the current verdict row for (ventureId, artifactType, claimRef).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId: string, artifactType: string, claimRef: string}} opts
 * @returns {Promise<object|null>}
 */
async function readExistingVerdict(supabase, { ventureId, artifactType, claimRef }) {
  const { data, error } = await supabase
    .from('post_build_verdicts')
    .select('id, disposition, evidence_refs, deviation_artifact_id, claim_description')
    .eq('venture_id', ventureId)
    .eq('artifact_type', artifactType)
    .eq('claim_ref', claimRef)
    .maybeSingle();

  if (error) {
    throw new Error(`[journey-evidence-merge] readExistingVerdict failed: ${error.message}`);
  }
  return data;
}

/**
 * Merge one journey-step outcome into the existing verdict for a given claim.
 * Read-then-append: existing evidenceRefs are preserved and the journey's
 * evidence is appended; disposition is upgraded ONLY when it currently sits in
 * UPGRADEABLE_FROM and the journey step succeeded — never downgraded, and never
 * touched for a claim the journey didn't exercise (no matching row = no-op).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId: string, artifactType: string, claimRef: string, stepOutcome: {step: string, url: string, renderedStateSummary: string, success: boolean}}} opts
 * @returns {Promise<{merged: boolean, upgraded: boolean, verdictId: string|null}>}
 */
export async function mergeStepEvidence(supabase, { ventureId, artifactType, claimRef, stepOutcome }) {
  const existing = await readExistingVerdict(supabase, { ventureId, artifactType, claimRef });

  // No matching verdict row for this claim — Child B's walk is the authority on
  // which claims exist; this is a skip, not an error (FR-4 acceptance criteria).
  if (!existing) {
    return { merged: false, upgraded: false, verdictId: null };
  }

  const journeyEvidenceEntry = {
    source: 'journey-walk',
    step: stepOutcome.step,
    path: stepOutcome.url,
    renderedStateSummary: stepOutcome.renderedStateSummary,
    outcome: stepOutcome.success ? 'route-exercised' : 'route-broken',
  };

  const mergedEvidenceRefs = [...(existing.evidence_refs || []), journeyEvidenceEntry];
  const shouldUpgrade = stepOutcome.success && UPGRADEABLE_FROM.has(existing.disposition);
  const newDisposition = shouldUpgrade ? 'BUILT' : existing.disposition;

  const verdictId = await upsertVerdict(supabase, {
    ventureId,
    artifactType,
    claimRef,
    disposition: newDisposition,
    evidenceRefs: mergedEvidenceRefs,
    deviationArtifactId: existing.deviation_artifact_id,
    claimDescription: existing.claim_description,
  });

  return { merged: true, upgraded: shouldUpgrade, verdictId };
}

/**
 * Merge a full journey walk's outcomes into existing verdicts. Requires an
 * explicit `walkCompletedAt` timestamp asserting Child B's artifact walk has
 * already completed for this venture (FR-5's ordering guard) — this module
 * refuses to run without it rather than silently merging onto rows that are
 * about to be (or were never) written by a real Child B pass.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId: string, journeyOutcomes: Array<{step: string, artifactType: string, claimRef: string, url: string, renderedStateSummary: string, success: boolean}>, walkCompletedAt: string}} opts
 * @returns {Promise<{results: Array, mergedCount: number, upgradedCount: number}>}
 */
export async function mergeJourneyEvidence(supabase, { ventureId, journeyOutcomes, walkCompletedAt }) {
  if (!ventureId) throw new Error('[journey-evidence-merge] mergeJourneyEvidence requires ventureId');
  if (!walkCompletedAt) {
    throw new Error(
      '[journey-evidence-merge] mergeJourneyEvidence requires walkCompletedAt — '
      + 'this asserts Child B\'s artifact walk has already completed for this venture '
      + '(FR-5 ordering guard). Call runArtifactWalk() first, then pass its completion '
      + 'timestamp here — never call this module speculatively before Child B\'s walk.'
    );
  }

  const results = [];
  let mergedCount = 0;
  let upgradedCount = 0;

  for (const outcome of journeyOutcomes || []) {
    const { merged, upgraded, verdictId } = await mergeStepEvidence(supabase, {
      ventureId,
      artifactType: outcome.artifactType,
      claimRef: outcome.claimRef,
      stepOutcome: outcome,
    });
    results.push({ step: outcome.step, claimRef: outcome.claimRef, merged, upgraded, verdictId });
    if (merged) mergedCount += 1;
    if (upgraded) upgradedCount += 1;
  }

  return { results, mergedCount, upgradedCount };
}

export default { mergeStepEvidence, mergeJourneyEvidence };
