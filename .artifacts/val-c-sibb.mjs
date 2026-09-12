import pg from 'pg'; import dotenv from 'dotenv'; dotenv.config();
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const r = await c.query(`SELECT sd_key, status, metadata->>'dedup_match_sd_key' AS dedup, metadata->>'unparked_reason' AS unparked, metadata->'mechanism_verifications' AS mv, rationale, updated_at FROM strategic_directives_v2 WHERE parent_sd_id='f651ec94-852d-4727-8146-5d39cd00c476' ORDER BY sd_key`);
for (const row of r.rows) {
  console.log(`\n== ${row.sd_key} (${row.status}) updated=${row.updated_at?.toISOString?.()||row.updated_at}`);
  if (row.dedup) console.log('  dedup_match_sd_key:', row.dedup);
  if (row.rationale) console.log('  rationale:', String(row.rationale).slice(0,600));
  if (row.mv) console.log('  mechanism_verifications:', JSON.stringify(row.mv).slice(0,900));
}
await c.end();
