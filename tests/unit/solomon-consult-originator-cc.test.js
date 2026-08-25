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
import { describe, it, expect, vi } from 'vitest';
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
function fakeSb({ byId = null, byCorrelation = [], selectLog = null, correlationError = null } = {}) {
  return {
    from() {
      const state = { ascending: null, inFilters: [], eqFilters: [] };
      const api = {
        // EXEC-TST-W5/W6: record the requested column list so a test can assert the
        // correlation-fallback query still retains `payload` (isReplyRow's only input).
        select(cols) { if (selectLog) selectLog.push(cols); return this; },
        eq(col, val) { state.eqFilters.push([col, val]); return this; },
        in(col, vals) { state.inFilters.push([col, vals]); return this; },
        order(_col, opts) { state.ascending = Boolean(opts && opts.ascending); return this; },
        maybeSingle() { return Promise.resolve({ data: byId, error: null }); },
        limit(n) {
          // EXEC-TST-T1: supabase-js reports a query-level failure via a non-null `error`
          // WITHOUT throwing — this must NOT be conflated with the "no rows" empty-data case.
          if (correlationError) return Promise.resolve({ data: null, error: correlationError });
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

  // EXEC-TO-PLAN TESTING R3 (T1, sub_agent_execution_results a81a8b51-cc47-48c5-95ce-236085092de1):
  // the EXEC-TST-W4 comment claims a correlation-query failure is "loud, still fail-open" — but
  // the code only logged from the catch block, so a non-throwing supabase-js error (the normal
  // shape for a bad column / missing table / RLS denial) silently degraded to the pre-fix "no CC"
  // symptom with zero operator signal. This pins that the loud-logging guarantee actually holds.
  it('EXEC-TST-T1: a non-throwing query-level error on the correlation fallback logs loudly, not silently', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sb = fakeSb({ byId: null, correlationError: { message: 'column "payload->>kind" does not exist', code: '42703' } });
    const result = await resolveConsultOriginator(sb, CONSULT_CORR);
    expect(result).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    expect(errSpy.mock.calls.some((args) => String(args[0]).includes('42703') || String(args[0]).includes('query error'))).toBe(true);
    errSpy.mockRestore();
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

  // EXEC-TST-C1/EXEC-TST-C2 (prospective EXEC-TO-PLAN TESTING, sub_agent_execution_results
  // 4101e867-2ebb-4d69-83ac-98838edfaf75): mutation testing proved 4 mutants of the shipped fix
  // survived the round-1 test additions with the suite fully green — i.e. the cap size, the sort
  // direction, and the reply-row exclusion were each individually unpinned even though the
  // COMBINED regression shape (M1b, DESC+limit(1)) was caught. These 4 tests each isolate and
  // kill one previously-surviving mutant.
  describe('FR-4 cap-then-filter — each mechanism independently pinned (EXEC-TST-C1)', () => {
    // Kills M1c (.limit(20) -> .limit(1)) AND M1d (rows.find(!isReplyRow) -> rows[0]): the reply
    // is the OLDEST row on the correlation (an unusual but valid ordering — e.g. clock skew), so
    // a 1-row cap fetches ONLY the reply (wrong: null) and a bare rows[0] returns the reply's own
    // sender (wrong: the replier) — only cap>1 PLUS the JS filter together resolve the true ask.
    it('a correlation whose OLDEST row is a reply still resolves the true (later, non-reply) ask — not null, not the replier', async () => {
      const replyRow = { sender_session: SOLOMON_SESSION, payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR, reply_to: CONSULT_CORR }, created_at: '2026-08-25T00:40:00Z' };
      const askRow = { sender_session: ADAM_SESSION, payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR }, created_at: '2026-08-25T00:46:29Z' };
      const sb = fakeSb({ byId: null, byCorrelation: [replyRow, askRow] });
      const result = await resolveConsultOriginator(sb, CONSULT_CORR);
      expect(result).not.toBeNull();
      expect(result).not.toBe(SOLOMON_SESSION);
      expect(result).toBe(ADAM_SESSION);
    });

    // Kills M1a (ascending:true -> false): TWO genuine non-reply candidates on the same
    // correlation (a real, if unusual, shape — e.g. an automated advisory followed by a human
    // one) — only ascending order picks the OLDEST (the true first ask), matching FR-4's stated
    // invariant. Descending would pick the newer one instead, silently answering a different
    // question ("who asked most recently" vs "who originated this").
    it('with two non-reply candidates on one correlation, the OLDEST (not the newest) is resolved as originator', async () => {
      const earlierAsk = { sender_session: 'adam-coordinator-health', payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR }, created_at: '2026-08-25T00:10:00Z' };
      const laterAsk = { sender_session: ADAM_SESSION, payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR }, created_at: '2026-08-25T00:20:00Z' };
      const sb = fakeSb({ byId: null, byCorrelation: [earlierAsk, laterAsk] });
      expect(await resolveConsultOriginator(sb, CONSULT_CORR)).toBe('adam-coordinator-health');
    });

    // EXEC-TO-PLAN TESTING R3 (T6, LOW): the prior C1 tests prove cap must be >1, but a
    // shrunk-but-still->1 cap (e.g. .limit(2) or .limit(3)) survived those fixtures too — neither
    // has more than 2 leading reply rows. Four leading replies ahead of the true ask requires a
    // cap of at least 5 to resolve correctly, killing the .limit(2)/.limit(3) mutants directly.
    it('a correlation with 4 leading reply rows still resolves the true (5th, oldest non-reply) ask', async () => {
      const replies = Array.from({ length: 4 }, (_, i) => ({
        sender_session: SOLOMON_SESSION,
        payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR, reply_to: CONSULT_CORR },
        created_at: `2026-08-25T00:0${i}:00Z`,
      }));
      const askRow = { sender_session: ADAM_SESSION, payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR }, created_at: '2026-08-25T00:10:00Z' };
      const sb = fakeSb({ byId: null, byCorrelation: [...replies, askRow] });
      expect(await resolveConsultOriginator(sb, CONSULT_CORR)).toBe(ADAM_SESSION);
    });
  });

  // Kills M1d in isolation: a correlation carrying ONLY reply rows (no ask present at all — a
  // real, live-reachable shape: measured 14/373 sampled correlations). Fail-open (null) is
  // correct; returning the replier's own session would be the exact misdelivery class this SD
  // exists to eliminate.
  it('EXEC-TST-C2: a replies-only correlation (no ask row) resolves null, never the replier', async () => {
    const reply1 = { sender_session: SOLOMON_SESSION, payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR, reply_to: CONSULT_CORR }, created_at: '2026-08-25T00:50:00Z' };
    const reply2 = { sender_session: SOLOMON_SESSION, payload: { kind: ADAM_ADVISORY_KIND, correlation_id: CONSULT_CORR, reply_to: CONSULT_CORR }, created_at: '2026-08-25T00:55:00Z' };
    const sb = fakeSb({ byId: null, byCorrelation: [reply1, reply2] });
    const result = await resolveConsultOriginator(sb, CONSULT_CORR);
    expect(result).toBeNull();
    expect(result).not.toBe(SOLOMON_SESSION);
  });

  // EXEC-TST-W1: the existing 'a NON-eligible-kind row resolved by id yields null' test above
  // uses kind='coordinator_reply', which isReplyRow() ALSO independently classifies as a reply
  // (its own first clause) — so that fixture cannot distinguish "the I4 kind guard fired" from
  // "the reply-exclusion fired for an unrelated reason" (mutation-proved: deleting the guard
  // leaves that test green). A genuinely non-reply, non-eligible kind is required to pin it.
  it('EXEC-TST-W1: a non-reply, non-eligible kind (chairman_directive) resolved by id yields null — the ONLY fixture that actually pins the I4 guard', async () => {
    const sb = fakeSb({ byId: { sender_session: 'coordinator-sess', payload: { kind: 'chairman_directive' } } });
    expect(await resolveConsultOriginator(sb, CONSULT_ROW_ID)).toBeNull();
  });

  // EXEC-TST-W5/W6: the fallback query's select() must retain `payload` — isReplyRow's only
  // input — or the reply-exclusion silently becomes a no-op (every row reads as non-reply).
  it('EXEC-TST-W5/W6: the correlation-fallback query requests payload in its select list', async () => {
    const selectLog = [];
    const sb = fakeSb({ byId: null, byCorrelation: [], selectLog });
    await resolveConsultOriginator(sb, CONSULT_CORR);
    expect(selectLog.some((cols) => String(cols).includes('payload'))).toBe(true);
  });

  // SECURITY EXEC-TO-PLAN (sub_agent_execution_results e4068393-0933-4b30-9d9e-6a48aa8afa83) S3:
  // EXEC-TST-W1 above pins the BY-ID branch's kind guard; nothing previously pinned the
  // correlation-FALLBACK branch's `.in('payload->>kind', REPLY_ELIGIBLE_KINDS)` filter in
  // isolation — deleting that `.in()` call left every existing test green, because every
  // fallback fixture used so far only ever contains eligible-kind rows. A correlation carrying
  // an ineligible-kind row (e.g. a stray chairman_directive sharing the correlation_id) must
  // resolve null, never that row's sender.
  it('EXEC-SEC-S3: a correlation whose only row is an ineligible kind resolves null via the fallback path, not that row\'s sender', async () => {
    const strayRow = { sender_session: 'coordinator-sess', payload: { kind: 'chairman_directive', correlation_id: CONSULT_CORR }, created_at: '2026-08-25T00:46:29Z' };
    const sb = fakeSb({ byId: null, byCorrelation: [strayRow] });
    const result = await resolveConsultOriginator(sb, CONSULT_CORR);
    expect(result).toBeNull();
    expect(result).not.toBe('coordinator-sess');
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

  // EXEC-TST-W3: scripts/solomon-advisory.cjs:1215 (the dedup-HEAL call site) runs EXCLUSIVELY
  // when alreadyAnswered() is true -- i.e. exclusively in the state where a reply row already
  // exists on the correlation -- and passes the identical arg shape ensureOriginatorCc accepts
  // here. TS-3 above only exercises this shape with a solomon_consult-flavored ask; this pins
  // the adam_advisory-flavored ask the widening (FR-1) newly admits to that same call site.
  it('EXEC-TST-W3: the heal-path shape (ensureOriginatorCc after a prior reply) works for an adam_advisory ask, not just solomon_consult', async () => {
    const inserts = [];
    const adamAdvisoryAsk = { sender_session: ADAM_SESSION, payload: { kind: 'adam_advisory' } };
    const res = await ensureOriginatorCc(ccFakeSb({ consult: adamAdvisoryAsk }), BASE_ARGS, { insertRow: captureInsertRow(inserts) });
    expect(res.inserted).toBe(true);
    expect(res.originator).toBe(ADAM_SESSION);
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

  // SECURITY EXEC-TO-PLAN (sub_agent_execution_results e4068393-0933-4b30-9d9e-6a48aa8afa83) S4:
  // the resolved originator was written straight to target_session with zero validation. A
  // resolved value of a 'broadcast-'-prefixed live fan-out sentinel (resolveSolomonAdvisoryTarget's
  // own fallback shape) would silently convert a targeted 1:1 CC into an unintended fleet-wide
  // broadcast of reply content.
  it('EXEC-SEC-S4: an originator resolving to a broadcast- sentinel is refused, never written as target_session', async () => {
    const inserts = [];
    const res = await ensureOriginatorCc(
      ccFakeSb({ consult: { sender_session: 'broadcast-adam', payload: { kind: SOLOMON_CONSULT_KIND } } }),
      BASE_ARGS,
      { insertRow: captureInsertRow(inserts) },
    );
    expect(res.inserted).toBe(false);
    expect(res.originator).toBeNull();
    expect(inserts).toHaveLength(0);
  });

  // S4 (nil UUID variant): the nil UUID defeats plain typeof/non-empty checks (QF-20260727-862)
  // but is never a real session — must be refused the same way.
  it('EXEC-SEC-S4: an originator resolving to the nil UUID is refused, never written as target_session', async () => {
    const inserts = [];
    const res = await ensureOriginatorCc(
      ccFakeSb({ consult: { sender_session: '00000000-0000-0000-0000-000000000000', payload: { kind: SOLOMON_CONSULT_KIND } } }),
      BASE_ARGS,
      { insertRow: captureInsertRow(inserts) },
    );
    expect(res.inserted).toBe(false);
    expect(res.originator).toBeNull();
    expect(inserts).toHaveLength(0);
  });

  // PLAN_VERIFICATION REGRESSION (R1, sub_agent_execution_results 6a6c6c26-453b-4fca-8f4e-a390cc45ce20):
  // the S4 guard originally checked only the 'broadcast-'-PREFIXED sentinels, but bare 'broadcast'
  // (no trailing dash) is ALSO a live fleet-wide fan-out sentinel (lib/coordinator/dispatch.cjs
  // SENTINEL_TARGETS, used by chairman_directive) — the same amplification class S4 exists to stop.
  it('EXEC-REG-R1: an originator resolving to the bare broadcast sentinel (no dash) is refused, never written as target_session', async () => {
    const inserts = [];
    const res = await ensureOriginatorCc(
      ccFakeSb({ consult: { sender_session: 'broadcast', payload: { kind: SOLOMON_CONSULT_KIND } } }),
      BASE_ARGS,
      { insertRow: captureInsertRow(inserts) },
    );
    expect(res.inserted).toBe(false);
    expect(res.originator).toBeNull();
    expect(inserts).toHaveLength(0);
  });

  // EXEC-TO-PLAN TESTING R3 (T2, sub_agent_execution_results a81a8b51-cc47-48c5-95ce-236085092de1):
  // moving the S4 guard BEFORE the W3/FR-5 live-role remap survived the full suite, because every
  // existing S4 fixture uses sessionRole:null (no remap fires). The RAW resolved originator here
  // ('adam-sess-old') is a perfectly usable session — it is the REMAPPED (live) value that is
  // poisoned. The guard must validate what actually gets WRITTEN, not the pre-remap input.
  it('EXEC-TST-T2: the S4 guard validates the POST-remap value, not the pre-remap originator', async () => {
    const inserts = [];
    const res = await ensureOriginatorCc(
      ccFakeSb({ consult: { sender_session: 'adam-sess-old', payload: { kind: SOLOMON_CONSULT_KIND } }, sessionRole: 'adam' }),
      BASE_ARGS,
      { getLiveAdamId: async () => 'broadcast-adam', insertRow: captureInsertRow(inserts) },
    );
    expect(res.inserted).toBe(false);
    expect(res.originator).toBeNull();
    expect(inserts).toHaveLength(0);
  });

  it('EXEC-TST-T2: the S4 guard refuses a POST-remap nil UUID even though the pre-remap originator was usable', async () => {
    const inserts = [];
    const res = await ensureOriginatorCc(
      ccFakeSb({ consult: { sender_session: 'solomon-sess-old', payload: { kind: 'adam_advisory' } }, sessionRole: 'solomon' }),
      BASE_ARGS,
      { getLiveSolomonId: async () => '00000000-0000-0000-0000-000000000000', insertRow: captureInsertRow(inserts) },
    );
    expect(res.inserted).toBe(false);
    expect(res.originator).toBeNull();
    expect(inserts).toHaveLength(0);
  });

  // EXEC-TO-PLAN TESTING R3 (T3): moving the self/target skip BEFORE the remap also survived the
  // full suite, for the same reason — no existing fixture has a remap land ON the running session
  // or the answer target. Here the RAW originator ('solomon-sess-old') differs from both target
  // and sessionId, but the LIVE remap resolves to sessionId itself (Solomon replying on its own
  // adam_advisory thread after a seat rotation) — the skip must fire on the value actually about
  // to be written, or this self-addresses a CC.
  it('EXEC-TST-T3: the self/target skip applies to the POST-remap value — a remap landing on the running session is not self-CC\'d', async () => {
    const inserts = [];
    const res = await ensureOriginatorCc(
      ccFakeSb({ consult: { sender_session: 'solomon-sess-old', payload: { kind: 'adam_advisory' } }, sessionRole: 'solomon' }),
      BASE_ARGS, // sessionId: 'solomon-1'
      { getLiveSolomonId: async () => 'solomon-1', insertRow: captureInsertRow(inserts) },
    );
    expect(res.inserted).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it('EXEC-TST-T3: the self/target skip also applies when a remap lands on the answer target', async () => {
    const inserts = [];
    const res = await ensureOriginatorCc(
      ccFakeSb({ consult: { sender_session: 'adam-sess-old', payload: { kind: SOLOMON_CONSULT_KIND } }, sessionRole: 'adam' }),
      BASE_ARGS, // target: 'coord-1'
      { getLiveAdamId: async () => 'coord-1', insertRow: captureInsertRow(inserts) },
    );
    expect(res.inserted).toBe(false);
    expect(inserts).toHaveLength(0);
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
