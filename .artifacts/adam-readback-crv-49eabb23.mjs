import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
const t = await c.query(`select to_regclass('public.chairman_ratification_verifications') as tbl`);
const tr = await c.query(`select tgname, tgenabled from pg_trigger where tgname like 'chairman_ratification_verifications%' order by 1`);
const ix = await c.query(`select indexname from pg_indexes where tablename='chairman_ratification_verifications' order by 1`);
console.log('TABLE:', t.rows[0].tbl, '| TRIGGERS:', tr.rows.map(r => r.tgname + '=' + r.tgenabled).join(', ') || 'none', '| INDEXES:', ix.rows.map(r => r.indexname).join(', ') || 'none');
const tok = await c.query(`select id, token_issued_at, token_consumed_at, migration_path is not null as has_path from public.schema_migrations_applied where token_issued_at > now() - interval '20 minutes' order by token_issued_at`);
for (const r of tok.rows) console.log('token row', r.id.slice(0, 8), 'issued', String(r.token_issued_at).slice(11, 19), 'consumed', r.token_consumed_at ? String(r.token_consumed_at).slice(11, 19) : 'NO', 'apply-row', r.has_path);
for (const r of tok.rows.filter(r => !r.token_consumed_at)) { const v = await c.query(`update public.schema_migrations_applied set token_consumed_at = now() where id = $1 and token_consumed_at is null returning id`, [r.id]); console.log('VOIDED stray token row', v.rows[0]?.id?.slice(0, 8)); }
const ap = await c.query(`select id, applied_at, prod_deploy, success, statement_count, left(migration_sha256,8) as sha from public.schema_migrations_applied where migration_path like '%chairman_ratification_verifications%' order by applied_at desc limit 1`);
console.log('APPLY ROW:', JSON.stringify(ap.rows[0]));
await c.end?.();
