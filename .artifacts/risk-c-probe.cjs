require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  for (const t of ['michael_credentials','michael_feeder_runs','michael_rules']) {
    const { error } = await s.from(t).select('*').limit(1);
    console.log(t, '->', error ? (error.code + ' ' + error.message.slice(0,80)) : 'PRESENT');
  }
  const { data: pats } = await s.from('issue_patterns').select('pattern_id,category,issue_summary,occurrence_count').or('category.ilike.%security%,category.ilike.%database%,issue_summary.ilike.%oauth%,issue_summary.ilike.%encrypt%').limit(15);
  console.log('PATTERNS:', JSON.stringify(pats, null, 1).slice(0,3000));
})();
