import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEARN-FIX-LEARNING-IMPROVEMENT-005';

const { data: sd, error: sdErr } = await sb.from('strategic_directives_v2').select('id, metadata').eq('sd_key', SD_KEY).single();
if (sdErr) throw sdErr;

const { data: prd, error: fetchErr } = await sb
  .from('product_requirements_v2')
  .select('id, functional_requirements, metadata')
  .eq('directive_id', sd.id)
  .single();
if (fetchErr) throw fetchErr;

const fr = [...prd.functional_requirements];
const fr2Idx = fr.findIndex((f) => f.id === 'FR-2');
fr[fr2Idx] = {
  ...fr[fr2Idx],
  status: 'DEFERRED',
  deferral_reason: 'PR #7978 (SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-012) remains OPEN (verified via gh pr view, mergedAt:null) at EXEC time. FR-2 occupies the exact insertion point #7978 will change in mandatory-testing-validation.js -- landing it now guarantees a conflict this SD cannot safely resolve (a different worker owns #7978). FR-1 and FR-3 (the write side) have no dependency on #7978 and are complete. FR-2 (the gate-side read/verification) is deferred as a tracked follow-up, to be picked up once #7978 merges -- the same pattern #7978\'s own SD used to defer provenance work to this SD in the first place.',
};

const newPrdMetadata = {
  ...prd.metadata,
  exec_phase_deferral: {
    fr: 'FR-2',
    blocked_by_pr: 7978,
    checked_at: new Date().toISOString(),
  },
};

const { error: prdUpdateErr } = await sb
  .from('product_requirements_v2')
  .update({ functional_requirements: fr, metadata: newPrdMetadata })
  .eq('id', prd.id);
if (prdUpdateErr) throw prdUpdateErr;

console.log('FR-2 marked DEFERRED on PRD', prd.id);
