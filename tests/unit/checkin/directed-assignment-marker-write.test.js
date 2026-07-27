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
 * actually missing: assert that the directed-dispatch path stamps the marker on a real claim.
 * Without these, the fix would be the "half-fix that reads as complete" the row warns about —
 * a gauge made writeable but with nothing proving anything can write it.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveCheckin } = require('../../../scripts/worker-checkin.cjs');

/**
 * @param {object} opts
 * @param {object|null} opts.sdRow - what strategic_directives_v2 returns for the assigned key
 * @param {object[]} opts.updates  - sink; every .update() payload is recorded here
 */
function fakeSb({ sdRow, assignedKey, updates }) {
  // Model the SD row as SERVER-SIDE state with last-write-wins semantics, rather than handing
  // back one shared object. That distinction is the whole point: claim_sd appends claim_history
  // server-side during tryClaim, so a writer that merges into its own PRE-claim snapshot would
  // clobber that entry. A shared-reference fake hides the clobber (the mutation is visible to
  // everyone); this one surfaces it, because a stale-snapshot merge really does drop keys.
  let serverMetadata = sdRow ? { ...(sdRow.metadata || {}) } : null;
  return {
    // claim_sd succeeds; the claim_history append that makes the pre-claim snapshot stale is
    // issued by tryClaim as its own .update() below, so it flows through serverMetadata
    // naturally — no need to simulate it here as well.
    rpc: () => Promise.resolve({ data: { success: true }, error: null }),
    from(table) {
      // Track the eq() filters: the directed-assignment step looks the SD up BY sd_key, while
      // earlier pipeline steps (e.g. resume) query the same table on other columns. Returning
      // sdRow for every query on strategic_directives_v2 makes resume match first and the run
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
            // DEEP COPY per fetch. A real supabase-js client deserializes fresh objects, so two
            // fetches never share references. Handing out one shared object instead would let an
            // in-place mutation by an intervening writer (tryClaim appends claim_history that
            // way) retroactively "update" an older snapshot — which silently hides the very
            // stale-read bug these assertions exist to catch.
            return Promise.resolve({ data: { ...sdRow, metadata: structuredClone(serverMetadata) }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert() { return Promise.resolve({ error: null }); },
        update(payload) {
          updates.push({ table, payload });
          if (table === 'strategic_directives_v2' && payload && payload.metadata) serverMetadata = payload.metadata;
          return { eq() { return Promise.resolve({ error: null }); } };
        },
      };
    },
    finalMetadata: () => serverMetadata,
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
    return { res, updates, finalMetadata: sb.finalMetadata() };
  } finally {
    ws.getMessagesForSession = orig;
  }
}

describe('directed-assignment step writes the directed_assignment marker (QF-20260727-978)', () => {
  it('stamps directed_assignment=true on the SD when a directed WORK_ASSIGNMENT is claimed', async () => {
    const { res, finalMetadata } = await runDirectedClaim({
      assignedKey: 'SD-DIRECTED-001',
      sdRow: { status: 'in_progress', sd_type: 'feature', sd_key: 'SD-DIRECTED-001', metadata: {}, target_application: null },
    });
    expect(res.action).toBe('claimed_assignment');
    // Assert the SETTLED row, not just that some update was issued — what the gauge later reads
    // is the final state, and several writes land on this row during one claim.
    expect(finalMetadata.directed_assignment, 'the directed path must write the marker the gauge reads').toBe(true);
  });

  it('MERGES into the POST-claim metadata, preserving the claim_history claim_sd just appended', async () => {
    // metadata carries claim_history, target_repos, do_not_accept and much else. Two ways to
    // break it: a bare { directed_assignment: true } write, or — subtler and the one that bit
    // during development — merging into the snapshot fetched BEFORE tryClaim, which drops the
    // claim-history entry claim_sd wrote server-side in between.
    const { finalMetadata } = await runDirectedClaim({
      assignedKey: 'SD-DIRECTED-002',
      sdRow: {
        status: 'in_progress', sd_type: 'feature', sd_key: 'SD-DIRECTED-002', target_application: null,
        metadata: { claim_history: [{ session_id: 'prior' }], sourced_by: 'adam', dispatch_reason_band: 'chairman-directed' },
      },
    });
    expect(finalMetadata.directed_assignment).toBe(true);
    expect(finalMetadata.sourced_by).toBe('adam');
    expect(finalMetadata.dispatch_reason_band).toBe('chairman-directed');
    // Both the pre-existing entry AND the one appended by the claim must survive. Merging into
    // the pre-claim snapshot instead would leave only the 'prior' entry — this is the assertion
    // that fails on the stale-snapshot version of the writer.
    expect(finalMetadata.claim_history).toHaveLength(2);
    expect(finalMetadata.claim_history[0]).toEqual({ session_id: 'prior' });
    expect(finalMetadata.claim_history[1].session_id).toBe('sess-worker-1');
  });

  it('does NOT attempt the stamp for a directed QUICK-FIX assignment', async () => {
    // A QF key genuinely misses in strategic_directives_v2 (no row, no error), and quick_fixes
    // has no metadata column to carry the marker. Writing anything here would be inventing a
    // row. This is exactly the population limit deriveDispatchReasons now names out loud.
    const { res, updates } = await runDirectedClaim({ assignedKey: 'QF-20260727-978', sdRow: null });
    expect(res.action).toBe('claimed_assignment');
    expect(updates.find(u => u.table === 'strategic_directives_v2' && u.payload?.metadata)).toBeUndefined();
  });
});
