/**
 * SD-LEO-INFRA-SOLOMON-CONSULT-001E-A — the Solomon advisory comms lane. Pure-function + injected-stub
 * coverage (no real DB): the oracle answer payload (kind=adam_advisory + oracle:true + reply_to echo),
 * inbox classification (consult/directive/orphan), the NET-NEW dedup/quota/task_budget guards, and the
 * drainSolomonOutbound re-target the register depends on.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const m = require('../../scripts/solomon-advisory.cjs');

describe('FR-E1: buildAdvisoryPayload — oracle marker + reply echo', () => {
  it('emits kind=adam_advisory + oracle:true, never signal_type/intent_action', () => {
    const p = m.buildAdvisoryPayload({ body: 'deep answer', correlationId: 'c1' });
    expect(p.kind).toBe('adam_advisory');     // reuses the advisory inbox lane
    expect(p.oracle).toBe(true);              // Solomon marker
    expect(p.signal_type).toBeUndefined();
    expect(p.intent_action).toBeUndefined();
    expect(p.correlation_id).toBe('c1');      // replyable
  });
  it('echoes reply_to under BOTH reply_to and correlation_id (answer correlates to its consult)', () => {
    const p = m.buildAdvisoryPayload({ body: 'x', correlationId: 'self', replyTo: 'consult-corr' });
    expect(p.reply_to).toBe('consult-corr');
    expect(p.correlation_id).toBe('consult-corr'); // overrides the self correlation
  });
  it('redacts + hard-caps the body', () => {
    const p = m.buildAdvisoryPayload({ body: 'a'.repeat(99999) });
    expect(p.body.length).toBeLessThan(99999);
  });
});

describe('FR-E1: inbox classification', () => {
  const row = (kind, extra = {}) => ({ payload: { kind, ...extra } });
  it('classifies a consult + directives as Solomon-inbox; untyped/unknown as orphan', () => {
    expect(m.isSolomonInboxRow(row('solomon_consult'))).toBe(true);
    expect(m.SOLOMON_INBOX_KINDS).toContain('solomon_consult');
    expect(m.isOrphanedSolomonRow(row('solomon_consult'))).toBe(false);   // drained by a real lane
    expect(m.isOrphanedSolomonRow({ payload: {} })).toBe(true);            // untyped → orphan
    expect(m.isOrphanedSolomonRow(row('coordinator_alert'))).toBe(true);  // unknown typed → orphan
    expect(m.isOrphanedSolomonRow(row('ack'))).toBe(false);               // handler-owned → never touch
  });
  it('isReplyRow recognizes a reply_to correlation or coordinator_reply', () => {
    expect(m.isReplyRow(row('coordinator_reply'))).toBe(true);
    expect(m.isReplyRow(row('anything', { reply_to: 'c' }))).toBe(true);
    expect(m.isReplyRow(row('solomon_consult'))).toBe(false);
  });
});

describe('FR-E1: NET-NEW guards', () => {
  it('computeConsultSignature prefers correlation_id, else a stable content hash', () => {
    expect(m.computeConsultSignature({ payload: { correlation_id: 'abc' } })).toBe('corr:abc');
    const a = m.computeConsultSignature({ payload: { sd_key: 'SD-1', body: 'q?' } });
    const b = m.computeConsultSignature({ payload: { sd_key: 'SD-1', body: 'q?' } });
    const c = m.computeConsultSignature({ payload: { sd_key: 'SD-2', body: 'q?' } });
    expect(a).toBe(b);                 // identical consults dedup
    expect(a).not.toBe(c);             // distinct SDs do not collide
    expect(a.startsWith('hash:')).toBe(true);
  });

  it('enforceSweepBudget stops the sweep at the count / wall-clock / token ceiling (at entry)', () => {
    const budget = { maxCount: 5, maxWallClockMs: 1000, maxTokens: 100 };
    expect(m.enforceSweepBudget(budget, { count: 0, elapsedMs: 0, tokens: 0 }).withinBudget).toBe(true);
    expect(m.enforceSweepBudget(budget, { count: 5 }).withinBudget).toBe(false);     // count ceiling
    expect(m.enforceSweepBudget(budget, { elapsedMs: 1000 }).withinBudget).toBe(false); // wall-clock
    expect(m.enforceSweepBudget(budget, { tokens: 100 }).withinBudget).toBe(false);  // token
    expect(m.SOLOMON_SWEEP_BUDGET.maxCount).toBeGreaterThan(0);
  });

  it('alreadyAnswered is true when an advisory already echoes the consult correlation (durable dedup)', async () => {
    const answered = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [{ id: 'x' }], error: null }) }) }) }) };
    const fresh = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) };
    expect(await m.alreadyAnswered(answered, 'c1')).toBe(true);
    expect(await m.alreadyAnswered(fresh, 'c1')).toBe(false);
    expect(await m.alreadyAnswered(fresh, null)).toBe(false); // no correlation → not answered
  });

  it('checkConsultQuota blocks at the per-day and per-SD ceilings, fails OPEN on error', async () => {
    const makeSb = (rows, error = null) => ({ from: () => ({ select: () => ({ eq: () => ({ gte: () => ({ limit: async () => ({ data: rows, error }) }) }) }) }) });
    // per-day: 3 oracle rows today, perDayMax 2 → blocked
    const day = await m.checkConsultQuota(makeSb([{ payload: {} }, { payload: {} }, { payload: {} }]), { perDayMax: 2 });
    expect(day.allowed).toBe(false);
    // per-SD: 2 rows for SD-1, perSdMax 2 → blocked for SD-1
    const sd = await m.checkConsultQuota(makeSb([{ payload: { sd_key: 'SD-1' } }, { payload: { sd_key: 'SD-1' } }]), { sdKey: 'SD-1', perSdMax: 2, perDayMax: 99 });
    expect(sd.allowed).toBe(false);
    // under both ceilings → allowed
    const ok = await m.checkConsultQuota(makeSb([{ payload: { sd_key: 'SD-2' } }]), { sdKey: 'SD-1', perSdMax: 2, perDayMax: 99 });
    expect(ok.allowed).toBe(true);
    // query error → fail-open allowed
    const err = await m.checkConsultQuota(makeSb(null, { message: 'boom' }), { perDayMax: 0 });
    expect(err.allowed).toBe(true);
  });
});

describe('FR-E1: drainSolomonOutbound (re-target on handoff — register dependency)', () => {
  it('idempotently re-targets unread old-session rows to the new session', async () => {
    const captured = {};
    const sb = { from: () => ({ update(p) { captured.update = p; return this; }, in(c, v) { captured.in = [c, v]; return this; }, is() { return this; }, gte() { return this; }, select: async () => ({ data: [{ id: 'r1' }, { id: 'r2' }], error: null }) }) };
    const r = await m.drainSolomonOutbound(sb, { newSessionId: 'new', oldSessionIds: ['old1', 'old2'] });
    expect(r.moved).toBe(2);
    expect(captured.update).toEqual({ target_session: 'new' });
    expect(captured.in[0]).toBe('target_session');
  });
  it('is a no-op with no old sessions / bad args (fail-open, never throws)', async () => {
    expect(await m.drainSolomonOutbound(null, {})).toEqual({ moved: 0 });
    expect(await m.drainSolomonOutbound({}, { newSessionId: 'n', oldSessionIds: [] })).toEqual({ moved: 0 });
  });
});

describe('FR-E1: drainInbox consumes consults via two-stage ACK (read_at only)', () => {
  it('surfaces consults/directives, warns on orphans, stamps read_at but NOT acknowledged_at', async () => {
    const seen = { update: null };
    const unread = [
      { id: 'a', payload: { kind: 'solomon_consult', body: 'q1' }, created_at: new Date().toISOString() },
      { id: 'b', payload: { kind: 'coordinator_alert', body: 'orphan' }, created_at: new Date().toISOString() }, // orphan
    ];
    const sb = {
      from: () => ({
        select: () => ({ eq: () => ({ is: () => ({ order: () => ({ limit: async () => ({ data: unread, error: null }) }) }) }) }),
        update(p) { seen.update = p; return { in: () => ({ is: async () => ({ data: null, error: null }) }) }; },
      }),
    };
    const logs = []; const warns = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
    const warn = vi.spyOn(console, 'warn').mockImplementation((...a) => warns.push(a.join(' ')));
    await m.drainInbox(sb, 'solomon-sess', { quiet: false });
    log.mockRestore(); warn.mockRestore();
    expect(seen.update).toHaveProperty('read_at');
    expect(seen.update).not.toHaveProperty('acknowledged_at'); // two-stage ACK
    expect(warns.join(' ')).toMatch(/orphan/i);                // orphan surfaced, not consumed
    expect(logs.join(' ')).toMatch(/consult/);
  });
});
