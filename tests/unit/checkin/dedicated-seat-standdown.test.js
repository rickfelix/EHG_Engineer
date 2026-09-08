/**
 * QF-20260905-282: a chairman-dedicated seat self-reports coordinator_stand_down=true on its
 * own first check-in via --stand-down, instead of the coordinator having to hand-set the flag
 * (measured 2026-09-05 18:04Z; recurred fleet-wide after the 09-06 restart). isSelfClaimDisabled
 * already honors coordinator_stand_down=true (see tests/unit/fleet/self-claim-standdown.test.js
 * FR-1) -- this step ONLY needs to write the flag, race-safely, on the SAME tick.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dedicatedSeatStanddown = require('../../../lib/checkin/steps/dedicated-seat-standdown.cjs');
const { resolveCheckin, isSelfClaimDisabled } = require('../../../scripts/worker-checkin.cjs');

describe('dedicated-seat-standdown step, in isolation', () => {
  function fakeSb({ initialMetadata = null, freshMetadata = null } = {}) {
    const updates = [];
    return {
      updates,
      from(table) {
        return {
          select() { return this; }, eq() { return this; },
          maybeSingle: async () => ({ data: table === 'claude_sessions' ? { metadata: freshMetadata ?? initialMetadata } : null, error: null }),
          update(payload) { return { eq: async () => { updates.push({ table, payload }); return { error: null }; } }; },
        };
      },
    };
  }

  it('no-op (no read, no write) when --stand-down was not passed', async () => {
    const sb = fakeSb();
    const ctx = { sb, sessionId: 's1', opts: { cliStandDown: false }, sessionMetadata: { role: 'worker' } };
    await dedicatedSeatStanddown.run(ctx);
    expect(sb.updates).toHaveLength(0);
    expect(ctx.sessionMetadata).toEqual({ role: 'worker' }); // untouched
  });

  it('writes coordinator_stand_down=true and dedicated_seat=true when --stand-down was passed', async () => {
    const sb = fakeSb({ initialMetadata: { role: 'worker' }, freshMetadata: { role: 'worker' } });
    const ctx = { sb, sessionId: 's1', opts: { cliStandDown: true }, sessionMetadata: { role: 'worker' } };
    await dedicatedSeatStanddown.run(ctx);
    expect(sb.updates).toHaveLength(1);
    expect(sb.updates[0].payload.metadata).toMatchObject({ role: 'worker', coordinator_stand_down: true, dedicated_seat: true });
    expect(ctx.sessionMetadata).toEqual(sb.updates[0].payload.metadata); // ctx updated in-place for downstream steps
  });

  it('idempotent: no second write when coordinator_stand_down is already true', async () => {
    const sb = fakeSb({ initialMetadata: { coordinator_stand_down: true } });
    const ctx = { sb, sessionId: 's1', opts: { cliStandDown: true }, sessionMetadata: { coordinator_stand_down: true } };
    await dedicatedSeatStanddown.run(ctx);
    expect(sb.updates).toHaveLength(0);
  });

  it('QF-20260703-314-style race safety: re-reads FRESH before writing, never clobbers a concurrent writer', async () => {
    // step-2 (model-effort-merge) read this metadata; a concurrent writer (e.g.
    // assign-fleet-identities.cjs) set fleet_identity AFTER that read but BEFORE this step runs.
    const sb = fakeSb({
      initialMetadata: { role: 'worker' },
      freshMetadata: { role: 'worker', fleet_identity: { callsign: 'Charlie', color: 'red' } },
    });
    const ctx = { sb, sessionId: 's1', opts: { cliStandDown: true }, sessionMetadata: { role: 'worker' } };
    await dedicatedSeatStanddown.run(ctx);
    expect(sb.updates[0].payload.metadata.fleet_identity).toEqual({ callsign: 'Charlie', color: 'red' });
    expect(sb.updates[0].payload.metadata.coordinator_stand_down).toBe(true);
  });

  it('fail-open: a throwing sb never bubbles — the check-in must proceed regardless', async () => {
    const sb = { from: () => { throw new Error('db down'); } };
    const ctx = { sb, sessionId: 's1', opts: { cliStandDown: true }, sessionMetadata: { role: 'worker' } };
    await expect(dedicatedSeatStanddown.run(ctx)).resolves.toBeUndefined();
  });
});

describe('resolveCheckin — --stand-down lands before self-claim-gates evaluates on the SAME tick', () => {
  function fakeSbNoWorkAvailable() {
    const updates = [];
    return {
      updates,
      rpc: () => Promise.resolve({ data: { success: true }, error: null }),
      from(table) {
        return {
          select() { return this; }, eq() { return this; }, gte() { return this; }, in() { return this; },
          order() { return this; }, limit() { return this; },
          maybeSingle: async () => (table === 'claude_sessions' ? { data: { metadata: { role: 'worker' }, sd_key: null }, error: null } : { data: null, error: null }),
          then(resolve) { resolve({ data: [], error: null }); }, // any awaited select-list resolves empty
          insert: async () => ({ error: null }),
          update(payload) { return { eq: async () => { updates.push({ table, payload }); return { error: null }; } }; },
        };
      },
    };
  }

  it('a session that reports --stand-down for the first time is stamped coordinator_stand_down=true and resolves idle, not a self-claim', async () => {
    const sb = fakeSbNoWorkAvailable();
    const ws = require('../../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [];
    try {
      const result = await resolveCheckin(sb, 'sess-dedicated', { getCoordinator: async () => null, standDown: true });
      const metaUpdate = sb.updates.find((u) => u.table === 'claude_sessions' && u.payload.metadata && u.payload.metadata.coordinator_stand_down === true);
      expect(metaUpdate).toBeTruthy();
      expect(metaUpdate.payload.metadata.dedicated_seat).toBe(true);
      expect(isSelfClaimDisabled(metaUpdate.payload.metadata)).toBe(true);
      expect(result.action).not.toBe('self_claimed');
      expect(result.action).not.toBe('self_claimed_qf');
    } finally {
      ws.getMessagesForSession = orig;
    }
  });
});
