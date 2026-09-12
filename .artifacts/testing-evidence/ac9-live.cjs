require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { isChairmanGatedQF, GATED_HOLD_COLUMNS } = require('../../lib/fleet/qf-gated-hold.cjs');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const IDS = ['QF-20260713-970','QF-20260905-884','QF-20260905-631'];
const PROV = { metadata: { claim_history: [{ session_id:'s', claimed_at:'2026-09-06T00:00:00Z', identity_source:'env', pick_reason:{score:'UNSCORED',components:{},comparatorVersion:null} }] } };
(async () => {
  console.log('GATED_HOLD_COLUMNS =', GATED_HOLD_COLUMNS);
  const { data, error } = await s.from('quick_fixes').select('*').in('id', IDS);
  if (error) { console.error('ERR', error.message); process.exit(1); }
  console.log('rows found:', data.length);
  for (const row of data) {
    const without = isChairmanGatedQF(row);
    const withProv = isChairmanGatedQF({ ...row, ...PROV });
    console.log(`${row.id} owner=${JSON.stringify(row.owner)} gated_without=${without} gated_with_provenance=${withProv} IDENTICAL=${without===withProv}`);
  }
  console.log('has metadata column on returned row?', data[0] ? Object.keys(data[0]).includes('metadata') : 'n/a');
})();
