import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient();
async function q(l, sql) { try { const r = await c.query(sql); console.log(`\n### ${l}\n`+JSON.stringify(r.rows,null,1).slice(0,3000)); } catch(e){ console.log(`\n### ${l}\n ERROR: ${e.message}`);} }
await q('fence rows (metadata-scoped)', `
SELECT sd_key, status, current_phase,
       metadata->>'fence_status_2026_08_17' AS fence,
       metadata->>'venture_gate_last_verdict' AS vglv_as_key,
       jsonb_typeof(metadata->'venture_gate_last_verdict') AS vglv_type
FROM strategic_directives_v2 WHERE metadata ? 'fence_status_2026_08_17' ORDER BY sd_key`);
await q('where does venture_gate_last_verdict live?', `
SELECT table_name, column_name FROM information_schema.columns WHERE column_name ILIKE '%venture_gate%' OR column_name ILIKE '%last_verdict%'`);
await q('sd_v2 BEFORE-trigger count + total', `
SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE (tgtype & 2)>0) AS before_triggers
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='strategic_directives_v2' AND NOT t.tgisinternal`);
await q('sd_v2 row count (blast radius of a BEFORE UPDATE trigger)', `SELECT COUNT(*) FROM strategic_directives_v2`);
await q('sms_outbound_obligations statuses', `SELECT status, COUNT(*) FROM sms_outbound_obligations GROUP BY status ORDER BY 2 DESC`);
await q('sms_status_staging rowcount', `SELECT COUNT(*) FROM sms_status_staging`);
await c.end?.(); process.exit(0);
