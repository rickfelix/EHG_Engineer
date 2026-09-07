import 'dotenv/config';
import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
for (const v of ['chairman_pending_decisions','chairman_unified_decisions']) {
  try {
    const { rows } = await c.query(`SELECT count(*)::int n FROM public.${v} WHERE id::text LIKE 'd87a7018%'`);
    const { rows: tot } = await c.query(`SELECT count(*)::int n FROM public.${v}`);
    console.log(`${v}: contains d87a7018 = ${rows[0].n > 0}  (view total rows=${tot[0].n})`);
  } catch (e) { console.log(`${v}: ERR ${e.message.slice(0,120)}`); }
}
try {
  const { rows } = await c.query(`SELECT * FROM public.get_pending_chairman_items() LIMIT 200`);
  const hit = rows.filter(r => String(r.id||r.decision_id||'').startsWith('d87a7018'));
  console.log(`get_pending_chairman_items(): ${rows.length} rows; contains d87a7018 = ${hit.length>0}`);
  if (rows[0]) console.log('  cols:', Object.keys(rows[0]).join(','));
} catch (e) { console.log('get_pending_chairman_items: ERR ' + e.message.slice(0,160)); }
process.exit(0);
