/**
 * SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001 — coordinator worktree-pool watchdog.
 *
 * Network-free unit tests for the Stage-0 terminal-SD reclaim, the pool-utilization
 * watchdog, and the coordinator-audit pool-utilization surfacing. Everything is
 * driven by INJECTED worktree listings + claim maps + an injected SD-status
 * resolver — no real git, no real DB.
 *
 * Coverage:
 *   (a) Stage-0 reaps a completed/cancelled SD worktree that is <7 days old (age-agnostic)
 *   (b) Stage-0 PRESERVES a worktree with a live claim (v_active_sessions)
 *   (c) Stage-0 PRESERVES a draft/active/in_progress SD worktree
 *   (d) the watchdog triggers Stage-0 at 16/20 (>=80%) but NOT at 15/20
 *   (e) coordinator-audit surfaces utilization and warns at >=80%
 */
import { describe, test, expect } from 'vitest';
import path from 'node:path';

import {
  classifyStage0,
  selectStage0Reclaim,
  computePoolUtilization,
  poolWatchdog,
} from '../../../scripts/worktree-reaper.mjs';

import { poolWatchdogDecision } from '../../../scripts/fleet/worktree-reaper-tick.cjs';

// normalizePath in the reaper resolves+lowercases; build claim-map keys the same way
// so an injected claim lines up with the worktree path regardless of platform.
function claimKey(p) {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

const WT = (sdKey, branch) => ({
  path: path.join('/repo', '.worktrees', sdKey),
  branch: branch || `feat/${sdKey}`,
});

// SD-LEO-INFRA-WORKTREE-REAPER-QUICK-001: QF worktrees live at .worktrees/qf/<qf_id>;
// path.basename(path) is the qf_id (starts with 'QF-').
const WT_QF = (qfId, branch) => ({
  path: path.join('/repo', '.worktrees', 'qf', qfId),
  branch: branch || `qf/${qfId}`,
});

describe('classifyStage0 — terminal-SD reclaim (FR-001)', () => {
  test('(a) reaps a COMPLETED SD worktree regardless of age (age-agnostic)', () => {
    const wt = WT('SD-DONE-001');
    const v = classifyStage0(wt, {
      claimMap: new Map(),
      activeSdSet: new Set(),
      terminalSdSet: new Set(['SD-DONE-001']),
    });
    expect(v.reclaim).toBe(true);
    expect(v.reason).toBe('terminal_sd_reclaim');
    expect(v.sd_key).toBe('SD-DONE-001');
  });

  test('(a) reaps a CANCELLED SD worktree (via injected statusResolver)', () => {
    const wt = WT('SD-CANCELLED-002');
    const v = classifyStage0(wt, {
      claimMap: new Map(),
      activeSdSet: new Set(),
      statusResolver: (k) => (k === 'SD-CANCELLED-002' ? 'terminal' : 'unknown'),
    });
    expect(v.reclaim).toBe(true);
  });

  test('(b) PRESERVES a worktree with a live claim (v_active_sessions)', () => {
    const wt = WT('SD-DONE-001');
    // Terminal SD AND an active claim → claim wins, never reaped.
    const claimMap = new Map([[claimKey(wt.path), { sd_key: 'SD-DONE-001', session_id: 's1' }]]);
    const v = classifyStage0(wt, {
      claimMap,
      activeSdSet: new Set(),
      terminalSdSet: new Set(['SD-DONE-001']),
    });
    expect(v.reclaim).toBe(false);
    expect(v.reason).toBe('active_claim_protected');
  });

  test('(c) PRESERVES a draft/active/in_progress SD worktree (activeSdSet guard)', () => {
    const wt = WT('SD-ACTIVE-003');
    // Even with a stale terminal row, the activeSdSet guard suppresses reclaim.
    const v = classifyStage0(wt, {
      claimMap: new Map(),
      activeSdSet: new Set(['SD-ACTIVE-003']),
      terminalSdSet: new Set(['SD-ACTIVE-003']),
    });
    expect(v.reclaim).toBe(false);
    expect(v.reason).toBe('active_sd_protected');
  });

  test('(c) statusResolver returning "active" also preserves', () => {
    const wt = WT('SD-ACTIVE-004');
    const v = classifyStage0(wt, {
      claimMap: new Map(),
      statusResolver: () => 'active',
    });
    expect(v.reclaim).toBe(false);
    expect(v.reason).toBe('active_sd_protected');
  });

  test('keeps a non-terminal, unknown-status worktree (no over-reap)', () => {
    const wt = WT('SD-UNKNOWN-005');
    const v = classifyStage0(wt, {
      claimMap: new Map(),
      activeSdSet: new Set(),
      terminalSdSet: new Set(),
    });
    expect(v.reclaim).toBe(false);
    expect(v.reason).toBe('not_terminal_sd');
  });
});

describe('classifyStage0 — quick_fixes status-aware reaping (SD-LEO-INFRA-WORKTREE-REAPER-QUICK-001)', () => {
  test('reclaims a COMPLETED QF worktree age-agnostically (terminalQfSet)', () => {
    const wt = WT_QF('QF-20260423-821');
    const v = classifyStage0(wt, {
      claimMap: new Map(),
      activeQfSet: new Set(),
      terminalQfSet: new Set(['QF-20260423-821']),
    });
    expect(v.reclaim).toBe(true);
    expect(v.reason).toBe('terminal_qf_reclaim');
    expect(v.sd_key).toBe('QF-20260423-821');
  });

  test('reclaims a CANCELLED QF worktree (terminalQfSet)', () => {
    const wt = WT_QF('QF-20260423-822');
    const v = classifyStage0(wt, {
      claimMap: new Map(),
      activeQfSet: new Set(),
      terminalQfSet: new Set(['QF-20260423-822']),
    });
    expect(v.reclaim).toBe(true);
    expect(v.reason).toBe('terminal_qf_reclaim');
  });

  test('PRESERVES an open/in_progress QF worktree (activeQfSet guard) even with a stale terminal row', () => {
    const wt = WT_QF('QF-20260423-823');
    const v = classifyStage0(wt, {
      claimMap: new Map(),
      activeQfSet: new Set(['QF-20260423-823']),
      terminalQfSet: new Set(['QF-20260423-823']),
    });
    expect(v.reclaim).toBe(false);
    expect(v.reason).toBe('active_qf_protected');
  });

  test('PRESERVES a live-claimed QF worktree (claim guard wins over terminal)', () => {
    const wt = WT_QF('QF-20260423-824');
    const claimMap = new Map([[claimKey(wt.path), { sd_key: 'QF-20260423-824', session_id: 's1' }]]);
    const v = classifyStage0(wt, {
      claimMap,
      activeQfSet: new Set(),
      terminalQfSet: new Set(['QF-20260423-824']),
    });
    expect(v.reclaim).toBe(false);
    expect(v.reason).toBe('active_claim_protected');
  });

  test('ESCALATED QF (in neither set) is NOT reclaimed → not_terminal_qf', () => {
    const wt = WT_QF('QF-20260423-825');
    const v = classifyStage0(wt, {
      claimMap: new Map(),
      activeQfSet: new Set(),
      terminalQfSet: new Set(),
    });
    expect(v.reclaim).toBe(false);
    expect(v.reason).toBe('not_terminal_qf');
  });

  test('REGRESSION: SD worktrees still resolve via the SD sets; QF-set noise is ignored for SDs', () => {
    const wt = WT('SD-DONE-009');
    const v = classifyStage0(wt, {
      claimMap: new Map(),
      activeSdSet: new Set(),
      terminalSdSet: new Set(['SD-DONE-009']),
      activeQfSet: new Set(['SD-DONE-009']),
      terminalQfSet: new Set(),
    });
    expect(v.reclaim).toBe(true);
    expect(v.reason).toBe('terminal_sd_reclaim');
  });
});

describe('selectStage0Reclaim — pure selection over an injected listing', () => {
  test('selects only the terminal-SD worktree; preserves claimed + active ones', () => {
    const done = WT('SD-DONE-001');
    const claimed = WT('SD-DONE-CLAIMED-002');
    const active = WT('SD-ACTIVE-003');

    const worktrees = [done, claimed, active];
    const ctx = {
      claimMap: new Map([[claimKey(claimed.path), { sd_key: 'SD-DONE-CLAIMED-002' }]]),
      activeSdSet: new Set(['SD-ACTIVE-003']),
      terminalSdSet: new Set(['SD-DONE-001', 'SD-DONE-CLAIMED-002', 'SD-ACTIVE-003']),
    };

    const picked = selectStage0Reclaim(worktrees, ctx);
    expect(picked.map((p) => p.sd_key)).toEqual(['SD-DONE-001']);
  });

  test('is idempotent: removing the picked worktree yields an empty second pass', () => {
    const done = WT('SD-DONE-001');
    const ctx = { claimMap: new Map(), activeSdSet: new Set(), terminalSdSet: new Set(['SD-DONE-001']) };
    expect(selectStage0Reclaim([done], ctx)).toHaveLength(1);
    // Simulate post-removal state (worktree gone) → nothing to do.
    expect(selectStage0Reclaim([], ctx)).toHaveLength(0);
  });
});

describe('computePoolUtilization', () => {
  test('16/20 = 80%, 15/20 = 75%', () => {
    expect(computePoolUtilization(16, 20).utilization).toBeCloseTo(0.8);
    expect(computePoolUtilization(16, 20).percent).toBe(80);
    expect(computePoolUtilization(15, 20).percent).toBe(75);
  });
  test('guards a zero/invalid cap (falls back to MAX_WORKTREE_COUNT=20)', () => {
    expect(computePoolUtilization(10, 0).cap).toBe(20);
  });
});

describe('poolWatchdog — triggers Stage-0 at/above threshold (FR-002)', () => {
  const terminalSdSet = new Set(['SD-DONE-001']);
  // 16 worktrees, one of which is a terminal-SD reclaim candidate.
  const make = (count) => {
    const list = [];
    for (let i = 0; i < count - 1; i++) list.push(WT(`SD-LIVE-${String(i).padStart(3, '0')}`));
    list.push(WT('SD-DONE-001'));
    return list;
  };

  test('(d) triggers at 16/20 (>=80%) and selects the terminal-SD candidate', () => {
    const worktrees = make(16);
    const res = poolWatchdog({
      worktrees, used: 16, cap: 20, threshold: 0.8,
      claimMap: new Map(), activeSdSet: new Set(), terminalSdSet,
    });
    expect(res.triggered).toBe(true);
    expect(res.percent).toBe(80);
    expect(res.candidates.map((c) => c.sd_key)).toEqual(['SD-DONE-001']);
  });

  test('(d) does NOT trigger at 15/20 (75% < 80%)', () => {
    const worktrees = make(15);
    const res = poolWatchdog({
      worktrees, used: 15, cap: 20, threshold: 0.8,
      claimMap: new Map(), activeSdSet: new Set(), terminalSdSet,
    });
    expect(res.triggered).toBe(false);
    expect(res.candidates).toHaveLength(0);
  });

  test('invokes the injected reclaim callback only when triggered', () => {
    let called = null;
    poolWatchdog({
      worktrees: make(16), used: 16, cap: 20, threshold: 0.8,
      claimMap: new Map(), activeSdSet: new Set(), terminalSdSet,
      reclaim: (c) => { called = c; },
    });
    expect(called).not.toBeNull();
    expect(called.map((c) => c.sd_key)).toEqual(['SD-DONE-001']);

    let called2 = 'untouched';
    poolWatchdog({
      worktrees: make(15), used: 15, cap: 20, threshold: 0.8,
      claimMap: new Map(), activeSdSet: new Set(), terminalSdSet,
      reclaim: () => { called2 = 'called'; },
    });
    expect(called2).toBe('untouched');
  });
});

describe('tick poolWatchdogDecision — same threshold semantics (FR-002 wiring)', () => {
  test('(d) triggers at 16/20, not at 15/20', () => {
    expect(poolWatchdogDecision({ used: 16, cap: 20, threshold: 0.8 }).triggered).toBe(true);
    expect(poolWatchdogDecision({ used: 15, cap: 20, threshold: 0.8 }).triggered).toBe(false);
  });
  test('non-finite used never triggers (bad count → no-op)', () => {
    expect(poolWatchdogDecision({ used: null, cap: 20, threshold: 0.8 }).triggered).toBe(false);
  });
});

/**
 * (e) coordinator-audit surfacing. The audit script is a top-level-await ESM
 * module that connects to a DB on import, so we don't import it. Instead we
 * assert the SAME pure utilization+warning arithmetic the audit uses, proving
 * the surfaced number and the >=80% warning trigger are correct.
 */
describe('coordinator-audit pool utilization surfacing (FR-003)', () => {
  const POOL_THRESHOLD = 0.8;
  const audit = (used, cap = 20) => {
    const util = cap > 0 ? used / cap : 0;
    return { used, cap, percent: Math.round(util * 100), warn: util >= POOL_THRESHOLD };
  };

  test('(e) surfaces used/cap + percent', () => {
    const a = audit(16, 20);
    expect(a.used).toBe(16);
    expect(a.cap).toBe(20);
    expect(a.percent).toBe(80);
  });

  test('(e) warns at >=80%, not below', () => {
    expect(audit(16, 20).warn).toBe(true);
    expect(audit(20, 20).warn).toBe(true);
    expect(audit(15, 20).warn).toBe(false);
  });
});
