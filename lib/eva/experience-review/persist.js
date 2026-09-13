/**
 * Persistence for the Stage-20 experience-design review pilot (Unit B).
 * SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001 (FR-3, FR-4, FR-5).
 *
 * Reuses the EXISTING canonical write path (writeFindingsBatch) rather than
 * reimplementing persistence -- findings land in venture_quality_findings
 * exactly like every other Stage-20 category, subject to the WARN-cap wired
 * in Unit A. A second, independent write records run-level telemetry into
 * venture_experience_review_runs for Solomon's chairman report.
 *
 * @module lib/eva/experience-review/persist
 */

import { computeFindingHash, validateFindingShape } from '../quality-findings/finding-shape.js';
import { writeFindingsBatch } from '../quality-findings/writer.js';

export const RUN_MODES = Object.freeze(['in_traversal', 'out_of_band_annex']);

/**
 * This pilot's own allowlist -- deliberately NOT WARN_CAPPED_CATEGORIES.
 * REGRESSION sub-agent finding (SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A,
 * VERIFY phase): WARN_CAPPED_CATEGORIES answers "can this category ever
 * drive a Stage-20 FAIL/WARN verdict" -- a question that grew a 4th and 5th
 * member (performance, responsive) when a LATER, unrelated SD needed the
 * same WARN-cap behavior for its own baseline categories. This module's
 * allowlist answers a DIFFERENT question ("is this category one this pilot
 * itself produces"), and had been silently reusing the same array, so it
 * grew right along with it -- a caller could pass category: 'performance' or
 * 'responsive' to a writer whose only intended producer is the experience-
 * design review pilot. One frozen array cannot correctly answer both
 * questions as new SDs keep adding their own WARN-capped categories.
 */
const EXPERIENCE_REVIEW_CATEGORIES = Object.freeze(['usability', 'accessibility', 'journey_coherence']);

/**
 * Transform raw review-agent findings (category/severity/title/detail/
 * evidence_pointer) into canonical FindingShape rows for the given venture.
 * Pure -- no I/O. Throws on a category outside EXPERIENCE_REVIEW_CATEGORIES:
 * this module is scoped to the experience-review pilot only, never a general
 * finding writer for arbitrary categories.
 *
 * @param {Array<{category:string, severity:string, title?:string, detail?:string, evidence_pointer?:Object}>} rawFindings
 * @param {{ ventureId: string }} ctx
 * @returns {Array<Object>} canonical FindingShape rows
 */
export function buildExperienceFindings(rawFindings, { ventureId }) {
  if (!ventureId) throw new Error('buildExperienceFindings: ventureId required');
  if (!Array.isArray(rawFindings)) throw new Error('buildExperienceFindings: rawFindings must be an array');

  return rawFindings.map((f, i) => {
    if (!EXPERIENCE_REVIEW_CATEGORIES.includes(f.category)) {
      throw new Error(
        `buildExperienceFindings[${i}]: category '${f.category}' is not one of the experience-review `
        + `categories (${EXPERIENCE_REVIEW_CATEGORIES.join(', ')}) -- this writer is scoped to the pilot only`
      );
    }
    const finding_signature = String(f.title || f.detail || `${f.category}:${i}`).slice(0, 200);
    const finding_hash = computeFindingHash({
      venture_id: ventureId,
      stage_number: 20,
      finding_category: f.category,
      finding_signature,
    });
    const canonical = {
      venture_id: ventureId,
      stage_number: 20,
      finding_category: f.category,
      severity: f.severity,
      finding_hash,
      evidence_pointer: f.evidence_pointer || { title: f.title, detail: f.detail },
    };
    const v = validateFindingShape(canonical);
    if (!v.valid) throw new Error(`buildExperienceFindings[${i}]: ${v.errors.join('; ')}`);
    return canonical;
  });
}

/**
 * Persist one experience-review run: writes the canonical findings (through
 * the existing Stage-20 pipeline) and one venture_experience_review_runs
 * telemetry row. run_mode='out_of_band_annex' uses the exact same write path
 * as 'in_traversal' -- the only difference is the tag, which is what makes
 * the annex attachable without a separate implementation (FR-5).
 *
 * @param {Object} args
 * @param {Object} args.supabase
 * @param {string} args.ventureId
 * @param {string} args.runId          - caller-supplied idempotency key
 * @param {string} args.runMode        - one of RUN_MODES
 * @param {Array<Object>} args.rawFindings
 * @param {{ durationMs?: number, tokenUsage?: Object, costUsd?: number, deploymentUrl?: string, adapterVersion?: string }} [args.telemetry]
 * @returns {Promise<{ findingsWritten: number, findingsErrors: Array, runRowId: string }>}
 */
export async function persistExperienceReview({ supabase, ventureId, runId, runMode, rawFindings, telemetry = {} }) {
  if (!supabase) throw new Error('persistExperienceReview: supabase client required');
  if (!ventureId) throw new Error('persistExperienceReview: ventureId required');
  if (!runId) throw new Error('persistExperienceReview: runId required');
  if (!RUN_MODES.includes(runMode)) throw new Error(`persistExperienceReview: runMode must be one of ${RUN_MODES.join(', ')}`);

  const canonicalFindings = buildExperienceFindings(rawFindings, { ventureId });
  const writeResult = await writeFindingsBatch(supabase, canonicalFindings);

  const findings_count_by_category = {};
  const severity_breakdown = {};
  for (const f of canonicalFindings) {
    findings_count_by_category[f.finding_category] = (findings_count_by_category[f.finding_category] || 0) + 1;
    severity_breakdown[f.severity] = (severity_breakdown[f.severity] || 0) + 1;
  }

  const { data: runRow, error: runError } = await supabase
    .from('venture_experience_review_runs') // schema-lint-disable-line: table staged, see 20260828_venture_experience_review_runs.sql migration (not yet applied to prod)
    .upsert({
      venture_id: ventureId,
      run_id: runId,
      run_mode: runMode,
      findings_count_by_category,
      severity_breakdown,
      duration_ms: telemetry.durationMs ?? null,
      token_usage: telemetry.tokenUsage ?? {},
      cost_usd: telemetry.costUsd ?? null,
      deployment_url: telemetry.deploymentUrl ?? null,
      adapter_version: telemetry.adapterVersion ?? '1.0.0',
    }, { onConflict: 'venture_id,run_id' })
    .select('id')
    .single();

  if (runError) throw new Error(`persistExperienceReview: telemetry write failed: ${runError.message}`);

  return {
    findingsWritten: writeResult.written,
    findingsErrors: writeResult.errors,
    runRowId: runRow.id,
  };
}
