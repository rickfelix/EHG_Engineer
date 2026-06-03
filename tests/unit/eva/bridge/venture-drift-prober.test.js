/**
 * SD-LEO-INFRA-STAGE-VISION-DRIFT-001 (PR-2) — venture-drift-prober (the PRODUCER) tests.
 * TS-1..TS-10 from the PRD test_scenarios. Verifies the producer records a verdict the dormant PR-1
 * vision-drift-gate.js classifier can read, with the load-bearing 4-dim -> {material_drift} reduction
 * (C1), set-only-one-key spread-merge (C2), the vision-drift advisory lock (C2), and the never-advance /
 * session-only static guardrail (C4, FR-6).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  normalizeDriftVerdict,
  runDriftProbe,
  recordVerdict,
  gatherDriftInputs,
} from '../../../../lib/eva/bridge/venture-drift-prober.js';
import {
  classifyVisionDrift,
  shouldHoldForVisionDrift,
  isVisionDriftGateEnabled,
  VISION_DRIFT,
  DRIFT_HOLD_CAUSE,
} from '../../../../lib/eva/bridge/vision-drift-gate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRODUCER_PATH = resolve(__dirname, '../../../../lib/eva/bridge/venture-drift-prober.js');

// ── Minimal Supabase mock (chainable + thenable) ─────────────────────────────
function makeMockSupabase(fixtures = {}) {
  const writes = { updates: [], inserts: [] };
  function builder(table) {
    const b = {
      select() { return b; },
      eq() { return b; },
      gte() { return b; },
      lte() { return b; },
      order() { return b; },
      limit() { return b; },
      maybeSingle() {
        if (table === 'eva_vision_documents') return Promise.resolve({ data: fixtures.eva_vision_documents ?? null, error: null });
        if (table === 'ventures') return Promise.resolve({ data: fixtures.ventures ?? null, error: null });
        if (table === 'venture_stage_work') return Promise.resolve({ data: fixtures.venture_stage_work ?? null, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      update(payload) {
        return { eq: () => { writes.updates.push({ table, payload }); return Promise.resolve({ error: null }); } };
      },
      insert(payload) { writes.inserts.push({ table, payload }); return Promise.resolve({ error: null }); },
      // thenable: supports `await supabase.from('venture_artifacts').select()...lte()` (no maybeSingle)
      then(onF, onR) {
        const data = table === 'venture_artifacts' ? (fixtures.venture_artifacts ?? []) : null;
        return Promise.resolve({ data, error: null }).then(onF, onR);
      },
    };
    return b;
  }
  const supabase = { from: (t) => builder(t), __writes: writes };
  return supabase;
}

function makeMockPg(record = {}) {
  return {
    connect: async () => {},
    query: async (sql, params) => {
      if (sql.includes('hashtext')) { record.lockName = params[0]; return { rows: [{ k: 4242 }] }; }
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] };
      return { rows: [{}] };
    },
    end: async () => {},
    __record: record,
  };
}

const VENTURE = '510177ba-0000-0000-0000-000000000000';
const visionFixture = { vision_key: 'vk', version: 2, content: 'hosted SaaS', updated_at: '2026-06-01', extracted_dimensions: [{ name: 'v', description: 'd', weight: 1 }] };

// ── TS-1: 4-dimension judge output reduced to {material_drift} (C1) ───────────
describe('normalizeDriftVerdict — C1 reducer (TS-1, TS-2, TS-7)', () => {
  it('TS-1: any dimension drift===true reduces to { material_drift:true } (not the raw dims)', () => {
    const v = normalizeDriftVerdict({ dimensions: [
      { dimension: 'value-proposition', drift: false },
      { dimension: 'technical-modality', drift: true },
    ] });
    expect(v.material_drift).toBe(true);
    expect(classifyVisionDrift(v)).toBe(VISION_DRIFT.MATERIAL_DRIFT);
    // the raw per-dimension object must NOT be what the gate classifies
    expect(typeof v.material_drift).toBe('boolean');
  });

  it('TS-1b: all dimensions false reduces to { material_drift:false } → NO_DRIFT', () => {
    const v = normalizeDriftVerdict({ dimensions: [{ drift: false }, { drift: false }] });
    expect(v.material_drift).toBe(false);
    expect(classifyVisionDrift(v)).toBe(VISION_DRIFT.NO_DRIFT);
  });

  it('TS-1c: explicit material_drift boolean wins over dimensions', () => {
    expect(normalizeDriftVerdict({ material_drift: true, dimensions: [{ drift: false }] }).material_drift).toBe(true);
  });

  it('TS-2: { board_unavailable:true } passes through (transient), NOT coerced to material_drift', () => {
    const v = normalizeDriftVerdict({ board_unavailable: true, dimensions: [{ drift: false }] });
    expect(v.board_unavailable).toBe(true);
    expect(v.material_drift).toBeUndefined();
    expect(classifyVisionDrift(v)).toBe(VISION_DRIFT.BOARD_UNAVAILABLE);
  });

  it('TS-2b: { packet_incomplete:true } passes through (transient)', () => {
    const v = normalizeDriftVerdict({ packet_incomplete: true });
    expect(v.packet_incomplete).toBe(true);
    expect(classifyVisionDrift(v)).toBe(VISION_DRIFT.PACKET_INCOMPLETE);
  });

  it('TS-7: empty/unusable judge result degrades to board_unavailable — NEVER a silent material_drift:false', () => {
    for (const raw of [null, undefined, {}, { dimensions: [] }, { material_drift: 'yes' }]) {
      const v = normalizeDriftVerdict(raw);
      expect(v.material_drift, JSON.stringify(raw)).toBeUndefined();
      expect(v.board_unavailable, JSON.stringify(raw)).toBe(true);
      // crucially: the gate must NOT see NO_DRIFT for an unusable probe
      expect(classifyVisionDrift(v)).not.toBe(VISION_DRIFT.NO_DRIFT);
    }
  });

  it('transient wins even when a drift value is also present (probe value untrusted)', () => {
    const v = normalizeDriftVerdict({ board_unavailable: true, material_drift: true });
    expect(v.board_unavailable).toBe(true);
    expect(v.material_drift).toBeUndefined();
  });
});

// ── TS-3 / TS-4 / TS-9: storeVerdict via recordVerdict ───────────────────────
describe('recordVerdict — store contract (TS-3, TS-4, TS-9)', () => {
  it('TS-3: spread-merge preserves sibling advisory_data keys (vision_acceptance_verdict, reason)', async () => {
    const supabase = makeMockSupabase({ venture_stage_work: { id: 'sw1', advisory_data: { vision_acceptance_verdict: { pass: true }, reason: 'pending' } } });
    await recordVerdict({ supabase, ventureId: VENTURE, verdict: { material_drift: true }, pgClient: null });
    const upd = supabase.__writes.updates.find((u) => u.table === 'venture_stage_work');
    expect(upd).toBeTruthy();
    expect(upd.payload.advisory_data.vision_acceptance_verdict).toEqual({ pass: true });
    expect(upd.payload.advisory_data.reason).toBe('pending');
    expect(upd.payload.advisory_data.vision_drift_verdict.material_drift).toBe(true);
  });

  it('TS-4: advisory lock name is vision-drift:${ventureId} (NOT vision-verify)', async () => {
    const supabase = makeMockSupabase({ venture_stage_work: { id: 'sw1', advisory_data: {} } });
    const rec = {};
    const pgClient = makeMockPg(rec);
    await recordVerdict({ supabase, ventureId: VENTURE, verdict: { material_drift: false }, pgClient });
    expect(rec.lockName).toBe(`vision-drift:${VENTURE}`);
    expect(rec.lockName).not.toContain('vision-verify');
  });

  it('TS-9: producer-written verdict drives the PR-1 gate to HOLD/chairman', async () => {
    const supabase = makeMockSupabase({ venture_stage_work: { id: 'sw1', advisory_data: {} } });
    // judge flags technical-modality drift; producer reduces to material_drift:true
    const res = await recordVerdict({ supabase, ventureId: VENTURE, verdict: { dimensions: [{ dimension: 'technical-modality', drift: true }] }, pgClient: null });
    const decision = shouldHoldForVisionDrift({ verdict: res.verdict });
    expect(decision.hold).toBe(true);
    expect(decision.cause).toBe(DRIFT_HOLD_CAUSE.CHAIRMAN);
  });

  it('inserts a new stage-work row when none exists (set-only-one-key)', async () => {
    const supabase = makeMockSupabase({ venture_stage_work: null });
    await recordVerdict({ supabase, ventureId: VENTURE, verdict: { material_drift: false }, pgClient: null });
    const ins = supabase.__writes.inserts.find((i) => i.table === 'venture_stage_work');
    expect(ins).toBeTruthy();
    expect(ins.payload.lifecycle_stage).toBe(19);
    expect(ins.payload.advisory_data.vision_drift_verdict.material_drift).toBe(false);
  });
});

// ── TS-8: dry-run / no-judge introspection (zero writes) ─────────────────────
describe('runDriftProbe — introspection + judge path (TS-1 store, TS-8)', () => {
  it('TS-8: dry-run performs ZERO writes and reports current verdict', async () => {
    const supabase = makeMockSupabase({ eva_vision_documents: visionFixture, ventures: { name: 'V' }, venture_artifacts: [], venture_stage_work: { id: 'sw1', advisory_data: { vision_drift_verdict: { material_drift: false } } } });
    const res = await runDriftProbe({ supabase, ventureId: VENTURE, dryRun: true });
    expect(res.wrote).toBe(false);
    expect(res.currentVerdict).toEqual({ material_drift: false });
    expect(supabase.__writes.updates.length).toBe(0);
    expect(supabase.__writes.inserts.length).toBe(0);
  });

  it('no driftProbe injected → introspect (zero writes), never invents a verdict', async () => {
    const supabase = makeMockSupabase({ eva_vision_documents: visionFixture, venture_artifacts: [] });
    const res = await runDriftProbe({ supabase, ventureId: VENTURE /* no driftProbe */ });
    expect(res.wrote).toBe(false);
    expect(supabase.__writes.updates.length + supabase.__writes.inserts.length).toBe(0);
  });

  it('no chairman-approved L2 vision → skip (defer to VISION_MISSING), zero writes', async () => {
    const supabase = makeMockSupabase({ eva_vision_documents: null, venture_artifacts: [] });
    const res = await runDriftProbe({ supabase, ventureId: VENTURE, driftProbe: () => ({ material_drift: true }) });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('no_approved_l2_vision');
    expect(supabase.__writes.updates.length + supabase.__writes.inserts.length).toBe(0);
  });

  it('TS-1(store): injected judge → reduced {material_drift:true} written to advisory_data', async () => {
    const supabase = makeMockSupabase({ eva_vision_documents: visionFixture, ventures: { name: 'V' }, venture_artifacts: [], venture_stage_work: { id: 'sw1', advisory_data: {} } });
    const driftProbe = () => ({ dimensions: [{ dimension: 'deployment-model', drift: true }] });
    const res = await runDriftProbe({ supabase, ventureId: VENTURE, driftProbe, pgClient: null });
    expect(res.wrote).toBe(true);
    const upd = supabase.__writes.updates.find((u) => u.table === 'venture_stage_work');
    expect(upd.payload.advisory_data.vision_drift_verdict.material_drift).toBe(true);
    // and the stored shape classifies correctly
    expect(classifyVisionDrift(upd.payload.advisory_data.vision_drift_verdict)).toBe(VISION_DRIFT.MATERIAL_DRIFT);
  });
});

// ── gather: injectable summarizer, sprintPresent ─────────────────────────────
describe('gatherDriftInputs — pure reads + injectable summarizer', () => {
  it('reads vision + artifacts, computes sprintPresent, attaches injected summaries', async () => {
    const supabase = makeMockSupabase({
      eva_vision_documents: visionFixture,
      ventures: { name: 'DataDistill' },
      venture_artifacts: [
        { id: 'a1', artifact_type: 'blueprint_technical_architecture', lifecycle_stage: 14, title: 'Arch' },
        { id: 'a2', artifact_type: 'blueprint_sprint_plan', lifecycle_stage: 19, title: 'Sprint' },
      ],
    });
    const summarize = async () => new Map([['blueprint_sprint_plan', { summary_text: 's', tags: ['t'] }]]);
    const inputs = await gatherDriftInputs(supabase, VENTURE, { summarize });
    expect(inputs.visionPresent).toBe(true);
    expect(inputs.sprintPresent).toBe(true);
    expect(inputs.artifacts.length).toBe(2);
    expect(inputs.artifactSummaries.blueprint_sprint_plan.summary_text).toBe('s');
  });

  it('a failing summarizer is non-fatal (judge falls back to raw artifacts)', async () => {
    const supabase = makeMockSupabase({ eva_vision_documents: visionFixture, venture_artifacts: [{ id: 'a1', artifact_type: 'blueprint_sprint_plan', lifecycle_stage: 19 }] });
    const summarize = async () => { throw new Error('LLM down'); };
    const inputs = await gatherDriftInputs(supabase, VENTURE, { summarize, logger: { warn() {} } });
    expect(inputs.artifactSummaries).toBeNull();
    expect(inputs.sprintPresent).toBe(true);
  });
});

// ── TS-10: gate stays dormant ────────────────────────────────────────────────
describe('gate dormancy (TS-10)', () => {
  it('TS-10: VISION_DRIFT_GATE default OFF with no env set', () => {
    const prev = process.env.VISION_DRIFT_GATE;
    delete process.env.VISION_DRIFT_GATE;
    expect(isVisionDriftGateEnabled()).toBe(false);
    if (prev !== undefined) process.env.VISION_DRIFT_GATE = prev;
  });
});

// ── TS-6 / FR-6: static never-advance + session-only guardrail ───────────────
describe('static never-advance + session-only guardrail (TS-6, FR-6)', () => {
  it('TS-6: producer source has no background timer/cron and no advance/lifecycle/governance tokens', () => {
    const src = readFileSync(PRODUCER_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    // C4: forbid background timers / cron (extends the gate's DR-24 with setTimeout)
    expect(src).not.toMatch(/setInterval\(/);
    expect(src).not.toMatch(/setTimeout\(/);
    expect(src).not.toMatch(/cron\.schedule|node-cron/);
    // never-advance invariant
    expect(src).not.toMatch(/_advanceStage/);
    expect(src).not.toMatch(/current_lifecycle_stage\s*:/);
    expect(src).not.toMatch(/chairman_decisions|chairman_approved\s*:/);
    expect(src).not.toMatch(/advance_venture_stage/);
  });
});
