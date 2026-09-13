// QF-20260912-665: createWorkTypeWorktree's reuse returns never refreshed a stale propagated
// .env after a root secret rotation -- only resolve-sd-workdir.js's SD re-attach path called
// refreshPropagatedEnv (QF-20260901-296). A QF tree provisioned via create-quick-fix.js ->
// createWorkTypeWorktree never went through that path, so ten live pool trees kept carrying a
// pre-rotation registrar token. Fix: createWorkTypeWorktree itself calls refreshPropagatedEnv
// before every reused:true return, so no caller (quick-fix / team-spawner / plan-to-exec /
// lead-final / sd-start) can forget it.
//
// createWorkTypeWorktree performs real git worktree filesystem/git operations, so -- matching
// this repo's own convention for pinning behavior on that function (see
// tests/unit/worktree-reaper/qf-quota-relocation.test.js) -- this is a source-pinning test
// rather than a live-git fixture test.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'lib/worktree-manager.js'), 'utf8');

describe('createWorkTypeWorktree refreshes a stale propagated .env on reuse (QF-20260912-665)', () => {
  it('the legacy-SD reuse return refreshes the env before returning reused:true', () => {
    const legacyReuseBlock = SOURCE.slice(
      SOURCE.indexOf("logWorktreeEvent('worktree.reuse_legacy'"),
      SOURCE.indexOf("reused: true", SOURCE.indexOf("logWorktreeEvent('worktree.reuse_legacy'"))
    );
    expect(legacyReuseBlock).toMatch(/refreshPropagatedEnv\(repoRoot, legacyPath\)/);
  });

  it('the general reuse return refreshes the env before returning reused:true', () => {
    const generalReuseBlock = SOURCE.slice(
      SOURCE.indexOf("logWorktreeEvent('worktree.reuse',"),
      SOURCE.indexOf("reused: true", SOURCE.indexOf("logWorktreeEvent('worktree.reuse',"))
    );
    expect(generalReuseBlock).toMatch(/refreshPropagatedEnv\(repoRoot, worktreePath\)/);
  });

  it('the refresh call is non-fatal, matching propagateEnvFile\'s existing swallow-and-continue behavior', () => {
    const occurrences = SOURCE.match(/try \{ refreshPropagatedEnv\([^)]+\); \} catch/g) || [];
    expect(occurrences).toHaveLength(2);
  });
});
