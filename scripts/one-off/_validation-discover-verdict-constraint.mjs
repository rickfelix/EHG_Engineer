import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient('engineer');
const { rows } = await c.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'valid_verdict'`);
console.log('valid_verdict:', rows[0]?.def);
const { rows: r2 } = await c.query(`SELECT DISTINCT verdict, COUNT(*) FROM sub_agent_execution_results GROUP BY verdict ORDER BY count DESC LIMIT 20`);
console.log('observed verdicts:'); r2.forEach(r => console.log(' ', r.verdict, r.count));
await c.end();
