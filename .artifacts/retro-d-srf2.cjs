require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: srf } = await sb.from('ship_review_findings').select('pr_number,review_tier,finding_count,verdict,multi_agent,finding_categories,metadata').in('pr_number',[8364,8365,8366,8371,8372,8373,8375,8377,8378,8379,8380,8385,8392]).order('pr_number');
  for (const f of srf) console.log(f.pr_number, f.review_tier, 'findings=' + f.finding_count, f.verdict, 'multi=' + f.multi_agent, 'rounds=' + (f.metadata?.rounds ?? f.metadata?.round ?? f.metadata?.review_rounds ?? '?'), 'metaKeys=' + Object.keys(f.metadata || {}).join(','));
  const { data: t } = await sb.from('sub_agent_execution_results').select('metadata').eq('sd_id','3f128d5c-8168-4415-86cc-ab5da4663d11').eq('sub_agent_code','TESTING').order('created_at',{ascending:false}).limit(1);
  const m = t[0].metadata;
  console.log('TESTING metrics', JSON.stringify(m.metrics).slice(0,300));
  console.log('TESTING test_execution', JSON.stringify(m.test_execution).slice(0,500));
  console.log('TESTING shipped_suite', JSON.stringify(m.shipped_suite).slice(0,300));
  const { data: sd } = await sb.from('strategic_directives_v2').select('metadata').eq('id','3f128d5c-8168-4415-86cc-ab5da4663d11').single();
  console.log('SD blocked_*', sd.metadata.blocked_at, sd.metadata.blocked_by_gate, String(sd.metadata.blocked_reason).slice(0,160));
})();
