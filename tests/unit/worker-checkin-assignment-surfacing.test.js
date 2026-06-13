/**
 * SD-FDBK-FIX-WORKER-CHECK-SURFACES-001 — directed-assignment visibility pins.
 * Seam 2: classifyInboxMessage surfaces WORK_ASSIGNMENT regardless of idle.
 * Seam 1: resolveCheckin surfaces a pending WORK_ASSIGNMENT on the resume path
 *         without dropping the held claim.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { classifyInboxMessage } = require('../../scripts/hooks/coordination-inbox.cjs');
const { resolveCheckin } = require('../../scripts/worker-checkin.cjs');

describe('classifyInboxMessage — directed rows surface regardless of idle (seam 2)', () => {
  it('WORK_ASSIGNMENT surfaces (markRead:false) for a BUSY worker (isIdle:false)', () => {
    const v = classifyInboxMessage({ message_type: 'WORK_ASSIGNMENT', payload: {} }, { isIdle: false });
    expect(v).toEqual({ skip: false, markRead: false, markAck: false });
  });
  it('WORK_ASSIGNMENT still surfaces when idle', () => {
    const v = classifyInboxMessage({ message_type: 'WORK_ASSIGNMENT', payload: {} }, { isIdle: true });
    expect(v.markRead).toBe(false);
  });
  it('CLAIM_RELEASED / CLAIM_REMINDER also surface for a busy worker', () => {
    expect(classifyInboxMessage({ message_type: 'CLAIM_RELEASED', payload: {} }, { isIdle: false }).markRead).toBe(false);
    expect(classifyInboxMessage({ message_type: 'CLAIM_REMINDER', payload: {} }, { isIdle: false }).markRead).toBe(false);
  });
  it('a plain INFO notification still drains (unchanged default)', () => {
    const v = classifyInboxMessage({ message_type: 'INFO', payload: {} }, { isIdle: false });
    expect(v).toEqual({ skip: false, markRead: true, markAck: true });
  });
});

// resolveCheckin seam 1 — fake sb: session holds mySd; an unread WORK_ASSIGNMENT targets a
// different SD. The assignment must surface on the resume result without dropping the claim.
function fakeSb({ heldSd, assignmentSd }) {
  return {
    rpc: () => Promise.resolve({ data: { success: true }, error: null }),
    from(table) {
      const api = {
        _t: table, select() { return this; }, eq() { return this; }, gte() { return this; },
        order() { return this; }, limit() { return this; },
        maybeSingle() {
          if (table === 'claude_sessions') return Promise.resolve({ data: { metadata: { role: 'worker' }, sd_key: heldSd }, error: null });
          if (table === 'strategic_directives_v2') return Promise.resolve({ data: { status: 'in_progress' }, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        insert() { return Promise.resolve({ error: null }); },
        update() { return { eq() { return Promise.resolve({ error: null }); } }; },
      };
      return api;
    },
  };
}

describe('resolveCheckin — surface pending WORK_ASSIGNMENT on resume (seam 1)', () => {
  it('held claim + WORK_ASSIGNMENT for a different SD → action=resume, claim kept, assignment surfaced', async () => {
    const heldSd = 'SD-CURRENT-001';
    const assignmentSd = 'SD-REDIRECT-002';
    const sb = fakeSb({ heldSd, assignmentSd });
    // Stub the message-pull module method used inside resolveCheckin.
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [{ id: 'msg-1', message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: assignmentSd } }];
    try {
      const res = await resolveCheckin(sb, 'sess-busy', { getCoordinator: async () => null });
      expect(res.action).toBe('resume');
      expect(res.sd).toBe(heldSd); // claim NOT dropped (never-strand)
      expect(res.pending_work_assignment?.sd).toBe(assignmentSd);
      expect(res.message).toMatch(/pending/i);
    } finally {
      ws.getMessagesForSession = orig;
    }
  });

  it('held claim + NO assignment → plain resume (unchanged)', async () => {
    const sb = fakeSb({ heldSd: 'SD-CURRENT-001', assignmentSd: null });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [];
    try {
      const res = await resolveCheckin(sb, 'sess-busy', { getCoordinator: async () => null });
      expect(res.action).toBe('resume');
      expect(res.pending_work_assignment).toBeUndefined();
    } finally {
      ws.getMessagesForSession = orig;
    }
  });
});
