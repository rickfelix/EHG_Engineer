import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
try {
  const q = await c.query(`SELECT column_name, data_type, character_maximum_length, is_nullable
    FROM information_schema.columns WHERE table_name='audit_log' AND column_name IN ('created_by','metadata','severity','entity_id') ORDER BY column_name`);
  console.log('=== audit_log column types ===');
  console.table(q.rows);
  const ck = await c.query(`SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='audit_log'::regclass`);
  console.log('=== audit_log constraints ===');
  console.log(ck.rows.map(r=>`${r.conname}: ${r.def}`).join('\n') || '(none)');
  // what does created_by look like today for trigger rows?
  const s = await c.query(`SELECT created_by, count(*) n, metadata->>'actor_source' src FROM audit_log
    WHERE metadata->>'trigger'='trg_sd_mutation_audit' GROUP BY 1,3 ORDER BY n DESC LIMIT 10`);
  console.log('=== existing trigger rows by created_by / actor_source ===');
  console.table(s.rows);
} finally { await c.end(); }
