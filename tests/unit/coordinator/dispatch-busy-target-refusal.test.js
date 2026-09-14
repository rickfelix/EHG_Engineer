/**
 * QF-20260902-544 — a directed WORK_ASSIGNMENT to a seat that already holds a claim sits
 * unread by design (the claim slot gates every acquisition tier including directed-assignment
 * in lib/checkin/steps/index.cjs, so a claimed seat's checkin never even reaches the rung that
 * would surface it). Witnessed: an 08:24Z assignment waited 34 minutes for a human re-target.
 *
 * assertValidTarget (lib/coordinator/dispatch.cjs) now refuses a WORK_ASSIGNMENT to a busy
 * target when an idle seat exists, unless the caller explicitly opts in via
 * { allowBusyTarget: true } (the walk-worktree owner is a legitimate deliberate busy target).
 *
 * QF-20260913-509: the idle-seat lookup previously matched ANY claim-less, fresh session
 * (`.is('sd_key', null)`), which named role seats (adam/solomon/coordinator — never valid
 * targets for a WORKER item) and quick-fix holders (a QF claim leaves sd_key null too) as the
 * re-target suggestion. Fixed by reusing the shared idle predicate (seat-idle-predicate.mjs),
 * which excludes role seats unconditionally and quick-fix holders via a populated
 * qfHolderSessionIds ctx. This suite's fake models the resulting two extra reads (a
 * `quick_fixes` claim scan, and a `claude_sessions` candidate scan in place of the old
 * single-row `.is('sd_key', null).maybeSingle()` lookup).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { assertValidTarget } = require('../../../lib/coordinator/dispatch.cjs');

const BUSY_TARGET = '11111111-1111-1111-1111-111111111111';
const IDLE_SEAT = '22222222-2222-2222-2222-222222222222';
const ROLE_SEAT = '33333333-3333-3333-3333-333333333333';
const QF_HOLDER_SEAT = '44444444-4444-4444-4444-444444444444';
const silentLog = { warn() {}, error() {}, log() {} };
const freshHeartbeat = new Date().toISOString();

/**
 * Fake supabase modeling the reads assertValidTarget performs: the initial target-details
 * lookup (claude_sessions, .eq('session_id', target).maybeSingle()), the QF-holder scan
 * (quick_fixes, awaited directly), and the idle-candidate scan (claude_sessions, awaited
 * directly, no .maybeSingle()) that replaced the old single-row idle lookup.
 */
function createFakeSupabase({ targetSdKey, idleCandidates = [], qfHolderIds = [] }) {
  return {
    from(table) {
      if (table === 'quick_fixes') {
        const chain = {
          select() { return chain; },
          not() { return chain; },
          in() { return chain; },
          limit() { return chain; },
          then(resolve) {
            resolve({ data: qfHolderIds.map((id) => ({ claiming_session_id: id })), error: null });
          },
        };
        return chain;
      }
      if (table !== 'claude_sessions') throw new Error(`unexpected table: ${table}`);
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        gte() { return chain; },
        limit() { return chain; },
        maybeSingle() {
          return Promise.resolve({
            data: { session_id: BUSY_TARGET, heartbeat_at: freshHeartbeat, sd_key: targetSdKey },
            error: null,
          });
        },
        then(resolve) {
          resolve({ data: idleCandidates, error: null });
        },
      };
      return chain;
    },
  };
}

describe('QF-20260902-544: assertValidTarget refuses a directed WORK_ASSIGNMENT to a busy seat when an idle seat exists', () => {
  it('refuses when the target holds a claim, the message is WORK_ASSIGNMENT, and an idle seat exists', async () => {
    const sb = createFakeSupabase({
      targetSdKey: 'SD-EXAMPLE-001',
      idleCandidates: [{ session_id: IDLE_SEAT, metadata: {}, heartbeat_at: freshHeartbeat }],
    });
    await expect(
      assertValidTarget(sb, BUSY_TARGET, silentLog, { isWorkAssignment: true, allowBusyTarget: false })
    ).rejects.toMatchObject({ code: 'DISPATCH_BUSY_TARGET_HAS_CLAIM' });
  });

  it('allows when the caller passes allowBusyTarget: true (the deliberate-addressee escape hatch)', async () => {
    const sb = createFakeSupabase({
      targetSdKey: 'SD-EXAMPLE-001',
      idleCandidates: [{ session_id: IDLE_SEAT, metadata: {}, heartbeat_at: freshHeartbeat }],
    });
    const result = await assertValidTarget(sb, BUSY_TARGET, silentLog, { isWorkAssignment: true, allowBusyTarget: true });
    expect(result).toEqual({ ok: true, kind: 'live_session' });
  });

  it('allows when the target holds no claim (sd_key null) even though the message is WORK_ASSIGNMENT', async () => {
    const sb = createFakeSupabase({
      targetSdKey: null,
      idleCandidates: [{ session_id: IDLE_SEAT, metadata: {}, heartbeat_at: freshHeartbeat }],
    });
    const result = await assertValidTarget(sb, BUSY_TARGET, silentLog, { isWorkAssignment: true, allowBusyTarget: false });
    expect(result).toEqual({ ok: true, kind: 'live_session' });
  });

  it('allows when the target holds a claim but no idle seat exists (nowhere better to route it)', async () => {
    const sb = createFakeSupabase({ targetSdKey: 'SD-EXAMPLE-001', idleCandidates: [] });
    const result = await assertValidTarget(sb, BUSY_TARGET, silentLog, { isWorkAssignment: true, allowBusyTarget: false });
    expect(result).toEqual({ ok: true, kind: 'live_session' });
  });

  it('allows when the target holds a claim but the message is not a WORK_ASSIGNMENT (isWorkAssignment: false)', async () => {
    const sb = createFakeSupabase({
      targetSdKey: 'SD-EXAMPLE-001',
      idleCandidates: [{ session_id: IDLE_SEAT, metadata: {}, heartbeat_at: freshHeartbeat }],
    });
    const result = await assertValidTarget(sb, BUSY_TARGET, silentLog, { isWorkAssignment: false, allowBusyTarget: false });
    expect(result).toEqual({ ok: true, kind: 'live_session' });
  });

  it('defaults opts to {} (no crash) when the caller omits the 4th argument entirely', async () => {
    const sb = createFakeSupabase({
      targetSdKey: 'SD-EXAMPLE-001',
      idleCandidates: [{ session_id: IDLE_SEAT, metadata: {}, heartbeat_at: freshHeartbeat }],
    });
    const result = await assertValidTarget(sb, BUSY_TARGET, silentLog);
    expect(result).toEqual({ ok: true, kind: 'live_session' });
  });
});

describe('QF-20260913-509: the idle-seat notion excludes role seats and quick-fix holders', () => {
  it('never suggests a role seat (adam/solomon/coordinator) as the re-target, even with no other claim', async () => {
    const sb = createFakeSupabase({
      targetSdKey: 'SD-EXAMPLE-001',
      idleCandidates: [{ session_id: ROLE_SEAT, metadata: { role: 'solomon' }, heartbeat_at: freshHeartbeat }],
    });
    const result = await assertValidTarget(sb, BUSY_TARGET, silentLog, { isWorkAssignment: true, allowBusyTarget: false });
    expect(result).toEqual({ ok: true, kind: 'live_session' });
  });

  it('never counts a quick-fix holder as idle capacity, even though its sd_key mirror is null', async () => {
    const sb = createFakeSupabase({
      targetSdKey: 'SD-EXAMPLE-001',
      idleCandidates: [{ session_id: QF_HOLDER_SEAT, metadata: {}, heartbeat_at: freshHeartbeat }],
      qfHolderIds: [QF_HOLDER_SEAT],
    });
    const result = await assertValidTarget(sb, BUSY_TARGET, silentLog, { isWorkAssignment: true, allowBusyTarget: false });
    expect(result).toEqual({ ok: true, kind: 'live_session' });
  });

  it('a refusal with no genuinely eligible target prints no target — a role seat and a QF holder together never trip the refusal', async () => {
    const sb = createFakeSupabase({
      targetSdKey: 'SD-EXAMPLE-001',
      idleCandidates: [
        { session_id: ROLE_SEAT, metadata: { role: 'adam' }, heartbeat_at: freshHeartbeat },
        { session_id: QF_HOLDER_SEAT, metadata: {}, heartbeat_at: freshHeartbeat },
      ],
      qfHolderIds: [QF_HOLDER_SEAT],
    });
    const result = await assertValidTarget(sb, BUSY_TARGET, silentLog, { isWorkAssignment: true, allowBusyTarget: false });
    expect(result).toEqual({ ok: true, kind: 'live_session' });
  });

  it('still finds and names a genuinely idle worker even when role seats and QF holders are mixed into the candidate pool', async () => {
    const sb = createFakeSupabase({
      targetSdKey: 'SD-EXAMPLE-001',
      idleCandidates: [
        { session_id: ROLE_SEAT, metadata: { role: 'coordinator' }, heartbeat_at: freshHeartbeat },
        { session_id: QF_HOLDER_SEAT, metadata: {}, heartbeat_at: freshHeartbeat },
        { session_id: IDLE_SEAT, metadata: {}, heartbeat_at: freshHeartbeat },
      ],
      qfHolderIds: [QF_HOLDER_SEAT],
    });
    let caught = null;
    try {
      await assertValidTarget(sb, BUSY_TARGET, silentLog, { isWorkAssignment: true, allowBusyTarget: false });
    } catch (e) {
      caught = e;
    }
    expect(caught).toMatchObject({ code: 'DISPATCH_BUSY_TARGET_HAS_CLAIM' });
    expect(caught.message).toContain(IDLE_SEAT);
    expect(caught.message).not.toContain(ROLE_SEAT);
    expect(caught.message).not.toContain(QF_HOLDER_SEAT);
  });
});
