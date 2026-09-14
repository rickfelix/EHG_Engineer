import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const s = createSupabaseServiceClient();
async function q(label, sql) {
  const { data, error } = await s.rpc('exec_sql', { sql_text: sql.trim().replace(/\s+/g,' ') });
  console.log('=== ' + label + ' ===');
  if (error) { console.log('ERR:', error.message); return null; }
  console.log(JSON.stringify(data?.[0]?.result, null, 1).slice(0, 2500));
  return data?.[0]?.result;
}
const W = `changed_at >= '2026-09-14 02:46:00' AND changed_at <= '2026-09-14 02:49:00' AND new_values->'metadata' ? 'integration_backfill'`;

// Reverse containment: did the restore ADD anything beyond original ∪ {integration_backfill}?
await q('NO OVER-RESTORE: current keys beyond original+marker', `
WITH orig AS (
  SELECT DISTINCT ON (record_id) record_id, old_values->'metadata' AS oldm
  FROM governance_audit_log
  WHERE table_name='product_requirements_v2' AND operation='UPDATE' AND ${W}
  ORDER BY record_id, changed_at ASC
)
SELECT count(*) AS restored_rows,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM jsonb_object_keys(p.metadata) k
    WHERE k <> 'integration_backfill' AND NOT (o.oldm ? k)
  )) AS rows_with_UNEXPECTED_extra_keys
FROM orig o JOIN product_requirements_v2 p ON p.id::text=o.record_id
WHERE p.metadata @> o.oldm AND jsonb_typeof(o.oldm)='object' AND o.oldm<>'{}'::jsonb`);

// Did the restore preserve VALUES, not just keys? containment @> checks values too. Spot-check deep equality.
await q('VALUE FIDELITY: original subtree exactly equal (not just key-present)', `
WITH orig AS (
  SELECT DISTINCT ON (record_id) record_id, old_values->'metadata' AS oldm
  FROM governance_audit_log
  WHERE table_name='product_requirements_v2' AND operation='UPDATE' AND ${W}
  ORDER BY record_id, changed_at ASC
)
SELECT count(*) AS checked,
  count(*) FILTER (WHERE (p.metadata - 'integration_backfill') = o.oldm) AS exact_match_after_removing_marker,
  count(*) FILTER (WHERE (p.metadata - 'integration_backfill') <> o.oldm) AS divergent
FROM orig o JOIN product_requirements_v2 p ON p.id::text=o.record_id
WHERE p.metadata @> o.oldm AND jsonb_typeof(o.oldm)='object' AND o.oldm<>'{}'::jsonb`);

// Did integration_operationalization survive the restore (the whole point of the backfill)?
await q('integration_operationalization still non-null on all 1,570?', `
SELECT count(*) AS marked, count(*) FILTER (WHERE integration_operationalization IS NULL) AS went_null_again
FROM product_requirements_v2 WHERE metadata ? 'integration_backfill'`);

await q('any product_requirements_v2 row still NULL on the column?', `
SELECT count(*) AS still_null FROM product_requirements_v2 WHERE integration_operationalization IS NULL`);
