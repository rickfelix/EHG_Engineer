/**
 * SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001 — the single canonical writer for
 * quick_fixes.status. TS-1 through TS-5, TS-12 (PRD test_scenarios).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { setQuickFixStatus, isNeedsSdRow, isUnlinkedTierThreeCompletion, shouldRefuseUnlinkedTierThreeCompletion, transitionRequiresDisposition } = require('../../../lib/quick-fix/status-writer.cjs');

const QF_ID = 'qf-fixture-1';
const silentLog = { log() {}, warn() {}, error() {} };

/** Stub supabase: one row's state lives in `rowState` (mutated by a successful update). */
function stubSupabase({ initialStatus = 'open', initialReason = null, initialCompletedAt = null, updateResult = 'success', notFound = false, lookupError = null } = {}) {
  const rowState = { status: initialStatus, escalation_reason: initialReason, completed_at: initialCompletedAt };
  const updateCalls = [];
  const sb = {
    from() {
      const chain = {
        _eqs: [],
        select() { return chain; },
        eq(col, val) { chain._eqs.push([col, val]); return chain; },
        maybeSingle() {
          // SELECT branch (no update payload recorded on this chain)
          if (!chain._updatePayload) {
            if (lookupError) return Promise.resolve({ data: null, error: lookupError });
            if (notFound) return Promise.resolve({ data: null, error: null });
            return Promise.resolve({ data: { status: rowState.status, escalation_reason: rowState.escalation_reason, completed_at: rowState.completed_at }, error: null });
          }
          // UPDATE branch
          updateCalls.push({ payload: chain._updatePayload, eqs: chain._eqs });
          if (updateResult === 'conflict') return Promise.resolve({ data: null, error: null });
          if (updateResult === 'error') return Promise.resolve({ data: null, error: { message: 'boom' } });
          const observedStatus = chain._eqs.find((e) => e[0] === 'status')?.[1];
          if (observedStatus !== undefined && observedStatus !== rowState.status) {
            return Promise.resolve({ data: null, error: null }); // simulate real conflict
          }
          Object.assign(rowState, chain._updatePayload);
          return Promise.resolve({ data: { id: QF_ID, status: rowState.status }, error: null });
        },
        update(payload) { chain._updatePayload = payload; return chain; },
      };
      return chain;
    },
  };
  return { sb, updateCalls, rowState };
}

describe('setQuickFixStatus — TS-1: refuses escalated without escalated_to_sd_id', () => {
  it('throws QF_STATUS_ESCALATION_REQUIRES_SD_ID and performs no write', async () => {
    const { sb, updateCalls } = stubSupabase({ initialStatus: 'open' });
    await expect(setQuickFixStatus(sb, QF_ID, { status: 'escalated' }, { logger: silentLog }))
      .rejects.toMatchObject({ code: 'QF_STATUS_ESCALATION_REQUIRES_SD_ID' });
    expect(updateCalls).toHaveLength(0);
  });

  it('allows escalated WITH escalated_to_sd_id', async () => {
    const { sb } = stubSupabase({ initialStatus: 'open' });
    const result = await setQuickFixStatus(sb, QF_ID, { status: 'escalated', escalated_to_sd_id: 'sd-1' }, { logger: silentLog });
    expect(result.status).toBe('escalated');
  });
});

describe('setQuickFixStatus — TS-2: refuses disposition-required transitions missing fields', () => {
  it('escalated->open missing fields throws QF_STATUS_DISPOSITION_REQUIRED', async () => {
    const { sb } = stubSupabase({ initialStatus: 'escalated' });
    await expect(setQuickFixStatus(sb, QF_ID, { status: 'open' }, { logger: silentLog }))
      .rejects.toMatchObject({ code: 'QF_STATUS_DISPOSITION_REQUIRED' });
  });

  it('open->closed missing fields throws QF_STATUS_DISPOSITION_REQUIRED', async () => {
    const { sb } = stubSupabase({ initialStatus: 'open' });
    await expect(setQuickFixStatus(sb, QF_ID, { status: 'closed' }, { logger: silentLog }))
      .rejects.toMatchObject({ code: 'QF_STATUS_DISPOSITION_REQUIRED' });
  });

  it('open->cancelled missing fields throws QF_STATUS_DISPOSITION_REQUIRED', async () => {
    const { sb } = stubSupabase({ initialStatus: 'open' });
    await expect(setQuickFixStatus(sb, QF_ID, { status: 'cancelled' }, { logger: silentLog }))
      .rejects.toMatchObject({ code: 'QF_STATUS_DISPOSITION_REQUIRED' });
  });

  it('supplying all 3 disposition fields succeeds', async () => {
    const { sb } = stubSupabase({ initialStatus: 'escalated' });
    const result = await setQuickFixStatus(sb, QF_ID, {
      status: 'open', disposition_reason_code: 'requeued_needs_sd_no_link', disposed_by: 'test', disposed_at: new Date().toISOString(),
    }, { logger: silentLog });
    expect(result.status).toBe('open');
  });
});

describe('setQuickFixStatus — TS-3: open->completed exempt from disposition requirement', () => {
  it('allows open->completed with no disposition fields', async () => {
    const { sb } = stubSupabase({ initialStatus: 'open' });
    const result = await setQuickFixStatus(sb, QF_ID, { status: 'completed' }, { logger: silentLog });
    expect(result.status).toBe('completed');
  });
});

describe('setQuickFixStatus — QF-20260904-876: stamps completed_at on the transition to completed', () => {
  it('stamps completed_at when absent and the caller does not supply one', async () => {
    const { sb, rowState } = stubSupabase({ initialStatus: 'open' });
    const before = Date.now();
    const result = await setQuickFixStatus(sb, QF_ID, { status: 'completed' }, { logger: silentLog });
    expect(result.status).toBe('completed');
    expect(rowState.completed_at).toBeTruthy();
    expect(new Date(rowState.completed_at).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('never overwrites an already-stamped completed_at (a coordinator close after the code path already stamped it)', async () => {
    const existing = '2026-01-01T00:00:00.000Z';
    const { sb, rowState } = stubSupabase({ initialStatus: 'open', initialCompletedAt: existing });
    await setQuickFixStatus(sb, QF_ID, { status: 'completed' }, { logger: silentLog });
    expect(rowState.completed_at).toBe(existing);
  });

  it('respects an explicit patch.completed_at (e.g. a backfill script setting a historical value)', async () => {
    const backfilled = '2026-05-31T16:53:15.146Z';
    const { sb, rowState } = stubSupabase({ initialStatus: 'open' });
    await setQuickFixStatus(sb, QF_ID, { status: 'completed', completed_at: backfilled }, { logger: silentLog });
    expect(rowState.completed_at).toBe(backfilled);
  });

  it('does not stamp completed_at on a non-completed transition', async () => {
    const { sb, rowState } = stubSupabase({ initialStatus: 'open' });
    await setQuickFixStatus(sb, QF_ID, { status: 'open', escalation_reason: 'r' }, { logger: silentLog });
    expect(rowState.completed_at).toBeNull();
  });
});

describe('setQuickFixStatus — TS-4: escalation_reason append-only (sequential)', () => {
  it('concatenates two sequential calls\' reasons, neither lost', async () => {
    const { sb, rowState } = stubSupabase({ initialStatus: 'open', initialReason: 'first reason' });
    await setQuickFixStatus(sb, QF_ID, { escalation_reason: 'second reason', status: 'open' }, { logger: silentLog });
    expect(rowState.escalation_reason).toContain('first reason');
    expect(rowState.escalation_reason).toContain('second reason');
  });

  it('does not duplicate when the new reason is identical to the existing one', async () => {
    const { sb, rowState } = stubSupabase({ initialStatus: 'open', initialReason: 'same reason' });
    await setQuickFixStatus(sb, QF_ID, { escalation_reason: 'same reason', status: 'open' }, { logger: silentLog });
    expect(rowState.escalation_reason).toBe('same reason');
  });
});

describe('setQuickFixStatus — TS-5: optimistic concurrency conflict', () => {
  it('throws QF_STATUS_CONFLICT when the update affects 0 rows', async () => {
    const { sb } = stubSupabase({ initialStatus: 'open', updateResult: 'conflict' });
    await expect(setQuickFixStatus(sb, QF_ID, { status: 'completed' }, { logger: silentLog }))
      .rejects.toMatchObject({ code: 'QF_STATUS_CONFLICT' });
  });
});

describe('setQuickFixStatus — TS-12: fail-closed could-not-check path', () => {
  it('a lookup error throws QF_STATUS_LOOKUP_FAILED and performs no update', async () => {
    const { sb, updateCalls } = stubSupabase({ lookupError: { message: 'db unavailable' } });
    await expect(setQuickFixStatus(sb, QF_ID, { status: 'completed' }, { logger: silentLog }))
      .rejects.toMatchObject({ code: 'QF_STATUS_LOOKUP_FAILED' });
    expect(updateCalls).toHaveLength(0);
  });

  it('a not-found row throws QF_STATUS_NOT_FOUND', async () => {
    const { sb } = stubSupabase({ notFound: true });
    await expect(setQuickFixStatus(sb, QF_ID, { status: 'completed' }, { logger: silentLog }))
      .rejects.toMatchObject({ code: 'QF_STATUS_NOT_FOUND' });
  });

  it('an update error throws QF_STATUS_UPDATE_FAILED', async () => {
    const { sb } = stubSupabase({ updateResult: 'error' });
    await expect(setQuickFixStatus(sb, QF_ID, { status: 'completed' }, { logger: silentLog }))
      .rejects.toMatchObject({ code: 'QF_STATUS_UPDATE_FAILED' });
  });
});

describe('setQuickFixStatus — bad arguments', () => {
  it('rejects a missing qfId', async () => {
    const { sb } = stubSupabase();
    await expect(setQuickFixStatus(sb, '', { status: 'open' }, { logger: silentLog }))
      .rejects.toMatchObject({ code: 'QF_STATUS_BAD_ARGS' });
  });

  it('rejects a missing patch.status', async () => {
    const { sb } = stubSupabase();
    await expect(setQuickFixStatus(sb, QF_ID, {}, { logger: silentLog }))
      .rejects.toMatchObject({ code: 'QF_STATUS_BAD_ARGS' });
  });
});

describe('isNeedsSdRow (the canonical shared predicate)', () => {
  it('true for status=open, routing_tier=3, escalated_to_sd_id=null', () => {
    expect(isNeedsSdRow({ status: 'open', routing_tier: 3, escalated_to_sd_id: null })).toBe(true);
  });

  it('true when escalated_to_sd_id is undefined (== null covers both)', () => {
    expect(isNeedsSdRow({ status: 'open', routing_tier: 3 })).toBe(true);
  });

  it('false when escalated_to_sd_id is set (linked)', () => {
    expect(isNeedsSdRow({ status: 'open', routing_tier: 3, escalated_to_sd_id: 'sd-1' })).toBe(false);
  });

  it('false for routing_tier other than 3', () => {
    expect(isNeedsSdRow({ status: 'open', routing_tier: 1, escalated_to_sd_id: null })).toBe(false);
    expect(isNeedsSdRow({ status: 'open', routing_tier: null, escalated_to_sd_id: null })).toBe(false);
  });

  it('false for status other than open', () => {
    expect(isNeedsSdRow({ status: 'escalated', routing_tier: 3, escalated_to_sd_id: null })).toBe(false);
  });

  it('false for a null/undefined row', () => {
    expect(isNeedsSdRow(null)).toBe(false);
    expect(isNeedsSdRow(undefined)).toBe(false);
  });
});

describe('isUnlinkedTierThreeCompletion — SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B FR-3 (AC-8/AC-9/AC-10)', () => {
  it('AC-8: true for routing_tier=3 with neither escalated_to_sd_id nor resolution_sd_id set', () => {
    expect(isUnlinkedTierThreeCompletion({ routing_tier: 3, escalated_to_sd_id: null, resolution_sd_id: null })).toBe(true);
  });

  it('true when both link fields are undefined (== null covers both)', () => {
    expect(isUnlinkedTierThreeCompletion({ routing_tier: 3 })).toBe(true);
  });

  it('AC-10: false when escalated_to_sd_id is set (linked via escalation)', () => {
    expect(isUnlinkedTierThreeCompletion({ routing_tier: 3, escalated_to_sd_id: 'sd-1', resolution_sd_id: null })).toBe(false);
  });

  it('AC-10: false when resolution_sd_id is set (linked via resolution, not escalation)', () => {
    expect(isUnlinkedTierThreeCompletion({ routing_tier: 3, escalated_to_sd_id: null, resolution_sd_id: 'sd-2' })).toBe(false);
  });

  it('false for routing_tier other than 3', () => {
    expect(isUnlinkedTierThreeCompletion({ routing_tier: 1, escalated_to_sd_id: null, resolution_sd_id: null })).toBe(false);
    expect(isUnlinkedTierThreeCompletion({ routing_tier: null, escalated_to_sd_id: null, resolution_sd_id: null })).toBe(false);
  });

  it('AC-9: is status-agnostic (callers only invoke it at completion time, never on an open row) -- a status field on the row does not change the verdict', () => {
    expect(isUnlinkedTierThreeCompletion({ status: 'open', routing_tier: 3, escalated_to_sd_id: null, resolution_sd_id: null })).toBe(true);
    expect(isUnlinkedTierThreeCompletion({ status: 'completed', routing_tier: 3, escalated_to_sd_id: null, resolution_sd_id: null })).toBe(true);
  });

  it('false for a null/undefined row', () => {
    expect(isUnlinkedTierThreeCompletion(null)).toBe(false);
    expect(isUnlinkedTierThreeCompletion(undefined)).toBe(false);
  });
});

describe('shouldRefuseUnlinkedTierThreeCompletion — QF-20260912-739', () => {
  const unlinkedTier3 = { routing_tier: 3, escalated_to_sd_id: null, resolution_sd_id: null };

  it('true for an unlinked Tier-3 row with no merge witness at all', () => {
    expect(shouldRefuseUnlinkedTierThreeCompletion(unlinkedTier3, undefined)).toBe(true);
  });

  it('true for an unlinked Tier-3 row whose merge witness is unverified (no PR, or unmerged)', () => {
    expect(shouldRefuseUnlinkedTierThreeCompletion(unlinkedTier3, { verified: false })).toBe(true);
  });

  it('false for an unlinked Tier-3 row whose own branch is a VERIFIED merged PR reachable from origin/main — the QF-20260905-476 reproduction', () => {
    expect(shouldRefuseUnlinkedTierThreeCompletion(unlinkedTier3, { verified: true, prUrl: 'https://github.com/x/y/pull/8808' })).toBe(false);
  });

  it('false when the row is already linked, regardless of merge witness (unchanged AC-10 behavior)', () => {
    expect(shouldRefuseUnlinkedTierThreeCompletion({ routing_tier: 3, escalated_to_sd_id: 'sd-1', resolution_sd_id: null }, { verified: false })).toBe(false);
  });
});

describe('transitionRequiresDisposition (pure helper)', () => {
  it('true leaving escalated to any other status', () => {
    expect(transitionRequiresDisposition('escalated', 'open')).toBe(true);
    expect(transitionRequiresDisposition('escalated', 'completed')).toBe(true);
  });

  it('true for open->closed and open->cancelled', () => {
    expect(transitionRequiresDisposition('open', 'closed')).toBe(true);
    expect(transitionRequiresDisposition('open', 'cancelled')).toBe(true);
  });

  it('false for open->completed (explicit exemption)', () => {
    expect(transitionRequiresDisposition('open', 'completed')).toBe(false);
  });

  it('false for a same-status no-op transition', () => {
    expect(transitionRequiresDisposition('open', 'open')).toBe(false);
  });

  it('QF-20260904-757: true entering closed/cancelled from ANY status, not only open', () => {
    expect(transitionRequiresDisposition('in_progress', 'closed')).toBe(true);
    expect(transitionRequiresDisposition('in_progress', 'cancelled')).toBe(true);
    expect(transitionRequiresDisposition('blocked', 'closed')).toBe(true);
  });

  it('QF-20260904-757: still false entering a non-closed/cancelled status from a non-escalated origin', () => {
    expect(transitionRequiresDisposition('in_progress', 'open')).toBe(false);
    expect(transitionRequiresDisposition('in_progress', 'completed')).toBe(false);
  });
});
