/**
 * QF-20260902-544 — a directed WORK_ASSIGNMENT to a seat that already holds a claim sits
 * unread by design (the claim slot gates every acquisition tier including directed-assignment
 * in lib/checkin/steps/index.cjs, so a claimed seat's checkin never even reaches the rung that
 * would surface it). Witnessed: an 08:24Z assignment waited 34 minutes for a human re-target.
 *
 * assertValidTarget (lib/coordinator/dispatch.cjs) now refuses a WORK_ASSIGNMENT to a busy
 * target when an idle seat exists, unless the caller explicitly opts in via
 * { allowBusyTarget: true } (the walk-worktree owner is a legitimate deliberate busy target).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { assertValidTarget } = require('../../../lib/coordinator/dispatch.cjs');

const BUSY_TARGET = '11111111-1111-1111-1111-111111111111';
const IDLE_SEAT = '22222222-2222-2222-2222-222222222222';
const silentLog = { warn() {}, error() {}, log() {} };

/** Fake supabase modeling only the claude_sessions reads assertValidTarget performs. */
function createFakeSupabase({ targetSdKey, hasIdleSeat }) {
  return {
    from(table) {
      if (table !== 'claude_sessions') throw new Error(`unexpected table: ${table}`);
      const chain = {
        _isIdleQuery: false,
        select() { return chain; },
        eq(col) { if (col === 'session_id') chain._isIdleQuery = false; return chain; },
        is(col, val) { if (col === 'sd_key' && val === null) chain._isIdleQuery = true; return chain; },
        gte() { return chain; },
        limit() { return chain; },
        maybeSingle() {
          if (chain._isIdleQuery) {
            return Promise.resolve({
              data: hasIdleSeat ? { session_id: IDLE_SEAT } : null,
              error: null,
            });
          }
          return Promise.resolve({
            data: { session_id: BUSY_TARGET, heartbeat_at: new Date().toISOString(), sd_key: targetSdKey },
            error: null,
          });
        },
      };
      return chain;
    },
  };
}

describe('QF-20260902-544: assertValidTarget refuses a directed WORK_ASSIGNMENT to a busy seat when an idle seat exists', () => {
  it('refuses when the target holds a claim, the message is WORK_ASSIGNMENT, and an idle seat exists', async () => {
    const sb = createFakeSupabase({ targetSdKey: 'SD-EXAMPLE-001', hasIdleSeat: true });
    await expect(
      assertValidTarget(sb, BUSY_TARGET, silentLog, { isWorkAssignment: true, allowBusyTarget: false })
    ).rejects.toMatchObject({ code: 'DISPATCH_BUSY_TARGET_HAS_CLAIM' });
  });

  it('allows when the caller passes allowBusyTarget: true (the deliberate-addressee escape hatch)', async () => {
    const sb = createFakeSupabase({ targetSdKey: 'SD-EXAMPLE-001', hasIdleSeat: true });
    const result = await assertValidTarget(sb, BUSY_TARGET, silentLog, { isWorkAssignment: true, allowBusyTarget: true });
    expect(result).toEqual({ ok: true, kind: 'live_session' });
  });

  it('allows when the target holds no claim (sd_key null) even though the message is WORK_ASSIGNMENT', async () => {
    const sb = createFakeSupabase({ targetSdKey: null, hasIdleSeat: true });
    const result = await assertValidTarget(sb, BUSY_TARGET, silentLog, { isWorkAssignment: true, allowBusyTarget: false });
    expect(result).toEqual({ ok: true, kind: 'live_session' });
  });

  it('allows when the target holds a claim but no idle seat exists (nowhere better to route it)', async () => {
    const sb = createFakeSupabase({ targetSdKey: 'SD-EXAMPLE-001', hasIdleSeat: false });
    const result = await assertValidTarget(sb, BUSY_TARGET, silentLog, { isWorkAssignment: true, allowBusyTarget: false });
    expect(result).toEqual({ ok: true, kind: 'live_session' });
  });

  it('allows when the target holds a claim but the message is not a WORK_ASSIGNMENT (isWorkAssignment: false)', async () => {
    const sb = createFakeSupabase({ targetSdKey: 'SD-EXAMPLE-001', hasIdleSeat: true });
    const result = await assertValidTarget(sb, BUSY_TARGET, silentLog, { isWorkAssignment: false, allowBusyTarget: false });
    expect(result).toEqual({ ok: true, kind: 'live_session' });
  });

  it('defaults opts to {} (no crash) when the caller omits the 4th argument entirely', async () => {
    const sb = createFakeSupabase({ targetSdKey: 'SD-EXAMPLE-001', hasIdleSeat: true });
    const result = await assertValidTarget(sb, BUSY_TARGET, silentLog);
    expect(result).toEqual({ ok: true, kind: 'live_session' });
  });
});
