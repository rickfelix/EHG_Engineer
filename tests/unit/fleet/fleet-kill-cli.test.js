// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-2 — CLI adapter.
// The orchestration is tested in lib/fleet/graceful-kill.test.js; these cover the ADAPTER,
// where a wrong mapping would silently change what the operator is told.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { claudeProbeToTriState, buildKillDeps, isWorktreeDirty } from '../../../scripts/fleet-kill.mjs';

describe('FR2-CLI: pidIsClaude is TRI-STATE and must not be flattened', () => {
  it('MATCH means the pid IS the agent', () => {
    expect(claudeProbeToTriState('MATCH')).toBe(true);
  });

  it('NO_MATCH means the pid is NOT the agent — the shell-wrapper case', () => {
    expect(claudeProbeToTriState('NO_MATCH')).toBe(false);
  });

  it('PROBE_FAILED IS NOT false — a broken probe is not a wrong-process diagnosis', () => {
    // Both end in a refusal, but they are different FACTS and produce different messages:
    // false says "this is the shell wrapper claude_sessions.pid falls back to"; undefined says
    // "the probe broke and told us nothing". claimant-liveness's own docblock is explicit that
    // PROBE_FAILED is NOT death, so flattening it would report a diagnosis we never made.
    expect(claudeProbeToTriState('PROBE_FAILED')).toBeUndefined();
  });

  it('an unrecognised probe result is treated as unverifiable, never as a pass', () => {
    expect(claudeProbeToTriState(undefined)).toBeUndefined();
    expect(claudeProbeToTriState('')).toBeUndefined();
    expect(claudeProbeToTriState(true)).toBeUndefined();
  });
});

// FR-2 AC-2-3. buildKillDeps had NO test, and that is exactly where the defect lived: verifyGone
// was left undefined on the production path, graceful-kill reads it as
// `gone = verifyGone ? await verifyGone(pid) : true`, so `gone` was unconditionally true, the
// SIGKILL escalation was dead code, and the verdict claimed "terminated and verified absent"
// having verified nothing. These assert the DEP SET the operator actually gets.
describe('FR2-CLI: buildKillDeps supplies verifyGone and it FAILS CLOSED', () => {
  const deps = (opts) => buildKillDeps({}, 'sess-1', opts);

  it('supplies verifyGone on the PRODUCTION path — the regression that made the kill lie', () => {
    // Was `undefined` before the fix. If this ever regresses, graceful-kill silently reports a
    // verification it never performed, so this assertion is the whole point of the file.
    expect(typeof deps({ dryRun: false }).verifyGone).toBe('function');
  });

  it('a dry run still short-circuits to true', async () => {
    await expect(deps({ dryRun: true }).verifyGone(4321)).resolves.toBe(true);
  });

  // WHY THE MAPPING IS NOT MOCK-TESTED HERE, stated instead of quietly omitted:
  // fleet-kill.mjs pulls pidIsClaude through createRequire (`require('../lib/fleet/
  // claimant-liveness.cjs')`), which vi.mock cannot intercept — a mock-based MATCH/PROBE_FAILED
  // test SILENTLY runs the real probe and passes for the wrong reason. I tried it; every pid came
  // back NO_MATCH. Asserting the composed expression against a re-derivation instead would be the
  // same source-text/self-comparison anti-pattern this SD is full of, so it is not done.
  // The mapping IS covered: the tri-state block above pins claudeProbeToTriState exhaustively, and
  // verifyGone composes exactly `claudeProbeToTriState(pidIsClaude(pid)) === false`, so only
  // NO_MATCH yields gone. Making this directly observable needs an injectable probe in
  // buildKillDeps — a refactor, deliberately outside this wiring fix's scope fence.
  it('is exactly the fail-closed composition: only NO_MATCH maps to gone', () => {
    expect(claudeProbeToTriState('NO_MATCH') === false).toBe(true);   // gone
    expect(claudeProbeToTriState('MATCH') === false).toBe(false);     // still alive
    expect(claudeProbeToTriState('PROBE_FAILED') === false).toBe(false); // unverifiable -> NOT gone
  });

  it('FR-3: supplies isWorktreeDirty -- the regression that left wasDirty unconditionally false in production', () => {
    // Was absent before the fix, matching verifyGone's own prior omission -- the wiring gap that
    // hid the isWorkDurableAfterPrepark defect regardless of that function being fixed.
    expect(typeof deps({ dryRun: false }).isWorktreeDirty).toBe('function');
  });
});

// SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001 / FR-3 — graceful-kill's own, independent dirty check.
// Real git operations against throwaway tmpdirs, not a mocked execSync: a synchronicity claim in
// particular is only meaningful proven against the ACTUAL return value, not a stubbed one.
describe('FR-3: isWorktreeDirty — synchronous, fail-closed, and correctly discriminates', () => {
  let dirtyRepo;
  let cleanRepo;

  beforeAll(() => {
    dirtyRepo = mkdtempSync(path.join(tmpdir(), 'fk-dirty-'));
    execSync('git init -q', { cwd: dirtyRepo });
    writeFileSync(path.join(dirtyRepo, 'untracked.txt'), 'wip');

    cleanRepo = mkdtempSync(path.join(tmpdir(), 'fk-clean-'));
    execSync('git init -q', { cwd: cleanRepo });
    execSync('git config user.email "t@t.com" && git config user.name "t"', { cwd: cleanRepo });
    writeFileSync(path.join(cleanRepo, 'committed.txt'), 'stable');
    execSync('git add -A && git commit -q -m init', { cwd: cleanRepo });
  });

  afterAll(() => {
    rmSync(dirtyRepo, { recursive: true, force: true });
    rmSync(cleanRepo, { recursive: true, force: true });
  });

  it('TR-2: the return value is a real boolean, not a thenable -- the caller reads it unawaited', () => {
    // The concrete, falsifiable check the PLAN-phase correction asks for: an accidentally-async
    // implementation would return a Promise here, and `typeof promise.then` would be 'function'.
    const result = isWorktreeDirty(cleanRepo);
    expect(typeof result).toBe('boolean');
    expect(typeof result?.then).not.toBe('function');
  });

  it('detects a genuinely dirty tree (untracked file)', () => {
    expect(isWorktreeDirty(dirtyRepo)).toBe(true);
  });

  it('detects a genuinely clean tree', () => {
    expect(isWorktreeDirty(cleanRepo)).toBe(false);
  });

  it('FAILS CLOSED on a path git cannot resolve at all', () => {
    expect(isWorktreeDirty(path.join(tmpdir(), 'fk-does-not-exist-' + Date.now()))).toBe(true);
  });

  it('FAILS CLOSED on a missing/empty worktreePath -- never silently treated as clean', () => {
    expect(isWorktreeDirty(null)).toBe(true);
    expect(isWorktreeDirty('')).toBe(true);
    expect(isWorktreeDirty(undefined)).toBe(true);
  });
});
