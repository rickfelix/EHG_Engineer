require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const T = ['michael_rules','michael_gmail_labels','michael_closures','michael_feedback_ledger','michael_feeder_runs','michael_calendar_day','michael_gmail_triage_items','michael_todoist_snapshot','michael_brief_runs','michael_credentials','michael_staged_items'];
(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  for (const t of T) {
    const { error, count } = await sb.from(t).select('*', { count: 'exact', head: true });
    console.log(t.padEnd(30), error ? `ABSENT code=${error.code} :: ${(error.message||'').slice(0,60)}` : `PRESENT rows=${count}`);
  }
})();
