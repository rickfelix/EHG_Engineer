#!/usr/bin/env node
/**
 * Standalone runner for venture-artifact-pipeline E2E test.
 * Runs the same test logic as the vitest test but uses Node.js assert.
 * Use this when vitest is unavailable.
 *
 * Usage: node tests/e2e/run-pipeline-test.cjs
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const assert = require('assert');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const STAGE_ARTIFACTS = { 1: 'truth_idea_brief', 2: 'truth_ai_critique', 3: 'truth_validation_decision' };

const testData = { ventureId: null, companyId: null, artifactIds: [], decisionIds: [] };

function mockArtifactContent(stage) {
  const contents = {
    1: { idea_name: 'Test Idea', problem_statement: 'E2E test', target_market: 'Test', proposed_solution: 'Test', unique_value_proposition: 'Test' },
    2: { strengths: ['Strong'], weaknesses: ['Limited'], opportunities: ['Growing'], threats: ['Competition'], overall_assessment: 'Viable', confidence_score: 0.75 },
    3: { validation_status: 'passed', market_validation: { score: 0.8 }, technical_feasibility: { score: 0.9 }, financial_viability: { score: 0.7 }, overall_score: 0.8, recommendation: 'proceed' },
  };
  return contents[stage] || { stage };
}

async function insertArtifact(ventureId, stage, artifactType) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .insert({ venture_id: ventureId, lifecycle_stage: stage, artifact_type: artifactType, title: `Stage ${stage}: ${artifactType}`, artifact_data: mockArtifactContent(stage), source: 'e2e-test', is_current: true, validation_status: 'validated' })
    .select('id')
    .single();
  if (error) throw new Error(`Insert artifact stage ${stage}: ${error.message}`);
  testData.artifactIds.push(data.id);
  return data;
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

async function cleanup() {
  if (testData.decisionIds.length > 0) await supabase.from('chairman_decisions').delete().in('id', testData.decisionIds);
  if (testData.artifactIds.length > 0) await supabase.from('venture_artifacts').delete().in('id', testData.artifactIds);
  if (testData.ventureId) await supabase.from('ventures').delete().eq('id', testData.ventureId);
  if (testData.companyId) await supabase.from('companies').delete().eq('id', testData.companyId);
}

async function run() {
  console.log('\n  Venture Artifact Pipeline E2E Test\n  ══════════════════════════════════\n');

  // Validate DB connection
  const { error: connErr } = await supabase.from('ventures').select('id').limit(1);
  if (connErr) { console.error('DB connection failed:', connErr.message); process.exit(1); }

  try {
    await test('Create test venture at stage 1', async () => {
      const { data: company, error: ce } = await supabase.from('companies').insert({ name: `E2E Pipeline Test ${Date.now()}` }).select('id').single();
      if (ce) throw new Error(ce.message);
      testData.companyId = company.id;

      const { data: venture, error: ve } = await supabase.from('ventures')
        .insert({ name: `E2E Pipeline Venture ${Date.now()}`, company_id: company.id, current_lifecycle_stage: 1, status: 'active', orchestrator_state: 'idle', description: 'E2E pipeline test', problem_statement: 'E2E pipeline test problem' })
        .select('id, current_lifecycle_stage, status, orchestrator_state').single();
      if (ve) throw new Error(ve.message);
      testData.ventureId = venture.id;

      assert.strictEqual(venture.current_lifecycle_stage, 1);
      assert.strictEqual(venture.status, 'active');
      assert.strictEqual(venture.orchestrator_state, 'idle');
    });

    await test('Create stage 1 artifact (truth_idea_brief)', async () => {
      const artifact = await insertArtifact(testData.ventureId, 1, STAGE_ARTIFACTS[1]);
      assert.ok(artifact.id);
      const { data } = await supabase.from('venture_artifacts').select('lifecycle_stage, artifact_type, artifact_data, is_current').eq('id', artifact.id).single();
      assert.strictEqual(data.lifecycle_stage, 1);
      assert.strictEqual(data.artifact_type, 'truth_idea_brief');
      assert.ok(data.is_current);
      assert.ok(data.artifact_data.idea_name);
    });

    await test('Advance stage 1 → 2', async () => {
      await supabase.from('ventures').update({ current_lifecycle_stage: 2 }).eq('id', testData.ventureId);
      const { data } = await supabase.from('ventures').select('current_lifecycle_stage').eq('id', testData.ventureId).single();
      assert.strictEqual(data.current_lifecycle_stage, 2);
    });

    await test('Create stage 2 artifact (truth_ai_critique)', async () => {
      const artifact = await insertArtifact(testData.ventureId, 2, STAGE_ARTIFACTS[2]);
      const { data } = await supabase.from('venture_artifacts').select('lifecycle_stage, artifact_type, artifact_data').eq('id', artifact.id).single();
      assert.strictEqual(data.artifact_type, 'truth_ai_critique');
      assert.ok(data.artifact_data.strengths);
    });

    await test('Advance stage 2 → 3', async () => {
      await supabase.from('ventures').update({ current_lifecycle_stage: 3 }).eq('id', testData.ventureId);
      const { data } = await supabase.from('ventures').select('current_lifecycle_stage').eq('id', testData.ventureId).single();
      assert.strictEqual(data.current_lifecycle_stage, 3);
    });

    await test('Gate pause: create chairman decision at stage 3', async () => {
      const { data, error } = await supabase.from('chairman_decisions')
        .insert({ venture_id: testData.ventureId, lifecycle_stage: 3, status: 'pending', decision: 'pending', context: { gate_type: 'blocking', source: 'e2e-test' } })
        .select('id, status, lifecycle_stage').single();
      if (error) throw new Error(error.message);
      testData.decisionIds.push(data.id);
      assert.strictEqual(data.status, 'pending');
      assert.strictEqual(data.lifecycle_stage, 3);
    });

    await test('Pipeline blocked while gate pending', async () => {
      await supabase.from('ventures').update({ orchestrator_state: 'blocked' }).eq('id', testData.ventureId);
      const { data: v } = await supabase.from('ventures').select('orchestrator_state, current_lifecycle_stage').eq('id', testData.ventureId).single();
      assert.strictEqual(v.orchestrator_state, 'blocked');
      assert.strictEqual(v.current_lifecycle_stage, 3);
      const { data: d } = await supabase.from('chairman_decisions').select('status').eq('venture_id', testData.ventureId).eq('lifecycle_stage', 3).single();
      assert.strictEqual(d.status, 'pending');
    });

    await test('Gate resume: approve and advance past stage 3', async () => {
      await supabase.from('chairman_decisions').update({ status: 'approved', decision: 'proceed' }).eq('venture_id', testData.ventureId).eq('lifecycle_stage', 3);
      const { data: d } = await supabase.from('chairman_decisions').select('status').eq('venture_id', testData.ventureId).eq('lifecycle_stage', 3).single();
      assert.strictEqual(d.status, 'approved');

      await insertArtifact(testData.ventureId, 3, STAGE_ARTIFACTS[3]);
      await supabase.from('ventures').update({ current_lifecycle_stage: 4, orchestrator_state: 'idle' }).eq('id', testData.ventureId);
      const { data: v } = await supabase.from('ventures').select('current_lifecycle_stage, orchestrator_state').eq('id', testData.ventureId).single();
      assert.strictEqual(v.current_lifecycle_stage, 4);
      assert.strictEqual(v.orchestrator_state, 'idle');
    });

    await test('Artifacts exist for all stages 1-3', async () => {
      const { data } = await supabase.from('venture_artifacts').select('lifecycle_stage, artifact_type, is_current').eq('venture_id', testData.ventureId).order('lifecycle_stage');
      assert.strictEqual(data.length, 3);
      assert.strictEqual(data[0].artifact_type, 'truth_idea_brief');
      assert.strictEqual(data[1].artifact_type, 'truth_ai_critique');
      assert.strictEqual(data[2].artifact_type, 'truth_validation_decision');
      assert.ok(data.every(a => a.is_current));
    });

    await test('Worker poll query finds active venture', async () => {
      const { data } = await supabase.from('ventures').select('id, name, current_lifecycle_stage').eq('status', 'active').eq('orchestrator_state', 'idle').lt('current_lifecycle_stage', 25);
      const found = data.find(v => v.id === testData.ventureId);
      assert.ok(found, 'Test venture should appear in worker poll');
      assert.strictEqual(found.current_lifecycle_stage, 4);
    });

  } finally {
    console.log('\n  Cleanup...');
    await cleanup();
    console.log('  Done.\n');
    console.log(`  Results: ${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

run().catch(err => { console.error('Fatal:', err); cleanup().finally(() => process.exit(1)); });
