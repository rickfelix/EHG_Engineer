import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
const r = await c.query(`
 select pc.id critique_id, pc.override_by, left(pc.override_reason,60) reason,
        pc.created_at, sd.sd_key, sd.status, sd.current_phase,
        (pc.created_at >= now()-interval '14 days') still_in_lookback
 from public.plan_critiques pc
 join public.strategic_directives_v2 sd on sd.id = pc.sd_id
 where pc.overall_severity='block' and pc.override_reason is not null and pc.override_by is not null
 order by pc.created_at desc`);
console.log(`TOTAL overridden block rows: ${r.rows.length}`);
r.rows.forEach(x=>console.log(` ${x.sd_key} | status=${x.status} phase=${x.current_phase} | by=${x.override_by} | ${x.created_at.toISOString().slice(0,10)} | in_14d_lookback=${x.still_in_lookback}`));
const live = r.rows.filter(x=>x.still_in_lookback);
console.log(`\n=> ORPHANED BY FR-4 (still inside the 14d lookback, would bind today, will NOT bind after change): ${live.length}`);
live.forEach(x=>console.log(`   ${x.sd_key} (status=${x.status})`));
await c.end();
