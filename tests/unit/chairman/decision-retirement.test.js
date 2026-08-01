/**
 * lib/chairman/decision-retirement.mjs — FR-1, arm-aware retirement.
 * SD-FDBK-INFRA-DECISION-QUEUE-RETIREMENT-001.
 *
 * The status vocabulary is asserted against the CHECK constraint's permitted set, read from
 * database/migrations/20260131_feedback_resolution_enforcement.sql:150-165 — not from what the
 * codebase happens to write. A value outside that set dies at runtime with 23514.
 */
import { describe, it, expect } from 'vitest';
import { planRetirement, applyRetirement, armOf, FEEDBACK_STATUS, DECISION_STATUS } from '../../../lib/chairman/decision-retirement.mjs';
import { indexDispositions, DEFERRAL_CATEGORY } from '../../../lib/chairman/decision-disposition.mjs';

const NOW = new Date('2026-08-01T21:00:00Z');
const iso = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();
const deferral = (targetId) => ({
  id: `fb-${targetId}`, category: DEFERRAL_CATEGORY, created_at: iso(1),
  description: 'Chairman verbal: "defer both".',
  metadata: { target_id: targetId, decided_by: 'chairman-cli', deferred_at: iso(1) }
});
const withAuth = (id) => indexDispositions([deferral(id)]);

// The exact permitted set of feedback_status_check.
const PERMITTED_FEEDBACK = ['new', 'triaged', 'in_progress', 'resolved', 'wont_fix', 'duplicate', 'invalid', 'backlog', 'shipped'];

describe('FR-1 arm routing', () => {
  it('routes each live decision_type to its real source table', () => {
    expect(armOf({ decision_type: 'chairman_approval' })).toBe('arm4');
    expect(armOf({ decision_type: 'flag_review' })).toBe('arm5');
    expect(armOf({ decision_type: 'flag_enablement' })).toBe('arm6');
    expect(armOf({ decision_type: 'something_else' })).toBe('unknown');
  });
});

describe('FR-3 authority gate — absence BLOCKS retirement', () => {
  it('a row with NO disposition yields null, not a permissive plan', () => {
    expect(planRetirement({ id: 'dec-9', decision_type: 'chairman_approval' }, withAuth('dec-1'))).toBe(null);
  });

  it('an UNATTRIBUTABLE record authorises nothing', () => {
    const m = indexDispositions([{
      id: 'fb-z', category: DEFERRAL_CATEGORY, created_at: iso(1),
      metadata: { target_id: 'dec-1', deferred_at: iso(1) }  // no decided_by
    }]);
    expect(planRetirement({ id: 'dec-1', decision_type: 'chairman_approval' }, m)).toBe(null);
  });

  it('an unknown arm yields null rather than guessing a table', () => {
    expect(planRetirement({ id: 'dec-1', decision_type: 'okr_acceptance' }, withAuth('dec-1'))).toBe(null);
  });

  it('applyRetirement refuses a null plan without touching the db', async () => {
    const res = await applyRetirement({ from: () => { throw new Error('must not be called'); } }, null);
    expect(res.wrote).toBe(false);
    expect(res.reason).toBe('no_authority');
  });
});

describe('FR-1/TR-3 status vocabulary — never assert a decision the chairman did not make', () => {
  it('arm 5 uses ONLY values feedback_status_check permits', () => {
    expect(PERMITTED_FEEDBACK).toContain(FEEDBACK_STATUS.SUPERSEDED);
    expect(PERMITTED_FEEDBACK).toContain(FEEDBACK_STATUS.HELD);
  });

  it('arm 5 NEVER uses resolved or wont_fix — both assert an outcome he did not reach', () => {
    for (const d of ['held', 'superseded']) {
      const plan = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'), { disposition: d });
      expect(['resolved', 'wont_fix', 'approved', 'rejected']).not.toContain(plan.patch.status);
    }
  });

  it('arm 4 NEVER uses approved or rejected', () => {
    for (const d of ['held', 'superseded']) {
      const plan = planRetirement({ id: 'dec-1', decision_type: 'chairman_approval' }, withAuth('dec-1'), { disposition: d });
      expect(['approved', 'rejected']).not.toContain(plan.patch.status);
    }
  });

  it('the two dispositions are distinguishable per arm', () => {
    const a4h = planRetirement({ id: 'dec-1', decision_type: 'chairman_approval' }, withAuth('dec-1'), { disposition: 'held' });
    const a4s = planRetirement({ id: 'dec-1', decision_type: 'chairman_approval' }, withAuth('dec-1'), { disposition: 'superseded' });
    const a5h = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'), { disposition: 'held' });
    const a5s = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'), { disposition: 'superseded' });
    expect(a4h.patch.status).toBe(DECISION_STATUS.HELD);
    expect(a4s.patch.status).toBe(DECISION_STATUS.SUPERSEDED);
    expect(a5h.patch.status).toBe(FEEDBACK_STATUS.HELD);
    expect(a5s.patch.status).toBe(FEEDBACK_STATUS.SUPERSEDED);
  });

  it('the citation travels WITH the write — a basis in a commit message is not a basis', () => {
    const plan = planRetirement({ id: 'dec-1', decision_type: 'chairman_approval' }, withAuth('dec-1'));
    expect(plan.patch.retirement_basis.cited_record).toBe('fb-dec-1');
    expect(plan.patch.retirement_basis.decided_by).toBe('chairman-cli');
    expect(plan.patch.retirement_basis.decided_at).toBeTruthy();
  });
});

describe('FR-1 each arm targets its OWN table — a single-table retirement covers a third of the queue', () => {
  it('arm 4 writes chairman_decisions, arm 5 writes feedback', () => {
    expect(planRetirement({ id: 'd', decision_type: 'chairman_approval' }, withAuth('d')).table).toBe('chairman_decisions');
    expect(planRetirement({ id: 'd', decision_type: 'flag_review' }, withAuth('d')).table).toBe('feedback');
  });
});

describe('FR-2 arm 6 is GATED and says so — never a silent skip', () => {
  it('returns an explicit gated verdict naming why', () => {
    const plan = planRetirement({ id: 'flag-1', decision_type: 'flag_enablement' }, withAuth('flag-1'));
    expect(plan.verdict).toBe('gated');
    expect(plan.patch).toBe(null);
    expect(plan.reason).toMatch(/TIER-2|chairman-gated/);
  });

  it('applyRetirement will NOT write a gated plan', async () => {
    const plan = planRetirement({ id: 'flag-1', decision_type: 'flag_enablement' }, withAuth('flag-1'));
    const res = await applyRetirement({ from: () => { throw new Error('must not be called'); } }, plan);
    expect(res.wrote).toBe(false);
  });
});

describe('TR-9 idempotency — the fence is "not already retired", not "status = pending"', () => {
  function fake(rows) {
    const calls = [];
    return {
      calls,
      from: (table) => {
        let sel = rows.slice();
        const api = {
          update: (patch) => { calls.push({ table, patch }); return api; },
          eq: (c, v) => { sel = sel.filter((r) => r[c] === v); return api; },
          neq: (c, v) => { sel = sel.filter((r) => r[c] !== v); return api; },
          select: async () => ({ data: sel, error: null })
        };
        return api;
      }
    };
  }

  it('arm 5 retirement WRITES even though feedback has no "pending" status', async () => {
    // The live feedback statuses are new/resolved/backlog/... — "pending" is synthesised by the
    // view, not stored. A fence on status='pending' would match zero rows and no-op silently while
    // still reporting success. This is the regression guard for that.
    const db = fake([{ id: 'dec-1', status: 'new' }]);
    const plan = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'));
    const res = await applyRetirement(db, plan);
    expect(res.wrote).toBe(true);
  });

  it('a SECOND retire is a no-op — the row already carries the target status', async () => {
    const db = fake([{ id: 'dec-1', status: FEEDBACK_STATUS.HELD }]);
    const plan = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'));
    const res = await applyRetirement(db, plan);
    expect(res.wrote).toBe(false);
  });

  it('retirement does NOT write resolved_at — retirement is not resolution', async () => {
    const db = fake([{ id: 'dec-1', status: 'new' }]);
    const plan = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'));
    await applyRetirement(db, plan);
    expect(Object.keys(db.calls[0].patch)).not.toContain('resolved_at');
  });
});
