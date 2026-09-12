require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: one } = await sb.from('ship_review_findings').select('*').eq('pr_number', 8378).limit(1);
  console.log('SRF COLS', one && one[0] ? Object.keys(one[0]) : 'none');
  const { data: srf } = await sb.from('ship_review_findings').select('*').in('pr_number',[8364,8365,8366,8371,8372,8373,8375,8377,8378,8379,8380,8385,8392]);
  const byPr = {};
  for (const f of srf || []) { const b = byPr[f.pr_number] = byPr[f.pr_number] || {n:0, tiers:new Set(), rounds:new Set()}; b.n++; if (f.tier) b.tiers.add(f.tier); const r = f.review_round ?? f.round_number ?? f.metadata?.round; if (r != null) b.rounds.add(r); }
  console.log('SRF', Object.entries(byPr).map(([k,v]) => `${k}:${v.n}f tiers=${[...v.tiers]} rounds=${[...v.rounds].sort()}`).join(' | '));
  const { data: t } = await sb.from('sub_agent_execution_results').select('metadata,detailed_analysis').eq('sd_id','3f128d5c-8168-4415-86cc-ab5da4663d11').eq('sub_agent_code','TESTING').order('created_at',{ascending:false}).limit(1);
  const m = t?.[0]?.metadata || {}; const d = t?.[0]?.detailed_analysis || {};
  console.log('TESTING meta keys', Object.keys(m)); console.log('TESTING tests', JSON.stringify(m.test_results || m.tests || d.test_results || d.unit || {}).slice(0,400));
})();
