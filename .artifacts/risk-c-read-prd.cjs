require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  let { data } = await s.from('product_requirements_v2').select('*').eq('id','PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C').maybeSingle();
  if (!data) {
    const r2 = await s.from('product_requirements_v2').select('id,title,directive_id,status,created_at').ilike('id','%MICHAEL%');
    console.log('NOT FOUND; candidates:', JSON.stringify(r2.data,null,2));
    const r3 = await s.from('product_requirements_v2').select('*').eq('directive_id','591400cf-7b88-4974-832a-6043e4f59152').maybeSingle();
    if (r3.data) data = r3.data; else { console.log('none by directive_id uuid'); process.exit(0); }
  }
  console.log(JSON.stringify(data, null, 2));
})();
