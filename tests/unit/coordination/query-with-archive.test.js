// SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-D (FR-3 / TS-4)
import { describe, it, expect } from 'vitest';
import { queryWithArchive } from '../../../lib/coordination/query-with-archive.cjs';

function fakeSupabase({ liveRows, archiveRows, liveError, archiveError }) {
  return {
    from(table) {
      const isArchive = table === 'session_coordination_archive';
      const query = {
        select: () => query,
        eq: () => query,
        then(resolve) {
          const result = isArchive
            ? { data: archiveRows ?? [], error: archiveError ?? null }
            : { data: liveRows ?? [], error: liveError ?? null };
          return Promise.resolve(result).then(resolve);
        },
      };
      return query;
    },
  };
}

const identityBuild = (q) => q.select('*');

describe('queryWithArchive', () => {
  it('merges live and archive rows into one result set', async () => {
    const supabase = fakeSupabase({
      liveRows: [{ id: 'live-1' }],
      archiveRows: [{ id: 'archived-1' }],
    });
    const result = await queryWithArchive(supabase, identityBuild);
    expect(result.noData).toBe(false);
    expect(result.rows).toEqual([{ id: 'live-1' }, { id: 'archived-1' }]);
  });

  it('is byte-identical to a live-only query when the archive is empty (pre-retention-job reality)', async () => {
    const supabase = fakeSupabase({ liveRows: [{ id: 'live-1' }, { id: 'live-2' }], archiveRows: [] });
    const result = await queryWithArchive(supabase, identityBuild);
    expect(result.rows).toEqual([{ id: 'live-1' }, { id: 'live-2' }]);
  });

  it('skips the archive query entirely when includeArchive is false', async () => {
    let archiveQueried = false;
    const supabase = {
      from(table) {
        if (table === 'session_coordination_archive') archiveQueried = true;
        const query = {
          select: () => query,
          then(resolve) {
            return Promise.resolve({ data: [{ id: 'live-1' }], error: null }).then(resolve);
          },
        };
        return query;
      },
    };
    const result = await queryWithArchive(supabase, identityBuild, { includeArchive: false });
    expect(result.rows).toEqual([{ id: 'live-1' }]);
    expect(archiveQueried).toBe(false);
  });

  it('returns noData:true when the live query fails, never a false-clean report', async () => {
    const supabase = fakeSupabase({ liveError: { message: 'connection refused' } });
    const result = await queryWithArchive(supabase, identityBuild);
    expect(result.noData).toBe(true);
    expect(result.reason).toContain('connection refused');
  });

  it('returns noData:true when the archive query fails', async () => {
    const supabase = fakeSupabase({ liveRows: [{ id: 'live-1' }], archiveError: { message: 'archive table missing' } });
    const result = await queryWithArchive(supabase, identityBuild);
    expect(result.noData).toBe(true);
    expect(result.reason).toContain('archive table missing');
  });
});
