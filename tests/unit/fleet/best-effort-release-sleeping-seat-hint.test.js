/**
 * SD-LEO-INFRA-FIX-CLAIM-EVICTION-001 (FR-5) — a seat sleeping on a claim-wakeup
 * (metadata.wind_down.had_claim===true, not yet active since that stop) whose claim is released
 * by bestEffortReleaseSd/bestEffortReleaseSdByKey receives a hint on its OWN session_coordination
 * lane, so its next /checkin surfaces it via pending_directives. An ORDINARY release by a
 * currently-awake session (heartbeat advanced past wind_down.at) must NOT fire the hint -- that
 * would be confusing noise on a routine /claim release.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/fleet/record-orphaned-worktree.mjs', () => ({ recordOrphanedWorktree: vi.fn() }));
const insertCoordinationRowMock = vi.fn(async () => ({}));
vi.mock('../../../lib/coordinator/dispatch.cjs', () => ({
  insertCoordinationRow: (...args) => insertCoordinationRowMock(...args),
}));

const { bestEffortReleaseSd, bestEffortReleaseSdByKey } = await import('../../../lib/fleet/best-effort-release.mjs');

const silent = () => {};
const AGO = (ms) => new Date(Date.now() - ms).toISOString();

function makeFrom(sessRow) {
  return vi.fn((table) => {
    if (table !== 'claude_sessions') throw new Error(`unexpected table: ${table}`);
    return {
      select: (cols) => ({
        eq: () => ({ maybeSingle: async () => ({ data: sessRow, error: null }) }),
      }),
    };
  });
}

describe('FR-5: sleeping-seat claim-removed hint', () => {
  it('fires the hint when the session was sleeping with had_claim=true and has NOT heartbeat since', async () => {
    insertCoordinationRowMock.mockClear();
    const sess = {
      sd_key: 'SD-SLEEPER-001', worktree_path: null, worktree_branch: null,
      metadata: { wind_down: { reason: 'turn_end_with_claim_wakeup_scheduled', at: AGO(600_000), had_claim: true } },
      heartbeat_at: AGO(700_000), // older than wind_down.at -- never woke since
    };
    const rpc = vi.fn(async () => ({ data: { success: true }, error: null }));
    const r = await bestEffortReleaseSd({ rpc, from: makeFrom(sess) }, 'sess-sleeper', 'stale_claim_sweep', silent, { expectedSdKey: 'SD-SLEEPER-001' });
    expect(r.released).toBe(true);
    expect(insertCoordinationRowMock).toHaveBeenCalledTimes(1);
    const call = insertCoordinationRowMock.mock.calls[0][1];
    expect(call.target_session).toBe('sess-sleeper');
    expect(call.payload).toMatchObject({ kind: 'coordinator_request', released_sd: 'SD-SLEEPER-001', reason: 'sleeping_seat_claim_removed' });
  });

  it('does NOT fire when the session has heartbeat AFTER wind_down.at (awake since, stale wind_down -- ordinary self-release)', async () => {
    insertCoordinationRowMock.mockClear();
    const sess = {
      sd_key: 'SD-AWAKE-001', worktree_path: null, worktree_branch: null,
      metadata: { wind_down: { reason: 'turn_end_with_claim_wakeup_scheduled', at: AGO(700_000), had_claim: true } },
      heartbeat_at: AGO(60_000), // newer than wind_down.at -- woke up and has been active since
    };
    const rpc = vi.fn(async () => ({ data: { success: true }, error: null }));
    const r = await bestEffortReleaseSd({ rpc, from: makeFrom(sess) }, 'sess-awake', 'manual', silent, { expectedSdKey: 'SD-AWAKE-001' });
    expect(r.released).toBe(true);
    expect(insertCoordinationRowMock).not.toHaveBeenCalled();
  });

  it('does NOT fire when had_claim is false or wind_down is absent', async () => {
    insertCoordinationRowMock.mockClear();
    const sess = { sd_key: 'SD-NOFLAG-001', worktree_path: null, worktree_branch: null, metadata: {}, heartbeat_at: AGO(60_000) };
    const rpc = vi.fn(async () => ({ data: { success: true }, error: null }));
    await bestEffortReleaseSd({ rpc, from: makeFrom(sess) }, 'sess-noflag', 'manual', silent, { expectedSdKey: 'SD-NOFLAG-001' });
    expect(insertCoordinationRowMock).not.toHaveBeenCalled();
  });

  it('bestEffortReleaseSdByKey also fires the hint on the same sleeping-seat condition', async () => {
    insertCoordinationRowMock.mockClear();
    const sameInstant = AGO(500_000); // genuinely equal (not two separate AGO() calls, which
    // would evaluate microseconds apart and make heartbeat_at spuriously "newer") --
    // equal timestamps must count as still-sleeping ("not newer than" is the guard condition).
    const sess = {
      worktree_path: null, worktree_branch: null,
      metadata: { wind_down: { reason: 'no_claim_idle', at: sameInstant, had_claim: true } },
      heartbeat_at: sameInstant,
    };
    const rpc = vi.fn(async () => ({ data: { success: true }, error: null }));
    const r = await bestEffortReleaseSdByKey({ rpc, from: makeFrom(sess) }, 'sess-sleeper-2', 'QF-SLEEPER-001', 'coordinator_park', silent);
    expect(r.released).toBe(true);
    expect(insertCoordinationRowMock).toHaveBeenCalledTimes(1);
    expect(insertCoordinationRowMock.mock.calls[0][1].payload.released_sd).toBe('QF-SLEEPER-001');
  });

  it('a hint failure is fail-soft: the release outcome is unaffected', async () => {
    insertCoordinationRowMock.mockClear();
    insertCoordinationRowMock.mockImplementationOnce(async () => { throw new Error('boom'); });
    const sess = {
      sd_key: 'SD-FAILHINT-001', worktree_path: null, worktree_branch: null,
      metadata: { wind_down: { reason: 'x', at: AGO(600_000), had_claim: true } },
      heartbeat_at: AGO(700_000),
    };
    const rpc = vi.fn(async () => ({ data: { success: true }, error: null }));
    const r = await bestEffortReleaseSd({ rpc, from: makeFrom(sess) }, 'sess-failhint', 'manual', silent, { expectedSdKey: 'SD-FAILHINT-001' });
    expect(r.released).toBe(true);
    expect(r.error).toBeNull();
  });

  it('does NOT fire when supabase has no .from (no capability to read wind_down state)', async () => {
    insertCoordinationRowMock.mockClear();
    const rpc = vi.fn(async () => ({ data: { success: true }, error: null }));
    const r = await bestEffortReleaseSd({ rpc }, 'sess-nofrom', 'manual', silent);
    expect(r.released).toBe(true);
    expect(insertCoordinationRowMock).not.toHaveBeenCalled();
  });
});
