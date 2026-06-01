/**
 * SD-LEO-INFRA-COMPLETE-LEO-BRIDGE-001 FR-1/FR-2.
 *
 * A child that WILL gain grandchildren must be created as sd_type='orchestrator' up front. When a
 * grandchild is inserted with parent_sd_id=child.id, the AFTER-INSERT trigger
 * trg_enforce_parent_orchestrator_type promotes the child feature->orchestrator; that nested UPDATE
 * was rejected by the type-change governance chain (bridge SDs carry no bypass), which raised
 * SD_TYPE_CHANGE_EXPLANATION_REQUIRED and rolled back the whole tree. Typing the parent as
 * orchestrator at creation makes the trigger a no-op (WHERE sd_type!='orchestrator'): no type
 * change, no bypass, governance intact. A child is typed orchestrator ONLY when it will actually
 * gain grandchildren (non-empty effective layer set) so we never create a childless orchestrator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Deterministic key generation incl. generateGrandchildKey (the real module is fully replaced).
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockResolvedValue('SD-DD-LEO-ORCH-SPRINT-001'),
  generateChildKey: vi.fn((parentKey, index) => `${parentKey}-${String.fromCharCode(65 + index)}`),
  generateGrandchildKey: vi.fn((childKey, j) => `${childKey}-${j + 1}`),
  normalizeVenturePrefix: vi.fn((name) => name.toUpperCase().replace(/\s+/g, '-')),
  keyExists: vi.fn().mockResolvedValue(false),
  SD_SOURCES: { LEO: 'LEO' },
  SD_TYPES: { feature: 'FEAT', orchestrator: 'ORCH' },
}));

// Control capability suppression: 'spa-target' has NO serverless api (suppresses the api layer);
// every other target keeps all layers.
vi.mock('../../../lib/eva/config/target-application-capabilities.js', () => ({
  getTargetApplicationCapabilities: (target) => ({
    has_serverless_api: String(target).toLowerCase() !== 'spa-target',
  }),
}));

import { convertSprintToSDs, _internal } from '../../../lib/eva/lifecycle-sd-bridge.js';
const { partitionLayersByCapability, computeEffectiveGrandchildLayers } = _internal;

const L = (key) => ({ key, label: `${key} Layer`, description: `${key} concern` });

describe('partitionLayersByCapability (pure)', () => {
  it('suppresses the api layer when the target has no serverless api', () => {
    const { kept, suppressed } = partitionLayersByCapability(
      [L('api'), L('data'), L('ui')],
      'spa-target',
    );
    expect(kept.map((l) => l.key)).toEqual(['data', 'ui']);
    expect(suppressed).toEqual(['api']);
  });

  it('keeps all layers when the target has a serverless api', () => {
    const { kept, suppressed } = partitionLayersByCapability(
      [L('api'), L('data')],
      'EHG_Engineer',
    );
    expect(kept.map((l) => l.key)).toEqual(['api', 'data']);
    expect(suppressed).toEqual([]);
  });

  it('has no side effects (returns a plain partition)', () => {
    const result = partitionLayersByCapability([L('data')], 'EHG_Engineer');
    expect(result).toEqual({ kept: [L('data')], suppressed: [] });
  });
});

describe('computeEffectiveGrandchildLayers (pure typing predicate)', () => {
  it('is NON-empty for a default child (all architecture layers) on a serverless target', () => {
    const layers = computeEffectiveGrandchildLayers({ title: 'x' }, 'EHG_Engineer');
    expect(layers.length).toBeGreaterThan(0); // => child will be typed orchestrator
  });

  it('is NON-empty for an SPA target when non-api layers remain', () => {
    // default layers minus api still has data/ui/tests
    const layers = computeEffectiveGrandchildLayers({ title: 'x' }, 'spa-target');
    expect(layers.map((l) => l.key)).not.toContain('api');
    expect(layers.length).toBeGreaterThan(0);
  });

  it('is EMPTY when the only requested layer is api on an SPA target (=> leaf child)', () => {
    const layers = computeEffectiveGrandchildLayers(
      { title: 'x', architecture_layers: ['api'] },
      'spa-target',
    );
    expect(layers).toEqual([]); // => child stays a leaf, never a childless orchestrator
  });
});

// ── Integration: the child insert's sd_type reflects the typing decision ──

function makeRecordingSupabase() {
  const inserts = [];
  const sdTable = {
    insert: vi.fn((row) => {
      inserts.push(row);
      return Promise.resolve({ error: null });
    }),
    select: vi.fn(() => ({
      // findExistingOrchestrator: .select().eq().eq().eq().limit()
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
      })),
      order: vi.fn(() => ({ then: vi.fn() })),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  };
  return {
    inserts,
    from: vi.fn((table) => {
      if (table === 'eva_vision_documents') {
        const vc = {
          select: vi.fn(() => vc),
          eq: vi.fn(() => vc),
          in: vi.fn(() => vc),
          order: vi.fn(() => vc),
          limit: vi.fn(() => vc),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { vision_key: 'VISION-DD-L2-001', version: 'v1' },
            error: null,
          }),
        };
        return vc;
      }
      return sdTable;
    }),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
  };
}

function stageOutput({ target = 'EHG_Engineer', architecture_layers } = {}) {
  const payload = {
    title: 'Core feature',
    description: 'desc',
    priority: 'high',
    type: 'feature',
    scope: 'backend',
    success_criteria: 'works',
    dependencies: [],
    risks: [],
    target_application: target,
  };
  if (architecture_layers) payload.architecture_layers = architecture_layers;
  return {
    sprint_name: 'Sprint Build',
    sprint_goal: 'Ship MVP',
    sprint_duration_days: 14,
    sd_bridge_payloads: [payload],
  };
}

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
const venture = { id: 'venture-510177ba', name: 'DataDistill' };

describe('convertSprintToSDs child typing (integration)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('types a child that will gain grandchildren as orchestrator (no rollback)', async () => {
    const supabase = makeRecordingSupabase();
    const result = await convertSprintToSDs(
      { stageOutput: stageOutput(), ventureContext: venture, options: { skipEnrichment: true } },
      { supabase, logger },
    );

    expect(result.created).toBe(true);
    expect(result.errors).toEqual([]);

    const child = supabase.inserts.find((r) => r.parent_sd_id && r.sd_key === 'SD-DD-LEO-ORCH-SPRINT-001-A');
    expect(child).toBeTruthy();
    expect(child.sd_type).toBe('orchestrator'); // FR-1: parent typed orchestrator at creation

    // FR-2: it actually has grandchildren (never a childless orchestrator)
    const grandchildren = supabase.inserts.filter((r) => r.parent_sd_id === child.id);
    expect(grandchildren.length).toBeGreaterThan(0);
    expect(result.grandchildKeys.length).toBeGreaterThan(0);
  });

  it('keeps a leaf child as its work type when grandchildren are disabled', async () => {
    const supabase = makeRecordingSupabase();
    const result = await convertSprintToSDs(
      {
        stageOutput: stageOutput(),
        ventureContext: venture,
        options: { skipEnrichment: true, generateGrandchildren: false },
      },
      { supabase, logger },
    );

    expect(result.created).toBe(true);
    const child = supabase.inserts.find((r) => r.sd_key === 'SD-DD-LEO-ORCH-SPRINT-001-A');
    expect(child.sd_type).toBe('feature'); // no grandchildren => stays a leaf
    expect(result.grandchildKeys).toEqual([]);
  });

  it('keeps a child a leaf when capability suppression empties its layer set (no childless orchestrator)', async () => {
    const supabase = makeRecordingSupabase();
    const result = await convertSprintToSDs(
      {
        stageOutput: stageOutput({ target: 'spa-target', architecture_layers: ['api'] }),
        ventureContext: venture,
        options: { skipEnrichment: true },
      },
      { supabase, logger },
    );

    expect(result.created).toBe(true);
    const child = supabase.inserts.find((r) => r.sd_key === 'SD-DD-LEO-ORCH-SPRINT-001-A');
    expect(child.sd_type).toBe('feature'); // api suppressed => empty layer set => leaf
    expect(result.grandchildKeys).toEqual([]);
  });
});
