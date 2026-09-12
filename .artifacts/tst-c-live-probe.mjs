import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const url = process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL;
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const trg = await c.query(`SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgrelid='public.feedback'::regclass AND NOT tgisinternal ORDER BY tgname`);
console.log('=== LIVE TRIGGERS ON public.feedback ===');
for (const r of trg.rows) console.log(`\n-- ${r.tgname} (tgenabled=${r.tgenabled})\n${r.def}`);

console.log('\n=== ROW CENSUS (assist-engine existing backlog population) ===');
const cen = await c.query(`
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE status='backlog') AS backlog_rows,
  count(*) FILTER (WHERE status='backlog' AND snoozed_until IS NOT NULL) AS backlog_with_snoozed_until,
  count(*) FILTER (WHERE status='backlog' AND snoozed_until IS NOT NULL AND snoozed_until < now()) AS backlog_snoozed_until_EXPIRED,
  count(*) FILTER (WHERE metadata ? 'snooze') AS has_metadata_snooze,
  count(*) FILTER (WHERE status='snoozed') AS status_snoozed
FROM public.feedback`);
console.log(JSON.stringify(cen.rows[0], null, 2));

console.log('\n=== chairman queue blast radius: backlog+snoozed_until rows that are critical/high & unresolved ===');
const chm = await c.query(`
SELECT count(*) AS would_surface
FROM public.feedback f
WHERE f.status='backlog' AND f.snoozed_until IS NOT NULL
  AND f.severity IN ('critical','high') AND f.resolved_at IS NULL`);
console.log(JSON.stringify(chm.rows[0]));

// Pick a real row to probe against (rolled back)
const pick = await c.query(`SELECT id, status, metadata FROM public.feedback WHERE status='new' ORDER BY created_at DESC LIMIT 1`);
if (!pick.rows.length) { console.log('no probe row'); await c.end(); process.exit(0); }
const pid = pick.rows[0].id;
console.log('\n=== PROBE ROW ===', pid, 'status=', pick.rows[0].status, 'metadata keys=', Object.keys(pick.rows[0].metadata||{}).join(',') || '(none)');

async function tryUpdate(label, sql, params) {
  await c.query('BEGIN');
  try {
    await c.query(sql, params);
    console.log(`  [PASS] ${label}`);
  } catch (e) {
    console.log(`  [FAIL] ${label} -> ${e.message.split('\n')[0].slice(0,200)}`);
  } finally { await c.query('ROLLBACK'); }
}

console.log('\n=== PROPOSED WRITE SHAPES (each in its own rolled-back tx) ===');
await tryUpdate('FR-1 snooze: status+snoozed_until+metadata+updated_at',
  `UPDATE public.feedback SET status='backlog', snoozed_until=now()+interval '1 day',
     metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('snooze', jsonb_build_object('active', true, 'pre_snooze_status','new')),
     updated_at=now() WHERE id=$1`, [pid]);
await tryUpdate('FR-1 snooze WITHOUT updated_at',
  `UPDATE public.feedback SET status='backlog', snoozed_until=now()+interval '1 day',
     metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('snooze', jsonb_build_object('active', true)) WHERE id=$1`, [pid]);
await tryUpdate('updated_at ALONE', `UPDATE public.feedback SET updated_at=now() WHERE id=$1`, [pid]);
await tryUpdate('metadata ALONE', `UPDATE public.feedback SET metadata=COALESCE(metadata,'{}'::jsonb) WHERE id=$1`, [pid]);
await tryUpdate('status ALONE -> backlog', `UPDATE public.feedback SET status='backlog' WHERE id=$1`, [pid]);
await tryUpdate('snoozed_until ALONE', `UPDATE public.feedback SET snoozed_until=now() WHERE id=$1`, [pid]);
await tryUpdate('CONTROL: title (should be BLOCKED)', `UPDATE public.feedback SET title='tampered-probe' WHERE id=$1`, [pid]);
await tryUpdate('unsnooze: status+snoozed_until=NULL+metadata+updated_at',
  `UPDATE public.feedback SET status='new', snoozed_until=NULL,
     metadata=COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('snooze', jsonb_build_object('active', false)), updated_at=now() WHERE id=$1`, [pid]);

await c.end();
