/**
 * Regression test for SD-LEO-FIX-FIX-AUTO-POPULATE-001.
 *
 * Locks in the fix for the auto_populate_retrospective_fields() trigger predicate
 * bug (filed feedback d637a3fb-12c9-4f1d-aca6-25f32d9febd0). Before the fix, every
 * INSERT — including status='DRAFT' — fired the PUBLISHED-only quality_score >= 70
 * gate, blocking manual SD_COMPLETION retrospective inserts.
 *
 * Test scenarios:
 *   1. Happy path: DRAFT insert with rich arrays and no pre-set quality_score lands
 *      and the auto_validate trigger computes quality_score >= 70.
 *   2. Negative path: PUBLISHED insert with low quality_score still raises P0001.
 *
 * The test runs against the live linked database (read/write); skips when no
 * service-role key is available.
 */

import { describe, test, expect, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_DB = Boolean(SUPABASE_URL && SUPABASE_KEY);
const supabase = HAS_DB ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const skipIfNoDb = HAS_DB ? test : test.skip;

const insertedRetroIds = [];

afterEach(async () => {
  if (!HAS_DB) return;
  while (insertedRetroIds.length > 0) {
    const id = insertedRetroIds.pop();
    await supabase.from('retrospectives').delete().eq('id', id);
  }
});

describe('auto_populate_retrospective_fields trigger predicate (SD-LEO-FIX-FIX-AUTO-POPULATE-001)', () => {
  // Use this SD's own UUID for FK satisfaction; the test row is identifiable by title prefix
  // and is deleted in afterEach. Avoids creating throwaway SD rows.
  const TEST_SD_UUID = 'f91556d5-6226-486f-a179-27c9b602029f';

  skipIfNoDb('DRAFT insert with rich arrays lands without pre-set quality_score', async () => {
    const sdId = TEST_SD_UUID;
    const payload = {
      sd_id: sdId,
      project_name: `TEST-RETRO-TRIGGER-FIX-${Date.now()}`,
      retro_type: 'SD_COMPLETION',
      title: `Regression test row for SD-LEO-FIX-FIX-AUTO-POPULATE-001 ${Date.now()}`,
      status: 'DRAFT',
      generated_by: 'MANUAL',
      learning_category: 'PROCESS_IMPROVEMENT',
      target_application: 'EHG_Engineer',
      affected_components: ['scripts/triage-test', 'lib/test-target'],
      technical_debt_addressed: false,
      auto_generated: false,
      conducted_date: new Date().toISOString(),
      what_went_well: [
        'Trigger fix landed cleanly via CREATE OR REPLACE; idempotent.',
        'Integration test catches the regression at insert time, not at handoff time.',
        'Source-side fix protects all callers — no per-script workaround needed.',
        'Single-line predicate change with verbatim preservation of every other branch.',
        'Verification via pg_get_functiondef confirmed the new predicate is in place 50 lines into the function definition.'
      ],
      key_learnings: [
        'Trigger ordering is alphabetical by trigger NAME — auto_populate_retrospective_fields runs before auto_validate_retrospective_quality, which is why the gate fired before the score was computed.',
        'is_status_changing_to_published is a composite signal that needs both TG_OP and NEW.status to be checked together; the OR-disjunct without status was the bug.',
        'The auto_validate trigger overrides NEW.quality_score in its run, so any value the inserter pre-sets is transient — the buggy gate just needed a satisfying value to pass through.',
        'Workarounds that pre-set quality_score to 80 produce honest stored scores after auto_validate runs, but they bypass the legitimate gate semantics on the way through (database-agent flagged this in 2026-05-05 review).',
        'Pure root-cause fixes preserve the audit trail; bypass quota does not.'
      ],
      action_items: [
        'Resume SD-MAN-INFRA-TRIAGE-377-PRE-001 retrospective insert without the quality_score=80 workaround.',
        'Mark feedback d637a3fb-12c9-4f1d-aca6-25f32d9febd0 as resolved.',
        'Confirm no other consumers of the buggy trigger relied on the implicit DRAFT-as-PUBLISHED semantics.'
      ],
      what_needs_improvement: [
        'Trigger ordering implications could have been documented when the second trigger was added.',
        'Regression coverage on retrospectives.* triggers was thin enough that this bug shipped without detection.',
        'PRD acceptance criteria validators should accept either array-of-strings or array-of-{criterion, measure} shape; the auto-enrichment fallback is fragile.'
      ]
    };

    const { data, error } = await supabase
      .from('retrospectives')
      .insert(payload)
      .select('id, status, quality_score, retro_type')
      .single();

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    insertedRetroIds.push(data.id);

    expect(data.status).toBe('DRAFT');
    expect(data.retro_type).toBe('SD_COMPLETION');
    expect(data.quality_score).toBeGreaterThanOrEqual(70);
  });

  skipIfNoDb('PUBLISHED insert with low quality_score still raises P0001', async () => {
    const sdId = TEST_SD_UUID;
    const payload = {
      sd_id: sdId,
      project_name: `TEST-RETRO-TRIGGER-FIX-${Date.now()}`,
      retro_type: 'SD_COMPLETION',
      title: 'Regression test row — negative path',
      status: 'PUBLISHED',
      generated_by: 'MANUAL',
      learning_category: 'PROCESS_IMPROVEMENT',
      target_application: 'EHG_Engineer',
      auto_generated: false,
      conducted_date: new Date().toISOString(),
      what_went_well: [],
      key_learnings: [],
      action_items: [],
      what_needs_improvement: [],
      quality_score: 0
    };

    const { data, error } = await supabase.from('retrospectives').insert(payload).select('id');
    if (data && data[0]) insertedRetroIds.push(data[0].id);

    expect(error).toBeTruthy();
    expect(error.message).toMatch(/PUBLISHED retrospectives must have quality_score >= 70|non-empty action_items/);
  });

  // SD-FDBK-FIX-FIX-RETROSPECTIVE-TRIGGER-001 (harness_backlog 8bc451f0): the publish-gate
  // quality_score>=70 check used to fire (alphabetically) BEFORE the score-compute trigger,
  // so a direct PUBLISHED insert with good content but no pre-set score raised P0001. The
  // enforcement was relocated to run AFTER the score is computed, on every publish path.

  skipIfNoDb('direct PUBLISHED insert with rich content and no pre-set quality_score succeeds (firing-order fix)', async () => {
    const payload = {
      sd_id: TEST_SD_UUID,
      project_name: `TEST-RETRO-GATE-ORDER-${Date.now()}`,
      retro_type: 'SD_COMPLETION',
      title: `Regression row — direct PUBLISHED positive path ${Date.now()}`,
      status: 'PUBLISHED',
      generated_by: 'MANUAL',
      learning_category: 'PROCESS_IMPROVEMENT',
      target_application: 'EHG_Engineer',
      auto_generated: false,
      conducted_date: new Date().toISOString(),
      what_went_well: [
        'Publish-gate enforcement now runs after the score is computed.',
        'Direct PUBLISHED inserts no longer require the DRAFT-then-PUBLISH workaround.',
        'Fix is order-independent: enforcement lives in the compute trigger.',
        'Trigger names were preserved so historical migrations are not orphaned.',
        'Scoring logic was kept byte-identical, verified by smoke tests.'
      ],
      key_learnings: [
        'PostgreSQL fires BEFORE-row triggers alphabetically by name, placing the check before the compute.',
        'Relocating the quality_score>=70 check into auto_validate_retrospective_quality removes the ordering dependency.',
        'The should_recalculate=false path must still enforce the gate using the stored score on status-only updates.',
        'Co-locating compute and enforcement makes the gate robust to future trigger additions.',
        'Regression tests assert the score is computed and lands at >=70 with no pre-set value.'
      ],
      action_items: [
        'Drop the DRAFT-then-PUBLISH workaround in retro-writing tooling where convenient.',
        'Resolve harness_backlog 8bc451f0.',
        'Keep this regression test to prevent re-break.'
      ],
      what_needs_improvement: [
        'Trigger ordering implications should be documented when a new retrospectives trigger is added.',
        'Regression coverage on retrospectives triggers was thin before this SD.',
        'A lint could flag publish gates that read a column another trigger computes.'
      ]
    };

    const { data, error } = await supabase
      .from('retrospectives')
      .insert(payload)
      .select('id, status, quality_score')
      .single();

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    insertedRetroIds.push(data.id);
    expect(data.status).toBe('PUBLISHED');
    expect(data.quality_score).toBeGreaterThanOrEqual(70);
  });

  skipIfNoDb('status-only DRAFT->PUBLISHED update with a low stored score still raises P0001', async () => {
    // Insert a low-quality DRAFT (lands; publish gate not applied), then publish via a
    // status-only update (no content change -> score NOT recomputed). The gate must enforce
    // the STORED score and raise — no publish path may bypass the >=70 gate.
    const draft = {
      sd_id: TEST_SD_UUID,
      project_name: `TEST-RETRO-GATE-ORDER-${Date.now()}`,
      retro_type: 'SD_COMPLETION',
      title: `Regression row — status-only publish enforcement ${Date.now()}`,
      status: 'DRAFT',
      generated_by: 'MANUAL',
      learning_category: 'PROCESS_IMPROVEMENT',
      target_application: 'EHG_Engineer',
      auto_generated: false,
      conducted_date: new Date().toISOString(),
      what_went_well: ['one'],
      key_learnings: ['two'],
      action_items: ['three'],
      what_needs_improvement: ['four']
    };

    const { data: draftRow, error: draftErr } = await supabase
      .from('retrospectives').insert(draft).select('id, quality_score').single();
    expect(draftErr).toBeNull();
    insertedRetroIds.push(draftRow.id);
    expect(draftRow.quality_score).toBeLessThan(70);

    const { error: pubErr } = await supabase
      .from('retrospectives').update({ status: 'PUBLISHED' }).eq('id', draftRow.id);
    expect(pubErr).toBeTruthy();
    expect(pubErr.message).toMatch(/PUBLISHED retrospectives must have quality_score >= 70|non-empty action_items/);
  });
});
