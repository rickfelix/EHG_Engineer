/**
 * SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-F (FR-2, AC-4.1 scenario a)
 *
 * executeE2ETests()'s multi-repo routing TRUE arm: when options.sdRow resolves (via
 * computeReposForSD) to 2+ distinct repos that BOTH have E2E infra, it must actually
 * execute against both -- not silently skip, not hard-error, and not treat a real
 * passing run in one repo as sufficient (fail-closed across repos).
 *
 * computeReposForSD is mocked (module-scoped, this file only) so the test never touches
 * this machine's real EHG/EHG_Engineer checkouts. `child_process.spawn` is ALSO mocked
 * so no real `npx playwright` process is launched -- a genuine spawn against a bare
 * scratch dir with no playwright installed risks the exact npx-auto-install hang
 * documented in feedback 5ed7b0fe (this SD's own sibling child -D was built to fix a
 * symptom of that class). The mock writes a deterministic JSON report per repo instead.
 *
 * Found as a coverage gap by TESTING sub-agent EXEC-phase review: a sibling test file
 * had a describe block labeled "executeE2ETests() routing" that never actually called
 * executeE2ETests. This file closes that gap with a real, mocked call.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { EventEmitter } from 'events';

const scratchDirs = [];
function makeScratchRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-route-'));
  scratchDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (scratchDirs.length) {
    const dir = scratchDirs.pop();
    rmSync(dir, { recursive: true, force: true });
  }
});

const repoA = makeScratchRepo();
const repoB = makeScratchRepo();
// Both fixtures HAVE infra (a playwright config), so the TRUE arm's "both repos execute"
// claim is genuinely exercised, not vacuously true via a zero-infra shortcut.
writeFileSync(path.join(repoA, 'playwright.config.js'), 'module.exports = {};');
writeFileSync(path.join(repoB, 'playwright.config.js'), 'module.exports = {};');

vi.mock('../../../lib/sub-agents/repo-target-resolver.js', () => ({
  computeReposForSD: vi.fn(() => [
    { githubRepo: 'stub/a', localPath: repoA },
    { githubRepo: 'stub/b', localPath: repoB }
  ])
}));

// Deterministic stand-in for `npx playwright test --reporter=json`: writes a passing
// 1-test JSON report into the evidence dir the real code already computed (env var
// PLAYWRIGHT_JSON_OUTPUT_NAME), then exits 0 -- never launches a real process.
vi.mock('child_process', () => ({
  spawn: vi.fn((_cmd, _args, opts) => {
    const reportPath = opts.env.PLAYWRIGHT_JSON_OUTPUT_NAME;
    const dir = path.dirname(reportPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(reportPath, JSON.stringify({
      stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0, duration: 5 },
      suites: []
    }));
    const emitter = new EventEmitter();
    setTimeout(() => emitter.emit('exit', 0), 0);
    return emitter;
  })
}));

describe('executeE2ETests() — multi-repo routing TRUE arm (mocked resolver + spawn)', () => {
  it('sdRow resolving to 2 distinct repos with infra routes through runMultiRepoE2ESuite, both execute and pass', async () => {
    const { executeE2ETests } = await import('../../../lib/sub-agents/testing/phases/phase3-execution.js');

    const results = await executeE2ETests('test-sd-routing', { full_e2e: true, sdRow: {} }, null);

    expect(results.per_repo).toBeDefined();
    expect(results.per_repo.length).toBe(2);
    expect(results.per_repo.map((r) => r.repoPath).sort()).toEqual([repoA, repoB].sort());
    expect(results.per_repo.every((r) => r.tests_passed === 1 && r.failed_tests === 0)).toBe(true);
    expect(results.tests_executed).toBe(2);
    expect(results.tests_passed).toBe(2);
    expect(results.failed_tests).toBe(0);
    expect(results.e2e_not_applicable).toBeUndefined();
  });
});
