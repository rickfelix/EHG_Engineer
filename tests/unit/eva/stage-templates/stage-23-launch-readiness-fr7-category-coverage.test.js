/**
 * SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 FR-7 AC#3.
 *
 * Explicit per-category coverage over fixture artifact data: each of
 * code_quality/marketing_assets/distribution_channels/legal gets its own passing
 * and realistic-failing checklist-entry assertion (not just an overall verdict),
 * closing the acceptance criterion literally.
 */
import { describe, it, expect } from 'vitest';
import { analyzeStage23LaunchReadiness } from '../../../../lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js';

const silentLogger = { info: () => {}, warn: () => {}, log: () => {}, error: () => {} };

function buildMockSupabase({ artifactData = {}, legalDocsPresent = false } = {}) {
  const presentTypes = Object.keys(artifactData);
  return {
    from(table) {
      if (table === 'venture_artifacts') {
        return {
          select() {
            return {
              eq() { return this; },
              in() {
                return Promise.resolve({
                  data: presentTypes.map((t) => ({ lifecycle_stage: 23, artifact_type: t, is_current: true, artifact_data: artifactData[t] })),
                  error: null,
                });
              },
            };
          },
        };
      }
      if (table === 'venture_legal_overrides') {
        return {
          select() {
            return {
              eq() { return this; },
              not() {
                return Promise.resolve({
                  data: legalDocsPresent
                    ? [
                      { generated_at: '2026-07-13T00:00:00Z', legal_templates: { template_type: 'terms_of_service' } },
                      { generated_at: '2026-07-13T00:00:00Z', legal_templates: { template_type: 'privacy_policy' } },
                    ]
                    : [],
                  error: null,
                });
              },
            };
          },
        };
      }
      if (table === 'eva_orchestration_events') {
        return { insert() { return Promise.resolve({ data: null, error: null }); } };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const ALL_PASSING = {
  code_quality_report: { verdict: 'PASS' },
  visual_device_screenshots: { total_screenshots: 3 },
  visual_social_graphics: { total_socials: 5 },
  distribution_channel_config: { deployed: true, status: 'deployed' },
};

async function checklistFor(overrides) {
  const supabase = buildMockSupabase({
    artifactData: { ...ALL_PASSING, ...overrides.artifactData },
    legalDocsPresent: overrides.legalDocsPresent ?? true,
  });
  const result = await analyzeStage23LaunchReadiness({ ventureId: 'v-fr7', ventureName: 'FR7Fixture', supabase, logger: silentLogger });
  return result.checklist;
}

describe('FR-7 AC#3: per-category pass/fail fixture coverage', () => {
  describe('code_quality', () => {
    it('passes when code_quality_report.verdict is PASS', async () => {
      const checklist = await checklistFor({ artifactData: { code_quality_report: { verdict: 'PASS' } } });
      const entry = checklist.find((c) => c.category === 'code_quality');
      expect(entry.status).toBe('pass');
    });

    it('fails when code_quality_report.verdict is FAIL (realistic: critical lint issues)', async () => {
      const checklist = await checklistFor({
        artifactData: { code_quality_report: { verdict: 'FAIL', summary: { by_severity: { critical: 3 } } } },
      });
      const entry = checklist.find((c) => c.category === 'code_quality');
      expect(entry.status).toBe('fail');
      expect(entry.detail).toMatch(/3 critical issues/);
    });
  });

  describe('marketing_assets', () => {
    it('passes when screenshots + socials sum > 0', async () => {
      const checklist = await checklistFor({
        artifactData: { visual_device_screenshots: { total_screenshots: 2 }, visual_social_graphics: { total_socials: 0 } },
      });
      const entry = checklist.find((c) => c.category === 'marketing_assets');
      expect(entry.status).toBe('pass');
      expect(entry.detail).toMatch(/2 assets generated/);
    });

    it('stays pending when no visual assets exist yet (realistic: pre-Stage-22 venture)', async () => {
      const checklist = await checklistFor({
        artifactData: { visual_device_screenshots: { total_screenshots: 0 }, visual_social_graphics: { total_socials: 0 } },
      });
      const entry = checklist.find((c) => c.category === 'marketing_assets');
      expect(entry.status).toBe('pending');
    });
  });

  describe('distribution_channels', () => {
    it('passes when distribution_channel_config.deployed is true', async () => {
      const checklist = await checklistFor({ artifactData: { distribution_channel_config: { deployed: true, status: 'deployed' } } });
      const entry = checklist.find((c) => c.category === 'distribution_channels');
      expect(entry.status).toBe('pass');
    });

    it('stays pending when status is deploy_ready_not_deployed (realistic: AltifyAI live state)', async () => {
      const checklist = await checklistFor({
        artifactData: { distribution_channel_config: { deployed: false, status: 'deploy_ready_not_deployed' } },
      });
      const entry = checklist.find((c) => c.category === 'distribution_channels');
      expect(entry.status).toBe('pending');
      expect(entry.detail).toMatch(/deploy_ready_not_deployed/);
    });
  });

  describe('legal', () => {
    it('passes when both required legal documents are generated', async () => {
      const checklist = await checklistFor({ legalDocsPresent: true });
      const entry = checklist.find((c) => c.category === 'legal');
      expect(entry.status).toBe('pass');
    });

    it('fails when legal documents have not been generated (realistic: pre-FR-2-wiring venture)', async () => {
      const checklist = await checklistFor({ legalDocsPresent: false });
      const entry = checklist.find((c) => c.category === 'legal');
      expect(entry.status).toBe('fail');
      expect(entry.detail).toMatch(/terms_of_service, privacy_policy/);
    });
  });
});
