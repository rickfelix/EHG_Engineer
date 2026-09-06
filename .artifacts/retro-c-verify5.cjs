require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: d } = await sb.from('sub_agent_execution_results').select('warnings,recommendations,critical_issues').eq('sd_id','591400cf-7b88-4974-832a-6043e4f59152').eq('sub_agent_code','DATABASE').eq('phase','PLAN').limit(1);
  console.log('DATABASE PLAN:', JSON.stringify(d?.[0]).slice(0,1500));
  const { data: r } = await sb.from('retrospectives').select('id,retro_type,status,quality_score,generated_by,what_went_well,what_needs_improvement,action_items,success_patterns,failure_patterns').eq('id','6ed9da75-64d8-4c43-9330-974deaab573d').single();
  console.log('NEW RETRO:', JSON.stringify(r,null,1).slice(0,3500));
})();
