import { q } from './db-exec.mjs';
const r = await q(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='sub_agent_execution_results' ORDER BY ordinal_position`);
console.log(r[0].result.map(x=>x.column_name+':'+x.data_type).join('\n'));
