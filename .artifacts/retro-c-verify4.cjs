require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: rf } = await sb.from('ship_review_findings').select('pr_number,review_tier,risk_score,finding_count,finding_categories,verdict,sd_key,metadata').in('pr_number',[8346,8351]).order('created_at');
  for (const r of rf) console.log(JSON.stringify({...r, metadata: JSON.stringify(r.metadata).slice(0,900)}));
  const { data: t } = await sb.from('sub_agent_execution_results').select('id,metadata').eq('id','5d2832f7-0000-0000-0000-000000000000').maybeSingle();
  const { data: t2 } = await sb.from('sub_agent_execution_results').select('id,metadata,detailed_analysis').eq('sd_id','591400cf-7b88-4974-832a-6043e4f59152').eq('sub_agent_code','TESTING').eq('phase','EXEC').limit(1);
  const m = t2?.[0]?.metadata || {};
  console.log('TESTING EXEC metrics:', JSON.stringify({metrics:m.metrics, te:m.test_execution, cmd:m.command, producer:m.producer, run_id:m.run_id, hash:m.content_hash}).slice(0,800));
  const { data: s } = await sb.from('sub_agent_execution_results').select('metadata').eq('sd_id','591400cf-7b88-4974-832a-6043e4f59152').eq('sub_agent_code','SECURITY').eq('phase','EXEC').limit(1);
  const sm = s?.[0]?.metadata||{}; console.log('SECURITY EXEC prov:', JSON.stringify({producer:sm.producer, run_id:sm.run_id, hash:sm.content_hash, sha:sm.evaluated_commit_sha}));
  const { data: v } = await sb.from('sub_agent_execution_results').select('critical_issues,warnings,recommendations').eq('id','b4ed3c2c-0000-0000-0000-000000000000').maybeSingle();
  const { data: v2 } = await sb.from('sub_agent_execution_results').select('warnings,critical_issues').eq('sd_id','591400cf-7b88-4974-832a-6043e4f59152').eq('sub_agent_code','VALIDATION').limit(1);
  console.log('VALIDATION issues:', JSON.stringify(v2?.[0]).slice(0,900));
})();
