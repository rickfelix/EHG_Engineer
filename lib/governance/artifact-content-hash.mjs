/**
 * QF-20260830-312: stamps a stable content hash of an SD (and its PRD, when present)
 * onto every handoff attempt, so ceremony-vs-real-fix (bare re-run vs actual edit
 * between a rejection and the next acceptance) becomes measurable per gate.
 *
 * Hashes cover exactly the fields the handoff gates read: SD title/description/
 * scope/success_criteria/success_metrics/key_changes, and (when a PRD row exists)
 * PRD functional_requirements + test_scenarios (the PRD's smoke-test-adjacent field
 * — strategic_directives_v2 carries the standalone smoke_test_steps column, but
 * product_requirements_v2 does not).
 */
import { createHash } from 'crypto';

function stableHash(fields) {
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

// Best-effort instrumentation: a lookup failure (real error, or a test double whose
// builder doesn't chain the same way as the live client) must never fail the handoff
// this is attached to — same convention as the issue_patterns lookup in createArtifact.
export async function computeArtifactHash(supabase, sdId) {
  const result = { computed_at: new Date().toISOString(), sd: null, prd: null };
  try {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('title, description, scope, success_criteria, success_metrics, key_changes')
      .or(`id.eq.${sdId},sd_key.eq.${sdId}`)
      .maybeSingle();
    if (sd) result.sd = stableHash(sd);

    // product_requirements_v2.directive_id is the VARCHAR SD key; .sd_id is a UUID
    // column — filtering it with a non-UUID sdId would throw a Postgres cast error.
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('functional_requirements, test_scenarios')
      .eq('directive_id', sdId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prd) result.prd = stableHash(prd);
  } catch (err) {
    result.error = err.message;
  }
  return result;
}
