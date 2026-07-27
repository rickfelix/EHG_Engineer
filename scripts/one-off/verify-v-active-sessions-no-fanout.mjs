#!/usr/bin/env node
/**
 * Verify the DEPLOYED v_active_sessions does not fan out. QF-20260727-574.
 *
 * WHY A SCRIPT AND NOT A VITEST TEST: the db project resolves to ZERO files unless a designated
 * non-prod target is named, so a "live" vitest check would report green having executed nothing —
 * the same lie in a different costume. The migration file being correct is also not the claim;
 * the claim is about the view that is actually deployed.
 *
 * IT CHECKS THE PROPERTY, NOT THE TEXT. A definition grep would pass on a view whose SQL contains
 * LATERAL but still multiplies for some other reason. This counts rows.
 *
 * Read-only. Usage: node scripts/one-off/verify-v-active-sessions-no-fanout.mjs
 */
import 'dotenv/config';
import pg from 'pg';

async function main() {
  const conn = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL;
  if (!conn) { console.error('FAIL: SUPABASE_POOLER_URL or DATABASE_URL required.'); process.exit(2); }
  const client = new pg.Client({ connectionString: conn });
  await client.connect();
  let failed = 0;
  try {
    const at = (await client.query(`SELECT now() AT TIME ZONE 'utc' t`)).rows[0].t.toISOString();
    console.log(`measured_at_utc=${at}`);

    // 1. THE PROPERTY: one row per session, always.
    const dup = await client.query(
      `SELECT session_id, count(*)::int n FROM v_active_sessions GROUP BY 1 HAVING count(*) > 1`,
    );
    console.log(`${dup.rowCount === 0 ? 'PASS' : 'FAIL'}  one row per session (duplicated session_ids: ${dup.rowCount})`);
    if (dup.rowCount > 0) { failed += 1; dup.rows.slice(0, 5).forEach((r) => console.log(`        ${r.session_id} -> ${r.n}`)); }

    // 2. THE NEGATIVE CONTROL. If NO session currently holds >1 qualifying QF, check 1 passes
    //    vacuously — it would pass against the OLD fanning-out view too. Say so rather than
    //    reporting a green that proves nothing.
    const multi = await client.query(
      `SELECT count(*)::int n FROM (SELECT claiming_session_id FROM quick_fixes
         WHERE status IN ('open','in_progress') AND claiming_session_id IS NOT NULL
         GROUP BY 1 HAVING count(*) > 1) x`,
    );
    const exercised = multi.rows[0].n > 0;
    console.log(`${exercised ? 'PASS' : 'WARN'}  the check is EXERCISED (sessions holding >1 qualifying QF: ${multi.rows[0].n})`);
    if (!exercised) {
      console.log('        No session currently fans out, so check 1 cannot distinguish fixed from unfixed.');
      console.log('        This is a VACUOUS pass, not evidence. Re-run when a session holds 2+ open/in_progress QFs.');
    }

    // 3. The columns the fix had to preserve — a bare EXISTS would have dropped these, and
    //    claim-formatters.js / sd-start.js read them.
    const cols = await client.query(
      `SELECT string_agg(column_name, ',' ORDER BY column_name) c FROM information_schema.columns
        WHERE table_schema='public' AND table_name='v_active_sessions'
          AND column_name IN ('qf_id','qf_title','qf_status')`,
    );
    const got = cols.rows[0].c || '';
    const ok = ['qf_id', 'qf_status', 'qf_title'].every((k) => got.includes(k));
    console.log(`${ok ? 'PASS' : 'FAIL'}  qf_id/qf_title/qf_status preserved (${got || 'none'})`);
    if (!ok) failed += 1;
  } finally {
    await client.end();
  }
  console.log(failed === 0
    ? '\nDEPLOYED v_active_sessions returns one row per session (checked by COUNTING, not by reading the definition).'
    : `\n${failed} check(s) FAILED — the view still fans out, or lost a projected column.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`FAIL: ${e.message}`); process.exit(1); });
