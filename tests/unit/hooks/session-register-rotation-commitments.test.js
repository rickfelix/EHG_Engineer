/**
 * SD-LEO-INFRA-OPEN-COMMITMENTS-RECONCILED-001 / FR-5 — seat rotation hook.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { publishRotationCommitments } from '../../../scripts/hooks/session-register.cjs';

describe('publishRotationCommitments (FR-5)', () => {
  let stderrSpy;
  beforeEach(() => { stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true); });
  afterEach(() => { stderrSpy.mockRestore(); });

  function makeSupabase({ commitments, releasedOwners }) {
    return {
      from(table) {
        if (table === 'commitments') {
          return { select: () => ({ is: () => ({ limit: async () => ({ data: commitments }) }) }) };
        }
        if (table === 'claude_sessions') {
          return { select: () => ({ in: () => ({ not: async () => ({ data: releasedOwners }) }) }) };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
  }

  it('publishes one block naming every commitment owned by a now-released seat', async () => {
    const commitments = [
      { id: 'c1', owner_session: 'retired-1', subject: 'ship FR-4', due_by: null },
      { id: 'c2', owner_session: 'still-live', subject: 'unrelated', due_by: null },
    ];
    const releasedOwners = [{ session_id: 'retired-1' }];
    await publishRotationCommitments(makeSupabase({ commitments, releasedOwners }));

    const written = stderrSpy.mock.calls.map((c) => c[0]).join('');
    expect(written).toContain('SEAT ROTATION');
    expect(written).toContain('c1');
    expect(written).toContain('ship FR-4');
    expect(written).not.toContain('c2');
  });

  it('publishes nothing when no open commitment is owned by a released seat', async () => {
    const commitments = [{ id: 'c1', owner_session: 'still-live', subject: 'x', due_by: null }];
    await publishRotationCommitments(makeSupabase({ commitments, releasedOwners: [] }));
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('publishes nothing when there are no open commitments at all', async () => {
    await publishRotationCommitments(makeSupabase({ commitments: [], releasedOwners: [] }));
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('fails soft (never throws) when the query errors', async () => {
    const throwingSupabase = { from() { throw new Error('boom'); } };
    await expect(publishRotationCommitments(throwingSupabase)).resolves.toBeUndefined();
    expect(stderrSpy).toHaveBeenCalled();
    expect(stderrSpy.mock.calls[0][0]).toContain('rotation.open_commitments_failed');
  });
});
