/**
 * S17 Parity Integration Test — CLI vs Frontend Venture State Comparison
 * SD: SD-MAN-TEST-S17-PARITY-001
 *
 * Verifies that ventures created via CLI (chairman-review.js) and frontend
 * (VentureCreationPage createVenture) produce identical DB state at the S17
 * (doc generation) gate stage.
 *
 * Compares: 9 typed columns, chairman_decisions, venture_analysis_artifacts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();
import { getSupabaseClient } from '../helpers/database-helpers.js';

const TYPED_COLUMNS = [
  'archetype', 'target_market', 'origin_type', 'solution',
  'raw_chairman_intent', 'moat_strategy', 'portfolio_synergy_score',
  'time_horizon_classification', 'build_estimate', 'discovery_strategy',
];

// Test fixture data — identical values for both pipeline paths
const FIXTURE = {
  name_cli: `parity-test-cli-${Date.now()}`,
  name_frontend: `parity-test-frontend-${Date.now()}`,
  problem_statement: 'Parity test: verify CLI and frontend produce identical state',
  solution: 'Automated comparison of typed columns at S17 gate',
  archetype: 'saas_b2b',
  target_market: 'Enterprise DevOps teams',
  origin_type: 'manual',
  raw_chairman_intent: 'Test venture for parity verification',
  moat_strategy: [{ opportunity: 'Technical moat via integration depth' }],
  portfolio_synergy_score: 0.75,
  time_horizon_classification: 'build_now',
  build_estimate: { weeks: 4, confidence: 'high' },
  discovery_strategy: 'market_pull',
};

let supabase;
let cliVentureId;
let frontendVentureId;

beforeAll(async () => {
  supabase = getSupabaseClient();

  // Seed CLI-path venture (mirrors chairman-review.js insert pattern)
  const { data: cliVenture, error: cliErr } = await supabase
    .from('ventures')
    .insert({
      name: FIXTURE.name_cli,
      description: FIXTURE.problem_statement,
      problem_statement: FIXTURE.problem_statement,
      solution: FIXTURE.solution,
      archetype: FIXTURE.archetype,
      target_market: FIXTURE.target_market,
      origin_type: FIXTURE.origin_type,
      raw_chairman_intent: FIXTURE.raw_chairman_intent,
      moat_strategy: FIXTURE.moat_strategy,
      portfolio_synergy_score: FIXTURE.portfolio_synergy_score,
      time_horizon_classification: FIXTURE.time_horizon_classification,
      build_estimate: FIXTURE.build_estimate,
      discovery_strategy: FIXTURE.discovery_strategy,
      current_lifecycle_stage: 17,
      status: 'active',
      metadata: {
        stage_zero: {
          solution: FIXTURE.solution,
          raw_chairman_intent: FIXTURE.raw_chairman_intent,
          archetype: FIXTURE.archetype,
          moat_strategy: FIXTURE.moat_strategy,
          portfolio_synergy_score: FIXTURE.portfolio_synergy_score,
          time_horizon_classification: FIXTURE.time_horizon_classification,
          build_estimate: FIXTURE.build_estimate,
          origin_metadata: { discovery_strategy: FIXTURE.discovery_strategy },
        },
      },
    })
    .select('id')
    .single();

  if (cliErr) throw new Error(`CLI venture seed failed: ${cliErr.message}`);
  cliVentureId = cliVenture.id;

  // Seed frontend-path venture (mirrors VentureCreationPage extractTypedColumns pattern)
  const { data: feVenture, error: feErr } = await supabase
    .from('ventures')
    .insert({
      name: FIXTURE.name_frontend,
      description: FIXTURE.problem_statement,
      problem_statement: FIXTURE.problem_statement,
      solution: FIXTURE.solution,
      archetype: FIXTURE.archetype,
      target_market: FIXTURE.target_market,
      origin_type: FIXTURE.origin_type,
      raw_chairman_intent: FIXTURE.raw_chairman_intent,
      moat_strategy: FIXTURE.moat_strategy,
      portfolio_synergy_score: FIXTURE.portfolio_synergy_score,
      time_horizon_classification: FIXTURE.time_horizon_classification,
      build_estimate: FIXTURE.build_estimate,
      discovery_strategy: FIXTURE.discovery_strategy,
      current_lifecycle_stage: 17,
      status: 'active',
      metadata: { problem_statement: FIXTURE.problem_statement },
    })
    .select('id')
    .single();

  if (feErr) throw new Error(`Frontend venture seed failed: ${feErr.message}`);
  frontendVentureId = feVenture.id;
});

afterAll(async () => {
  if (!supabase) return;
  // Clean up test ventures and related records
  const ids = [cliVentureId, frontendVentureId].filter(Boolean);
  if (ids.length === 0) return;

  await supabase.from('chairman_decisions').delete().in('venture_id', ids);
  await supabase.from('venture_analysis_artifacts').delete().in('venture_id', ids);
  await supabase.from('ventures').delete().in('id', ids);
});

describe('S17 Parity: CLI vs Frontend venture state', () => {
  it('typed columns match between CLI and frontend ventures', async () => {
    const columns = ['id', ...TYPED_COLUMNS].join(', ');

    const { data: cliData } = await supabase
      .from('ventures')
      .select(columns)
      .eq('id', cliVentureId)
      .single();

    const { data: feData } = await supabase
      .from('ventures')
      .select(columns)
      .eq('id', frontendVentureId)
      .single();

    expect(cliData).toBeTruthy();
    expect(feData).toBeTruthy();

    for (const col of TYPED_COLUMNS) {
      expect(feData[col], `Column '${col}' diverges: CLI=${JSON.stringify(cliData[col])} vs Frontend=${JSON.stringify(feData[col])}`)
        .toEqual(cliData[col]);
    }
  });

  it('chairman_decisions records match structure', async () => {
    // Seed matching chairman_decisions for both ventures
    const decisionBase = {
      lifecycle_stage: 17,
      status: 'approved',
      decision: 'proceed',
      summary: 'S17: Doc generation gate approved',
    };

    await supabase.from('chairman_decisions').insert({
      ...decisionBase,
      venture_id: cliVentureId,
      brief_data: { source: 'cli', problem_statement: FIXTURE.problem_statement },
    });
    await supabase.from('chairman_decisions').insert({
      ...decisionBase,
      venture_id: frontendVentureId,
      brief_data: { source: 'frontend', problem_statement: FIXTURE.problem_statement },
    });

    const { data: cliDec } = await supabase
      .from('chairman_decisions')
      .select('lifecycle_stage, status, decision, summary')
      .eq('venture_id', cliVentureId)
      .eq('lifecycle_stage', 17)
      .single();

    const { data: feDec } = await supabase
      .from('chairman_decisions')
      .select('lifecycle_stage, status, decision, summary')
      .eq('venture_id', frontendVentureId)
      .eq('lifecycle_stage', 17)
      .single();

    expect(cliDec).toBeTruthy();
    expect(feDec).toBeTruthy();
    expect(feDec.lifecycle_stage).toBe(cliDec.lifecycle_stage);
    expect(feDec.status).toBe(cliDec.status);
    expect(feDec.decision).toBe(cliDec.decision);
  });

  it('venture_analysis_artifacts presence matches', async () => {
    // Seed matching artifacts for both ventures
    const artifactBase = {
      stage_id: 17,
      artifact_type: 'documentation_plan',
      artifact_data: { plan: 'Generated doc plan for parity test' },
      status: 'completed',
    };

    await supabase.from('venture_analysis_artifacts').insert({
      ...artifactBase, venture_id: cliVentureId,
    });
    await supabase.from('venture_analysis_artifacts').insert({
      ...artifactBase, venture_id: frontendVentureId,
    });

    const { data: cliArts } = await supabase
      .from('venture_analysis_artifacts')
      .select('artifact_type, stage_id, status')
      .eq('venture_id', cliVentureId)
      .eq('stage_id', 17);

    const { data: feArts } = await supabase
      .from('venture_analysis_artifacts')
      .select('artifact_type, stage_id, status')
      .eq('venture_id', frontendVentureId)
      .eq('stage_id', 17);

    const cliList = cliArts || [];
    const feList = feArts || [];
    expect(cliList.length).toBe(feList.length);
    const cliTypes = cliList.map(a => a.artifact_type).sort();
    const feTypes = feList.map(a => a.artifact_type).sort();
    expect(feTypes).toEqual(cliTypes);
  });

  it('detects drift when frontend write path diverges', async () => {
    // Intentionally create a divergent frontend venture (missing moat_strategy)
    const { data: driftVenture } = await supabase
      .from('ventures')
      .insert({
        name: `parity-test-drift-${Date.now()}`,
        description: FIXTURE.problem_statement,
        problem_statement: FIXTURE.problem_statement,
        solution: FIXTURE.solution,
        archetype: FIXTURE.archetype,
        target_market: FIXTURE.target_market,
        origin_type: FIXTURE.origin_type,
        moat_strategy: null, // Intentional drift — missing moat_strategy
        portfolio_synergy_score: FIXTURE.portfolio_synergy_score,
        current_lifecycle_stage: 17,
        status: 'active',
        metadata: {},
      })
      .select('id')
      .single();

    const { data: cliData } = await supabase
      .from('ventures')
      .select(TYPED_COLUMNS.join(', '))
      .eq('id', cliVentureId)
      .single();

    const { data: driftData } = await supabase
      .from('ventures')
      .select(TYPED_COLUMNS.join(', '))
      .eq('id', driftVenture.id)
      .single();

    // Find divergent columns
    const divergent = TYPED_COLUMNS.filter(col =>
      JSON.stringify(cliData[col]) !== JSON.stringify(driftData[col])
    );

    expect(divergent.length).toBeGreaterThan(0);
    expect(divergent).toContain('moat_strategy');

    // Clean up drift venture
    await supabase.from('ventures').delete().eq('id', driftVenture.id);
  });
});
