/**
 * Integration tests for EVA Exit Readiness Phase 2
 * SD: SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-B
 *
 * Tests: separability scoring, data room generation, domain handlers, API endpoints
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseServiceClient();

let testVentureId;
let testScoreId;
let testArtifactId;

describe('Exit Readiness Phase 2 - Scoring & Data Room', () => {
  beforeAll(async () => {
    const { data } = await supabase
      .from('eva_ventures')
      .select('id')
      .limit(1)
      .single();
    testVentureId = data?.id;
    if (!testVentureId) throw new Error('No eva_ventures found for testing');
  });

  // ── Separability Scores Table ──────────────────────────────

  describe('venture_separability_scores', () => {
    it('should insert a separability score', async () => {
      const { data, error } = await supabase
        .from('venture_separability_scores')
        .insert({
          venture_id: testVentureId,
          overall_score: 72.5,
          infrastructure_independence: 80,
          data_portability: 65,
          ip_clarity: 70,
          team_dependency: 60,
          operational_autonomy: 85,
          metadata: { source: 'test' },
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(Number(data.overall_score)).toBeCloseTo(72.5);
      expect(data.venture_id).toBe(testVentureId);
      testScoreId = data.id;
    });

    it('should retrieve score history ordered by scored_at', async () => {
      // Insert a second score
      await supabase.from('venture_separability_scores').insert({
        venture_id: testVentureId,
        overall_score: 78.0,
        infrastructure_independence: 85,
        data_portability: 70,
        ip_clarity: 75,
        team_dependency: 65,
        operational_autonomy: 90,
      });

      const { data, error } = await supabase
        .from('venture_separability_scores')
        .select('*')
        .eq('venture_id', testVentureId)
        .order('scored_at', { ascending: false });

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThanOrEqual(2);
      // Most recent should be first
      expect(new Date(data[0].scored_at).getTime())
        .toBeGreaterThanOrEqual(new Date(data[1].scored_at).getTime());
    });

    it('should enforce score range 0-100', async () => {
      const { error } = await supabase
        .from('venture_separability_scores')
        .insert({
          venture_id: testVentureId,
          overall_score: 150, // Invalid
        });

      expect(error).not.toBeNull();
    });
  });

  // ── Data Room Artifacts Table ─────────────────────────────

  describe('venture_data_room_artifacts', () => {
    it('should insert a data room artifact', async () => {
      const { data, error } = await supabase
        .from('venture_data_room_artifacts')
        .insert({
          venture_id: testVentureId,
          artifact_type: 'financial',
          artifact_version: 1,
          content: { total_asset_value: 50000, generated_at: new Date().toISOString() },
          content_hash: 'abc123',
          is_current: true,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.artifact_type).toBe('financial');
      expect(data.is_current).toBe(true);
      testArtifactId = data.id;
    });

    it('should enforce valid artifact types', async () => {
      const { error } = await supabase
        .from('venture_data_room_artifacts')
        .insert({
          venture_id: testVentureId,
          artifact_type: 'invalid_type', // Not in enum
          content: {},
        });

      expect(error).not.toBeNull();
    });

    it('should support version history', async () => {
      // Mark previous as not current
      await supabase
        .from('venture_data_room_artifacts')
        .update({ is_current: false })
        .eq('id', testArtifactId);

      // Insert new version
      const { data, error } = await supabase
        .from('venture_data_room_artifacts')
        .insert({
          venture_id: testVentureId,
          artifact_type: 'financial',
          artifact_version: 2,
          content: { total_asset_value: 75000, generated_at: new Date().toISOString() },
          content_hash: 'def456',
          is_current: true,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.artifact_version).toBe(2);

      // Verify only one is current
      const { data: current } = await supabase
        .from('venture_data_room_artifacts')
        .select('id')
        .eq('venture_id', testVentureId)
        .eq('artifact_type', 'financial')
        .eq('is_current', true);

      expect(current.length).toBe(1);
    });

    it('should generate all 5 artifact types', async () => {
      const types = ['ip', 'team', 'operations', 'assets'];
      for (const type of types) {
        const { error } = await supabase
          .from('venture_data_room_artifacts')
          .insert({
            venture_id: testVentureId,
            artifact_type: type,
            content: { generated_at: new Date().toISOString() },
          });
        expect(error).toBeNull();
      }

      const { data } = await supabase
        .from('venture_data_room_artifacts')
        .select('artifact_type')
        .eq('venture_id', testVentureId)
        .eq('is_current', true);

      const types_present = [...new Set(data.map(d => d.artifact_type))];
      expect(types_present).toContain('financial');
      expect(types_present).toContain('ip');
      expect(types_present).toContain('team');
      expect(types_present).toContain('operations');
      expect(types_present).toContain('assets');
    });
  });

  // ── Scoring Engine ────────────────────────────────────────

  describe('Separability Scoring Engine', () => {
    it('should compute scores via module', async () => {
      const { computeSeparabilityScore } = await import('../../lib/eva/exit/separability-scorer.js');

      const result = await computeSeparabilityScore(testVentureId, {
        supabase,
        logger: { info: () => {}, warn: () => {}, error: () => {} },
      });

      expect(result).not.toBeNull();
      expect(result.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.overall_score).toBeLessThanOrEqual(100);
      expect(result.infrastructure_independence).toBeDefined();
      expect(result.data_portability).toBeDefined();
      expect(result.ip_clarity).toBeDefined();
      expect(result.team_dependency).toBeDefined();
      expect(result.operational_autonomy).toBeDefined();
    });

    it('should return null for missing ventureId', async () => {
      const { computeSeparabilityScore } = await import('../../lib/eva/exit/separability-scorer.js');

      const result = await computeSeparabilityScore(null, {
        supabase,
        logger: { info: () => {}, warn: () => {}, error: () => {} },
      });

      expect(result).toBeNull();
    });
  });

  // ── Data Room Generator ───────────────────────────────────

  describe('Data Room Generator', () => {
    it('should generate all artifact types', async () => {
      const { generateDataRoom } = await import('../../lib/eva/exit/data-room-generator.js');

      const result = await generateDataRoom(testVentureId, {
        supabase,
        logger: { info: () => {}, warn: () => {}, error: () => {} },
      });

      expect(result.venture_id).toBe(testVentureId);
      expect(result.artifacts.length).toBe(5);
      expect(result.error_count).toBe(0);
    });

    it('should handle missing ventureId gracefully', async () => {
      const { generateDataRoom } = await import('../../lib/eva/exit/data-room-generator.js');

      const result = await generateDataRoom(null, {
        supabase,
        logger: { info: () => {}, warn: () => {}, error: () => {} },
      });

      expect(result.error).toBeDefined();
    });
  });

  // ── Domain Handler Registration ───────────────────────────

  describe('Domain Handlers', () => {
    it('should register ops_separability_score handler', async () => {
      const { registerOperationsHandlers } = await import('../../lib/eva/operations/domain-handler.js');

      const handlers = new Map();
      const registry = {
        register: (name, fn) => handlers.set(name, fn),
      };

      registerOperationsHandlers(registry);
      expect(handlers.has('ops_separability_score')).toBe(true);
    });

    it('should register ops_data_room_refresh handler', async () => {
      const { registerOperationsHandlers } = await import('../../lib/eva/operations/domain-handler.js');

      const handlers = new Map();
      const registry = {
        register: (name, fn) => handlers.set(name, fn),
      };

      registerOperationsHandlers(registry);
      expect(handlers.has('ops_data_room_refresh')).toBe(true);
    });

    it('should include Phase 2 cadences', async () => {
      const { OPERATIONS_CADENCES } = await import('../../lib/eva/operations/domain-handler.js');

      expect(OPERATIONS_CADENCES.ops_separability_score).toBe('daily');
      expect(OPERATIONS_CADENCES.ops_data_room_refresh).toBe('daily');
    });
  });

  // ── Cleanup ───────────────────────────────────────────────

  afterAll(async () => {
    if (testVentureId) {
      await supabase
        .from('venture_separability_scores')
        .delete()
        .eq('venture_id', testVentureId)
        .eq('metadata->>source', 'test');

      await supabase
        .from('venture_data_room_artifacts')
        .delete()
        .eq('venture_id', testVentureId);
    }
  });
});
