/**
 * SD-LEO-INFRA-SOLOMON-CONSULT-CANNOT-DELIVER-001 — FR-3 / FR-8 / FR-9 reconciler guards.
 *
 * The verdict was always CORRELATABLE; nothing ever CONSUMED it. These pin the consumer, and
 * specifically the two FR-9 scoping traps that would each let the sweep read green while silently
 * covering the wrong rows.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { reconcileLateVerdicts } = require('../../../lib/coordinator/reply-class.cjs');

const CONSULT = (over = {}) => ({
  id: over.id || 'row-1',
  subject: 'pre-send thing',
  body: 'b',
  created_at: '2026-07-25T10:00:00Z',
  payload: {
    kind: 'solomon_consult',
    consult_purpose: 'pre_send',
    correlation_id: over.corr || 'corr-1',
    reply_class: 'reply-needed',
    ...over.payload,
  },
});

/**
 * Fake supabase modelling BOTH shapes the module uses: the candidate select (chained .eq/.is/.limit)
 * and the answer lookup (.in/.eq/.order + .range pagination via fetchAllPaginated).
 * .range() is modelled deliberately — without it fetchAllPaginated throws and resolveAnswerRows
 * fail-opens to empty, which would make every test a green "nothing to do" false pass (TR-5).
 */
function makeFakeSupabase({ candidates = [], answers = [], onUpdate = () => {} } = {}) {
  // Filters are recorded PER QUERY. A single shared map lets the answer query's
  // kind='adam_advisory' clobber the candidate query's kind='solomon_consult', which silently
  // inverts what the scoping assertions below actually prove (hit during EXEC).
  const state = { updates: [], candidateFilters: {}, answerFilters: {}, mode: 'candidates' };
  const bucket = () => (state.mode === 'candidates' ? state.candidateFilters : state.answerFilters);
  const api = {
    from() { return api; },
    select(cols) {
      state.mode = String(cols).includes('target_session') ? 'candidates' : 'answers';
      return api;
    },
    eq(col, val) { bucket()[col] = val; return api; },
    is(col, val) { bucket()[col] = val; return api; },
    in() { return api; },
    order() { return api; },
    limit() { return Promise.resolve({ data: candidates, error: null }); },
    range(from, to) {
      return Promise.resolve({ data: answers.slice(from, to + 1), error: null });
    },
    update(patch) {
      return {
        eq: async (_c, id) => { state.updates.push({ id, patch }); onUpdate({ id, patch }); return { error: null }; },
      };
    },
  };
  return { api, state };
}

const ANSWER = (corr) => ({ id: `ans-${corr}`, payload: { kind: 'adam_advisory', reply_to: corr, body: { verdict: 'amend' } } });

describe('reconcileLateVerdicts — FR-3 consumer', () => {
  it('reconciles a late verdict exactly once and stamps the single-fire marker', async () => {
    const { api, state } = makeFakeSupabase({ candidates: [CONSULT()], answers: [ANSWER('corr-1')] });
    const recordDisposition = vi.fn(async () => ({ created: true }));

    const out = await reconcileLateVerdicts(api, { recordDisposition, now: 1770000000000 });

    expect(out).toMatchObject({ checked: 1, reconciled: 1 });
    expect(recordDisposition).toHaveBeenCalledTimes(1);
    expect(recordDisposition.mock.calls[0][0]).toMatchObject({
      decisionType: 'consult_answer',
      subject: 'solomon-consult:corr-1',
    });
    // TR-5 guard: prove the answer set was genuinely non-empty, not a fail-open no-op.
    expect(out.reconciledIds).toEqual(['row-1']);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].patch.payload.late_verdict_reconciled_at).toBeTruthy();
  });

  it('FR-9a: does NOT filter on ping_sent_at — a pinged consult is still reconciled', async () => {
    // Inheriting checkAndPingOverdueReplies' `ping_sent_at IS NULL` would permanently orphan
    // exactly the long-latency consults this SD exists to rescue.
    const pinged = CONSULT({ payload: { ping_sent_at: '2026-07-25T10:05:00Z' } });
    const { api, state } = makeFakeSupabase({ candidates: [pinged], answers: [ANSWER('corr-1')] });
    const out = await reconcileLateVerdicts(api, { recordDisposition: async () => ({ created: true }) });

    expect(out.reconciled).toBe(1);
    expect(state.candidateFilters).not.toHaveProperty('payload->>ping_sent_at');
    expect(state.candidateFilters['payload->>late_verdict_reconciled_at']).toBeNull();
  });

  it('FR-9b: does NOT scope by sender_session — a quiet-tick consult is still reconciled', async () => {
    // adam-quiet-tick inserts without sender_session; a sender-scoped sweep would be blind to it.
    const { api, state } = makeFakeSupabase({ candidates: [CONSULT()], answers: [ANSWER('corr-1')] });
    const out = await reconcileLateVerdicts(api, { recordDisposition: async () => ({ created: true }) });

    expect(out.reconciled).toBe(1);
    expect(state.candidateFilters).not.toHaveProperty('sender_session');
  });

  it('selects on the FR-2 structural discriminator, not body prose', async () => {
    const { api, state } = makeFakeSupabase({ candidates: [CONSULT()], answers: [ANSWER('corr-1')] });
    await reconcileLateVerdicts(api, { recordDisposition: async () => ({ created: true }) });
    expect(state.candidateFilters['payload->>consult_purpose']).toBe('pre_send');
    expect(state.candidateFilters['payload->>kind']).toBe('solomon_consult');
  });

  it('an UNANSWERED consult is left alone (no disposition, no stamp)', async () => {
    const { api, state } = makeFakeSupabase({ candidates: [CONSULT()], answers: [] });
    const recordDisposition = vi.fn();
    const out = await reconcileLateVerdicts(api, { recordDisposition });

    expect(out).toMatchObject({ checked: 1, reconciled: 0 });
    expect(recordDisposition).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it('FR-8: re-fires near-miss detection on the LATE verdict', async () => {
    // Without this the capability dies silently the moment the consult goes non-blocking, while
    // the synchronous-path tests stay green.
    const { api } = makeFakeSupabase({ candidates: [CONSULT()], answers: [ANSWER('corr-1')] });
    const captureNearMiss = vi.fn(async () => {});
    const out = await reconcileLateVerdicts(api, {
      recordDisposition: async () => ({ created: true }),
      detectVerdictDelta: (v) => v && v.verdict === 'amend',
      captureNearMiss,
    });

    expect(out.nearMisses).toBe(1);
    expect(captureNearMiss).toHaveBeenCalledTimes(1);
    expect(captureNearMiss.mock.calls[0][0]).toMatchObject({ decisionType: 'pre_send_consult' });
  });

  it('a near-miss capture failure never blocks reconciliation', async () => {
    const { api, state } = makeFakeSupabase({ candidates: [CONSULT()], answers: [ANSWER('corr-1')] });
    const out = await reconcileLateVerdicts(api, {
      recordDisposition: async () => ({ created: true }),
      detectVerdictDelta: () => true,
      captureNearMiss: async () => { throw new Error('sink down'); },
    });
    expect(out.reconciled).toBe(1);
    expect(state.updates).toHaveLength(1);
  });

  it('fail-open per candidate: a disposition throw leaves the row UN-stamped so a later sweep retries', async () => {
    const { api, state } = makeFakeSupabase({ candidates: [CONSULT()], answers: [ANSWER('corr-1')] });
    const out = await reconcileLateVerdicts(api, {
      recordDisposition: async () => { throw new Error('db down'); },
    });
    expect(out.reconciled).toBe(0);
    expect(state.updates).toHaveLength(0); // retryable — never silently marked done
  });

  it('returns an inert result without a recordDisposition dep (no half-done writes)', async () => {
    const { api, state } = makeFakeSupabase({ candidates: [CONSULT()], answers: [ANSWER('corr-1')] });
    const out = await reconcileLateVerdicts(api, {});
    expect(out).toMatchObject({ checked: 0, reconciled: 0 });
    expect(state.updates).toHaveLength(0);
  });
});
