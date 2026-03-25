/**
 * Tests for Lifecycle-SD Bridge
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-B
 * SD-LEO-INFRA-VENTURE-BUILD-READINESS-001-D (3-tier hierarchy, safety controls)
 */

import { describe, it, expect, vi } from 'vitest';

// Mock sd-key-generator (has shebang that vitest can't transform)
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-ORCH-SPRINT-TEST-001'),
  generateChildKey: vi.fn().mockImplementation((parent, idx) => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return `${parent}-${letters[idx]}`;
  }),
  generateGrandchildKey: vi.fn().mockImplementation((parent, idx) => `${parent}${idx + 1}`),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

import {
  convertSprintToSDs,
  buildBridgeArtifactRecord,
  _internal,
} from '../../../lib/eva/lifecycle-sd-bridge.js';

const {
  TYPE_MAP,
  ARCHITECTURE_LAYERS,
  MAX_CHILDREN_PER_ORCHESTRATOR,
  MAX_GRANDCHILDREN_PER_CHILD,
  buildProvenance,
  selectApplicableLayers,
} = _internal;

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

function createMockSupabase({ insertError = null, existingOrchestrator = null, failOnNthInsert = -1 } = {}) {
  let selectCallCount = 0;
  let insertCallCount = 0;

  return {
    from: vi.fn((table) => {
      if (table === 'strategic_directives_v2') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (existingOrchestrator && selectCallCount === 1) {
              return Promise.resolve({ data: [existingOrchestrator], error: null });
            }
            return Promise.resolve({ data: [], error: null });
          }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockImplementation(() => {
            insertCallCount++;
            if (failOnNthInsert > 0 && insertCallCount === failOnNthInsert) {
              return Promise.resolve({ data: null, error: { message: `Insert #${insertCallCount} failed` } });
            }
            return Promise.resolve({ data: null, error: insertError });
          }),
          update: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: insertError,
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: null, error: insertError }),
      };
    }),
    rpc: vi.fn().mockResolvedValue({ data: { cancelled_sds: 0, cancelled_prds: 0 }, error: null }),
  };
}

describe('LifecycleSDBridge', () => {
  describe('TYPE_MAP', () => {
    it('should map feature to feature', () => {
      expect(TYPE_MAP.feature).toBe('feature');
    });

    it('should map bugfix to bugfix', () => {
      expect(TYPE_MAP.bugfix).toBe('bugfix');
    });

    it('should map enhancement to feature', () => {
      expect(TYPE_MAP.enhancement).toBe('feature');
    });

    it('should map refactor to refactor', () => {
      expect(TYPE_MAP.refactor).toBe('refactor');
    });

    it('should map infra to infrastructure', () => {
      expect(TYPE_MAP.infra).toBe('infrastructure');
    });
  });

  describe('convertSprintToSDs - empty payloads', () => {
    it('should return created=false when no payloads', async () => {
      const result = await convertSprintToSDs(
        { stageOutput: { sd_bridge_payloads: [] }, ventureContext: { id: 'v1', name: 'Test' } },
        { supabase: createMockSupabase(), logger: silentLogger },
      );
      expect(result.created).toBe(false);
      expect(result.errors).toContain('No sprint items to convert');
    });

    it('should return created=false when payloads is undefined', async () => {
      const result = await convertSprintToSDs(
        { stageOutput: {}, ventureContext: { id: 'v1', name: 'Test' } },
        { supabase: createMockSupabase(), logger: silentLogger },
      );
      expect(result.created).toBe(false);
    });
  });

  describe('convertSprintToSDs - idempotency', () => {
    it('should return existing orchestrator when already exists', async () => {
      const existing = { id: 'orch-1', sd_key: 'SD-ORCH-SPRINT-TEST-001' };
      const mockSb = createMockSupabase({ existingOrchestrator: existing });

      const result = await convertSprintToSDs(
        {
          stageOutput: {
            sprint_name: 'Sprint 1',
            sprint_goal: 'Build MVP',
            sd_bridge_payloads: [{ title: 'Feature A', type: 'feature' }],
          },
          ventureContext: { id: 'v1', name: 'Test' },
        },
        { supabase: mockSb, logger: silentLogger },
      );

      expect(result.created).toBe(false);
      expect(result.orchestratorKey).toBe('SD-ORCH-SPRINT-TEST-001');
    });
  });

  describe('convertSprintToSDs - grandchild generation (US-001)', () => {
    it('should include grandchildKeys in result', async () => {
      const result = await convertSprintToSDs(
        {
          stageOutput: {
            sprint_name: 'Sprint 1',
            sprint_goal: 'Build',
            sd_bridge_payloads: [{ title: 'Feature A', type: 'feature', description: 'Desc', scope: 'Scope' }],
          },
          ventureContext: { id: 'v1', name: 'Test' },
        },
        { supabase: createMockSupabase(), logger: silentLogger },
      );

      expect(result.created).toBe(true);
      expect(result.grandchildKeys).toBeDefined();
      expect(result.grandchildKeys.length).toBeGreaterThan(0);
    });

    it('should skip grandchildren when option disabled', async () => {
      const result = await convertSprintToSDs(
        {
          stageOutput: {
            sprint_name: 'Sprint 1',
            sprint_goal: 'Build',
            sd_bridge_payloads: [{ title: 'Feature A', type: 'feature', description: 'D', scope: 'S' }],
          },
          ventureContext: { id: 'v1', name: 'Test' },
          options: { generateGrandchildren: false },
        },
        { supabase: createMockSupabase(), logger: silentLogger },
      );

      expect(result.created).toBe(true);
      expect(result.grandchildKeys).toEqual([]);
    });
  });

  describe('Amplification cap (US-004)', () => {
    it('should enforce MAX_CHILDREN_PER_ORCHESTRATOR', () => {
      expect(MAX_CHILDREN_PER_ORCHESTRATOR).toBe(10);
    });

    it('should enforce MAX_GRANDCHILDREN_PER_CHILD', () => {
      expect(MAX_GRANDCHILDREN_PER_CHILD).toBe(5);
    });

    it('should cap children to MAX when payloads exceed limit', async () => {
      const payloads = Array.from({ length: 15 }, (_, i) => ({
        title: `Item ${i}`, type: 'feature', description: 'D', scope: 'S',
      }));
      const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

      const result = await convertSprintToSDs(
        {
          stageOutput: { sprint_name: 'Big Sprint', sprint_goal: 'Big', sd_bridge_payloads: payloads },
          ventureContext: { id: 'v1', name: 'Test' },
          options: { generateGrandchildren: false },
        },
        { supabase: createMockSupabase(), logger },
      );

      expect(result.childKeys.length).toBeLessThanOrEqual(MAX_CHILDREN_PER_ORCHESTRATOR);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Amplification cap hit'),
      );
    });
  });

  describe('Provenance tagging (US-005)', () => {
    it('should build provenance with all required fields', () => {
      const prov = buildProvenance('venture-123');
      expect(prov.generation_source).toBe('auto-pipeline-stage-17-doc-gen');
      expect(prov.source_venture_id).toBe('venture-123');
      expect(prov.generated_at).toBeDefined();
      expect(prov.generation_version).toBe('1.0');
    });

    it('should handle null ventureId', () => {
      const prov = buildProvenance(null);
      expect(prov.source_venture_id).toBeNull();
    });
  });

  describe('selectApplicableLayers', () => {
    it('should return all layers by default', () => {
      const layers = selectApplicableLayers({});
      expect(layers).toEqual(ARCHITECTURE_LAYERS);
      expect(layers.length).toBe(4);
    });

    it('should filter by payload hints', () => {
      const layers = selectApplicableLayers({ architecture_layers: ['data', 'api'] });
      expect(layers.length).toBe(2);
      expect(layers[0].key).toBe('data');
      expect(layers[1].key).toBe('api');
    });

    it('should ignore unknown layer keys', () => {
      const layers = selectApplicableLayers({ architecture_layers: ['data', 'unknown'] });
      expect(layers.length).toBe(1);
    });
  });

  describe('Transaction rollback (US-003)', () => {
    it('should rollback on failure and return errors', async () => {
      // Fail on 3rd insert (2nd child)
      const mockSb = createMockSupabase({ failOnNthInsert: 3 });
      const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

      const result = await convertSprintToSDs(
        {
          stageOutput: {
            sprint_name: 'Sprint 1',
            sprint_goal: 'Build',
            sd_bridge_payloads: [
              { title: 'A', type: 'feature', description: 'D', scope: 'S' },
              { title: 'B', type: 'feature', description: 'D', scope: 'S' },
            ],
          },
          ventureContext: { id: 'v1', name: 'Test' },
          options: { generateGrandchildren: false },
        },
        { supabase: mockSb, logger },
      );

      expect(result.created).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // RPC rollback should have been attempted
      expect(mockSb.rpc).toHaveBeenCalledWith('fn_rollback_sd_hierarchy', expect.any(Object));
    });
  });

  describe('buildBridgeArtifactRecord', () => {
    it('should build correct artifact for successful bridge', () => {
      const record = buildBridgeArtifactRecord('venture-1', 18, {
        created: true,
        orchestratorKey: 'SD-ORCH-SPRINT-001',
        childKeys: ['SD-ORCH-SPRINT-001-A', 'SD-ORCH-SPRINT-001-B'],
        grandchildKeys: ['SD-ORCH-SPRINT-001-A1'],
        errors: [],
      });

      expect(record.venture_id).toBe('venture-1');
      expect(record.lifecycle_stage).toBe(18);
      expect(record.artifact_type).toBe('lifecycle_sd_bridge');
      expect(record.quality_score).toBe(100);
      expect(record.validation_status).toBe('validated');
      expect(record.is_current).toBe(true);
      expect(record.metadata.childCount).toBe(2);
      expect(record.metadata.grandchildCount).toBe(1);
      expect(record.metadata.hasErrors).toBe(false);
    });

    it('should reduce quality score for errors', () => {
      const record = buildBridgeArtifactRecord('venture-1', 18, {
        created: true,
        orchestratorKey: 'SD-ORCH-001',
        childKeys: ['SD-ORCH-001-A'],
        grandchildKeys: [],
        errors: ['Child B failed', 'Child C failed'],
      });

      expect(record.quality_score).toBe(50);
      expect(record.validation_status).toBe('pending');
      expect(record.metadata.hasErrors).toBe(true);
    });

    it('should not go below 0 quality score', () => {
      const record = buildBridgeArtifactRecord('v1', 18, {
        created: true,
        orchestratorKey: 'SD-1',
        childKeys: [],
        errors: ['e1', 'e2', 'e3', 'e4', 'e5'],
      });

      expect(record.quality_score).toBe(0);
    });
  });

  describe('convertSprintToSDs - EVA key enrichment (SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001-A)', () => {
    it('should include vision_key and plan_key in orchestrator metadata', async () => {
      const mockSb = createMockSupabase();
      const insertCalls = [];
      mockSb.from = vi.fn((table) => {
        if (table === 'strategic_directives_v2') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn().mockImplementation((data) => {
              insertCalls.push(data);
              return Promise.resolve({ data: null, error: null });
            }),
            update: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis(), insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      });
      mockSb.rpc = vi.fn().mockResolvedValue({ data: { cancelled_sds: 0, cancelled_prds: 0 }, error: null });

      await convertSprintToSDs(
        {
          stageOutput: {
            sprint_name: 'Sprint 1',
            sprint_goal: 'Build',
            sd_bridge_payloads: [{ title: 'Feature A', type: 'feature', description: 'D', scope: 'S' }],
          },
          ventureContext: { id: 'v1', name: 'Test' },
          evaKeys: { vision_key: 'VISION-TEST-001', plan_key: 'ARCH-TEST-001' },
          options: { generateGrandchildren: false },
        },
        { supabase: mockSb, logger: silentLogger },
      );

      // Orchestrator is first insert
      const orchestratorInsert = insertCalls[0];
      expect(orchestratorInsert.metadata.vision_key).toBe('VISION-TEST-001');
      expect(orchestratorInsert.metadata.plan_key).toBe('ARCH-TEST-001');

      // Child is second insert
      const childInsert = insertCalls[1];
      expect(childInsert.metadata.vision_key).toBe('VISION-TEST-001');
      expect(childInsert.metadata.plan_key).toBe('ARCH-TEST-001');
    });

    it('should handle missing evaKeys gracefully', async () => {
      const mockSb = createMockSupabase();
      const insertCalls = [];
      mockSb.from = vi.fn((table) => {
        if (table === 'strategic_directives_v2') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn().mockImplementation((data) => {
              insertCalls.push(data);
              return Promise.resolve({ data: null, error: null });
            }),
            update: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis(), insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      });
      mockSb.rpc = vi.fn().mockResolvedValue({ data: { cancelled_sds: 0, cancelled_prds: 0 }, error: null });

      const result = await convertSprintToSDs(
        {
          stageOutput: {
            sprint_name: 'Sprint 1',
            sprint_goal: 'Build',
            sd_bridge_payloads: [{ title: 'Feature A', type: 'feature', description: 'D', scope: 'S' }],
          },
          ventureContext: { id: 'v1', name: 'Test' },
          // evaKeys omitted — should default to {}
          options: { generateGrandchildren: false },
        },
        { supabase: mockSb, logger: silentLogger },
      );

      expect(result.created).toBe(true);
      // Metadata should have null keys, not crash
      const orchestratorInsert = insertCalls[0];
      expect(orchestratorInsert.metadata.vision_key).toBeNull();
      expect(orchestratorInsert.metadata.plan_key).toBeNull();
    });
  });
});
