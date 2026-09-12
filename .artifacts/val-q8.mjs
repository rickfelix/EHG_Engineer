import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify:false });
const { rows } = await c.query(`SELECT id, status, left(description,1400) d, left(expected_behavior,600) eb FROM quick_fixes WHERE id='QF-20260904-344'`);
console.log(JSON.stringify(rows[0], null, 1));
await c.end();
