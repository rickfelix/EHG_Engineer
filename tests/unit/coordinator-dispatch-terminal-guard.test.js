/**
 * SD-LEO-FEAT-CLAIM-ASSIGNMENT-PATH-001 — the coordinator dispatch choke point must refuse to create
 * a WORK_ASSIGNMENT for a terminal (completed/cancelled/deferred) or non-existent SD/QF, mirroring the
 * claim_sd RPC's terminal guard so dispatch and claim never disagree. Non-WORK_ASSIGNMENT rows and a
 * transient DB lookup error must NOT be blocked (fail-open).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  isTerminalSdStatus, isTerminalQfStatus, assertSdDispatchable, insertCoordinationRow,
} = require('../../lib/coordinator/dispatch.cjs');

const LIVE_TARGET = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';
const silentLog = { warn() {}, error() {}, log() {} };

// Supabase stub: resolves SD/QF status from a fixture map; can simulate a lookup error.
function stubSupabase({ sds = {}, qfs = {}, throwOn = null, liveSessions = [LIVE_TARGET] } = {}) {
  return {
    from(table) {
      const chain = {
        _table: table, _eq: null,
        select() { return chain; },
        eq(_col, val) { chain._eq = val; return chain; },
        limit() { return chain; },
        maybeSingle() {
          if (throwOn === table) return Promise.resolve({ data: null, error: { message: 'transient boom' } });
          if (table === 'strategic_directives_v2') {
            return Promise.resolve({ data: chain._eq in sds ? { status: sds[chain._eq] } : null, error: null });
          }
          if (table === 'quick_fixes') {
            return Promise.resolve({ data: chain._eq in qfs ? { status: qfs[chain._eq] } : null, error: null });
          }
          if (table === 'claude_sessions') {
            return Promise.resolve({ data: liveSessions.includes(chain._eq) ? { session_id: chain._eq, status: 'active' } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        // insert path for insertCoordinationRow
        insert(r) { chain._inserted = r; return chain; },
        then(res, rej) { return Promise.resolve({ data: chain._inserted || null, error: null }).then(res, rej); },
      };
      return chain;
    },
  };
}

describe('pure terminal-status classifiers', () => {
  it('SD terminal set = completed/cancelled/deferred', () => {
    for (const s of ['completed', 'cancelled', 'deferred', 'COMPLETED']) expect(isTerminalSdStatus(s)).toBe(true);
    for (const s of ['draft', 'active', 'in_progress', 'pending_approval', '', null, undefined]) expect(isTerminalSdStatus(s)).toBe(false);
  });
  it('QF terminal set = completed/cancelled/escalated/closed', () => {
    for (const s of ['completed', 'cancelled', 'escalated', 'closed']) expect(isTerminalQfStatus(s)).toBe(true);
    for (const s of ['open', 'in_progress', null]) expect(isTerminalQfStatus(s)).toBe(false);
  });
});

describe('assertSdDispatchable', () => {
  // Realistic producer shape: stale-session-sweep emits target_sd (top-level) + payload.current_sd —
  // NOT payload.assigned_sd. Using the real shape is what makes these tests catch a resolution-key
  // regression instead of masking one (the adversarial-review fix for this SD).
  const wa = (sdKey) => ({
    message_type: 'WORK_ASSIGNMENT', target_session: LIVE_TARGET,
    target_sd: sdKey, payload: { available_sds: [], current_sd: sdKey },
  });

  it('REFUSES a completed SD (DISPATCH_SD_TERMINAL)', async () => {
    const sb = stubSupabase({ sds: { 'SD-X-001': 'completed' } });
    await expect(assertSdDispatchable(sb, wa('SD-X-001'), silentLog)).rejects.toMatchObject({ code: 'DISPATCH_SD_TERMINAL' });
  });
  it('REFUSES cancelled + deferred SDs', async () => {
    const sb = stubSupabase({ sds: { 'SD-C': 'cancelled', 'SD-D': 'deferred' } });
    await expect(assertSdDispatchable(sb, wa('SD-C'), silentLog)).rejects.toMatchObject({ code: 'DISPATCH_SD_TERMINAL' });
    await expect(assertSdDispatchable(sb, wa('SD-D'), silentLog)).rejects.toMatchObject({ code: 'DISPATCH_SD_TERMINAL' });
  });
  it('ALLOWS a draft/active SD', async () => {
    const sb = stubSupabase({ sds: { 'SD-OK': 'draft' } });
    await expect(assertSdDispatchable(sb, wa('SD-OK'), silentLog)).resolves.toBeUndefined();
  });
  it('REFUSES a non-existent SD (DISPATCH_SD_NOT_FOUND)', async () => {
    const sb = stubSupabase({ sds: {} });
    await expect(assertSdDispatchable(sb, wa('SD-GHOST'), silentLog)).rejects.toMatchObject({ code: 'DISPATCH_SD_NOT_FOUND' });
  });
  it('REFUSES a terminal QF (escalated)', async () => {
    const sb = stubSupabase({ qfs: { 'QF-1': 'escalated' } });
    await expect(assertSdDispatchable(sb, wa('QF-1'), silentLog)).rejects.toMatchObject({ code: 'DISPATCH_SD_TERMINAL' });
  });
  it('ALLOWS an open QF', async () => {
    const sb = stubSupabase({ qfs: { 'QF-2': 'open' } });
    await expect(assertSdDispatchable(sb, wa('QF-2'), silentLog)).resolves.toBeUndefined();
  });
  it('IGNORES non-WORK_ASSIGNMENT rows', async () => {
    const sb = stubSupabase({ sds: { 'SD-X': 'completed' } });
    await expect(assertSdDispatchable(sb, { message_type: 'INFO', payload: { assigned_sd: 'SD-X' } }, silentLog)).resolves.toBeUndefined();
  });
  it('IGNORES a WORK_ASSIGNMENT with no named SD', async () => {
    const sb = stubSupabase({});
    await expect(assertSdDispatchable(sb, { message_type: 'WORK_ASSIGNMENT', payload: {} }, silentLog)).resolves.toBeUndefined();
  });
  it('resolves the SD from payload.current_sd alone (sweep nudge with no top-level target_sd)', async () => {
    const sb = stubSupabase({ sds: { 'SD-SWEEP': 'completed' } });
    await expect(assertSdDispatchable(sb, {
      message_type: 'WORK_ASSIGNMENT', target_session: LIVE_TARGET, payload: { current_sd: 'SD-SWEEP' },
    }, silentLog)).rejects.toMatchObject({ code: 'DISPATCH_SD_TERMINAL' });
  });
  it('resolves the SD from payload.sd_key alone (cold-recovery resume shape)', async () => {
    const sb = stubSupabase({ sds: { 'SD-RESUME': 'cancelled' } });
    await expect(assertSdDispatchable(sb, {
      message_type: 'WORK_ASSIGNMENT', target_session: 'broadcast', payload: { kind: 'resume', sd_key: 'SD-RESUME' },
    }, silentLog)).rejects.toMatchObject({ code: 'DISPATCH_SD_TERMINAL' });
  });
  it('resolves the SD from top-level target_sd alone', async () => {
    const sb = stubSupabase({ sds: { 'SD-TOP': 'deferred' } });
    await expect(assertSdDispatchable(sb, {
      message_type: 'WORK_ASSIGNMENT', target_session: LIVE_TARGET, target_sd: 'SD-TOP', payload: {},
    }, silentLog)).rejects.toMatchObject({ code: 'DISPATCH_SD_TERMINAL' });
  });
  it('FAILS-OPEN on a transient lookup error (does not block dispatch)', async () => {
    const sb = stubSupabase({ throwOn: 'strategic_directives_v2' });
    await expect(assertSdDispatchable(sb, wa('SD-ANY'), silentLog)).resolves.toBeUndefined();
  });
});

describe('insertCoordinationRow integration: terminal SD is refused before insert', () => {
  it('throws DISPATCH_SD_TERMINAL and does NOT insert for a completed SD', async () => {
    const sb = stubSupabase({ sds: { 'SD-DONE': 'completed' } });
    await expect(insertCoordinationRow(sb, {
      message_type: 'WORK_ASSIGNMENT', target_session: LIVE_TARGET, payload: { assigned_sd: 'SD-DONE' },
    }, { logger: silentLog })).rejects.toMatchObject({ code: 'DISPATCH_SD_TERMINAL' });
  });
  it('allows a draft SD through to the insert', async () => {
    const sb = stubSupabase({ sds: { 'SD-GO': 'active' } });
    const res = await insertCoordinationRow(sb, {
      message_type: 'WORK_ASSIGNMENT', target_session: LIVE_TARGET, payload: { assigned_sd: 'SD-GO' },
    }, { logger: silentLog });
    expect(res.error).toBeNull();
  });
});
