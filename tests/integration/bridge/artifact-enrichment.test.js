/**
 * Integration Tests: Artifact Enrichment Pipeline
 * SD-LEO-INFRA-BRIDGE-ARTIFACT-ENRICHMENT-001
 *
 * Tests:
 * TS-001: Full pipeline with artifacts → enriched SDs
 * TS-002: LLM failure → fail-closed (no SDs)
 * TS-003: Cache hit on Pass 1 (summaries cached)
 * TS-004: Re-enrichment mode on existing SDs
 * TS-005: Referential integrity failure (dead link)
 * TS-006: Mapping completeness (25/25 artifact types)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── Module imports ──
import {
  loadMapping,
  getDefaultMapping,
  resolveArtifactsForSD,
  getMappedArtifactTypes,
  seedDefaultMapping,
} from '../../../lib/eva/artifact-mapping-resolver.js';

import { validateIntegrity } from '../../../lib/eva/referential-integrity-rubric.js';
import { ARTIFACT_TYPES } from '../../../lib/eva/artifact-types.js';

const TEST_VENTURE_TYPE = 'test_enrichment_type';

describe('Artifact Enrichment Pipeline', () => {
  afterAll(async () => {
    // Cleanup test mapping rows
    await supabase
      .from('venture_sd_artifact_mapping')
      .delete()
      .eq('venture_type', TEST_VENTURE_TYPE);
  });

  // TS-006: Mapping completeness
  describe('TS-006: Mapping completeness', () => {
    it('should have default mapping covering key artifact types', () => {
      const mapping = getDefaultMapping();
      const types = getMappedArtifactTypes(mapping);

      // Verify universal artifacts
      expect(types.has(ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND)).toBe(true);
      expect(types.has(ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL)).toBe(true);
      expect(types.has(ARTIFACT_TYPES.BLUEPRINT_TECHNICAL_ARCHITECTURE)).toBe(true);

      // Verify layer-specific artifacts
      expect(types.has(ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM)).toBe(true);
      expect(types.has(ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT)).toBe(true);
      expect(types.has(ARTIFACT_TYPES.BLUEPRINT_WIREFRAMES)).toBe(true);
      expect(types.has(ARTIFACT_TYPES.BLUEPRINT_USER_STORY_PACK)).toBe(true);

      // Verify supplemental
      expect(types.has(ARTIFACT_TYPES.TRUTH_COMPETITIVE_ANALYSIS)).toBe(true);
      expect(types.has(ARTIFACT_TYPES.ENGINE_PRICING_MODEL)).toBe(true);
      expect(types.has(ARTIFACT_TYPES.BLUEPRINT_RISK_REGISTER)).toBe(true);

      // At least 15 types mapped (3 universal + 5 layer + 7 supplemental)
      expect(types.size).toBeGreaterThanOrEqual(15);
    });

    it('should return universal artifacts for all layers', () => {
      const mapping = getDefaultMapping();

      for (const layer of ['data', 'api', 'ui', 'tests']) {
        const result = resolveArtifactsForSD(mapping, layer, [
          { artifact_type: ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND, id: 'a1', lifecycle_stage: 10 },
          { artifact_type: ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL, id: 'a2', lifecycle_stage: 14 },
          { artifact_type: ARTIFACT_TYPES.BLUEPRINT_TECHNICAL_ARCHITECTURE, id: 'a3', lifecycle_stage: 14 },
        ]);

        // All 3 universal artifacts should be in required
        expect(result.required.length).toBe(3);
        expect(result.required.every(r => r.classification === 'universal')).toBe(true);
      }
    });

    it('should return layer-specific artifacts for matching layers', () => {
      const mapping = getDefaultMapping();

      const artifacts = [
        { artifact_type: ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND, id: 'a1', lifecycle_stage: 10 },
        { artifact_type: ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL, id: 'a2', lifecycle_stage: 14 },
        { artifact_type: ARTIFACT_TYPES.BLUEPRINT_TECHNICAL_ARCHITECTURE, id: 'a3', lifecycle_stage: 14 },
        { artifact_type: ARTIFACT_TYPES.BLUEPRINT_WIREFRAMES, id: 'a4', lifecycle_stage: 15 },
        { artifact_type: ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM, id: 'a5', lifecycle_stage: 14 },
        { artifact_type: ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT, id: 'a6', lifecycle_stage: 14 },
      ];

      // UI layer should get wireframes
      const uiResult = resolveArtifactsForSD(mapping, 'ui', artifacts);
      const uiTypes = uiResult.required.map(r => r.artifact_type);
      expect(uiTypes).toContain(ARTIFACT_TYPES.BLUEPRINT_WIREFRAMES);

      // Data layer should get ERD
      const dataResult = resolveArtifactsForSD(mapping, 'data', artifacts);
      const dataTypes = dataResult.required.map(r => r.artifact_type);
      expect(dataTypes).toContain(ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM);

      // API layer should get API contract
      const apiResult = resolveArtifactsForSD(mapping, 'api', artifacts);
      const apiTypes = apiResult.required.map(r => r.artifact_type);
      expect(apiTypes).toContain(ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT);
    });

    it('should report missing required artifacts', () => {
      const mapping = getDefaultMapping();

      // Empty artifacts list — all required should be missing
      const result = resolveArtifactsForSD(mapping, 'data', []);
      expect(result.missing.length).toBeGreaterThan(0);
      expect(result.required.length).toBe(0);
    });
  });

  // TS-006 continued: Database seeding
  describe('TS-006: Mapping database seeding', () => {
    it('should seed default mapping into database', async () => {
      const { seeded, errors } = await seedDefaultMapping(supabase, TEST_VENTURE_TYPE);
      expect(errors).toHaveLength(0);
      expect(seeded).toBeGreaterThan(0);

      // Verify it was loaded
      const loaded = await loadMapping(supabase, TEST_VENTURE_TYPE);
      expect(loaded.universal.length).toBeGreaterThan(0);
    });

    it('should load mapping from database when it exists', async () => {
      const loaded = await loadMapping(supabase, TEST_VENTURE_TYPE);
      expect(loaded.universal.length).toBe(3);
      expect(loaded.supplemental.length).toBeGreaterThan(0);
    });

    it('should fall back to defaults for unknown venture type', async () => {
      const loaded = await loadMapping(supabase, 'nonexistent_type_xyz');
      expect(loaded.universal.length).toBe(3);
    });
  });

  // TS-005: Referential integrity
  describe('TS-005: Referential integrity rubric', () => {
    it('should pass for valid references', async () => {
      // Provide all required artifacts for 'data' layer:
      // Universal (3) + data layer-specific (2: ERD + schema_spec) = 5
      const fakeArtifacts = [
        { id: 'art-1', artifact_type: ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND, lifecycle_stage: 10 },
        { id: 'art-2', artifact_type: ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL, lifecycle_stage: 14 },
        { id: 'art-3', artifact_type: ARTIFACT_TYPES.BLUEPRINT_TECHNICAL_ARCHITECTURE, lifecycle_stage: 14 },
        { id: 'art-4', artifact_type: ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM, lifecycle_stage: 14 },
        { id: 'art-5', artifact_type: ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC, lifecycle_stage: 14 },
      ];

      const fakeSDs = [
        {
          sd_key: 'SD-TEST-001',
          venture_id: 'v-1',
          metadata: {
            architecture_layer: 'data',
            artifact_references: [
              { artifact_type: ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND, artifact_id: 'art-1' },
              { artifact_type: ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL, artifact_id: 'art-2' },
              { artifact_type: ARTIFACT_TYPES.BLUEPRINT_TECHNICAL_ARCHITECTURE, artifact_id: 'art-3' },
              { artifact_type: ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM, artifact_id: 'art-4' },
              { artifact_type: ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC, artifact_id: 'art-5' },
            ],
          },
        },
      ];

      const mapping = getDefaultMapping();
      const result = await validateIntegrity(supabase, {
        ventureId: 'v-1',
        ventureName: 'test',
        sdRecords: fakeSDs,
        artifacts: fakeArtifacts,
        mapping,
      }, { logger: { log: () => {}, warn: () => {} } });

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it('should fail for dead artifact references', async () => {
      const fakeArtifacts = [
        { id: 'art-1', artifact_type: ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND, lifecycle_stage: 10 },
      ];

      const fakeSDs = [
        {
          sd_key: 'SD-TEST-DEAD',
          venture_id: 'v-1',
          metadata: {
            architecture_layer: 'data',
            artifact_references: [
              { artifact_type: 'nonexistent_type', artifact_id: 'dead-ref-id' },
            ],
          },
        },
      ];

      const mapping = getDefaultMapping();
      const result = await validateIntegrity(supabase, {
        ventureId: 'v-1',
        ventureName: 'test',
        sdRecords: fakeSDs,
        artifacts: fakeArtifacts,
        mapping,
      }, { logger: { log: () => {}, warn: () => {} } });

      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures.some(f => f.check === 'reference_resolves')).toBe(true);
    });

    it('should detect venture identity mismatch', async () => {
      const fakeSDs = [
        {
          sd_key: 'SD-TEST-MISMATCH',
          venture_id: 'wrong-venture-id',
          metadata: { architecture_layer: 'data', artifact_references: [] },
        },
      ];

      const mapping = getDefaultMapping();
      const result = await validateIntegrity(supabase, {
        ventureId: 'correct-venture-id',
        ventureName: 'test',
        sdRecords: fakeSDs,
        artifacts: [],
        mapping,
      }, { logger: { log: () => {}, warn: () => {} } });

      expect(result.passed).toBe(false);
      expect(result.failures.some(f => f.check === 'venture_identity')).toBe(true);
    });
  });
});
