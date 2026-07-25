/**
 * SD-LEO-INFRA-SWEEP-CLAIM-SAFETY-001 — claim-safety + fail-soft hardening.
 *
 * The stale-session-sweep is the fleet's every-5-min supervisor. Two LEAD-verified
 * defects (live evidence 2026-06-10):
 *   FR-1: a vanished SD (TOCTOU — a concurrent test suite DELETEs an SD-TEST-* fixture
 *         mid-sweep) made the handoff-gate lookup throw SD_NOT_FOUND, which bubbled to the
 *         top-level catch → process.exit(1), killing ALL fleet protection for the tick
 *         (evidence fa7dc41e: "SWEEP FATAL: SD not found for sd_key=SD-TEST-MQ7XOM7D-ORCH-001
 *         during handoff-gate lookup").
 *   FR-2: any per-item reset-gate fault (e.g. SCHEMA_ERROR) must be contained at the item
 *         boundary, never aborting the whole sweep.
 *   FR-3: the QA reset/mutation paths must never iterate or mutate ephemeral SD-TEST-*
 *         fixtures (they churn phantom resets every tick AND are the FR-1 TOCTOU source).
 *
 * Combines behavioral tests (the core safety property — does the gate contain faults
 * instead of throwing?) with static source-invariant tests (the file's established
 * convention — every QA mutation query applies the SD-TEST exclusion).
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');
const SOURCE_PATH = resolve(REPO_ROOT, 'scripts/stale-session-sweep.cjs');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

const require = createRequire(import.meta.url);
const sweep = require(SOURCE_PATH);

// Helper: a code-tagged error mirroring lib/exec-context-guard.mjs::ExecContextError shape.
function guardError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

describe('FR-3 — isTestFixtureSdKey predicate (pure)', () => {
  it('matches the reserved SD-TEST- namespace', () => {
    expect(sweep.isTestFixtureSdKey('SD-TEST-MQ7XOM7D-ORCH-001')).toBe(true);
    expect(sweep.isTestFixtureSdKey('SD-TEST-MQ7XBNBM-ORCH-001')).toBe(true);
    expect(sweep.isTestFixtureSdKey('SD-TEST-001')).toBe(true);
  });

  it('does NOT match real SD source prefixes or QF keys', () => {
    expect(sweep.isTestFixtureSdKey('SD-LEO-INFRA-SWEEP-CLAIM-SAFETY-001')).toBe(false);
    expect(sweep.isTestFixtureSdKey('SD-FDBK-FIX-STAGE-TEMPLATE-FIXES-001')).toBe(false);
    expect(sweep.isTestFixtureSdKey('QF-20260610-001')).toBe(false);
    // anchored: SD-TEST must be a prefix, not a substring
    expect(sweep.isTestFixtureSdKey('SD-LEO-TEST-HARNESS-001')).toBe(false);
  });

  it('is null/undefined/non-string safe', () => {
    expect(sweep.isTestFixtureSdKey(null)).toBe(false);
    expect(sweep.isTestFixtureSdKey(undefined)).toBe(false);
    expect(sweep.isTestFixtureSdKey(123)).toBe(false);
    expect(sweep.isTestFixtureSdKey('')).toBe(false);
  });

  it('exposes the SQL LIKE pattern used at the query sites', () => {
    expect(sweep.TEST_FIXTURE_SD_KEY_LIKE).toBe('SD-TEST-%');
  });
});

describe('FR-1/FR-2 — isSweepResetAllowed fail-soft containment', () => {
  // NB: `await`-ing the call directly IS the "does not throw" assertion — if the gate
  // re-threw (the pre-fix process-exit-causing behavior), the await would reject and the
  // test would fail. Reaching the `expect(result)` line at all proves containment.
  it('FR-1: a vanished SD (SD_NOT_FOUND) returns false and does NOT throw', async () => {
    sweep.__setExecContextGuardForTest({
      assertSweepHandoffGate: vi.fn(async () => { throw guardError('SD_NOT_FOUND', 'SD not found for sd_key=SD-TEST-X during handoff-gate lookup'); }),
    });
    const result = await sweep.isSweepResetAllowed('SD-TEST-X', 'LEAD', 'unit');
    expect(result).toBe(false);
  });

  it('FR-2: an unexpected fault (SCHEMA_ERROR) is contained — returns false, does NOT throw', async () => {
    sweep.__setExecContextGuardForTest({
      assertSweepHandoffGate: vi.fn(async () => { throw guardError('SCHEMA_ERROR', 'Schema error during sd_key→UUID lookup'); }),
    });
    const result = await sweep.isSweepResetAllowed('SD-REAL-001', 'LEAD', 'unit');
    expect(result).toBe(false);
  });

  it('FR-2: even a generic (uncoded) throw is contained — returns false, does NOT throw', async () => {
    sweep.__setExecContextGuardForTest({
      assertSweepHandoffGate: vi.fn(async () => { throw new Error('boom: unexpected'); }),
    });
    const result = await sweep.isSweepResetAllowed('SD-REAL-002', 'LEAD', 'unit');
    expect(result).toBe(false);
  });

  it('preserves existing ACCEPTED_HANDOFF_OVERRIDE behavior (skip reset, no throw)', async () => {
    sweep.__setExecContextGuardForTest({
      assertSweepHandoffGate: vi.fn(async () => { throw guardError('ACCEPTED_HANDOFF_OVERRIDE', 'accepted handoff past target'); }),
    });
    const result = await sweep.isSweepResetAllowed('SD-REAL-003', 'LEAD', 'unit');
    expect(result).toBe(false);
  });

  it('allows the reset on the normal path (guard resolves without throwing)', async () => {
    sweep.__setExecContextGuardForTest({
      assertSweepHandoffGate: vi.fn(async () => ({ ok: true })),
    });
    const result = await sweep.isSweepResetAllowed('SD-REAL-004', 'LEAD', 'unit');
    expect(result).toBe(true);
  });
});

describe('FR-3 — SD-TEST exclusion applied at every QA mutation query site (static)', () => {
  it('the top-level fatal handler still exists (the thing FR-1/FR-2 protect against)', () => {
    // Regression anchor: if this disappears, the containment tests above lose their meaning.
    expect(SOURCE).toMatch(/SWEEP FATAL:/);
  });

  it('every QA strategic_directives_v2 mutation scan excludes SD-TEST-% (pending_approval, terminal-claims, phantom in_progress, bare-shell)', () => {
    // Each of these QA scans must carry a .not('sd_key','like', SD-TEST pattern). We assert the
    // status-keyed query anchors are each followed (within a window) by the exclusion.
    const anchors = [
      { name: 'pending_approval scan', re: /\.eq\(\s*['"]status['"]\s*,\s*['"]pending_approval['"]\s*\)/ },
      { name: 'terminal-claims clear', re: /\.in\(\s*['"]status['"]\s*,\s*\[\s*['"]completed['"]\s*,\s*['"]cancelled['"]\s*\]\s*\)/ },
      { name: 'phantom in_progress scan', re: /\.eq\(\s*['"]status['"]\s*,\s*['"]in_progress['"]\s*\)/ },
      { name: 'bare-shell enrich scan', re: /\.in\(\s*['"]status['"]\s*,\s*\[\s*['"]draft['"]\s*,\s*['"]ready['"]\s*\]\s*\)/ },
    ];
    for (const a of anchors) {
      const m = SOURCE.match(a.re);
      expect(m, `${a.name}: status anchor not found`).toBeTruthy();
      const window = SOURCE.slice(m.index, m.index + 400);
      expect(window, `${a.name}: missing SD-TEST-% exclusion within query window`)
        .toMatch(/\.not\(\s*['"]sd_key['"]\s*,\s*['"]like['"]\s*,\s*TEST_FIXTURE_SD_KEY_LIKE\s*\)/);
    }
  });

  it('the shared predicate + LIKE constant are defined exactly once (single source of truth)', () => {
    expect((SOURCE.match(/function isTestFixtureSdKey\(/g) || []).length).toBe(1);
    expect((SOURCE.match(/const TEST_FIXTURE_SD_KEY_LIKE\s*=/g) || []).length).toBe(1);
  });
});

describe('FR-1/FR-2 — no bare re-throw in the reset gate; reset helper is wrapped (static)', () => {
  it('isSweepResetAllowed handles SD_NOT_FOUND explicitly (FR-1)', () => {
    expect(SOURCE).toMatch(/err\.code === 'SD_NOT_FOUND'/);
  });

  it('isSweepResetAllowed no longer ends its catch with a bare `throw err`', () => {
    // The catch must contain the fail-soft WARN + `return false`, not re-throw.
    const fnStart = SOURCE.indexOf('async function isSweepResetAllowed');
    const fnEnd = SOURCE.indexOf('\n}', fnStart);
    const fnBody = SOURCE.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/WARN_RESET_GATE_ERROR/);
    expect(fnBody).not.toMatch(/\n\s*throw err;/);
  });

  it('resetSdPhaseOnRelease wraps its body in try/catch (FR-2 per-item containment)', () => {
    const fnStart = SOURCE.indexOf('async function resetSdPhaseOnRelease');
    const fnBody = SOURCE.slice(fnStart, fnStart + 2500);
    expect(fnBody).toMatch(/try\s*\{/);
    expect(fnBody).toMatch(/WARN_RESET_SKIPPED/);
  });
});

/**
 * SD-LEO-INFRA-PARKED-WORKER-CLAIM-LAPSE-001 (TS-8, TS-9) — the orphaned-claim branch used to
 * release a claim on ABSENCE ALONE, with no liveness check and no check that the absence was
 * real. Two composing defects:
 *   TS-9: the SD status lookup discarded `error`. A transient failure yields data=null, an EMPTY
 *         sdStatusMap, and therefore EVERY claimed session classified orphaned and released in
 *         one pass. Emptiness is not absence.
 *   TS-8: even with a correct lookup, the branch never consulted liveness, so a LIVE parked
 *         worker (heartbeating, PID-alive, silence-armed) lost its claim. shouldHoldClaim was
 *         imported at the top of the file but only ever used by the conflict-eviction path.
 * The orphaned-claim filter is inline inside a long non-exported function, so these are
 * source-invariant tests per this file's established convention — they cannot ship green on
 * dead code because they assert the guard exists AT the release site.
 */
describe('SD-LEO-INFRA-PARKED-WORKER-CLAIM-LAPSE-001: orphaned-claim release is guarded', () => {
  it('TS-9: the SD status lookup captures `error` instead of discarding it', () => {
    expect(SOURCE).toMatch(/const \{ data: claimedSdStatus, error: claimedSdStatusError \} = await supabase/);
  });

  it('TS-9: a failed/absent SD lookup is treated as untrustworthy, not as "no rows"', () => {
    expect(SOURCE).toMatch(/const sdLookupTrustworthy = !claimedSdStatusError && Array\.isArray\(claimedSdStatus\)/);
  });

  it('TS-9: orphaned-claim release is SKIPPED entirely when the lookup is untrustworthy (fail-closed)', () => {
    expect(SOURCE).toMatch(/const orphanedClaims = \(sdLookupTrustworthy \? classified : \[\]\)/);
  });

  it('TS-8: the orphaned-claim branch consults shouldHoldClaim before releasing', () => {
    const branch = SOURCE.slice(SOURCE.indexOf('const orphanedClaims ='), SOURCE.indexOf('const orphanedClaims =') + 900);
    expect(branch).toMatch(/shouldHoldClaim\(s, \{ aliveCcPids: orphanAliveCcPids \}\)/);
    expect(branch).toMatch(/if \(guard\.hold\)/);
  });

  it('TS-8: the guard receives a REAL PID set, not undefined (aliveCcPids is out of scope here)', () => {
    // Passing undefined would silently degrade shouldHoldClaim to heartbeat-only and lose the
    // PID-aliveness signal that distinguishes a parked-but-live worker from a dead one.
    //
    // Re-aimed (FR-2, 2nd pass): this pinned the exact assignment to the LOCAL name
    // orphanAliveCcPids. When the second sweep seam (workingOnCompleted) was guarded, the marker
    // scan was hoisted into a single shared `sweepAliveCcPids` so the host-local marker files are
    // not scanned twice per tick — a correct change that broke the name-pinned form. The PROPERTY
    // this test protects is that the PID set is really CONSTRUCTED from the marker source and
    // really REACHES the guard; that is now asserted without naming the binding.
    expect(SOURCE).toMatch(/new Set\(\(detectIdentityCollisions\(\)\.aliveMarkers \|\| \[\]\)\.map/);
    // …and every shouldHoldClaim call in the release seams passes a named set, never undefined.
    const calls = SOURCE.match(/shouldHoldClaim\([^)]*\{[^}]*\}\s*\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2); // workingOnCompleted + orphanedClaims
    for (const c of calls) {
      // Accept BOTH the explicit form ({ aliveCcPids: someSet }) and the ES6 shorthand
      // ({ aliveCcPids }) used by the pre-existing conflict-eviction call — both pass a real
      // binding. What must never appear is a literal undefined/null, which is the silent
      // degradation to heartbeat-only that this test exists to prevent.
      expect(c).toMatch(/aliveCcPids(\s*:\s*\w+)?\s*[,}]/);
      expect(c).not.toMatch(/aliveCcPids\s*:\s*(undefined|null)/);
    }
  });

  it('FR-2: BOTH named sweep seams consult shouldHoldClaim, not just the orphan branch', () => {
    // The PRD names two sites: workingOnCompleted and orphanedClaims. Both write the same
    // fingerprint the observed lapse carried, and guarding only one leaves the invariant
    // ("a live holder never loses its claim to an automated path") undelivered at the other.
    const wocIdx = SOURCE.indexOf('const workingOnCompleted =');
    expect(wocIdx).toBeGreaterThan(0);
    const wocEnd = SOURCE.indexOf('\n  });', wocIdx);
    expect(wocEnd).toBeGreaterThan(wocIdx);
    const woc = SOURCE.slice(wocIdx, wocEnd);
    expect(woc).toMatch(/shouldHoldClaim\(/);
    expect(woc).toMatch(/if \(guard\.hold\)/);
    // The suppressed release must be observable, exactly as the orphan seam's is.
    expect(woc).toMatch(/HOLDING completed-SD release/);
  });

  it('holding a live claim is logged, so a suppressed release is never silent', () => {
    expect(SOURCE).toMatch(/HOLDING orphaned-claim release for/);
  });

  it('shouldHoldClaim is imported before the orphaned-claim site uses it', () => {
    expect(SOURCE.indexOf("require('../lib/fleet/claim-release-guard.cjs')")).toBeLessThan(SOURCE.indexOf('const orphanedClaims ='));
  });
});
