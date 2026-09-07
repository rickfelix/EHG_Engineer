import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
const prd = await c.query(`SELECT id, directive_id, sd_id, activation_test_id, status FROM product_requirements_v2 WHERE directive_id = $1`, ['SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E']);
console.log('Child E PRD rows:', JSON.stringify(prd.rows, null, 1));
const trg = await c.query(`SELECT t.tgname, p.proname, t.tgenabled FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='product_requirements_v2'::regclass AND NOT t.tgisinternal`);
console.log('\nproduct_requirements_v2 triggers:', JSON.stringify(trg.rows));
const col = await c.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='product_requirements_v2' AND column_name IN ('activation_test_id','sd_id','directive_id','smoke_test_cmd')`);
console.log('\ncols:', JSON.stringify(col.rows));
// any open QFs claimable for a live-chain drive?
const qf = await c.query(`SELECT id, status, claiming_session_id, created_at FROM quick_fixes WHERE status='open' AND pr_url IS NULL AND commit_sha IS NULL ORDER BY created_at DESC LIMIT 5`);
console.log('\nopen QF sample:', JSON.stringify(qf.rows.map(r=>({id:r.id,claim:r.claiming_session_id})), null, 0));
const mine = await c.query(`SELECT id, status, claiming_session_id FROM quick_fixes WHERE claiming_session_id IS NOT NULL LIMIT 5`);
console.log('claimed QF sample:', JSON.stringify(mine.rows));
await c.end();
