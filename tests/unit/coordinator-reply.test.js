/**
 * Unit tests for scripts/coordinator-reply.cjs buildReplyPayload.
 * SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C: sender-stamped reply_class.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { buildReplyPayload } = require('../../scripts/coordinator-reply.cjs');

describe('buildReplyPayload — reply_class', () => {
  it('a coordinator reply is always fire-and-forget (terminal, no reply-to-reply chains)', () => {
    const p = buildReplyPayload({ correlationId: 'c1', body: 'ack', coordinatorSession: 'coord-1' });
    expect(p.reply_class).toBe('fire-and-forget');
  });
  it('carries the existing reply contract unchanged (kind, reply_to, correlation_id, sender)', () => {
    const p = buildReplyPayload({ correlationId: 'c2', body: 'ack', coordinatorSession: 'coord-1' });
    expect(p.kind).toBe('coordinator_reply');
    expect(p.reply_to).toBe('c2');
    expect(p.correlation_id).toBe('c2');
    expect(p.sender).toBe('coord-1');
  });
});
