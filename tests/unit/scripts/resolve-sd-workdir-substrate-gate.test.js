/**
 * SD-LEO-INFRA-LEO-INFRA-WORKTREE-001 (FR-004 / TS-007)
 *
 * Wiring verification + sd-start integration assertions for the substrate gate.
 *
 * resolve-sd-workdir.js does not export its internal helpers (createWorktree,
 * etc.) so a true subprocess-driven integration test would require spinning up
 * a scratch git repo and mocking child_process.execSync globally — out of scope
 * for the LOC budget. Instead, this test asserts:
 *
 *   1. resolve-sd-workdir.js imports SUBSTRATE_ITEMS + validateWorktreeSubstrate
 *      from the canonical source.
 *   2. The substrate gate sits AFTER ensureWorktreeEssentials (so symlink/copy
 *      side-effects run before validation) and BEFORE the return statement.
 *   3. The gate throws an Error carrying errCode='WORKTREE_INCOMPLETE' and a
 *      missing[] payload — the exact contract sd-start.js's catch block at
 *      line ~1131 expects via classifyWorktreeFailure(err, { errCode: err?.code }).
 *   4. The error path emits a structured log row with event='worktree.incomplete'.
 *
 * sd-start.js's existing catch block (line ~1131-1144) is verified not by
 * re-asserting its own behavior here but by reading the file once and confirming
 * the classifyWorktreeFailure → releaseClaimOnWorktreeFailure → exit pattern
 * is intact. Any change to that flow that breaks the contract surfaces as a
 * regression in this test.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const RESOLVE_SOURCE_PATH = path.resolve(
  __dirname,
  '../../../scripts/resolve-sd-workdir.js'
);
const SD_START_PATH = path.resolve(__dirname, '../../../scripts/sd-start.js');

describe('SD-LEO-INFRA-LEO-INFRA-WORKTREE-001 — substrate gate wiring', () => {
  let resolveSrc;
  let sdStartSrc;

  beforeAll(() => {
    resolveSrc = fs.readFileSync(RESOLVE_SOURCE_PATH, 'utf8');
    sdStartSrc = fs.readFileSync(SD_START_PATH, 'utf8');
  });

  it('resolve-sd-workdir imports SUBSTRATE_ITEMS and validateWorktreeSubstrate', () => {
    expect(resolveSrc).toMatch(/SUBSTRATE_ITEMS/);
    expect(resolveSrc).toMatch(/validateWorktreeSubstrate/);
    expect(resolveSrc).toMatch(
      /from\s+['"]\.\.\/lib\/worktree-manager\.js['"]/
    );
  });

  it('substrate gate is invoked after ensureWorktreeEssentials and before return', () => {
    const essentialsIdx = resolveSrc.indexOf('ensureWorktreeEssentials(worktreePath, repoRoot)');
    const substrateIdx = resolveSrc.indexOf('validateWorktreeSubstrate(worktreePath)');
    const returnIdx = resolveSrc.indexOf('return { path: worktreePath, branch, created: true }');

    expect(essentialsIdx).toBeGreaterThan(0);
    expect(substrateIdx).toBeGreaterThan(0);
    expect(returnIdx).toBeGreaterThan(0);
    // Order: essentials -> substrate -> return
    expect(substrateIdx).toBeGreaterThan(essentialsIdx);
    expect(returnIdx).toBeGreaterThan(substrateIdx);
  });

  it('substrate gate emits structured log row with event=worktree.incomplete', () => {
    expect(resolveSrc).toMatch(/event:\s*['"]worktree\.incomplete['"]/);
    expect(resolveSrc).toMatch(/missing:\s*substrate\.missing/);
    expect(resolveSrc).toMatch(/errCode:\s*['"]WORKTREE_INCOMPLETE['"]/);
  });

  it('substrate gate throws Error with code/errCode/missing/worktreePath fields', () => {
    expect(resolveSrc).toMatch(/err\.code\s*=\s*['"]WORKTREE_INCOMPLETE['"]/);
    expect(resolveSrc).toMatch(/err\.errCode\s*=\s*['"]WORKTREE_INCOMPLETE['"]/);
    expect(resolveSrc).toMatch(/err\.missing\s*=\s*substrate\.missing/);
    expect(resolveSrc).toMatch(/err\.worktreePath\s*=\s*worktreePath/);
  });

  it('sd-start.js catch path still calls classifyWorktreeFailure with err.code context', () => {
    // Drift guard: if the catch block at ~line 1131 changes shape, the substrate
    // gate's contract breaks silently. This assertion proves the consumer side
    // hasn't drifted away from accepting our errCode pattern.
    expect(sdStartSrc).toMatch(
      /classifyWorktreeFailure\s*\(\s*wtErr\s*,\s*\{\s*errCode:\s*wtErr\??\.code\s*\}\s*\)/
    );
    expect(sdStartSrc).toMatch(/releaseClaimOnWorktreeFailure\s*\(\s*['"]resolution['"]\s*\)/);
    expect(sdStartSrc).toMatch(/process\.exit\s*\(\s*1\s*\)/);
  });

  it('substrate gate error message names the missing items', () => {
    expect(resolveSrc).toMatch(/substrate items missing after creation/i);
    expect(resolveSrc).toMatch(/substrate\.missing\.join\(/);
  });

  it('substrate gate explicitly preserves the worktree directory (no auto-cleanup)', () => {
    // Per FR-005 boundary — cleanup is out of scope, the directory stays for
    // operator inspection. No fs.rmSync, no git worktree remove in the gate.
    const gateBlockMatch = resolveSrc.match(
      /const substrate = validateWorktreeSubstrate[\s\S]+?(throw err;)/
    );
    expect(gateBlockMatch).not.toBeNull();
    const gateBlock = gateBlockMatch[0];
    expect(gateBlock).not.toMatch(/fs\.rmSync/);
    expect(gateBlock).not.toMatch(/git worktree remove/);
    // But the message should hint at preservation
    expect(gateBlock).toMatch(/preserved for inspection/i);
  });
});
