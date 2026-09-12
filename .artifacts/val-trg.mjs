import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
try {
  const t = await c.query(`SELECT tgname, tgenabled, p.proname
    FROM pg_trigger tg JOIN pg_proc p ON p.oid=tg.tgfoid
    WHERE tg.tgrelid='strategic_directives_v2'::regclass AND NOT tg.tgisinternal ORDER BY tgname`);
  console.log('=== triggers on strategic_directives_v2 (could block the integration test writes) ===');
  console.table(t.rows);
  const ck = await c.query(`SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint
    WHERE conrelid='strategic_directives_v2'::regclass AND contype='c'`);
  console.log('=== check constraints ===');
  console.log(ck.rows.map(r=>`${r.conname}: ${r.def}`).join('\n').slice(0,1500));
} finally { await c.end(); }
