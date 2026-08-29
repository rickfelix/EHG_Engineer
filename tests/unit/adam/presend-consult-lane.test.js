/**
 * SD-LEO-INFRA-SOLOMON-CONSULT-CANNOT-DELIVER-001 — FR-6 / FR-1 / FR-2 lane guards.
 *
 * TS-6 is the test that COULD NOT EXIST before this SD: the lane lived inline in
 * scripts/adam-advisory.cjs main() (:1085-1133), which is not exported and is guarded by
 * `require.main === module`. That is precisely how an 8s bounded wait sat on a 100% failure rate
 * (197/197 duty=pre_send_consult ledger rows over 30d were timeout-proceed) with a green suite.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { runPreSendConsultLane } = require('../../../lib/adam/presend-consult-lane.cjs');

/** Real performBoundedConsult so these are integration-ish over the actual FR-7 branch logic. */
async function realPerformBoundedConsult(gateInput, consultDeps) {
  const mod = await import('../../../lib/adam/should-consult-solomon.js');
  return mod.performBoundedConsult(gateInput, consultDeps);
}

function makeDeps(overrides = {}) {
  const inserted = [];
  const ledger = [];
  return {
    inserted,
    ledger,
    deps: {
      evaluatePreSendConsult: () => ({ action: 'consult-then-send' }),
      performBoundedConsult: realPerformBoundedConsult,
      getActiveSolomonId: async () => 'solomon-123',
      buildSolomonConsultPayload: (args) => ({
        kind: 'solomon_consult',
        correlation_id: args.correlationId,
        reply_class: args.isAwait ? 'live-handshake' : 'reply-needed',
        ...(args.consultPurpose ? { consult_purpose: args.consultPurpose } : {}),
        ...(args.isAwait ? {} : { reply_expected_by: 'T+2h' }),
        body: args.body,
      }),
      buildPreSendConsultBody: (b) => `[PRE-SEND CONSULT] ${b}`,
      insertCoordinationRow: async (row, opts) => { inserted.push({ row, opts }); },
      recordLedger: async (l) => { ledger.push(l); },
      randomUUID: () => 'corr-fixed-001',
      ...overrides,
    },
  };
}

const INPUT = {
  subject: 'consequential thing',
  body: 'the body',
  senderCallsign: 'Adam',
  sessionId: 'adam-sess',
  repo: 'C:/repo',
  expiresAt: '2026-07-26T00:00:00Z',
};

describe('runPreSendConsultLane — FR-1 non-blocking + FR-2 discriminator', () => {
  it('TS-6: the lane CANNOT block — it never awaits a coordinator reply', async () => {
    // Structural guarantee: awaitCoordinatorReply is not among the lane's deps at all. Injecting
    // one that throws proves the lane has no path that reaches it.
    const { deps, ledger } = makeDeps({
      awaitCoordinatorReply: () => { throw new Error('lane must never await a reply'); },
    });
    const out = await runPreSendConsultLane(INPUT, deps);

    expect(out.action).toBe('proceed');       // no verdict yet -> ledger arm, NOT 'send'
    expect(out.pendingReconcile).toBe(true);
    expect(out.correlationId).toBe('corr-fixed-001');
    expect(ledger).toHaveLength(1);
    expect(ledger[0].detail).toBe('solomon-consult-async::pending-reconcile');
    expect(ledger[0].remediation_ref).toBe('corr-fixed-001'); // the reconciliation anchor
  });

  it('FR-1: emits a DURABLE reply-needed consult row before returning', async () => {
    const { deps, inserted } = makeDeps();
    await runPreSendConsultLane(INPUT, deps);

    expect(inserted).toHaveLength(1);
    const { row, opts } = inserted[0];
    expect(row.sender_session).toBe('adam-sess');
    expect(row.target_session).toBe('solomon-123');
    expect(opts).toMatchObject({ targetRoleHint: 'solomon' });
    // reply-needed (NOT live-handshake) is what makes a late verdict expected rather than orphaned.
    expect(row.payload.reply_class).toBe('reply-needed');
    expect(row.payload.reply_expected_by).toBeTruthy();
  });

  it('FR-2: the consult carries a STRUCTURAL pre_send discriminator, not just a body prefix', async () => {
    const { deps, inserted } = makeDeps();
    await runPreSendConsultLane(INPUT, deps);
    expect(inserted[0].row.payload.consult_purpose).toBe('pre_send');
    // The body prefix still exists, but must no longer be the only way to identify the lane.
    expect(inserted[0].row.payload.body).toContain('[PRE-SEND CONSULT]');
  });

  it('falls back to broadcast when no live Solomon, and survives a lookup throw', async () => {
    const { deps, inserted } = makeDeps({
      getActiveSolomonId: async () => { throw new Error('lookup down'); },
    });
    const out = await runPreSendConsultLane(INPUT, deps);
    expect(inserted[0].row.target_session).toBe('broadcast-solomon');
    expect(out.action).toBe('proceed');
  });

  it('skips cleanly when the gate does not call for a consult', async () => {
    const { deps, inserted, ledger } = makeDeps({
      evaluatePreSendConsult: () => ({ action: 'send' }),
    });
    const out = await runPreSendConsultLane(INPUT, deps);
    expect(out).toEqual({ action: 'skip', reason: 'gate-not-triggered' });
    expect(inserted).toHaveLength(0);
    expect(ledger).toHaveLength(0);
  });

  it('a chairman-targeted send still holds rather than silently proceeding', async () => {
    const { deps, ledger } = makeDeps();
    const out = await runPreSendConsultLane({ ...INPUT, isChairmanTargeted: true }, deps);
    expect(out.action).toBe('hold-and-surface');
    expect(ledger).toHaveLength(0); // chairman branch deliberately writes no ledger row
  });

  // ── QF-20260727-709 ──────────────────────────────────────────────────────────────────────────
  // The lane must FORWARD the addressee, not merely tolerate one. Note the default fake above is
  // `(b) => ...` — single-arg, so it silently discards a second argument. A test written against
  // that fake would pass whether or not the lane threads the value, which is precisely the shape
  // of the bug this QF exists to fix. These use a CAPTURING fake instead.
  it('forwards the resolved addressee into the consult envelope', async () => {
    const seen = [];
    const { deps, inserted } = makeDeps({
      buildPreSendConsultBody: (b, addressee) => {
        seen.push(addressee);
        return `[PRE-SEND CONSULT -> ${addressee?.role} ${String(addressee?.sessionId).slice(0, 8)}] ${b}`;
      },
    });
    const addressee = { role: 'coordinator', sessionId: '1449a046-0f83-4b8e-b6f2-ad26510d0c05' };
    await runPreSendConsultLane({ ...INPUT, addressee }, deps);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(addressee);            // the value ARRIVED, not just the parameter slot
    expect(inserted[0].row.payload.body).toContain('coordinator');
    expect(inserted[0].row.payload.body).toContain('1449a046');
  });

  // ── SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-1) ──────────────────────────────────────────
  // Readback-verify the consult insert: previously insertCoordinationRow's return value was
  // discarded entirely, so a genuinely successful insert and a silently failed one were
  // indistinguishable to this lane's caller.
  it('FR-1: requests select:id/single:true on the insert and forwards the inserted row id as consultRowId', async () => {
    // VALIDATION sub-agent finding V-2 (MEDIUM, PLAN_VERIFICATION): the first version of this
    // test captured `opts` into the stub's return value (__opts) but never asserted on it -- drop
    // {select:'id', single:true} entirely from the real insertCoordinationRow call and production
    // gets {data:null} (no RETURNING clause), consult_row_id stays null on every hold forever, and
    // this exact test still passed. `capturedOpts` is asserted directly below, not smuggled through
    // the return value.
    let capturedOpts = null;
    const { deps } = makeDeps({
      insertCoordinationRow: async (row, opts) => { capturedOpts = opts; return { data: { id: 'row-xyz-789' }, error: null }; },
      verifyConsultReadback: async () => ({ verdict: 'PASS' }),
    });
    const out = await runPreSendConsultLane({ ...INPUT, isChairmanTargeted: true }, deps);
    expect(out.action).toBe('hold-and-surface');
    expect(out.consultRowId).toBe('row-xyz-789');
    expect(capturedOpts).toMatchObject({ targetRoleHint: 'solomon', select: 'id', single: true });
  });

  it('FR-1: an insert error is readback-verified as a failure -- consultRowId is absent (never a stale/wrong id), and the lane still does not throw (non-blocking contract preserved)', async () => {
    const { deps } = makeDeps({
      insertCoordinationRow: async () => ({ data: null, error: { message: 'insert boom' } }),
    });
    const out = await runPreSendConsultLane({ ...INPUT, isChairmanTargeted: true }, deps);
    expect(out.action).toBe('hold-and-surface');
    // performBoundedConsult's hold-and-surface arm omits the key on a falsy value -- same
    // omit-if-falsy convention already used for correlationId, not a null placeholder.
    expect(out.consultRowId).toBeUndefined();
  });

  it('FR-1: a legacy insertCoordinationRow that returns nothing (pre-fix shape) degrades gracefully -- consultRowId absent, never throws', async () => {
    const { deps } = makeDeps({
      insertCoordinationRow: async () => undefined,
    });
    const out = await runPreSendConsultLane({ ...INPUT, isChairmanTargeted: true }, deps);
    expect(out.action).toBe('hold-and-surface');
    expect(out.consultRowId).toBeUndefined();
  });

  // ── QF-20260828-255 ─────────────────────────────────────────────────────────────────────────
  // Solomon advisory f02c00e7 / held-send 5ce0c4b5: "held pending Solomon" with NO consult row
  // queued = a hold that can never resolve. The lane must independently verify (same action) that
  // the row it just inserted actually exists, not merely trust insertCoordinationRow's own return.
  it('QF-20260828-255: a genuinely-inserted row that ALSO reads back is marked consultRowVerified:true', async () => {
    const { deps } = makeDeps({
      insertCoordinationRow: async () => ({ data: { id: 'row-verified-1' }, error: null }),
      verifyConsultReadback: async (id) => { expect(id).toBe('row-verified-1'); return { verdict: 'PASS' }; },
    });
    const out = await runPreSendConsultLane({ ...INPUT, isChairmanTargeted: true }, deps);
    expect(out.consultRowVerified).toBe(true);
  });

  it('QF-20260828-255: a row id that FAILS independent readback is marked consultRowVerified:false, loud-logged, and the lane still does not throw', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = makeDeps({
      insertCoordinationRow: async () => ({ data: { id: 'row-ghost-1' }, error: null }),
      verifyConsultReadback: async () => { throw new Error('expected exactly 1 row, got 0'); },
    });
    const out = await runPreSendConsultLane({ ...INPUT, isChairmanTargeted: true }, deps);
    expect(out.action).toBe('hold-and-surface'); // still holds -- fail LOUD, not fail silent-and-proceed
    expect(out.consultRowVerified).toBe(false);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('QF-20260828-255'));
    errSpy.mockRestore();
  });

  it('QF-20260828-255: a missing consultRowId is marked consultRowVerified:false and loud-logged without ever calling the readback checker', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const readbackSpy = vi.fn();
    const { deps } = makeDeps({
      insertCoordinationRow: async () => ({ data: null, error: { message: 'insert boom' } }),
      verifyConsultReadback: readbackSpy,
    });
    const out = await runPreSendConsultLane({ ...INPUT, isChairmanTargeted: true }, deps);
    expect(out.consultRowVerified).toBe(false);
    expect(readbackSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('QF-20260828-255'));
    errSpy.mockRestore();
  });

  it('QF-20260828-255: a NON-chairman-targeted consult never calls the readback checker (only the hold-capable path needs it)', async () => {
    const readbackSpy = vi.fn();
    const { deps } = makeDeps({
      insertCoordinationRow: async () => ({ data: { id: 'row-irrelevant' }, error: null }),
      verifyConsultReadback: readbackSpy,
    });
    await runPreSendConsultLane(INPUT, deps); // isChairmanTargeted defaults to false
    expect(readbackSpy).not.toHaveBeenCalled();
  });

  it('omitting the addressee passes undefined rather than inventing one', async () => {
    // The degrade path: no addressee resolved upstream must not fabricate a plausible-looking one,
    // because a WRONG addressee is worse than none — it would re-point the pronouns confidently.
    const seen = [];
    const { deps } = makeDeps({
      buildPreSendConsultBody: (b, addressee) => { seen.push(addressee); return `[PRE-SEND CONSULT] ${b}`; },
    });
    await runPreSendConsultLane({ ...INPUT }, deps);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeNull();
  });
});
