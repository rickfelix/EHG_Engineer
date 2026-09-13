import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient();
async function q(label, sql) {
  try { const r = await c.query(sql); console.log(`\n### ${label}\n`, JSON.stringify(r.rows, null, 1).slice(0,2500)); }
  catch (e) { console.log(`\n### ${label}\n  ERROR: ${e.message}`); }
}
// 1. jsonb_typeof predicate truth table
await q('P1 jsonb_typeof predicate truth table', `
SELECT label, v,
       (v IS NOT NULL) AS is_not_null,
       jsonb_typeof(v) AS jtype,
       (v IS NOT NULL AND jsonb_typeof(v) != 'null') AS proposed_predicate
FROM (VALUES
  ('SQL NULL (key absent via ->)', (('{"a":1}'::jsonb) -> 'control_pack_failures')),
  ('jsonb null literal',           (('{"control_pack_failures": null}'::jsonb) -> 'control_pack_failures')),
  ('populated array',              (('{"control_pack_failures": [{"x":1}]}'::jsonb) -> 'control_pack_failures')),
  ('EMPTY array',                  (('{"control_pack_failures": []}'::jsonb) -> 'control_pack_failures')),
  ('object',                       (('{"control_pack_failures": {"k":"v"}}'::jsonb) -> 'control_pack_failures')),
  ('jsonb string "null"',          (('{"control_pack_failures": "null"}'::jsonb) -> 'control_pack_failures'))
) AS t(label, v)`);
// 2. Does a bare column reference exist?
await q('P2 uat_test_runs columns matching control_pack', `
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='uat_test_runs' AND (column_name LIKE '%control%' OR column_name='metadata')`);
// 3. strategic_directives_v2 key columns
await q('P3 sd_v2 key columns', `
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_name='strategic_directives_v2' AND column_name IN ('id','sd_key','legacy_id','venture_gate_last_verdict','metadata')`);
// 4. existing triggers on strategic_directives_v2
await q('P4 sd_v2 triggers (name order matters)', `
SELECT t.tgname, t.tgenabled, CASE WHEN (t.tgtype & 2)>0 THEN 'BEFORE' ELSE 'AFTER/INSTEAD' END AS timing,
       CASE WHEN (t.tgtype&4)>0 THEN 'I' ELSE '' END||CASE WHEN (t.tgtype&16)>0 THEN 'U' ELSE '' END||CASE WHEN (t.tgtype&8)>0 THEN 'D' ELSE '' END AS ev
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
WHERE c.relname='strategic_directives_v2' AND NOT t.tgisinternal ORDER BY t.tgname`);
// 5. existing triggers on uat_test_runs
await q('P5 uat_test_runs triggers', `
SELECT t.tgname, t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
WHERE c.relname='uat_test_runs' AND NOT t.tgisinternal ORDER BY t.tgname`);
// 6. fence_status rows
await q('P6 fence rows', `
SELECT sd_key, status, metadata->>'fence_status_2026_08_17' AS fence, venture_gate_last_verdict
FROM strategic_directives_v2 WHERE metadata ? 'fence_status_2026_08_17'`);
await c.end?.();
process.exit(0);
