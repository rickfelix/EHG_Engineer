/**
 * SD-LEO-INFRA-COMMS-DELIVERY-CONTRACT-001 / FR-2 — typed kind, explicitly settable + validated at send.
 *
 * Re-scoped mid-EXEC from Solomon's original clause (c) ("untyped send REJECTED"): both
 * adam-advisory.cjs and solomon-advisory.cjs already unconditionally hardcode payload.kind on every
 * send today, so no row from either CLI is ever literally untyped — rejecting the ABSENCE of --kind
 * would have broken every existing production caller (none pass --kind today). The corrected design:
 * --kind is OPTIONAL (omitting it is byte-identical to pre-SD behavior); an EXPLICITLY-supplied value
 * must be a recognized kind (KNOWN_SEND_KINDS, sourced from lib/fleet/worker-status.cjs's
 * PAYLOAD_KINDS + DIRECTIVE_KINDS) or buildAdvisoryPayload's caller rejects the send.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const adam = require('../../scripts/adam-advisory.cjs');
const solomon = require('../../scripts/solomon-advisory.cjs');
const { PAYLOAD_KINDS, DIRECTIVE_KINDS } = require('../../lib/fleet/worker-status.cjs');

describe('adam-advisory.cjs buildAdvisoryPayload — FR-2 typed kind', () => {
  it('omitting kind is byte-identical to pre-SD behavior (defaults to adam_advisory)', () => {
    const p = adam.buildAdvisoryPayload({ body: 'hi', correlationId: 'c1' });
    expect(p.kind).toBe(PAYLOAD_KINDS.ADAM_ADVISORY);
  });
  it('an explicit recognized kind overrides the default', () => {
    const p = adam.buildAdvisoryPayload({ body: 'hi', correlationId: 'c1', kind: PAYLOAD_KINDS.COORDINATOR_REQUEST });
    expect(p.kind).toBe(PAYLOAD_KINDS.COORDINATOR_REQUEST);
  });
  it('KNOWN_SEND_KINDS is sourced from the shared PAYLOAD_KINDS + DIRECTIVE_KINDS constants (single SSOT)', () => {
    Object.values(PAYLOAD_KINDS).forEach((k) => expect(adam.KNOWN_SEND_KINDS.has(k)).toBe(true));
    DIRECTIVE_KINDS.forEach((k) => expect(adam.KNOWN_SEND_KINDS.has(k)).toBe(true));
    expect(adam.KNOWN_SEND_KINDS.has('totally_made_up_kind')).toBe(false);
  });
});

describe('solomon-advisory.cjs buildAdvisoryPayload — FR-2 typed kind (mirrors the Adam lane)', () => {
  it('omitting kind is byte-identical to pre-SD behavior (defaults to adam_advisory, reuses the advisory lane)', () => {
    const p = solomon.buildAdvisoryPayload({ body: 'hi', correlationId: 'c1' });
    expect(p.kind).toBe(PAYLOAD_KINDS.ADAM_ADVISORY);
  });
  it('an explicit recognized kind overrides the default', () => {
    const p = solomon.buildAdvisoryPayload({ body: 'hi', correlationId: 'c1', kind: PAYLOAD_KINDS.SOLOMON_CONSULT });
    expect(p.kind).toBe(PAYLOAD_KINDS.SOLOMON_CONSULT);
  });
  it('an ANSWER to a consult (replyTo set) always reuses the advisory lane, ignoring any supplied kind', () => {
    const p = solomon.buildAdvisoryPayload({ body: 'answer', correlationId: 'self', replyTo: 'consult-corr', kind: PAYLOAD_KINDS.SOLOMON_CONSULT });
    expect(p.kind).toBe(PAYLOAD_KINDS.ADAM_ADVISORY); // never solomon_consult for an answer -- terminal, not a new consult
  });
  it('KNOWN_SEND_KINDS matches adam-advisory.cjs exactly (same shared source, not a second hand-maintained list)', () => {
    expect(Array.from(solomon.KNOWN_SEND_KINDS).sort()).toEqual(Array.from(adam.KNOWN_SEND_KINDS).sort());
  });
});
