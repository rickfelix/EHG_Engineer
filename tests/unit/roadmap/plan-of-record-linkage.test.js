/**
 * SD-LEO-INFRA-PLAN-OF-RECORD-LINKAGE-001 — FR-1/FR-2/FR-4 unit tests. DB-free (seeded fixtures).
 */
import { describe, it, expect } from 'vitest';
import { stampRoadmapItemsOnCompletion } from '../../../lib/roadmap/roadmap-completion-stamp.js';
import { computePlanCheckStatus } from '../../../lib/roadmap/plan-check-status.js';
import { runBackfill } from '../../../scripts/one-off/backfill-roadmap-completion-linkage.mjs';

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();

// ---- Minimal in-memory fake Supabase client, mutating the seeded table arrays in place.
// Models SQL three-valued NULL logic for eq/neq (a NULL column never matches an eq OR a neq
// filter — mirrors real Postgres `col <> val` being NULL, not TRUE, when col IS NULL), and a
// generic (string/number/date) order() comparator, not just numeric subtraction.
function likeToRegex(pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

// SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001: computePlanCheckStatus now reads
// v_plan_of_record_remainder instead of roadmap_wave_items directly. Rather than adding a
// separate fixture table, synthesize the view's rows on the fly from the existing
// roadmap_wave_items/roadmap_waves/strategic_directives_v2 fixtures -- mirrors the real
// migration's stamp_plan_of_record_remainder_state() logic and view scoping (approved-wave
// only), so every existing fixture keeps meaning what it already meant.
function computeRemainderState(item, sdByKey) {
  if (item.promoted_to_sd_key) {
    const linked = sdByKey.get(item.promoted_to_sd_key);
    return linked && linked.status === 'cancelled' ? 'void' : 'satisfied_elsewhere';
  }
  if (item.item_disposition === 'dropped' || ['dedup', 'decline'].includes(item.lane)) return 'void';
  if (item.lane === 'chairman-gated') return 'gated_on_chairman';
  if ((item.lane && item.lane.startsWith('blocked-on-')) || item.item_disposition === 'deferred') return 'in_flight_or_sequence_blocked';
  return 'promotable_now';
}

function computeViewRows(tables) {
  const waves = tables.roadmap_waves || [];
  const items = tables.roadmap_wave_items || [];
  const sdByKey = new Map((tables.strategic_directives_v2 || []).map((s) => [s.sd_key, s]));
  const waveById = new Map(waves.map((w) => [w.id, w]));
  return items
    .filter((it) => waveById.get(it.wave_id)?.status === 'approved')
    .map((it) => ({
      ...it,
      wave_status: waveById.get(it.wave_id).status,
      wave_sequence_rank: waveById.get(it.wave_id).sequence_rank,
      remainder_state: computeRemainderState(it, sdByKey),
    }));
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
      eq(col, val) { filters.push((r) => r[col] != null && r[col] === val); return builder; },
      neq(col, val) { filters.push((r) => r[col] != null && r[col] !== val); return builder; },
      is(col, val) { filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return builder; },
      in(col, vals) { filters.push((r) => r[col] != null && vals.includes(r[col])); return builder; },
      ilike(col, pattern) { const re = likeToRegex(pattern); filters.push((r) => re.test(r[col] ?? '')); return builder; },
      // SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-2): minimal PostgREST-shaped OR-filter parser
      // (col.op.value,col.op.value) — enough to model computeAdmissionsByLinkage's `.or()` call.
      or(filterString) {
        filters.push((r) => filterString.split(',').some((cond) => {
          const [col, op, ...rest] = cond.split('.');
          const val = rest.join('.');
          if (op === 'gte') return r[col] != null && r[col] >= val;
          if (op === 'lte') return r[col] != null && r[col] <= val;
          if (op === 'eq') return r[col] === val;
          if (op === 'is') return val === 'null' ? r[col] == null : r[col] === val;
          return false;
        }));
        return builder;
      },
      order(col, opts) { orderCol = col; orderAsc = opts?.ascending !== false; return builder; },
      limit(n) { limitN = n; return builder; },
      // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: range() added (no-op —
      // fixtures here are always far below the page size, so returning the full filtered/
      // sorted set on the first "page" is correct) so fetchAllPaginated-converted call sites
      // (computeAdmissionsByLinkage) can chain on this thenable builder like any other filter.
      range() { return builder; },
      update(payload) { updatePayload = payload; return builder; },
      then(resolve) {
        const table = tableName === 'v_plan_of_record_remainder' ? computeViewRows(tables) : (tables[tableName] || []);
        let matched = table.filter((r) => filters.every((f) => f(r)));
        if (updatePayload) {
          matched.forEach((r) => Object.assign(r, updatePayload));
        }
        if (orderCol) {
          matched = [...matched].sort((a, b) => {
            const av = a[orderCol], bv = b[orderCol];
            if (av == null && bv == null) return 0;
            if (av == null) return orderAsc ? -1 : 1;
            if (bv == null) return orderAsc ? 1 : -1;
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return orderAsc ? cmp : -cmp;
          });
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

  it('never resurrects a deliberately-dropped item back to promoted', async () => {
    const tables = {
      roadmap_wave_items: [{ id: 'w1', promoted_to_sd_key: 'SD-X-001', item_disposition: 'dropped' }],
    };
    const supabase = makeFakeSupabase(tables);
    const result = await stampRoadmapItemsOnCompletion(supabase, { sd_key: 'SD-X-001' });
    expect(result.outcome).toBe('no_match');
    expect(tables.roadmap_wave_items[0].item_disposition).toBe('dropped');
  });

  it('propagates a query error rather than silently swallowing it (caller hook wraps in try/catch)', async () => {
    const supabase = { from: () => ({ update: () => ({ eq: () => ({ neq: () => ({ neq: () => ({ select: () => ({ then: (resolve) => resolve({ data: null, error: { message: 'db down' } }) }) }) }) }) }) }) };
    await expect(stampRoadmapItemsOnCompletion(supabase, { sd_key: 'SD-X-001' })).rejects.toThrow(/db down/);
  });
});

// SD-LEO-INFRA-DISTILL-ROADMAP-SINGLE-001 (FR-3): computePlanCheckStatus now resolves the
// canonical roadmap first and scopes both queries to it. Every fixture below carries a
// single status='active' strategic_roadmaps row and roadmap_id on each wave -- and adds a
// second, unrelated roadmap+wave pair (a parallel distill-forked one, plus a proposed wave
// INSIDE the canonical roadmap) to prove the new scoping actually excludes what it should.
const CANONICAL_ROADMAP_ID = 'canonical-roadmap';
const CANONICAL_ROADMAP_FIXTURE = [{ id: CANONICAL_ROADMAP_ID, title: 'LEO Roadmap', status: 'active', current_baseline_version: 0 }];

describe('computePlanCheckStatus (FR-2)', () => {
  it('excludes a stamped-but-cancelled-SD item from done (stamped != done)', async () => {
    const tables = {
      strategic_roadmaps: CANONICAL_ROADMAP_FIXTURE,
      // SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001: status='approved' (was 'active') --
      // computePlanCheckStatus now scopes to approved-only waves.
      roadmap_waves: [{ id: 'wave-1', roadmap_id: CANONICAL_ROADMAP_ID, title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 50 }],
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
      strategic_roadmaps: CANONICAL_ROADMAP_FIXTURE,
      roadmap_waves: [
        { id: 'wave-2', roadmap_id: CANONICAL_ROADMAP_ID, title: 'Wave 2', sequence_rank: 2, status: 'approved', progress_pct: 0 },
        { id: 'wave-1', roadmap_id: CANONICAL_ROADMAP_ID, title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0 },
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

  it('surfaces the forward list from adam_task_ledger (ordered by created_at) into slipped', async () => {
    const tables = {
      strategic_roadmaps: CANONICAL_ROADMAP_FIXTURE,
      roadmap_waves: [{ id: 'wave-1', roadmap_id: CANONICAL_ROADMAP_ID, title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0 }],
      roadmap_wave_items: [
        { id: 'i1', wave_id: 'wave-1', title: 'Not yet closed item', promoted_to_sd_key: null, item_disposition: 'pending', priority_rank: 1 },
      ],
      adam_task_ledger: [
        { id: 'l1', title: 'Not yet closed item', source_ref: 'plan-check-forward-list-2026-07-14', created_at: hoursAgo(72) },
        { id: 'l2', title: 'Not yet closed item', source_ref: 'plan-check-forward-list-2026-07-16', created_at: hoursAgo(1) },
      ],
      strategic_directives_v2: [],
    };
    const supabase = makeFakeSupabase(tables);
    const status = await computePlanCheckStatus(supabase);
    expect(status.slipped.map((s) => s.item_id)).toEqual(['i1']);
  });

  it('always returns all 4 keys, even with zero wave/item data (never missing keys)', async () => {
    const tables = { strategic_roadmaps: CANONICAL_ROADMAP_FIXTURE, roadmap_waves: [], roadmap_wave_items: [], adam_task_ledger: [], strategic_directives_v2: [] };
    const supabase = makeFakeSupabase(tables);
    const status = await computePlanCheckStatus(supabase);
    expect(status).toHaveProperty('slipped');
    expect(status).toHaveProperty('done');
    expect(status).toHaveProperty('next');
    expect(status).toHaveProperty('committing');
  });

  it('propagates an adam_task_ledger query error rather than silently reporting an empty slipped section', async () => {
    const supabase = {
      from: (table) => {
        if (table === 'adam_task_ledger') {
          return { select: () => ({ ilike: () => ({ order: () => ({ limit: () => ({ then: (resolve) => resolve({ data: null, error: { message: 'ledger down' } }) }) }) }) }) };
        }
        if (table === 'strategic_roadmaps') {
          return { select: () => ({ eq: () => Promise.resolve({ data: CANONICAL_ROADMAP_FIXTURE, error: null }) }) };
        }
        return { select: () => ({ eq: () => ({ in: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }), order: () => ({ then: (resolve) => resolve({ data: [], error: null }) }) }) };
      },
    };
    await expect(computePlanCheckStatus(supabase)).rejects.toThrow(/ledger down/);
  });

  // SD-LEO-INFRA-DISTILL-ROADMAP-SINGLE-001 (FR-3): the actual single-plan-surface
  // invariant this SD adds -- prove BOTH the roadmap_id scoping and the status-filter
  // scoping independently, so a mix of parallel-roadmap and un-disposed-proposal rows
  // can never leak into the chairman-facing report.
  it('excludes waves/items belonging to a DIFFERENT (parallel, non-canonical) roadmap', async () => {
    const tables = {
      strategic_roadmaps: [...CANONICAL_ROADMAP_FIXTURE, { id: 'parallel-roadmap', title: 'EVA Intake Roadmap', status: 'draft', current_baseline_version: 0 }],
      roadmap_waves: [
        { id: 'wave-canonical', roadmap_id: CANONICAL_ROADMAP_ID, title: 'Ratified wave', sequence_rank: 1, status: 'approved', progress_pct: 0 },
        { id: 'wave-parallel', roadmap_id: 'parallel-roadmap', title: 'Distill-forked wave', sequence_rank: 1, status: 'proposed', progress_pct: 0 },
      ],
      roadmap_wave_items: [
        { id: 'i1', wave_id: 'wave-canonical', title: 'Canonical item', promoted_to_sd_key: null, item_disposition: 'pending', priority_rank: 1 },
        { id: 'i2', wave_id: 'wave-parallel', title: 'Parallel-roadmap item', promoted_to_sd_key: null, item_disposition: 'pending', priority_rank: 1 },
      ],
      adam_task_ledger: [],
      strategic_directives_v2: [],
    };
    const supabase = makeFakeSupabase(tables);
    const status = await computePlanCheckStatus(supabase);
    expect(status.next.map((n) => n.item_id)).toEqual(['i1']);
    expect(status.next.some((n) => n.item_id === 'i2')).toBe(false);
  });

  it('excludes a status=proposed wave INSIDE the canonical roadmap (an un-disposed distill proposal)', async () => {
    const tables = {
      strategic_roadmaps: CANONICAL_ROADMAP_FIXTURE,
      roadmap_waves: [
        { id: 'wave-ratified', roadmap_id: CANONICAL_ROADMAP_ID, title: 'Ratified wave', sequence_rank: 1, status: 'approved', progress_pct: 0 },
        { id: 'wave-proposed', roadmap_id: CANONICAL_ROADMAP_ID, title: 'Un-disposed distill proposal', sequence_rank: 2, status: 'proposed', progress_pct: 0 },
      ],
      roadmap_wave_items: [
        { id: 'i1', wave_id: 'wave-ratified', title: 'Ratified item', promoted_to_sd_key: null, item_disposition: 'pending', priority_rank: 1 },
        { id: 'i2', wave_id: 'wave-proposed', title: 'Proposed item', promoted_to_sd_key: null, item_disposition: 'pending', priority_rank: 1 },
      ],
      adam_task_ledger: [],
      strategic_directives_v2: [],
    };
    const supabase = makeFakeSupabase(tables);
    const status = await computePlanCheckStatus(supabase);
    expect(status.next.map((n) => n.item_id)).toEqual(['i1']);
    expect(status.next.some((n) => n.item_id === 'i2')).toBe(false);
  });

  it('throws when no active (canonical) roadmap exists — never silently reports an empty plan', async () => {
    const tables = { strategic_roadmaps: [], roadmap_waves: [], roadmap_wave_items: [], adam_task_ledger: [], strategic_directives_v2: [] };
    const supabase = makeFakeSupabase(tables);
    await expect(computePlanCheckStatus(supabase)).rejects.toThrow(/no active \(canonical\) roadmap/);
  });
});

describe('runBackfill (FR-4)', () => {
  it('dry-run: only a verified completed-SD title match with plausible temporal ordering is planned for stamping; a bare no-match candidate is left open', async () => {
    const tables = {
      roadmap_wave_items: [
        { id: 'u1', title: 'Shipped Feature', item_disposition: 'pending', promoted_to_sd_key: null, created_at: hoursAgo(200) },
        { id: 'u2', title: 'Genuinely Unbuilt Satellite', item_disposition: 'pending', promoted_to_sd_key: null, created_at: hoursAgo(200) },
      ],
      strategic_directives_v2: [
        { sd_key: 'SD-SHIPPED-001', title: 'Shipped Feature', status: 'completed', completion_date: hoursAgo(24) },
      ],
    };
    const supabase = makeFakeSupabase(tables);
    const result = await runBackfill({ supabase, apply: false, log: () => {} });
    expect(result.stamped).toBe(1);
    expect(result.leftOpen).toBe(1);
    // Dry-run must not have written anything.
    expect(tables.roadmap_wave_items.find((r) => r.id === 'u1').promoted_to_sd_key).toBeNull();
  });

  it('leaves an item open when the "completed" SD finished BEFORE the roadmap item was even created (implausible ordering, title match alone is not enough)', async () => {
    const tables = {
      roadmap_wave_items: [{ id: 'u1', title: 'Time Traveling Feature', item_disposition: 'pending', promoted_to_sd_key: null, created_at: hoursAgo(1) }],
      strategic_directives_v2: [{ sd_key: 'SD-OLD-001', title: 'Time Traveling Feature', status: 'completed', completion_date: hoursAgo(500) }],
    };
    const supabase = makeFakeSupabase(tables);
    const result = await runBackfill({ supabase, apply: true, log: () => {} });
    expect(result.leftOpen).toBe(1);
    expect(result.stamped).toBe(0);
    expect(tables.roadmap_wave_items[0].promoted_to_sd_key).toBeNull();
  });

  it('never stamps a deliberately-dropped item, even with an exact title match', async () => {
    const tables = {
      roadmap_wave_items: [{ id: 'u1', title: 'Shipped Feature', item_disposition: 'dropped', promoted_to_sd_key: null, created_at: hoursAgo(200) }],
      strategic_directives_v2: [{ sd_key: 'SD-SHIPPED-001', title: 'Shipped Feature', status: 'completed', completion_date: hoursAgo(24) }],
    };
    const supabase = makeFakeSupabase(tables);
    const result = await runBackfill({ supabase, apply: true, log: () => {} });
    expect(result.selected).toBe(0); // 'dropped' is excluded at the candidate-selection stage entirely
    expect(tables.roadmap_wave_items[0].promoted_to_sd_key).toBeNull();
  });

  it('skips an ambiguous title shared by more than one completed SD, rather than guessing', async () => {
    const tables = {
      roadmap_wave_items: [{ id: 'u1', title: 'Duplicate Title', item_disposition: 'pending', promoted_to_sd_key: null, created_at: hoursAgo(200) }],
      strategic_directives_v2: [
        { sd_key: 'SD-A-001', title: 'Duplicate Title', status: 'completed', completion_date: hoursAgo(24) },
        { sd_key: 'SD-B-001', title: 'Duplicate Title', status: 'completed', completion_date: hoursAgo(24) },
      ],
    };
    const supabase = makeFakeSupabase(tables);
    const result = await runBackfill({ supabase, apply: true, log: () => {} });
    expect(result.ambiguousSkipped).toBe(1);
    expect(tables.roadmap_wave_items.find((r) => r.id === 'u1').promoted_to_sd_key).toBeNull();
  });

  it('--apply stamps item_disposition=promoted (never done) on a verified match, and re-running is a no-op (idempotent)', async () => {
    const tables = {
      roadmap_wave_items: [{ id: 'u1', title: 'Shipped Feature', item_disposition: 'pending', promoted_to_sd_key: null, created_at: hoursAgo(200) }],
      strategic_directives_v2: [{ sd_key: 'SD-SHIPPED-001', title: 'Shipped Feature', status: 'completed', completion_date: hoursAgo(24) }],
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
