import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const sb = createSupabaseServiceClient();
for (const t of ['michael_credentials','michael_gmail_triage_items','michael_feeder_runs']) {
  try {
    const { data, error } = await sb.from(t).select('id').limit(1);
    console.log(t, '->', error ? ('ERR '+error.code+' '+error.message.slice(0,70)) : ('OK rows='+(data||[]).length));
  } catch(e){ console.log(t,'-> THREW', String(e.message).slice(0,110)); }
}
