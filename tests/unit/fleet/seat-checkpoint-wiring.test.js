/**
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-A -- structural wiring proof. Behavior tests on
 * lib/fleet/seat-checkpoint-mirror.cjs prove the function CAN mirror correctly; they do not
 * prove scripts/stale-session-sweep.cjs's tick ACTUALLY CALLS it. Mirrors this repo's own
 * precedent (dispatch-send-backpressure.test.js's header note on the same distinction).
 *
 * Also proves TS-6: the read-side staleness check has NO claude_sessions/loadLiveSessionIds
 * dependency in its source at all -- a source-text guard, since the round-2/round-3 PLAN-phase
 * defect (evidence 3fb39af9) was exactly "the read side quietly grew a liveness dependency that
 * diverged from the write side."
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('seat-checkpoint mirror wiring (the sweep tick actually calls it)', () => {
  const sweep = readFileSync(path.join(REPO, 'scripts/stale-session-sweep.cjs'), 'utf8');

  it('requires lib/fleet/seat-checkpoint-registry.cjs and lib/fleet/seat-checkpoint-mirror.cjs', () => {
    expect(sweep).toMatch(/require\(['"]\.\.\/lib\/fleet\/seat-checkpoint-registry\.cjs['"]\)/);
    expect(sweep).toMatch(/require\(['"]\.\.\/lib\/fleet\/seat-checkpoint-mirror\.cjs['"]\)/);
  });

  it('iterates SEAT_NAMES and calls mirrorSeat for each', () => {
    expect(sweep).toMatch(/for \(const seatName of SEAT_NAMES\)/);
    expect(sweep).toMatch(/await mirrorSeat\(supabase, claudeDir, seatName\)/);
  });

  it('is wrapped in its own try/catch (a mirror failure must never abort the sweep)', () => {
    const idx = sweep.indexOf('SEAT CHECKPOINT MIRROR TICK');
    expect(idx).toBeGreaterThan(-1);
    const before = sweep.slice(Math.max(0, idx - 900), idx);
    expect(before).toMatch(/catch \(seatCkErr\)/);
  });
});

describe('read-side staleness check has NO claude_sessions/local-file dependency (TS-6)', () => {
  const readSide = readFileSync(path.join(REPO, 'scripts/seat-checkpoint-staleness-check.mjs'), 'utf8');
  // Strip block/line comments so prose EXPLAINING the absence of a dependency (which legitimately
  // names claude_sessions/.claude/ as what this file deliberately does NOT touch) doesn't trip a
  // naive substring match on the code itself -- the exact "phrase in text vs. real reference"
  // distinction this test exists to get right.
  const code = readSide.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\*.*$/gm, '').replace(/\/\/.*$/gm, '');

  it('never queries the claude_sessions table', () => {
    expect(code).not.toMatch(/\.from\(['"]claude_sessions['"]\)/);
  });

  it('never calls loadLiveSessionIds', () => {
    expect(code).not.toMatch(/loadLiveSessionIds/);
  });

  it('never imports a filesystem module (fs/path) -- it never needs local file access at all', () => {
    expect(code).not.toMatch(/from ['"]node:fs['"]|from ['"]fs['"]|require\(['"]fs['"]\)/);
  });

  it('queries role_seat_checkpoints only', () => {
    expect(code).toMatch(/\.from\(['"]role_seat_checkpoints['"]\)/);
  });

  // EXEC-TO-PLAN TESTING evidence (2026-09-06): `import.meta.url === \`file://${process.argv[1]}\``
  // never matches on Windows (process.argv[1] is a bare drive path, not a file:// URL), so the
  // script's main() silently never ran and the check exited 0 with no output -- exactly the
  // false-pass-0 this file's own docblock claims to prevent. Fixed via the repo's own
  // lib/utils/is-main-module.js helper; this guards the regression.
  it('uses the cross-platform isMainModule guard, not the Windows-broken file:// string comparison', () => {
    expect(code).toMatch(/isMainModule\(import\.meta\.url\)/);
    expect(code).not.toMatch(/import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`/);
  });
});

describe('write side has NO GHA workflow of its own (TR-2)', () => {
  it('exactly one new workflow file exists, and it is the read-side daily cron', () => {
    const workflowPath = path.join(REPO, '.github/workflows/seat-checkpoint-staleness-cron.yml');
    const content = readFileSync(workflowPath, 'utf8');
    expect(content).toContain('scripts/seat-checkpoint-staleness-check.mjs');
    expect(content).not.toContain('seat-checkpoint-mirror');
  });
});
