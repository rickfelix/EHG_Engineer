require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
(async () => {
  const KEY='SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001';
  const { data: sd, error: e1 } = await s.from('strategic_directives_v2').select('id,sd_key,title,status,current_phase,created_at,updated_at,metadata,scope,description').eq('sd_key', KEY);
  console.log('SD err', e1);
  if (sd) sd.forEach(r => { console.log('== SD', r.id, r.sd_key, r.status, r.current_phase, r.created_at); console.log('TITLE:', r.title); console.log('SCOPE:', String(r.scope||'').slice(0,3000)); console.log('DESC:', String(r.description||'').slice(0,2000)); console.log('META:', JSON.stringify(r.metadata||{}).slice(0,5000)); });
  const id = sd && sd[0] && sd[0].id;
  for (const filt of [['sd_id', id], ['directive_id', KEY], ['directive_id', id]]) {
    const { data, error } = await s.from('product_requirements_v2').select('id,title,status,created_at').eq(filt[0], filt[1]);
    console.log('PRD', filt[0], '=', filt[1], '->', error ? error.message : JSON.stringify(data));
  }
})();
