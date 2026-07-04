/**
 * Parent Scope-Coverage Check — full integration test
 * SD-LEO-INFRA-PARENT-SCOPE-COVERAGE-001 (FR-2, FR-3, FR-4)
 *
 * Replays the real incident specimen against the REAL production code paths — no mocked
 * gates: lib/sd/child-linkage.js's linkChild() (decomposition-time) and the exported
 * getParentOrchestratorExecToPlanGates()'s PARENT_DELEGATED_COMPLETION validator
 * (completion-time), both against a disposable test parent/children set, cleaned up in
 * afterAll.
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';

dotenv.config();

const { linkChild } = await import('../../lib/sd/child-linkage.js');
const { getParentOrchestratorExecToPlanGates } = await import(
  '../../scripts/modules/handoff/executors/exec-to-plan/parent-orchestrator.js'
);

const supabase = createSupabaseServiceClient();

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

describe.skipIf(!HAS_REAL_DB)('Parent Scope-Coverage Check (integration — MarketLens specimen)', () => {
  const runId = Date.now();
  const parentKey = `SD-TEST-SCOPE-COV-MKLENS-${runId}`;
  const childApiKey = `${parentKey}-A`;
  const childUiKey = `${parentKey}-B`;

  beforeAll(async () => {
    await supabase.from('strategic_directives_v2').insert({
      sd_key: parentKey, id: parentKey, title: 'Develop MarketLens Landing Page with Hero and CTA (TEST SPECIMEN)',
      status: 'draft', sd_type: 'orchestrator', category: 'infrastructure', priority: 'medium',
      target_application: 'EHG_Engineer',
      scope: '1. Landing page UI\n2. Signup UI',
      description: 'Test specimen replaying the real MarketLens landing-page scope-coverage incident.',
      rationale: 'Regression fixture for SD-LEO-INFRA-PARENT-SCOPE-COVERAGE-001.',
      metadata: {},
    });
    await supabase.from('strategic_directives_v2').insert({
      sd_key: childApiKey, id: childApiKey, title: 'Build the API layer',
      status: 'draft', sd_type: 'infrastructure', category: 'infrastructure', priority: 'medium',
      target_application: 'EHG_Engineer', scope: 'REST endpoints for venture data',
      description: 'API-only child (deliberately under-scoped specimen)', rationale: 'Test fixture.',
    });
    await supabase.from('strategic_directives_v2').insert({
      sd_key: childUiKey, id: childUiKey, title: 'Build the landing page UI and the signup UI',
      status: 'draft', sd_type: 'infrastructure', category: 'infrastructure', priority: 'medium',
      target_application: 'EHG_Engineer', scope: 'Landing page UI and signup UI implementation',
      description: 'Covering child added in the second half of the specimen', rationale: 'Test fixture.',
    });
  });

  afterAll(async () => {
    await supabase.from('feedback').delete().eq('metadata->>source_sd', parentKey);
    await supabase.from('strategic_directives_v2').delete().eq('sd_key', childUiKey);
    await supabase.from('strategic_directives_v2').delete().eq('sd_key', childApiKey);
    await supabase.from('strategic_directives_v2').delete().eq('sd_key', parentKey);
  });

  async function fetchParent() {
    const { data } = await supabase.from('strategic_directives_v2').select('*').eq('sd_key', parentKey).single();
    return data;
  }

  async function runCompletionGate() {
    const parent = await fetchParent();
    const gate = getParentOrchestratorExecToPlanGates(supabase, parent).find((g) => g.name === 'PARENT_DELEGATED_COMPLETION');
    return gate.validator();
  }

  it('Step 1: linkChild() for the API-only child produces a decomposition-time coverage warning', async () => {
    const parent = await fetchParent();
    const result = await linkChild(supabase, parent, childApiKey, { registeredBy: 'test-fixture', today: '2026-07-04' });
    expect(result.childKey).toBe(childApiKey);

    const updatedParent = await fetchParent();
    const coverage = updatedParent.metadata?.scope_coverage;
    expect(coverage).toBeTruthy();
    expect(coverage.coverage_pct).toBe(0);
    expect(coverage.elements.map((e) => e.element)).toEqual(expect.arrayContaining(['Landing page UI', 'Signup UI']));
    expect(coverage.elements.every((e) => !e.covered)).toBe(true);
  });

  it('Step 2: PARENT_DELEGATED_COMPLETION still passes but raises a needs_decision completion_flag', async () => {
    const result = await runCompletionGate();
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.scope_coverage.coverage_pct).toBe(0);

    const { data: flags } = await supabase
      .from('feedback')
      .select('id, category, metadata')
      .eq('metadata->>source_sd', parentKey);
    expect(flags.length).toBe(1);
    expect(flags[0].category).toBe('completion_flag');
    expect(flags[0].metadata.flag_class).toBe('needs_decision');
  });

  it('Step 2b: re-running the completion gate does not create a duplicate completion_flag row', async () => {
    await runCompletionGate();
    const { data: flags } = await supabase
      .from('feedback')
      .select('id')
      .eq('metadata->>source_sd', parentKey);
    expect(flags.length).toBe(1);
  });

  it('Step 3: registering the covering child closes the gap — 100% coverage, zero new flags', async () => {
    const parent = await fetchParent();
    await linkChild(supabase, parent, childUiKey, { registeredBy: 'test-fixture', today: '2026-07-04' });

    const updatedParent = await fetchParent();
    expect(updatedParent.metadata.scope_coverage.coverage_pct).toBe(100);

    const result = await runCompletionGate();
    expect(result.passed).toBe(true);
    expect(result.details.scope_coverage.coverage_pct).toBe(100);

    const { data: flags } = await supabase
      .from('feedback')
      .select('id')
      .eq('metadata->>source_sd', parentKey);
    expect(flags.length).toBe(1); // still just the one flag from the under-covered state — no new flag on a clean completion
  });
});
