import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient('engineer');
const { rows } = await c.query(`
  SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE conrelid = 'sub_agent_execution_results'::regclass
  ORDER BY conname
`);
rows.forEach(r => console.log(r.conname, ':', r.def));
await c.end();
