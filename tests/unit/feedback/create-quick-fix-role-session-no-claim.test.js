// QF-20260704-143: role sessions (coordinator/Adam/Solomon) file QFs as dispatch
// supply for workers, not work they'll do themselves. Auto-claiming to the creator
// stamped claiming_session_id = <role session>, so the QF looked open in the queue
// but was claim-locked and invisible to worker polls -- costing ~1.5h of lock time
// on 5 role-filed QFs in one morning, including a CRITICAL wrong-repo-merge fix.
// The same filing also pre-provisioned a worktree for the auto-claimed creator,
// burning a worktree-pool slot per queued role-filed QF (11 unclaimed QFs held
// 11/20 slots).
//
// Static-pattern assertions, same convention as create-quick-fix-liveness-gate.test.js
// (avoids mocking the full Supabase chain for a top-level CLI script).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../scripts/create-quick-fix.js');

describe('QF-20260704-143: role-session filings skip auto-claim + worktree pre-provision', () => {
  const code = fs.readFileSync(SRC, 'utf8');

  const ROLE_CHECK_RE = /creatorMeta\.is_coordinator === true \|\| creatorMeta\.role === 'adam' \|\| creatorMeta\.role === 'solomon'/;
  const CLAIM_UPDATE_RE = /\.update\(\{\s*claiming_session_id:\s*creatorSessionId/;
  const WORKTREE_CREATE_RE = /createWorkTypeWorktree\(/;

  it('checks is_coordinator / role in {adam, solomon} from claude_sessions.metadata', () => {
    expect(code).toMatch(/\.from\(\s*['"]claude_sessions['"]\s*\)/);
    expect(code).toMatch(ROLE_CHECK_RE);
  });

  it('the role-session check precedes BOTH the auto-claim update and the worktree creation call', () => {
    const roleM = code.match(ROLE_CHECK_RE);
    const claimM = code.match(CLAIM_UPDATE_RE);
    const worktreeM = code.match(WORKTREE_CREATE_RE);
    expect(roleM?.index).toBeGreaterThanOrEqual(0);
    expect(claimM?.index).toBeGreaterThanOrEqual(0);
    expect(worktreeM?.index).toBeGreaterThanOrEqual(0);
    expect(roleM.index).toBeLessThan(claimM.index);
    expect(roleM.index).toBeLessThan(worktreeM.index);
  });

  it('returns early (printNextSteps with no claim/worktree) on a role-session match', () => {
    const roleCheckStart = code.search(ROLE_CHECK_RE);
    const nextChunk = code.slice(roleCheckStart, roleCheckStart + 500);
    expect(nextChunk).toMatch(/return printNextSteps\(qfId, false, null\)/);
    expect(nextChunk).toMatch(/queued unclaimed/);
  });

  it('a non-role (worker) creator still falls through to the auto-claim update', () => {
    const roleCheckStart = code.search(ROLE_CHECK_RE);
    const claimM = code.match(CLAIM_UPDATE_RE);
    // The claim update must still be reachable in the same function after the role check --
    // i.e. the fix does not remove or short-circuit the normal worker-filing path.
    expect(claimM.index).toBeGreaterThan(roleCheckStart);
  });
});
