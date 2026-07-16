/**
 * SD-LEO-INFRA-PLAN-OF-RECORD-LINKAGE-001 — FR-1/FR-2/FR-4 unit tests. DB-free (seeded fixtures).
 */
import { describe, it, expect } from 'vitest';
import { stampRoadmapItemsOnCompletion } from '../../../lib/roadmap/roadmap-completion-stamp.js';
import { computePlanCheckStatus } from '../../../lib/roadmap/plan-check-status.js';
import { runBackfill } from '../../../scripts/one-off/backfill-roadmap-completion-linkage.mjs';

// ---- Minimal in-memory fake Supabase client, mutating the seeded table arrays in place ----
function likeToRegex(pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function makeFakeSupabase(tables) {
  function query(tableName) {
    const filters = [];
    let updatePayload = null;
    let orderCol = null;
    let orderAsc = true;
    let limitN = null;

    const builder = {
      select() { return builder; },
      eq(col, val) { filters.push((r) => r[col] === val); return builder; },
      neq(col, val) { filters.push((r) => r[col] !== val); return builder; },
      is(col, val) { filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return builder; },
      in(col, vals) { filters.push((r) => vals.includes(r[col])); return builder; },
      ilike(col, pattern) { const re = likeToRegex(pattern); filters.push((r) => re.test(r[col] ?? '')); return builder; },
      order(col, opts) { orderCol = col; orderAsc = opts?.ascending !== false; return builder; },
      limit(n) { limitN = n; return builder; },
      update(payload) { updatePayload = payload; return builder; },
      then(resolve) {
        const table = tables[tableName] || [];
        let matched = table.filter((r) => filters.every((f) => f(r)));
        if (updatePayload) {
          matched.forEach((r) => Object.assign(r, updatePayload));
        }
        if (orderCol) {
          matched = [...matched].sort((a, b) => (orderAsc ? a[orderCol] - b[orderCol] : b[orderCol] - a[orderCol]));
        }
        if (limitN != null) matched = matched.slice(0, limitN);
        resolve({ data: matched.map((r) => ({ ...r })), error: null });
        return Promise.resolve();
      },
    };
    return builder;
  }
  return { from: (t) => query(t) };
}

describe('stampRoadmapItemsOnCompletion (FR-1)', () => {
  it('flips item_disposition to promoted for all rows linked to the completing SD (bulk, not just first match)', async () => {
    const tables = {
      roadmap_wave_items: [
        { id: 'w1', promoted_to_sd_key: 'SD-X-001', item_disposition: 'pending' },
        { id: 'w2', promoted_to_sd_key: 'SD-X-001', item_disposition: 'pending' },
        { id: 'w3', promoted_to_sd_key: 'SD-OTHER-001', item_disposition: 'pending' },
      ],
    };
    const supabase = makeFakeSupabase(tables);
    const result = await stampRoadmapItemsOnCompletion(supabase, { sd_key: 'SD-X-001' });
    expect(result.outcome).toBe('stamped');
    expect(result.updated).toBe(2);
    expect(tables.roadmap_wave_items.find((r) => r.id === 'w1').item_disposition).toBe('promoted');
    expect(tables.roadmap_wave_items.find((r) => r.id === 'w2').item_disposition).toBe('promoted');
    expect(tables.roadmap_wave_items.find((r) => r.id === 'w3').item_disposition).toBe('pending');
  });

  it('no-ops cleanly when the completing SD has no linked roadmap_wave_item', async () => {
    const tables = { roadmap_wave_items: [{ id: 'w1', promoted_to_sd_key: 'SD-OTHER-001', item_disposition: 'pending' }] };
    const supabase = makeFakeSupabase(tables);
    const result = await stampRoadmapItemsOnCompletion(supabase, { sd_key: 'SD-X-001' });
    expect(result.outcome).toBe('no_match');
    expect(result.updated).toBe(0);
  });

  it('propagates a query error rather than silently swallowing it (caller hook wraps in try/catch)', async () => {
    const supabase = { from: () => ({ update: () => ({ eq: () => ({ neq: () => ({ select: () => ({ then: (resolve) => resolve({ data: null, error: { message: 'db down' } }) }) }) }) }) }) };
    await expect(stampRoadmapItemsOnCompletion(supabase, { sd_key: 'SD-X-001' })).rejects.toThrow(/db down/);
  });
});

describe('computePlanCheckStatus (FR-2)', () => {
  it('excludes a stamped-but-cancelled-SD item from done (stamped != done)', async () => {
    const tables = {
      roadmap_waves: [{ id: 'wave-1', title: 'Wave 1', sequence_rank: 1, status: 'active', progress_pct: 50 }],
      roadmap_wave_items: [
        { id: 'i1', wave_id: 'wave-1', title: 'Cancelled work', promoted_to_sd_key: 'SD-CANCELLED-001', item_disposition: 'promoted', priority_rank: 1 },
        { id: 'i2', wave_id: 'wave-1', title: 'Completed work', promoted_to_sd_key: 'SD-DONE-001', item_disposition: 'promoted', priority_rank: 2 },
      ],
      adam_task_ledger: [],
      strategic_directives_v2: [
        { sd_key: 'SD-CANCELLED-001', status: 'cancelled', completion_date: null },
        { sd_key: 'SD-DONE-001', status: 'completed', completion_date: new Date().toISOString() },
      ],
    };
    const supabase = makeFakeSupabase(tables);
    const status = await computePlanCheckStatus(supabase);
    expect(status.done.map((d) => d.sd_key)).toEqual(['SD-DONE-001']);
    expect(status.done.map((d) => d.sd_key)).not.toContain('SD-CANCELLED-001');
  });

  it('excludes done/dropped items from next/committing and orders by wave sequence_rank then priority_rank', async () => {
    const tables = {
      roadmap_waves: [
        { id: 'wave-2', title: 'Wave 2', sequence_rank: 2, status: 'active', progress_pct: 0 },
        { id: 'wave-1', title: 'Wave 1', sequence_rank: 1, status: 'active', progress_pct: 0 },
      ],
      roadmap_wave_items: [
        { id: 'i1', wave_id: 'wave-2', title: 'Later item', promoted_to_sd_key: null, item_disposition: 'pending', priority_rank: 1 },
        { id: 'i2', wave_id: 'wave-1', title: 'Earlier item', promoted_to_sd_key: null, item_disposition: 'pending', priority_rank: 2 },
        { id: 'i3', wave_id: 'wave-1', title: 'Dropped item', promoted_to_sd_key: null, item_disposition: 'dropped', priority_rank: 0 },
      ],
      adam_task_ledger: [],
      strategic_directives_v2: [],
    };
    const supabase = makeFakeSupabase(tables);
    const status = await computePlanCheckStatus(supabase);
    expect(status.next.map((n) => n.item_id)).toEqual(['i2', 'i1']);
    expect(status.next.some((n) => n.item_id === 'i3')).toBe(false);
  });

  it('always returns all 4 keys, even with zero data (never missing keys)', async () => {
    const tables = { roadmap_waves: [], roadmap_wave_items: [], adam_task_ledger: [], strategic_directives_v2: [] };
    const supabase = makeFakeSupabase(tables);
    const status = await computePlanCheckStatus(supabase);
    expect(status).toHaveProperty('slipped');
    expect(status).toHaveProperty('done');
    expect(status).toHaveProperty('next');
    expect(status).toHaveProperty('committing');
  });
});

describe('runBackfill (FR-4)', () => {
  it('dry-run: only a verified completed-SD title match is planned for stamping; a bare no-match candidate is left open', async () => {
    const tables = {
      roadmap_wave_items: [
        { id: 'u1', title: 'Shipped Feature', item_disposition: 'pending', promoted_to_sd_key: null },
        { id: 'u2', title: 'Genuinely Unbuilt Satellite', item_disposition: 'pending', promoted_to_sd_key: null },
      ],
      strategic_directives_v2: [
        { sd_key: 'SD-SHIPPED-001', title: 'Shipped Feature', status: 'completed' },
      ],
    };
    const supabase = makeFakeSupabase(tables);
    const result = await runBackfill({ supabase, apply: false, log: () => {} });
    expect(result.stamped).toBe(1);
    expect(result.leftOpen).toBe(1);
    // Dry-run must not have written anything.
    expect(tables.roadmap_wave_items.find((r) => r.id === 'u1').promoted_to_sd_key).toBeNull();
  });

  it('skips an ambiguous title shared by more than one completed SD, rather than guessing', async () => {
    const tables = {
      roadmap_wave_items: [{ id: 'u1', title: 'Duplicate Title', item_disposition: 'pending', promoted_to_sd_key: null }],
      strategic_directives_v2: [
        { sd_key: 'SD-A-001', title: 'Duplicate Title', status: 'completed' },
        { sd_key: 'SD-B-001', title: 'Duplicate Title', status: 'completed' },
      ],
    };
    const supabase = makeFakeSupabase(tables);
    const result = await runBackfill({ supabase, apply: true, log: () => {} });
    expect(result.ambiguousSkipped).toBe(1);
    expect(tables.roadmap_wave_items.find((r) => r.id === 'u1').promoted_to_sd_key).toBeNull();
  });

  it('--apply stamps item_disposition=promoted (never done) on a verified match, and re-running is a no-op (idempotent)', async () => {
    const tables = {
      roadmap_wave_items: [{ id: 'u1', title: 'Shipped Feature', item_disposition: 'pending', promoted_to_sd_key: null }],
      strategic_directives_v2: [{ sd_key: 'SD-SHIPPED-001', title: 'Shipped Feature', status: 'completed' }],
    };
    const supabase = makeFakeSupabase(tables);
    const first = await runBackfill({ supabase, apply: true, log: () => {} });
    expect(first.stamped).toBe(1);
    expect(tables.roadmap_wave_items[0].promoted_to_sd_key).toBe('SD-SHIPPED-001');
    expect(tables.roadmap_wave_items[0].item_disposition).toBe('promoted');

    const second = await runBackfill({ supabase, apply: true, log: () => {} });
    expect(second.stamped).toBe(0); // already stamped -> excluded from the unstamped-candidates query
  });
});
