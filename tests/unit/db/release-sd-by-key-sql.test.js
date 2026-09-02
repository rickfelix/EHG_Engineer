/**
 * SD-LEO-INFRA-RELEASE-KEY-SESSION-001 — SQL-text invariants on release_sd_by_key /
 * retarget_sd_claim, modeled on tests/unit/db/release-sd-qf-branch-sql.test.js.
 *
 * WHAT THIS TEST CAN AND CANNOT DO. It asserts the migration FILE says the right thing. It
 * CANNOT tell you the migration was APPLIED — see scripts/one-off/verify-release-sd-by-key.mjs
 * for the live-definition check (manual, pooler; the db vitest project skips at runtime without
 * a designated target, so a CI-only test cannot answer "is it live").
 *
 * Comments are stripped before matching (the release-sd-qf-branch-sql.test.js precedent: an
 * earlier version of that file matched a header comment quoting the OLD/defective code instead
 * of the fix, and reported the fix missing when it was present).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MIGRATION = path.join(ROOT, 'database/migrations/20260902_release_sd_by_key.sql');
const RAW = fs.readFileSync(MIGRATION, 'utf8');
const SQL = RAW.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

function functionBody(sql, name) {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const start = sql.indexOf(marker);
  expect(start, `${name} definition not found`).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf('$function$;');
  expect(end, `${name} body terminator not found`).toBeGreaterThan(-1);
  return rest.slice(0, end);
}

describe('release_sd_by_key: signature and locking order', () => {
  const body = functionBody(SQL, 'release_sd_by_key');

  it('signature is (text, text, text) -- not uuid', () => {
    expect(SQL).toMatch(/release_sd_by_key\(p_session_id text, p_sd_key text, p_reason text/);
  });

  it('locks claude_sessions FOR UPDATE before the target row (session-first order)', () => {
    const sessionLockIdx = body.indexOf('FROM claude_sessions');
    const targetLockIdx = body.search(/FROM (strategic_directives_v2|quick_fixes) WHERE/);
    expect(sessionLockIdx, 'claude_sessions lock not found').toBeGreaterThan(-1);
    expect(targetLockIdx, 'target row lock not found').toBeGreaterThan(-1);
    expect(sessionLockIdx).toBeLessThan(targetLockIdx);
    // Both locks must actually be FOR UPDATE, not a plain SELECT.
    const sessionClause = body.slice(sessionLockIdx, sessionLockIdx + 200);
    expect(sessionClause).toMatch(/FOR UPDATE/);
  });

  it('refuses a session that does not hold the key with a named sd_mismatch error', () => {
    expect(body).toMatch(/'error',\s*'sd_mismatch'/);
    expect(body).toMatch(/'held_sd_key',\s*v_session\.sd_key/);
  });

  it('refuses a phantom key with a named sd_not_found error', () => {
    expect(body).toMatch(/'error',\s*'sd_not_found'/);
  });

  it('QF branch inherits the holder CAS and guarded status-revert verbatim (no regression of the 7-row stranding defect)', () => {
    expect(body).toMatch(/status\s*=\s*'in_progress'/);
    expect(body).toMatch(/pr_url\s+IS\s+NULL/);
    expect(body).toMatch(/commit_sha\s+IS\s+NULL/);
    expect(body).toMatch(/AND\s+claiming_session_id\s*=\s*p_session_id/);
  });

  it('clears claude_sessions pointer + worktree state TOGETHER only when p_sd_key is the pointer', () => {
    const pointerBranchIdx = body.indexOf('v_session.sd_key = p_sd_key');
    expect(pointerBranchIdx, 'pointer-branch guard not found').toBeGreaterThan(-1);
    const pointerBranch = body.slice(pointerBranchIdx);
    expect(pointerBranch).toMatch(/sd_key\s*=\s*NULL/);
    expect(pointerBranch).toMatch(/worktree_path\s*=\s*NULL/);
    expect(pointerBranch).toMatch(/worktree_branch\s*=\s*NULL/);
  });

  it('keeps SECURITY DEFINER and the pinned search_path', () => {
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path TO 'public'/);
  });
});

describe('retarget_sd_claim: same-key refusal, deterministic lock order, atomicity', () => {
  const body = functionBody(SQL, 'retarget_sd_claim');

  it('refuses p_release_sd_key = p_claim_sd_key with a named sd_same_key error before any lock', () => {
    const sameKeyIdx = body.indexOf("'error', 'sd_same_key'");
    const lockIdx = body.indexOf('pg_advisory_xact_lock');
    expect(sameKeyIdx, 'sd_same_key branch not found').toBeGreaterThan(-1);
    expect(lockIdx, 'advisory lock not found').toBeGreaterThan(-1);
    expect(sameKeyIdx).toBeLessThan(lockIdx);
  });

  it('acquires advisory locks in LEAST-then-GREATEST order (deterministic across both retarget directions)', () => {
    const leastIdx = body.indexOf('pg_advisory_xact_lock(hashtext(LEAST(p_release_sd_key, p_claim_sd_key)))');
    const greatestIdx = body.indexOf('pg_advisory_xact_lock(hashtext(GREATEST(p_release_sd_key, p_claim_sd_key)))');
    expect(leastIdx, 'LEAST-ordered lock not found').toBeGreaterThan(-1);
    expect(greatestIdx, 'GREATEST-ordered lock not found').toBeGreaterThan(-1);
    expect(leastIdx).toBeLessThan(greatestIdx);
  });

  it('delegates the release half to release_sd_by_key and the claim half to claim_sd (no reimplementation)', () => {
    expect(body).toMatch(/release_sd_by_key\(p_session_id, p_release_sd_key, p_reason\)/);
    expect(body).toMatch(/claim_sd\(p_claim_sd_key, p_session_id, NULL, false, NULL\)/);
  });

  it('a failed claim raises inside a nested EXCEPTION block, rolling back the release (atomicity)', () => {
    expect(body).toMatch(/BEGIN[\s\S]*RAISE EXCEPTION[\s\S]*EXCEPTION WHEN OTHERS THEN/);
    const exceptionIdx = body.indexOf('EXCEPTION WHEN OTHERS THEN');
    const exceptionReturn = body.slice(exceptionIdx);
    expect(exceptionReturn).toMatch(/'error',\s*'retarget_claim_failed'/);
  });

  it('keeps SECURITY DEFINER and the pinned search_path', () => {
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path TO 'public'/);
  });
});

describe('this test does not claim the migration is deployed', () => {
  it('names the script that actually checks the live definition', () => {
    expect(fs.existsSync(path.join(ROOT, 'scripts/one-off/verify-release-sd-by-key.mjs'))).toBe(true);
  });
});
