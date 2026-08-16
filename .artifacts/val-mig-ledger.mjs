import { createClient } from '@supabase/supabase-js'; import dotenv from 'dotenv'; dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
for (const t of ['schema_migrations','_migrations_log','migrations','migration_history','applied_migrations']) {
  const { data, error } = await s.from(t).select('*').limit(3);
  if (error) { console.log(`${t}: ${error.code||''} ${(error.message||'').slice(0,70)}`); continue; }
  console.log(`✅ ${t}: ${data.length} row(s), cols=${data[0]?Object.keys(data[0]).join(','):'(empty)'}`);
  // try to find our migrations
  for (const col of (data[0]?Object.keys(data[0]):[])) {
    if (typeof data[0][col] !== 'string') continue;
    const { data: hit } = await s.from(t).select('*').ilike(col, '%20260603_03%').limit(2);
    if (hit && hit.length) console.log(`   -> 20260603_03 FOUND via ${col}:`, JSON.stringify(hit[0]).slice(0,200));
    const { data: h2 } = await s.from(t).select('*').ilike(col, '%revoke_public_execute_role_flag%').limit(2);
    if (h2 && h2.length) console.log(`   -> 20260728 role_flag FOUND via ${col}:`, JSON.stringify(h2[0]).slice(0,200));
  }
}
