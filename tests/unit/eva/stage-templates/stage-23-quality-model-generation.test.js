/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-B, TS-4: characterization that generating
 * REQUIRED_CATEGORIES/ADVISORY_CATEGORIES/GROWTH_CATEGORIES from the Venture Quality
 * Model v1 registry (instead of the prior hand-authored literals) changes NOTHING
 * observable, across the flag matrix TESTING sub-agent's PLAN-TO-EXEC review named:
 * LEO_S21_GROWTH_PLAYBOOK_REQUIRED x LEO_S24_CAPABILITY_CHECKLIST_REQUIRED, each on/off.
 *
 * This is a NARROWER guarantee than a from-scratch checklist-logic characterization:
 * registry.test.js already proves STAGE23_REQUIRED/ADVISORY/GROWTH_CATEGORY_IDS are
 * byte-identical, in order, to the prior literals -- the generation swap changed only
 * WHERE the arrays' values come from, not the values themselves or the assembly logic
 * that consumes them (that logic -- flag reads, category-mode assignment, verdict
 * computation -- is untouched by this SD). Every pre-existing stage-23 test (47 across
 * 5 files, unmodified) still passing IS the characterization; this file additionally
 * proves the checklist builds without error under all 4 flag combinations, closing the
 * one gap those pre-existing tests don't specifically enumerate (the flag-ON paths for
 * GROWTH_CATEGORIES / CAPABILITY_CATEGORIES together).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { analyzeStage23LaunchReadiness } from '../../../../lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js';
import { STAGE23_REQUIRED_CATEGORY_IDS, STAGE23_ADVISORY_CATEGORY_IDS } from '../../../../lib/eva/quality-model/registry.js';

const silentLogger = { info: () => {}, warn: () => {}, log: () => {}, error: () => {} };

function buildMockSupabase({ growthArtifactPresent = false } = {}) {
  return {
    from(table) {
      if (table === 'venture_artifacts') {
        return {
          select() {
            return {
              eq() { return this; },
              in() {
                return {
                  limit() {
                    const rows = [
                      { lifecycle_stage: 23, artifact_type: 'code_quality_report', is_current: true, artifact_data: { verdict: 'PASS' } },
                      { lifecycle_stage: 23, artifact_type: 'visual_device_screenshots', is_current: true, artifact_data: { total_screenshots: 3 } },
                      { lifecycle_stage: 23, artifact_type: 'distribution_channel_config', is_current: true, artifact_data: { deployed: true, status: 'deployed' } },
                    ];
                    if (growthArtifactPresent) {
                      rows.push({ lifecycle_stage: 21, artifact_type: 'growth_playbook', is_current: true, artifact_data: { present: true } });
                    }
                    return Promise.resolve({ data: rows, error: null });
                  },
                };
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
                  data: [
                    { generated_at: '2026-07-13T00:00:00Z', legal_templates: { template_type: 'terms_of_service' } },
                    { generated_at: '2026-07-13T00:00:00Z', legal_templates: { template_type: 'privacy_policy' } },
                  ],
                  error: null,
                });
              },
            };
          },
        };
      }
      if (table === 'leo_feature_flags') {
        return { select() { return { eq() { return { maybeSingle: async () => ({ data: null, error: null }) }; } }; } };
      }
      if (table === 'eva_orchestration_events') {
        return { insert() { return Promise.resolve({ data: null, error: null }); } };
      }
      if (table === 'venture_capability_overrides') {
        return { select() { return { eq() { return Promise.resolve({ data: [], error: null }); } }; } };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const FLAG_ENV_KEYS = ['LEO_S21_GROWTH_PLAYBOOK_REQUIRED', 'LEO_S24_CAPABILITY_CHECKLIST_REQUIRED'];
const savedEnv = {};

beforeEach(() => {
  for (const k of FLAG_ENV_KEYS) savedEnv[k] = process.env[k];
});
afterEach(() => {
  for (const k of FLAG_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('TS-4: generated checklist arrays build without error across the full flag matrix', () => {
  for (const growthFlag of [false, true]) {
    for (const capabilityFlag of [false, true]) {
      it(`growth=${growthFlag}, capability=${capabilityFlag}`, async () => {
        process.env.LEO_S21_GROWTH_PLAYBOOK_REQUIRED = String(growthFlag);
        process.env.LEO_S24_CAPABILITY_CHECKLIST_REQUIRED = String(capabilityFlag);
        const supabase = buildMockSupabase({ growthArtifactPresent: growthFlag });
        const result = await analyzeStage23LaunchReadiness({ ventureId: 'v-ts4', ventureName: 'TS4Fixture', supabase, logger: silentLogger });
        expect(result).toBeTruthy();
        expect(Array.isArray(result.checklist)).toBe(true);
        // Every REQUIRED category from the generated registry array appears in the checklist.
        const checklistCategories = new Set(result.checklist.map((c) => c.category));
        for (const id of STAGE23_REQUIRED_CATEGORY_IDS) {
          expect(checklistCategories.has(id), `missing REQUIRED category '${id}' in checklist`).toBe(true);
        }
        for (const id of STAGE23_ADVISORY_CATEGORY_IDS) {
          expect(checklistCategories.has(id), `missing ADVISORY category '${id}' in checklist`).toBe(true);
        }
      });
    }
  }
});
