require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
console.log('URL:', url);
const s = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  for(const t of ['michael_feeder_runs','michael_gmail_triage_items','michael_credentials','michael_staged_items','michael_rules','michael_calendar_day','michael_todoist_snapshot','michael_gmail_labels','definitely_not_a_real_table_xyz']){
    const { data, error, status } = await s.from(t).select('*').limit(1);
    console.log(t.padEnd(35), 'status='+status, error? ('ERR '+error.code+' :: '+error.message.slice(0,90)) : ('OK rows='+(data?data.length:'?')+' cols='+(data&&data[0]?Object.keys(data[0]).length:'n/a')));
  }
})();
