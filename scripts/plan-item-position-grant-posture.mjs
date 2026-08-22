#!/usr/bin/env node
/**
 * QF-20260822-628 — grant-posture readback for public.v_plan_item_position.
 *
 * Same family as SEC-02 (scripts/session-coordination-grant-posture.mjs): the view (a bare
 * CREATE VIEW, database/migrations/20260803_plan_item_position_view.sql) inherited default
 * privileges granting DELETE/INSERT/UPDATE/TRUNCATE to anon+authenticated. It is a read-only
 * derived projection (JOIN across roadmap_wave_items/roadmap_waves/strategic_directives_v2),
 * so those grants are least-privilege debt, not currently exploitable via the view itself
 * (the JOIN makes it non-auto-updatable — Postgres rejects DML against it without an INSTEAD
 * OF rule/trigger, neither of which exists here) but a landmine if that ever changes.
 *
 * migration-tier-classifier.mjs puts GRANT/REVOKE in FORBIDDEN_TOPLEVEL unconditionally — the
 * corrective migration is TIER-2 and cannot self-apply; it needs the chairman ceremony. This
 * script is the observable for that: the only proof the ceremony landed is a before/after
 * difference here.
 *   BEFORE apply : anon/authenticated hold TRUNCATE/DELETE/INSERT/UPDATE -> exit 10 (STAGED_NOT_APPLIED)
 *   AFTER  apply : those are gone, SELECT retained                       -> exit 0 (APPLIED_AND_SAFE)
 *
 * Read-only. Never issues DDL.
 */
import { createDatabaseClient } from './lib/supabase-connection.js';

const VIEW = 'v_plan_item_position';
// QF-20260822-628's own title names only the four DML verbs, but its stated intent is
// "narrow to SELECT only" — the live posture (measured 2026-08-22) shows anon/authenticated
// ALSO hold REFERENCES + TRIGGER, which are just as much a departure from SELECT-only. All
// six are checked so a fix that satisfies the title but not the stated intent still fails here.
const REVOKED = ['TRUNCATE', 'DELETE', 'INSERT', 'UPDATE', 'REFERENCES', 'TRIGGER'];
const JSON_OUT = process.argv.includes('--json');

async function main() {
  // createDatabaseClient('engineer') prefers fresh on-disk .env credentials over a stale
  // inherited process.env value (QF-20260815-918) — a hand-rolled pg.Client here would
  // silently re-open that exact bug.
  const client = await createDatabaseClient('engineer', { verify: false });
  let rows;
  try {
    const r = await client.query(
      `select grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
         from information_schema.role_table_grants
        where table_schema = 'public' and table_name = $1
        group by grantee order by grantee`,
      [VIEW],
    );
    rows = r.rows;
  } finally {
    await client.end();
  }

  if (!rows || rows.length === 0) {
    console.error(`UNREADABLE: no grants returned for public.${VIEW}. Not a pass.`);
    process.exit(2);
  }

  const privsOf = (role) => (rows.find((x) => x.grantee === role)?.privs ?? '').split(',').filter(Boolean);
  const authenticated = privsOf('authenticated');
  const anon = privsOf('anon');
  const serviceRole = privsOf('service_role');

  const authStillRevocable = REVOKED.filter((p) => authenticated.includes(p));
  const anonStillRevocable = REVOKED.filter((p) => anon.includes(p));
  const authKeepsSelect = authenticated.includes('SELECT');
  const anonKeepsSelect = anon.includes('SELECT');
  const serviceCanWrite = serviceRole.length === 0 || serviceRole.includes('SELECT');

  let verdict;
  let exit;
  if (!authKeepsSelect || !anonKeepsSelect) {
    verdict = 'COLLATERAL_DAMAGE'; exit = 1;
  } else if (!serviceCanWrite) {
    verdict = 'COLLATERAL_DAMAGE'; exit = 1;
  } else if (authStillRevocable.length === REVOKED.length && anonStillRevocable.length === REVOKED.length) {
    verdict = 'STAGED_NOT_APPLIED'; exit = 10;
  } else if (authStillRevocable.length === 0 && anonStillRevocable.length === 0) {
    verdict = 'APPLIED_AND_SAFE'; exit = 0;
  } else {
    verdict = 'PARTIALLY_APPLIED'; exit = 1;
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({
      verdict, exit, authenticated, anon, service_role: serviceRole,
      still_revocable: { authenticated: authStillRevocable, anon: anonStillRevocable },
    }, null, 2));
  } else {
    console.log(`=== grant posture: public.${VIEW} ===`);
    for (const r of rows) console.log(`  ${r.grantee.padEnd(16)} : ${r.privs}`);
    console.log(`\nVERDICT: ${verdict}`);
    if (verdict === 'STAGED_NOT_APPLIED') {
      console.log(`  anon/authenticated still hold [${REVOKED.join(', ')}] — the staged revoke has NOT been applied.`);
      console.log('  This is the EXPECTED state at merge time. It is not a failure and not a pass.');
    } else if (verdict === 'APPLIED_AND_SAFE') {
      console.log('  The four write grants are gone from anon+authenticated; SELECT retained on both.');
    } else if (verdict === 'COLLATERAL_DAMAGE') {
      if (!authKeepsSelect) console.log('  authenticated LOST SELECT — the read path was collateral damage.');
      if (!anonKeepsSelect) console.log('  anon LOST SELECT — the read path was collateral damage.');
      if (!serviceCanWrite) console.log('  service_role grant state looks wrong — needs a human look.');
    } else {
      console.log(`  Only some of the revoke landed; still present — authenticated:[${authStillRevocable.join(', ')}] anon:[${anonStillRevocable.join(', ')}]. A half-applied grant posture needs a human.`);
    }
  }
  process.exit(exit);
}

main().catch((e) => { console.error(`UNREADABLE: ${e.message}`); process.exit(2); });
