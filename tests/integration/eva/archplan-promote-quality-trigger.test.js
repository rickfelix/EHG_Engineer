/**
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 (FR-5, TS-7/TS-8) — NON-MOCKED integration test.
 *
 * Proves promoteArchPlan's success path AND the quality-gate rejection path against the
 * REAL, live trg_enforce_archplan_quality_advancement trigger -- a mocked-Supabase unit test
 * (see lib/eva/__tests__/archplan-promote.test.js) can only assert that promoteArchPlan
 * surfaces whatever error the DB layer returns; it cannot prove the trigger itself actually
 * fires and blocks the write. This test does that: it seeds a real draft row with
 * quality_checked=false and proves the UPDATE is genuinely rejected by Postgres, then seeds
 * a real draft row with quality_checked=true and proves the promotion genuinely succeeds.
 *
 * GATING (EXEC-phase TESTING review finding B4): the db-tier gate (tests/setup.db.js) skips
 * an undesignated run via a global `beforeEach(ctx => ctx.skip())`. `beforeAll` hooks always
 * run before EVERY beforeEach (including that global one), so DB setup in `beforeAll` bypasses
 * the gate entirely and throws instead of skipping. All DB work below therefore lives inside
 * each `it()` body (matching tests/integration/eva/pre-plan-critique-content-hash.integration.test.js's
 * pattern, which has no beforeAll for exactly this reason), not in beforeAll/afterAll.
 *
 * RUN: `npm run test:integration` (vitest --project db). Set VITEST_DB_ALLOW_REF=<ref> to a
 * non-production Supabase project ref to actually run it. NEVER point it at production.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createSupabaseServiceClient } from '../../../lib/supabase-client.js';
import { promoteArchPlan } from '../../../lib/eva/archplan-promote.js';

const RUN_ID = randomUUID();

async function seedVisionAndPlan(supabase, { suffix, qualityChecked, qualityIssues }) {
  const visionKey = `VISION-TEST-ARCHPLAN-PROMOTE-${suffix}-${RUN_ID}`;
  const planKey = `ARCH-TEST-PROMOTE-${suffix}-${RUN_ID}`;

  const { data: vision, error: visionErr } = await supabase
    .from('eva_vision_documents')
    .insert({
      vision_key: visionKey,
      level: 'L1',
      status: 'active',
      chairman_approved: true,
      content: 'Integration-test seed vision for archplan-promote.',
      version: 1,
      created_by: 'integration-test-seed',
    })
    .select('id')
    .single();
  if (visionErr) throw new Error(`vision seed failed: ${visionErr.message}`);

  const { error: planErr } = await supabase.from('eva_architecture_plans').insert({
    plan_key: planKey,
    vision_id: vision.id,
    vision_key: visionKey,
    vision_version_aligned_to: 1,
    content: `Integration-test seed plan (${suffix}).`,
    version: 1,
    status: 'draft',
    chairman_approved: false,
    quality_checked: qualityChecked,
    quality_issues: qualityIssues,
    created_by: 'integration-test-seed',
  });
  if (planErr) throw new Error(`plan seed failed: ${planErr.message}`);

  return { visionKey, planKey, visionId: vision.id };
}

async function cleanup(supabase, { visionKey, planKey }) {
  if (!supabase) return;
  await supabase.from('eva_architecture_plans').delete().eq('plan_key', planKey);
  await supabase.from('eva_vision_documents').delete().eq('vision_key', visionKey);
}

describe('promoteArchPlan against the REAL trg_enforce_archplan_quality_advancement trigger (live)', () => {
  it('TS-7: promotes a quality_checked=true draft row to active/chairman_approved', async () => {
    const supabase = createSupabaseServiceClient();
    const seed = await seedVisionAndPlan(supabase, { suffix: 'PASS', qualityChecked: true, qualityIssues: null });
    try {
      const result = await promoteArchPlan({ supabase, planKey: seed.planKey, promotedBy: 'integration-test-reviewer' });

      expect(result.promoted).toBe(true);
      expect(result.data.status).toBe('active');
      expect(result.data.chairman_approved).toBe(true);
      expect(result.data.chairman_approved_at).not.toBeNull();

      const { data: row } = await supabase
        .from('eva_architecture_plans')
        .select('status, chairman_approved, chairman_approved_at')
        .eq('plan_key', seed.planKey)
        .single();
      expect(row.status).toBe('active');
      expect(row.chairman_approved).toBe(true);
    } finally {
      await cleanup(supabase, seed);
    }
  });

  it('TS-8: the REAL trigger rejects promotion of a quality_checked=false draft row', async () => {
    const supabase = createSupabaseServiceClient();
    const seed = await seedVisionAndPlan(supabase, {
      suffix: 'FAIL',
      qualityChecked: false,
      qualityIssues: [{ check: 'section_coverage', message: 'insufficient sections' }],
    });
    try {
      const result = await promoteArchPlan({ supabase, planKey: seed.planKey, promotedBy: 'integration-test-reviewer' });

      expect(result.promoted).toBe(false);
      expect(result.reason).toBe('update_failed');
      // The real trigger's own exception message (enforce_archplan_quality_on_advancement).
      expect(result.error).toMatch(/quality_checked is false/i);

      // Row must be genuinely unchanged -- the trigger fired BEFORE the write landed.
      const { data: row } = await supabase
        .from('eva_architecture_plans')
        .select('status, chairman_approved, chairman_approved_at')
        .eq('plan_key', seed.planKey)
        .single();
      expect(row.status).toBe('draft');
      expect(row.chairman_approved).toBe(false);
      expect(row.chairman_approved_at).toBeNull();
    } finally {
      await cleanup(supabase, seed);
    }
  });
});
