import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient();
const r = await c.query(`
SELECT id, created_at,
       metadata->'control_pack_failures' AS failures,
       metadata->'control_pack_evaluated' AS evaluated,
       metadata->'control_pack_status' AS status_map,
       metadata->>'quality_gate' AS qg
FROM uat_test_runs WHERE metadata ? 'control_pack_failures' ORDER BY created_at DESC LIMIT 6`);
for (const row of r.rows) {
  console.log(`\n${row.id.slice(0,8)} ${row.created_at.toISOString().slice(0,16)} qg=${row.qg}`);
  console.log('  failures  =', JSON.stringify(row.failures));
  console.log('  evaluated =', JSON.stringify(row.evaluated));
  console.log('  status_map=', JSON.stringify(row.status_map));
}
// How many GREEN runs would flip from blocked -> allowed?
const g = await c.query(`
SELECT COUNT(*) FILTER (WHERE metadata->>'quality_gate'='GREEN') AS green_rows,
       COUNT(*) FILTER (WHERE metadata->>'quality_gate'='GREEN' AND (metadata->'control_pack_evaluated')::text='false') AS green_and_currently_blocked,
       COUNT(*) FILTER (WHERE metadata->>'quality_gate'='GREEN' AND (metadata->'control_pack_evaluated')::text='false'
                        AND metadata->'control_pack_failures' IS NOT NULL
                        AND jsonb_typeof(metadata->'control_pack_failures') <> 'null') AS would_flip_to_allowed
FROM uat_test_runs`);
console.log('\nGATE BLAST RADIUS:', JSON.stringify(g.rows[0]));
await c.end?.(); process.exit(0);
