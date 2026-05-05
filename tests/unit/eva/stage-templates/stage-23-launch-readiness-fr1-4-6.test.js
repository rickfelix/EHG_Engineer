/**
 * SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 FR-7
 *
 * Unit coverage for the Stage 23 launch readiness kill-gate redesign:
 *   FR-1: canonical artifact_type emission (stage-23.js TEMPLATE.analysisStep)
 *   FR-2: orphan-disposition smoke check (canonical module loads + index dispatch)
 *   FR-3: ADVISORY mode for analytics/monitoring/legal
 *   FR-4: canonical-upstream preflight + SKIP fallback + stage_skipped event
 *   FR-6: backfill migration file is shaped correctly (idempotent guard, audit metadata)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import TEMPLATE_23 from '../../../../lib/eva/stage-templates/stage-23.js';
import {
  analyzeStage23LaunchReadiness,
  CATEGORIES,
  REQUIRED_CATEGORIES,
  ADVISORY_CATEGORIES,
  UPSTREAM_REQUIREMENTS,
} from '../../../../lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js';
import { getAnalysisStep } from '../../../../lib/eva/stage-templates/analysis-steps/index.js';
import { ARTIFACT_TYPES } from '../../../../lib/eva/artifact-types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../../');

// Fixture: supabase mock that satisfies the preflight + emit contract used by
// FR-4. `presentTypes` is the set of artifact_types the venture currently has
// at is_current=true; an empty set triggers SKIPPED.
function buildMockSupabase({ presentTypes = [], emitSpy } = {}) {
  return {
    from(table) {
      if (table === 'venture_artifacts') {
        return {
          select() {
            return {
              eq() { return this; },
              in() {
                return Promise.resolve({
                  data: presentTypes.map(t => ({
                    lifecycle_stage: 23,
                    artifact_type: t,
                    is_current: true,
                  })),
                  error: null,
                });
              },
            };
          },
        };
      }
      if (table === 'eva_orchestration_events') {
        return {
          insert(row) {
            emitSpy?.(row);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const upstreamHappyPath = {
  stage20Data: { verdict: 'PASS' },
  stage21Data: { total_assets: 5 },
  stage22Data: { active_channels: 3 },
};

const allUpstreamArtifacts = [
  'code_quality_report',
  'visual_device_screenshots',
  'distribution_channel_config',
];

const silentLogger = { info: () => {}, warn: () => {}, log: () => {}, error: () => {} };

describe('SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 FR-1..FR-4, FR-6', () => {
  describe('FR-1: canonical artifact_type emission', () => {
    it('TEMPLATE.analysisStep wraps analyzer output in typed-array contract with launch_readiness_checklist', async () => {
      const supabase = buildMockSupabase({ presentTypes: allUpstreamArtifacts });
      const result = await TEMPLATE_23.analysisStep({
        ...upstreamHappyPath,
        ventureId: '00000000-0000-0000-0000-000000000001',
        ventureName: 'fixture',
        supabase,
        logger: silentLogger,
      });
      expect(Array.isArray(result.artifacts)).toBe(true);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].artifactType).toBe('launch_readiness_checklist');
      expect(result.artifacts[0].artifactType).toBe(ARTIFACT_TYPES.LAUNCH_READINESS_CHECKLIST);
      expect(result.artifacts[0].metadata?.sd_origin).toBe('SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001');
    });

    it('top-level analyzer fields (checklist, verdict) are preserved alongside artifacts for back-compat', async () => {
      const supabase = buildMockSupabase({ presentTypes: allUpstreamArtifacts });
      const result = await TEMPLATE_23.analysisStep({
        ...upstreamHappyPath,
        ventureId: '00000000-0000-0000-0000-000000000002',
        supabase,
        logger: silentLogger,
      });
      expect(Array.isArray(result.checklist)).toBe(true);
      expect(['READY', 'HOLD', 'NOT_READY', 'SKIPPED']).toContain(result.verdict);
      expect(result.total_categories).toBe(CATEGORIES.length);
    });

    it('artifact-types registry has both canonical name and deprecated legacy alias', () => {
      expect(ARTIFACT_TYPES.LAUNCH_READINESS_CHECKLIST).toBe('launch_readiness_checklist');
      expect(ARTIFACT_TYPES.LAUNCH_MARKETING_CHECKLIST).toBe('launch_marketing_checklist');
    });
  });

  describe('FR-2: orphan-disposition smoke', () => {
    it('canonical analyzer is exported and named', () => {
      expect(typeof analyzeStage23LaunchReadiness).toBe('function');
      expect(analyzeStage23LaunchReadiness.name).toBe('analyzeStage23LaunchReadiness');
    });

    it('getAnalysisStep(23) routes to the canonical launch-readiness analyzer (not archived release-readiness)', async () => {
      const fn = await getAnalysisStep(23);
      expect(typeof fn).toBe('function');
      expect(fn.name).toBe('analyzeStage23LaunchReadiness');
    });

    it('TEMPLATE_23 wires the canonical analyzer at template level', () => {
      expect(typeof TEMPLATE_23.analysisStep).toBe('function');
      expect(TEMPLATE_23.id).toBe('stage-23');
      expect(TEMPLATE_23.slug).toBe('launch-readiness');
    });
  });

  describe('FR-3: ADVISORY mode', () => {
    it('analytics, monitoring, legal are advisory; code_quality, marketing_assets, distribution_channels are required', () => {
      expect(REQUIRED_CATEGORIES).toEqual(['code_quality', 'marketing_assets', 'distribution_channels']);
      expect(ADVISORY_CATEGORIES).toEqual(['analytics', 'monitoring', 'legal']);
    });

    it('ADVISORY entries default to status=advisory in checklist (no producer needed)', async () => {
      const supabase = buildMockSupabase({ presentTypes: allUpstreamArtifacts });
      const result = await analyzeStage23LaunchReadiness({
        ...upstreamHappyPath,
        ventureId: '00000000-0000-0000-0000-000000000003',
        supabase,
        logger: silentLogger,
      });
      const advisoryEntries = result.checklist.filter(c => c.mode === 'ADVISORY');
      expect(advisoryEntries).toHaveLength(3);
      for (const entry of advisoryEntries) {
        expect(entry.status).toBe('advisory');
      }
    });

    it('verdict=READY when all REQUIRED categories pass, even with ADVISORY entries unsatisfied', async () => {
      const supabase = buildMockSupabase({ presentTypes: allUpstreamArtifacts });
      const result = await analyzeStage23LaunchReadiness({
        stage20Data: { verdict: 'PASS' },
        stage21Data: { total_assets: 12 },
        stage22Data: { active_channels: 4 },
        ventureId: '00000000-0000-0000-0000-000000000004',
        supabase,
        logger: silentLogger,
      });
      expect(result.verdict).toBe('READY');
      expect(result.advisory_count).toBe(3);
    });

    it('verdict=HOLD when any REQUIRED category fails (advisory ignored)', async () => {
      const supabase = buildMockSupabase({ presentTypes: allUpstreamArtifacts });
      const result = await analyzeStage23LaunchReadiness({
        stage20Data: { verdict: 'FAIL', summary: { by_severity: { critical: 2 } } },
        stage21Data: { total_assets: 5 },
        stage22Data: { active_channels: 3 },
        ventureId: '00000000-0000-0000-0000-000000000005',
        supabase,
        logger: silentLogger,
      });
      expect(result.verdict).toBe('HOLD');
      expect(result.fail_count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('FR-4: canonical-upstream preflight + SKIP fallback', () => {
    it('returns SKIPPED verdict when no canonical upstream artifacts present', async () => {
      const supabase = buildMockSupabase({ presentTypes: [] });
      const result = await analyzeStage23LaunchReadiness({
        ...upstreamHappyPath,
        ventureId: '00000000-0000-0000-0000-000000000006',
        supabase,
        logger: silentLogger,
      });
      expect(result.verdict).toBe('SKIPPED');
      expect(result.skip_reason).toBe('upstream_missing');
      expect(Array.isArray(result.missing_upstream)).toBe(true);
      expect(result.missing_upstream.length).toBe(3);
    });

    it('emits stage_skipped event with correct event_type=custom + subtype payload', async () => {
      const emitSpy = vi.fn();
      const supabase = buildMockSupabase({ presentTypes: [], emitSpy });
      await analyzeStage23LaunchReadiness({
        ...upstreamHappyPath,
        ventureId: '00000000-0000-0000-0000-000000000007',
        supabase,
        logger: silentLogger,
      });
      expect(emitSpy).toHaveBeenCalledTimes(1);
      const row = emitSpy.mock.calls[0][0];
      expect(row.event_type).toBe('custom');
      expect(row.event_data.subtype).toBe('stage_skipped');
      expect(row.event_data.reason).toBe('upstream_missing');
      expect(row.event_data.stage_number).toBe(23);
      expect(row.event_data.sd_origin).toBe('SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001');
    });

    it('does NOT skip when at least one upstream-required type is present per stage', async () => {
      const supabase = buildMockSupabase({
        presentTypes: ['code_quality_report', 'visual_social_graphics', 'distribution_ad_copy'],
      });
      const result = await analyzeStage23LaunchReadiness({
        ...upstreamHappyPath,
        ventureId: '00000000-0000-0000-0000-000000000008',
        supabase,
        logger: silentLogger,
      });
      expect(result.verdict).not.toBe('SKIPPED');
    });

    it('UPSTREAM_REQUIREMENTS lists 3 entries (S20, S21, S22) with anyOf alternatives', () => {
      expect(UPSTREAM_REQUIREMENTS).toHaveLength(3);
      const stages = UPSTREAM_REQUIREMENTS.map(r => r.stage).sort();
      expect(stages).toEqual([20, 21, 22]);
      for (const req of UPSTREAM_REQUIREMENTS) {
        expect(Array.isArray(req.anyOf)).toBe(true);
        expect(req.anyOf.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('FR-6: backfill migration', () => {
    it('migration file exists with idempotency guard + audit metadata + invariant assertion', () => {
      const sqlPath = resolve(REPO_ROOT, 'database/migrations/20260505_120000_backfill_launch_readiness_checklist_artifact_type.sql');
      const sql = readFileSync(sqlPath, 'utf8');

      // Idempotency: WHERE clause filters to legacy rows on stage 23
      expect(sql).toMatch(/WHERE\s+lifecycle_stage\s*=\s*23\s+AND\s+artifact_type\s*=\s*'launch_marketing_checklist'/i);

      // Backfill target: canonical name
      expect(sql).toMatch(/SET\s+artifact_type\s*=\s*'launch_readiness_checklist'/i);

      // Audit metadata: legacy_artifact_type + backfilled_by_sd
      expect(sql).toMatch(/'legacy_artifact_type'\s*,\s*'launch_marketing_checklist'/);
      expect(sql).toMatch(/'backfilled_by_sd'\s*,\s*'SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001'/);

      // Invariant: post-migration legacy rows must be 0 (RAISE EXCEPTION on violation)
      expect(sql).toMatch(/RAISE\s+EXCEPTION/i);

      // Transaction-wrapped
      expect(sql).toMatch(/^BEGIN;/m);
      expect(sql).toMatch(/COMMIT;\s*$/);
    });
  });
});
