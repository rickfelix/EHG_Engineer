import 'dotenv/config';
import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
const { rows: d } = await c.query(`SELECT id, venture_id, decision_type, status, blocking, created_at, updated_at, decided_by, consumed_at, summary
  FROM public.chairman_decisions WHERE id::text LIKE 'd87a7018%'`);
console.log('=== decision d87a7018 ===');
console.log(d.length ? JSON.stringify(d, null, 2).slice(0,1500) : 'NOT FOUND');
const { rows: allv } = await c.query(`SELECT id, name, is_demo, created_at FROM public.ventures WHERE id::text LIKE '8344c34b%'`);
console.log('\n=== venture 8344c34b ===');
console.log(JSON.stringify(allv, null, 2));
const { rows: dec4 } = await c.query(`SELECT id, venture_id, decision_type, status, blocking, created_at FROM public.chairman_decisions
  WHERE venture_id IN (SELECT id FROM public.ventures WHERE created_at BETWEEN '2026-09-06T19:37:50Z' AND '2026-09-06T19:37:55Z')`);
console.log('\n=== chairman_decisions on the 4 burst ventures ===');
console.log(dec4.length ? JSON.stringify(dec4, null, 2).slice(0,2000) : 'none');
console.log('\n=== reject_live_born_venture fn ===');
const { rows: fn } = await c.query(`SELECT prosrc FROM pg_proc WHERE proname='reject_live_born_venture'`);
console.log(fn[0]?.prosrc?.slice(0,1200) || 'not found');
process.exit(0);
