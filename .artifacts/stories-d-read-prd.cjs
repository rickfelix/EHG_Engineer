require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await s.from('product_requirements_v2').select('*').eq('id','PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D').single();
  if (error) { console.error('ERR', error); process.exit(1); }
  console.log('TITLE:', data.title);
  console.log('COLS:', Object.keys(data).join(', '));
  console.log('=== FUNCTIONAL REQUIREMENTS ===');
  console.log(JSON.stringify(data.functional_requirements, null, 2));
})();
