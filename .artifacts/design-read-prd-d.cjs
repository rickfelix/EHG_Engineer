const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
  const { data, error } = await sb.from('product_requirements_v2').select('*').eq('id','PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D').maybeSingle();
  if (error) { console.error(error); process.exit(1); }
  if (!data) {
    const { data: d2 } = await sb.from('product_requirements_v2').select('id,title,directive_id,status').ilike('id','%MICHAEL-ROLE-FORMALIZATION-002%');
    console.log('not found; candidates:', JSON.stringify(d2,null,2)); process.exit(0);
  }
  console.log(JSON.stringify(data, null, 2));
})();
