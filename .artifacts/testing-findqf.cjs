const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  for (const t of ['quick_fixes','feedback','issue_patterns']) {
    try {
      const { data, error } = await sb.from(t).select('*').or('id.eq.QF-20260904-724,title.ilike.%20260904-724%,description.ilike.%20260904-724%').limit(3);
      if (error) { console.log(t, 'ERR', error.message); continue; }
      console.log(t, '->', (data||[]).length, 'rows');
      (data||[]).forEach(r => console.log('   ', r.id, '|', String(r.title||'').slice(0,120)));
    } catch (e) { console.log(t, 'EX', e.message); }
  }
})();
