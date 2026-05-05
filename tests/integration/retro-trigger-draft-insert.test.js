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
});
