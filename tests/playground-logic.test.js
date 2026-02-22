/**
 * Unit tests for leo-visual-playground.html pure functions
 *
 * Tests extracted logic from the playground dashboard.
 * SD-MAN-ENH-COMPLETE-VISUAL-PLAYGROUND-001
 */

import { describe, it, assert } from 'node:test';
import { strict as assertStrict } from 'node:assert';

// ═══════════════════════════════════════════════
// Extracted pure functions (mirrored from playground)
// ═══════════════════════════════════════════════

// Mirrors the actual computeForgeTarget from leo-visual-playground.html
function computeForgeTarget(sd) {
  if (!sd) return 0;
  const status = sd.status || 'draft';
  const phase = (sd.current_phase || '').toUpperCase();
  const pct = (sd.progress_percentage ?? sd.progress ?? 0) / 100;

  if (status === 'completed') return 1.0;
  if (status === 'cancelled') return 0.04;
  if (status === 'draft' && !phase) return 0.04;
  if (phase.startsWith('LEAD')) return 0.08 + pct * 0.12;
  if (phase.startsWith('PLAN') || phase.startsWith('PRD')) return 0.20 + pct * 0.12;
  if (phase.startsWith('EXEC') || phase.startsWith('IMPL')) return 0.32 + pct * 0.68;
  if (status === 'in_progress') return 0.32;
  if (status === 'review') return 0.20;
  if (status === 'blocked') return 0.32;
  return 0;
}

function computeForgeFloor(sd) {
  if (!sd) return 0;
  const phase = (sd.current_phase || '').toUpperCase();
  if (phase.startsWith('EXEC') || phase.startsWith('IMPL')) return 0.32;
  if (phase.startsWith('PLAN') || phase.startsWith('PRD')) return 0.20;
  if (phase.startsWith('LEAD')) return 0.08;
  return 0;
}

function passesFilter(sd, filter = 'active', typeFilter = 'all') {
  if (!sd) return false;
  const statusMatch = (() => {
    switch (filter) {
      case 'active': return ['draft', 'review', 'in_progress', 'planning'].includes(sd.status);
      case 'not-done': return sd.status !== 'completed' && sd.status !== 'cancelled';
      case 'all': return true;
      default: return sd.status === filter;
    }
  })();
  const typeMatch = typeFilter === 'all' || sd.sd_type === typeFilter || sd.category?.toLowerCase() === typeFilter;
  return statusMatch && typeMatch;
}

const TYPE_BASELINES_MIN = {
  infrastructure: 50, orchestrator: 155, documentation: 20, bugfix: 35,
  database: 100, feature: 145, refactor: 80, qa: 75, security: 120, default: 60
};

function formatSDEstimate(sd) {
  if (!sd || sd.status === 'completed' || sd.status === 'cancelled') return '';
  const base = TYPE_BASELINES_MIN[sd.sd_type] || TYPE_BASELINES_MIN[sd.category?.toLowerCase()] || TYPE_BASELINES_MIN.default;
  const prog = typeof sd.progress === 'number' ? sd.progress : 0;
  const remaining = Math.round(base * (1 - prog / 100));
  return remaining <= 0 ? '<5m' : remaining < 60 ? `~${remaining}m` : `~${(remaining / 60).toFixed(1)}h`;
}

function computeSlideDurations(queue, speedFactor = 1) {
  const durations = new Map();
  if (!queue.length) return durations;
  const baseDuration = 8000;
  const totalRemaining = queue.reduce((sum, sd) => {
    const base = TYPE_BASELINES_MIN[sd.sd_type] || TYPE_BASELINES_MIN.default;
    const prog = typeof sd.progress === 'number' ? sd.progress : 0;
    return sum + base * (1 - prog / 100);
  }, 0);
  if (totalRemaining <= 0) { queue.forEach(sd => durations.set(sd.id, baseDuration / speedFactor)); return durations; }
  queue.forEach(sd => {
    const base = TYPE_BASELINES_MIN[sd.sd_type] || TYPE_BASELINES_MIN.default;
    const prog = typeof sd.progress === 'number' ? sd.progress : 0;
    const remaining = base * (1 - prog / 100);
    const weight = remaining / totalRemaining;
    const duration = Math.max(3000, baseDuration * weight * queue.length) / speedFactor;
    durations.set(sd.id, duration);
  });
  return durations;
}

// Error cascade ratio computation (extracted)
function computeErrorRatio(sds) {
  let total = 0, failed = 0;
  sds.forEach(sd => {
    if (sd.status !== 'completed' && sd.status !== 'cancelled') {
      total++;
      if (sd.status === 'blocked') failed++;
    }
  });
  return total > 0 ? Math.min(1, failed / total) : 0;
}

// Session timeline classification (extracted)
function classifySession(session, now) {
  const age = now - new Date(session.heartbeat_at).getTime();
  if (session.status === 'active' && age < 120000) return 'alive';
  if (session.status === 'active' && age < 900000) return 'stale';
  return 'dead';
}

// ═══════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════

describe('computeForgeTarget', () => {
  it('returns 0 for null SD', () => {
    assertStrict.equal(computeForgeTarget(null), 0);
  });

  it('returns 0.04 for draft status with no phase', () => {
    assertStrict.equal(computeForgeTarget({ status: 'draft', current_phase: '', progress: 0 }), 0.04);
  });

  it('returns correct target for EXEC at 50%', () => {
    const target = computeForgeTarget({ status: 'in_progress', current_phase: 'EXEC', progress: 50 });
    // EXEC: 0.32 + 0.5 * 0.68 = 0.66
    assertStrict.equal(target, 0.66);
  });

  it('returns correct value for LEAD phase', () => {
    const target = computeForgeTarget({ status: 'in_progress', current_phase: 'LEAD_APPROVAL', progress: 50 });
    // LEAD: 0.08 + 0.5 * 0.12 = 0.14
    assertStrict.equal(target, 0.14);
  });

  it('returns 1.0 for completed status', () => {
    assertStrict.equal(computeForgeTarget({ status: 'completed', current_phase: 'LEAD_FINAL_APPROVAL', progress: 100 }), 1.0);
  });

  it('returns 0 for unknown status/phase', () => {
    assertStrict.equal(computeForgeTarget({ status: 'unknown', current_phase: 'UNKNOWN', progress: 50 }), 0);
  });
});

describe('computeForgeFloor', () => {
  it('returns 0 for draft', () => {
    assertStrict.equal(computeForgeFloor({ current_phase: 'draft' }), 0);
  });

  it('returns correct floor for PLAN_PRD', () => {
    assertStrict.equal(computeForgeFloor({ current_phase: 'PLAN_PRD' }), 0.20);
  });

  it('returns correct floor for EXEC', () => {
    assertStrict.equal(computeForgeFloor({ current_phase: 'EXEC' }), 0.32);
  });
});

describe('passesFilter', () => {
  it('active filter includes draft', () => {
    assertStrict.equal(passesFilter({ status: 'draft' }, 'active'), true);
  });

  it('active filter includes in_progress', () => {
    assertStrict.equal(passesFilter({ status: 'in_progress' }, 'active'), true);
  });

  it('active filter excludes completed', () => {
    assertStrict.equal(passesFilter({ status: 'completed' }, 'active'), false);
  });

  it('not-done filter excludes completed and cancelled', () => {
    assertStrict.equal(passesFilter({ status: 'completed' }, 'not-done'), false);
    assertStrict.equal(passesFilter({ status: 'cancelled' }, 'not-done'), false);
    assertStrict.equal(passesFilter({ status: 'blocked' }, 'not-done'), true);
  });

  it('type filter works', () => {
    assertStrict.equal(passesFilter({ status: 'draft', sd_type: 'feature' }, 'active', 'feature'), true);
    assertStrict.equal(passesFilter({ status: 'draft', sd_type: 'feature' }, 'active', 'bugfix'), false);
  });

  it('returns false for null SD', () => {
    assertStrict.equal(passesFilter(null), false);
  });
});

describe('formatSDEstimate', () => {
  it('returns empty for completed SD', () => {
    assertStrict.equal(formatSDEstimate({ status: 'completed' }), '');
  });

  it('formats minutes correctly', () => {
    const result = formatSDEstimate({ status: 'in_progress', sd_type: 'bugfix', progress: 0 });
    assertStrict.equal(result, '~35m'); // bugfix baseline = 35
  });

  it('formats hours correctly', () => {
    const result = formatSDEstimate({ status: 'in_progress', sd_type: 'feature', progress: 0 });
    assertStrict.equal(result, '~2.4h'); // feature baseline = 145
  });

  it('accounts for progress', () => {
    const result = formatSDEstimate({ status: 'in_progress', sd_type: 'bugfix', progress: 50 });
    // 35 * (1 - 0.5) = 17.5 → ~18m
    assertStrict.equal(result, '~18m');
  });

  it('returns <5m when near complete', () => {
    const result = formatSDEstimate({ status: 'in_progress', sd_type: 'documentation', progress: 100 });
    assertStrict.equal(result, '<5m');
  });
});

describe('computeSlideDurations', () => {
  it('returns empty map for empty queue', () => {
    const result = computeSlideDurations([]);
    assertStrict.equal(result.size, 0);
  });

  it('returns durations for each SD', () => {
    const queue = [
      { id: 'a', sd_type: 'bugfix', progress: 0 },
      { id: 'b', sd_type: 'feature', progress: 50 }
    ];
    const result = computeSlideDurations(queue);
    assertStrict.equal(result.size, 2);
    assertStrict.ok(result.get('a') > 0);
    assertStrict.ok(result.get('b') > 0);
  });

  it('higher remaining gets longer duration', () => {
    const queue = [
      { id: 'small', sd_type: 'documentation', progress: 80 }, // 20 * 0.2 = 4
      { id: 'big', sd_type: 'feature', progress: 0 } // 145
    ];
    const result = computeSlideDurations(queue);
    assertStrict.ok(result.get('big') > result.get('small'));
  });

  it('speed factor reduces durations', () => {
    const queue = [{ id: 'a', sd_type: 'bugfix', progress: 0 }];
    const normal = computeSlideDurations(queue, 1);
    const fast = computeSlideDurations(queue, 2);
    assertStrict.ok(fast.get('a') < normal.get('a'));
  });
});

describe('computeErrorRatio', () => {
  it('returns 0 for empty array', () => {
    assertStrict.equal(computeErrorRatio([]), 0);
  });

  it('returns 0 when no blocked SDs', () => {
    assertStrict.equal(computeErrorRatio([
      { status: 'in_progress' }, { status: 'draft' }
    ]), 0);
  });

  it('returns correct ratio with blocked SDs', () => {
    assertStrict.equal(computeErrorRatio([
      { status: 'blocked' }, { status: 'in_progress' }, { status: 'draft' }, { status: 'blocked' }
    ]), 0.5);
  });

  it('ignores completed/cancelled SDs', () => {
    assertStrict.equal(computeErrorRatio([
      { status: 'blocked' }, { status: 'completed' }, { status: 'cancelled' }
    ]), 1.0);
  });

  it('clamps to max 1', () => {
    const ratio = computeErrorRatio([{ status: 'blocked' }]);
    assertStrict.ok(ratio <= 1);
  });
});

describe('classifySession', () => {
  const now = Date.now();

  it('classifies recent active as alive', () => {
    assertStrict.equal(classifySession(
      { status: 'active', heartbeat_at: new Date(now - 60000).toISOString() }, now
    ), 'alive');
  });

  it('classifies stale active (2-15 min) as stale', () => {
    assertStrict.equal(classifySession(
      { status: 'active', heartbeat_at: new Date(now - 300000).toISOString() }, now
    ), 'stale');
  });

  it('classifies old active (>15 min) as dead', () => {
    assertStrict.equal(classifySession(
      { status: 'active', heartbeat_at: new Date(now - 1200000).toISOString() }, now
    ), 'dead');
  });

  it('classifies idle sessions as dead', () => {
    assertStrict.equal(classifySession(
      { status: 'idle', heartbeat_at: new Date(now - 10000).toISOString() }, now
    ), 'dead');
  });
});
