const { createClient } = require('@supabase/supabase-js');
require('dotenv/config');
(async () => {
  const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await c.from('product_requirements_v2').select('*').eq('directive_id','SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D');
  if (error) return console.error(error);
  console.log('rows', data.length);
  for (const r of data) console.log('id', r.id, '| status', r.status, '|', r.title);
  require('fs').writeFileSync('.artifacts/db-prd-d.json', JSON.stringify(data, null, 2));
})();
