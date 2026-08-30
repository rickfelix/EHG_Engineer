/**
 * SD-LEO-INFRA-OPEN-COMMITMENTS-RECONCILED-001 / FR-5 — seat rotation hook.
 *
 * VALIDATION finding (PLAN_VERIFICATION, evidence 191ea9a9): the first cut filtered only on
 * released_at IS NOT NULL, missing a dead-but-unreleased owner seat (the SD's own motivating
 * specimen). Now reuses classifyCommitmentLiveness (FR-1), so these fixtures exercise the
 * OR-leg explicitly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { publishRotationCommitments } from '../../../scripts/hooks/session-register.cjs';

const NOW_MS = Date.parse('2026-08-30T20:00:00Z');

describe('publishRotationCommitments (FR-5)', () => {
  let stderrSpy;
  let dateNowSpy;
  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
  });
  afterEach(() => { stderrSpy.mockRestore(); dateNowSpy.mockRestore(); });

  function makeSupabase({ commitments, ownerSessions }) {
    return {
      from(table) {
        if (table === 'commitments') {
          return { select: () => ({ is: () => ({ limit: async () => ({ data: commitments }) }) }) };
        }
        if (table === 'claude_sessions') {
          return { select: () => ({ in: () => ({ limit: async () => ({ data: ownerSessions }) }) }) };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
  }

  it('publishes a commitment owned by a released seat (released_at set)', async () => {
    const commitments = [
      { id: 'c1', owner_session: 'released-1', subject: 'ship FR-4', due_by: null },
      { id: 'c2', owner_session: 'still-live', subject: 'unrelated', due_by: null },
    ];
    const ownerSessions = [
      { session_id: 'released-1', released_at: '2026-08-30T19:00:00Z', last_tool_at: null },
      { session_id: 'still-live', released_at: null, last_tool_at: new Date(NOW_MS - 60_000).toISOString() },
    ];
    await publishRotationCommitments(makeSupabase({ commitments, ownerSessions }));

    const written = stderrSpy.mock.calls.map((c) => c[0]).join('');
    expect(written).toContain('SEAT ROTATION');
    expect(written).toContain('c1');
    expect(written).toContain('ship FR-4');
    expect(written).not.toContain('c2');
  });

  it('TS-2 shape: publishes a commitment whose owner is dead-but-unreleased (released_at=NULL, stale last_tool_at) via the classifySeat() OR-leg', async () => {
    const commitments = [{ id: 'c3', owner_session: 'f27a883d', subject: 'motivating specimen', due_by: null }];
    const ownerSessions = [
      { session_id: 'f27a883d', released_at: null, last_tool_at: new Date(NOW_MS - 300 * 60 * 1000).toISOString() },
    ];
    await publishRotationCommitments(makeSupabase({ commitments, ownerSessions }));

    const written = stderrSpy.mock.calls.map((c) => c[0]).join('');
    expect(written).toContain('c3');
  });

  it('publishes nothing when the owner is live (healthy, not released)', async () => {
    const commitments = [{ id: 'c1', owner_session: 'still-live', subject: 'x', due_by: null }];
    const ownerSessions = [{ session_id: 'still-live', released_at: null, last_tool_at: new Date(NOW_MS - 60_000).toISOString() }];
    await publishRotationCommitments(makeSupabase({ commitments, ownerSessions }));
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('publishes nothing when there are no open commitments at all', async () => {
    await publishRotationCommitments(makeSupabase({ commitments: [], ownerSessions: [] }));
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('names resolveCommitment() as the resolution mechanism in the published block', async () => {
    const commitments = [{ id: 'c1', owner_session: 'released-1', subject: 'x', due_by: null }];
    const ownerSessions = [{ session_id: 'released-1', released_at: '2026-08-30T19:00:00Z', last_tool_at: null }];
    await publishRotationCommitments(makeSupabase({ commitments, ownerSessions }));
    const written = stderrSpy.mock.calls.map((c) => c[0]).join('');
    expect(written).toContain('resolveCommitment()');
  });

  it('fails soft (never throws) when the query errors', async () => {
    const throwingSupabase = { from() { throw new Error('boom'); } };
    await expect(publishRotationCommitments(throwingSupabase)).resolves.toBeUndefined();
    expect(stderrSpy).toHaveBeenCalled();
    expect(stderrSpy.mock.calls[0][0]).toContain('rotation.open_commitments_failed');
  });
});
