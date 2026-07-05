/**
 * Direct Adam<->Solomon channel — SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-B.
 *
 * Graduates ADAM_SOLOMON_TWOWAY_V1 from a doc-only placeholder to a real, additive, flag-gated
 * 1-hop lane alongside the existing (unconditional) coordinator-relay path. These tests prove the
 * exact routing decision a live exchange would make, in both directions, under every combination
 * of {flag on/off} x {live peer present/absent} — the deterministic round-trip proof the SD's
 * "verify with a live exchange" requirement calls for (a live external session is not
 * CI-deterministic; this pins the identical decision logic that governs one).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveAdamAdvisoryTarget, buildAdvisoryPayload: buildAdamPayload, classifyDirectTarget } = require('../../scripts/adam-advisory.cjs');
const { resolveSolomonAdvisoryTarget, buildAdvisoryPayload: buildSolomonPayload } = require('../../scripts/solomon-advisory.cjs');
const { isAdamSolomonTwoWayV1Enabled } = require('../../lib/coordinator/resolve.cjs');
const { assertValidTarget } = require('../../lib/coordinator/dispatch.cjs');

describe('isAdamSolomonTwoWayV1Enabled — flag gate correctness', () => {
  // QF-20260705-488 (chairman-directed): default flipped ON — the OFF default forced a
  // hand-relay of consult answer d7f5401c. Off ONLY on the explicit 'off' kill switch.
  it('enabled by default; disabled only by exactly "off"', () => {
    const prev = process.env.ADAM_SOLOMON_TWOWAY_V1;
    try {
      process.env.ADAM_SOLOMON_TWOWAY_V1 = 'on';
      expect(isAdamSolomonTwoWayV1Enabled()).toBe(true);
      process.env.ADAM_SOLOMON_TWOWAY_V1 = 'true';
      expect(isAdamSolomonTwoWayV1Enabled()).toBe(true);
      delete process.env.ADAM_SOLOMON_TWOWAY_V1;
      expect(isAdamSolomonTwoWayV1Enabled()).toBe(true);
      process.env.ADAM_SOLOMON_TWOWAY_V1 = 'off';
      expect(isAdamSolomonTwoWayV1Enabled()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.ADAM_SOLOMON_TWOWAY_V1;
      else process.env.ADAM_SOLOMON_TWOWAY_V1 = prev;
    }
  });
});

describe('broadcast-adam sentinel — dispatch parity for the new reverse leg', () => {
  it('validates without a DB query (short-circuits like broadcast-solomon)', async () => {
    // Passing supabase=null proves the sentinel path never touches the DB — a live-session
    // lookup on a null client would throw.
    await expect(assertValidTarget(null, 'broadcast-adam')).resolves.toEqual({ ok: true, kind: 'sentinel' });
  });
});

describe('resolveAdamAdvisoryTarget (Adam -> Solomon)', () => {
  it('TS-3: flag on + live Solomon -> direct to the live session', () => {
    const r = resolveAdamAdvisoryTarget({ toSolomon: true, flagOn: true, coordinatorId: 'coord-1', solomonId: 'solomon-live-1' });
    expect(r).toEqual({ target: 'solomon-live-1', via: 'direct' });
  });

  it('TS-4: flag on + no live Solomon -> broadcast-solomon fallback, still direct', () => {
    const r = resolveAdamAdvisoryTarget({ toSolomon: true, flagOn: true, coordinatorId: 'coord-1', solomonId: null });
    expect(r).toEqual({ target: 'broadcast-solomon', via: 'direct' });
  });

  it('TS-5a: flag off (--to solomon requested but gate closed) -> unchanged coordinator-relay default', () => {
    const r = resolveAdamAdvisoryTarget({ toSolomon: true, flagOn: false, coordinatorId: 'coord-1', solomonId: 'solomon-live-1' });
    expect(r).toEqual({ target: 'coord-1', via: null });
  });

  it('TS-5b: --to omitted entirely (flag on or off) -> unchanged coordinator-relay default', () => {
    expect(resolveAdamAdvisoryTarget({ toSolomon: false, flagOn: true, coordinatorId: 'coord-1', solomonId: 'solomon-live-1' }))
      .toEqual({ target: 'coord-1', via: null });
    expect(resolveAdamAdvisoryTarget({ toSolomon: false, flagOn: false, coordinatorId: 'coord-1', solomonId: null }))
      .toEqual({ target: 'coord-1', via: null });
  });

  it('no live coordinator either -> broadcast-coordinator fallback (pre-existing behavior, untouched)', () => {
    const r = resolveAdamAdvisoryTarget({ toSolomon: false, flagOn: false, coordinatorId: null, solomonId: null });
    expect(r).toEqual({ target: 'broadcast-coordinator', via: null });
  });
});

describe('resolveSolomonAdvisoryTarget (Solomon -> Adam, the previously-nonexistent reverse leg)', () => {
  it('TS-6: flag on + live Adam -> direct to the live session', () => {
    const r = resolveSolomonAdvisoryTarget({ toAdam: true, flagOn: true, coordinatorId: 'coord-1', adamId: 'adam-live-1' });
    expect(r).toEqual({ target: 'adam-live-1', via: 'direct' });
  });

  it('TS-7: flag on + no live Adam -> broadcast-adam fallback, still direct', () => {
    const r = resolveSolomonAdvisoryTarget({ toAdam: true, flagOn: true, coordinatorId: 'coord-1', adamId: null });
    expect(r).toEqual({ target: 'broadcast-adam', via: 'direct' });
  });

  it('TS-8a: flag off (--to adam requested but gate closed) -> unchanged coordinator-relay default', () => {
    const r = resolveSolomonAdvisoryTarget({ toAdam: true, flagOn: false, coordinatorId: 'coord-1', adamId: 'adam-live-1' });
    expect(r).toEqual({ target: 'coord-1', via: null });
  });

  it('TS-8b: --to omitted entirely -> unchanged coordinator-relay default', () => {
    expect(resolveSolomonAdvisoryTarget({ toAdam: false, flagOn: true, coordinatorId: 'coord-1', adamId: 'adam-live-1' }))
      .toEqual({ target: 'coord-1', via: null });
  });
});

describe('payload.via is additive-only (byte-unaffected default path)', () => {
  it('buildAdvisoryPayload (Adam) omits payload.via entirely when via is not passed', () => {
    const p = buildAdamPayload({ body: 'hi', senderCallsign: 'Delta', repo: '/x', correlationId: 'c1' });
    expect('via' in p).toBe(false);
  });
  it('buildAdvisoryPayload (Adam) stamps payload.via="direct" when passed', () => {
    const p = buildAdamPayload({ body: 'hi', senderCallsign: 'Delta', repo: '/x', correlationId: 'c1', via: 'direct' });
    expect(p.via).toBe('direct');
  });
  it('buildAdvisoryPayload (Solomon) omits payload.via entirely when via is not passed', () => {
    const p = buildSolomonPayload({ body: 'hi', senderCallsign: 'Solomon', repo: '/x', correlationId: 'c1' });
    expect('via' in p).toBe(false);
  });
  it('buildAdvisoryPayload (Solomon) stamps payload.via="direct" when passed', () => {
    const p = buildSolomonPayload({ body: 'hi', senderCallsign: 'Solomon', repo: '/x', correlationId: 'c1', via: 'direct' });
    expect(p.via).toBe('direct');
  });
});

// QF-20260703-964 (R1): payload.addressee is the WRITTEN addressee, stamped alongside
// target_session, so a reader (and the dispatch choke-point's mismatch WARN) can see who this
// was explicitly sent to without re-deriving it from the resolved UUID.
describe('payload.addressee is additive-only (QF-20260703-964)', () => {
  it('buildAdvisoryPayload (Adam) omits payload.addressee entirely when not passed', () => {
    const p = buildAdamPayload({ body: 'hi', senderCallsign: 'Delta', repo: '/x', correlationId: 'c1' });
    expect('addressee' in p).toBe(false);
  });
  it('buildAdvisoryPayload (Adam) stamps the written addressee when passed', () => {
    const p = buildAdamPayload({ body: 'hi', senderCallsign: 'Delta', repo: '/x', correlationId: 'c1', addressee: 'solomon' });
    expect(p.addressee).toBe('solomon');
  });
});

// SD-LEO-INFRA-CLOSE-ADAM-SOLOMON-001: adversarial-review finding, deep-tier PR review
// (QF-20260703-964). This exact decision shipped un-unit-tested and silently admitted a
// SENTINEL_TARGETS value (broadcast-solomon) as a "direct target", completely bypassing the
// ADAM_SOLOMON_TWOWAY_V1 gate --to solomon is deliberately subject to. This test would have
// caught it.
describe('classifyDirectTarget — sentinels and reserved words are NEVER a direct target', () => {
  it('a SENTINEL_TARGETS value (broadcast-solomon) is blocked, not admitted as direct', () => {
    const r = classifyDirectTarget('broadcast-solomon', false);
    expect(r.isBlockedPeerWord).toBe(true);
    expect(r.isDirectTarget).toBe(false);
  });
  it('every SENTINEL_TARGETS value is blocked (broadcast, broadcast-coordinator, broadcast-adam)', () => {
    for (const s of ['broadcast', 'broadcast-coordinator', 'broadcast-adam']) {
      const r = classifyDirectTarget(s, false);
      expect(r.isBlockedPeerWord).toBe(true);
      expect(r.isDirectTarget).toBe(false);
    }
  });
  it('RESERVED_PEER_WORDS (coordinator, adam) are still blocked (regression)', () => {
    for (const w of ['coordinator', 'adam']) {
      const r = classifyDirectTarget(w, false);
      expect(r.isBlockedPeerWord).toBe(true);
      expect(r.isDirectTarget).toBe(false);
    }
  });
  it('a raw session_id (not a keyword, not a sentinel) IS a direct target', () => {
    const r = classifyDirectTarget('0f8d45d8-9531-4ab8-a1b9-6961c405e1ec', false);
    expect(r.isBlockedPeerWord).toBe(false);
    expect(r.isDirectTarget).toBe(true);
  });
  it('"solomon" itself is neither blocked nor a direct target (handled by its own dedicated gate)', () => {
    const r = classifyDirectTarget('solomon', false);
    expect(r.isBlockedPeerWord).toBe(false);
    expect(r.isDirectTarget).toBe(false);
  });
  it('a relay-class peer is neither blocked nor a direct target (handled by its own enqueue path)', () => {
    const r = classifyDirectTarget('eva', true);
    expect(r.isBlockedPeerWord).toBe(false);
    expect(r.isDirectTarget).toBe(false);
  });
  it('null peerArg (no --to flag) is neither blocked nor a direct target', () => {
    const r = classifyDirectTarget(null, false);
    expect(r.isBlockedPeerWord).toBe(false);
    expect(r.isDirectTarget).toBe(false);
  });
});
