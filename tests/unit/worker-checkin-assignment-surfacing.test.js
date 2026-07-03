/**
 * SD-FDBK-FIX-WORKER-CHECK-SURFACES-001 — directed-assignment visibility pins.
 * Seam 2: classifyInboxMessage surfaces WORK_ASSIGNMENT regardless of idle.
 * Seam 1: resolveCheckin surfaces a pending WORK_ASSIGNMENT on the resume path
 *         without dropping the held claim.
 */
import { describe, it, expect, vi } from 'vitest';
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
function fakeSb({ heldSd, assignmentSd, windDown, sdRow }) {
  return {
    rpc: () => Promise.resolve({ data: { success: true }, error: null }),
    from(table) {
      const api = {
        _t: table, select() { return this; }, eq() { return this; }, gte() { return this; },
        order() { return this; }, limit() { return this; },
        maybeSingle() {
          if (table === 'claude_sessions') return Promise.resolve({ data: { metadata: { role: 'worker', ...(windDown ? { wind_down: windDown } : {}) }, sd_key: heldSd }, error: null });
          // QF-20260703-780: sdRow === null must mean "genuinely no row" (a QF-keyed or
          // phantom/typo'd-SD-keyed lookup), distinct from sdRow left unspecified (undefined).
          if (table === 'strategic_directives_v2') return Promise.resolve({ data: sdRow === undefined ? { status: 'in_progress' } : sdRow, error: null });
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

// QF-20260703-091 (RCA-confirmed): a NO-held-claim session with a directed WORK_ASSIGNMENT must
// run the same repo-fitness/premise gate (classifyDispatchIneligibility) the self-claim paths use
// BEFORE calling tryClaim — previously it claimed unconditionally and relied on sd-start.js to
// catch a repo-mismatched SD one step later, after the claim had already churned.
describe('resolveCheckin — directed WORK_ASSIGNMENT claim path skips an ineligible SD (no held claim)', () => {
  // QF-20260703-775: repo-match is only meaningful once the caller is checked into a COMMITTED
  // per-SD worktree (a /.worktrees/<sd> segment in cwd) — a bare shared-root cwd (relied on
  // implicitly by this test before, via ambient process.cwd()) has no committed context, and is
  // exactly what an idle worker's checkin runs from by convention. Relying on ambient process.cwd()
  // made this test's outcome depend on wherever the suite happened to run from (a real git-worktree
  // checkout locally vs. a plain CI checkout with no /.worktrees/ segment at all) — an
  // ambient-environment-coupled false-positive/negative class. Mock process.cwd() explicitly so the
  // test is deterministic and exercises the scenario the fitness gate is actually meant to protect:
  // a worker mid-build in one repo's worktree, redirected to a different-repo target.
  it('repo-mismatched directed assignment FROM A COMMITTED WORKTREE is ACKed and skipped, NOT claimed', async () => {
    const assignmentSd = 'SD-MARKETLENS-MISMATCH-001';
    const sb = fakeSb({
      heldSd: null,
      sdRow: { status: 'draft', sd_type: 'feature', sd_key: assignmentSd, metadata: {}, target_application: 'MarketLens' },
    });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [{ id: 'msg-mismatch', message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: assignmentSd } }];
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('C:/Users/x/Projects/_EHG/EHG_Engineer/.worktrees/qf/QF-OTHER-001');
    try {
      const res = await resolveCheckin(sb, 'sess-idle', { getCoordinator: async () => null });
      expect(res.action).not.toBe('claimed_assignment');
      expect(res.sd).not.toBe(assignmentSd);
      expect(res.assignment_ineligible_purged).toEqual({ sd: assignmentSd, reason: 'unfit_repo_mismatch' });
    } finally {
      ws.getMessagesForSession = orig;
      cwdSpy.mockRestore();
    }
  });

  it('repo-mismatched directed assignment FROM THE BARE SHARED ROOT still claims (idle worker, no committed context)', async () => {
    const assignmentSd = 'SD-MARKETLENS-MISMATCH-002';
    const sb = fakeSb({
      heldSd: null,
      sdRow: { status: 'draft', sd_type: 'feature', sd_key: assignmentSd, metadata: {}, target_application: 'MarketLens' },
    });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [{ id: 'msg-mismatch2', message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: assignmentSd } }];
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('C:/Users/x/Projects/_EHG/EHG_Engineer');
    try {
      const res = await resolveCheckin(sb, 'sess-idle', { getCoordinator: async () => null });
      expect(res.action).toBe('claimed_assignment');
      expect(res.sd).toBe(assignmentSd);
      expect(res.assignment_ineligible_purged).toBeUndefined();
    } finally {
      ws.getMessagesForSession = orig;
      cwdSpy.mockRestore();
    }
  });

  it('a FIT directed assignment still claims normally (regression guard)', async () => {
    const assignmentSd = 'SD-EHG-ENGINEER-FIT-002';
    const sb = fakeSb({
      heldSd: null,
      sdRow: { status: 'draft', sd_type: 'feature', sd_key: assignmentSd, metadata: {}, target_application: null },
    });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [{ id: 'msg-fit', message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: assignmentSd } }];
    try {
      const res = await resolveCheckin(sb, 'sess-idle', { getCoordinator: async () => null });
      expect(res.action).toBe('claimed_assignment');
      expect(res.sd).toBe(assignmentSd);
      expect(res.assignment_ineligible_purged).toBeUndefined();
    } finally {
      ws.getMessagesForSession = orig;
    }
  });
});

// QF-20260703-476: a WORK_ASSIGNMENT whose read_at got stamped by some other delivery path
// (e.g. a stale/legacy poll) but was never genuinely actioned (acknowledged_at still NULL, no
// claim recorded) must still reach the claim step -- an unreadOnly pull hides it forever.
// These stubs assert on the OPTIONS resolveCheckin actually passes (unackedOnly, not unreadOnly),
// simulating real Postgres filter semantics: a row only "exists" in the returned set when the
// options it was called with are the ones that would truly select it.
function makeFilteringStub(row) {
  return async (sb, sessionId, opts = {}) => {
    if (opts.unackedOnly) return row.acknowledged_at == null ? [row] : [];
    if (opts.unreadOnly) return row.read_at == null ? [row] : [];
    return [row];
  };
}

describe('resolveCheckin — a stamped-but-unclaimed assignment still reaches the claim step', () => {
  it('no held claim: a read_at-set/acknowledged_at-null row is still claimed (not hidden by unreadOnly)', async () => {
    const assignmentSd = 'SD-EHG-ENGINEER-STAMPED-003';
    const sb = fakeSb({
      heldSd: null,
      sdRow: { status: 'draft', sd_type: 'feature', sd_key: assignmentSd, metadata: {}, target_application: null },
    });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = makeFilteringStub({
      id: 'msg-stamped', message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: assignmentSd },
      read_at: '2026-07-03T10:00:00.000Z', acknowledged_at: null,
    });
    try {
      const res = await resolveCheckin(sb, 'sess-idle', { getCoordinator: async () => null });
      expect(res.action).toBe('claimed_assignment');
      expect(res.sd).toBe(assignmentSd);
    } finally {
      ws.getMessagesForSession = orig;
    }
  });

  it('held claim (seam 1): a read_at-set/acknowledged_at-null row still surfaces as pending_work_assignment', async () => {
    const heldSd = 'SD-CURRENT-004';
    const assignmentSd = 'SD-REDIRECT-005';
    const sb = fakeSb({ heldSd, assignmentSd });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = makeFilteringStub({
      id: 'msg-stamped-busy', message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: assignmentSd },
      read_at: '2026-07-03T10:00:00.000Z', acknowledged_at: null,
    });
    try {
      const res = await resolveCheckin(sb, 'sess-busy', { getCoordinator: async () => null });
      expect(res.action).toBe('resume');
      expect(res.sd).toBe(heldSd);
      expect(res.pending_work_assignment?.sd).toBe(assignmentSd);
    } finally {
      ws.getMessagesForSession = orig;
    }
  });
});

// QF-20260703-806: live forensics showed a WORK_ASSIGNMENT with BOTH read_at AND acknowledged_at
// already stamped (the ack-before-claim race QF-476 did not fully close) -- the unackedOnly pull
// alone excludes it, orphaning the directive. Reproduces the QF's own required sequence: insert a
// WA already acked by "the checkin generic message pass", run the assignment pull, assert it is
// CLAIMED, not orphaned. makeFilteringStub's unconditional final branch simulates the widened
// (no-ack-filter) fallback query the fix adds.
describe('resolveCheckin — QF-20260703-806: acked-but-never-claimed assignment reaches the claim step', () => {
  it('no held claim: an already read_at+acknowledged_at-stamped WA is still claimed via the widened fallback pull', async () => {
    const assignmentSd = 'SD-EHG-ENGINEER-ACKRACE-006';
    const sb = fakeSb({
      heldSd: null,
      sdRow: { status: 'draft', sd_type: 'feature', sd_key: assignmentSd, metadata: {}, target_application: null },
    });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    // unackedOnly (the primary pull) finds nothing -- this row is already acked; the widened
    // fallback (neither unackedOnly nor unreadOnly set) is what must resurrect it.
    ws.getMessagesForSession = makeFilteringStub({
      id: 'msg-ackraced', message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: assignmentSd },
      read_at: '2026-07-03T16:05:28.000Z', acknowledged_at: '2026-07-03T16:05:28.000Z',
    });
    try {
      const res = await resolveCheckin(sb, 'sess-idle', { getCoordinator: async () => null });
      expect(res.action).toBe('claimed_assignment');
      expect(res.sd).toBe(assignmentSd);
    } finally {
      ws.getMessagesForSession = orig;
    }
  });
});

// QF-20260703-780: a WORK_ASSIGNMENT whose key resolves to zero rows in strategic_directives_v2
// (a QF key, or a typo'd/deleted SD key) skips both the terminal-purge and ineligibility-purge
// branches (assignedSdRow is null) and falls to tryClaim(). If the RPC itself then reports a
// terminal verdict, the message must still be acked -- else it re-fires every tick forever, which
// is exactly what was observed live (session cb2bfe72, 30+ min / 5+ ticks against a completed QF).
describe('resolveCheckin — QF-20260703-780: terminal-class claim rejection acks the message', () => {
  it('a QF-keyed assignment whose target is now completed (sd_terminal_status) is ACKed and purged', async () => {
    const assignmentSd = 'QF-20260703-197';
    const sb = fakeSb({ heldSd: null, sdRow: null }); // no strategic_directives_v2 row for a QF key
    sb.rpc = () => Promise.resolve({ data: { success: false, error: 'sd_terminal_status' }, error: null });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [{ id: 'msg-qf-terminal', message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: assignmentSd } }];
    try {
      const res = await resolveCheckin(sb, 'sess-idle', { getCoordinator: async () => null });
      expect(res.action).not.toBe('claimed_assignment');
      expect(res.assignment_claim_terminal_purged).toEqual({ sd: assignmentSd, error: 'sd_terminal_status' });
      expect(res.assignment_claim_error).toBeUndefined();
    } finally {
      ws.getMessagesForSession = orig;
    }
  });

  it('a phantom/typo\'d SD key whose claim RPC reports sd_not_found is ACKed and purged', async () => {
    const assignmentSd = 'SD-DOES-NOT-EXIST-999';
    const sb = fakeSb({ heldSd: null, sdRow: null }); // no strategic_directives_v2 row
    sb.rpc = () => Promise.resolve({ data: { success: false, error: 'sd_not_found' }, error: null });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [{ id: 'msg-phantom', message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: assignmentSd } }];
    try {
      const res = await resolveCheckin(sb, 'sess-idle', { getCoordinator: async () => null });
      expect(res.action).not.toBe('claimed_assignment');
      expect(res.assignment_claim_terminal_purged).toEqual({ sd: assignmentSd, error: 'sd_not_found' });
      expect(res.assignment_claim_error).toBeUndefined();
    } finally {
      ws.getMessagesForSession = orig;
    }
  });

  it('a TRANSIENT claim rejection (claimed_by_live_peer) is NOT acked -- stays retryable', async () => {
    const assignmentSd = 'SD-EHG-ENGINEER-LIVEPEER-007';
    const sb = fakeSb({
      heldSd: null,
      sdRow: { status: 'draft', sd_type: 'feature', sd_key: assignmentSd, metadata: {}, target_application: null },
    });
    sb.rpc = () => Promise.resolve({ data: { success: false, error: 'claimed_by_live_peer', claimed_by: 'other-session' }, error: null });
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [{ id: 'msg-livepeer', message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: assignmentSd } }];
    try {
      const res = await resolveCheckin(sb, 'sess-idle', { getCoordinator: async () => null });
      expect(res.action).not.toBe('claimed_assignment');
      expect(res.assignment_claim_error).toBe('claimed_by_live_peer');
      expect(res.assignment_claim_terminal_purged).toBeUndefined();
    } finally {
      ws.getMessagesForSession = orig;
    }
  });
});
