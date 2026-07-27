/**
 * SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 FR-2 — SQL-text invariant on release_sd.
 *
 * WHAT THIS TEST CAN AND CANNOT DO, STATED UP FRONT SO NOBODY MISREADS A GREEN RUN.
 * It asserts the migration FILE says the right thing. It CANNOT tell you the migration was APPLIED
 * — a staged-but-never-deployed migration passes every assertion here. That distinction is the
 * whole camouflage class this SD exists to remove, so it must not be blurred:
 *
 *   THIS FILE (CI)                     -> the text is correct
 *   scripts/one-off/verify-release-sd-qf-branch.mjs (manual, pooler) -> the DEPLOYED function is correct
 *
 * Only the second answers "is it live". It is a named script rather than a test because the db
 * vitest project is gated to zero files (QF-20260726-459 Part 1b) and there is no CI path that
 * touches a database — so a vitest-based "live" check would report green having executed nothing.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MIGRATION = path.join(ROOT, 'database/migrations/20260727_release_sd_qf_reopen.sql');
const RAW = fs.readFileSync(MIGRATION, 'utf8');

/**
 * CODE ONLY — every `--` comment line stripped before any matching.
 *
 * The first version of this file scanned the raw text and its QF-branch extractor matched the
 * HEADER COMMENT, where the OLD (defective) statement is quoted verbatim to explain the bug. So it
 * asserted against the documentation of the defect instead of the fix, and reported the fix missing
 * when it was present. Comments describe the code they sit beside, so any source-scanning assertion
 * will eventually match prose rather than behaviour unless comments are removed first — the same
 * wrong-referent failure this SD is largely about.
 */
const SQL = RAW.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

/**
 * The QF branch only — from `IF v_sd_key LIKE 'QF-%'` to the branch's OWN `ELSE`.
 *
 * The end marker must be an ELSE ALONE ON ITS LINE. A plain indexOf('ELSE') matches the `ELSE
 * status` inside the CASE expression first and truncates the slice before the holder CAS, so the
 * CAS assertion fails against a file that plainly contains it. That is the second time this
 * extractor pointed at the wrong text — first the header comment, now a nested keyword — which is
 * the point: an assertion is only as good as the region it is scoped to.
 */
function qfBranch(sql) {
  const start = sql.indexOf("IF v_sd_key LIKE 'QF-%' THEN");
  expect(start, 'QF branch not found').toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const m = rest.match(/\n\s*ELSE\s*\n/);          // the branch ELSE, not `ELSE status`
  expect(m, 'branch-level ELSE not found').toBeTruthy();
  return rest.slice(0, m.index);
}

describe('FR-2: the release_sd QF branch reopens under a holder CAS', () => {
  const branch = qfBranch(SQL);

  it('reverts status to open', () => {
    expect(branch).toMatch(/THEN\s+'open'/);
    expect(branch).toMatch(/status\s*=\s*CASE/);
  });

  it('reopens ONLY a genuinely stranded row — the four-predicate guard', () => {
    // If any of these is dropped the branch resurrects rows it must not touch: terminal QFs, or
    // merge-witnessed ones deliberately held non-terminal pending scope attestation.
    expect(branch).toMatch(/status\s*=\s*'in_progress'/);
    expect(branch).toMatch(/pr_url\s+IS\s+NULL/);
    expect(branch).toMatch(/commit_sha\s+IS\s+NULL/);
  });

  it('CASEs rather than assigning unconditionally', () => {
    // `SET status = 'open'` with the guard only in the WHERE would still be wrong: the WHERE also
    // scopes the claim clear, so a guarded WHERE would stop clearing claims on rows carrying work.
    // The CASE keeps the clear unconditional and the reopen conditional.
    expect(branch).toMatch(/ELSE\s+status\s*\n?\s*END/);
  });

  it('requires the caller to BE the holder (CAS)', () => {
    // Without this, a stale caller could reopen a QF another session has since claimed.
    expect(branch).toMatch(/AND\s+claiming_session_id\s*=\s*p_session_id/);
  });

  it('still clears the claim', () => {
    expect(branch).toMatch(/claiming_session_id\s*=\s*NULL/);
  });
});

describe('FR-2: the SD branch is untouched', () => {
  it('preserves the strategic_directives_v2 release verbatim', () => {
    // The QF fix must not disturb SD release. Pinned explicitly because this migration re-creates
    // the WHOLE function, so a careless edit could silently alter the other branch.
    // Same precision as qfBranch, and for the same reason: slicing from the FIRST 'ELSE' lands
    // inside the CASE expression, so the region would still contain the QF branch's tail and these
    // assertions could be satisfied by the WRONG branch. It would pass while proving nothing about
    // SD release.
    const start = SQL.indexOf("IF v_sd_key LIKE 'QF-%' THEN");
    const rest = SQL.slice(start);
    const m = rest.match(/\n\s*ELSE\s*\n/);
    const sdBranch = rest.slice(m.index, rest.indexOf('END IF;'));
    expect(sdBranch).not.toMatch(/quick_fixes/);   // proves the region is the SD branch alone
    expect(sdBranch).toMatch(/UPDATE strategic_directives_v2/);
    expect(sdBranch).toMatch(/claiming_session_id\s*=\s*NULL/);
    expect(sdBranch).toMatch(/active_session_id\s*=\s*NULL/);
    expect(sdBranch).toMatch(/is_working_on\s*=\s*false/);
    expect(sdBranch).toMatch(/active_session_id\s*=\s*p_session_id\s+OR\s+claiming_session_id\s*=\s*p_session_id/);
  });

  it('keeps SECURITY DEFINER and the pinned search_path', () => {
    // Dropping either would be a security regression smuggled in by a behaviour fix.
    expect(SQL).toMatch(/SECURITY DEFINER/);
    expect(SQL).toMatch(/SET search_path TO 'public'/);
  });
});

describe('FR-2: this test does not claim the migration is deployed', () => {
  it('names the script that actually checks the live definition', () => {
    // Guards against someone later reading a green CI run as "the RPC is fixed in production".
    expect(fs.existsSync(path.join(ROOT, 'scripts/one-off/verify-release-sd-qf-branch.mjs'))).toBe(true);
  });
});
