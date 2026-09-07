const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await s.from('product_requirements_v2').select('*').eq('id','PRD-SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001').maybeSingle();
  if (error) { console.error('ERR', error.message); process.exit(1); }
  if (!data) { console.log('NO PRD ROW'); process.exit(0); }
  console.log('COLUMNS:', Object.keys(data).join(', '));
  console.log('---updated_at:', data.updated_at, 'status:', data.status, 'phase:', data.phase);
  require('fs').writeFileSync('.artifacts/val-prd-full.json', JSON.stringify(data, null, 2));
  console.log('written .artifacts/val-prd-full.json size', JSON.stringify(data).length);
})();
