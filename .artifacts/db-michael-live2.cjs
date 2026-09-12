require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  for (const t of ['michael_feeder_runs','michael_calendar_day','strategic_directives_v2','michael_nonexistent_xyz']) {
    const r1 = await sb.from(t).select('*').limit(1);
    const r2 = await sb.from(t).select('*', { count: 'exact', head: true });
    console.log(t.padEnd(28), '| select:', r1.error ? `ERR ${r1.error.code} ${(r1.error.message||'').slice(0,50)}` : `ok rows=${r1.data.length}`,
      '| headcount:', r2.error ? `ERR ${r2.error.code}` : `count=${r2.count}`);
  }
  console.log('URL=', process.env.SUPABASE_URL);
})();
