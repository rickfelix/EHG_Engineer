// Tests for SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001-B
// scripts/adam-advisory.cjs — Adam advisory clean-lane writer.

import { describe, it, expect } from 'vitest';

const { buildAdvisoryPayload, drainReplies, resolveScopeForSend } = require('./adam-advisory.cjs');
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

  // SD-LEO-INFRA-RESILIENT-SYMMETRIC-ADAM-001 FR-3 (R2 decoupling): correlation_id makes an
  // advisory REPLYABLE and is carried whenever present; expects_reply is the DISTINCT
  // "awaiting a sync reply" intent, set ONLY in request mode. Conflating them made every
  // fire-and-forget send falsely advertise Reply?=yes in printAdamInbox.
  it('FR-3: send-mode carries correlation_id (replyable) but NOT expects_reply', () => {
    const p = buildAdvisoryPayload({ body: 'q?', senderCallsign: 'Adam', repo: '/r', correlationId: 'corr-9' });
    expect(p.correlation_id).toBe('corr-9');
    expect(p.expects_reply).toBeUndefined();
    expect(p.signal_type).toBeUndefined();
  });

  it('FR-3: request-mode sets BOTH correlation_id and expects_reply', () => {
    const p = buildAdvisoryPayload({ body: 'q?', senderCallsign: 'Adam', repo: '/r', correlationId: 'corr-9', expectsReply: true });
    expect(p.correlation_id).toBe('corr-9');
    expect(p.expects_reply).toBe(true);
    expect(p.signal_type).toBeUndefined(); // still no signal_type even in request mode
  });
});

describe('FR-4: durable reply reader export', () => {
  it('exports drainReplies for the persistent coordinator_reply reader', () => {
    expect(typeof drainReplies).toBe('function');
  });
});

// SD-LEO-INFRA-ADAM-PREFERENCE-LEARNING-001 FR-1 — scope-tagged surfacing.
describe('FR-1: scope-tagged advisory payload', () => {
  it('emits scope_key / reuse_class / applies_to_scopes when provided', () => {
    const p = buildAdvisoryPayload({ body: 'stale heartbeat', senderCallsign: 'Adam', repo: '/r', scopeKey: 'harness', reuseClass: 'scope_local', appliesToScopes: ['harness'] });
    expect(p.scope_key).toBe('harness');
    expect(p.reuse_class).toBe('scope_local');
    expect(p.applies_to_scopes).toEqual(['harness']);
  });

  it('prefixes the body with [<scope_key>] when a scope is present', () => {
    const p = buildAdvisoryPayload({ body: 'venture X stalled at S17', senderCallsign: 'Adam', repo: '/r', scopeKey: 'venture:abc-123' });
    expect(p.body).toBe('[venture:abc-123] venture X stalled at S17');
  });

  it('is fully backward-compatible: NO scope fields and NO body prefix when scope is absent', () => {
    const p = buildAdvisoryPayload({ body: 'plain advisory', senderCallsign: 'Adam', repo: '/r' });
    expect(p.scope_key).toBeUndefined();
    expect(p.reuse_class).toBeUndefined();
    expect(p.applies_to_scopes).toBeUndefined();
    expect(p.body).toBe('plain advisory'); // unchanged
  });

  it('omits applies_to_scopes when given an empty array (additive, no empty keys)', () => {
    const p = buildAdvisoryPayload({ body: 'x', scopeKey: 'platform', appliesToScopes: [] });
    expect(p.scope_key).toBe('platform');
    expect(p.applies_to_scopes).toBeUndefined();
  });

  it('exports resolveScopeForSend and it is fail-soft (returns {} when scope enumeration throws)', async () => {
    expect(typeof resolveScopeForSend).toBe('function');
    // A supabase stub whose query path throws — resolveScopeForSend must swallow it and
    // return {} so the advisory still sends untagged (never blocks a send on scope failure).
    const throwingSupabase = { from() { throw new Error('db down'); } };
    const r = await resolveScopeForSend(throwingSupabase, '/some/repo');
    expect(r).toEqual({});
  });
});
