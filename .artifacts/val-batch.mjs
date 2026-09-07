import 'dotenv/config';
import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
import { isFixtureVenture as canonical } from '../lib/governance/fixture-exclusion.mjs';
const c = await createDatabaseClient('engineer', { verify: false });
const { rows } = await c.query(`SELECT id, name, is_demo, created_at, updated_at FROM public.ventures
  WHERE updated_at BETWEEN '2026-09-06T23:29:00Z' AND '2026-09-06T23:32:00Z' ORDER BY updated_at`);
console.log(`=== ventures updated in 23:29-23:32 window: ${rows.length} ===`);
for (const r of rows) console.log(` is_demo=${String(r.is_demo).padEnd(5)} upd=${r.updated_at.toISOString()} canonicalFixture=${canonical({name:r.name,is_demo:false})} name=${r.name}`);
// how many currently-true ventures would the canonical NAME predicate alone identify?
const { rows: all } = await c.query(`SELECT id, name, is_demo FROM public.ventures`);
let flaggedButNameNo = 0, unflaggedButNameYes = 0;
for (const v of all) {
  const byName = canonical({ name: v.name, is_demo: false });
  if (v.is_demo === true && !byName) flaggedButNameNo++;
  if (v.is_demo !== true && byName) unflaggedButNameYes++;
}
console.log(`\n=== flag vs canonical-name agreement over ${all.length} ventures ===`);
console.log(` is_demo=true but name predicate says NOT fixture: ${flaggedButNameNo}  <- backfill could not have produced these`);
console.log(` is_demo!=true but name predicate says fixture:    ${unflaggedButNameYes}  <- backfill --apply would flag these now`);
process.exit(0);
