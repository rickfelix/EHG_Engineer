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
// QF-20260804-087 moved the block/permit DECISION into its own module so it could be tested
// behaviourally rather than by string-matching (tests/unit/worktree-claim-decision-qf087.test.js).
// The pins below follow the invariant to its new address — they are not relaxed.
const decisionSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'worktree-claim-decision.cjs'), 'utf8',
);

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

  it('compares sd_key (claimedSdKey vs worktreeKey), not a UUID id', () => {
    // The guard hands the sd_key (never a UUID) to the decision...
    expect(enf4).toMatch(/shouldBlockWorktreeEdit\(\{\s*worktreeKey: worktreeSdKey, claimedSdKey/);
    // ...and the decision still performs the sd_key comparison this pin has always guarded.
    expect(decisionSrc).toContain('claimedSdKey !== worktreeKey');
  });

  // QF-20260804-087: the guard read strategic_directives_v2 ONLY, so a QF claim (which lives in
  // quick_fixes) was invisible and the rightful QF owner was blocked with no remedy. These pin the
  // two properties a future refactor is most likely to quietly drop.
  it('also resolves a QF claim from quick_fixes, scoped to the one key being edited', () => {
    expect(hookSrc).toMatch(/async function sessionHoldsQuickFixClaim\(/);
    expect(hookSrc).toContain('/rest/v1/quick_fixes?claiming_session_id=eq.');
    // Scoped by id — never a blanket "any QF claim permits any QF worktree".
    expect(hookSrc).toContain("'&id=eq.' + encodeURIComponent(qfKey)");
  });

  it('keeps the QF lookup TRI-STATE: null (unreadable) must not collapse into false (not held)', () => {
    // Collapsing them would re-block the exact worker this fix unblocks on any transient blip.
    expect(decisionSrc).toContain('if (qfHeld !== false) return false;');
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
