#!/usr/bin/env node
/**
 * Verify the DEPLOYED release_sd function carries the FR-2 fix.
 * SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001.
 *
 * WHY THIS EXISTS AS A SCRIPT AND NOT A TEST. tests/unit/db/release-sd-qf-branch-sql.test.js
 * asserts the migration FILE is correct. It passes just as happily on a migration that was written
 * and never applied — and "staged but never deployed" is indistinguishable from "deployed" at the
 * file level. That is precisely the camouflage class this SD removes, so the live check is a
 * separate, explicitly-manual step whose output belongs in the EXEC evidence.
 *
 * It cannot be a vitest test: the db project resolves to ZERO files unless a designated non-prod
 * target is named (QF-20260726-459 Part 1b), so a vitest "live" check would report green having
 * executed nothing — the same lie in a different costume.
 *
 * Usage:  node scripts/one-off/verify-release-sd-qf-branch.mjs
 * Reads SUPABASE_POOLER_URL (or DATABASE_URL) from .env. Read-only: one pg_get_functiondef call.
 */
import 'dotenv/config';
import pg from 'pg';

const CHECKS = [
  { name: 'status reverts to open', re: /THEN\s+'open'/ },
  { name: 'guard: status = in_progress', re: /status\s*=\s*'in_progress'/ },
  { name: 'guard: pr_url IS NULL', re: /pr_url\s+IS\s+NULL/ },
  { name: 'guard: commit_sha IS NULL', re: /commit_sha\s+IS\s+NULL/ },
  { name: 'holder CAS on the QF branch', re: /AND\s+claiming_session_id\s*=\s*p_session_id/ },
];

async function main() {
  const conn = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL;
  if (!conn) {
    console.error('FAIL: SUPABASE_POOLER_URL or DATABASE_URL required to read the live definition.');
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: conn });
  await client.connect();
  let def;
  try {
    const { rows } = await client.query(
      "SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'release_sd'",
    );
    if (!rows.length) { console.error('FAIL: public.release_sd not found in the live database.'); process.exit(1); }
    def = rows[0].def;
  } finally {
    await client.end();
  }

  // Scope every assertion to the QF branch. Checking the whole body would let the SD branch's own
  // CAS satisfy the CAS check — the wrong-referent mistake this SD is full of examples of.
  const start = def.indexOf("IF v_sd_key LIKE 'QF-%' THEN");

  // BOUNDARY FIX — the scoping INTENT above was right; the boundary TOKEN was not.
  //
  // This previously ended the window at def.indexOf('ELSE', start). The FR-2 fix introduces
  //     status = CASE WHEN ... THEN 'open' ELSE status END
  // and that inline "ELSE status" is the FIRST literal 'ELSE' after the branch start — so the
  // window truncated mid-CASE, BEFORE the holder CAS that follows it. The check therefore reported
  // "holder CAS on the QF branch: FAIL" against a live function carrying the CAS verbatim.
  //
  // Worth naming precisely, because it is this SD's own defect class: the check was UNSATISFIABLE
  // BY CONSTRUCTION on the very fix it exists to verify. It could only ever report a full pass
  // against a release_sd containing no CASE at all — i.e. the UNFIXED one. A verifier that goes
  // green only while the fix is absent is worse than no verifier, because it is trusted.
  //
  // 'UPDATE strategic_directives_v2' is the SD branch's first statement and cannot occur inside the
  // QF branch, so it is a boundary the QF branch's own contents can never move.
  const end = def.indexOf('UPDATE strategic_directives_v2', start);
  if (start < 0 || end < 0) { console.error('FAIL: could not isolate the QF branch in the live definition.'); process.exit(1); }
  const branch = def.slice(start, end);

  // SELF-TEST THE WINDOW BEFORE TRUSTING WHAT IT SAYS. A mis-scoped window fails silently in both
  // directions, and each direction lies differently: over-capture lets the SD branch's CAS satisfy
  // the CAS check (false PASS), under-capture hides the QF branch's own CAS (false FAIL — the bug
  // that was actually here). Guard the first, then prove the CAS check can still FAIL at all.
  if (branch.includes('strategic_directives_v2')) {
    console.error('FAIL: window over-captured into the SD branch — its CAS would satisfy the CAS check.');
    process.exit(1);
  }
  const casCheck = CHECKS.find((c) => c.name.startsWith('holder CAS'));
  if (casCheck.re.test(branch.replace(/AND\s+claiming_session_id\s*=\s*p_session_id/, ''))) {
    console.error('FAIL: negative control — the CAS check still matches after the CAS is removed. It cannot fail, so it cannot detect.');
    process.exit(1);
  }

  let failed = 0;
  for (const c of CHECKS) {
    const ok = c.re.test(branch);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
    if (!ok) failed += 1;
  }

  console.log(failed === 0
    ? '\nDEPLOYED release_sd carries the FR-2 fix (checked against pg_get_functiondef, not the .sql file).'
    : `\n${failed} check(s) FAILED — the migration is NOT applied, or was applied and later overwritten.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`FAIL: ${e.message}`); process.exit(1); });
