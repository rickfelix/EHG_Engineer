/**
 * Retrodiction of the 4 chairman-caught gaps against the coverage matrix.
 * SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001, FR-5.
 *
 * For each specimen, confirms the surface_class/surface_key it maps to would have rendered as
 * checker=NONE or is_active=false BEFORE the chairman's catch -- a real verdict per specimen,
 * not a single aggregate claim.
 */

export const RETRODICTION_SPECIMENS = [
  {
    id: 'product-touch',
    description: 'Chairman-caught gap: no hands-on product-review stage existed pre-launch (app/customer UI/outward-facing)',
    surface_class: 'work_item_type',
    surface_key: 'ehg_design_decisions',
  },
  {
    id: 'scope-coverage',
    description: 'Chairman-caught gap: SD-scope edits made after PRD creation did not propagate to EXEC',
    surface_class: 'work_item_type',
    surface_key: 'strategic_directives_v2',
  },
  {
    id: 'comms-lane',
    description: 'Chairman-caught gap: a coordinator/Adam comms lane went unchecked (registration lapse during long inline host)',
    surface_class: 'message_lane',
    surface_key: 'coordinator_reply',
  },
  {
    id: 'qf-scanning',
    description: 'Chairman-caught gap: quick-fix queue was not being scanned/enumerated by any checker',
    surface_class: 'work_item_type',
    surface_key: 'quick_fixes',
  },
];

/**
 * @param {object} supabase
 * @returns {Promise<Array<{id: string, verdict: 'pass'|'fail', evidence: object}>>}
 */
export async function retrodictSpecimens(supabase) {
  const results = [];
  for (const specimen of RETRODICTION_SPECIMENS) {
    const { data, error } = await supabase
      .from('coverage_matrix')
      .select('surface_class, surface_key, checker_ids, is_active, status')
      .eq('surface_class', specimen.surface_class)
      .eq('surface_key', specimen.surface_key)
      .maybeSingle();

    if (error) {
      results.push({ id: specimen.id, verdict: 'fail', evidence: { reason: 'query_error', error: error.message } });
      continue;
    }
    if (!data) {
      results.push({ id: specimen.id, verdict: 'fail', evidence: { reason: 'surface_not_in_matrix', specimen } });
      continue;
    }

    const wasUnchecked = !Array.isArray(data.checker_ids) || data.checker_ids.length === 0;
    const wasDormant = data.is_active === false;
    const verdict = (wasUnchecked || wasDormant) ? 'pass' : 'fail';
    results.push({
      id: specimen.id,
      verdict,
      evidence: { checker_ids: data.checker_ids, is_active: data.is_active, status: data.status, wasUnchecked, wasDormant },
    });
  }
  return results;
}

export default { RETRODICTION_SPECIMENS, retrodictSpecimens };
