import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer');
const {rows} = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='sub_agent_execution_results' ORDER BY ordinal_position`);
console.log(rows.map(r=>r.column_name+':'+r.data_type).join(' | '));
await c.end();
