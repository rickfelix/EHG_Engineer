import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify:false });
const { rows } = await c.query(`
  SELECT id, sub_agent_code, verdict, confidence, created_at,
         metadata->>'repo_path' repo_path, metadata->>'repo_resolved' repo_resolved,
         metadata->>'probe_exists' probe_exists, metadata->>'gate' gate,
         metadata->>'session_id' session_id, jsonb_array_length(COALESCE(metadata->'findings','[]')) nf
  FROM sub_agent_execution_results
  WHERE sd_id='2d4e7fea-d8db-447e-a75e-0a8ad201f6c4' ORDER BY created_at DESC LIMIT 5`);
console.log(JSON.stringify(rows,null,1));
try { const v = await c.query(`SELECT * FROM v_sub_agent_repo_compliance WHERE result_id=$1`, [rows[0].id]);
  console.log('COMPLIANCE VIEW:', JSON.stringify(v.rows,null,1)); } catch(e){ console.log('view:', e.message); }
await c.end();
