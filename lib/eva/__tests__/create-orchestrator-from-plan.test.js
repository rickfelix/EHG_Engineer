/**
 * Unit + snapshot-invariant tests for lib/eva/create-orchestrator-from-plan.js
 *
 * SD: SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001 / FR-A
 *
 * Coverage:
 *   - TS-6 (snapshot regression): non-F3/F5 fields match CRONGENIUS-M1 baseline
 *   - TS-7 (F3 fix): targetApplication threading
 *   - TS-8 (F5 fix): quality-gate JSONB fields populated
 *   - TS-1 partial (insertCascade idempotency under mock supabase)
 *   - TS-11 (parsePhases robustness)
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  buildOrchestratorSD,
  buildChildSD,
  insertCascade,
  parsePhases,
  withTargetRepos,
} from '../create-orchestrator-from-plan.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '../../../tests/fixtures/crongenius-m1-snapshot.json');

const SNAPSHOT = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

const VISION_INPUT = SNAPSHOT.vision;
const ARCH_INPUT = SNAPSHOT.archplan;
const PHASES = ARCH_INPUT?.sections?.implementation_phases || [];

const VOLATILE = new Set(['id', 'created_at', 'updated_at', 'parent_sd_id']);
function strip(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(strip);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (VOLATILE.has(k)) continue;
    out[k] = strip(v);
  }
  return out;
}

describe('parsePhases', () => {
  it('parses heading style "## Phase 1: Title"', () => {
    const phases = parsePhases('## Phase 1: First\nbody1\n## Phase 2: Second\nbody2');
    expect(phases).toHaveLength(2);
    expect(phases[0]).toMatchObject({ number: 1, title: 'First' });
    expect(phases[1]).toMatchObject({ number: 2, title: 'Second' });
  });
  it('parses bullet style "- **Phase 1**: Title"', () => {
    const phases = parsePhases('- **Phase 1 (MVP)**: Bullet phase\n  details');
    expect(phases).toHaveLength(1);
    expect(phases[0]).toMatchObject({ number: 1 });
  });
  it('returns [] for empty content', () => {
    expect(parsePhases('')).toEqual([]);
    expect(parsePhases(null)).toEqual([]);
  });
  it('TS-11: handles markdown with no phases gracefully', () => {
    const phases = parsePhases('# Title\n\nSome prose without phase headings.\n');
    expect(phases).toEqual([]);
  });
});

describe('withTargetRepos', () => {
  it('preserves identity when targetRepos is null/empty', () => {
    expect(withTargetRepos({ a: 1 }, null)).toEqual({ a: 1 });
    expect(withTargetRepos({ a: 1 }, [])).toEqual({ a: 1 });
  });
  it('adds target_repos array when set', () => {
    expect(withTargetRepos({ a: 1 }, ['EHG'])).toEqual({ a: 1, target_repos: ['EHG'] });
  });
});

describe('buildOrchestratorSD', () => {
  it('throws when title is missing', () => {
    expect(() => buildOrchestratorSD({ targetApplication: 'X' })).toThrow(/title is required/);
  });
  it('throws when targetApplication is missing (F3 enforcement)', () => {
    expect(() => buildOrchestratorSD({ title: 'X' })).toThrow(/targetApplication is required/);
  });
  it('TS-7: respects targetApplication parameter (F3 fix)', () => {
    const { record } = buildOrchestratorSD({ title: 'TestVenture M1', phases: [], targetApplication: 'TestVenture' });
    expect(record.target_application).toBe('TestVenture');
    expect(record.target_application).not.toBe('EHG_Engineer');
  });
  it('TS-8: F5 fix — quality-gate JSONB fields populated when dimensions present', () => {
    const { record } = buildOrchestratorSD({
      title: 'Foo',
      visionDoc: { extracted_dimensions: [{ name: 'a', weight: 0.3, description: 'A' }, { name: 'b', weight: 0.3, description: 'B' }] },
      archPlan: { extracted_dimensions: [{ name: 'c', weight: 0.2, description: 'C' }, { name: 'd', weight: 0.2, description: 'D' }] },
      phases: [{ number: 1, title: 'P1' }, { number: 2, title: 'P2' }, { number: 3, title: 'P3' }, { number: 4, title: 'P4' }],
      targetApplication: 'EHG_Engineer',
    });
    expect(record.dependencies.length).toBeGreaterThanOrEqual(3);
    expect(record.risks.length).toBeGreaterThanOrEqual(3);
    expect(record.risks[0]).toHaveProperty('severity');
    expect(record.stakeholders.length).toBeGreaterThanOrEqual(3);
    expect(record.implementation_guidelines.length).toBeGreaterThanOrEqual(3);
    expect(record.strategic_objectives.length).toBeGreaterThanOrEqual(4);
    expect(record.success_criteria.length).toBeGreaterThanOrEqual(5);
    expect(record.success_criteria[0]).toHaveProperty('criterion');
    expect(record.success_criteria[0]).toHaveProperty('measure');
  });
  it('F5 graceful fallback when no dimensions', () => {
    const { record } = buildOrchestratorSD({
      title: 'Foo', phases: [{ number: 1, title: 'P1' }], targetApplication: 'EHG_Engineer',
    });
    expect(record.dependencies.length).toBeGreaterThanOrEqual(1);
    expect(record.risks.length).toBeGreaterThanOrEqual(1);
    expect(record.stakeholders.length).toBeGreaterThanOrEqual(3); // base 3 always
    expect(record.implementation_guidelines.length).toBeGreaterThanOrEqual(3);
  });
  it('TS-6 partial: structural invariants match CRONGENIUS-M1 snapshot', () => {
    if (!VISION_INPUT || !ARCH_INPUT) return; // skip if fixture missing
    const { record, key } = buildOrchestratorSD({
      visionDoc: VISION_INPUT,
      archPlan: ARCH_INPUT,
      phases: PHASES,
      title: SNAPSHOT.orchestrator.title,
      targetApplication: 'CronGenius',
      visionKey: ARCH_INPUT.vision_key,
      archKey: ARCH_INPUT.plan_key,
    });
    // F3 fix verified: target_application matches production (chairman-overridden)
    expect(record.target_application).toBe(SNAPSHOT.orchestrator.target_application);
    // sd_type/category/priority are creation-time structural invariants.
    // status + current_phase evolve post-creation (CRONGENIUS-M1 is currently
    // in_progress/PLAN_VERIFICATION) so we do NOT compare them to the snapshot —
    // the builder always emits the at-creation values 'draft' + 'LEAD_APPROVAL'.
    expect(record.sd_type).toBe(SNAPSHOT.orchestrator.sd_type);
    expect(record.category).toBe(SNAPSHOT.orchestrator.category);
    expect(record.priority).toBe(SNAPSHOT.orchestrator.priority);
    expect(record.status).toBe('draft');
    expect(record.current_phase).toBe('LEAD_APPROVAL');
    // metadata invariants
    expect(record.metadata.is_orchestrator).toBe(true);
    expect(record.metadata.auto_generated).toBe(true);
    expect(record.metadata.vision_key).toBe(SNAPSHOT.orchestrator.metadata.vision_key);
    expect(record.metadata.arch_key).toBe(SNAPSHOT.orchestrator.metadata.arch_key);
    expect(record.metadata.child_count).toBe(SNAPSHOT.children.length);
    // key matches the expected suffix pattern
    expect(key).toMatch(/-ORCH-001$/);
  });
});

describe('buildChildSD', () => {
  const orchestratorRecord = {
    title: 'Parent', sd_type: 'orchestrator', category: 'feature', priority: 'high',
    key_principles: ['LEO'], strategic_objectives: ['S1'], success_criteria: ['SC1'], risks: ['R1'],
    metadata: { vision_key: 'V', arch_key: 'A' },
  };
  it('throws when targetApplication missing (F3 enforcement)', () => {
    expect(() => buildChildSD({
      phase: { number: 1, title: 'P1' }, orchestratorRecord, orchestratorKey: 'SD-X-ORCH-001', orchestratorId: 'uuid-x',
    })).toThrow(/targetApplication/);
  });
  it('produces child key with -A/-B/-C suffix from phase.number', () => {
    const { key } = buildChildSD({
      phase: { number: 2, title: 'Beta' }, orchestratorRecord, orchestratorKey: 'SD-X-ORCH-001', orchestratorId: 'uuid-x', targetApplication: 'AcmeVenture',
    });
    expect(key).toBe('SD-X-ORCH-001-B');
  });
  it('F3: target_application threaded to child', () => {
    const { record } = buildChildSD({
      phase: { number: 1, title: 'P1' }, orchestratorRecord, orchestratorKey: 'SD-X-ORCH-001', orchestratorId: 'uuid-x', targetApplication: 'AcmeVenture',
    });
    expect(record.target_application).toBe('AcmeVenture');
  });
  it('non-vertical detector flags backend-only phases', () => {
    const { record, sliceCheck } = buildChildSD({
      phase: { number: 1, title: 'database migration', description: 'add column', content: 'sql schema rls' },
      orchestratorRecord, orchestratorKey: 'SD-X-ORCH-001', orchestratorId: 'uuid-x', targetApplication: 'X',
    });
    expect(sliceCheck.non_vertical).toBe(true);
    expect(record.non_vertical).toBe(true);
    expect(record.non_vertical_justification).toMatch(/backend/);
  });
  it('non-vertical detector does NOT flag vertical phases (both layers)', () => {
    const { sliceCheck } = buildChildSD({
      phase: { number: 1, title: 'Add dashboard', description: 'with API', content: 'component schema migration ui dashboard' },
      orchestratorRecord, orchestratorKey: 'SD-X-ORCH-001', orchestratorId: 'uuid-x', targetApplication: 'X',
    });
    expect(sliceCheck.non_vertical).toBe(false);
  });
});

describe('insertCascade', () => {
  it('returns errors when required args missing', async () => {
    const result = await insertCascade({});
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].error).toMatch(/required/);
  });
  it('TS-3: dry-run skips DB writes and tags records', async () => {
    const orchestratorRecord = { id: 'x', sd_key: 'K', metadata: {} };
    const childRecords = [{ id: 'c1', sd_key: 'K-A', metadata: {} }];
    const result = await insertCascade({ supabase: {}, orchestratorRecord, childRecords, dryRun: true });
    expect(result.orchestrator._dry_run).toBe(true);
    expect(result.children[0]._dry_run).toBe(true);
    expect(result.errors).toEqual([]);
  });
  it('TS-1: happy-path insert via mock supabase', async () => {
    const inserts = [];
    const supabase = {
      from(table) {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
          insert(row) { inserts.push({ table, row }); return Promise.resolve({ error: null }); },
          update() { return { eq: () => Promise.resolve({ error: null }) }; },
        };
      },
    };
    const orchestratorRecord = { id: 'oo', sd_key: 'SD-X-ORCH-001', metadata: { vision_key: 'V', arch_key: 'A' } };
    const childRecords = [{ id: 'cc1', sd_key: 'SD-X-ORCH-001-A', metadata: { phase_number: 1 } }];
    const result = await insertCascade({ supabase, orchestratorRecord, childRecords });
    expect(result.errors).toEqual([]);
    expect(inserts.length).toBe(2); // orchestrator + 1 child
    expect(result.orchestrator.sd_key).toBe('SD-X-ORCH-001');
    expect(result.children.length).toBe(1);
  });
  it('TS-3 idempotency: skip existing orchestrator with matching vision/arch', async () => {
    const inserts = [];
    const supabase = {
      from(table) {
        let _table = table;
        const builder = {
          select() { return builder; },
          eq() { return builder; },
          maybeSingle() {
            if (_table === 'strategic_directives_v2' && inserts.length === 0) {
              return Promise.resolve({ data: { id: 'existing-uuid', metadata: { vision_key: 'V', arch_key: 'A' } }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          insert(row) { inserts.push({ table: _table, row }); return Promise.resolve({ error: null }); },
          update() { return { eq: () => Promise.resolve({ error: null }) }; },
        };
        return builder;
      },
    };
    const orchestratorRecord = { id: 'oo', sd_key: 'SD-X-ORCH-001', metadata: { vision_key: 'V', arch_key: 'A' } };
    const childRecords = [];
    const result = await insertCascade({ supabase, orchestratorRecord, childRecords });
    expect(result.errors).toEqual([]);
    // Orchestrator INSERT skipped (resumed)
    expect(inserts.length).toBe(0);
    expect(result.orchestrator.id).toBe('existing-uuid');
  });
  it('reports key collision when existing orchestrator has different vision/arch', async () => {
    const supabase = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle() { return Promise.resolve({ data: { id: 'e1', metadata: { vision_key: 'DIFFERENT', arch_key: 'DIFFERENT' } }, error: null }); },
          insert() { return Promise.resolve({ error: null }); },
        };
      },
    };
    const orchestratorRecord = { id: 'oo', sd_key: 'SD-X-ORCH-001', metadata: { vision_key: 'V', arch_key: 'A' } };
    const result = await insertCascade({ supabase, orchestratorRecord, childRecords: [] });
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].error).toMatch(/Key collision/);
  });
});
