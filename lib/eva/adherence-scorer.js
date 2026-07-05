/**
 * Adherence Scorer — applies Child A's rubric registry to Child B's verdict-table
 * rows, producing a behaviorally-anchored 1-5 score per dimension plus a weighted
 * deviation ledger.
 *
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C. Pure read against post_build_verdicts +
 * adherence_rubrics + the deviation ledger — never mutates any of Child A/B's
 * tables (FR-3 role-separation: this module has no remediation side effects).
 *
 * @module lib/eva/adherence-scorer
 */

import { readDeviations } from './deviation-ledger.js';
import { ARTIFACT_TYPES } from './artifact-types.js';

/** Chairman-ratified: a deviation reason must be >=15 chars to even be considered
 *  documented (matches Child B's DEVIATION_REASON_MIN_LENGTH) — but non-empty-and-long
 *  is necessary, not sufficient; see classifyDeviationReason() for the sense-making pass
 *  this module owns exclusively. */
const DEVIATION_REASON_MIN_LENGTH = 15;

/** Explicit artifact_type -> rubric dimension mapping (FR-1 technical requirement:
 *  a single reviewable constant, never inline/ad hoc). Types not listed here are
 *  out of this rubric's scope by design (truth_*, engine_*, marketing_*, build_mvp_build,
 *  wireframe_screens, system_devils_advocate_review, blueprint_financial_projection). */
export const DIMENSION_ARTIFACT_MAP = Object.freeze({
  user_story_coverage: Object.freeze([ARTIFACT_TYPES.BLUEPRINT_USER_STORY_PACK]),
  persona_surface_coverage: Object.freeze([
    ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND,
    ARTIFACT_TYPES.IDENTITY_NAMING_VISUAL,
    ARTIFACT_TYPES.IDENTITY_BRAND_GUIDELINES,
  ]),
  data_model_fidelity: Object.freeze([
    ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL,
    ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM,
    ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT,
    ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC,
  ]),
  architecture_conformance: Object.freeze([
    ARTIFACT_TYPES.BLUEPRINT_TECHNICAL_ARCHITECTURE,
    ARTIFACT_TYPES.BLUEPRINT_PRODUCT_ROADMAP,
  ]),
});

/** Sentinel returned for a dimension with zero evidence-linked claims — distinct from
 *  any numeric score so callers can never mistake "unscored" for a real value. */
export const UNSCORED = Symbol('UNSCORED');

const PASSING_DISPOSITIONS = new Set(['BUILT']);

/**
 * Judge whether a deviation's `why` text is SENSIBLE (names what was planned, what was
 * done instead, and a concrete causal reason) vs THIN/NONSENSICAL (generic, circular,
 * or a bare restatement with no causal content). This is a conservative heuristic:
 * a reason must clear the length floor AND contain at least one causal-connective marker
 * AND not be a pure restatement of "changed"/"different" with nothing else. Ambiguous
 * cases fail toward THIN (never toward SENSIBLE) — mirrors Child B's evidence-linking
 * honesty rule (could-not-verify != built).
 *
 * Per the parent SD's OWNERSHIP CLARIFICATION: Child A/B only validate non-empty;
 * judging sense-making is this module's exclusive job (FR-2).
 *
 * @param {string} why
 * @returns {'SENSIBLE'|'THIN'}
 */
const SENSIBLE_MIN_WORDS = 6;

export function classifyDeviationReason(why) {
  const text = String(why || '').trim();
  if (text.length < DEVIATION_REASON_MIN_LENGTH) return 'THIN';

  const CAUSAL_MARKERS = /\b(because|since|due to|per|requires?|so that|in order to|as a result|caused by|driven by)\b/i;
  const GENERIC_ONLY = /^(decided to (do it|build it|make it) differently|changed (it|this|approach)|different approach|updated (per|based on) feedback)\.?$/i;

  if (GENERIC_ONLY.test(text)) return 'THIN';
  if (!CAUSAL_MARKERS.test(text)) return 'THIN';
  // A word-count floor on top of the causal-marker check: a trivial phrase like
  // "because reasons" trips the marker regex without saying anything — require
  // enough surrounding content for the causal claim to be substantive.
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < SENSIBLE_MIN_WORDS) return 'THIN';
  return 'SENSIBLE';
}

/**
 * Read all post_build_verdicts rows for a venture belonging to one dimension's
 * mapped artifact_types.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId: string, artifactTypes: string[]}} opts
 * @returns {Promise<Array>}
 */
async function readDimensionVerdicts(supabase, { ventureId, artifactTypes }) {
  const { data, error } = await supabase
    .from('post_build_verdicts')
    .select('id, artifact_type, claim_ref, disposition, deviation_artifact_id')
    .eq('venture_id', ventureId)
    .in('artifact_type', artifactTypes);

  if (error) {
    throw new Error(`[adherence-scorer] readDimensionVerdicts failed: ${error.message}`);
  }
  return data || [];
}

/**
 * For a DEVIATED_WITH_DOCUMENTED_REASON verdict row, look up its deviation record(s)
 * and apply FR-2's reason-quality judgment. Returns true only if at least one linked
 * deviation record classifies SENSIBLE.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId: string, claimRef: string}} opts
 * @returns {Promise<boolean>}
 */
async function hasSensibleDeviation(supabase, { ventureId, claimRef }) {
  const records = await readDeviations(supabase, { ventureId, artifactRef: claimRef });
  return records.some((r) => classifyDeviationReason(r.why).toString() === 'SENSIBLE');
}

/**
 * Score one dimension's verdict rows into a 1-5 value (or UNSCORED).
 * Scoring rule: fraction = (count of BUILT + count of DEVIATED_WITH_DOCUMENTED_REASON-
 * with-a-SENSIBLE-reason) / total claims. Maps fraction to the rubric's 1-5 behavioral
 * anchors: 0 claims => UNSCORED; fraction===1 => 5; fraction>=0.5 (but <1, or has any
 * undocumented/thin drift) => 4 if ALL gaps are documented-sensible-deviations, else
 * scaled down; fraction>=0.5 => 3; fraction>0 => 2; fraction===0 with claims present => 1.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId: string, artifactTypes: string[]}} opts
 * @returns {Promise<number|symbol>} 1-5, or UNSCORED
 */
export async function scoreDimension(supabase, { ventureId, artifactTypes }) {
  const rows = await readDimensionVerdicts(supabase, { ventureId, artifactTypes });
  if (rows.length === 0) return UNSCORED;

  let passing = 0;
  let documentedSensible = 0;
  let undocumentedOrThin = 0;

  for (const row of rows) {
    if (PASSING_DISPOSITIONS.has(row.disposition)) {
      passing += 1;
      continue;
    }
    if (row.disposition === 'DEVIATED_WITH_DOCUMENTED_REASON') {
      const sensible = await hasSensibleDeviation(supabase, { ventureId, claimRef: row.claim_ref });
      if (sensible) {
        documentedSensible += 1;
        continue;
      }
    }
    undocumentedOrThin += 1;
  }

  const total = rows.length;
  const goodFraction = (passing + documentedSensible) / total;

  if (goodFraction === 1) return 5;
  if (goodFraction === 0) return 1;
  if (undocumentedOrThin === 0 && goodFraction >= 0.5) return 4; // remaining gaps are all documented+sensible
  if (goodFraction >= 0.5) return 3;
  return 2;
}

/**
 * Score every dimension for a venture against the published rubric row, and
 * evaluate the frozen pass bar (dimension_floor / mean_floor / zero_unscored_fails),
 * read live from the rubric row — never hardcoded (validation-agent LEAD finding).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId: string, rubricKey?: string}} opts
 * @returns {Promise<{dimensionScores: Record<string, number|null>, unscoredDimensions: string[], mean: number, pass: boolean, rubric: object}>}
 */
export async function scoreVerdictTable(supabase, { ventureId, rubricKey = 'post_build_adherence_v1' } = {}) {
  if (!ventureId) throw new Error('[adherence-scorer] scoreVerdictTable requires ventureId');

  const { data: rubric, error: rubricError } = await supabase
    .from('adherence_rubrics')
    .select('rubric_key, version, dimensions, dimension_floor, mean_floor, zero_unscored_fails')
    .eq('rubric_key', rubricKey)
    .eq('status', 'published')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rubricError) {
    throw new Error(`[adherence-scorer] failed to load rubric: ${rubricError.message}`);
  }
  if (!rubric) {
    throw new Error(`[adherence-scorer] no published rubric found for rubric_key=${rubricKey}`);
  }

  const dimensionScores = {};
  const unscoredDimensions = [];
  const scoredValues = [];

  for (const [dimension, artifactTypes] of Object.entries(DIMENSION_ARTIFACT_MAP)) {
    const score = await scoreDimension(supabase, { ventureId, dimension, artifactTypes });
    if (score === UNSCORED) {
      dimensionScores[dimension] = null;
      unscoredDimensions.push(dimension);
    } else {
      dimensionScores[dimension] = score;
      scoredValues.push(score);
    }
  }

  const mean = scoredValues.length > 0 ? scoredValues.reduce((a, b) => a + b, 0) / scoredValues.length : 0;

  let pass = true;
  if (rubric.zero_unscored_fails && unscoredDimensions.length > 0) pass = false;
  if (scoredValues.some((s) => s < rubric.dimension_floor)) pass = false;
  if (mean < rubric.mean_floor) pass = false;
  if (scoredValues.length === 0) pass = false;

  return { dimensionScores, unscoredDimensions, mean, pass, rubric };
}

/**
 * Weighted deviation ledger: all DEVIATED_* verdicts for a venture, ranked by
 * weight (critical-tier first, per Child A's DEVIATION_WEIGHTS), for the chairman
 * review packet (Child D) and remediation prioritization (FR-6).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId: string}} opts
 * @returns {Promise<Array<{verdictId: string, claimRef: string, weight: string, why: string, quality: 'SENSIBLE'|'THIN'}>>}
 */
export async function buildDeviationLedger(supabase, { ventureId } = {}) {
  if (!ventureId) throw new Error('[adherence-scorer] buildDeviationLedger requires ventureId');

  const { data: verdicts, error } = await supabase
    .from('post_build_verdicts')
    .select('id, claim_ref, disposition')
    .eq('venture_id', ventureId)
    .in('disposition', ['DEVIATED_WITH_DOCUMENTED_REASON', 'DEVIATED_UNDOCUMENTED']);

  if (error) {
    throw new Error(`[adherence-scorer] buildDeviationLedger failed to read verdicts: ${error.message}`);
  }

  const ledger = [];
  for (const verdict of verdicts || []) {
    const records = await readDeviations(supabase, { ventureId, artifactRef: verdict.claim_ref });
    for (const record of records) {
      ledger.push({
        verdictId: verdict.id,
        claimRef: verdict.claim_ref,
        weight: record.weight,
        why: record.why,
        quality: classifyDeviationReason(record.why),
      });
    }
  }

  // Critical-tier first (chairman ask): urgency order is critical > moderate > minor >
  // declared-descope (an acknowledged, already-accepted gap — least urgent, not most,
  // despite being last in DEVIATION_WEIGHTS' declaration order — so this is a dedicated
  // priority map, not a reuse of that array's index).
  const URGENCY_RANK = Object.freeze({ critical: 3, moderate: 2, minor: 1, 'declared-descope': 0 });
  const weightRank = (w) => URGENCY_RANK[w] ?? -1;
  return ledger.sort((a, b) => weightRank(b.weight) - weightRank(a.weight));
}

export default { DIMENSION_ARTIFACT_MAP, UNSCORED, classifyDeviationReason, scoreDimension, scoreVerdictTable, buildDeviationLedger };
