import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient('ehg');
try {
  const cnt = await c.query('SELECT count(*)::int n FROM uat_test_runs');
  const trg = await c.query(`SELECT count(*)::int n FROM pg_trigger WHERE tgname='trg_uat_control_pack_evaluated_derive'`);
  const fn  = await c.query(`SELECT count(*)::int n FROM pg_proc WHERE proname='derive_uat_control_pack_evaluated'`);
  const snap= await c.query(`SELECT to_regclass('public.uat_control_pack_evaluated_rollback_snapshot') AS t`);
  const anyTrg = await c.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='public.uat_test_runs'::regclass AND NOT tgisinternal`);
  const hash = await c.query(`SELECT md5(string_agg(id::text || coalesce(metadata::text,'~'), '|' ORDER BY id)) h FROM uat_test_runs`);
  console.log(JSON.stringify({ rows: cnt.rows[0].n, trigger: trg.rows[0].n, fn: fn.rows[0].n, snapshotTable: snap.rows[0].t, userTriggers: anyTrg.rows.map(r=>r.tgname), contentHash: hash.rows[0].h }, null, 2));
} finally { await c.end(); }
