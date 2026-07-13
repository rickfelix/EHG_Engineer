// Tests for the OBSERVE-ONLY venture-build leaf merge-witness (SD-LEO-INFRA-SHIP-WITNESS-VENTURE-001,
// Ship-witness C). TS-1..TS-7 use deterministic INJECTED mocks — NO live gh/DB. The witness runs at
// the leaf completion point inside runConsume and must NEVER change the walk or advance a stage.
import { describe, it, expect } from 'vitest';
import {
  runConsume, TERMINAL,
} from '../../../../lib/eva/bridge/venture-build-consumer.js';
import { observeLeafMergeWitness } from '../../../../lib/eva/bridge/venture-build-merge-witness.js';

// ---- Minimal mutable mock of the supabase query builder (mirrors the consumer suite's MockSB) ----
class MockQuery {
  constructor(sb, table) { this.sb = sb; this.table = table; this._op = 'select'; this._filters = []; this._payload = null; this._limit = null; this._single = false; this._returnData = false; }
  select() { if (this._op === 'update') { this._returnData = true; return this; } this._op = 'select'; return this; }
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
    venture_artifacts: [{ venture_id: VID, is_current: true, artifact_type: 'blueprint_technical_architecture', content: 'Auth via Clerk (@clerk/tanstack-react-start). Data on Replit Postgres via DATABASE_URL.', artifact_data: null }],
    ...extra,
  };
}

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

// A witness wrapper that delegates to the REAL observeLeafMergeWitness with injected deps, and
// (optionally) records each invocation's leaf key so tests can assert how often the witness fired.
function witnessWith(deps, calls) {
  return async (args) => { if (calls) calls.push(args.leaf.sd_key); return observeLeafMergeWitness({ ...args, deps }); };
}
const prFor = (sdKey) => ({ pr_number: 500 + sdKey.split('-').slice(1).reduce((a, n) => a * 10 + Number(n), 0), branch: `feat/${sdKey}` });
const BOUNDS = { maxLeaves: 100, wallClockMs: 1e9, maxAttemptsPerLeaf: 2 };

describe('TS-1 — merged leaf writes venture-build telemetry + read-back matches; result unchanged', () => {
  it('records observe-only telemetry with lane=venture-build and no COMPLETED_UNMERGED event', async () => {
    const tables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 1, grandkidsEach: 1 }) });
    const sb = new MockSB(tables);
    const deps = { prLookup: async (_s, k) => prFor(k), verifyMerged: async () => true };
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(tables), witness: witnessWith(deps), bounds: BOUNDS });
    expect(res.completed).toBe(true);
    expect(res.held).toBe(false);
    expect(res.drivenLeaves.length).toBe(1);
    const tele = tables.merge_witness_telemetry || [];
    expect(tele.length).toBe(1);
    expect(tele[0].lane).toBe('venture-build');
    expect(tele[0].overall).toBe('observe-only');
    expect(tele[0].work_key).toBe('LEAF-0-0');
    expect(tele[0].pr_number).toBe(prFor('LEAF-0-0').pr_number);
    const unmerged = (tables.system_events || []).filter((e) => e.event_type === 'LEO_BUILD_LEAF_COMPLETED_UNMERGED');
    expect(unmerged.length).toBe(0); // merged ⇒ never flagged
  });

  it('write-then-read-back: the just-written row is read back and matches (evidence confirmed)', async () => {
    const sb = new MockSB({});
    const deps = { prLookup: async () => ({ pr_number: 777 }), verifyMerged: async () => true };
    const summary = await observeLeafMergeWitness({ supabase: sb, leaf: { id: 'leaf-x', sd_key: 'LEAF-X' }, ventureId: VID, deps });
    expect(summary.mergedState).toBe('merged');
    expect(summary.telemetryWritten).toBe(true);
    expect(summary.readBack).toBe(true);
    const row = (sb.tables.merge_witness_telemetry || [])[0];
    expect(row.pr_number).toBe(777);
    expect(row.work_key).toBe('LEAF-X');
    expect(row.overall).toBe('observe-only');
  });
});

describe('TS-2 — positively not_merged leaf emits COMPLETED_UNMERGED and NEVER advances', () => {
  it('emits the event, keeps ok=true, and writes no stage/orchestrator_state (held tree)', async () => {
    const tables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 1, grandkidsEach: 2 }) });
    const sb = new MockSB(tables);
    const deps = { prLookup: async (_s, k) => prFor(k), verifyMerged: async () => false }; // positively not merged
    // LEAF-0-1 never completes ⇒ tree stays incomplete ⇒ HELD ⇒ no finalize (no idle-nudge / no marker).
    const driveLeaf = makeDriveLeaf(tables, { failKeys: new Set(['LEAF-0-1']) });
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf, witness: witnessWith(deps), bounds: BOUNDS });
    expect(res.completed).toBe(false);
    expect(res.held).toBe(true);
    // the completed leaf stayed completed (ok=true recorded) and was witnessed
    expect(res.drivenLeaves.find((d) => d.sd_key === 'LEAF-0-0').completed).toBe(true);
    const ev = (tables.system_events || []).filter((e) => e.event_type === 'LEO_BUILD_LEAF_COMPLETED_UNMERGED');
    expect(ev.length).toBe(1);
    expect(ev[0].sd_id).toBe('leaf-0-0');
    // concrete never-advance DB state:
    expect(tables.strategic_directives_v2.find((r) => r.id === 'leaf-0-0').status).toBe('completed');
    expect(tables.ventures[0].current_lifecycle_stage).toBe(19);      // stage untouched
    expect(tables.ventures[0].orchestrator_state).toBe('blocked');    // no idle-nudge
    expect(sb.updates.filter((u) => 'current_lifecycle_stage' in (u.payload || {})).length).toBe(0);
    expect(sb.updates.filter((u) => u.table === 'ventures').length).toBe(0);
  });
});

describe('TS-3 — any injected IO throw is swallowed, logged, never rethrown; result byte-identical', () => {
  async function runOnce(deps, logger) {
    const tables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 1, grandkidsEach: 1 }) });
    const sb = new MockSB(tables);
    return runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(tables), witness: witnessWith(deps), bounds: BOUNDS, logger });
  }
  it('prLookup / verifyMerged / writeTelemetry throwing yields the same runConsume result + logger.error', async () => {
    const clean = await runOnce({ prLookup: async (_s, k) => prFor(k), verifyMerged: async () => true }, { log() {}, warn() {}, error() {} });
    const cleanJson = JSON.stringify(clean);
    const throwing = [
      { prLookup: async () => { throw new Error('prLookup boom'); }, verifyMerged: async () => true },
      { prLookup: async (_s, k) => prFor(k), verifyMerged: async () => { throw new Error('verify boom'); } },
      { prLookup: async (_s, k) => prFor(k), verifyMerged: async () => true, writeTelemetry: async () => { throw new Error('telemetry boom'); } },
    ];
    for (const deps of throwing) {
      const errors = [];
      const logger = { log() {}, warn() {}, error(m) { errors.push(m); } };
      const res = await runOnce(deps, logger);
      expect(JSON.stringify(res)).toBe(cleanJson);           // returned result byte-identical
      expect(res.completed).toBe(true);                       // walk unaffected
      expect(errors.length).toBeGreaterThan(0);               // swallowed + logged via logger.error
    }
  });
});

describe('TS-4 — unresolvable PR ⇒ not_evaluable, no telemetry, no COMPLETED_UNMERGED', () => {
  it('does not flag or write anything when no PR resolves', async () => {
    const tables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 1, grandkidsEach: 1 }) });
    const sb = new MockSB(tables);
    const deps = { prLookup: async () => null, verifyMerged: async () => { throw new Error('should not be called'); } };
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(tables), witness: witnessWith(deps), bounds: BOUNDS });
    expect(res.completed).toBe(true);
    expect((tables.merge_witness_telemetry || []).length).toBe(0);
    expect((tables.system_events || []).filter((e) => e.event_type === 'LEO_BUILD_LEAF_COMPLETED_UNMERGED').length).toBe(0);
    // direct: not_evaluable and nothing emitted/written
    const summary = await observeLeafMergeWitness({ supabase: new MockSB({}), leaf: { id: 'l', sd_key: 'LEAF-Q' }, ventureId: VID, deps });
    expect(summary.mergedState).toBe('not_evaluable');
    expect(summary.telemetryWritten).toBe(false);
    expect(summary.unmergedEmitted).toBe(false);
  });
});

describe('TS-5 — witness ON vs OFF: returned runConsume result is byte-identical', () => {
  it('the kill-switch changes only side-effect telemetry, never the returned result', async () => {
    const deps = { prLookup: async (_s, k) => prFor(k), verifyMerged: async () => true };
    const prev = process.env.VENTURE_BUILD_MERGE_WITNESS;
    try {
      process.env.VENTURE_BUILD_MERGE_WITNESS = 'on';
      const onTables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 1, grandkidsEach: 2 }) });
      const onSb = new MockSB(onTables);
      const resOn = await runConsume({ supabase: onSb, ventureId: VID, driveLeaf: makeDriveLeaf(onTables), witness: witnessWith(deps), bounds: BOUNDS });

      process.env.VENTURE_BUILD_MERGE_WITNESS = 'off';
      const offTables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 1, grandkidsEach: 2 }) });
      const offSb = new MockSB(offTables);
      const resOff = await runConsume({ supabase: offSb, ventureId: VID, driveLeaf: makeDriveLeaf(offTables), witness: witnessWith(deps), bounds: BOUNDS });

      expect(JSON.stringify(resOn)).toBe(JSON.stringify(resOff));   // scope equality: returned result ONLY
      expect((onTables.merge_witness_telemetry || []).length).toBe(2);  // ON wrote telemetry
      expect(offTables.merge_witness_telemetry === undefined || offTables.merge_witness_telemetry.length === 0).toBe(true); // OFF did not
    } finally {
      if (prev === undefined) delete process.env.VENTURE_BUILD_MERGE_WITNESS; else process.env.VENTURE_BUILD_MERGE_WITNESS = prev;
    }
  });
});

describe('TS-6 — nested 5x4 tree: witness fires ~20x, stays observe-only, walk unperturbed', () => {
  it('fires once per completed leaf without perturbing drive order or completion count', async () => {
    const tables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 5, grandkidsEach: 4 }) });
    const sb = new MockSB(tables);
    const deps = { prLookup: async (_s, k) => prFor(k), verifyMerged: async () => true };
    const calls = [];
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(tables), witness: witnessWith(deps, calls), bounds: BOUNDS });
    expect(res.completed).toBe(true);
    expect(res.drivenLeaves.length).toBe(20);
    expect(calls.length).toBe(20);                                  // witnessed every completed leaf
    expect(new Set(res.drivenLeaves.map((d) => d.sd_key.split('-')[1])).size).toBe(5); // crossed all 5 child-orchs
    const tele = tables.merge_witness_telemetry || [];
    expect(tele.length).toBe(20);
    expect(tele.every((t) => t.overall === 'observe-only')).toBe(true);
    expect(tele.every((t) => t.lane === 'venture-build')).toBe(true);
  });
});

describe('TS-7 — dryRun=true ⇒ the witness never runs (no telemetry)', () => {
  it('does not invoke the witness or write any telemetry on the dry-run path', async () => {
    const tables = eligibleTables({ strategic_directives_v2: nestedTree({ children: 1, grandkidsEach: 2 }) });
    const sb = new MockSB(tables);
    const calls = [];
    const deps = { prLookup: async () => ({ pr_number: 1 }), verifyMerged: async () => true };
    const res = await runConsume({ supabase: sb, ventureId: VID, driveLeaf: makeDriveLeaf(tables), dryRun: true, witness: witnessWith(deps, calls), bounds: BOUNDS });
    expect(res.dryRun).toBe(true);
    expect(calls.length).toBe(0);
    expect((tables.merge_witness_telemetry || []).length).toBe(0);
  });

  // Operator Contract fractal binding (SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-001 FR-7):
  // a venture-stage CREATOR (leaf declaring created_tables) without its operator triple
  // is surfaced as an observe-only advisory via the SHARED validator — same verdict a
  // harness SD gets. Never blocks the observe-only walk.
  it('FR-7: surfaces an operator-contract advisory for a venture CREATOR leaf lacking its triple', async () => {
    const sb = new MockSB({});
    const deps = { prLookup: async () => ({ pr_number: 900 }), verifyMerged: async () => true, registryRows: [], retentionPolicies: [] };
    const leaf = { id: 'leaf-oc', sd_key: 'LEAF-OC', metadata: { created_tables: ['venture_signals'] } };
    const summary = await observeLeafMergeWitness({ supabase: sb, leaf, ventureId: VID, deps });
    expect(summary.operatorContract).toBeTruthy();
    expect(summary.operatorContract.verdict).toBe('fail');
    expect(summary.operatorContract.missing).toContain('reaper');
    expect(summary.mergedState).toBe('merged'); // advisory does NOT alter the merge observation
  });

  it('FR-7: no operator-contract advisory for a non-CREATOR leaf (no created_tables)', async () => {
    const sb = new MockSB({});
    const deps = { prLookup: async () => ({ pr_number: 901 }), verifyMerged: async () => true };
    const summary = await observeLeafMergeWitness({ supabase: sb, leaf: { id: 'l2', sd_key: 'LEAF-N2', metadata: {} }, ventureId: VID, deps });
    expect(summary.operatorContract).toBeNull();
  });
});
