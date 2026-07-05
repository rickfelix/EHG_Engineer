/**
 * QF-20260705-488 (chairman-caught): Solomon's consult answer d7f5401c targeted ONLY the
 * coordinator — Adam's directed-message log showed zero Solomon rows and the chairman had
 * to hand-paste the verdict into Adam's session. Two causes, both fixed:
 *  (1) ADAM_SOLOMON_TWOWAY_V1 defaulted OFF, hard-erroring Adam's `--to solomon` and
 *      Solomon's `--to adam` — default flipped ON (off only on the explicit 'off' kill
 *      switch); the pinned default-OFF test in adam-solomon-direct-channel.test.js was
 *      updated to the chairman-directed contract.
 *  (2) A consult ANSWER (`send --reply-to <consult>`) inserted a single row at the
 *      coordinator target — resolveConsultOriginator() now resolves the consult's
 *      originating session (payload.origin_session, else sender_session) so the send
 *      path CCs the originator whenever it differs from the target and from Solomon.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveConsultOriginator, ensureOriginatorCc, checkConsultQuota, resolveSolomonAdvisoryTarget, SOLOMON_CONSULT_KIND } = require('../../scripts/solomon-advisory.cjs');

const ADAM_SESSION = 'adam-sess-1111';
const CONSULT_ROW_ID = 'row-id-2222';
const CONSULT_CORR = 'corr-3333';

function fakeSb({ byId = null, byCorrelation = [] } = {}) {
  return {
    from() {
      const state = { wantsCorrelation: false };
      const api = {
        select() { return this; },
        eq(col, val) {
          if (col === 'payload->>correlation_id') state.wantsCorrelation = true;
          state.lastEq = { col, val };
          return this;
        },
        order() { return this; },
        maybeSingle() { return Promise.resolve({ data: byId, error: null }); },
        limit() { return Promise.resolve({ data: byCorrelation, error: null }); },
      };
      return api;
    },
  };
}

describe('resolveConsultOriginator — finds who asked the consult', () => {
  it('resolves by row id: returns the consult row sender_session', async () => {
    const sb = fakeSb({ byId: { sender_session: ADAM_SESSION, payload: { kind: SOLOMON_CONSULT_KIND } } });
    expect(await resolveConsultOriginator(sb, CONSULT_ROW_ID)).toBe(ADAM_SESSION);
  });

  it('prefers an explicit payload.origin_session over sender_session (relay-preserved originator)', async () => {
    const sb = fakeSb({ byId: { sender_session: 'coordinator-sess', payload: { kind: SOLOMON_CONSULT_KIND, origin_session: ADAM_SESSION } } });
    expect(await resolveConsultOriginator(sb, CONSULT_ROW_ID)).toBe(ADAM_SESSION);
  });

  it('a NON-consult row resolved by id yields null — CC is scoped to consults only (review I4)', async () => {
    const sb = fakeSb({ byId: { sender_session: 'coordinator-sess', payload: { kind: 'coordinator_reply' } } });
    expect(await resolveConsultOriginator(sb, CONSULT_ROW_ID)).toBeNull();
  });

  it('falls back to a correlation match on solomon_consult rows when no row matches the id', async () => {
    const sb = fakeSb({ byId: null, byCorrelation: [{ sender_session: ADAM_SESSION, payload: { kind: SOLOMON_CONSULT_KIND, correlation_id: CONSULT_CORR } }] });
    expect(await resolveConsultOriginator(sb, CONSULT_CORR)).toBe(ADAM_SESSION);
  });

  it('returns null when nothing matches (caller skips the CC — fail-open)', async () => {
    const sb = fakeSb({ byId: null, byCorrelation: [] });
    expect(await resolveConsultOriginator(sb, 'unknown')).toBeNull();
  });

  it('returns null for a missing value', async () => {
    expect(await resolveConsultOriginator(fakeSb(), null)).toBeNull();
  });
});

describe('ensureOriginatorCc — idempotent CC delivery (review W1/W3)', () => {
  const CONSULT = { sender_session: ADAM_SESSION, payload: { kind: SOLOMON_CONSULT_KIND } };
  const BASE_ARGS = {
    replyRef: CONSULT_ROW_ID, replyTo: CONSULT_CORR, target: 'coord-1', sessionId: 'solomon-1',
    subject: '[SOLOMON_ORACLE] verdict', payload: { kind: 'adam_advisory', oracle: true, body: 'verdict', reply_to: CONSULT_CORR }, expiresAt: '2026-07-06T00:00:00Z',
  };

  function ccFakeSb({ consult = CONSULT, existingCc = [], sessionRole = null } = {}) {
    return {
      from(table) {
        const api = {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          maybeSingle() {
            if (table === 'claude_sessions') return Promise.resolve({ data: sessionRole ? { metadata: { role: sessionRole } } : null, error: null });
            return Promise.resolve({ data: consult, error: null }); // session_coordination by id
          },
          limit() { return Promise.resolve({ data: existingCc, error: null }); },
        };
        return api;
      },
    };
  }

  function captureInsertRow(inserts) {
    return async (_sb, row) => { inserts.push(row); return { data: { id: 'cc-1' }, error: null }; };
  }

  it('inserts a via:cc_originator row targeted at the consult originator', async () => {
    const inserts = [];
    const res = await ensureOriginatorCc(ccFakeSb(), BASE_ARGS, { insertRow: captureInsertRow(inserts) });
    expect(res.inserted).toBe(true);
    expect(res.originator).toBe(ADAM_SESSION);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].target_session).toBe(ADAM_SESSION);
    expect(inserts[0].payload.via).toBe('cc_originator');
  });

  it('is idempotent: an existing row for this reply targeting the originator suppresses the CC (heal path, W1)', async () => {
    const inserts = [];
    const res = await ensureOriginatorCc(ccFakeSb({ existingCc: [{ id: 'prior-cc' }] }), BASE_ARGS, { insertRow: captureInsertRow(inserts) });
    expect(res.inserted).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it('re-resolves a dead adam consult-time session to the LIVE adam session (W3)', async () => {
    const inserts = [];
    const LIVE_ADAM = 'adam-sess-9999';
    const res = await ensureOriginatorCc(ccFakeSb({ sessionRole: 'adam' }), BASE_ARGS, { getLiveAdamId: async () => LIVE_ADAM, insertRow: captureInsertRow(inserts) });
    expect(res.inserted).toBe(true);
    expect(res.originator).toBe(LIVE_ADAM);
    expect(inserts[0].target_session).toBe(LIVE_ADAM);
  });

  it('skips when the originator IS the answer target (coordinator-originated consult: no duplicate)', async () => {
    const inserts = [];
    const res = await ensureOriginatorCc(
      ccFakeSb({ consult: { sender_session: 'coord-1', payload: { kind: SOLOMON_CONSULT_KIND } } }),
      BASE_ARGS,
      { insertRow: captureInsertRow(inserts) }
    );
    expect(res.inserted).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it('a failed CC insert reports the error so the caller warns with the retry hint (W1 loudness)', async () => {
    const res = await ensureOriginatorCc(ccFakeSb(), BASE_ARGS, { insertRow: async () => ({ data: null, error: { message: 'boom' } }) });
    expect(res.inserted).toBe(false);
    expect(res.error).toBe('boom');
  });
});

describe('checkConsultQuota — CC copies do not double-count (review W2)', () => {
  it('excludes via:cc_originator rows from the per-day count', async () => {
    const rows = [];
    for (let i = 0; i < 19; i++) rows.push({ id: `a${i}`, payload: { oracle: true }, created_at: 'x' });
    for (let i = 0; i < 19; i++) rows.push({ id: `c${i}`, payload: { oracle: true, via: 'cc_originator' }, created_at: 'x' });
    const sb = { from() { return { select() { return this; }, eq() { return this; }, gte() { return this; }, limit() { return Promise.resolve({ data: rows, error: null }); } }; } };
    // 19 real answers + 19 CC copies: with the exclusion this is still under the 20/day ceiling.
    expect((await checkConsultQuota(sb, {})).allowed).toBe(true);
  });
});

describe('direct lane under the flipped default — the chairman round-trip shape', () => {
  it('--to adam with the (now default-on) flag routes DIRECT to the live Adam session', () => {
    const { target, via } = resolveSolomonAdvisoryTarget({ toAdam: true, flagOn: true, coordinatorId: 'coord-1', adamId: ADAM_SESSION });
    expect(target).toBe(ADAM_SESSION);
    expect(via).toBe('direct');
  });

  it('default (no --to) remains the coordinator relay — board-reads and plain sends unchanged', () => {
    const { target, via } = resolveSolomonAdvisoryTarget({ toAdam: false, flagOn: true, coordinatorId: 'coord-1', adamId: ADAM_SESSION });
    expect(target).toBe('coord-1');
    expect(via).toBeNull();
  });
});
