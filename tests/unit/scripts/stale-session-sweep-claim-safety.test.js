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
