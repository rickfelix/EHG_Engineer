import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
try {
  const r = await c.query(`select flag_key, flag_value, enabled, updated_at from public.leo_feature_flags where flag_key ilike '%MIGRATION%' or flag_key ilike '%TIER%' order by flag_key`);
  console.log('TIER FLAGS:', JSON.stringify(r.rows, null, 1));
} catch (e) {
  console.log('flag query err:', e.message);
  const r2 = await c.query(`select column_name from information_schema.columns where table_name='leo_feature_flags' order by ordinal_position`);
  console.log('leo_feature_flags cols:', r2.rows.map(x=>x.column_name).join(', '));
  const r3 = await c.query(`select * from public.leo_feature_flags limit 3`);
  console.log('sample:', JSON.stringify(r3.rows, null, 1));
}
await c.end();
