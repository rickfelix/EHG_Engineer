const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { resolveHoldProvenance, formatHoldProvenance } = require('../lib/fleet/claim-eligibility.cjs');
(async () => {
  const { data: qf } = await sb.from('quick_fixes').select('id,title,description,metadata').eq('id','QF-20260904-724').maybeSingle();
  if (!qf) { console.log('QF row not found'); return; }
  const text = (qf.title||'') + '\n' + (qf.description||'') + '\n' + JSON.stringify(qf.metadata||{});
  const keys = [...new Set((text.match(/SD-[A-Z0-9-]+/g)||[]))];
  console.log('SD keys named in QF-20260904-724:', keys.length ? keys.join(', ') : '(none found in text)');
  for (const k of keys) {
    const { data: sd } = await sb.from('strategic_directives_v2').select('sd_key,metadata').eq('sd_key',k).maybeSingle();
    if (!sd) { console.log('  ', k, '-> SD row NOT FOUND'); continue; }
    const h = resolveHoldProvenance(sd.metadata);
    console.log('  ', k, '->', h && h.reason ? `RESOLVED via ${h.source_key}: ${String(h.reason).slice(0,70)}` : 'NO REASON RECORDED');
  }
})();
