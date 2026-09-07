const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await s.from('strategic_directives_v2')
    .select('sd_key,title,status,current_phase,created_at,updated_at,metadata,description')
    .eq('sd_key','SD-LEO-FIX-DELIVERY-RECEIPT-SEVERITY-001').maybeSingle();
  if (!data) { console.log('not found'); return; }
  console.log('status:', data.status, '| phase:', data.current_phase, '| created', data.created_at, '| updated', data.updated_at);
  const m = data.metadata || {};
  for (const k of Object.keys(m)) {
    const v = m[k];
    const str = typeof v === 'string' ? v : JSON.stringify(v);
    if (/cancel|supersede|duplicate|reason|closed|dispos/i.test(k) || /cancel|supersede|duplicate/i.test(str||'')) {
      console.log(`  metadata.${k} = ${String(str).slice(0,400)}`);
    }
  }
  console.log('metadata keys:', Object.keys(m).join(','));
})().then(()=>process.exit(0));
