const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await s.from('strategic_directives_v2').select('metadata').eq('sd_key','SD-LEO-FIX-DELIVERY-RECEIPT-SEVERITY-001').maybeSingle();
  const m = data?.metadata || {};
  console.log('dedup_match_sd_key =', JSON.stringify(m.dedup_match_sd_key));
  console.log('source_qf_id =', JSON.stringify(m.source_qf_id));
  console.log('escalated_from_qf =', JSON.stringify(m.escalated_from_qf));
  console.log('claim_history =', JSON.stringify(m.claim_history)?.slice(0,600));
})().then(()=>process.exit(0));
