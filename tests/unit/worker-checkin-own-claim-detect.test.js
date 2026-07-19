// SD-LEO-INFRA-CHECKIN-OWN-CLAIM-DETECT-001: worker-checkin own-claim SILENT-STARVE fix.
// claude_sessions.sd_key is only a CACHE of the authoritative claim (strategic_directives_v2
// .claiming_session_id, the same column sd:next and the coordinator read). Live incident: session
// e3ec24ab held an unworked claim for 4+ hours while checkin reported idle every tick, because the
// resume step (lib/checkin/steps/resume.cjs) gated entirely on the cache being non-null.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findOwnSdClaim, healOwnClaimPointer } = require('../../scripts/worker-checkin.cjs');

// Chainable supabase stub. select/eq/is are no-ops that return the chain; the terminal call
// (maybeSingle or select as a terminal after update) resolves the scripted result.
function stub({ selectResult, updateResult } = {}) {
  const calls = { eqArgs: [], isArgs: [], updateArgs: null };
  function selectChain() {
    const chain = {
      select() { return chain; },
      eq(...args) { calls.eqArgs.push(args); return chain; },
      limit() { return chain; },
      maybeSingle() { return Promise.resolve(selectResult || { data: null, error: null }); },
    };
    return chain;
  }
  function updateChain() {
    const chain = {
      update(payload) { calls.updateArgs = payload; return chain; },
      eq(...args) { calls.eqArgs.push(args); return chain; },
      is(...args) { calls.isArgs.push(args); return chain; },
      select() { return Promise.resolve(updateResult || { data: [], error: null }); },
    };
    return chain;
  }
  return { sb: { from: () => (updateResult !== undefined ? updateChain() : selectChain()) }, calls };
}

describe('findOwnSdClaim — authoritative SD-side claim lookup', () => {
  it('returns the sd_key when strategic_directives_v2 says this session holds a live claim', async () => {
    const { sb, calls } = stub({ selectResult: { data: { sd_key: 'SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001' }, error: null } });
    const result = await findOwnSdClaim(sb, 'e3ec24ab-296d-4b26-8f55-f6ee792dda74');
    expect(result).toBe('SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001');
    expect(calls.eqArgs).toContainEqual(['claiming_session_id', 'e3ec24ab-296d-4b26-8f55-f6ee792dda74']);
    expect(calls.eqArgs).toContainEqual(['is_working_on', true]);
  });

  it('returns null when no SD row claims this session (genuinely idle)', async () => {
    const { sb } = stub({ selectResult: { data: null, error: null } });
    expect(await findOwnSdClaim(sb, 'some-session')).toBeNull();
  });

  it('fails open (null) on a query error — never turns a checkin into action=error', async () => {
    const { sb } = stub({ selectResult: { data: null, error: { message: 'timeout' } } });
    expect(await findOwnSdClaim(sb, 'some-session')).toBeNull();
  });

  it('fails open (null) on a thrown exception', async () => {
    const sb = { from: () => { throw new Error('network down'); } };
    expect(await findOwnSdClaim(sb, 'some-session')).toBeNull();
  });
});

describe('healOwnClaimPointer — converge the session-side cache onto the authoritative claim', () => {
  it('writes ONLY sd_key (never worktree_path/worktree_branch) and CAS-guards on a NULL cache', async () => {
    const { sb, calls } = stub({ updateResult: { data: [{ session_id: 'e3ec24ab-296d-4b26-8f55-f6ee792dda74' }], error: null } });
    const healed = await healOwnClaimPointer(sb, 'e3ec24ab-296d-4b26-8f55-f6ee792dda74', 'SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001');
    expect(healed).toBe(true);
    expect(calls.updateArgs).toEqual({ sd_key: 'SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001' });
    expect(Object.keys(calls.updateArgs)).not.toContain('worktree_path');
    expect(Object.keys(calls.updateArgs)).not.toContain('worktree_branch');
    expect(calls.isArgs).toContainEqual(['sd_key', null]);
  });

  it('returns false (silent-no-op detected) when the CAS finds no row to update — race lost to a concurrent write', async () => {
    const { sb } = stub({ updateResult: { data: [], error: null } });
    expect(await healOwnClaimPointer(sb, 'sess', 'SD-X')).toBe(false);
  });

  it('returns false on an update error', async () => {
    const { sb } = stub({ updateResult: { data: null, error: { message: 'constraint violation' } } });
    expect(await healOwnClaimPointer(sb, 'sess', 'SD-X')).toBe(false);
  });

  it('returns false (fail-open) on a thrown exception', async () => {
    const sb = { from: () => { throw new Error('network down'); } };
    expect(await healOwnClaimPointer(sb, 'sess', 'SD-X')).toBe(false);
  });
});

describe('resume.cjs step — SILENT-STARVE reproduction and fix (reproduces the Golf-2/e3ec24ab incident shape)', () => {
  async function runResumeStep(ctx) {
    const resumeStep = require('../../lib/checkin/steps/resume.cjs');
    return resumeStep.run(ctx);
  }

  it('a session with claiming_session_id=self, is_working_on=true, and a NULL cache resumes (not idle)', async () => {
    const findOwnSdClaim = vi.fn(async () => 'SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001');
    const healOwnClaimPointer = vi.fn(async () => true);
    const sdStatusStub = {
      from: () => ({
        select() { return this; },
        eq() { return this; },
        maybeSingle: () => Promise.resolve({ data: { status: 'draft' }, error: null }),
      }),
    };
    const ctx = {
      sb: sdStatusStub,
      sessionId: 'e3ec24ab-296d-4b26-8f55-f6ee792dda74',
      sessionRole: null,
      mySd: null, // the bug reproduction: cache is empty
      base: {},
      helpers: {
        ws: { getMessagesForSession: vi.fn(async () => []) },
        confirmRowGone: vi.fn(async () => false),
        selfHealStaleClaim: vi.fn(async () => {}),
        findOwnSdClaim,
        healOwnClaimPointer,
        extractDirectedSd: () => null,
        ASSIGNMENT_RECENCY_WINDOW_MS: 3600000,
      },
    };
    const result = await runResumeStep(ctx);
    expect(findOwnSdClaim).toHaveBeenCalledWith(sdStatusStub, 'e3ec24ab-296d-4b26-8f55-f6ee792dda74');
    expect(healOwnClaimPointer).toHaveBeenCalledWith(sdStatusStub, 'e3ec24ab-296d-4b26-8f55-f6ee792dda74', 'SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001');
    expect(result.action).toBe('resume');
    expect(result.sd).toBe('SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001');
    expect(ctx.base.self_healed_own_claim_pointer).toEqual({ sd: 'SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001', cache_updated: true });
  });

  it('a session with NO SD-side claim and a NULL cache falls through (undefined) — genuinely idle, not resumed', async () => {
    const findOwnSdClaim = vi.fn(async () => null);
    const healOwnClaimPointer = vi.fn(async () => false);
    const ctx = {
      sb: {},
      sessionId: 'genuinely-idle-session',
      sessionRole: null,
      mySd: null,
      base: {},
      helpers: {
        ws: { getMessagesForSession: vi.fn(async () => []) },
        confirmRowGone: vi.fn(async () => false),
        selfHealStaleClaim: vi.fn(async () => {}),
        findOwnSdClaim,
        healOwnClaimPointer,
        extractDirectedSd: () => null,
        ASSIGNMENT_RECENCY_WINDOW_MS: 3600000,
      },
    };
    const result = await runResumeStep(ctx);
    expect(healOwnClaimPointer).not.toHaveBeenCalled(); // never heals when there's nothing to heal onto
    expect(result).toBeUndefined(); // falls through to later pipeline steps (directed-assignment, self-claim, idle)
    expect(ctx.mySd).toBeNull();
  });

  it('does NOT consult findOwnSdClaim at all when the cache is already populated (byte-identical fast path preserved)', async () => {
    const findOwnSdClaim = vi.fn(async () => 'SHOULD-NOT-BE-CALLED');
    const ctx = {
      sb: {
        from: () => ({
          select() { return this; },
          eq() { return this; },
          maybeSingle: () => Promise.resolve({ data: { status: 'draft' }, error: null }),
        }),
      },
      sessionId: 'sess',
      sessionRole: null,
      mySd: 'SD-ALREADY-CACHED-001', // cache already populated -> this is the pre-existing fast path
      base: {},
      helpers: {
        ws: { getMessagesForSession: vi.fn(async () => []) },
        confirmRowGone: vi.fn(async () => false),
        selfHealStaleClaim: vi.fn(async () => {}),
        findOwnSdClaim,
        healOwnClaimPointer: vi.fn(),
        extractDirectedSd: () => null,
        ASSIGNMENT_RECENCY_WINDOW_MS: 3600000,
      },
    };
    const result = await runResumeStep(ctx);
    expect(findOwnSdClaim).not.toHaveBeenCalled();
    expect(result.action).toBe('resume');
    expect(result.sd).toBe('SD-ALREADY-CACHED-001');
    expect(ctx.base.self_healed_own_claim_pointer).toBeUndefined();
  });

  // QF-20260719-406: quick_fixes.status='closed' (the sanctioned _close-qf one-off outcome for
  // a QF whose fix already landed before it was claimed) was missing from the QF terminal-status
  // allowlist, so checkin looped action=resume forever on a just-closed QF.
  it('self-heals and falls through when the cached QF claim is status=closed (does NOT loop resume)', async () => {
    const selfHealStaleClaim = vi.fn(async () => {});
    const ctx = {
      sb: {
        from: () => ({
          select() { return this; },
          eq() { return this; },
          maybeSingle: () => Promise.resolve({ data: { status: 'closed' }, error: null }),
        }),
      },
      sessionId: 'sess',
      sessionRole: null,
      mySd: 'QF-20260719-635', // cache still points at the just-closed QF
      base: {},
      helpers: {
        ws: { getMessagesForSession: vi.fn(async () => []) },
        confirmRowGone: vi.fn(async () => false),
        selfHealStaleClaim,
        findOwnSdClaim: vi.fn(),
        healOwnClaimPointer: vi.fn(),
        extractDirectedSd: () => null,
        ASSIGNMENT_RECENCY_WINDOW_MS: 3600000,
      },
    };
    const result = await runResumeStep(ctx);
    expect(selfHealStaleClaim).toHaveBeenCalledWith(ctx.sb, 'sess', 'QF-20260719-635');
    expect(ctx.base.self_healed_stale_claim).toBe('QF-20260719-635');
    expect(ctx.mySd).toBeNull(); // falls through to assignment / self-claim, not resume
    expect(result).toBeUndefined();
  });
});
