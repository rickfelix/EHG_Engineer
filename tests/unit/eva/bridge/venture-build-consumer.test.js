// Tests for the leo_bridge build CONSUMER (SD-LEO-INFRA-AUTO-EXECUTE-LEO-002).
// TS-1..TS-11 from the prospective testing-agent (row 97f8e272). The keystone TS-1 drives a NESTED
// tree end-to-end against a mutable mock, so a single-seed (non-tree-walker) implementation fails it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  runConsume, computeWorkableLeaves, isTreeComplete, fetchDescendants,
  ventureEligibility, maybeIdleNudge, tryAdvisoryLock, finalizeConsume, TERMINAL, NON_TERMINAL,
} from '../../../../lib/eva/bridge/venture-build-consumer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_PATH = resolve(__dirname, '../../../../lib/eva/bridge/venture-build-consumer.js');

// ---- Minimal mutable mock of the supabase query builder (only the chains the lib uses) ----
class MockQuery {
  constructor(sb, table) { this.sb = sb; this.table = table; this._op = 'select'; this._filters = []; this._payload = null; this._limit = null; this._single = false; this._returnData = false; }
  select(cols) { if (this._op === 'update') { this._returnData = true; return this; } this._op = 'select'; this._cols = cols; return this; }
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
  constructor(tables) { this.tables = tables; this.inserts = []; this.updates = []; }
  from(name) { return new MockQuery(this, name); }
}

const VID = 'venture-1';
function eligibleTables(extra = {}) {
  return {
    ventures: [{ id: VID, build_model: 'leo_bridge', status: 'active', current_lifecycle_stage: 19, deleted_at: null, orchestrator_state: 'blocked' }],
    eva_vision_documents: [{ venture_id: VID, level: 'L2', status: 'active', chairman_approved: true, vision_key: 'V-1' }],
    strategic_directives_v2: [],
    system_events: [],
    // SD-LEO-INFRA-VENTURE-STACK-STANDARDS-001: a COMPLIANT is_current artifact so the new fail-closed
    // stack gate (read before the drive loop) passes for the default eligible venture.
    venture_artifacts: [{ venture_id: VID, is_current: true, artifact_type: 'blueprint_technical_architecture', content: 'Auth via Clerk (@clerk/tanstack-react-start). Data on Replit Postgres via DATABASE_URL.', artifact_data: null }],
    ...extra,
  };
}

// Build a nested tree: 1 top orch -> C child-orchs -> G grandchildren each (all draft).
function nestedTree({ children = 5, grandkidsEach = 4 } = {}) {
  const sds = [{ id: 'orch-top', sd_key: 'ORCH-TOP', venture_id: VID, sd_type: 'orchestrator', parent_sd_id: null, status: 'draft', sequence_rank: 0, metadata: {} }];
  for (let c = 0; c < children; c++) {
    const cid = `orch-${c}`;
    sds.push({ id: cid, sd_key: `ORCH-${c}`, venture_id: VID, sd_type: 'orchestrator', parent_sd_id: 'orch-top', status: 'draft', sequence_rank: c });
    for (let g = 0; g < grandkidsEach; g++) {
      sds.push({ id: `leaf-${c}-${g}`, sd_key: `LEAF-${c}-${g}`, venture_id: VID, sd_type: 'feature', parent_sd_id: cid, status: 'draft', sequence_rank: g });
    }
  }
  return sds;
}

// Mock driveLeaf that completes the leaf and bubble-completes parents (mirrors checkAndCompleteParent).
function makeDriveLeaf(tables, { failKeys = new Set() } = {}) {
  return async (leaf) => {
    if (failKeys.has(leaf.sd_key)) return { completed: false };
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

describe('venture-build-consumer — introspection', () => {
  it('computeWorkableLeaves returns only non-orchestrator leaves with no non-terminal descendant, deepest-first', () => {
    const sds = nestedTree({ children: 2, grandkidsEach: 2 });
    // exclude the top orchestrator (fetchDescendants never returns it)
    const descendants = sds.filter((s) => s.id !== 'orch-top');
    const leaves = computeWorkableLeaves(descendants);
    expect(leaves.length).toBe(4); // 2 child-orchs * 2 grandkids
    expect(leaves.every((l) => l.sd_type === 'feature')).toBe(true); // never a child-orchestrator
  });

  it('isTreeComplete is true only when no descendant is draft/active', () => {
    const sds = nestedTree({ children: 1, grandkidsEach: 2 }).filter((s) => s.id !== 'orch-top');
    expect(isTreeComplete(sds)).toBe(false);
    sds.forEach((s) => { s.status = 'completed'; });
    expect(isTreeComplete(sds)).toBe(true);
  });
});

describe('TS-1 — nested-tree drive (keystone)', () => {
  it('drives every workable leaf across all child-orchestrators to completion (single-seed would fail)', async () => {
    const tables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 5, grandkidsEach: 4 }) });
    const sb = new MockSB(tables);
    const driveLeaf = makeDriveLeaf(tables);
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf, bounds: { maxLeaves: 100, wallClockMs: 1e9, maxAttemptsPerLeaf: 2 } });
    expect(res.completed).toBe(true);
    expect(res.held).toBe(false);
    expect(res.drivenLeaves.length).toBe(20); // 5 * 4 grandchildren, NOT just one child-orch's 4
    const drivenChildGroups = new Set(res.drivenLeaves.map((d) => d.sd_key.split('-')[1]));
    expect(drivenChildGroups.size).toBe(5); // proves it crossed all 5 child-orchestrators (nested walk)
    // idempotency marker set after completion
    const top = tables.strategic_directives_v2.find((r) => r.id === 'orch-top');
    expect(top.metadata.build_consumed_at).toBeTruthy();
  });
});

describe('TS-2 / TS-3 — read-safe starter-only static guardrail', () => {
  it('the consumer source (comments stripped) contains no advance / stage-write / decision-write tokens', () => {
    const raw = readFileSync(LIB_PATH, 'utf-8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const forbidden = [
      /_advanceStage/, /advance_venture_stage/, /chairman_decisions/, /getNextReadyChild/,
      /release_sd/, /TeamCreate/, /spawnTeammate/, /Task\s*\(/, /sd-start/,
      /current_lifecycle_stage\s*:/, /chairman_approved\s*:/,
    ];
    for (const pat of forbidden) expect(code, `forbidden token ${pat}`).not.toMatch(pat);
  });

  it('still permits legitimate READS of stage and the vision-approved flag', () => {
    const raw = readFileSync(LIB_PATH, 'utf-8');
    // these reads must exist and must NOT be a write object-key (no trailing colon)
    expect(raw).toMatch(/current_lifecycle_stage(,| )/); // read in a select list / property access
    expect(raw).toMatch(/eq\('chairman_approved', true\)/); // read predicate, not a write
  });
});

describe('TS-4 — per-leaf attempt cap stops a failing leaf and HOLDs', () => {
  it('retries the failing leaf up to the cap then holds with the venture untouched', async () => {
    const tables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 1, grandkidsEach: 1 }) });
    const sb = new MockSB(tables);
    const driveLeaf = makeDriveLeaf(tables, { failKeys: new Set(['LEAF-0-0']) });
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf, bounds: { maxLeaves: 100, wallClockMs: 1e9, maxAttemptsPerLeaf: 2 } });
    expect(res.held).toBe(true);
    expect(res.reason).toMatch(/^leaf_attempt_cap:LEAF-0-0/);
    expect(res.drivenLeaves.filter((d) => !d.completed).length).toBe(2); // exactly 2 attempts
    // no idle-nudge / no stage write happened on the held path
    const stageWrites = sb.updates.filter((u) => 'current_lifecycle_stage' in u.payload);
    expect(stageWrites.length).toBe(0);
  });
});

describe('TS-5 — wall-clock / start-budget cap', () => {
  it('start-budget cap holds after maxLeaves drives', async () => {
    const tables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 2, grandkidsEach: 2 }) });
    const sb = new MockSB(tables);
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(tables), bounds: { maxLeaves: 1, wallClockMs: 1e9, maxAttemptsPerLeaf: 2 } });
    expect(res.completed).toBe(false);
    expect(res.held).toBe(true);
    expect(res.reason).toBe('start_budget_exceeded');
  });

  it('wall-clock cap holds when time exceeds the bound', async () => {
    const tables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 2, grandkidsEach: 2 }) });
    const sb = new MockSB(tables);
    let t = 0;
    const now = () => (t === 0 ? (t = 1, 0) : 10_000); // first check 0, subsequent checks past the cap
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(tables), bounds: { maxLeaves: 100, wallClockMs: 5_000, maxAttemptsPerLeaf: 2 }, now });
    expect(res.held).toBe(true);
    expect(res.reason).toBe('wall_clock_exceeded');
  });
});

describe('TS-6 — concurrency: exactly one driver', () => {
  it('tryAdvisoryLock reports not-acquired when pg returns false, and mock-acquired with no client', async () => {
    const fakePg = { query: async (sql) => (/pg_try_advisory_lock/.test(sql) ? { rows: [{ acquired: false }] } : { rows: [{ k: 123 }] }) };
    const held = await tryAdvisoryLock(fakePg, 'venture-build-consumer:v');
    expect(held.acquired).toBe(false);
    const noClient = await tryAdvisoryLock(null, 'x');
    expect(noClient.acquired).toBe(true);
    expect(noClient.mock).toBe(true);
  });
});

describe('TS-7 — idempotency: re-run after complete is a no-op', () => {
  it('skips when build_consumed_at is already set', async () => {
    const tree = nestedTree({ children: 1, grandkidsEach: 1 });
    tree.find((r) => r.id === 'orch-top').metadata = { build_consumed_at: '2026-06-01T00:00:00Z' };
    const sb = new MockSB(eligibleTables({ strategic_directives_v2: tree }));
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(sb.tables) });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('already_consumed');
    expect(res.drivenLeaves.length).toBe(0);
  });
});

describe('TS-8 — resume from live tree state after a partial build', () => {
  it('drives only the remaining draft leaves (derived from live state, not a start marker)', async () => {
    const tree = nestedTree({ children: 2, grandkidsEach: 2 });
    // simulate a prior partial build: first child-orch fully completed
    tree.filter((r) => r.parent_sd_id === 'orch-0').forEach((r) => { r.status = 'completed'; });
    tree.find((r) => r.id === 'orch-0').status = 'completed';
    const tables = eligibleTables({ strategic_directives_v2: tree });
    const sb = new MockSB(tables);
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(tables), bounds: { maxLeaves: 100, wallClockMs: 1e9, maxAttemptsPerLeaf: 2 } });
    expect(res.completed).toBe(true);
    expect(res.drivenLeaves.length).toBe(2); // only orch-1's two remaining leaves
    expect(res.drivenLeaves.every((d) => d.sd_key.startsWith('LEAF-1-'))).toBe(true);
  });
});

describe('TS-9 — idle-nudge no-op while incomplete; conditional when complete', () => {
  it('maybeIdleNudge only flips a currently-blocked venture', async () => {
    const blocked = new MockSB({ ventures: [{ id: VID, orchestrator_state: 'blocked' }] });
    expect((await maybeIdleNudge(blocked, VID)).nudged).toBe(true);
    const idle = new MockSB({ ventures: [{ id: VID, orchestrator_state: 'idle' }] });
    expect((await maybeIdleNudge(idle, VID)).nudged).toBe(false); // count-checked no-op
  });

  it('a HELD run performs no idle-nudge (venture stays blocked)', async () => {
    const tables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 1, grandkidsEach: 1 }) });
    const sb = new MockSB(tables);
    await runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(tables, { failKeys: new Set(['LEAF-0-0']) }), bounds: { maxLeaves: 100, wallClockMs: 1e9, maxAttemptsPerLeaf: 1 } });
    const nudges = sb.updates.filter((u) => u.table === 'ventures' && u.payload.orchestrator_state === 'idle');
    expect(nudges.length).toBe(0);
    expect(tables.ventures[0].orchestrator_state).toBe('blocked');
  });
});

describe('TS-10 — fail-closed for non-leo_bridge / empty trees', () => {
  it('skips a non-leo_bridge venture with no writes', async () => {
    const tables = eligibleTables();
    tables.ventures[0].build_model = 'seeded_repo';
    const sb = new MockSB(tables);
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(tables) });
    expect(res.skipped).toBe(true);
    expect(res.reason).toMatch(/not_leo_bridge/);
    expect(sb.updates.length).toBe(0);
  });

  it('treats a 0-descendant tree as complete without driving anything', async () => {
    const tables = eligibleTables({ strategic_directives_v2: [{ id: 'orch-top', sd_key: 'ORCH-TOP', venture_id: VID, sd_type: 'orchestrator', parent_sd_id: null, status: 'draft', metadata: {} }] });
    const sb = new MockSB(tables);
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(tables) });
    expect(res.completed).toBe(true);
    expect(res.drivenLeaves.length).toBe(0);
  });
});

describe('FR-3 — finalize only writes when the tree is genuinely complete', () => {
  it('finalize on an incomplete tree marks nothing and nudges nothing', async () => {
    const tables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 1, grandkidsEach: 2 }) });
    const sb = new MockSB(tables);
    const r = await finalizeConsume({ supabase: sb, ventureId: VID });
    expect(r.complete).toBe(false);
    expect(r.consumed).toBe(false);
    expect(sb.updates.length).toBe(0);
    expect(tables.ventures[0].orchestrator_state).toBe('blocked');
  });

  it('finalize on a complete tree marks consumed and idle-nudges the blocked venture', async () => {
    const tree = nestedTree({ children: 1, grandkidsEach: 2 });
    tree.forEach((r) => { if (r.id !== 'orch-top') r.status = 'completed'; });
    const tables = eligibleTables({ strategic_directives_v2: tree });
    const sb = new MockSB(tables);
    const r = await finalizeConsume({ supabase: sb, ventureId: VID });
    expect(r.complete).toBe(true);
    expect(r.consumed).toBe(true);
    expect(r.idleNudged).toBe(true);
    expect(tables.strategic_directives_v2.find((x) => x.id === 'orch-top').metadata.build_consumed_at).toBeTruthy();
    expect(tables.ventures[0].orchestrator_state).toBe('idle');
  });
});

describe('TS-11 — observability emission (payload column, no event_data)', () => {
  it('emits LEAF_DRIVEN + CONSUMED rows using the payload column', async () => {
    const tables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 1, grandkidsEach: 2 }) });
    const sb = new MockSB(tables);
    await runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(tables), bounds: { maxLeaves: 100, wallClockMs: 1e9, maxAttemptsPerLeaf: 2 } });
    const events = sb.inserts.filter((i) => i.table === 'system_events').map((i) => i.row);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => 'payload' in e && !('event_data' in e))).toBe(true);
    expect(events.some((e) => e.event_type === 'LEO_BUILD_CONSUMED')).toBe(true);
    expect(events.some((e) => e.event_type === 'LEO_BUILD_LEAF_DRIVEN')).toBe(true);
  });
});

describe('FR-3 (stack gate) — fail-closed venture-stack compliance HOLD at S19', () => {
  it('HOLDS a venture whose is_current artifacts positively specify a forbidden stack (Replit Auth)', async () => {
    const tables = eligibleTables({
      strategic_directives_v2: nestedTree({ children: 1, grandkidsEach: 1 }),
      venture_artifacts: [{ venture_id: VID, is_current: true, artifact_type: 'blueprint_sprint_plan', content: 'Auth strategy: Replit Auth signs users in.', artifact_data: null }],
    });
    const sb = new MockSB(tables);
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(tables), bounds: { maxLeaves: 100, wallClockMs: 1e9, maxAttemptsPerLeaf: 2 } });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('stack_noncompliant');
    expect(res.drivenLeaves.length).toBe(0); // never entered the drive loop
    const stageWrites = sb.updates.filter((u) => 'current_lifecycle_stage' in (u.payload || {}));
    expect(stageWrites.length).toBe(0); // never advanced
    expect(res.stackCompliance.violations.some((v) => v.id === 'replit_auth')).toBe(true);
  });

  it('HOLDS a venture with zero is_current artifacts (unscannable → fail-closed)', async () => {
    const tables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 1, grandkidsEach: 1 }), venture_artifacts: [] });
    const sb = new MockSB(tables);
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(tables) });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('stack_noncompliant');
    expect(res.stackCompliance.unscannable).toBe(true);
  });

  it('PROCEEDS for a Clerk + Replit-Postgres compliant venture (no over-block)', async () => {
    const tables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 1, grandkidsEach: 2 }) });
    const sb = new MockSB(tables);
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(tables), bounds: { maxLeaves: 100, wallClockMs: 1e9, maxAttemptsPerLeaf: 2 } });
    expect(res.skipped).toBe(false);
    expect(res.completed).toBe(true);
    expect(res.drivenLeaves.length).toBe(2);
  });
});
