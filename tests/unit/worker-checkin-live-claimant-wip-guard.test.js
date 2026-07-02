/**
 * Unit pins for the stealer-side claim guard: refuse to steal from a live claimant with WIP.
 * SD-LEO-INFRA-RECLAIM-STEAL-LIVE-CLAIMANT-WIP-GUARD-001 (FR-3).
 *
 * foreignClaimantBlocksSteal/isForeignSessionLive take injectable isSessionAliveFn/hasWipFn
 * params (same DI pattern as lib/claim/wip-detector.cjs's runGit/runGh) -- fakes are passed
 * directly rather than via vi.mock, since vi.mock does not reliably intercept a CJS require()
 * graph the way it does ESM imports in this repo's vitest config.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { foreignClaimantBlocksSteal, isForeignSessionLive } = require('../../scripts/worker-checkin.cjs');

const alive = (reason = 'fresh_heartbeat') => () => ({ alive: true, reason });
const dead = () => () => ({ alive: false, reason: null });
const wip = (has, reasons = []) => () => ({ hasWip: has, reasons });

/** Chainable Supabase stub covering v_active_sessions + claude_sessions reads. */
function makeSupabase({ activeSession = null, worktreePath = '/some/worktree' } = {}) {
  function from(table) {
    if (table === 'v_active_sessions') {
      return {
        select: () => ({
          eq: () => ({
            neq: () => ({
              limit: async () => ({ data: activeSession ? [activeSession] : [] }),
            }),
          }),
        }),
      };
    }
    if (table === 'claude_sessions') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { worktree_path: worktreePath } }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  }
  return { from };
}

describe('foreignClaimantBlocksSteal (adoptOrphanInProgress\'s TTL-lapsed steal guard)', () => {
  it('TS-1: live claimant with WIP -> blocks the steal (refuses)', async () => {
    const sb = makeSupabase({ activeSession: { session_id: 'peer-1', current_branch: 'feat/x' } });
    const blocked = await foreignClaimantBlocksSteal(sb, 'SD-X-001', 'me', alive(), wip(true, ['uncommitted_changes']));
    expect(blocked).toBe(true);
  });

  it('TS-2: dead claimant, no WIP -> does NOT block (steal proceeds)', async () => {
    const sb = makeSupabase({ activeSession: { session_id: 'peer-2', current_branch: 'feat/y' } });
    let wipCalled = false;
    const blocked = await foreignClaimantBlocksSteal(sb, 'SD-Y-001', 'me', dead(), () => { wipCalled = true; return { hasWip: false, reasons: [] }; });
    expect(blocked).toBe(false);
    expect(wipCalled).toBe(false); // dead short-circuits before the WIP check
  });

  it('TS-3: live claimant with ONLY an open PR (open-PR-only WIP) -> still blocks', async () => {
    const sb = makeSupabase({ activeSession: { session_id: 'peer-3', current_branch: 'feat/z' } });
    const blocked = await foreignClaimantBlocksSteal(sb, 'SD-Z-001', 'me', alive('pid_alive'), wip(true, ['open_pr']));
    expect(blocked).toBe(true);
  });

  it('a live claimant that is WIP-less does NOT block the steal', async () => {
    const sb = makeSupabase({ activeSession: { session_id: 'peer-4', current_branch: 'feat/w' } });
    const blocked = await foreignClaimantBlocksSteal(sb, 'SD-W-001', 'me', alive(), wip(false));
    expect(blocked).toBe(false);
  });

  it('no foreign session record at all -> does NOT block (nothing to protect)', async () => {
    const sb = makeSupabase({ activeSession: null });
    let aliveCalled = false;
    const blocked = await foreignClaimantBlocksSteal(sb, 'SD-NONE-001', 'me', () => { aliveCalled = true; return { alive: true }; });
    expect(blocked).toBe(false);
    expect(aliveCalled).toBe(false);
  });

  it('fails open: a thrown error from the guard never blocks the steal', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    const blocked = await foreignClaimantBlocksSteal(sb, 'SD-ERR-001', 'me');
    expect(blocked).toBe(false);
  });
});

describe('isForeignSessionLive (isSdInFlight\'s dedup guard -- deliberately NO WIP requirement)', () => {
  it('a live foreign session blocks dedup even with zero WIP (just-started peer)', async () => {
    const sb = makeSupabase({ activeSession: { session_id: 'peer-5', current_branch: '' } });
    const live = await isForeignSessionLive(sb, 'SD-Q-001', 'me', alive());
    expect(live).toBe(true);
  });

  it('a dead foreign session does not block dedup', async () => {
    const sb = makeSupabase({ activeSession: { session_id: 'peer-6', current_branch: 'feat/q' } });
    const live = await isForeignSessionLive(sb, 'SD-R-001', 'me', dead());
    expect(live).toBe(false);
  });

  it('no foreign session -> not live', async () => {
    const sb = makeSupabase({ activeSession: null });
    const live = await isForeignSessionLive(sb, 'SD-S-001', 'me');
    expect(live).toBe(false);
  });
});
