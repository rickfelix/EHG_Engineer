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
 *
 * SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001: widened to also CC the originator of an
 * adam_advisory-kind correlation (Solomon replying to an Adam advisory), which previously
 * resolved to coordinator-only with no CC — 2 real specimens, 2026-08-25 00:50-01:01Z.
 * Prospective TESTING (sub_agent_execution_results 34995120-556f-437e-bf38-c93c55eb1e24)
 * found the naive widen alone breaks on an already-answered correlation (a reply is itself
 * stored as kind=adam_advisory sharing the ask's correlation_id), so both the by-id branch
 * (falls through via correlation_id on a reply-row hit) and the correlation-fallback branch
 * (cap-then-filter with ASCENDING order, not the pre-existing DESC .limit(1)) were corrected.
 * `fakeSb` below was upgraded to actually respect order()/limit()/in() arguments — the
 * pre-existing double silently ignored them, which would have hidden a cap-before-filter
 * regression entirely.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  resolveConsultOriginator, ensureOriginatorCc, checkConsultQuota, resolveSolomonAdvisoryTarget,
  SOLOMON_CONSULT_KIND, REPLY_ELIGIBLE_KINDS,
} = require('../../scripts/solomon-advisory.cjs');

const ADAM_ADVISORY_KIND = 'adam_advisory';
const ADAM_SESSION = 'adam-sess-1111';
const SOLOMON_SESSION = 'solomon-sess-5555';
const CONSULT_ROW_ID = 'row-id-2222';
const CONSULT_CORR = 'corr-3333';

/**
 * A fidelity-upgraded double: `in()`/`eq()` accumulate real filters, `order()` records the
 * requested direction, and `limit()` applies filters + sort + cap AT CALL TIME against
 * `byCorrelation` — so a query that filters AFTER capping (the regressed shape) and a query
 * that filters BEFORE capping (the correct shape) produce genuinely different results here,
 * exactly as they would against real PostgREST.
 */
function fakeSb({ byId = null, byCorrelation = [] } = {}) {
  return {
    from() {
      const state = { ascending: null, inFilters: [], eqFilters: [] };
      const api = {
        select() { return this; },
        eq(col, val) { state.eqFilters.push([col, val]); return this; },
        in(col, vals) { state.inFilters.push([col, vals]); return this; },
        order(_col, opts) { state.ascending = Boolean(opts && opts.ascending); return this; },
        maybeSingle() { return Promise.resolve({ data: byId, error: null }); },
        limit(n) {
          let rows = byCorrelation.slice();
          for (const [col, vals] of state.inFilters) {
            if (col === 'payload->>kind') rows = rows.filter((r) => vals.includes(r.payload && r.payload.kind));
          }
          for (const [col, val] of state.eqFilters) {
            if (col === 'payload->>correlation_id') rows = rows.filter((r) => String((r.payload && r.payload.correlation_id)) === String(val));
            if (col === 'payload->>kind') rows = rows.filter((r) => (r.payload && r.payload.kind) === val);
          }
          rows.sort((a, b) => {
            const ta = a.created_at || '';
            const tb = b.created_at || '';
            const cmp = ta < tb ? -1 : ta > tb ? 1 : 0;
            return state.ascending ? cmp : -cmp;
          });
          return Promise.resolve({ data: rows.slice(0, n), error: null });
        },
      };
      return api;
    },
  };
}

describe('resolveConsultOriginator — finds who asked the consult/advisory', () => {
  it('resolves by row id: returns the consult row sender_session', async () => {
    const sb = fakeSb({ byId: { sender_session: ADAM_SESSION, payload: { kind: SOLOMON_CONSULT_KIND } } });
    expect(await resolveConsultOriginator(sb, CONSULT_ROW_ID)).toBe(ADAM_SESSION);
  });

  it('prefers an explicit payload.origin_session over sender_session (relay-preserved originator)', async () => {
    const sb = fakeSb({ byId: { sender_session: 'coordinator-sess', payload: { kind: SOLOMON_CONSULT_KIND, origin_session: ADAM_SESSION } } });
    expect(await resolveConsultOriginator(sb, CONSULT_ROW_ID)).toBe(ADAM_SESSION);
  });

  it('a NON-eligible-kind row resolved by id yields null — CC stays scoped, not a blanket bypass (review I4)', async () => {
    const sb = fakeSb({ byId: { sender_session: 'coordinator-sess', payload: { kind: 'coordinator_reply' } } });
    expect(await resolveConsultOriginator(sb, CONSULT_ROW_ID)).toBeNull();
  });

  it('falls back to a correlation match on solomon_consult rows when no row matches the id', async () => {
    const sb = fakeSb({ byId: null, byCorrelation: [{ sender_session: ADAM_SESSION, payload: { kind: SOLOMON_CONSULT_KIND, correlation_id: CONSULT_CORR }, created_at: '2026-08-25T00:00:00Z' }] });
    expect(await resolveConsultOriginator(sb, CONSULT_CORR)).toBe(ADAM_SESSION);
  });

  it('returns null when nothing matches (caller skips the CC — fail-open)', async () => {
    const sb = fakeSb({ byId: null, byCorrelation: [] });
    expect(await resolveConsultOriginator(sb, 'unknown')).toBeNull();
  });

  it('returns null for a missing value', async () => {
    expect(await resolveConsultOriginator(fakeSb(), null)).toBeNull();
  });

  // SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001 FR-1: by-id resolution now also admits adam_advisory.
  it('FR-1: resolves by row id for an adam_advisory-kind (non-reply) row', async () => {
    const sb = fakeSb({ byId: { sender_session: ADAM_SESSION, payload: { kind: ADAM_ADVISORY_KIND } } });
    expect(await resolveConsultOriginator(sb, CONSULT_ROW_ID)).toBe(ADAM_SESSION);
  });

  // FR-2 (TST-C1): --reply-to resolving to a REPLY row by id must NOT return that row's own
  // sender — it must fall through via payload.correlation_id to the true (ask) originator.
  it('FR-2: a reply row hit BY ID falls through to the true originator, not the replier', async () => {
    const askRow = { sender_session: ADAM_SESSION, payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR }, created_at: '2026-08-25T00:46:29Z' };
    const replyRow = { sender_session: SOLOMON_SESSION, payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR, reply_to: CONSULT_CORR }, created_at: '2026-08-25T00:50:28Z' };
    // byId hits the REPLY row directly (its own id was pasted); byCorrelation is what the
    // fall-through's correlation query subsequently sees.
    const sb = fakeSb({ byId: replyRow, byCorrelation: [askRow, replyRow] });
    expect(await resolveConsultOriginator(sb, 'reply-row-id')).toBe(ADAM_SESSION);
  });

  // FR-4 (TST-C2): on an already-answered correlation, the fallback must resolve the ASK row
  // (oldest), never the newest row (which is the reply) — this is the exact regression a
  // cap-before-filter (limit(1) DESC) implementation reproduces.
  it('FR-4: correlation fallback on an answered correlation resolves the ask, not the newest (reply) row', async () => {
    const askRow = { sender_session: ADAM_SESSION, payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR }, created_at: '2026-08-25T00:46:29Z' };
    const replyRow = { sender_session: SOLOMON_SESSION, payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR, reply_to: CONSULT_CORR }, created_at: '2026-08-25T00:50:28Z' };
    const sb = fakeSb({ byId: null, byCorrelation: [askRow, replyRow] });
    expect(await resolveConsultOriginator(sb, CONSULT_CORR)).toBe(ADAM_SESSION);
  });

  it('REPLY_ELIGIBLE_KINDS is exactly {solomon_consult, adam_advisory} — no silent widening beyond the two named kinds', () => {
    expect([...REPLY_ELIGIBLE_KINDS].sort()).toEqual(['adam_advisory', 'solomon_consult']);
  });
});

describe('ensureOriginatorCc — idempotent CC delivery (review W1/W3, FR-5)', () => {
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
          in() { return this; },
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

  // FR-5: symmetric remap for a Solomon-originated adam_advisory thread whose resolved
  // originator session has since rotated.
  it('FR-5: re-resolves a dead SOLOMON originator session to the LIVE solomon session', async () => {
    const inserts = [];
    const LIVE_SOLOMON = 'solomon-sess-9999';
    const res = await ensureOriginatorCc(
      ccFakeSb({ consult: { sender_session: 'solomon-sess-old', payload: { kind: 'adam_advisory' } }, sessionRole: 'solomon' }),
      BASE_ARGS,
      { getLiveSolomonId: async () => LIVE_SOLOMON, insertRow: captureInsertRow(inserts) },
    );
    expect(res.inserted).toBe(true);
    expect(res.originator).toBe(LIVE_SOLOMON);
    expect(inserts[0].target_session).toBe(LIVE_SOLOMON);
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

  // TS-3: the currently-working solomon_consult multi-reply control path must not regress.
  it('TS-3: a SECOND reply on an already-answered solomon_consult correlation still CCs the original asker', async () => {
    const inserts = [];
    // The consult row (by id) is the ORIGINAL ask, unaffected by how many replies exist since --
    // ensureOriginatorCc's replyRef here is the ask's own row id, matching real usage where each
    // reply is sent with --reply-to <original-consult-id-or-correlation>.
    const res = await ensureOriginatorCc(ccFakeSb({ consult: CONSULT }), BASE_ARGS, { insertRow: captureInsertRow(inserts) });
    expect(res.inserted).toBe(true);
    expect(res.originator).toBe(ADAM_SESSION);
  });

  // TS-8: resolution must be STABLE (same originator) regardless of how many reply rows have
  // accumulated on the correlation, so the dedup key (target_session=originator) stays effective.
  it('TS-8: dedup stability — resolving via the correlation fallback is identical whether 1 or 3 replies exist', async () => {
    const askRow = { sender_session: ADAM_SESSION, payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR }, created_at: '2026-08-25T00:46:29Z' };
    const reply1 = { sender_session: SOLOMON_SESSION, payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR, reply_to: CONSULT_CORR }, created_at: '2026-08-25T00:50:00Z' };
    const reply2 = { sender_session: SOLOMON_SESSION, payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR, reply_to: CONSULT_CORR }, created_at: '2026-08-25T00:55:00Z' };
    const reply3 = { sender_session: SOLOMON_SESSION, payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR, reply_to: CONSULT_CORR }, created_at: '2026-08-25T01:00:00Z' };
    const sbOne = fakeSb({ byId: null, byCorrelation: [askRow, reply1] });
    const sbThree = fakeSb({ byId: null, byCorrelation: [askRow, reply1, reply2, reply3] });
    const withOne = await resolveConsultOriginator(sbOne, CONSULT_CORR);
    const withThree = await resolveConsultOriginator(sbThree, CONSULT_CORR);
    expect(withOne).toBe(ADAM_SESSION);
    expect(withThree).toBe(ADAM_SESSION);
    expect(withOne).toBe(withThree);
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
