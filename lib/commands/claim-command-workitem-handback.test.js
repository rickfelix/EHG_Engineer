/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-1b slice 3
 *
 * releaseClaim() — the user-facing `/claim release` verb — now hands the work item back,
 * behind LEO_RELEASE_WORKITEM_RESET.
 *
 * Until this landed, the command printed "The SD is now available for other sessions" while a
 * released quick-fix stayed at status='in_progress' with no claimant: reachable by no picker
 * (the check-in open-QF picker selects status='open') and still counted INTO the coordinator's
 * available-supply gauge. The message was literally false.
 *
 * Also pins the claim-guard.mjs EXEMPTION. FR-1 requires every release path to either call the
 * shared helper or carry a written reason it must not; claim-guard is the latter, and a
 * well-meaning future edit wiring it would introduce a real steal race.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let handbackCalls;

function mockModules({ action = 'qf_reopened', ok = true, detail = 'stub', rpcError = null } = {}) {
  handbackCalls = [];
  vi.doMock('../fleet/release-work-item.mjs', () => ({
    isReleaseWorkItemResetEnabled: vi.fn(() => process.env.LEO_RELEASE_WORKITEM_RESET === 'on'),
    releaseWorkItemOnSessionEnd: vi.fn(async (_sb, key, reason) => {
      handbackCalls.push({ key, reason });
      return { ok, action, detail };
    }),
  }));
  vi.doMock('../supabase-client.js', () => ({
    createSupabaseServiceClient: vi.fn(() => supabaseDouble({ rpcError })),
  }));
  vi.doMock('../resolve-own-session.js', () => ({
    resolveOwnSession: vi.fn(async () => ({
      session: { session_id: 'sess-1', sd_key: 'QF-20260726-175', status: 'active' },
      source: 'env',
    })),
  }));
  vi.doMock('../claim/stale-threshold.js', () => ({ getStaleThresholdSeconds: vi.fn(() => 300) }));
}

const SESSION_ROW = { session_id: 'sess-1', sd_key: 'QF-20260726-175', heartbeat_at: null, status: 'active' };

function supabaseDouble({ rpcError = null } = {}) {
  // releaseClaim uses two chains off claude_sessions/strategic_directives_v2:
  //   .select().eq().single()      -> the session row
  //   .select().eq().maybeSingle() -> the SD row for the LEAD_FINAL warning (null = skip)
  const leaf = {
    single: vi.fn().mockResolvedValue({ data: SESSION_ROW, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    eq: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return {
    rpc: vi.fn(async () => ({ error: rpcError })),
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => leaf), like: vi.fn(() => leaf) })),
    })),
  };
}

beforeEach(() => { vi.resetModules(); delete process.env.LEO_RELEASE_WORKITEM_RESET; });
afterEach(() => { vi.restoreAllMocks(); delete process.env.LEO_RELEASE_WORKITEM_RESET; });

describe('FR1B3: /claim release hands the work item back', () => {
  it('does NOT touch the work item when the flag is unset (default OFF)', async () => {
    mockModules();
    const { releaseClaim } = await import('./claim-command.js');
    await releaseClaim('sess-1');
    expect(handbackCalls).toHaveLength(0);
  });

  it('hands the item back AFTER the claim release, naming the mechanism', async () => {
    // Order matters: the handback predicate requires claiming_session_id IS NULL, so calling it
    // before release_sd would match nothing.
    process.env.LEO_RELEASE_WORKITEM_RESET = 'on';
    mockModules();
    const { releaseClaim } = await import('./claim-command.js');
    await releaseClaim('sess-1');
    expect(handbackCalls).toEqual([{ key: 'QF-20260726-175', reason: 'manual_claim_release' }]);
  });

  it('reports the reopen so the operator sees the item really came back', async () => {
    process.env.LEO_RELEASE_WORKITEM_RESET = 'on';
    mockModules({ action: 'qf_reopened' });
    const logs = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)));
    const { releaseClaim } = await import('./claim-command.js');
    await releaseClaim('sess-1');
    spy.mockRestore();
    expect(logs.join('\n')).toMatch(/returned to the open pool/);
  });

  it('surfaces a failed handback instead of silently claiming success', async () => {
    process.env.LEO_RELEASE_WORKITEM_RESET = 'on';
    mockModules({ ok: false, action: 'error', detail: 'db down' });
    const warns = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((m) => warns.push(String(m)));
    const { releaseClaim } = await import('./claim-command.js');
    await releaseClaim('sess-1');
    spy.mockRestore();
    expect(warns.join('\n')).toMatch(/work-item handback failed/);
  });
});

describe('FR1B3: claim-guard.mjs is an EXEMPT site, and the reason is recorded in the source', () => {
  const GUARD = readFileSync(path.resolve(HERE, '../claim-guard.mjs'), 'utf8');

  it('does not call the handback helper', () => {
    // claim-guard releases a prior holder's stale claim and then REACQUIRES the same item for
    // this session. Resetting to status='open' in that window would expose it to every other
    // picker between our release and our acquire — a steal race that does not exist today,
    // because an item left at in_progress is invisible to them.
    expect(GUARD).not.toMatch(/releaseWorkItemOnSessionEnd\s*\(/);
  });

  it('records WHY it is exempt, so the exemption survives a well-meaning future edit', () => {
    expect(GUARD).toMatch(/DELIBERATELY NOT a[\s\S]{0,80}releaseWorkItemOnSessionEnd call site/);
    expect(GUARD).toMatch(/release-then-REACQUIRE/);
  });
});
