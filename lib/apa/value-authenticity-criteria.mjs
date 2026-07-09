/**
 * Value-Authenticity Criteria Library Reader — L1 runtime dimension
 * (docs/design/value-authenticity-system-design.md §1-L1, §2).
 * SD-LEO-INFRA-VALUE-AUTHENTICITY-APA-001 (pair-half B).
 *
 * Reads the frozen `value_authenticity_criteria_library` table (contract_version
 * 1, shipped by pair-half A, SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-001) directly
 * via Supabase. Deliberately does NOT import pair-half A's ValidatorRegistry.js
 * or extractCriterionId — that code lives on an unmerged branch
 * (SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-001 is pending_approval/LEAD_FINAL as of
 * this SD's authoring). The DB table itself is the frozen coupling artifact;
 * this module's only dependency is the table's row shape, not A's code.
 *
 * @module lib/apa/value-authenticity-criteria
 */

/**
 * Fetch a single criterion by its criterion_id (scheme VA-<T_FORM>-<slug>).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} criterionId
 * @returns {Promise<object|null>} the criterion row, or null if not found
 */
export async function getCriterion(supabase, criterionId) {
  const { data, error } = await supabase
    .from('value_authenticity_criteria_library')
    .select('*')
    .eq('criterion_id', criterionId)
    .maybeSingle();

  if (error) {
    throw new Error(`[value-authenticity-criteria] getCriterion(${criterionId}) failed: ${error.message}`);
  }
  return data;
}

/**
 * Fetch all criteria for a given T-tier (T0-T4).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} tForm - one of 'T0'|'T1'|'T2'|'T3'|'T4'
 * @returns {Promise<object[]>}
 */
export async function getCriteriaByTForm(supabase, tForm) {
  const { data, error } = await supabase
    .from('value_authenticity_criteria_library')
    .select('*')
    .eq('t_form', tForm);

  if (error) {
    throw new Error(`[value-authenticity-criteria] getCriteriaByTForm(${tForm}) failed: ${error.message}`);
  }
  return data ?? [];
}

/**
 * Round-trip SSOT proof (design §4.3): confirm a criterion_id selected at
 * "plan time" (spec authoring) matches a real, current library row, and
 * return its hard_catcher flag for fail-closed aggregation (§2: read the
 * column, never re-derive tiering in code).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} criterionId
 * @returns {Promise<{found: boolean, hardCatcher: boolean|null, tForm: string|null}>}
 */
export async function verifyRoundTrip(supabase, criterionId) {
  const criterion = await getCriterion(supabase, criterionId);
  if (!criterion) {
    return { found: false, hardCatcher: null, tForm: null };
  }
  return { found: true, hardCatcher: criterion.hard_catcher, tForm: criterion.t_form };
}

export default { getCriterion, getCriteriaByTForm, verifyRoundTrip };
