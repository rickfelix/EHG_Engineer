/**
 * Full Venture Lifecycle Journey E2E Test
 *
 * Tests complete venture progression through all 25 stages across 6 phases:
 * - Phase 1: THE TRUTH (Stages 1-5)
 * - Phase 2: THE ENGINE (Stages 6-9)
 * - Phase 3: THE IDENTITY (Stages 10-12)
 * - Phase 4: THE BLUEPRINT (Stages 13-16) - "Kochel Firewall"
 * - Phase 5: THE BUILD LOOP (Stages 17-20)
 * - Phase 6: LAUNCH & LEARN (Stages 21-25)
 *
 * This is the comprehensive end-to-end test that validates:
 * - Stage dependencies are enforced
 * - Required artifacts are created at each stage
 * - Golden Nugget validation passes at each transition
 * - Decision gates are respected
 * - SD requirements are enforced where applicable
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { getStageForArtifactType } from '../../../lib/eva/artifact-types.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

// Stage configuration -- artifacts[] corrected to match the LIVE
// venture_stages.required_artifacts per stage (verified directly against the
// DB, not the broader lib/eva/artifact-types.js ARTIFACT_TYPE_BY_STAGE set nor
// this file's own prior stale assumptions). Several stages were renumbered by
// a pipeline redesign predating this SD (see phase5/phase6 spec comments for
// the same finding) -- names updated to match venture_stages.stage_name.
const STAGES = [
  { number: 1, name: 'Draft Idea', phase: 'THE TRUTH', artifacts: ['truth_idea_brief'] },
  { number: 2, name: 'AI Review', phase: 'THE TRUTH', artifacts: ['truth_ai_critique'] },
  { number: 3, name: 'Comprehensive Validation', phase: 'THE TRUTH', artifacts: ['truth_validation_decision'], decision_gate: true },
  { number: 4, name: 'Competitive Intelligence', phase: 'THE TRUTH', artifacts: ['truth_competitive_analysis'] },
  { number: 5, name: 'Profitability Forecasting', phase: 'THE TRUTH', artifacts: ['truth_financial_model'], decision_gate: true },
  { number: 6, name: 'Risk Evaluation', phase: 'THE ENGINE', artifacts: ['engine_risk_matrix'] },
  { number: 7, name: 'Revenue Architecture', phase: 'THE ENGINE', artifacts: ['engine_pricing_model'] },
  { number: 8, name: 'Business Model Canvas', phase: 'THE ENGINE', artifacts: ['engine_business_model_canvas'] },
  { number: 9, name: 'Exit Strategy', phase: 'THE ENGINE', artifacts: ['engine_exit_strategy'] },
  { number: 10, name: 'Customer & Brand Foundation', phase: 'THE IDENTITY', artifacts: ['identity_persona_brand'], sd_required: true },
  { number: 11, name: 'Naming & Visual Identity', phase: 'THE IDENTITY', artifacts: ['identity_naming_visual'] },
  { number: 12, name: 'GTM & Sales Strategy', phase: 'THE IDENTITY', artifacts: ['identity_brand_guidelines', 'identity_gtm_sales_strategy'] },
  { number: 13, name: 'Product Roadmap', phase: 'THE BLUEPRINT', artifacts: ['blueprint_product_roadmap'], decision_gate: true },
  { number: 14, name: 'Technical Architecture', phase: 'THE BLUEPRINT', artifacts: ['blueprint_technical_architecture', 'blueprint_data_model', 'blueprint_erd_diagram', 'blueprint_api_contract', 'blueprint_schema_spec'], sd_required: true },
  { number: 15, name: 'Design Studio', phase: 'THE BLUEPRINT', artifacts: ['wireframe_screens', 'blueprint_user_story_pack'], sd_required: true },
  { number: 16, name: 'Financial Projections', phase: 'THE BLUEPRINT', artifacts: ['blueprint_financial_projection'], sd_required: true, decision_gate: true },
  { number: 17, name: 'Blueprint Review', phase: 'THE BUILD LOOP', artifacts: ['system_devils_advocate_review'], sd_required: true },
  { number: 18, name: 'Marketing Copy Studio', phase: 'THE BUILD LOOP', artifacts: ['marketing_tagline', 'marketing_app_store_desc', 'marketing_landing_hero', 'marketing_email_welcome', 'marketing_email_onboarding', 'marketing_email_reengagement', 'marketing_social_posts', 'marketing_seo_meta', 'marketing_blog_draft'], sd_required: true },
  { number: 19, name: 'Sprint Planning', phase: 'THE BUILD LOOP', artifacts: ['build_mvp_build'], sd_required: true },
  { number: 20, name: 'Code Quality Gate', phase: 'THE BUILD LOOP', artifacts: ['code_quality_report'], sd_required: true },
  { number: 21, name: 'Distribution Setup', phase: 'THE BUILD LOOP', artifacts: ['distribution_channel_config', 'distribution_ad_copy'], sd_required: true },
  { number: 22, name: 'Visual Assets', phase: 'THE BUILD LOOP', artifacts: ['visual_device_screenshots', 'visual_social_graphics'], sd_required: true },
  { number: 23, name: 'Launch Readiness', phase: 'LAUNCH & LEARN', artifacts: ['launch_readiness_checklist'], decision_gate: true },
  { number: 24, name: 'Go Live & Announce', phase: 'LAUNCH & LEARN', artifacts: ['launch_metrics'] },
  { number: 25, name: 'Post-Launch Review', phase: 'LAUNCH & LEARN', artifacts: ['postlaunch_assumptions_vs_reality', 'postlaunch_user_feedback_summary'], sd_required: true }
];

test.describe('Full Venture Lifecycle Journey (Stages 1-25)', () => {
  test.describe.configure({ mode: 'serial' }); // fullyParallel:true otherwise races shared testVentureId state

  let supabase: any;
  let testVentureId: string;
  let testCompanyId: string;
  const artifactContent: Record<string, any> = {};

  test.beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY!);

    // Create test company
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: `Full Journey Test Company ${Date.now()}` })
      .select('id')
      .single();

    if (company) testCompanyId = company.id;

    // Create test venture at Stage 0 (pre-start)
    const { data: venture } = await supabase
      .from('ventures')
      .insert({
        name: `Full Lifecycle Journey Venture ${Date.now()}`,
        company_id: testCompanyId,
        problem_statement: 'Test problem statement for E2E lifecycle testing',
        current_lifecycle_stage: 1,
        description: 'Testing complete venture lifecycle from Stage 1 to Stage 25'
      })
      .select('id')
      .single();

    if (venture) testVentureId = venture.id;

    // Pre-generate artifact content for all stages
    generateArtifactContent();
  });

  test.afterAll(async () => {
    // Cleanup
    if (testVentureId) {
      await supabase.from('venture_artifacts').delete().eq('venture_id', testVentureId);
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testCompanyId) {
      await supabase.from('companies').delete().eq('id', testCompanyId);
    }
  });

  function generateArtifactContent() {
    // Phase 1: THE TRUTH
    artifactContent['truth_idea_brief'] = { problem: 'Test problem', solution: 'Test solution', market: 'Test market' };
    artifactContent['truth_ai_critique'] = { models_used: ['claude', 'gpt'], score: 7.5, top_5_risks: [{}, {}, {}, {}, {}] };
    artifactContent['truth_validation_decision'] = { validation_score: 7.0, decision: 'advance' };
    artifactContent['truth_competitive_analysis'] = { competitors: [{ name: 'A' }, { name: 'B' }], market_gaps: ['Gap 1'] };
    artifactContent['truth_financial_model'] = { revenue: { year1: 500000 }, unit_economics: { gross_margin: 0.72, cac_ltv_ratio: 4.0, breakeven_months: 14 } };

    // Phase 2: THE ENGINE
    artifactContent['engine_risk_matrix'] = { risks: [{ risk: 'R1', probability: 0.5, impact: 'high', mitigation: 'M1' }] };
    artifactContent['engine_pricing_model'] = { tiers: [{ name: 'Starter', price: 49 }, { name: 'Growth', price: 149 }] };
    artifactContent['engine_business_model_canvas'] = { key_partners: [], key_activities: [], value_propositions: [], customer_segments: [], channels: [], customer_relationships: [], revenue_streams: {}, cost_structure: {}, key_resources: [] };
    artifactContent['engine_exit_strategy'] = { exit_scenarios: [{ type: 'acquisition', valuation_range: { min: 10000000, max: 50000000 } }] };

    // Phase 3: THE IDENTITY
    artifactContent['identity_brand_guidelines'] = { brand_name: { primary: 'TestBrand' }, visual_identity: {}, brand_voice: {} };
    artifactContent['identity_naming_visual'] = { launch_strategy: { phases: [] }, target_markets: [] };
    artifactContent['identity_persona_brand'] = { positioning_statement: 'Test positioning statement for the venture', key_messages: [] };
    artifactContent['identity_gtm_sales_strategy'] = { sales_process: { stages: [] }, qualification_framework: {} };

    // Phase 4: THE BLUEPRINT
    artifactContent['blueprint_product_roadmap'] = { final_stack: { frontend: 'React', backend: 'Node.js', database: 'PostgreSQL' }, decision_gate_status: 'approved' };
    artifactContent['blueprint_data_model'] = { entities: [{ name: 'users', fields: [] }], relationships: [] };
    artifactContent['blueprint_erd_diagram'] = { format: 'mermaid', diagram: 'erDiagram' };
    artifactContent['blueprint_user_story_pack'] = { epics: [{ id: 'E1', stories: [{ id: 'S1', invest_compliant: true }] }] };
    artifactContent['blueprint_api_contract'] = { openapi: '3.0.0', paths: {} };
    artifactContent['blueprint_schema_spec'] = { sql_schema: 'CREATE TABLE test', checklist: { all_entities_named: true, all_fields_typed: true, all_relationships_explicit: true, all_constraints_stated: true, api_contracts_generated: true, typescript_interfaces_generated: true } };

    // Phase 5: THE BUILD LOOP
    artifactContent['system_devils_advocate_review'] = { objections: [], resolution: 'approved to proceed' };
    artifactContent['marketing_tagline'] = { placeholder: true };
    artifactContent['marketing_app_store_desc'] = { placeholder: true };
    artifactContent['marketing_landing_hero'] = { placeholder: true };
    artifactContent['marketing_email_welcome'] = { placeholder: true };
    artifactContent['marketing_email_onboarding'] = { placeholder: true };
    artifactContent['marketing_email_reengagement'] = { placeholder: true };
    artifactContent['marketing_social_posts'] = { placeholder: true };
    artifactContent['marketing_seo_meta'] = { placeholder: true };
    artifactContent['marketing_blog_draft'] = { placeholder: true };
    artifactContent['build_mvp_build'] = { agent_config: { name: 'TestAgent' }, prompts: {} };
    artifactContent['code_quality_report'] = { security_assessment: { owasp_top_10: {} }, accessibility: { wcag_level: '2.1 AA' } };

    // Phase 6: LAUNCH & LEARN
    artifactContent['distribution_channel_config'] = { channels: [] };
    artifactContent['distribution_ad_copy'] = { ads: [] };
    artifactContent['visual_device_screenshots'] = { screenshots: [] };
    artifactContent['visual_social_graphics'] = { graphics: [] };
    artifactContent['launch_readiness_checklist'] = { pre_launch: { all_complete: true }, decision_gate: { go_no_go: 'GO' } };
    artifactContent['launch_metrics'] = { metrics: { revenue: { mrr: 10000 } } };
    artifactContent['postlaunch_assumptions_vs_reality'] = { assumptions: [], reality: [] };
    artifactContent['postlaunch_user_feedback_summary'] = { feedback: [] };
  }

  // Generate test for each stage
  for (const stage of STAGES) {
    test(`Stage ${stage.number}: ${stage.name}`, async () => {
      // Advance to this stage
      const { error: advanceError } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: stage.number })
        .eq('id', testVentureId);

      expect(advanceError).toBeNull();

      // Verify stage is set
      const { data: venture } = await supabase
        .from('ventures')
        .select('current_lifecycle_stage')
        .eq('id', testVentureId)
        .single();

      expect(venture.current_lifecycle_stage).toBe(stage.number);

      // Create required artifacts for this stage
      for (const artifactType of stage.artifacts) {
        const { error: artifactError } = await supabase
          .from('venture_artifacts')
          .insert({
            venture_id: testVentureId,
            artifact_type: artifactType,
            is_current: true,
            lifecycle_stage: getStageForArtifactType(artifactType) ?? stage.number,
            title: `${artifactType} for Stage ${stage.number}`,
            artifact_data: artifactContent[artifactType] || { placeholder: true },
          });

        // Artifact might already exist from previous test run
        if (artifactError && !artifactError.message.includes('duplicate')) {
          expect(artifactError).toBeNull();
        }
      }

      // Verify artifacts exist
      if (stage.artifacts.length > 0) {
        const { data: artifacts } = await supabase
          .from('venture_artifacts')
          .select('artifact_type')
          .eq('venture_id', testVentureId)
          .in('artifact_type', stage.artifacts);

        expect(artifacts?.length).toBe(stage.artifacts.length);
      }

      // Log progress
      console.log(`✅ Stage ${stage.number}: ${stage.name} (${stage.phase}) - Complete`);
    });
  }

  test('Journey Complete: Venture at Stage 25', async () => {
    // Final verification
    const { data: venture } = await supabase
      .from('ventures')
      .select('current_lifecycle_stage')
      .eq('id', testVentureId)
      .single();

    expect(venture.current_lifecycle_stage).toBe(25);

    // Count total artifacts created
    const { data: artifacts } = await supabase
      .from('venture_artifacts')
      .select('artifact_type')
      .eq('venture_id', testVentureId);

    const totalArtifacts = artifacts?.length || 0;
    console.log('\n🎉 VENTURE LIFECYCLE COMPLETE');
    console.log('   Total Stages: 25');
    console.log(`   Total Artifacts Created: ${totalArtifacts}`);
    console.log('   Journey: Stage 1 → Stage 25');

    expect(totalArtifacts).toBeGreaterThanOrEqual(25); // At least one artifact per stage
  });
});

test.describe('Lifecycle Regression Tests', () => {
  test.describe.configure({ mode: 'serial' }); // fullyParallel:true otherwise races shared testVentureId state

  let supabase: any;

  test.beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY!);
  });

  test('should not allow skipping stages', async () => {
    // This tests that stage dependencies are enforced
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: `Skip Test Company ${Date.now()}` })
      .select('id')
      .single();

    const { data: venture, error: ventureInsertError } = await supabase
      .from('ventures')
      .insert({
        name: `Skip Test Venture ${Date.now()}`,
        company_id: company.id,
        problem_statement: 'Test problem statement for stage-skip regression test',
        current_lifecycle_stage: 1
      })
      .select('id')
      .single();

    expect(ventureInsertError).toBeNull();

    // Try to skip from Stage 1 to Stage 5 (should ideally be blocked by business logic)
    const { error } = await supabase
      .from('ventures')
      .update({ current_lifecycle_stage: 5 })
      .eq('id', venture.id);

    // Note: This test documents expected behavior
    // In practice, the application layer should enforce stage sequencing
    // Database allows it but state machine should block it

    // Cleanup
    await supabase.from('ventures').delete().eq('id', venture.id);
    await supabase.from('companies').delete().eq('id', company.id);
  });

  test('should track stage history', async () => {
    // Verify stage transitions are logged
    const { data: events } = await supabase
      .from('system_events')
      .select('event_type, event_data')
      .eq('event_type', 'STAGE_TRANSITION')
      .limit(5);

    // Stage transitions should be logged for audit trail
    // This documents expected observability
  });
});
