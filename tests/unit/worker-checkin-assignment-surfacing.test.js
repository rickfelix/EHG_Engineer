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
const { resolveCheckin, extractDirectedSd } = require('../../scripts/worker-checkin.cjs');

describe('classifyInboxMessage — WORK_ASSIGNMENT surfaces regardless of idle (seam 2)', () => {
  it('WORK_ASSIGNMENT surfaces (markRead:false) for a BUSY worker (isIdle:false)', () => {
    const v = classifyInboxMessage({ message_type: 'WORK_ASSIGNMENT', payload: {} }, { isIdle: false });
    expect(v).toEqual({ skip: false, markRead: false, markAck: false });
  });
  it('WORK_ASSIGNMENT still surfaces when idle', () => {
    const v = classifyInboxMessage({ message_type: 'WORK_ASSIGNMENT', payload: {} }, { isIdle: true });
    expect(v.markRead).toBe(false);
  });
  it('a plain INFO notification is now READ-ONLY drained (ack withheld for /checkin delivery)', () => {
    // SD-LEO-INFRA-WORKER-INBOX-PUSH-DELIVERY-001: coordinator INFO push is delivered by the /checkin
    // loop (coordinator_messages[]), so the poll withholds acknowledged_at (read_at=DELIVERED only).
    const v = classifyInboxMessage({ message_type: 'INFO', payload: {} }, { isIdle: false });
    expect(v).toEqual({ skip: false, markRead: true, markAck: false });
  });
});

describe('classifyInboxMessage — advisory types keep the idle gate (finding #1)', () => {
  // CLAIM_RELEASED/CLAIM_REMINDER have no worker-side ack/closure path, so a BUSY worker must
  // drain-on-display (else they re-surface forever + perpetually feed the coordinator's
  // UNDELIVERED-OUTBOUND alert with no terminal event). They still surface for an IDLE worker.
  for (const t of ['CLAIM_RELEASED', 'CLAIM_REMINDER']) {
    it(`${t} surfaces when idle`, () => {
      expect(classifyInboxMessage({ message_type: t, payload: {} }, { isIdle: true }).markRead).toBe(false);
    });
    it(`${t} DRAINS for a busy worker (no eternal re-surface)`, () => {
      expect(classifyInboxMessage({ message_type: t, payload: {} }, { isIdle: false }))
        .toEqual({ skip: false, markRead: true, markAck: true });
    });
  }
});

describe('extractDirectedSd — structured directed fields only (finding #2)', () => {
  it('returns assigned_sd when present', () => {
    expect(extractDirectedSd({ payload: { assigned_sd: 'SD-X-001' } })).toBe('SD-X-001');
  });
  it('returns sd_key when present', () => {
    expect(extractDirectedSd({ payload: { sd_key: 'SD-Y-002' } })).toBe('SD-Y-002');
  });
  it('returns null for the sweep advisory shape {available_sds, current_sd}', () => {
    expect(extractDirectedSd({ payload: { available_sds: ['SD-OTHER-003'], current_sd: 'SD-MINE-001' } })).toBe(null);
  });
  it('returns null for a free-text/empty payload (no structured directed field)', () => {
    expect(extractDirectedSd({ payload: {}, subject: 'work SD-Z-004 available' })).toBe(null);
  });
});

// resolveCheckin seam 1 — fake sb: session holds mySd; an unread WORK_ASSIGNMENT targets a
// different SD. The assignment must surface on the resume result without dropping the claim.
function fakeSb({ heldSd, assignmentSd, windDown }) {
  return {
    rpc: () => Promise.resolve({ data: { success: true }, error: null }),
    from(table) {
      const api = {
        _t: table, select() { return this; }, eq() { return this; }, gte() { return this; },
        order() { return this; }, limit() { return this; },
        maybeSingle() {
          if (table === 'claude_sessions') return Promise.resolve({ data: { metadata: { role: 'worker', ...(windDown ? { wind_down: windDown } : {}) }, sd_key: heldSd }, error: null });
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

  // SD-LEO-INFRA-WORKER-WINDDOWN-SURVEY-001 (b): the prior wind-down captured by the Stop hook
  // (claude_sessions.metadata.wind_down) is surfaced as base.prior_wind_down at re-engage.
  it('surfaces prior_wind_down from metadata.wind_down at re-engage', async () => {
    const wind = { reason: 'no_claim_idle', at: '2026-06-23T07:00:00.000Z', had_claim: false };
    const sb = fakeSb({ heldSd: 'SD-CURRENT-001', assignmentSd: null, windDown: wind });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [];
    try {
      const res = await resolveCheckin(sb, 'sess-busy', { getCoordinator: async () => null });
      expect(res.prior_wind_down).toEqual(wind);
    } finally {
      ws.getMessagesForSession = orig;
    }
  });

  it('prior_wind_down is null when no wind_down was recorded', async () => {
    const sb = fakeSb({ heldSd: 'SD-CURRENT-001', assignmentSd: null });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [];
    try {
      const res = await resolveCheckin(sb, 'sess-busy', { getCoordinator: async () => null });
      expect(res.prior_wind_down).toBe(null);
    } finally {
      ws.getMessagesForSession = orig;
    }
  });

  // finding #2 regression: the stale-session-sweep sends EVERY busy worker a generic
  // "next work available" WORK_ASSIGNMENT with payload {available_sds, current_sd} and NO
  // assigned_sd/sd_key. This is a queue pointer, NOT a directed redirect — it must NOT be
  // surfaced as a pending_work_assignment (else every busy worker is told to claim available_sds[0]).
  it('held claim + sweep advisory ({available_sds, current_sd}) → plain resume, NO pending assignment', async () => {
    const heldSd = 'SD-CURRENT-001';
    const sb = fakeSb({ heldSd, assignmentSd: null });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [{
      id: 'sweep-1', message_type: 'WORK_ASSIGNMENT',
      payload: { available_sds: ['SD-OTHER-002', 'SD-OTHER-003'], current_sd: heldSd },
    }];
    try {
      const res = await resolveCheckin(sb, 'sess-busy', { getCoordinator: async () => null });
      expect(res.action).toBe('resume');
      expect(res.sd).toBe(heldSd);
      expect(res.pending_work_assignment).toBeUndefined();
    } finally {
      ws.getMessagesForSession = orig;
    }
  });

  // A genuine directed redirect beneath a (newer) sweep advisory must still be found (finding #3):
  // the directed-field selector skips the advisory and surfaces the real redirect.
  it('held claim + sweep advisory NEWER than a directed redirect → surfaces the directed redirect', async () => {
    const heldSd = 'SD-CURRENT-001';
    const sb = fakeSb({ heldSd, assignmentSd: 'SD-REDIRECT-009' });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    // created_at DESC: sweep advisory first (newest), genuine directed redirect second.
    ws.getMessagesForSession = async () => [
      { id: 'sweep-2', message_type: 'WORK_ASSIGNMENT', payload: { available_sds: ['SD-OTHER-002'], current_sd: heldSd } },
      { id: 'directed-1', message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: 'SD-REDIRECT-009' } },
    ];
    try {
      const res = await resolveCheckin(sb, 'sess-busy', { getCoordinator: async () => null });
      expect(res.action).toBe('resume');
      expect(res.sd).toBe(heldSd);
      expect(res.pending_work_assignment?.sd).toBe('SD-REDIRECT-009');
      expect(res.pending_work_assignment?.message_id).toBe('directed-1');
    } finally {
      ws.getMessagesForSession = orig;
    }
  });
});
