/**
 * QF-20260727-978 — the coordinator-health gauge read metadata.directed_assignment, and NOTHING
 * in the repo ever wrote it. Four occurrences on origin/main: two reads
 * (coordinator-health-sharpenings.mjs:167 classifyDispatchReason, :190 deriveDispatchReasons),
 * one comment, one test fixture. So deriveDispatchReasons' direct_dispatch counter was
 * structurally pinned at 0 — the arithmetic of an absent field, not a measurement of dispatch
 * behaviour — and it read as a finding ("the coordinator never direct-dispatches") because the
 * surrounding comment says self-claim is the ~95% majority.
 *
 * The reader half was already covered. THIS file covers the WRITER, which is the half that was
 * actually missing. Without it the fix would be the "half-fix that reads as complete" the row
 * warns about: a gauge made writeable, with nothing proving anything can write it.
 *
 * The write MUST go through the atomic jsonb-merge helper. strategic_directives_v2.metadata is
 * a shared blob (claim_history, coordinator hold flags, provenance) and a read-spread-write
 * built from a snapshot silently clobbers or resurrects sibling keys — QF-20260720-597, which
 * safe-metadata-merge.mjs exists to prevent. The last test pins that mechanic so a future edit
 * cannot quietly regress to `.update({ metadata: {...spread} })`.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveCheckin, CHECKIN_HELPERS } = require('../../../scripts/worker-checkin.cjs');

// Override on the shared helpers object the pipeline injects as ctx.helpers — the same
// override pattern the sibling checkin tests use for ws.getMessagesForSession. Necessary
// rather than stylistic: the real helper reaches safe-metadata-merge.mjs (ESM) through a
// dynamic import inside a CJS module, which the runner's module registry cannot intercept,
// so a vi.mock would silently no-op and the call would attempt a live pg connection.
const mergeCalls = [];
const realStamp = CHECKIN_HELPERS.stampDirectedAssignment;
CHECKIN_HELPERS.stampDirectedAssignment = async (sdKey, patch = { directed_assignment: true }) => {
  mergeCalls.push({ sdKey, patch });
  return { merged: true, sdKey };
};
afterAll(() => { CHECKIN_HELPERS.stampDirectedAssignment = realStamp; });

function fakeSb({ sdRow, assignedKey, updates }) {
  return {
    rpc: () => Promise.resolve({ data: { success: true }, error: null }),
    from(table) {
      // Track the eq() filters: the directed-assignment step looks the SD up BY sd_key, while
      // earlier pipeline steps (e.g. resume) query the same table on other columns. Serving
      // sdRow for every strategic_directives_v2 query makes resume match first and the run
      // never reaches the branch under test — so the row is served only for the sd_key lookup.
      const filters = {};
      return {
        select() { return this; }, gte() { return this; },
        order() { return this; }, limit() { return this; }, is() { return this; },
        eq(col, val) { filters[col] = val; return this; },
        maybeSingle() {
          if (table === 'claude_sessions') return Promise.resolve({ data: { metadata: { role: 'worker' }, sd_key: null }, error: null });
          if (table === 'strategic_directives_v2') {
            if (filters.sd_key !== assignedKey || !sdRow) return Promise.resolve({ data: null, error: null });
            return Promise.resolve({ data: structuredClone(sdRow), error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert() { return Promise.resolve({ error: null }); },
        update(payload) { updates.push({ table, payload }); return { eq() { return Promise.resolve({ error: null }); } }; },
      };
    },
  };
}

async function runDirectedClaim({ sdRow, assignedKey }) {
  const updates = [];
  const sb = fakeSb({ sdRow, assignedKey, updates });
  const ws = require('../../../lib/fleet/worker-status.cjs');
  const orig = ws.getMessagesForSession;
  ws.getMessagesForSession = async () => [
    { id: 'msg-directed-1', message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: assignedKey } },
  ];
  try {
    const res = await resolveCheckin(sb, 'sess-worker-1', { getCoordinator: async () => null });
    return { res, updates };
  } finally {
    ws.getMessagesForSession = orig;
  }
}

const SD_ROW = (key, metadata = {}) => ({
  status: 'in_progress', sd_type: 'feature', sd_key: key, target_application: null, metadata,
});

describe('directed-assignment step writes the directed_assignment marker (QF-20260727-978)', () => {
  beforeEach(() => { mergeCalls.length = 0; });

  it('stamps directed_assignment=true on the SD when a directed WORK_ASSIGNMENT is claimed', async () => {
    const { res } = await runDirectedClaim({ assignedKey: 'SD-DIRECTED-001', sdRow: SD_ROW('SD-DIRECTED-001') });
    expect(res.action).toBe('claimed_assignment');
    expect(mergeCalls, 'the directed path must write the marker the gauge reads').toHaveLength(1);
    expect(mergeCalls[0].sdKey).toBe('SD-DIRECTED-001');
    expect(mergeCalls[0].patch.directed_assignment).toBe(true);
  });

  it('patches ONLY that key — never a full-blob write that could clobber siblings', async () => {
    // The hazard is concrete: claim_sd appends claim_history server-side during the tryClaim
    // immediately before this, and coordinator hold flags can clear concurrently. A patch
    // carrying anything beyond the marker means someone rebuilt the blob from a snapshot.
    await runDirectedClaim({
      assignedKey: 'SD-DIRECTED-002',
      sdRow: SD_ROW('SD-DIRECTED-002', {
        claim_history: [{ session_id: 'prior' }], sourced_by: 'adam',
        dispatch_reason_band: 'chairman-directed', needs_coordinator_review: false,
      }),
    });
    expect(mergeCalls).toHaveLength(1);
    expect(Object.keys(mergeCalls[0].patch)).toEqual(['directed_assignment']);
  });

  it('does NOT attempt the stamp for a directed QUICK-FIX assignment', async () => {
    // A QF key genuinely misses in strategic_directives_v2 (no row, no error), and quick_fixes
    // has no metadata column to carry the marker. Writing anything here would be inventing a
    // row. This is exactly the population limit deriveDispatchReasons now names out loud.
    const { res } = await runDirectedClaim({ assignedKey: 'QF-20260727-978', sdRow: null });
    expect(res.action).toBe('claimed_assignment');
    expect(mergeCalls).toHaveLength(0);
  });

  it('does not reintroduce a read-spread-write of the metadata blob', async () => {
    // Regression pin for the mandated mechanic (QF-20260720-597): the marker must never be
    // written by a .update({ metadata: ... }) issued from this step. tryClaim legitimately
    // writes claim_history that way; what must not appear is a SECOND metadata write carrying
    // directed_assignment.
    const { updates } = await runDirectedClaim({ assignedKey: 'SD-DIRECTED-003', sdRow: SD_ROW('SD-DIRECTED-003') });
    const blobWrites = updates.filter(u => u.table === 'strategic_directives_v2'
      && u.payload?.metadata && 'directed_assignment' in u.payload.metadata);
    expect(blobWrites).toEqual([]);
  });
});
