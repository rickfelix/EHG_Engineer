require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const sb = createClient(url, key);
(async () => {
  const { data: sd, error: e0 } = await sb.from('strategic_directives_v2')
    .select('id,sd_key,title,status,current_phase')
    .eq('sd_key','SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D').maybeSingle();
  if (e0) { console.error('SD ERR', e0.message); process.exit(1); }
  console.log('SD:', JSON.stringify(sd));
  const { data, error } = await sb.from('product_requirements_v2')
    .select('id,sd_id,directive_id,status,updated_at,functional_requirements,test_scenarios,acceptance_criteria,activation_test_id,smoke_test_cmd')
    .eq('sd_id', sd.id);
  if (error) { console.error('PRD ERR', error.message); process.exit(1); }
  console.log('PRD rows:', data.length);
  fs.writeFileSync('.artifacts/qa-prd-live.json', JSON.stringify(data, null, 2));
  for (const r of data) {
    console.log('---', r.id, r.status, r.updated_at);
    const ts = r.test_scenarios || [];
    console.log('  test_scenarios:', Array.isArray(ts) ? ts.length : typeof ts);
    const fr = r.functional_requirements || [];
    console.log('  functional_requirements:', Array.isArray(fr) ? fr.length : typeof fr);
    console.log('  activation_test_id:', r.activation_test_id, '| smoke_test_cmd:', r.smoke_test_cmd);
  }
})();
