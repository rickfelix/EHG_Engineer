/**
 * S17 Artifact Type Registration Tests
 * SD: SD-FIX-S17-WIRING-GAPS-ORCH-001-B
 * Ref: ARCH-S17-DESIGN-REFINEMENT-001 § Data Layer
 *
 * Validates:
 * - 4 new S17 types exported from artifact-types.js
 * - Migration file structure and content
 * - No regression on existing types
 * - Stage 17 mapping includes new types
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  ARTIFACT_TYPES,
  ARTIFACT_TYPE_BY_STAGE,
  isValidArtifactType,
  getStageForArtifactType,
} from '../../lib/eva/artifact-types.js';

const S17_NEW_TYPES = [
  'design_token_manifest',
  's17_archetypes',
  's17_session_state',
  's17_approved',
];

const S17_CONSTANTS = [
  'BLUEPRINT_DESIGN_TOKEN_MANIFEST',
  'BLUEPRINT_S17_ARCHETYPES',
  'BLUEPRINT_S17_SESSION_STATE',
  'BLUEPRINT_S17_APPROVED',
];

describe('S17 Artifact Type Registration', () => {
  describe('artifact-types.js exports', () => {
    it('exports all 4 new S17 constants', () => {
      for (const constant of S17_CONSTANTS) {
        expect(ARTIFACT_TYPES).toHaveProperty(constant);
      }
    });

    it('constants map to correct string values', () => {
      expect(ARTIFACT_TYPES.BLUEPRINT_DESIGN_TOKEN_MANIFEST).toBe('design_token_manifest');
      expect(ARTIFACT_TYPES.BLUEPRINT_S17_ARCHETYPES).toBe('s17_archetypes');
      expect(ARTIFACT_TYPES.BLUEPRINT_S17_SESSION_STATE).toBe('s17_session_state');
      expect(ARTIFACT_TYPES.BLUEPRINT_S17_APPROVED).toBe('s17_approved');
    });

    it('all 4 new types pass isValidArtifactType', () => {
      for (const type of S17_NEW_TYPES) {
        expect(isValidArtifactType(type)).toBe(true);
      }
    });

    it('all 4 new types map to stage 17', () => {
      for (const type of S17_NEW_TYPES) {
        expect(getStageForArtifactType(type)).toBe(17);
      }
    });

    it('stage 17 includes all 4 new types plus existing BLUEPRINT_REVIEW_SUMMARY', () => {
      const stage17Types = ARTIFACT_TYPE_BY_STAGE[17];
      expect(stage17Types).toContain('blueprint_review_summary');
      for (const type of S17_NEW_TYPES) {
        expect(stage17Types).toContain(type);
      }
    });
  });

  describe('no regression on existing types', () => {
    const EXISTING_TYPES = [
      'intake_venture_analysis',
      'truth_idea_brief',
      'truth_ai_critique',
      'engine_risk_matrix',
      'identity_persona_brand',
      'blueprint_product_roadmap',
      'blueprint_review_summary',
      'build_system_prompt',
      'launch_test_plan',
      'system_devils_advocate_review',
      'stitch_project',
      'stitch_curation',
      'value_multiplier_assessment',
    ];

    it('all sampled existing types still valid', () => {
      for (const type of EXISTING_TYPES) {
        expect(isValidArtifactType(type)).toBe(true);
      }
    });
  });

  describe('migration file', () => {
    const migrationPath = resolve(
      import.meta.dirname,
      '../../database/migrations/20260417_s17_artifact_types.sql'
    );
    let migrationContent;

    it('migration file exists', () => {
      migrationContent = readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toBeTruthy();
    });

    it('migration is transactional (BEGIN/COMMIT)', () => {
      migrationContent = readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toMatch(/^BEGIN;/m);
      expect(migrationContent).toMatch(/^COMMIT;/m);
    });

    it('migration drops old constraint before recreating', () => {
      migrationContent = readFileSync(migrationPath, 'utf-8');
      const dropIdx = migrationContent.indexOf('DROP CONSTRAINT venture_artifacts_artifact_type_check');
      const addIdx = migrationContent.indexOf('ADD CONSTRAINT venture_artifacts_artifact_type_check');
      expect(dropIdx).toBeGreaterThan(-1);
      expect(addIdx).toBeGreaterThan(dropIdx);
    });

    it('migration includes all 4 new S17 types', () => {
      migrationContent = readFileSync(migrationPath, 'utf-8');
      for (const type of S17_NEW_TYPES) {
        expect(migrationContent).toContain(`'${type}'::text`);
      }
    });

    it('migration preserves existing types (spot check)', () => {
      migrationContent = readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain("'intake_venture_analysis'::text");
      expect(migrationContent).toContain("'stitch_qa_report'::text");
      expect(migrationContent).toContain("'blueprint_review_summary'::text");
    });

    it('migration creates partial composite index', () => {
      migrationContent = readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('idx_venture_artifacts_s17');
      expect(migrationContent).toContain('venture_id, artifact_type');
      expect(migrationContent).toMatch(/WHERE artifact_type IN/);
    });

    it('migration includes rollback documentation', () => {
      migrationContent = readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toMatch(/ROLLBACK/i);
    });
  });

  describe('unknown types rejected', () => {
    it('isValidArtifactType rejects unknown type', () => {
      expect(isValidArtifactType('totally_fake_type')).toBe(false);
      expect(isValidArtifactType('')).toBe(false);
    });
  });
});
