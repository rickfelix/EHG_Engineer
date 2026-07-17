/**
 * map-writer.mjs — writer for the Fable-suitability map (SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-A).
 *
 * The DURABLE, GRADEABLE persistence seam for Fable-region suitability scores. Child B (the
 * scoring engine) calls upsertRegionScore(); this module owns key normalization, evidence-shape
 * validation, and the history-preserving upsert semantics — so scoring logic never has to know
 * the table contract.
 *
 * HISTORY-PRESERVING (RISK R1): ON CONFLICT (region_key, repo, score_version). A version bump
 * INSERTS a new row (preserving the prediction Solomon's section-11 ledger will later grade); a
 * re-score at the SAME version UPDATES in place (living re-float: last_scored_at / refloated_at /
 * recurrence_weight climb without forking the graded key).
 *
 * CEREMONY_PENDING: the STAGED migration is chairman-gated and may not be applied yet. A write
 * against the absent table surfaces Postgres 42P01 (undefined_table). We type THAT code
 * specifically — never a blanket catch — into a { status:'CEREMONY_PENDING' } result so the
 * caller can treat "table not yet ceremonially applied" as an expected, non-fatal state distinct
 * from a real write failure. On apply, the same code path flips to live with no code change.
 */

export const EVIDENCE_SCHEMA_VERSION = 1;
const VALID_DUTY_CLUSTERS = new Set(['architecture-refactor', 'dedup', 'flaky-RCA', 'harness-depth']);
const REGION_KEY_RE = /^[a-z0-9][a-z0-9._/-]{0,199}$/;

/**
 * "STAGED migration not yet applied" detector. Typed NARROWLY (RISK mandate) — two specific
 * codes, never a blanket catch — because the missing-table signal differs by access path:
 *   - PGRST205: PostgREST/supabase-js path. When the table is absent, PostgREST answers from its
 *     schema cache and NEVER reaches Postgres, so `.from('fable_suitability_map')` yields this,
 *     NOT raw 42P01. This is the code the writer/reader actually hit against a real absent table
 *     (verified live — the unit mock's 42P01 hid it: the mocked-seam trap).
 *   - 42P01: raw Postgres undefined_table, surfaced only on a direct-SQL / RPC path.
 * Any other error is a genuine failure and must propagate.
 */
export function isMissingTableError(error) {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  // Message fallbacks for paths that don't thread the code through.
  if (typeof error.message !== 'string') return false;
  return (
    /could not find the table .*fable_suitability_map.* in the schema cache/i.test(error.message) ||
    /relation .*fable_suitability_map.* does not exist/i.test(error.message)
  );
}

/**
 * Normalize a region key to its canonical, deterministic form: lowercase, backslashes → forward
 * slashes, collapse duplicate slashes, trim a leading/trailing slash and surrounding whitespace.
 * This is the ONLY sanctioned transform — it must stay a pure function of stable structural inputs
 * so the same region always yields the same key across score versions (ledger-JOIN stability).
 * It deliberately does NOT accept a filesystem path; child B passes a declared structural boundary.
 */
export function normalizeRegionKey(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('normalizeRegionKey: region key must be a non-empty string');
  }
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '');
  if (!REGION_KEY_RE.test(normalized)) {
    throw new Error(`normalizeRegionKey: "${raw}" does not normalize to a canonical region key (got "${normalized}")`);
  }
  return normalized;
}

/**
 * Validate the evidence jsonb against its documented shape before it reaches the DB. Fail loud —
 * a malformed evidence blob makes a score unauditable, which defeats the map's justification.
 */
export function validateEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new Error('validateEvidence: evidence must be an object');
  }
  if (evidence.evidence_schema_version !== EVIDENCE_SCHEMA_VERSION) {
    throw new Error(`validateEvidence: evidence_schema_version must be ${EVIDENCE_SCHEMA_VERSION}`);
  }
  const axes = evidence.axes;
  if (!axes || typeof axes !== 'object') {
    throw new Error('validateEvidence: evidence.axes is required');
  }
  for (const axis of ['impact', 'opportunity', 'reasoning_depth']) {
    const a = axes[axis];
    if (!a || typeof a !== 'object') throw new Error(`validateEvidence: axes.${axis} is required`);
    if (!Number.isInteger(a.score) || a.score < 1 || a.score > 5) {
      throw new Error(`validateEvidence: axes.${axis}.score must be an integer 1-5`);
    }
    if (typeof a.rationale !== 'string' || a.rationale.trim() === '') {
      throw new Error(`validateEvidence: axes.${axis}.rationale is required`);
    }
  }
  if (typeof evidence.scored_by !== 'string' || evidence.scored_by.trim() === '') {
    throw new Error('validateEvidence: scored_by is required');
  }
  return true;
}

/**
 * Upsert one region's suitability score. History-preserving on (region_key, repo, score_version).
 *
 * @returns {Promise<{status:'ok', row:object} | {status:'CEREMONY_PENDING', reason:string}>}
 */
export async function upsertRegionScore(supabase, input) {
  const region_key = normalizeRegionKey(input.region_key);
  const repo = input.repo;
  if (typeof repo !== 'string' || repo.trim() === '') {
    throw new Error('upsertRegionScore: repo is required');
  }
  if (!Number.isInteger(input.score_version) || input.score_version < 1) {
    throw new Error('upsertRegionScore: score_version must be a positive integer');
  }
  if (!VALID_DUTY_CLUSTERS.has(input.duty_cluster)) {
    throw new Error(`upsertRegionScore: duty_cluster must be one of ${[...VALID_DUTY_CLUSTERS].join(', ')}`);
  }
  validateEvidence(input.evidence);

  const row = {
    region_key,
    repo,
    score_version: input.score_version,
    duty_cluster: input.duty_cluster,
    axis_impact: input.axis_impact ?? null,
    axis_opportunity: input.axis_opportunity ?? null,
    axis_reasoning_depth: input.axis_reasoning_depth ?? null,
    composite_score: input.composite_score ?? null,
    evidence: input.evidence,
    recurrence_weight: input.recurrence_weight ?? null,
    trigger_reason: input.trigger_reason ?? null,
    status: input.status ?? 'scored',
    last_scored_at: input.last_scored_at ?? new Date().toISOString(),
    refloated_at: input.refloated_at ?? null,
  };

  const { data, error } = await supabase
    .from('fable_suitability_map')
    .upsert(row, { onConflict: 'region_key,repo,score_version' })
    .select()
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return {
        status: 'CEREMONY_PENDING',
        reason: 'fable_suitability_map STAGED migration not yet chairman-applied (Postgres 42P01); write skipped.',
      };
    }
    throw new Error(`upsertRegionScore: ${error.message}`);
  }
  return { status: 'ok', row: data };
}
