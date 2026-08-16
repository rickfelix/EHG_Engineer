import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
const r = await c.query(`select id, sub_agent_code, verdict, created_at,
 metadata->>'repo_path' repo_path, metadata->>'executed_from_cwd' cwd, metadata->>'repo_resolved' resolved,
 jsonb_array_length(coalesce(metadata->'findings','[]'::jsonb)) f
 from public.sub_agent_execution_results where id='4cac69dc-0cf8-4b4f-95b3-c4febd8c06ed'`);
console.log(JSON.stringify(r.rows, null, 1));
const g = await c.query(`select * from public.v_sub_agent_repo_compliance where execution_id='4cac69dc-0cf8-4b4f-95b3-c4febd8c06ed'`).catch(e=>({rows:[{err:e.message}]}));
console.log('COMPLIANCE VIEW:', JSON.stringify(g.rows, null, 1));
await c.end();
