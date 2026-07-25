/**
 * SD-LEO-INFRA-SOLOMON-CONSULT-CANNOT-DELIVER-001 — FR-3 / FR-8 / FR-9 reconciler guards.
 *
 * The verdict was always CORRELATABLE; nothing ever CONSUMED it. These pin the consumer, and
 * specifically the two FR-9 scoping traps that would each let the sweep read green while silently
 * covering the wrong rows.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
// The REAL key primitive. Every other test here stubs recordDisposition, which is exactly how a
// contract violation in the subject we pass it survived a fully green suite (SEC-1).
import { computeQuestionKey } from '../../../lib/decision-binding/disposition.js';
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
  const state = { updates: [], candidateFilters: {}, answerFilters: {}, candidateOrders: [], answerOrders: [], candidateGte: {}, mode: 'candidates' };
  const bucket = () => (state.mode === 'candidates' ? state.candidateFilters : state.answerFilters);
  const orders = () => (state.mode === 'candidates' ? state.candidateOrders : state.answerOrders);
  const api = {
    from() { return api; },
    select(cols) {
      state.mode = String(cols).includes('target_session') ? 'candidates' : 'answers';
      return api;
    },
    eq(col, val) { bucket()[col] = val; return api; },
    is(col, val) { bucket()[col] = val; return api; },
    in() { return api; },
    gte(col, val) { state.candidateGte[col] = val; return api; },
    // Recorded, not ignored: ORDER is load-bearing here (it decides which slice of the backlog is
    // drained and which answer wins), so a test must be able to assert on it.
    order(col, opts) { orders().push({ col, opts }); return api; },
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
    // Subject is a content-derived OBJECT. This assertion previously pinned `solomon-consult:corr-1`
    // — a string — and so actively certified the SEC-1 defect as correct behaviour.
    expect(recordDisposition.mock.calls[0][0]).toMatchObject({
      decisionType: 'consult_answer',
      subject: { consult_purpose: 'pre_send', question_text: 'b' },
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

  it('SEC-1: the subject it builds satisfies the REAL computeQuestionKey contract', async () => {
    // THE REGRESSION GUARD. Shipped code passed `solomon-consult:${corr}` — a STRING — and
    // computeQuestionKey throws on a non-object. The throw landed in the per-candidate catch and was
    // swallowed, so reconciled stayed 0, nothing was ever stamped, and the cron logged ok:true and
    // exited 0 forever. Every test passed over it because every test stubbed the writer. Here the
    // stub calls the REAL primitive, so a non-conforming subject fails loudly instead of silently.
    const { api } = makeFakeSupabase({ candidates: [CONSULT()], answers: [ANSWER('corr-1')] });
    const seen = [];
    const out = await reconcileLateVerdicts(api, {
      recordDisposition: async ({ decisionType, subject }) => {
        seen.push(computeQuestionKey(decisionType, subject)); // throws on the old string subject
        return { created: true };
      },
    });

    expect(out.reconciled).toBe(1);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^dq_[0-9a-f]{64}$/);
  });

  it('SEC-9: two consults sharing question text do NOT collapse onto one disposition', async () => {
    // THE REGRESSION GUARD FOR THE FIX'S OWN FIRST DRAFT. Keying on question_text alone recreated
    // this SD's thesis defect: the second consult was stamped reconciled while only the FIRST
    // verdict was ever persisted. Reachable, not theoretical — presend-consult-lane.cjs hardcodes
    // the row subject to a constant and never passes sd_key, so for body-less consults every other
    // discriminator is identical across rows.
    const mk = (id, corr) => ({ id, subject: '[SOLOMON_CONSULT] pre-send', body: null, created_at: '2026-07-25T10:00:00Z',
      payload: { kind: 'solomon_consult', consult_purpose: 'pre_send', correlation_id: corr, body: 'same question' } });
    const { api, state } = makeFakeSupabase({
      candidates: [mk('rA', 'corr-A'), mk('rB', 'corr-B')],
      answers: [ANSWER('corr-A'), ANSWER('corr-B')],
    });

    const keys = new Set();
    const out = await reconcileLateVerdicts(api, {
      recordDisposition: async ({ decisionType, subject }) => { keys.add(computeQuestionKey(decisionType, subject)); return { created: true }; },
    });

    expect(out.reconciled).toBe(2);
    expect(keys.size).toBe(2);       // two events => two dispositions, never one
    expect(state.updates).toHaveLength(2);
  });

  it('SEC-9: the same consult row re-swept recomputes the SAME key (retries still dedup)', async () => {
    // Per-event keying must not cost idempotency: a cron re-running over a row it already handled
    // has to land on the identical key, or every sweep mints a duplicate disposition.
    const keyFor = async (rowId) => {
      const row = CONSULT({ id: rowId, payload: { body: 'q' } });
      const { api } = makeFakeSupabase({ candidates: [row], answers: [ANSWER('corr-1')] });
      let key;
      await reconcileLateVerdicts(api, {
        recordDisposition: async ({ decisionType, subject }) => { key = computeQuestionKey(decisionType, subject); return { created: false }; },
      });
      return key;
    };
    expect(await keyFor('row-1')).toBe(await keyFor('row-1'));
    expect(await keyFor('row-1')).not.toBe(await keyFor('row-2'));
  });

  it('SEC-11: candidates are bounded by a recency HORIZON, not an unbounded oldest-first window', async () => {
    // session_coordination has no reaper (4670 rows, 3379 already past expires_at). Oldest-first
    // over an unbounded backlog is terminal: once the oldest `limit` rows are all permanently
    // unanswerable the window stops advancing and the sweep is blind for good.
    const { api, state } = makeFakeSupabase({ candidates: [CONSULT()], answers: [ANSWER('corr-1')] });
    await reconcileLateVerdicts(api, { recordDisposition: async () => ({ created: true }), now: Date.parse('2026-07-25T12:00:00Z') });
    expect(state.candidateGte['created_at']).toBe('2026-07-24T12:00:00.000Z');
  });

  it('condition C: a lane FAILING every write is distinguishable from a quiet lane', async () => {
    // The silent catch is what hid SEC-1 — an all-throwing sweep returned {reconciled:0}, which on
    // the wire is identical to "nothing to do". Counting the failures is the actual fix.
    const { api } = makeFakeSupabase({ candidates: [CONSULT()], answers: [ANSWER('corr-1')] });
    const out = await reconcileLateVerdicts(api, {
      recordDisposition: async () => { throw new Error('db down'); },
    });
    expect(out).toMatchObject({ reconciled: 0, errors: 1 });
    expect(out.firstError).toContain('db down');
  });

  it('SEC-3: candidates are drained OLDEST-FIRST, never an arbitrary slice', async () => {
    // Unreconciled rows accumulate (only the answered fraction is ever stamped), so an unordered
    // .limit() window would eventually stop surfacing the head of the backlog and go quietly blind.
    const { api, state } = makeFakeSupabase({ candidates: [CONSULT()], answers: [ANSWER('corr-1')] });
    await reconcileLateVerdicts(api, { recordDisposition: async () => ({ created: true }) });
    expect(state.candidateOrders[0]).toMatchObject({ col: 'created_at', opts: { ascending: true } });
  });

  it('SEC-3: the ANSWER query is ordered too — first-wins must mean earliest, not random-UUID', async () => {
    // The dedup in resolveAnswerRows is first-wins per correlation_id, so ORDER decides which row
    // becomes the verdict of record. Ordering by a UUID id alone makes that pick arbitrary. This
    // assertion was plumbed for (answerOrders) but never actually written — a half-built guard
    // reads as coverage while proving nothing.
    const { api, state } = makeFakeSupabase({ candidates: [CONSULT()], answers: [ANSWER('corr-1')] });
    await reconcileLateVerdicts(api, { recordDisposition: async () => ({ created: true }) });
    expect(state.answerOrders[0]).toMatchObject({ col: 'created_at', opts: { ascending: true } });
  });

  it('returns an inert result without a recordDisposition dep (no half-done writes)', async () => {
    const { api, state } = makeFakeSupabase({ candidates: [CONSULT()], answers: [ANSWER('corr-1')] });
    const out = await reconcileLateVerdicts(api, {});
    expect(out).toMatchObject({ checked: 0, reconciled: 0 });
    expect(state.updates).toHaveLength(0);
  });
});
