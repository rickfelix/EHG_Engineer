/**
 * canary-trigger unit tests — SD-LEO-INFRA-CANARY-SUPPORT-TRIGGER-RELIABILITY-001.
 *
 * Pure helpers (eligibility, payload) tested directly; enqueue/coverage tested via an
 * injected fake supabase (no live DB). Covers: FR-1 eligibility + payload invariants
 * (kind=canary_request, NO signal_type/intent_action), FR-2 idempotency (no dup while
 * un-actioned), FR-3 coverage, FR-4 fire-and-forget (a DB error never throws to the caller).
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  CANARY_REQUEST_KIND,
  isCanaryEligible,
  buildCanaryRequestPayload,
  enqueueCanaryRequest,
  findUnactionedCanaryRequests,
} = require('../../lib/coordinator/canary-trigger.cjs');

// A minimal chainable fake supabase. select/filter/is/limit are chainable and the builder
// resolves (thenable) to a canned result; insert records the row and resolves to {error}.
function fakeSupabase({ selectResult = { data: [], error: null }, insertError = null, throwOnInsert = false } = {}) {
  const inserts = [];
  const builder = () => {
    const b = {
      _isSelect: false,
      select() { b._isSelect = true; return b; },
      filter() { return b; },
      is() { return b; },
      limit() { return b; },
      // FR-6 (count-truncation discipline): findUnactionedCanaryRequests paginates via
      // fetchAllPaginated, whose pages end in .order(...).range(from, to).
      order() { return b; },
      range(from, to) {
        if (selectResult.error) return Promise.resolve(selectResult);
        const rows = Array.isArray(selectResult.data) ? selectResult.data : [];
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
      },
      insert(row) {
        inserts.push(row);
        if (throwOnInsert) throw new Error('boom-insert');
        return Promise.resolve({ error: insertError });
      },
      then(resolve) { return resolve(selectResult); }, // await on a select chain
    };
    return b;
  };
  return { from: () => builder(), _inserts: inserts };
}

describe('isCanaryEligible (FR-1)', () => {
  const base = { sd_key: 'SD-LEO-INFRA-X-001', sd_type: 'infrastructure', status: 'in_progress', current_phase: 'EXEC' };
  it('eligible: active build-type SD that reached EXEC', () => {
    expect(isCanaryEligible(base)).toBe(true);
    expect(isCanaryEligible({ ...base, current_phase: 'PLAN_VERIFICATION' })).toBe(true);
    expect(isCanaryEligible({ ...base, current_phase: 'LEAD_FINAL', status: 'pending_approval' })).toBe(true);
  });
  it('ineligible: test fixtures / demo keys', () => {
    expect(isCanaryEligible({ ...base, sd_key: 'SD-DEMO-CDC-001' })).toBe(false);
    expect(isCanaryEligible({ ...base, is_test_fixture: true })).toBe(false);
  });
  it('ineligible: documentation / orchestrator (no inline code to canary)', () => {
    expect(isCanaryEligible({ ...base, sd_type: 'documentation' })).toBe(false);
    expect(isCanaryEligible({ ...base, sd_type: 'orchestrator' })).toBe(false);
  });
  it('ineligible: terminal status (too late to canary pre-merge)', () => {
    expect(isCanaryEligible({ ...base, status: 'completed' })).toBe(false);
    expect(isCanaryEligible({ ...base, status: 'cancelled' })).toBe(false);
  });
  it('ineligible: not yet reached EXEC (e.g. PLAN_PRD) or missing key', () => {
    expect(isCanaryEligible({ ...base, current_phase: 'PLAN_PRD' })).toBe(false);
    expect(isCanaryEligible({})).toBe(false);
    expect(isCanaryEligible(null)).toBe(false);
  });
});

describe('buildCanaryRequestPayload (FR-1 invariants)', () => {
  it('carries kind=canary_request and NEITHER signal_type NOR intent_action', () => {
    const p = buildCanaryRequestPayload({ sd_key: 'SD-X-001' }, { nowIso: '2026-06-19T00:00:00Z' });
    expect(p.kind).toBe(CANARY_REQUEST_KIND);
    expect(p.sd_id).toBe('SD-X-001');
    expect(p.requested_at).toBe('2026-06-19T00:00:00Z');
    expect(p).not.toHaveProperty('signal_type');
    expect(p).not.toHaveProperty('intent_action');
  });
});

describe('enqueueCanaryRequest (FR-1/FR-2/FR-4)', () => {
  const sd = { sd_key: 'SD-LEO-INFRA-X-001', sd_type: 'infrastructure', status: 'in_progress', current_phase: 'EXEC' };

  it('inserts a canary_request row for an eligible SD (no pending dup)', async () => {
    const sb = fakeSupabase({ selectResult: { data: [], error: null } });
    const r = await enqueueCanaryRequest(sb, sd, { targetSession: 'coord-1' });
    expect(r.ok).toBe(true);
    expect(r.inserted).toBe(true);
    expect(sb._inserts).toHaveLength(1);
    expect(sb._inserts[0].message_type).toBe('INFO');
    expect(sb._inserts[0].payload.kind).toBe(CANARY_REQUEST_KIND);
    expect(sb._inserts[0].payload).not.toHaveProperty('signal_type');
  });

  it('FR-2 idempotent: skips insert when an un-actioned request already exists', async () => {
    const sb = fakeSupabase({ selectResult: { data: [{ id: 'existing' }], error: null } });
    const r = await enqueueCanaryRequest(sb, sd, {});
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('already_pending');
    expect(sb._inserts).toHaveLength(0);
  });

  it('skips an ineligible SD (no insert)', async () => {
    const sb = fakeSupabase();
    const r = await enqueueCanaryRequest(sb, { ...sd, sd_type: 'documentation' }, {});
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('ineligible');
    expect(sb._inserts).toHaveLength(0);
  });

  it('FR-4 fire-and-forget: a DB insert error returns ok:false and does NOT throw', async () => {
    const sb = fakeSupabase({ selectResult: { data: [], error: null }, insertError: { message: 'db down' } });
    const r = await enqueueCanaryRequest(sb, sd, {});
    expect(r.ok).toBe(false);
    expect(r.error).toBe('db down');
  });

  it('FR-4 fire-and-forget: a THROWN insert is swallowed (returns ok:false, never throws)', async () => {
    const sb = fakeSupabase({ selectResult: { data: [], error: null }, throwOnInsert: true });
    await expect(enqueueCanaryRequest(sb, sd, {})).resolves.toMatchObject({ ok: false });
  });
});

describe('findUnactionedCanaryRequests (FR-3 coverage)', () => {
  it('reports un-actioned rows older than the window; honors age filter', async () => {
    const now = Date.parse('2026-06-19T12:00:00Z');
    const rows = [
      { id: 'old', payload: { sd_id: 'SD-OLD-001' }, created_at: '2026-06-19T10:00:00Z' }, // 2h old
      { id: 'new', payload: { sd_id: 'SD-NEW-001' }, created_at: '2026-06-19T11:59:00Z' }, // 1m old
    ];
    const sb = fakeSupabase({ selectResult: { data: rows, error: null } });
    const stale = await findUnactionedCanaryRequests(sb, { olderThanMs: 60 * 60 * 1000, nowMs: now });
    expect(stale.map((r) => r.sd_id)).toEqual(['SD-OLD-001']); // only the 2h-old one passes a 1h window
  });

  it('FAIL-OPEN: returns [] on a query error', async () => {
    const sb = fakeSupabase({ selectResult: { data: null, error: { message: 'boom' } } });
    expect(await findUnactionedCanaryRequests(sb, {})).toEqual([]);
  });
});
