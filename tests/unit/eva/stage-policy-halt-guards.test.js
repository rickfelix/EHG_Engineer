/**
 * Invocation-path guards for stage-owned policy halts (_blocked/_skip).
 * SD: SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-B FR-6 / TS-8 / TS-10.
 *
 * BOTH production step-invocation paths must refuse to persist a policy-halt
 * sentinel as a stage artifact:
 *  - eva-orchestrator processStage: classifyStepResult routes 'blocked'/'skip'
 *    away from the generic fallback persist (which is typed requiredArtifacts[0]
 *    and would accidentally satisfy the stage-21 any-of artifact gate).
 *  - stage-execution-engine executeStage: isPolicyHaltOutput guards the
 *    persistArtifact + syncStageWork block (CRITICAL-1 from the prospective
 *    TESTING review: this second path would otherwise persist the sentinel as
 *    canonical distribution_channel_config, defeating the binding gate).
 *
 * @module tests/unit/eva/stage-policy-halt-guards.test
 */

import { describe, it, expect, vi } from 'vitest';

// Mock transitive deps with shebangs that vitest can't transform (same as
// orchestrator-persist-artifacts.test.js).
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

import { _internal, classifyStepResult } from '../../../lib/eva/eva-orchestrator.js';
import { isPolicyHaltOutput, executeStage } from '../../../lib/eva/stage-execution-engine.js';

describe('classifyStepResult — the orchestrator step-result routing (TS-8)', () => {
  it("routes {_blocked:true} to 'blocked' (no generic fallback persist by construction)", () => {
    expect(classifyStepResult({ _blocked: true, block_reason: 'no_thesis' })).toBe('blocked');
  });

  it("routes {_skip:true} to 'skip' (existing behavior unchanged)", () => {
    expect(classifyStepResult({ _skip: true, skip_reason: 'precondition' })).toBe('skip');
  });

  it("routes non-empty typed artifacts to 'typed_artifacts' (existing behavior unchanged)", () => {
    expect(classifyStepResult({ artifacts: [{ artifactType: 'x', payload: {} }] })).toBe('typed_artifacts');
  });

  it("routes everything else to 'fallback_persist' (existing behavior unchanged)", () => {
    expect(classifyStepResult({ channels: [], total_channels: 0 })).toBe('fallback_persist');
    expect(classifyStepResult({ artifacts: [] })).toBe('fallback_persist'); // empty array = legacy path
    expect(classifyStepResult(null)).toBe('fallback_persist');
    expect(classifyStepResult(undefined)).toBe('fallback_persist');
  });

  it('typed artifacts win over sentinel flags (a step should never mix them, but routing is deterministic)', () => {
    expect(classifyStepResult({ artifacts: [{ artifactType: 'x' }], _blocked: true })).toBe('typed_artifacts');
  });

  it('is exported through _internal for downstream tooling', () => {
    expect(_internal.classifyStepResult).toBe(classifyStepResult);
  });
});

describe('isPolicyHaltOutput — the executeStage persist guard predicate', () => {
  it('is true for _blocked and _skip sentinels', () => {
    expect(isPolicyHaltOutput({ _blocked: true, block_reason: 'x' })).toBe(true);
    expect(isPolicyHaltOutput({ _skip: true })).toBe(true);
  });

  it('is false for normal outputs, empty objects, and non-objects', () => {
    expect(isPolicyHaltOutput({ channels: [], active_channels: 0 })).toBe(false);
    expect(isPolicyHaltOutput({})).toBe(false);
    expect(isPolicyHaltOutput(null)).toBe(false);
    expect(isPolicyHaltOutput(undefined)).toBe(false);
    expect(isPolicyHaltOutput({ _blocked: 'yes' })).toBe(false); // strict boolean
  });
});

/**
 * TS-10 — executeStage end-to-end with the REAL stage-21 template (whose
 * analysisStep is the rebuilt Distribution step). With no truth_demand_thesis
 * seeded, the step takes the binding-block path and returns {_blocked:true};
 * the engine must then perform ZERO venture_artifacts persists of any
 * distribution type (the sentinel must never become the canonical artifact).
 */
function makeEngineFakeSupabase(seedRows = {}) {
  const calls = { inserts: [], updates: [], upserts: [] };
  let insertSeq = 0;

  function from(table) {
    const q = { table, op: 'select', filters: [], limitN: null, wantSingle: false, wantMaybe: false, payload: null };

    function applyFilters(rows) {
      return rows.filter((row) => q.filters.every(([kind, col, val]) => {
        if (kind === 'eq') return row[col] === val;
        if (kind === 'in') return Array.isArray(val) && val.includes(row[col]);
        return true; // other operators: pass-through
      }));
    }

    function exec() {
      if (q.op === 'insert') {
        const id = `fake-${table}-${++insertSeq}`;
        const data = q.wantSingle ? { ...q.payload, id } : [{ ...q.payload, id }];
        return Promise.resolve({ data, error: null });
      }
      if (q.op === 'update' || q.op === 'upsert') {
        return Promise.resolve({ data: null, error: null });
      }
      let rows = applyFilters(seedRows[table] || []);
      if (q.limitN != null) rows = rows.slice(0, q.limitN);
      if (q.wantSingle || q.wantMaybe) return Promise.resolve({ data: rows[0] ?? null, error: null });
      return Promise.resolve({ data: rows, error: null });
    }

    const chain = (fn) => (...args) => { if (fn) fn(...args); return builder; };
    const builder = {
      select: chain(),
      insert(payload) { q.op = 'insert'; q.payload = payload; calls.inserts.push({ table, row: payload }); return builder; },
      update(patch) { q.op = 'update'; q.payload = patch; calls.updates.push({ table, patch }); return builder; },
      upsert(payload) { q.op = 'upsert'; q.payload = payload; calls.upserts.push({ table, row: payload }); return builder; },
      eq: chain((col, val) => q.filters.push(['eq', col, val])),
      neq: chain(), gt: chain(), gte: chain(), lt: chain(), lte: chain(), is: chain(), not: chain(),
      in: chain((col, val) => q.filters.push(['in', col, val])),
      contains: chain(), or: chain(), ilike: chain(), like: chain(),
      order: chain(),
      limit(n) { q.limitN = n; return builder; },
      range: chain(),
      maybeSingle() { q.wantMaybe = true; return exec(); },
      single() { q.wantSingle = true; return exec(); },
      then(res, rej) { return exec().then(res, rej); },
    };
    return builder;
  }

  return {
    sb: { from, rpc: async () => ({ data: null, error: null }) },
    calls,
  };
}

describe('CRITICAL fix (adversarial review PR #5753): loadStageTemplate JS-wrapper hoists policy-halt sentinels', () => {
  it('surfaces the real Distribution step\'s _blocked at the TOP level so classifyStepResult routes it away from fallback_persist', async () => {
    const { sb } = makeEngineFakeSupabase({}); // no thesis → real step blocks
    const template = await _internal.loadStageTemplate(sb, 21);
    expect(Array.isArray(template.analysisSteps)).toBe(true);

    const stepResult = await template.analysisSteps[0].execute({
      ventureContext: { id: '00000000-0000-0000-0000-000000000002', name: 'WrapperTest' },
    });

    // Without the hoist, the sentinel is buried as {artifactType:null, payload:{_blocked:true}}
    // and classifyStepResult returns 'fallback_persist' — persisting the sentinel as
    // requiredArtifacts[0] (distribution_channel_config) and defeating the binding gate.
    expect(stepResult._blocked).toBe(true);
    expect(stepResult.payload).toBeUndefined();
    expect(classifyStepResult(stepResult)).toBe('blocked');
  });
});

describe('TS-10: executeStage never persists a blocked step output (stage 21, real template)', () => {
  it('runs the real Distribution analysisStep, gets _blocked (no thesis), and performs no artifact persist', async () => {
    const { sb, calls } = makeEngineFakeSupabase({}); // no thesis, no decisions
    const logs = [];
    const logger = { log: (m) => logs.push(String(m)), warn: (m) => logs.push(String(m)), error: (m) => logs.push(String(m)), info: (m) => logs.push(String(m)) };

    const result = await executeStage({
      supabase: sb,
      ventureId: '00000000-0000-0000-0000-000000000001',
      stageNumber: 21,
      logger,
    });

    // The step blocked (binding gate) rather than skipping or fabricating output;
    // the engine returned the sentinel faithfully as a policy halt.
    expect(result.output?._blocked).toBe(true);
    expect(result.output?._skip).toBeUndefined();
    expect(result.policyHalt).toBe('_blocked');
    expect(result.persisted).toBe(false);
    expect(result.artifactId).toBeNull();

    // The engine must not have persisted the sentinel as ANY distribution artifact.
    const artifactInserts = calls.inserts.filter((i) => i.table === 'venture_artifacts');
    const persistedTypes = artifactInserts.map((i) => i.row.artifact_type);
    expect(persistedTypes).not.toContain('distribution_channel_config');
    expect(persistedTypes).not.toContain('distribution_ad_copy');
    expect(persistedTypes).not.toContain('launch_deployment_runbook');
    // The stage-owned block evidence IS written (marker + chairman decision).
    expect(persistedTypes).toContain('distribution_block_marker');
    expect(calls.inserts.some((i) => i.table === 'chairman_decisions')).toBe(true);
    // And the engine logged the persist suppression.
    expect(logs.join('\n')).toMatch(/Persist skipped: step returned _blocked/);
  });
});
