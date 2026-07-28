// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-1b slice 1
// spawn-control.js stop() — hand the work item back before retiring the session row.
//
// stop() was itself a strand manufacturer: it flipped claude_sessions to released and
// left the work item in_progress with no claimant — invisible to every picker while the
// coordinator still counted it as available supply.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const RESOLVED = { resolved: true, identity: { callsign: 'Alpha-9', session_id: 'sess-1' } };

let calls;

function mockDeps({ heldKey = 'QF-20260726-175', released = true, resetAction = 'qf_reopened' } = {}) {
  calls = [];
  vi.doMock('./session-registry-adapter.js', () => ({
    resolveLiveSession: vi.fn(async () => RESOLVED),
    loadLiveSessionIdentity: vi.fn(async () => ({ sessions: [], callsignBySession: {} })),
  }));
  vi.doMock('./best-effort-release.mjs', () => ({
    bestEffortReleaseSd: vi.fn(async (_sb, sessionId, reason, _log, opts) => {
      calls.push({ step: 'release_claim', sessionId, reason, expectedSdKey: opts && opts.expectedSdKey });
      return released ? { released: true, error: null } : { released: false, error: 'rpc down' };
    }),
  }));
  vi.doMock('./release-work-item.mjs', () => ({
    isReleaseWorkItemResetEnabled: vi.fn(() => process.env.LEO_RELEASE_WORKITEM_RESET === 'on'),
    releaseWorkItemOnSessionEnd: vi.fn(async (_sb, key, reason) => {
      calls.push({ step: 'reset_work_item', key, reason });
      return { ok: true, action: resetAction, detail: 'stub' };
    }),
  }));
  return { heldKey };
}

function supabaseDouble(heldKey) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { sd_key: heldKey }, error: null }) })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => { calls.push({ step: 'retire_session' }); return Promise.resolve({ error: null }); }),
      })),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  };
}

async function loadStop() {
  const mod = await import('./spawn-control.js');
  return mod.stop;
}

beforeEach(() => { vi.resetModules(); delete process.env.LEO_RELEASE_WORKITEM_RESET; });
afterEach(() => { vi.restoreAllMocks(); delete process.env.LEO_RELEASE_WORKITEM_RESET; });

describe('FR1B-1: default OFF keeps the previous behaviour exactly', () => {
  it('does not touch the work item when the flag is unset', async () => {
    const { heldKey } = mockDeps();
    const stop = await loadStop();
    const res = await stop('Alpha-9', { supabaseClient: supabaseDouble(heldKey) });
    expect(res.ok).toBe(true);
    expect(res.workItemReset).toBeUndefined();
    expect(calls.filter((c) => c.step !== 'retire_session')).toHaveLength(0);
  });
});

describe('FR1B-2: THE ORDER — claim released BEFORE the reset, both BEFORE the session is retired', () => {
  it('sequences release_claim -> reset_work_item -> retire_session', async () => {
    // This is the whole point of the slice. Reset-before-release would match nothing
    // (the QF predicate requires claiming_session_id IS NULL) and return qf_untouched
    // every time — a green no-op. Retiring the session first would erase sd_key, which
    // is how release_sd resolves WHICH item to hand back.
    process.env.LEO_RELEASE_WORKITEM_RESET = 'on';
    const { heldKey } = mockDeps();
    const stop = await loadStop();
    await stop('Alpha-9', { supabaseClient: supabaseDouble(heldKey) });
    expect(calls.map((c) => c.step)).toEqual(['release_claim', 'reset_work_item', 'retire_session']);
  });

  it('scopes the claim release to the key the session actually holds (QF-20260726-593)', async () => {
    process.env.LEO_RELEASE_WORKITEM_RESET = 'on';
    const { heldKey } = mockDeps();
    const stop = await loadStop();
    await stop('Alpha-9', { supabaseClient: supabaseDouble(heldKey) });
    const rel = calls.find((c) => c.step === 'release_claim');
    expect(rel.expectedSdKey).toBe(heldKey);
    expect(rel.reason).toBe('manual_stop'); // names the mechanism, not 'manual'
  });

  it('hands back the SAME key it released', async () => {
    process.env.LEO_RELEASE_WORKITEM_RESET = 'on';
    const otherKey = 'SD-SOME-OTHER-001';
    mockDeps({ heldKey: otherKey });
    const stop = await loadStop();
    await stop('Alpha-9', { supabaseClient: supabaseDouble(otherKey) });
    expect(calls.find((c) => c.step === 'reset_work_item').key).toBe(otherKey);
  });
});

describe('FR1B-3: the handback is best-effort — stop() still retires the session', () => {
  it('a failed claim release does NOT attempt the reset, and does NOT block the retire', async () => {
    // Resetting after a failed release would be reasoning from an unproven premise:
    // we do not know the claim is gone, so the predicate cannot be trusted to protect us.
    process.env.LEO_RELEASE_WORKITEM_RESET = 'on';
    const { heldKey } = mockDeps({ released: false });
    const stop = await loadStop();
    const res = await stop('Alpha-9', { supabaseClient: supabaseDouble(heldKey) });
    expect(calls.map((c) => c.step)).toEqual(['release_claim', 'retire_session']);
    expect(res.ok).toBe(true);
    expect(res.workItemReset.released).toBe(false);
  });

  it('a session holding no work item skips the handback cleanly', async () => {
    process.env.LEO_RELEASE_WORKITEM_RESET = 'on';
    mockDeps();
    const stop = await loadStop();
    const res = await stop('Alpha-9', { supabaseClient: supabaseDouble(null) });
    expect(res.workItemReset).toEqual({ attempted: false, reason: 'session_holds_no_work_item' });
    expect(calls.map((c) => c.step)).toEqual(['retire_session']);
  });
});
