import dotenv from 'dotenv'; dotenv.config();
import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const attempts = [
  ['SUPABASE_POOLER_URL', { connectionString: process.env.SUPABASE_POOLER_URL, verify:false }],
  ['default (SUPABASE_DB_PASSWORD)', { verify:false }],
];
for (const [label, opts] of attempts) {
  if (opts.connectionString === undefined && label.startsWith('SUPABASE_POOLER')) { console.log(`${label}: not set`); continue; }
  try {
    const c = await createDatabaseClient('engineer', opts);
    const { rows } = await c.query("select current_user, count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.prosecdef");
    console.log(`✅ ${label}: current_user=${rows[0].current_user} secdef_public_fns=${rows[0].n}`);
    await c.end(); process.exit(0);
  } catch (e) { console.log(`❌ ${label}: ${e.code||''} ${String(e.message).slice(0,110)}`); }
}
process.exit(1);
