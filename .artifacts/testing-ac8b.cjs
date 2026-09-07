const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { resolveHoldProvenance, formatHoldProvenance } = require('../lib/fleet/claim-eligibility.cjs');
(async () => {
  const { data: qf } = await sb.from('quick_fixes').select('*').eq('id','QF-20260904-724').maybeSingle();
  const text = JSON.stringify(qf);
  console.log('--- description ---');
  console.log(String(qf.description||'').slice(0,1800));
  const keys = [...new Set((text.match(/SD-[A-Z0-9][A-Z0-9-]{4,}/g)||[]))];
  console.log('\n--- SD keys named:', keys.length, '---');
  for (const k of keys) {
    const { data: sd } = await sb.from('strategic_directives_v2').select('sd_key,metadata').eq('sd_key',k).maybeSingle();
    if (!sd) { console.log('  ', k, '-> row NOT FOUND'); continue; }
    const h = resolveHoldProvenance(sd.metadata);
    console.log('  ', k, '->', h && h.reason ? `RESOLVED[${h.source_key}] ${formatHoldProvenance(h).slice(0,60)}` : 'NO REASON RECORDED');
  }
})();
