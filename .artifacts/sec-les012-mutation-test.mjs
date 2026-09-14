// Mutation test: does the new preservation assertion actually FAIL against the OLD
// (blind-replace) implementation? Uses the same fake-supabase shape as the real test.
function makeWriteFakeSupabase(initialRow) {
  const state = { row: { ...initialRow } };
  return { state, from() { return {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { metadata: state.row.metadata }, error: null }) }) }),
    update: (patch) => ({ eq: () => ({ is: () => ({ select: () => ({ maybeSingle: async () => {
      if (state.row.integration_operationalization !== null) return { data: null, error: null };
      state.row = { ...state.row, ...patch };   // column-level replace, as PostgREST does
      return { data: { id: state.row.id }, error: null };
    } }) }) }) }) }; } };
}

// THE OLD, DESTRUCTIVE IMPLEMENTATION (pre-fix, as it ran in production)
async function writeBackfillRow_OLD(supabase, id, placeholder) {
  const { data: updated } = await supabase.from('product_requirements_v2')
    .update({ integration_operationalization: placeholder,
              metadata: { integration_backfill: { sd: 'SD-LEARN-FIX-ADDRESS-PAT-LES-012' } } })
    .eq('id', id).is('integration_operationalization', null).select('id').maybeSingle();
  return { ok: true, written: !!updated };
}

const priorMetadata = { plan_handoff: {handoff_id:'x'}, design_analysis:{verdict:'PASS'}, database_analysis:{verdict:'PASS'}, sd_key:'SD-EXAMPLE-001' };
const sb = makeWriteFakeSupabase({ id:'prd-1', integration_operationalization: null, metadata: priorMetadata });
await writeBackfillRow_OLD(sb, 'prd-1', {consumers:null,dependencies:null,data_contracts:null,runtime_config:null,observability_rollout:null});

const survived = Object.keys(priorMetadata).filter(k => Object.prototype.hasOwnProperty.call(sb.state.row.metadata, k));
console.log('post-write metadata keys:', Object.keys(sb.state.row.metadata));
console.log('pre-existing keys that survived:', survived.length, 'of', Object.keys(priorMetadata).length);
console.log(survived.length === 0
  ? 'RESULT: assertion WOULD FAIL against the old implementation -> the test is a genuine regression guard.'
  : 'RESULT: assertion would PASS against the old implementation -> the test is VACUOUS.');
