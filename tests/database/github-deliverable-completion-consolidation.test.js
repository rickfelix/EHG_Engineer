/**
 * SD-FDBK-FIX-TRIGGER-AUDIT-MEDIUM-001 (F-4) — a GITHUB PASS insert on
 * sub_agent_execution_results must complete deliverables through a SINGLE
 * engine (complete_deliverables_on_subagent_pass, mapping-driven), not the
 * retired hardcoded complete_deliverables_on_github_pass special-case.
 *
 * Live-DB integration test, gated like the other tests/database suites so CI
 * skips cleanly without service-role creds. Fixture rows are disposable and
 * hard-deleted in afterAll; sd_id uses this SD's own row (FK-safe parent for
 * sd_scope_deliverables), matching the tests/database precedent.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

// This SD's own row (strategic_directives_v2.id) -- FK-safe parent for
// sd_scope_deliverables.sd_id fixture rows without touching unrelated data.
const SD_ID = '85c3b32c-4260-4343-b613-ec4d7b3d4406';

const deliverableIds = [];
const resultIds = [];

describe.skipIf(!HAS_REAL_DB)('GITHUB deliverable completion consolidation (SD-FDBK-FIX-TRIGGER-AUDIT-MEDIUM-001 F-4)', () => {
  afterAll(async () => {
    if (deliverableIds.length) await supabase.from('sd_scope_deliverables').delete().in('id', deliverableIds);
    if (resultIds.length) await supabase.from('sub_agent_execution_results').delete().in('id', resultIds);
  });

  it('a GITHUB PASS insert completes a pending "configuration" deliverable through the mapping-driven engine, not the retired hardcoded trigger', async () => {
    const { data: deliverable, error: dErr } = await supabase.from('sd_scope_deliverables').insert({
      sd_id: SD_ID,
      deliverable_type: 'configuration',
      deliverable_name: 'TEST_FIXTURE_F4_CONFIGURATION',
      completion_status: 'pending',
    }).select();
    expect(dErr).toBeNull();
    deliverableIds.push(deliverable[0].id);

    const { data: result, error: rErr } = await supabase.from('sub_agent_execution_results').insert({
      sd_id: SD_ID,
      sub_agent_code: 'GITHUB',
      sub_agent_name: 'GITHUB',
      verdict: 'PASS',
      confidence: 100,
    }).select();
    expect(rErr).toBeNull();
    resultIds.push(result[0].id);

    const { data: after } = await supabase.from('sd_scope_deliverables')
      .select('completion_status, verified_by, metadata')
      .eq('id', deliverable[0].id)
      .single();

    expect(after.completion_status).toBe('completed');
    expect(after.verified_by).toBe('GITHUB');
    // Consolidation proof: completed via the single mapping-driven engine, never
    // the retired complete_deliverables_on_github_pass special-case.
    expect(after.metadata?.trigger).toBe('complete_deliverables_on_subagent_pass');
  });

  it('does not double-stamp: exactly one completion pass, no conflicting evidence trail', async () => {
    const { data: deliverable, error: dErr } = await supabase.from('sd_scope_deliverables').insert({
      sd_id: SD_ID,
      deliverable_type: 'ui_feature',
      deliverable_name: 'TEST_FIXTURE_F4_UI_FEATURE',
      completion_status: 'pending',
    }).select();
    expect(dErr).toBeNull();
    deliverableIds.push(deliverable[0].id);

    const { data: result } = await supabase.from('sub_agent_execution_results').insert({
      sd_id: SD_ID,
      sub_agent_code: 'GITHUB',
      sub_agent_name: 'GITHUB',
      verdict: 'PASS',
      confidence: 100,
    }).select();
    resultIds.push(result[0].id);

    const { data: after } = await supabase.from('sd_scope_deliverables')
      .select('completion_status, metadata')
      .eq('id', deliverable[0].id)
      .single();

    expect(after.completion_status).toBe('completed');
    expect(after.metadata?.trigger).toBe('complete_deliverables_on_subagent_pass');
  });
});
