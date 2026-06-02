// Tests for SD-LEO-INFRA-CONTEXT-AWARE-DEPENDENCY-001 — context-aware dependency-ordered execution
// in the leo_bridge venture-build consumer. DC-1..DC-15 from the prospective testing-agent
// (row a804c8b8). The consumer reuses the canonical parseDependencies for shape-tolerance and the
// consumer's own TERMINAL set for terminal-tolerance, with a deadlock fail-safe.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  runConsume, computeWorkableLeaves, selectWorkableLeaves, legacyWorkableLeaves,
  buildDependencyContext, isDependencyOrderedExecutionEnabled, fetchDescendants,
  TERMINAL,
} from '../../../../lib/eva/bridge/venture-build-consumer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_PATH = resolve(__dirname, '../../../../lib/eva/bridge/venture-build-consumer.js');

// ---- Minimal mutable mock of the supabase query builder (records .select() cols for DC-14) ----
class MockQuery {
  constructor(sb, table) { this.sb = sb; this.table = table; this._op = 'select'; this._filters = []; this._payload = null; this._limit = null; this._single = false; this._returnData = false; }
  select(cols) { if (this._op === 'update') { this._returnData = true; return this; } this._op = 'select'; this._cols = cols; this.sb.selects.push({ table: this.table, cols }); return this; }
  insert(obj) { this._op = 'insert'; this._payload = obj; return this; }
  update(obj) { this._op = 'update'; this._payload = obj; return this; }
  eq(c, v) { this._filters.push(['eq', c, v]); return this; }
  is(c, v) { this._filters.push(['is', c, v]); return this; }
  in(c, arr) { this._filters.push(['in', c, arr]); return this; }
  order() { return this; }
  limit(n) { this._limit = n; return this; }
  maybeSingle() { this._single = true; return this._exec(); }
  then(res, rej) { return this._exec().then(res, rej); }
  _match(row) {
    return this._filters.every(([op, c, v]) => {
      if (op === 'eq') return row[c] === v;
      if (op === 'is') return v === null ? (row[c] === null || row[c] === undefined) : row[c] === v;
      if (op === 'in') return v.includes(row[c]);
      return true;
    });
  }
  async _exec() {
    const rows = this.sb.tables[this.table] || (this.sb.tables[this.table] = []);
    if (this._op === 'insert') {
      const items = Array.isArray(this._payload) ? this._payload : [this._payload];
      for (const it of items) { rows.push({ ...it }); this.sb.inserts.push({ table: this.table, row: it }); }
      return { data: items, error: null };
    }
    const matched = rows.filter((r) => this._match(r));
    if (this._op === 'update') {
      for (const r of matched) Object.assign(r, this._payload);
      this.sb.updates.push({ table: this.table, payload: this._payload, count: matched.length });
      return { data: this._returnData ? matched.map((r) => ({ ...r })) : null, error: null };
    }
    let out = matched.map((r) => ({ ...r }));
    if (this._limit != null) out = out.slice(0, this._limit);
    if (this._single) return { data: out[0] || null, error: null };
    return { data: out, error: null };
  }
}
class MockSB {
  constructor(tables) { this.tables = tables; this.inserts = []; this.updates = []; this.selects = []; }
  from(name) { return new MockQuery(this, name); }
}

const VID = 'venture-1';
function eligibleTables(sds) {
  return {
    ventures: [{ id: VID, build_model: 'leo_bridge', status: 'active', current_lifecycle_stage: 19, deleted_at: null, orchestrator_state: 'blocked' }],
    eva_vision_documents: [{ venture_id: VID, level: 'L2', status: 'active', chairman_approved: true, vision_key: 'V-1' }],
    strategic_directives_v2: sds,
    system_events: [],
  };
}

// top orch -> 1 child-orch -> leaves A,B,C (siblings). `deps`/`status` override per leaf key.
function depTree({ deps = {}, status = {}, leaves = ['A', 'B', 'C'] } = {}) {
  const sds = [
    { id: 'orch-top', sd_key: 'ORCH-TOP', venture_id: VID, sd_type: 'orchestrator', parent_sd_id: null, status: 'draft', sequence_rank: 0, metadata: {} },
    { id: 'orch-c', sd_key: 'ORCH-C', venture_id: VID, sd_type: 'orchestrator', parent_sd_id: 'orch-top', status: 'draft', sequence_rank: 0 },
  ];
  leaves.forEach((k, i) => {
    sds.push({ id: `leaf-${k}`, sd_key: `SD-LEAF-${k}`, title: `Leaf ${k}`, venture_id: VID, sd_type: 'feature', parent_sd_id: 'orch-c', status: status[k] || 'draft', sequence_rank: i, dependencies: deps[k] || [] });
  });
  return sds;
}
const descendantsOf = (sds) => sds.filter((s) => s.id !== 'orch-top');
const keys = (leaves) => leaves.map((l) => l.sd_key);

// driveLeaf that completes the leaf + bubble-completes parents, capturing drive order + ctx.
function capturingDrive(tables, captured) {
  return async (leaf, ctx) => {
    captured.push({ key: leaf.sd_key, dependencyContext: ctx.dependencyContext });
    const all = tables.strategic_directives_v2;
    const row = all.find((r) => r.sd_key === leaf.sd_key);
    if (!row) return { completed: false };
    row.status = 'completed';
    let pid = row.parent_sd_id;
    while (pid) {
      const parent = all.find((r) => r.id === pid);
      if (!parent) break;
      const kids = all.filter((r) => r.parent_sd_id === parent.id);
      if (kids.length && kids.every((k) => TERMINAL.includes(k.status))) { parent.status = 'completed'; pid = parent.parent_sd_id; }
      else break;
    }
    return { completed: true };
  };
}

// Hermetic flag handling — default state is "unset" (flag ON by default).
let savedFlag;
beforeEach(() => { savedFlag = process.env.DEPENDENCY_ORDERED_EXECUTION; delete process.env.DEPENDENCY_ORDERED_EXECUTION; });
afterEach(() => { if (savedFlag === undefined) delete process.env.DEPENDENCY_ORDERED_EXECUTION; else process.env.DEPENDENCY_ORDERED_EXECUTION = savedFlag; });

describe('FR-1 — dependency-ordered leaf selection', () => {
  it('DC-1: a leaf with a non-terminal in-tree dependency is NOT selected; selectable once terminal', () => {
    const sds = depTree({ deps: { B: ['SD-LEAF-A'] } }); // B depends on A (draft)
    const d = descendantsOf(sds);
    expect(keys(computeWorkableLeaves(d))).toEqual(['SD-LEAF-A', 'SD-LEAF-C']); // B blocked
    d.find((x) => x.sd_key === 'SD-LEAF-A').status = 'completed';
    expect(keys(computeWorkableLeaves(d))).toEqual(['SD-LEAF-B', 'SD-LEAF-C']); // B now selectable
  });

  it('DC-2: a cancelled dependency satisfies (terminal-tolerance, not completed-only)', () => {
    const sds = depTree({ deps: { B: ['SD-LEAF-A'] }, status: { A: 'cancelled' } });
    const d = descendantsOf(sds);
    expect(keys(computeWorkableLeaves(d))).toContain('SD-LEAF-B'); // A is cancelled => satisfied
  });

  it('DC-3: an out-of-tree dependency sd_id is ignored (treated satisfied)', () => {
    const sds = depTree({ deps: { B: ['SD-NOT-IN-THIS-TREE-001'] } });
    expect(keys(computeWorkableLeaves(descendantsOf(sds)))).toContain('SD-LEAF-B');
  });

  it('DC-4: a bare "SD-…"/key string dependency gates', () => {
    const sds = depTree({ deps: { C: ['SD-LEAF-A'] } }); // string form
    expect(keys(computeWorkableLeaves(descendantsOf(sds)))).not.toContain('SD-LEAF-C');
  });

  it('DC-5: a { sd_id } object dependency gates', () => {
    const sds = depTree({ deps: { C: [{ sd_id: 'SD-LEAF-A' }] } });
    expect(keys(computeWorkableLeaves(descendantsOf(sds)))).not.toContain('SD-LEAF-C');
  });

  it('DC-6: {sd_key}-only / {predecessor}-only / free-text / blocks_phase entries are ignored', () => {
    const sds = depTree({ deps: { B: [
      { sd_key: 'SD-LEAF-A' }, { predecessor: 'SD-LEAF-A' },
      { type: 'technical', dependency: 'some prereq' }, { type: 'sibling', blocks_phase: 'EXEC' },
    ] } });
    // none of these are SD references parseDependencies honors → B is NOT blocked even though A is draft
    expect(keys(computeWorkableLeaves(descendantsOf(sds)))).toContain('SD-LEAF-B');
  });

  it('DC-7: a 2-node cycle falls back to legacy order and flags fellBack', () => {
    const sds = depTree({ deps: { A: ['SD-LEAF-B'], B: ['SD-LEAF-A'] }, leaves: ['A', 'B'] });
    const sel = selectWorkableLeaves(descendantsOf(sds));
    expect(sel.fellBack).toBe(true);
    expect(keys(sel.leaves)).toEqual(['SD-LEAF-A', 'SD-LEAF-B']); // full legacy order
  });

  it('DC-8: an all-blocked frontier (3-cycle) falls back to legacy order and flags fellBack', () => {
    const sds = depTree({ deps: { A: ['SD-LEAF-C'], B: ['SD-LEAF-A'], C: ['SD-LEAF-B'] } });
    const sel = selectWorkableLeaves(descendantsOf(sds));
    expect(sel.fellBack).toBe(true);
    expect(keys(sel.leaves)).toEqual(['SD-LEAF-A', 'SD-LEAF-B', 'SD-LEAF-C']);
  });

  it('DC-9: among dependency-clean leaves, ordering stays deepest-first then sequence_rank', () => {
    const sds = depTree({ deps: { C: ['SD-LEAF-A'] } }); // C blocked by A
    const d = descendantsOf(sds);
    expect(keys(computeWorkableLeaves(d))).toEqual(['SD-LEAF-A', 'SD-LEAF-B']); // rank order preserved
  });

  it('DC-14: fetchDescendants SELECT includes dependencies and title', async () => {
    const sds = depTree();
    const sb = new MockSB(eligibleTables(sds));
    await fetchDescendants(sb, 'orch-top');
    const sel = sb.selects.find((s) => s.table === 'strategic_directives_v2' && /parent_sd_id/.test(s.cols));
    expect(sel.cols).toContain('dependencies');
    expect(sel.cols).toContain('title');
  });
});

describe('FR-2 — context-aware driving', () => {
  it('DC-11: buildDependencyContext carries completed-sibling keys/titles + non-SD manifest entries', () => {
    const sds = depTree({ deps: { B: ['SD-LEAF-A', { type: 'existing_module', path: 'src/x.tsx' }] }, status: { A: 'completed' } });
    const d = descendantsOf(sds);
    const ctx = buildDependencyContext(d.find((x) => x.sd_key === 'SD-LEAF-B'), d);
    expect(ctx.completed).toEqual([{ sd_key: 'SD-LEAF-A', title: 'Leaf A' }]);
    expect(ctx.context_entries).toEqual([{ type: 'existing_module', path: 'src/x.tsx' }]);
  });

  it('DC-11b: a cancelled dependency is excluded from completed context (no artifact produced)', () => {
    const sds = depTree({ deps: { B: ['SD-LEAF-A'] }, status: { A: 'cancelled' } });
    const d = descendantsOf(sds);
    const ctx = buildDependencyContext(d.find((x) => x.sd_key === 'SD-LEAF-B'), d);
    expect(ctx.completed).toEqual([]);
  });

  it('DC-11c: runConsume passes dependencyContext into driveLeaf', async () => {
    const sds = depTree({ deps: { B: ['SD-LEAF-A'], C: ['SD-LEAF-A'] }, status: { A: 'completed' } });
    const sb = new MockSB(eligibleTables(sds));
    const captured = [];
    await runConsume({ supabase: sb, ventureId: VID, driveLeaf: capturingDrive(sb.tables, captured), now: () => 0 });
    const b = captured.find((c) => c.key === 'SD-LEAF-B');
    expect(b.dependencyContext.completed).toEqual([{ sd_key: 'SD-LEAF-A', title: 'Leaf A' }]);
  });

  it('DC-12: with the flag OFF, no dependencyContext is passed to driveLeaf', async () => {
    process.env.DEPENDENCY_ORDERED_EXECUTION = 'false';
    const sds = depTree({ deps: { B: ['SD-LEAF-A'] }, status: { A: 'completed' } });
    const sb = new MockSB(eligibleTables(sds));
    const captured = [];
    await runConsume({ supabase: sb, ventureId: VID, driveLeaf: capturingDrive(sb.tables, captured), now: () => 0 });
    expect(captured.every((c) => c.dependencyContext === undefined)).toBe(true);
  });
});

describe('FR-3 — feature flag, parity, guardrail', () => {
  it('flag default is ON; explicit false/0/off/no disables', () => {
    expect(isDependencyOrderedExecutionEnabled()).toBe(true); // unset
    for (const v of ['false', '0', 'off', 'no', 'FALSE']) { process.env.DEPENDENCY_ORDERED_EXECUTION = v; expect(isDependencyOrderedExecutionEnabled()).toBe(false); }
    for (const v of ['true', '1', 'on', 'yes', '']) { process.env.DEPENDENCY_ORDERED_EXECUTION = v; expect(isDependencyOrderedExecutionEnabled()).toBe(true); }
  });

  it('DC-10: flag OFF => computeWorkableLeaves deep-equals legacy order (even with would-block deps); hermetic', () => {
    process.env.DEPENDENCY_ORDERED_EXECUTION = 'false';
    const sds = depTree({ deps: { B: ['SD-LEAF-A'], C: ['SD-LEAF-A'] } }); // would block B,C when ON
    const d = descendantsOf(sds);
    expect(computeWorkableLeaves(d)).toEqual(legacyWorkableLeaves(d)); // B,C NOT gated out
    expect(keys(computeWorkableLeaves(d))).toEqual(['SD-LEAF-A', 'SD-LEAF-B', 'SD-LEAF-C']);
  });

  it('DC-15: runConsume drives a dependency predecessor BEFORE its dependent leaf', async () => {
    const sds = depTree({ deps: { B: ['SD-LEAF-A'] } }); // B depends on A (both draft)
    const sb = new MockSB(eligibleTables(sds));
    const captured = [];
    await runConsume({ supabase: sb, ventureId: VID, driveLeaf: capturingDrive(sb.tables, captured), now: () => 0 });
    const order = captured.map((c) => c.key);
    expect(order.indexOf('SD-LEAF-A')).toBeLessThan(order.indexOf('SD-LEAF-B')); // predecessor first
  });

  it('DC-7b: runConsume emits dependency_fallback once on a stalled (cyclic) frontier', async () => {
    const sds = depTree({ deps: { A: ['SD-LEAF-B'], B: ['SD-LEAF-A'] }, leaves: ['A', 'B'] });
    const sb = new MockSB(eligibleTables(sds));
    const captured = [];
    await runConsume({ supabase: sb, ventureId: VID, driveLeaf: capturingDrive(sb.tables, captured), now: () => 0 });
    const fallbacks = sb.inserts.filter((i) => i.table === 'system_events' && i.row.event_type === 'dependency_fallback');
    expect(fallbacks.length).toBe(1); // once per frontier-stall, not per leaf
  });

  it('DC-13: static guardrail — consumer source has zero _advanceStage and no stage/chairman/vision writes', () => {
    const src = readFileSync(LIB_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(src).not.toMatch(/_advanceStage/);
    expect(src).not.toMatch(/current_lifecycle_stage\s*:/); // no stage WRITE (object-key form)
    expect(src).not.toMatch(/chairman_decisions|chairman_approved\s*:/);
    expect(src).not.toMatch(/advance_venture_stage/);
  });
});
