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
const { resolveConsultOriginator, resolveSolomonAdvisoryTarget, SOLOMON_CONSULT_KIND } = require('../../scripts/solomon-advisory.cjs');

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
    const sb = fakeSb({ byId: { sender_session: 'coordinator-sess', payload: { origin_session: ADAM_SESSION } } });
    expect(await resolveConsultOriginator(sb, CONSULT_ROW_ID)).toBe(ADAM_SESSION);
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
