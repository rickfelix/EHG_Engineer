import pg from 'pg'; import dotenv from 'dotenv'; dotenv.config();
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
console.log('=== SDs matching snooze / feedback-update ===');
const sd = await c.query(`SELECT id, title, status, current_phase, parent_sd_id FROM strategic_directives_v2
  WHERE id ILIKE '%SNOOZE%' OR title ILIKE '%snooze%' OR description ILIKE '%snooze-manager%' OR description ILIKE '%snoozed_at%'
  ORDER BY created_at DESC LIMIT 30`);
sd.rows.forEach(r=>console.log(` ${r.id} | ${r.status}/${r.current_phase} | parent=${r.parent_sd_id||'-'} | ${String(r.title).slice(0,90)}`));
console.log(`(count=${sd.rowCount})`);

console.log('\n=== Children of SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001 ===');
const kids = await c.query(`SELECT id, title, status, current_phase FROM strategic_directives_v2 WHERE parent_sd_id='SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001' OR id LIKE 'SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001%' ORDER BY id`);
kids.rows.forEach(r=>console.log(` ${r.id} | ${r.status}/${r.current_phase} | ${String(r.title).slice(0,110)}`));

console.log('\n=== quick_fixes matching snooze / feedback columns ===');
const qf = await c.query(`SELECT id, title, status, created_at FROM quick_fixes
  WHERE title ILIKE '%snooze%' OR description ILIKE '%snooze%' OR title ILIKE '%feedback%' OR description ILIKE '%snoozed_at%'
  ORDER BY created_at DESC LIMIT 30`);
qf.rows.forEach(r=>console.log(` ${r.id} | ${r.status} | ${String(r.title).slice(0,100)}`));
console.log(`(count=${qf.rowCount})`);

console.log('\n=== the two QFs named in the migration header ===');
const named = await c.query(`SELECT id, title, status, description FROM quick_fixes WHERE id IN ('QF-20260912-253','QF-20260912-316')`);
named.rows.forEach(r=>console.log(`\n ${r.id} | ${r.status}\n  TITLE: ${r.title}\n  DESC: ${String(r.description||'').slice(0,700)}`));
await c.end();
