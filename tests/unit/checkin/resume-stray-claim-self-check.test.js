// QF-20260912-502: a worker seat that self-claims a draft SD at a post-completion wake and
// then parks had no self-check -- SD-FDBK-ENH-COMPLETION-FLAG-HARNESS-001 sat claimed at 0%
// with no worktree and no commit for ~25 min until a coordinator nudge. This adds a
// checkin-time predicate (resume.cjs) that catches its OWN stray claim and releases it.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const resumeStep = require('../../../lib/checkin/steps/resume.cjs');
const { detectStrayUnworkedClaim } = resumeStep;

const NOW = Date.parse('2026-09-12T22:00:00Z');
const realNow = Date.now;

function makeSessionSb({ claimedAt, commitsSinceClaim = 0 }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { claimed_at: claimedAt, commits_since_claim: commitsSinceClaim }, error: null }),
        }),
      }),
    }),
  };
}

describe('detectStrayUnworkedClaim (QF-20260912-502)', () => {
  it('flags a stray claim: 0% progress, no worktree, no commits, older than the threshold', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const claimedAt = new Date(NOW - 20 * 60_000).toISOString(); // 20 min ago, threshold default 15
    const sb = makeSessionSb({ claimedAt, commitsSinceClaim: 0 });

    const reason = await detectStrayUnworkedClaim(sb, 'session-1', 'SD-STRAY-001', {
      existsSync: () => false, // no worktree
      getRepoRoot: () => '/fake/repo',
    });

    expect(reason).toMatch(/SD-STRAY-001/);
    expect(reason).toMatch(/20m ago/);
    Date.now = realNow;
  });

  it('does NOT flag when a worktree exists (real work may be in progress even with 0 commits)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const claimedAt = new Date(NOW - 20 * 60_000).toISOString();
    const sb = makeSessionSb({ claimedAt, commitsSinceClaim: 0 });

    const reason = await detectStrayUnworkedClaim(sb, 'session-1', 'SD-HAS-WORKTREE-001', {
      existsSync: () => true, // worktree exists
      getRepoRoot: () => '/fake/repo',
    });

    expect(reason).toBeNull();
    Date.now = realNow;
  });

  it('does NOT flag when a commit already landed since claim (even with no worktree found)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const claimedAt = new Date(NOW - 20 * 60_000).toISOString();
    const sb = makeSessionSb({ claimedAt, commitsSinceClaim: 1 });

    const reason = await detectStrayUnworkedClaim(sb, 'session-1', 'SD-HAS-COMMIT-001', {
      existsSync: () => false,
      getRepoRoot: () => '/fake/repo',
    });

    expect(reason).toBeNull();
    Date.now = realNow;
  });

  it('does NOT flag a claim younger than the threshold (default 15m)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const claimedAt = new Date(NOW - 5 * 60_000).toISOString(); // 5 min ago
    const sb = makeSessionSb({ claimedAt, commitsSinceClaim: 0 });

    const reason = await detectStrayUnworkedClaim(sb, 'session-1', 'SD-TOO-YOUNG-001', {
      existsSync: () => false,
      getRepoRoot: () => '/fake/repo',
    });

    expect(reason).toBeNull();
    Date.now = realNow;
  });

  it('honors STRAY_CLAIM_MINUTES override', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const claimedAt = new Date(NOW - 10 * 60_000).toISOString(); // 10 min ago
    const sb = makeSessionSb({ claimedAt, commitsSinceClaim: 0 });
    process.env.STRAY_CLAIM_MINUTES = '5';

    const reason = await detectStrayUnworkedClaim(sb, 'session-1', 'SD-CUSTOM-THRESHOLD-001', {
      existsSync: () => false,
      getRepoRoot: () => '/fake/repo',
    });

    delete process.env.STRAY_CLAIM_MINUTES;
    expect(reason).toMatch(/SD-CUSTOM-THRESHOLD-001/);
    Date.now = realNow;
  });
});

describe('resume.run() releases a stray claim end-to-end (QF-20260912-502)', () => {
  it('self-heals and signals the coordinator when the claim looks stray', async () => {
    const selfHealStaleClaim = vi.fn(async () => true);
    const sb = {
      from: (table) => {
        if (table === 'strategic_directives_v2') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'active', progress: 0 }, error: null }) }) }) };
        }
        if (table === 'claude_sessions') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { claimed_at: new Date(Date.now() - 20 * 60_000).toISOString(), commits_since_claim: 0 }, error: null }) }) }) };
        }
        throw new Error(`unmocked table: ${table}`);
      },
    };
    const ctx = {
      sb,
      sessionId: 'session-1',
      sessionRole: 'worker',
      coordinatorId: 'coord-1',
      mySd: 'SD-STRAY-002',
      base: {},
      helpers: {
        selfHealStaleClaim,
        ws: undefined, confirmRowGone: undefined, findOwnSdClaim: undefined,
        healOwnClaimPointer: undefined, extractDirectedSd: undefined, ASSIGNMENT_RECENCY_WINDOW_MS: 0,
        isBuildForbiddenSession: () => false, extractSdFromAssignment: () => null,
        isInformationalNudge: () => false, ackMessage: async () => {},
      },
    };

    // No mocking of fs/repo-paths/dispatch needed: 'SD-STRAY-002' is a fake key with no real
    // worktree on disk (existsSync genuinely returns false), and signalStrayClaimRelease's
    // insertCoordinationRow call is wrapped in .catch(() => {}) at the call site, so its
    // attempt to write against this test's incomplete fake `sb` (no 'session_coordination'
    // table) degrades exactly like a real write failure would in production -- best-effort,
    // never blocking the release itself.
    const result = await resumeStep.run(ctx);

    expect(selfHealStaleClaim).toHaveBeenCalledTimes(1);
    expect(selfHealStaleClaim).toHaveBeenCalledWith(sb, 'session-1', 'SD-STRAY-002');
    expect(ctx.base.self_healed_stray_claim).toMatchObject({ sd: 'SD-STRAY-002' });
    expect(ctx.mySd).toBeNull();
    expect(result).toBeUndefined(); // falls through to assignment/self-claim, never returns action:'resume'
  });
});
