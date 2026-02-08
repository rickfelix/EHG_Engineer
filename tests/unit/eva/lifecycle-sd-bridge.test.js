/**
 * Tests for Lifecycle-SD Bridge
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-B
 */

import { describe, it, expect, vi } from 'vitest';

// Mock sd-key-generator (has shebang that vitest can't transform)
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-ORCH-SPRINT-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-ORCH-SPRINT-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

import {
  convertSprintToSDs,
  buildBridgeArtifactRecord,
  _internal,
} from '../../../lib/eva/lifecycle-sd-bridge.js';

const { TYPE_MAP } = _internal;

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

function createMockSupabase({ insertError = null, existingOrchestrator = null } = {}) {
  let selectCallCount = 0;

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
          insert: vi.fn().mockReturnThis(),
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

  describe('buildBridgeArtifactRecord', () => {
    it('should build correct artifact for successful bridge', () => {
      const record = buildBridgeArtifactRecord('venture-1', 18, {
        created: true,
        orchestratorKey: 'SD-ORCH-SPRINT-001',
        childKeys: ['SD-ORCH-SPRINT-001-A', 'SD-ORCH-SPRINT-001-B'],
        errors: [],
      });

      expect(record.venture_id).toBe('venture-1');
      expect(record.lifecycle_stage).toBe(18);
      expect(record.artifact_type).toBe('lifecycle_sd_bridge');
      expect(record.quality_score).toBe(100);
      expect(record.validation_status).toBe('validated');
      expect(record.is_current).toBe(true);
      expect(record.metadata.childCount).toBe(2);
      expect(record.metadata.hasErrors).toBe(false);
    });

    it('should reduce quality score for errors', () => {
      const record = buildBridgeArtifactRecord('venture-1', 18, {
        created: true,
        orchestratorKey: 'SD-ORCH-001',
        childKeys: ['SD-ORCH-001-A'],
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
});
