#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CONTROL-SURFACE-POSTURE-001 — FR-2 part (b): THE POSITIVE HALF.
 *
 * This is the half that actually protects something. Proving TRUNCATE is refused is easy and
 * reassuring; proving the coordination bus STILL CARRIES TRAFFIC after four grants are revoked is
 * what stops this SD converting a confidentiality exposure into a fleet-wide outage. Run it
 * BEFORE the ceremony to establish the baseline, and AFTER to prove nothing was collateral damage.
 *
 * NOTHING IS LEFT BEHIND. The write path is exercised inside BEGIN ... ROLLBACK, so the insert is
 * proven to be PERMITTED without a durable row ever existing. A probe that writes a real row to
 * the live fleet bus would be visible to every dashboard and router reading it — exercising the
 * mechanism by producing the side effect the mechanism exists to produce is not a free test.
 *
 * Exit 0 = bus alive. Exit 1 = a path that must work does not. Exit 2 = unreadable (never a pass).
 *
 * Issues no DDL. Leaves no rows.
 */
import 'dotenv/config';
import pg from 'pg';

const JSON_OUT = process.argv.includes('--json');

async function main() {
  const conn = process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL;
  if (!conn) { console.error('UNREADABLE: no SUPABASE_POOLER_URL / SUPABASE_DB_URL.'); process.exit(2); }

  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const checks = [];
  const record = (name, ok, detail) => checks.push({ name, ok, detail });
  let rowsBefore = null;
  let rowsAfter = null;

  try {
    const c0 = await client.query('select count(*)::int as n from public.session_coordination');
    rowsBefore = c0.rows[0].n;

    // 1. READ PATH — the bus must be readable at all.
    try {
      const r = await client.query('select id, message_type, created_at from public.session_coordination order by created_at desc limit 3');
      record('read_recent', r.rows.length > 0, `${r.rows.length} recent row(s) readable`);
    } catch (e) { record('read_recent', false, e.message.slice(0, 120)); }

    // 2. WRITE PATH — proven PERMITTED without leaving a row.
    //    A failure here after the revoke means the fleet can no longer coordinate.
    try {
      await client.query('BEGIN');
      await client.query(
        `insert into public.session_coordination (target_session, message_type, subject, body, payload)
         values ($1, $2, $3, $4, $5)`,
        [
          '00000000-0000-0000-0000-000000000000',
          'INFO',
          '[LIVENESS PROBE] rolled back, never committed',
          'SD-LEO-INFRA-CONTROL-SURFACE-POSTURE-001 FR-2(b) write-path liveness check.',
          JSON.stringify({ kind: 'liveness_probe', never_committed: true }),
        ],
      );
      await client.query('ROLLBACK');
      record('write_permitted', true, 'INSERT accepted inside a transaction, then rolled back — no row persisted');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      record('write_permitted', false, `INSERT rejected: ${e.message.slice(0, 120)}`);
    }

    // 3. The grants the fleet's own path depends on are still present.
    try {
      const g = await client.query(
        `select string_agg(privilege_type, ',' order by privilege_type) as privs
           from information_schema.role_table_grants
          where table_schema='public' and table_name='session_coordination' and grantee='service_role'`,
      );
      const privs = (g.rows[0]?.privs ?? '').split(',').filter(Boolean);
      const needed = ['INSERT', 'SELECT', 'UPDATE'];
      const missing = needed.filter((p) => !privs.includes(p));
      record('service_role_intact', missing.length === 0, missing.length ? `MISSING: ${missing.join(',')}` : `holds ${needed.join(',')}`);
    } catch (e) { record('service_role_intact', false, e.message.slice(0, 120)); }

    // 4. authenticated must retain SELECT — losing the read path is collateral damage.
    try {
      const g = await client.query(
        `select 1 from information_schema.role_table_grants
          where table_schema='public' and table_name='session_coordination'
            and grantee='authenticated' and privilege_type='SELECT'`,
      );
      record('authenticated_keeps_select', g.rows.length === 1, g.rows.length === 1 ? 'SELECT retained' : 'SELECT LOST — read path was collateral damage');
    } catch (e) { record('authenticated_keeps_select', false, e.message.slice(0, 120)); }

    // 5. Nothing this probe did persisted.
    const c1 = await client.query('select count(*)::int as n from public.session_coordination');
    rowsAfter = c1.rows[0].n;
    record('no_side_effects', rowsAfter === rowsBefore, `rows before=${rowsBefore} after=${rowsAfter}`);
  } finally {
    await client.end();
  }

  const failed = checks.filter((c) => !c.ok);
  const ok = failed.length === 0;

  if (JSON_OUT) {
    console.log(JSON.stringify({ ok, rowsBefore, rowsAfter, checks }, null, 2));
  } else {
    console.log('=== FR-2(b) coordination-bus liveness ===');
    for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(26)} ${c.detail}`);
    console.log(ok
      ? '\nBUS ALIVE — every path that must work still works.'
      : `\nBUS DEGRADED — ${failed.length} path(s) broken: ${failed.map((f) => f.name).join(', ')}. A revoke that silences the bus is worse than the exposure it closes.`);
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(`UNREADABLE: ${e.message}`); process.exit(2); });
