/**
 * Unit tests for branch-file-reader.
 * SD: SD-LEO-INFRA-FIX-GATE-FILE-001
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync as realExecSync } from 'child_process';

let execSyncMock;

vi.mock('child_process', () => ({
  execSync: (...args) => execSyncMock(...args),
}));

async function importModule() {
  vi.resetModules();
  return import('../../scripts/modules/handoff/lib/branch-file-reader.js');
}

describe('branch-file-reader', () => {
  beforeEach(() => {
    execSyncMock = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reads file contents via git show origin/<branch>:<path>', async () => {
    execSyncMock.mockReturnValue('file contents from origin');
    const { createBranchFileReader } = await importModule();
    const reader = createBranchFileReader('/repos/ehg');
    const content = reader.readFile('feat/some-branch', 'src/App.tsx');
    expect(content).toBe('file contents from origin');
    expect(execSyncMock).toHaveBeenCalledTimes(1);
    const call = execSyncMock.mock.calls[0][0];
    expect(call).toContain('git -C');
    expect(call).toContain('show "origin/feat/some-branch:src/App.tsx"');
  });

  it('caches repeat reads for same (branch, path)', async () => {
    execSyncMock.mockReturnValue('cached contents');
    const { createBranchFileReader } = await importModule();
    const reader = createBranchFileReader('/repos/ehg');
    reader.readFile('feat/x', 'src/A.tsx');
    reader.readFile('feat/x', 'src/A.tsx');
    reader.readFile('feat/x', 'src/A.tsx');
    expect(execSyncMock).toHaveBeenCalledTimes(1);
    const s = reader.stats();
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(1);
    expect(s.size).toBe(1);
  });

  it('does not cache across different paths', async () => {
    execSyncMock.mockReturnValue('contents');
    const { createBranchFileReader } = await importModule();
    const reader = createBranchFileReader('/repos/ehg');
    reader.readFile('feat/x', 'src/A.tsx');
    reader.readFile('feat/x', 'src/B.tsx');
    expect(execSyncMock).toHaveBeenCalledTimes(2);
  });

  it('retries with git fetch when first show fails', async () => {
    execSyncMock.mockImplementationOnce(() => { throw new Error('unknown ref'); });
    execSyncMock.mockImplementationOnce(() => ''); // fetch succeeds
    execSyncMock.mockImplementationOnce(() => 'contents after fetch');
    const { createBranchFileReader } = await importModule();
    const reader = createBranchFileReader('/repos/ehg');
    const content = reader.readFile('feat/new', 'src/C.tsx');
    expect(content).toBe('contents after fetch');
    expect(execSyncMock).toHaveBeenCalledTimes(3);
    const fetchCall = execSyncMock.mock.calls[1][0];
    expect(fetchCall).toContain('fetch origin feat/new');
  });

  it('throws with clear error when both show attempts fail', async () => {
    execSyncMock.mockImplementation(() => { throw new Error('fatal: bad revision'); });
    const { createBranchFileReader } = await importModule();
    const reader = createBranchFileReader('/repos/ehg');
    expect(() => reader.readFile('nonexistent', 'f.txt')).toThrow(/cannot read origin\/nonexistent:f\.txt/);
  });

  it('uses repoRoot in git -C argument', async () => {
    execSyncMock.mockReturnValue('x');
    const { createBranchFileReader } = await importModule();
    const reader = createBranchFileReader('/custom/path');
    reader.readFile('br', 'p.js');
    expect(execSyncMock.mock.calls[0][0]).toContain('git -C "/custom/path"');
  });
});
