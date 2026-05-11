import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { data, error } = await sb
  .from('sub_agent_execution_results')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(1);

if (error) {
  console.error('Query error:', error);
  process.exit(2);
}
if (!data || data.length === 0) {
  console.log('NO ROWS');
  process.exit(0);
}

console.log('Columns:', Object.keys(data[0]).sort());
console.log('\nSample row (truncated):');
const row = data[0];
for (const k of Object.keys(row).sort()) {
  const v = row[k];
  const s = typeof v === 'object' && v !== null ? JSON.stringify(v).slice(0, 220) : String(v).slice(0, 220);
  console.log('  ' + k + ': ' + s);
}
