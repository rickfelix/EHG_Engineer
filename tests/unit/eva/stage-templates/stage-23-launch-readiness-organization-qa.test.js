/**
 * SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001.
 *
 * The 'organization_qa' checklist category, gated behind LEO_S24_ORGANIZATION_QA_REQUIRED
 * (default OFF -- same rollout-safety contract as CAPABILITY_CATEGORIES). Covers TS-3
 * (clean org passes), TS-4 (failing org blocks the checklist), TS-5 (absent artifact never
 * silently passes).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  analyzeStage23LaunchReadiness,
  ORGANIZATION_QA_CATEGORIES,
  ORGANIZATION_QA_FLAG_KEY,
} from '../../../../lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js';
import { ARTIFACT_TYPES } from '../../../../lib/eva/artifact-types.js';

const silentLogger = { info: () => {}, warn: () => {}, log: () => {}, error: () => {} };

const passingArtifactData = {
  code_quality_report: { verdict: 'PASS' },
  visual_device_screenshots: { total_screenshots: 5 },
  distribution_channel_config: { deployed: true, status: 'deployed' },
};
const allUpstreamArtifacts = ['code_quality_report', 'visual_device_screenshots', 'distribution_channel_config'];

function makeQuery(result) {
  const q = {};
  for (const m of ['select', 'eq', 'in', 'not', 'update', 'insert', 'order', 'limit', 'maybeSingle', 'single']) {
    q[m] = vi.fn(() => q);
  }
  q.then = (resolve) => resolve(result);
  return q;
}

/** @param {{flagEnabled?: boolean, organizationQaResult?: object|null}} opts */
function buildMockSupabase({ flagEnabled = false, organizationQaResult = null } = {}) {
  return {
    rpc: vi.fn(() => Promise.resolve({ data: [{ event_count: 0 }], error: null })),
    from: vi.fn((table) => {
      if (table === 'leo_feature_flags') {
        const q = {};
        let requestedKey = null;
        for (const m of ['select', 'in', 'not', 'update', 'insert', 'order', 'limit', 'maybeSingle', 'single']) {
          q[m] = vi.fn(() => q);
        }
        q.eq = vi.fn((col, value) => { if (col === 'flag_key') requestedKey = value; return q; });
        q.then = (resolve) => resolve({ data: { is_enabled: requestedKey === ORGANIZATION_QA_FLAG_KEY ? flagEnabled : false }, error: null });
        return q;
      }
      if (table === 'venture_artifacts') {
        // 2 distinct query shapes hit this branch: preflightUpstream()'s bulk
        // .in('artifact_type', [...]) probe (array result), and
        // checkOrganizationQaResult()'s single .eq('artifact_type', ORGANIZATION_QA_RESULT)
        // .maybeSingle() lookup (single-row-or-null result, the 'legal' precedent pattern).
        // Distinguished by tracking which column/value .eq('artifact_type', ...) was called
        // with -- mirrors the leo_feature_flags branch's flag_key capture above.
        const q = {};
        let requestedArtifactType = null;
        for (const m of ['select', 'in', 'not', 'update', 'insert', 'order', 'limit']) {
          q[m] = vi.fn(() => q);
        }
        q.eq = vi.fn((col, value) => { if (col === 'artifact_type') requestedArtifactType = value; return q; });
        q.maybeSingle = vi.fn(async () => {
          if (requestedArtifactType === ARTIFACT_TYPES.ORGANIZATION_QA_RESULT) {
            return {
              data: organizationQaResult ? { artifact_data: organizationQaResult } : null,
              error: null,
            };
          }
          return { data: null, error: null };
        });
        q.then = (resolve) => resolve({
          data: allUpstreamArtifacts.map((t) => ({ lifecycle_stage: 23, artifact_type: t, is_current: true, artifact_data: passingArtifactData[t] })),
          error: null,
        });
        return q;
      }
      if (table === 'venture_legal_overrides') {
        return makeQuery({
          data: [
            { generated_at: '2026-07-13T00:00:00Z', legal_templates: { template_type: 'terms_of_service' } },
            { generated_at: '2026-07-13T00:00:00Z', legal_templates: { template_type: 'privacy_policy' } },
          ],
          error: null,
        });
      }
      if (table === 'eva_orchestration_events') {
        return { insert: () => Promise.resolve({ data: null, error: null }) };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe('organization_qa checklist category -- flag OFF (default)', () => {
  it('does not add organization_qa to the checklist, verdict unaffected', async () => {
    const supabase = buildMockSupabase({ flagEnabled: false });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'v1', ventureName: 'Test', supabase, logger: silentLogger });
    expect(result.checklist.some((c) => c.category === 'organization_qa')).toBe(false);
    expect(result.verdict).toBe('READY');
  });
});

describe('organization_qa checklist category -- flag ON', () => {
  it('TS-3: a clean organization QA/QC result scores pass', async () => {
    const supabase = buildMockSupabase({
      flagEnabled: true,
      organizationQaResult: { ok: true, created: true, suite_result: { pass_rate: 1, catch_rate: null, findings: [] } },
    });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'v1', ventureName: 'Test', supabase, logger: silentLogger });
    const entry = result.checklist.find((c) => c.category === 'organization_qa');
    expect(entry.status).toBe('pass');
    expect(entry.mode).toBe('REQUIRED');
    expect(result.verdict).toBe('READY');
  });

  it('TS-4: a defective organization (seeded failing check) scores fail and blocks the checklist', async () => {
    const supabase = buildMockSupabase({
      flagEnabled: true,
      organizationQaResult: { ok: true, created: true, suite_result: { pass_rate: 0.5, catch_rate: null, findings: [{ check_id: 'fm-1-1', passed: false, reason: 'seeded MAST defect' }] } },
    });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'v1', ventureName: 'Test', supabase, logger: silentLogger });
    const entry = result.checklist.find((c) => c.category === 'organization_qa');
    expect(entry.status).toBe('fail');
    expect(result.verdict).not.toBe('READY');
  });

  it('TS-5: a venture with NO organization_qa_result artifact never silently passes', async () => {
    const supabase = buildMockSupabase({ flagEnabled: true, organizationQaResult: null });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'v1', ventureName: 'Test', supabase, logger: silentLogger });
    const entry = result.checklist.find((c) => c.category === 'organization_qa');
    expect(entry.status).not.toBe('pass');
    expect(result.verdict).not.toBe('READY');
  });

  it('a failed organization creation/QA-QC (ok:false) scores fail, not pass', async () => {
    const supabase = buildMockSupabase({
      flagEnabled: true,
      organizationQaResult: { ok: false, created: false, reason: 'threw', error: 'venture factory exploded' },
    });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'v1', ventureName: 'Test', supabase, logger: silentLogger });
    const entry = result.checklist.find((c) => c.category === 'organization_qa');
    expect(entry.status).toBe('fail');
  });
});
