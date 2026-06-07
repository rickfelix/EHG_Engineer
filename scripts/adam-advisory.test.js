// Tests for SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001-B
// scripts/adam-advisory.cjs — Adam advisory clean-lane writer.

import { describe, it, expect } from 'vitest';

const { buildAdvisoryPayload } = require('./adam-advisory.cjs');
const { PAYLOAD_KINDS } = require('../lib/fleet/worker-status.cjs');

describe('FR-2: PAYLOAD_KINDS registry', () => {
  it('registers adam_advisory as the canonical discriminator', () => {
    expect(PAYLOAD_KINDS.ADAM_ADVISORY).toBe('adam_advisory');
  });
});

describe('buildAdvisoryPayload', () => {
  it('carries kind=adam_advisory and NEVER signal_type/intent_action (clean lane)', () => {
    const p = buildAdvisoryPayload({ body: 'venture X stalled at S17', senderCallsign: 'Adam', repo: '/r' });
    expect(p.kind).toBe('adam_advisory');
    expect(p.signal_type).toBeUndefined();   // friction router filters signal_type IS NOT NULL → excluded
    expect(p.intent_action).toBeUndefined(); // intent sweep ignores it
    expect(p.sender_callsign).toBe('Adam');
    expect(p.body).toBe('venture X stalled at S17');
  });

  it('redacts secrets and is correlation-free for fire-and-forget send', () => {
    const p = buildAdvisoryPayload({ body: 'token ghp_' + 'a'.repeat(36), senderCallsign: null, repo: '/r' });
    expect(p.body).toContain('[REDACTED:GH_TOKEN]');
    expect(p.correlation_id).toBeUndefined();
    expect(p.expects_reply).toBeUndefined();
  });

  it('adds correlation_id + expects_reply in request mode', () => {
    const p = buildAdvisoryPayload({ body: 'q?', senderCallsign: 'Adam', repo: '/r', correlationId: 'corr-9' });
    expect(p.correlation_id).toBe('corr-9');
    expect(p.expects_reply).toBe(true);
    expect(p.signal_type).toBeUndefined(); // still no signal_type even in request mode
  });
});
