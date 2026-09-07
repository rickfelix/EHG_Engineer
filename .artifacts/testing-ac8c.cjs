const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { resolveHoldProvenance, HOLD_REASON_KEYS } = require('../lib/fleet/claim-eligibility.cjs');
(async () => {
  const { data: sd } = await sb.from('strategic_directives_v2').select('sd_key,status,current_phase,metadata').eq('sd_key','SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A').maybeSingle();
  const m = sd.metadata || {};
  console.log('status:', sd.status, '| phase:', sd.current_phase);
  console.log('\nmetadata keys matching /human|hold|review|reason|action|fenced/:');
  Object.keys(m).filter(k => /human|hold|review|reason|action|fenced|defer/i.test(k)).forEach(k => {
    console.log('   ', k, '=', JSON.stringify(m[k]).slice(0,120), ' (typeof ' + typeof m[k] + ')');
  });
  console.log('\nHOLD_REASON_KEYS present on this row:');
  HOLD_REASON_KEYS.forEach(k => { if (k in m) console.log('   ', k, '=', JSON.stringify(m[k]).slice(0,100)); });
  console.log('\nresolveHoldProvenance ->', JSON.stringify(resolveHoldProvenance(m)));
})();
