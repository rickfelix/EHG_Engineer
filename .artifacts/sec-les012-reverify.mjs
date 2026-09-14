import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const s = createSupabaseServiceClient();
async function q(label, sql) {
  const { data, error } = await s.rpc('exec_sql', { sql_text: sql.trim().replace(/\s+/g,' ') });
  console.log('=== ' + label + ' ===');
  if (error) { console.log('ERR:', error.message); return null; }
  console.log(JSON.stringify(data?.[0]?.result, null, 1).slice(0, 3000));
  return data?.[0]?.result;
}
const W = `changed_at >= '2026-09-14 02:46:00' AND changed_at <= '2026-09-14 02:49:00' AND new_values->'metadata' ? 'integration_backfill'`;

// 1. Current state: marked rows still holding ONLY the marker
await q('CURRENT STATE of the 1,570 marked rows', `
SELECT count(*) AS marked_total,
  count(*) FILTER (WHERE (SELECT count(*) FROM jsonb_object_keys(metadata))=1) AS still_marker_only,
  count(*) FILTER (WHERE (SELECT count(*) FROM jsonb_object_keys(metadata))>1) AS has_other_keys
FROM product_requirements_v2 WHERE metadata ? 'integration_backfill'`);

// 2. THE REAL TEST: containment of original keys, computed from the ORIGINAL backfill audit rows
await q('RESTORE CORRECTNESS: original keys contained in current metadata?', `
WITH orig AS (
  SELECT DISTINCT ON (record_id) record_id, old_values->'metadata' AS oldm
  FROM governance_audit_log
  WHERE table_name='product_requirements_v2' AND operation='UPDATE' AND ${W}
  ORDER BY record_id, changed_at ASC
)
SELECT count(*) AS rows_with_original_keys,
  count(*) FILTER (WHERE p.metadata @> o.oldm) AS fully_restored_containment,
  count(*) FILTER (WHERE NOT (p.metadata @> o.oldm)) AS NOT_RESTORED,
  count(*) FILTER (WHERE NOT (p.metadata ? 'integration_backfill')) AS lost_marker
FROM orig o JOIN product_requirements_v2 p ON p.id::text = o.record_id
WHERE jsonb_typeof(o.oldm)='object' AND o.oldm <> '{}'::jsonb`);

// 3. the 18 outstanding: are their audit rows still intact?
await q('OUTSTANDING ROWS: audit recoverability', `
WITH orig AS (
  SELECT DISTINCT ON (record_id) record_id, old_values->'metadata' AS oldm
  FROM governance_audit_log
  WHERE table_name='product_requirements_v2' AND operation='UPDATE' AND ${W}
  ORDER BY record_id, changed_at ASC
)
SELECT count(*) AS outstanding,
  count(*) FILTER (WHERE jsonb_typeof(o.oldm)='object' AND o.oldm<>'{}'::jsonb) AS with_recoverable_keys,
  sum((SELECT count(*) FROM jsonb_object_keys(o.oldm))) AS keys_still_missing
FROM product_requirements_v2 p JOIN orig o ON p.id::text=o.record_id
WHERE p.metadata ? 'integration_backfill' AND (SELECT count(*) FROM jsonb_object_keys(p.metadata))=1
  AND jsonb_typeof(o.oldm)='object' AND o.oldm<>'{}'::jsonb`);
