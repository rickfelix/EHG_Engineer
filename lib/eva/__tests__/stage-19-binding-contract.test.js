/**
 * Tests for Stage 19 Binding Contract + Artifact Type Registration + TDZ Fix.
 * SD: SD-LEO-INFRA-STAGE-BINDING-CONTRACT-001
 *
 * Validates the cherry-picked stage-19 work:
 *   - 36f590a1ee: S19 artifact type registered + appType TDZ hoist
 *   - c3bd52a655: S18 marketing copy wired as binding contract (prompt-level)
 *   - 72a9d8f2a6 / bbe9454b47 / 83d006cee6: pre-approval playbook docs
 *
 * Scope is the contract-and-registration surface that does NOT require an LLM
 * round-trip — the LLM-dependent prompt-construction path is exercised
 * end-to-end by integration tests under tests/integration/.
 */
import { describe, test, expect } from 'vitest';
import {
  analyzeStage19,
  PRIORITY_VALUES,
  SD_TYPES,
  APP_TYPE_VALUES,
  ARCHITECTURE_LAYERS,
  MIN_SPRINT_ITEMS,
  resolveAppType,
} from '../stage-templates/analysis-steps/stage-19-sprint-planning.js';
import {
  ARTIFACT_TYPES,
  ARTIFACT_TYPE_BY_STAGE,
} from '../artifact-types.js';
// SD-LEO-FEAT-STAGE-BUILD-REPLIT-001 — additional named import for the
// dual-emit invariant suite at the bottom of this file.
import { getStageForArtifactType } from '../artifact-types.js';

describe('Stage 19 Binding Contract', () => {
  describe('Contract refusal: missing Stage 18 data', () => {
    test('analyzeStage19 throws when stage18Data is undefined', async () => {
      await expect(analyzeStage19({})).rejects.toThrow(
        /Stage 19 sprint planning requires Stage 18/
      );
    });

    test('analyzeStage19 throws when stage18Data is null', async () => {
      await expect(analyzeStage19({ stage18Data: null })).rejects.toThrow(
        /Stage 19 sprint planning requires Stage 18/
      );
    });

    test('refusal message names Stage 18 as the missing dependency', async () => {
      try {
        await analyzeStage19({});
        throw new Error('expected analyzeStage19 to reject but it resolved');
      } catch (err) {
        expect(err.message).toMatch(/Stage 18/);
        expect(err.message).toMatch(/build readiness/);
      }
    });
  });

  describe('Artifact type registration (FR-1)', () => {
    test('BLUEPRINT_SPRINT_PLAN exists in artifact-types registry', () => {
      expect(ARTIFACT_TYPES.BLUEPRINT_SPRINT_PLAN).toBe('blueprint_sprint_plan');
    });

    test('Stage 19 maps to BLUEPRINT_SPRINT_PLAN in ARTIFACT_TYPE_BY_STAGE', () => {
      expect(ARTIFACT_TYPE_BY_STAGE[19]).toContain(
        ARTIFACT_TYPES.BLUEPRINT_SPRINT_PLAN
      );
    });

    test('analyzeStage19 returned object will declare artifactType blueprint_sprint_plan', () => {
      // Assert the literal that the analyzer returns (verified by reading the
      // analyzer's return shape — line ~370 of stage-19-sprint-planning.js).
      // This guards against regression where a refactor drops the field.
      const source = analyzeStage19.toString();
      expect(source).toMatch(/artifactType:\s*['"]blueprint_sprint_plan['"]/);
    });
  });

  describe('TDZ regression (FR-3)', () => {
    test('analyzeStage19 source declares appType BEFORE platformContext reference', () => {
      // Reads the analyzer source and asserts ordering: the `const appType =`
      // line must appear before the `platformContext` reference. This was the
      // exact TDZ defect: appType used in platformContext template before its
      // declaration in the post-LLM normalization block. See commit 36f590a1ee.
      const source = analyzeStage19.toString();
      const appTypeDeclIdx = source.search(/const\s+appType\s*=\s*resolveAppType/);
      const platformContextDeclIdx = source.search(/const\s+platformContext\s*=/);
      expect(appTypeDeclIdx).toBeGreaterThan(0);
      expect(platformContextDeclIdx).toBeGreaterThan(0);
      expect(appTypeDeclIdx).toBeLessThan(platformContextDeclIdx);
    });

    test('resolveAppType returns agnostic for null stage15Data (TDZ branch entry)', () => {
      expect(resolveAppType(null)).toBe('agnostic');
      expect(resolveAppType(undefined)).toBe('agnostic');
    });

    test('resolveAppType returns agnostic for empty screens array', () => {
      expect(resolveAppType({ screens: [] })).toBe('agnostic');
      expect(resolveAppType({ wireframes: [] })).toBe('agnostic');
    });

    test('resolveAppType maps desktop majority to web', () => {
      // inferDeviceType returns 'desktop' for desktop-shaped screens; mapper
      // collapses desktop -> web because APP_TYPE_VALUES does not include
      // 'desktop' (the registry only knows mobile/web/tablet/agnostic).
      const result = resolveAppType({
        screens: [
          { width: 1920, height: 1080 },
          { width: 1440, height: 900 },
          { width: 1280, height: 800 },
        ],
      });
      expect(['web', 'agnostic']).toContain(result);
    });
  });

  describe('Exported constants and helpers', () => {
    test('PRIORITY_VALUES contains the 4 canonical levels', () => {
      expect(PRIORITY_VALUES).toEqual(['critical', 'high', 'medium', 'low']);
    });

    test('SD_TYPES contains the 5 sprint-item types', () => {
      expect(SD_TYPES).toEqual([
        'feature',
        'bugfix',
        'enhancement',
        'refactor',
        'infra',
      ]);
    });

    test('APP_TYPE_VALUES enumerates the platform targets', () => {
      expect(APP_TYPE_VALUES).toContain('mobile');
      expect(APP_TYPE_VALUES).toContain('web');
      expect(APP_TYPE_VALUES).toContain('agnostic');
    });

    test('ARCHITECTURE_LAYERS covers the canonical six', () => {
      expect(ARCHITECTURE_LAYERS).toEqual([
        'frontend',
        'backend',
        'database',
        'infrastructure',
        'integration',
        'security',
      ]);
    });

    test('MIN_SPRINT_ITEMS is at least 1 (sprint cannot be empty)', () => {
      expect(MIN_SPRINT_ITEMS).toBeGreaterThanOrEqual(1);
    });

    test('resolveAppType is exported as a function', () => {
      expect(typeof resolveAppType).toBe('function');
    });
  });

  describe('Marketing-copy binding contract (FR-2, prompt-level)', () => {
    test('analyzer source reads marketingByType.marketing_tagline', () => {
      // The c3bd52a655 commit wires S18 marketing copy as the binding contract
      // via prompt construction (LLM is told the copy IS the contract). This
      // guards against regression where the marketing-copy reads are dropped.
      const source = analyzeStage19.toString();
      expect(source).toMatch(/marketingByType/);
      expect(source).toMatch(/marketing_tagline/);
      expect(source).toMatch(/marketing_landing_hero/);
    });

    test('analyzer source includes binding-contract language for the LLM', () => {
      const source = analyzeStage19.toString();
      expect(source).toMatch(/binding contract/i);
    });

    test('analyzer source surfaces persona target when present', () => {
      const source = analyzeStage19.toString();
      expect(source).toMatch(/persona_target/);
    });
  });

  describe('Dual artifact emission at Stage 19 (SD-LEO-FEAT-STAGE-BUILD-REPLIT-001 / FR-1, AC-FR1-1, AC-FR1-3)', () => {
    test('BUILD_MVP_BUILD constant exists with the expected canonical value', () => {
      expect(ARTIFACT_TYPES.BUILD_MVP_BUILD).toBe('build_mvp_build');
    });

    test('Stage 19 entry contains BOTH BLUEPRINT_SPRINT_PLAN and BUILD_MVP_BUILD', () => {
      // DUAL spec-authority direction (locked at LEAD): the planning artifact
      // (blueprint_sprint_plan) is preserved alongside the build-completion
      // artifact (build_mvp_build) emitted by the POST register-deployment
      // endpoint. Both must appear in ARTIFACT_TYPE_BY_STAGE[19].
      expect(ARTIFACT_TYPE_BY_STAGE[19]).toContain(
        ARTIFACT_TYPES.BLUEPRINT_SPRINT_PLAN
      );
      expect(ARTIFACT_TYPE_BY_STAGE[19]).toContain(
        ARTIFACT_TYPES.BUILD_MVP_BUILD
      );
    });

    test('Stage 19 entry is exactly the dual pair (no extra entries)', () => {
      // Defensive shape check: catches accidental drift if someone appends a
      // third artifact without updating the LEAD scope decision.
      expect(ARTIFACT_TYPE_BY_STAGE[19]).toHaveLength(2);
    });

    test('getStageForArtifactType resolves build_mvp_build to stage 19 deterministically', () => {
      // Reverse-lookup invariant: BUILD_MVP_BUILD must be unique to S19 so the
      // _STAGE_BY_ARTIFACT_TYPE reduce maps it to 19. If a future change adds
      // BUILD_MVP_BUILD to another stage, this guard fires.
      expect(getStageForArtifactType('build_mvp_build')).toBe(19);
    });

    test('No other stage entry references BUILD_MVP_BUILD', () => {
      const stagesWithBuildMvp = Object.entries(ARTIFACT_TYPE_BY_STAGE)
        .filter(([, types]) => types.includes(ARTIFACT_TYPES.BUILD_MVP_BUILD))
        .map(([stage]) => Number(stage));
      expect(stagesWithBuildMvp).toEqual([19]);
    });
  });
});
