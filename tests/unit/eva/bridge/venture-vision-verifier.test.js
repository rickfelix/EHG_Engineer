/**
 * SD-LEO-INFRA-VISION-GROUNDED-ACCEPTANCE-001 (FR-3) — the GATHER + STORE verifier lib. Mirrors the
 * MockSB pattern of dependency-ordered-execution.test.js. The judge is INJECTED (no live agent), so
 * these run headlessly. VA-18..VA-24 from the PRD test_scenarios.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  runVerify, gatherVerificationInputs, recordVerdict, normalizeVerdict,
} from '../../../../lib/eva/bridge/venture-vision-verifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_PATH = resolve(__dirname, '../../../../lib/eva/bridge/venture-vision-verifier.js');

// ---- Minimal mutable mock of the supabase query builder (records selects/inserts/updates) ----
class MockQuery {
  constructor(sb, table) { this.sb = sb; this.table = table; this._op = 'select'; this._filters = []; this._payload = null; this._limit = null; this._single = false; }
  select(cols) { this._op = this._op === 'insert' || this._op === 'update' ? this._op : 'select'; this._cols = cols; this.sb.selects.push({ table: this.table, cols }); return this; }
  insert(obj) { this._op = 'insert'; this._payload = obj; return this; }
  update(obj) { this._op = 'update'; this._payload = obj; return this; }
  eq(c, v) { this._filters.push(['eq', c, v]); return this; }
  order() { return this; }
  limit(n) { this._limit = n; return this; }
  maybeSingle() { this._single = true; return this._exec(); }
  then(res, rej) { return this._exec().then(res, rej); }
  _match(row) { return this._filters.every(([op, c, v]) => (op === 'eq' ? row[c] === v : true)); }
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
      return { data: null, error: null };
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

const VID = 'venture-xyz';
function baseTables(overrides = {}) {
  return {
    eva_vision_documents: overrides.vision !== undefined ? overrides.vision : [
      { venture_id: VID, level: 'L2', status: 'active', chairman_approved: true, vision_key: 'V-1', version: 3, content: 'vision text', updated_at: '2026-06-01', extracted_dimensions: [{ name: 'Convert', weight: 1 }, { name: 'Capture', weight: 1 }] },
    ],
    ventures: [{ id: VID, repo_url: 'https://github.com/x/y', deployment_url: 'https://y.example', name: 'Y' }],
    venture_artifacts: [{ venture_id: VID, artifact_type: 'build_mvp_build', is_current: true, artifact_data: { verdict: 'PASS' }, content: null }],
    applications: [{ id: 'app1', local_path: 'C:/repos/y', repo_url: 'https://github.com/x/y' }],
    venture_stage_work: overrides.stageWork !== undefined ? overrides.stageWork : [{ id: 'sw1', venture_id: VID, lifecycle_stage: 19, advisory_data: { reason: 'vision_pending', bridge_failed: true } }],
    system_events: [],
  };
}

describe('gatherVerificationInputs (VA-18)', () => {
  it('VA-18: selects extracted_dimensions from the chairman-approved L2 vision + the built-venture artifacts', async () => {
    const sb = new MockSB(baseTables());
    const inputs = await gatherVerificationInputs(sb, VID);
    expect(inputs.visionPresent).toBe(true);
    expect(inputs.visionDimensions).toHaveLength(2);
    expect(inputs.repoUrl).toBe('https://github.com/x/y');
    expect(inputs.deploymentUrl).toBe('https://y.example');
    expect(inputs.buildVerdict).toBe('PASS');
    expect(inputs.localPath).toBe('C:/repos/y');
    // the vision select must request extracted_dimensions explicitly (assertVentureVisionReady does not)
    const visionSelect = sb.selects.find((s) => s.table === 'eva_vision_documents');
    expect(visionSelect.cols).toMatch(/extracted_dimensions/);
  });

  it('VA-18b: chairman_approved=false → not matched → visionPresent false (filter is real)', async () => {
    const sb = new MockSB(baseTables({ vision: [{ venture_id: VID, level: 'L2', status: 'active', chairman_approved: false, vision_key: 'V-1', extracted_dimensions: [] }] }));
    const inputs = await gatherVerificationInputs(sb, VID);
    expect(inputs.visionPresent).toBe(false);
  });
});

describe('runVerify (VA-19..VA-22)', () => {
  it('VA-19 + VA-20 + VA-21: invokes the judge, merges the verdict into advisory_data, emits the audit event', async () => {
    const sb = new MockSB(baseTables());
    let judgeArgs = null;
    const verifyVenture = (dims, artifacts) => { judgeArgs = { dims, artifacts }; return { pass: false, gaps: [{ name: 'Capture', evidence: 'no form' }], corrective_sds: [{ title: 'Add form' }] }; };
    const res = await runVerify({ supabase: sb, ventureId: VID, verifyVenture, pgClient: null });

    // VA-19: judge invoked with dimensions + artifacts
    expect(judgeArgs.dims).toHaveLength(2);
    expect(judgeArgs.artifacts.repoUrl).toBe('https://github.com/x/y');
    expect(judgeArgs.artifacts.buildVerdict).toBe('PASS');

    // VA-20: verdict written, sibling advisory_data keys preserved
    expect(res.wrote).toBe(true);
    expect(res.verdict.pass).toBe(false);
    const row = sb.tables.venture_stage_work[0];
    expect(row.advisory_data.vision_acceptance_verdict.pass).toBe(false);
    expect(row.advisory_data.reason).toBe('vision_pending');   // NOT clobbered
    expect(row.advisory_data.bridge_failed).toBe(true);        // NOT clobbered
    expect(sb.updates.length).toBe(1);

    // VA-21: system_events VISION_ACCEPTANCE_VERDICT on the payload column (no event_data)
    const ev = sb.inserts.find((i) => i.table === 'system_events');
    expect(ev.row.event_type).toBe('VISION_ACCEPTANCE_VERDICT');
    expect(ev.row.payload).toBeDefined();
    expect(ev.row.details).toBeDefined();
    expect(ev.row.event_data).toBeUndefined();
    expect(ev.row.payload.verdict_pass).toBe(false);
  });

  it('VA-20b: inserts a stage-work row when none exists (no clobber path)', async () => {
    const sb = new MockSB(baseTables({ stageWork: [] }));
    await runVerify({ supabase: sb, ventureId: VID, verifyVenture: () => ({ pass: true }), pgClient: null });
    const inserted = sb.inserts.find((i) => i.table === 'venture_stage_work');
    expect(inserted.row.lifecycle_stage).toBe(19);
    expect(inserted.row.advisory_data.vision_acceptance_verdict.pass).toBe(true);
  });

  it('VA-22: dryRun=true → ZERO writes, never invokes the judge', async () => {
    const sb = new MockSB(baseTables());
    let judged = false;
    const res = await runVerify({ supabase: sb, ventureId: VID, verifyVenture: () => { judged = true; return { pass: false }; }, dryRun: true, pgClient: null });
    expect(judged).toBe(false);
    expect(res.dryRun).toBe(true);
    expect(res.wrote).toBe(false);
    expect(sb.updates.length).toBe(0);
    expect(sb.inserts.length).toBe(0);
    expect(res.currentVerdict).toBeNull();
  });

  it('VA-22b: no judge injected → introspect only (zero writes)', async () => {
    const sb = new MockSB(baseTables());
    const res = await runVerify({ supabase: sb, ventureId: VID, pgClient: null }); // no verifyVenture
    expect(res.dryRun).toBe(true);
    expect(sb.updates.length + sb.inserts.length).toBe(0);
  });

  it('no chairman-approved vision → skip (defer to VISION_MISSING gate), never writes', async () => {
    const sb = new MockSB(baseTables({ vision: [] }));
    const res = await runVerify({ supabase: sb, ventureId: VID, verifyVenture: () => ({ pass: false }), pgClient: null });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('no_approved_l2_vision');
    expect(sb.updates.length + sb.inserts.length).toBe(0);
  });
});

describe('normalizeVerdict + recordVerdict', () => {
  it('normalizeVerdict coerces a non-boolean pass to false (never a silent pass)', () => {
    expect(normalizeVerdict({ pass: true }).pass).toBe(true);
    expect(normalizeVerdict({}).pass).toBe(false);
    expect(normalizeVerdict(null).pass).toBe(false);
    expect(normalizeVerdict({ pass: 'yes' }).pass).toBe(false);
    const n = normalizeVerdict({ pass: false });
    expect(n.criteria_results).toEqual([]);
    expect(n.evaluated_by).toBe('leo-verify-venture');
    expect(typeof n.evaluated_at).toBe('string');
  });

  it('recordVerdict persists a pre-judged verdict via the canonical store (read-merge-write + audit)', async () => {
    const sb = new MockSB(baseTables());
    const res = await recordVerdict({ supabase: sb, ventureId: VID, verdict: { pass: false, gaps: [{ name: 'X' }] }, pgClient: null });
    expect(res.wrote).toBe(true);
    expect(sb.tables.venture_stage_work[0].advisory_data.vision_acceptance_verdict.pass).toBe(false);
    expect(sb.inserts.find((i) => i.table === 'system_events').row.event_type).toBe('VISION_ACCEPTANCE_VERDICT');
  });
});

describe('static never-advance guardrail (VA-24)', () => {
  it('VA-24: verifier source has zero advance/stage-write/chairman tokens (writes advisory_data/system_events only)', () => {
    const src = readFileSync(LIB_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(src).not.toMatch(/_advanceStage/);
    expect(src).not.toMatch(/current_lifecycle_stage\s*:/);   // no stage WRITE (object-key form)
    expect(src).not.toMatch(/chairman_decisions|chairman_approved\s*:/); // no chairman write (bare read predicate is absent too)
    expect(src).not.toMatch(/advance_venture_stage/);
  });
});
