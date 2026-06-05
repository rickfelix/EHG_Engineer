/**
 * QF-20260605-081 / PAT-CLMMULTI-002 — worktree claim guard no longer false-blocks
 * the rightful worktree owner under parallel sessions.
 *
 * Static-source guards (the hook runs main() on require — cannot be imported;
 * mirrors tests/unit/pre-tool-enforce-strand-recovery.test.js). They pin the fix
 * so a regression that re-introduces the shared-state UUID comparison fails CI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const hookPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'pre-tool-enforce.cjs');
const hookSrc = readFileSync(hookPath, 'utf8');

// Slice covering only ENFORCEMENT 4 so assertions don't accidentally match
// the other enforcements that legitimately read unified-session-state.json.
const enf4 = hookSrc.slice(
  hookSrc.indexOf('ENFORCEMENT 4: Worktree Claim Guard'),
  hookSrc.indexOf('ENFORCEMENT 5: DB-Only Strategic Artifacts'),
);

describe('PAT-CLMMULTI-002 — DB-corroborated, session-scoped worktree claim guard', () => {
  it('defines resolveSessionClaimedSdKey querying strategic_directives_v2 by claiming_session_id for sd_key', () => {
    expect(hookSrc).toMatch(/async function resolveSessionClaimedSdKey\(/);
    expect(hookSrc).toContain('claiming_session_id=eq.');
    expect(hookSrc).toContain('select=sd_key');
  });

  it('the helper fail-opens to null (missing creds / error) so the caller never blocks on uncertainty', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('async function resolveSessionClaimedSdKey'));
    expect(fn).toMatch(/if \(!supabaseUrl \|\| !serviceKey \|\| !sessionId\) return null;/);
    expect(fn).toMatch(/catch \{\s*return null;/);
  });

  it('ENFORCEMENT 4 resolves the claim from the DB (session-scoped), not the shared state file', () => {
    expect(enf4).toContain('resolveSessionClaimedSdKey(_SESSION_ID)');
    // Regression: the buggy shared-state UUID comparison must be gone from this guard.
    expect(enf4).not.toContain('readFileSync(stateFile'); // guard no longer reads the shared state file
    expect(enf4).not.toContain('claimedSd !== worktreeSdKey');
    expect(enf4).not.toContain('state.sd?.id');
  });

  it('compares sd_key (claimedSdKey vs worktreeSdKey), not a UUID id', () => {
    expect(enf4).toContain('claimedSdKey !== worktreeSdKey');
  });

  it('exposes the LEO_CLAIM_GUARD=off kill-switch', () => {
    expect(enf4).toMatch(/process\.env\.LEO_CLAIM_GUARD !== 'off'/);
  });

  it('skips the qf/<id> container path segment (never an sd_key mismatch)', () => {
    expect(enf4).toContain("match[1] !== 'qf'");
  });

  it('still hard-blocks (exit 2) on positive confirmation of a different claim', () => {
    expect(enf4).toMatch(/await auditAndExit\(auditPromise, 2\)/);
    expect(enf4).toContain('PAT-CLMMULTI-002');
  });
});
