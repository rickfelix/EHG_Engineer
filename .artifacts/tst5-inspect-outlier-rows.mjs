#!/usr/bin/env node
// Read-only characterisation of the live uat_test_runs rows that lack
// control_pack_evaluated / control_pack_status.
import 'dotenv/config';
import { createDatabaseClient } from '../lib/supabase-connection.js';

async function main() {
  const client = await createDatabaseClient('ehg');
  try {
    const r = await client.query(
      "SELECT id, created_at, metadata ? 'control_pack_evaluated' AS has_cpe, metadata ? 'control_pack_status' AS has_cps, metadata->'control_pack_evaluated' AS cpe, jsonb_object_keys_agg AS keys FROM (SELECT id, created_at, metadata, (SELECT jsonb_agg(k) FROM jsonb_object_keys(metadata) k) AS jsonb_object_keys_agg FROM uat_test_runs) s ORDER BY created_at"
    );
    console.log('id'.padEnd(38) + 'created_at'.padEnd(28) + 'cpe?'.padEnd(6) + 'cps?'.padEnd(6) + 'cpe');
    for (const row of r.rows) {
      console.log(
        String(row.id).padEnd(38) +
        String(row.created_at.toISOString()).padEnd(28) +
        String(row.has_cpe).padEnd(6) +
        String(row.has_cps).padEnd(6) +
        JSON.stringify(row.cpe)
      );
    }
    console.log('');
    const outliers = r.rows.filter((x) => !x.has_cpe || !x.has_cps);
    console.log('Rows missing cpe or cps:', outliers.length);
    for (const o of outliers) {
      console.log('  ', o.id, o.created_at.toISOString(), 'metadata keys =', JSON.stringify(o.keys));
    }
    console.log('');
    const summary = await client.query(
      "SELECT metadata->'control_pack_evaluated' AS cpe, count(*) FROM uat_test_runs GROUP BY 1 ORDER BY 2 DESC"
    );
    console.log('control_pack_evaluated distribution:', JSON.stringify(summary.rows));
  } catch (e) {
    console.error('FATAL:', e.message);
    process.exitCode = 2;
  } finally {
    await client.end();
  }
}
main();
