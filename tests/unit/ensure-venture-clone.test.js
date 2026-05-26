/**
 * SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 — FR-3: ensureVentureClone.
 *
 * The persistent venture clone must be cloned-if-missing, refreshed-if-present, and
 * NEVER deleted (TS-3 happy path + TS-7 cleanup safety). Side effects (git, fs) are
 * injected so the clone/refresh decision and the never-delete invariant are asserted
 * without touching the network or disk.
 */
import { describe, it, expect, vi } from 'vitest';
import { ensureVentureClone } from '../../lib/eva/bridge/ensure-venture-clone.js';

const URL = 'https://github.com/rickfelix/cronlinter';
const LOCAL = '/repos/cronlinter';

function harness({ hasGit, failRefresh = false } = {}) {
  const calls = [];
  const run = vi.fn((cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    if (failRefresh && args.includes('pull')) throw new Error('pull conflict');
    return '';
  });
  const existsSync = vi.fn((p) => hasGit && p.replace(/\\/g, '/').endsWith('/.git'));
  return { run, existsSync, calls };
}

// A destructive op never appears in the issued commands (TS-7 invariant).
function assertNoDelete(calls) {
  for (const c of calls) {
    expect(c).not.toMatch(/\b(rm|rmdir|del|rd|worktree\s+remove|reset\s+--hard|clean\s+-)/i);
  }
}

describe('FR-3 / TS-3: clone-if-missing', () => {
  it('no .git at localPath → git clone <url> <localPath>, action=cloned', () => {
    const { run, existsSync, calls } = harness({ hasGit: false });
    const r = ensureVentureClone(URL, LOCAL, { run, existsSync });
    expect(r).toMatchObject({ ok: true, action: 'cloned', path: LOCAL });
    expect(run).toHaveBeenCalledTimes(1);
    expect(calls[0]).toBe(`git clone ${URL} ${LOCAL}`);
    assertNoDelete(calls);
  });
});

describe('FR-3: refresh-if-present (fetch + checkout main + ff-only pull)', () => {
  it('.git present → refreshes, never re-clones, action=refreshed', () => {
    const { run, existsSync, calls } = harness({ hasGit: true });
    const r = ensureVentureClone(URL, LOCAL, { run, existsSync });
    expect(r).toMatchObject({ ok: true, action: 'refreshed' });
    expect(calls).toEqual([
      `git -C ${LOCAL} fetch origin --prune`,
      `git -C ${LOCAL} checkout main`,
      `git -C ${LOCAL} pull --ff-only origin main`,
    ]);
    expect(calls.some((c) => c.includes('clone'))).toBe(false);
    assertNoDelete(calls);
  });

  it('refresh failure is non-fatal → action=present, clone preserved (NOT deleted)', () => {
    const { run, existsSync, calls } = harness({ hasGit: true, failRefresh: true });
    const r = ensureVentureClone(URL, LOCAL, { run, existsSync });
    expect(r).toMatchObject({ ok: true, action: 'present', reason: 'refresh_failed' });
    assertNoDelete(calls); // TS-7: a failed refresh must NEVER delete the persistent clone
  });
});

describe('FR-3: safety guards', () => {
  it('rejects a non-GitHub-https URL → skipped, no git command issued', () => {
    const { run, existsSync, calls } = harness({ hasGit: false });
    const r = ensureVentureClone('file:///etc/passwd; rm -rf /', LOCAL, { run, existsSync });
    expect(r).toMatchObject({ ok: false, action: 'skipped', reason: 'no_safe_repo_url' });
    expect(run).not.toHaveBeenCalled();
  });

  it('missing localPath → skipped', () => {
    const { run, existsSync } = harness({ hasGit: false });
    const r = ensureVentureClone(URL, '', { run, existsSync });
    expect(r).toMatchObject({ ok: false, action: 'skipped', reason: 'no_local_path' });
    expect(run).not.toHaveBeenCalled();
  });

  it('normalizes a trailing .git on the URL before cloning', () => {
    const { run, existsSync, calls } = harness({ hasGit: false });
    ensureVentureClone(`${URL}.git`, LOCAL, { run, existsSync });
    expect(calls[0]).toBe(`git clone ${URL} ${LOCAL}`);
  });
});
