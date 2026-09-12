require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  for(const t of ['michael_feeder_runs','michael_gmail_triage_items','michael_credentials','michael_staged_items','michael_rules','michael_calendar_day','michael_todoist_snapshot','michael_gmail_labels']){
    const { error, count } = await s.from(t).select('*',{count:'exact',head:true});
    console.log(t.padEnd(30), error? ('ABSENT/ERR '+error.code+' '+error.message.slice(0,60)) : ('PRESENT count='+count));
  }
  const { data: sds } = await s.from('strategic_directives_v2')
    .select('id,sd_key,title,status,current_phase,progress,parent_sd_id')
    .ilike('sd_key','SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002%').limit(20);
  console.log('\n--- SD family ---');
  (sds||[]).forEach(x=>console.log([x.sd_key,x.status,x.current_phase,x.progress].join(' | ')));
})();
