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
 * Modeled on tests/integration/eva/clone-vision-repair-dims-preserve.test.js. Skips when no
 * service role is available (e.g. a forked PR).
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { promoteArchPlan } from '../../../lib/eva/archplan-promote.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = !!(SUPABASE_URL && SERVICE_KEY);
const supabase = hasDb ? createClient(SUPABASE_URL, SERVICE_KEY) : null;

const RUN_ID = randomUUID();
const VISION_KEY = `VISION-TEST-ARCHPLAN-PROMOTE-${RUN_ID}`;
const PLAN_KEY_PASS = `ARCH-TEST-PROMOTE-PASS-${RUN_ID}`;
const PLAN_KEY_FAIL = `ARCH-TEST-PROMOTE-FAIL-${RUN_ID}`;

describe.skipIf(!hasDb)('promoteArchPlan against the REAL trg_enforce_archplan_quality_advancement trigger (live)', () => {
  let visionId;

  beforeAll(async () => {
    await supabase.from('eva_vision_documents').delete().eq('vision_key', VISION_KEY);
    const { data: vision, error: visionErr } = await supabase
      .from('eva_vision_documents')
      .insert({
        vision_key: VISION_KEY,
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
    visionId = vision.id;

    await supabase.from('eva_architecture_plans').delete().in('plan_key', [PLAN_KEY_PASS, PLAN_KEY_FAIL]);

    // Row A: quality_checked=TRUE -- promotion should succeed.
    const { error: passErr } = await supabase.from('eva_architecture_plans').insert({
      plan_key: PLAN_KEY_PASS,
      vision_id: visionId,
      vision_key: VISION_KEY,
      vision_version_aligned_to: 1,
      content: 'Integration-test seed plan (quality-passing).',
      version: 1,
      status: 'draft',
      chairman_approved: false,
      quality_checked: true,
      quality_issues: null,
      created_by: 'integration-test-seed',
    });
    if (passErr) throw new Error(`pass-row seed failed: ${passErr.message}`);

    // Row B: quality_checked=FALSE -- promotion must be rejected by the real trigger.
    const { error: failErr } = await supabase.from('eva_architecture_plans').insert({
      plan_key: PLAN_KEY_FAIL,
      vision_id: visionId,
      vision_key: VISION_KEY,
      vision_version_aligned_to: 1,
      content: 'Integration-test seed plan (quality-failing).',
      version: 1,
      status: 'draft',
      chairman_approved: false,
      quality_checked: false,
      quality_issues: [{ check: 'section_coverage', message: 'insufficient sections' }],
      created_by: 'integration-test-seed',
    });
    if (failErr) throw new Error(`fail-row seed failed: ${failErr.message}`);
  });

  afterAll(async () => {
    if (!supabase) return;
    await supabase.from('eva_architecture_plans').delete().in('plan_key', [PLAN_KEY_PASS, PLAN_KEY_FAIL]);
    await supabase.from('eva_vision_documents').delete().eq('vision_key', VISION_KEY);
  });

  test('TS-7: promotes a quality_checked=true draft row to active/chairman_approved', async () => {
    const result = await promoteArchPlan({ supabase, planKey: PLAN_KEY_PASS, promotedBy: 'integration-test-reviewer' });

    expect(result.promoted).toBe(true);
    expect(result.data.status).toBe('active');
    expect(result.data.chairman_approved).toBe(true);
    expect(result.data.chairman_approved_at).not.toBeNull();

    const { data: row } = await supabase
      .from('eva_architecture_plans')
      .select('status, chairman_approved, chairman_approved_at')
      .eq('plan_key', PLAN_KEY_PASS)
      .single();
    expect(row.status).toBe('active');
    expect(row.chairman_approved).toBe(true);
  });

  test('TS-8: the REAL trigger rejects promotion of a quality_checked=false draft row', async () => {
    const result = await promoteArchPlan({ supabase, planKey: PLAN_KEY_FAIL, promotedBy: 'integration-test-reviewer' });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('update_failed');
    // The real trigger's own exception message (enforce_archplan_quality_on_advancement).
    expect(result.error).toMatch(/quality_checked is false/i);

    // Row must be genuinely unchanged -- the trigger fired BEFORE the write landed.
    const { data: row } = await supabase
      .from('eva_architecture_plans')
      .select('status, chairman_approved, chairman_approved_at')
      .eq('plan_key', PLAN_KEY_FAIL)
      .single();
    expect(row.status).toBe('draft');
    expect(row.chairman_approved).toBe(false);
    expect(row.chairman_approved_at).toBeNull();
  });
});
