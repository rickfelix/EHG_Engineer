require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
(async () => {
  const a = createClient(url, anon, { auth: { persistSession: false } });
  const { data, count, error } = await a.from('strategic_directives_v2').select('id', { count: 'exact' }).limit(3);
  console.log('ANON strategic_directives_v2 -> count:', count, '| rows returned:', (data||[]).length, '| error:', error ? error.message : 'none');
  const v = await a.from('ventures').select('id', { count: 'exact', head: true });
  console.log('ANON ventures (control) -> count:', v.count, '| error:', v.error ? v.error.message : 'none');
  console.log('project:', url.replace(/^https?:\/\//,'').split('.')[0], '| measured_at:', new Date().toISOString());
})();
