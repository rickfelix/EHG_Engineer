/**
 * SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-D
 *
 * runFullE2ESuite() must spawn Playwright with cwd:repoPath (the resolved target repo),
 * never process.cwd() (the orchestrator's own repo). This is smoke_test_steps[2] from the
 * SD's promises -- a heal-loop pass found it was never asserted by a mocked-spawn test
 * (the zero-infra short-circuit test never reaches spawn(), and no real spawn() can run
 * safely in a unit test). Mocks child_process.spawn and fabricates the JSON report file
 * spawn would normally have produced, so the real evidenceDir/readFileSync code path runs.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { EventEmitter } from 'events';
import path from 'path';

const spawnMock = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args) => spawnMock(...args)
}));

const { runFullE2ESuite } = await import('../../../lib/sub-agents/testing/phases/phase3-execution.js');

const scratchDirs = [];
function makeScratchRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-spawn-cwd-'));
  scratchDirs.push(dir);
  return dir;
}

afterEach(() => {
  spawnMock.mockClear();
  while (scratchDirs.length) {
    const dir = scratchDirs.pop();
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('runFullE2ESuite() — spawns Playwright with cwd:repoPath, never process.cwd()', () => {
  it('passes cwd:repoPath to spawn() for an infra-having repo distinct from process.cwd()', async () => {
    const repo = makeScratchRepo();
    writeFileSync(path.join(repo, 'playwright.config.js'), 'module.exports = {};');
    expect(repo).not.toBe(process.cwd());

    spawnMock.mockImplementation((_cmd, _args, opts) => {
      // Fabricate the JSON report the real Playwright process would have written,
      // using the SAME PLAYWRIGHT_JSON_OUTPUT_NAME env var runFullE2ESuite set.
      const reportPath = opts.env.PLAYWRIGHT_JSON_OUTPUT_NAME;
      mkdirSync(path.dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, JSON.stringify({ stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0, duration: 1 }, suites: [] }));
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('exit', 0));
      return child;
    });

    await runFullE2ESuite('test-sd', { repoPath: repo });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [, , opts] = spawnMock.mock.calls[0];
    expect(opts.cwd).toBe(repo);
    expect(opts.cwd).not.toBe(process.cwd());
  });
});
