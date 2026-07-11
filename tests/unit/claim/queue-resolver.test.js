/**
 * SD-ARCH-HOTSPOT-SD-START-001 FR-5 / TS-5 — queue-resolver relocation parity.
 *
 * @module tests/unit/claim/queue-resolver.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

// The urgency-sorting selector is INJECTED via opts.selectNextReadyChild (the
// resolver's test seam); the real child-sd-selector has its own suite.
const getNextReadyChildMock = vi.fn();
const seam = { selectNextReadyChild: (...args) => getNextReadyChildMock(...args) };

const require = createRequire(import.meta.url);
const {
  isOrchestratorParent,
  getNextWorkableSD,
  resolveLeafWorkItem,
  findUnclaimedChild,
} = require('../../../lib/claim/queue-resolver.cjs');

// Fake supabase: per-table seeded rows with eq/in/not/or filter support.
function makeSb(seed = {}) {
  function from(table) {
    const q = { filters: [], wantSingle: false };
    const builder = {
      select() { return builder; },
      not() { return builder; },
      in(col, vals) { q.filters.push((r) => vals.includes(r[col])); return builder; },
      eq(col, val) { q.filters.push((r) => r[col] === val); return builder; },
      or(expr) {
        // supports 'parent_sd_id.eq.X' single-clause or-expressions used by the resolver
        const m = /^([a-z_]+)\.eq\.(.+)$/.exec(expr);
        if (m) q.filters.push((r) => String(r[m[1]]) === m[2]);
        return builder;
      },
      order() { return builder; },
      limit() { return builder; },
      single() {
        q.wantSingle = true;
        const rows = (seed[table] || []).filter((r) => q.filters.every((f) => f(r)));
        return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { code: 'PGRST116' } });
      },
      then(res, rej) {
        const rows = (seed[table] || []).filter((r) => q.filters.every((f) => f(r)));
        return Promise.resolve({ data: rows, error: null }).then(res, rej);
      },
    };
    return builder;
  }
  return { from };
}

beforeEach(() => getNextReadyChildMock.mockReset());

describe('isOrchestratorParent — exclude-intent predicate (D10: sd_type-keyed)', () => {
  it('true only for sd_type orchestrator; structural has-children does NOT count', () => {
    expect(isOrchestratorParent({ sd_type: 'orchestrator' })).toBe(true);
    expect(isOrchestratorParent({ sd_type: 'feature' })).toBe(false);
    expect(isOrchestratorParent({ sd_type: 'feature', has_children: true })).toBe(false);
    expect(isOrchestratorParent(null)).toBe(false);
  });
});

describe('getNextWorkableSD — relocation parity (ordering + claim exclusion)', () => {
  const sessions = [{ session_id: 's1', sd_key: 'SD-CLAIMED-001', status: 'active' }];
  const candidates = [
    { sd_key: 'SD-CLAIMED-001', title: 'claimed', current_phase: 'EXEC', status: 'in_progress' },
    { sd_key: 'SD-FREE-001', title: 'free', current_phase: 'LEAD', status: 'draft' },
    { sd_key: 'SD-FREE-002', title: 'free2', current_phase: 'PLAN', status: 'draft' },
  ];

  it('skips claimed + excluded keys and returns the first remaining candidate', async () => {
    const sb = makeSb({ claude_sessions: sessions, strategic_directives_v2: candidates });
    const pick = await getNextWorkableSD(sb, ['SD-FREE-001']);
    expect(pick).toEqual({ sdKey: 'SD-FREE-002', title: 'free2', phase: 'PLAN' });
  });

  it('returns null when nothing survives the filters', async () => {
    const sb = makeSb({ claude_sessions: sessions, strategic_directives_v2: [candidates[0]] });
    expect(await getNextWorkableSD(sb, [])).toBeNull();
  });
});

describe('resolveLeafWorkItem / findUnclaimedChild — descend-intent parity (TS-5)', () => {
  const parentRow = { id: 'uuid-parent', sd_key: 'SD-ORCH-001' };

  it('unclaimed ready child → returned directly with routing path', async () => {
    const leaf = { id: 'uuid-c1', sd_key: 'SD-ORCH-001-A', status: 'draft', claiming_session_id: null };
    getNextReadyChildMock.mockResolvedValue({ sd: leaf, reason: 'urgency pick' });
    const sb = makeSb({ strategic_directives_v2: [parentRow], claude_sessions: [] });
    const r = await resolveLeafWorkItem(sb, 'SD-ORCH-001', { ...seam });
    expect(r.child.sd_key).toBe('SD-ORCH-001-A');
    expect(r.routingPath).toEqual(['SD-ORCH-001-A']);
    expect(r.allComplete).toBe(false);
  });

  it('claimed-top-child falls back to the first genuinely-unclaimed sibling (stale claims treated as unclaimed)', async () => {
    const claimed = { id: 'uuid-c1', sd_key: 'SD-ORCH-001-A', status: 'in_progress', claiming_session_id: 'live-sess' };
    const stale = { id: 'uuid-c2', sd_key: 'SD-ORCH-001-B', status: 'draft', claiming_session_id: 'dead-sess', parent_sd_id: 'uuid-parent' };
    getNextReadyChildMock.mockResolvedValue({ sd: claimed, reason: 'urgency pick' });
    const sb = makeSb({
      strategic_directives_v2: [parentRow, { ...claimed, parent_sd_id: 'uuid-parent' }, stale],
      claude_sessions: [{ session_id: 'live-sess', sd_key: 'SD-ORCH-001-A', status: 'active' }], // dead-sess absent → stale
    });
    const r = await findUnclaimedChild(sb, 'SD-ORCH-001', { ...seam });
    expect(r.child.sd_key).toBe('SD-ORCH-001-B');
    expect(r.reason).toBe('First unclaimed child');
  });

  it('nested orchestrator → drills to a leaf grandchild with the recursion threading supabase (D2) and onTrace firing', async () => {
    const subOrch = { id: 'uuid-sub', sd_key: 'SD-ORCH-001-SUB', status: 'draft', claiming_session_id: null };
    const grandLeaf = { id: 'uuid-g1', sd_key: 'SD-ORCH-001-SUB-A', status: 'draft', claiming_session_id: null };
    getNextReadyChildMock
      .mockResolvedValueOnce({ sd: subOrch, reason: 'urgency pick' })
      .mockResolvedValueOnce({ sd: grandLeaf, reason: 'urgency pick' });
    const sb = makeSb({
      strategic_directives_v2: [
        parentRow,
        { id: 'uuid-sub', sd_key: 'SD-ORCH-001-SUB' },
        { ...grandLeaf, parent_sd_id: 'uuid-sub' }, // sub-orch has a non-complete child → recurse
      ],
      claude_sessions: [],
    });
    const traces = [];
    const r = await resolveLeafWorkItem(sb, 'SD-ORCH-001', { ...seam, onTrace: (m) => traces.push(m) });
    expect(r.child.sd_key).toBe('SD-ORCH-001-SUB-A');
    expect(r.routingPath).toEqual(['SD-ORCH-001-SUB', 'SD-ORCH-001-SUB-A']);
    expect(traces.join(' ')).toMatch(/drilling deeper/);
  });

  it('sub-orchestrator with ALL grandchildren complete → returned itself (needs completion handoff)', async () => {
    const subOrch = { id: 'uuid-sub', sd_key: 'SD-ORCH-001-SUB', status: 'in_progress', claiming_session_id: null };
    getNextReadyChildMock.mockResolvedValue({ sd: subOrch, reason: 'urgency pick' });
    const sb = makeSb({
      strategic_directives_v2: [
        parentRow,
        { id: 'uuid-sub', sd_key: 'SD-ORCH-001-SUB' },
        { id: 'uuid-g1', sd_key: 'SD-ORCH-001-SUB-A', status: 'completed', parent_sd_id: 'uuid-sub' },
      ],
      claude_sessions: [],
    });
    const r = await resolveLeafWorkItem(sb, 'SD-ORCH-001', { ...seam });
    expect(r.child.sd_key).toBe('SD-ORCH-001-SUB');
    expect(r.reason).toMatch(/needs completion handoff/);
  });

  it('sub-orchestrator with a mix of completed + cancelled grandchildren → treated as all-terminal (QF-20260710-491)', async () => {
    const subOrch = { id: 'uuid-sub', sd_key: 'SD-ORCH-001-SUB', status: 'in_progress', claiming_session_id: null };
    getNextReadyChildMock.mockResolvedValue({ sd: subOrch, reason: 'urgency pick' });
    const sb = makeSb({
      strategic_directives_v2: [
        parentRow,
        { id: 'uuid-sub', sd_key: 'SD-ORCH-001-SUB' },
        { id: 'uuid-g1', sd_key: 'SD-ORCH-001-SUB-A', status: 'completed', parent_sd_id: 'uuid-sub' },
        { id: 'uuid-g2', sd_key: 'SD-ORCH-001-SUB-B', status: 'cancelled', parent_sd_id: 'uuid-sub' },
      ],
      claude_sessions: [],
    });
    const r = await resolveLeafWorkItem(sb, 'SD-ORCH-001', { ...seam });
    expect(r.child.sd_key).toBe('SD-ORCH-001-SUB');
    expect(r.reason).toMatch(/needs completion handoff/);
  });

  it('all children complete → {child:null, allComplete:true} passthrough; depth cap honored', async () => {
    getNextReadyChildMock.mockResolvedValue({ sd: null, allComplete: true, reason: 'All children completed' });
    const sb = makeSb({ strategic_directives_v2: [parentRow], claude_sessions: [] });
    const done = await resolveLeafWorkItem(sb, 'SD-ORCH-001', { ...seam });
    expect(done).toMatchObject({ child: null, allComplete: true });

    const capped = await resolveLeafWorkItem(sb, 'SD-ORCH-001', { ...seam, depth: 5 });
    expect(capped.child).toBeNull();
    expect(capped.reason).toMatch(/nesting depth/);
  });
});
