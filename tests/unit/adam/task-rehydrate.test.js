/**
 * Unit pins for the Adam task-board REHYDRATION from the three live sources.
 * SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-A (Child A / FR-5).
 *
 * Mocks supabase (no live DB): a table-keyed stub serves the coordination + SD sources and an
 * in-memory ledger whose upsert dedups on (source_kind, source_ref). Asserts each source produces
 * exactly one board node and that a second run is a no-op (dedup).
 */
import { describe, it, expect } from 'vitest';
import { rehydrateBoard } from '../../../lib/adam/task-rehydrate.js';

/** Read builder: chainable no-op filters, thenable to the seeded rows. */
function readBuilder(data) {
  const b = {
    select: () => b, eq: () => b, in: () => b, is: () => b, not: () => b,
    order: () => b, limit: () => b,
    then: (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return b;
}

function makeSupabase({ coordination = [], sds = [] } = {}) {
  const ledger = [];
  const keyOf = (r) => `${r.source_kind}|${r.source_ref}`;
  function from(table) {
    if (table === 'adam_task_ledger') {
      return {
        upsert(row) {
          return {
            select() {
              return {
                single: async () => {
                  const existing = ledger.find((r) => keyOf(r) === keyOf(row));
                  if (existing) { Object.assign(existing, row); return { data: existing, error: null }; }
                  const created = { id: `id-${ledger.length + 1}`, status: 'open', ...row };
                  ledger.push(created);
                  return { data: created, error: null };
                },
              };
            },
          };
        },
      };
    }
    if (table === 'session_coordination') return readBuilder(coordination);
    if (table === 'strategic_directives_v2') return readBuilder(sds);
    return readBuilder([]);
  }
  return { from, _ledger: ledger };
}

/** The 3-source fixture: 1 OPEN reply-requested thread, 1 RESOLVED thread, 1 adam-sourced SD, 1 other SD. */
function fixture() {
  return {
    coordination: [
      // (a)+(c) OPEN Adam thread that explicitly requested a reply, no reply yet
      { id: 'sc1', sender_type: 'adam', payload: { correlation_id: 'corr-open', reply_requested: true, subject: 'Decision needed on X' } },
      // RESOLVED Adam thread (corr-done) — a coordinator reply row closes it => must be EXCLUDED
      { id: 'sc2', sender_type: 'adam', payload: { correlation_id: 'corr-done', subject: 'Old question' } },
      { id: 'sc3', sender_type: 'coordinator', payload: { reply_to: 'corr-done', body: 'answered' } },
    ],
    sds: [
      // (b) open Adam-sourced SD => included
      { sd_key: 'SD-ADAM-OPEN', title: 'Adam-sourced open work', status: 'draft', metadata: { sourced_by: 'adam' } },
      // non-matching SD (not adam-sourced / not open) => excluded
      { sd_key: 'SD-OTHER', title: 'Coordinator work', status: 'completed', metadata: { sourced_by: 'coordinator' } },
    ],
  };
}

describe('rehydrateBoard — reconstruct from the 3 live sources', () => {
  it('an unresolved advisory thread + an open adam-sourced SD + an awaited-reply marker each produce exactly one node', async () => {
    const sb = makeSupabase(fixture());
    const summary = await rehydrateBoard(sb);

    // Exactly 3 nodes — one per source kind.
    expect(sb._ledger).toHaveLength(3);
    const byKind = Object.fromEntries(sb._ledger.map((r) => [r.source_kind, r]));
    expect(byKind.advisory_thread.source_ref).toBe('corr-open');
    expect(byKind.awaited_reply.source_ref).toBe('corr-open');
    expect(byKind.awaited_reply.blocker).toMatch(/awaiting reply/i);
    expect(byKind.sourced_sd.source_ref).toBe('SD-ADAM-OPEN');
    // all rehydrated nodes are chairman-visible parents
    expect(sb._ledger.every((r) => r.tier === 'parent')).toBe(true);

    // Summary counts
    expect(summary.threads).toBe(1);
    expect(summary.awaited).toBe(1);
    expect(summary.sds).toBe(1);
    expect(summary.parents).toBe(3);
    expect(summary.errors).toHaveLength(0);
  });

  it('excludes a resolved thread (a reply matched its correlation_id) and a non-adam / closed SD', async () => {
    const sb = makeSupabase(fixture());
    await rehydrateBoard(sb);
    const refs = sb._ledger.map((r) => r.source_ref);
    expect(refs).not.toContain('corr-done');   // resolved thread excluded
    expect(refs).not.toContain('SD-OTHER');    // non-adam, completed SD excluded
  });

  it('is idempotent — a second run is a no-op (dedup via the natural key)', async () => {
    const sb = makeSupabase(fixture());
    await rehydrateBoard(sb);
    expect(sb._ledger).toHaveLength(3);
    const idsAfterFirst = sb._ledger.map((r) => r.id).sort();
    const summary2 = await rehydrateBoard(sb);
    expect(sb._ledger).toHaveLength(3);                       // no duplicates added
    expect(sb._ledger.map((r) => r.id).sort()).toEqual(idsAfterFirst); // same rows reused
    expect(summary2.parents).toBe(3);
  });

  it('is fail-soft — a bad client returns a summary with an error, never throws', async () => {
    const summary = await rehydrateBoard(null);
    expect(summary.threads).toBe(0);
    expect(summary.errors.length).toBeGreaterThan(0);
  });

  // QF-20260703-070: a fire-and-forget broadcast (belt-countdowns, status relays) must never
  // mirror as an open thread that matures into a false stall.
  it('mirrors a fire-and-forget countdown advisory as done, not open', async () => {
    const sb = makeSupabase({
      coordination: [
        {
          id: 'sc1',
          sender_type: 'adam',
          payload: { correlation_id: 'corr-countdown', reply_class: 'fire-and-forget', subject: 'Belt countdown: ETA 4h' },
        },
      ],
      sds: [],
    });
    const summary = await rehydrateBoard(sb);
    const node = sb._ledger.find((r) => r.source_kind === 'advisory_thread' && r.source_ref === 'corr-countdown');
    expect(node).toBeDefined();
    expect(node.status).toBe('done');
    // A fire-and-forget send never awaits a reply — no awaited_reply marker either.
    expect(sb._ledger.some((r) => r.source_kind === 'awaited_reply')).toBe(false);
    expect(summary.threads).toBe(1);
    expect(summary.awaited).toBe(0);
  });

  it('still mirrors a reply-needed request thread open (unaffected by the fire-and-forget carve-out)', async () => {
    const sb = makeSupabase({
      coordination: [
        {
          id: 'sc1',
          sender_type: 'adam',
          payload: { correlation_id: 'corr-request', reply_class: 'reply-needed', reply_requested: true, subject: 'Decision needed on Y' },
        },
      ],
      sds: [],
    });
    const summary = await rehydrateBoard(sb);
    const node = sb._ledger.find((r) => r.source_kind === 'advisory_thread' && r.source_ref === 'corr-request');
    expect(node).toBeDefined();
    expect(node.status).toBe('open');
    expect(sb._ledger.some((r) => r.source_kind === 'awaited_reply' && r.source_ref === 'corr-request')).toBe(true);
    expect(summary.threads).toBe(1);
    expect(summary.awaited).toBe(1);
  });
});
