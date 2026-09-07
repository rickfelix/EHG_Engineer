const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { HOLD_REASON_KEYS } = require('../lib/fleet/claim-eligibility.cjs');
const RE = /_reason$/;
const ALLOW = new Set(['human_action_note','human_action_required']);
const BENIGN = new Set(['dedup_judgement','coordinator_review_reason','unfenced_reason','human_action_review_at']);
const known = new Set([...HOLD_REASON_KEYS, ...BENIGN]);
const shaped = k => RE.test(k) || ALLOW.has(k);
(async () => {
  const unrecognized = new Map();
  let from = 0;
  for (;;) {
    const { data, error } = await sb.from('strategic_directives_v2').select('metadata').range(from, from+499);
    if (error) throw error;
    if (!data || !data.length) break;
    for (const r of data) for (const k of Object.keys(r.metadata||{})) if (shaped(k) && !known.has(k)) unrecognized.set(k,(unrecognized.get(k)||0)+1);
    if (data.length < 500) break;
    from += 500;
  }
  console.log('AC-9 db-half predicate replayed manually (test itself skips: no designated non-prod ref)');
  console.log('unrecognized reason-shaped keys:', unrecognized.size);
  [...unrecognized.entries()].sort((a,b)=>b[1]-a[1]).forEach(([k,c]) => console.log('   ', k, '=>', c, 'rows'));
})();
