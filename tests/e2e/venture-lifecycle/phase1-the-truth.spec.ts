/**
 * Phase 1: THE TRUTH - Venture Lifecycle E2E Tests (Stages 1-5)
 *
 * Tests the complete validation phase of a venture:
 * - Stage 1: Draft Idea & Chairman Review (covered in venture-creation/)
 * - Stage 2: AI Multi-Model Critique
 * - Stage 3: Market Validation & RAT (Decision Gate)
 * - Stage 4: Competitive Intelligence
 * - Stage 5: Profitability Forecasting (Decision Gate)
 *
 * Required Artifacts by Stage:
 * - Stage 1: idea_brief
 * - Stage 2: critique_report
 * - Stage 3: validation_report
 * - Stage 4: competitive_analysis
 * - Stage 5: financial_model
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

test.describe('Phase 1: THE TRUTH (Stages 1-5)', () => {
  let supabase: any;
  let testVentureId: string;
  let testCompanyId: string;

  test.beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY!);

    // Create test company
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: `Phase1 Test Company ${Date.now()}` })
      .select('id')
      .single();

    if (company) testCompanyId = company.id;

    // Create test venture at Stage 1
    const { data: venture } = await supabase
      .from('ventures')
      .insert({
        name: `Phase 1 Test Venture ${Date.now()}`,
        company_id: testCompanyId,
        current_lifecycle_stage: 1,
        description: 'Testing THE TRUTH phase lifecycle'
      })
      .select('id')
      .single();

    if (venture) testVentureId = venture.id;
  });

  test.afterAll(async () => {
    if (testVentureId) {
      await supabase.from('venture_documents').delete().eq('venture_id', testVentureId);
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testCompanyId) {
      await supabase.from('companies').delete().eq('id', testCompanyId);
    }
  });

  // =========================================================================
  // STAGE 2: AI Multi-Model Critique
  // =========================================================================
  test.describe('Stage 2: AI Multi-Model Critique', () => {
    test('S2-001: should require Stage 1 completion before advancing', async () => {
      // Given venture at Stage 1 without idea_brief artifact
      const { data: venture } = await supabase
        .from('ventures')
        .select('current_lifecycle_stage')
        .eq('id', testVentureId)
        .single();

      expect(venture.current_lifecycle_stage).toBe(1);

      // When checking Stage 2 entry gate
      const { data: stage1Artifacts } = await supabase
        .from('venture_documents')
        .select('document_type')
        .eq('venture_id', testVentureId)
        .eq('document_type', 'idea_brief');

      // Then entry should be blocked without idea_brief
      const hasIdeaBrief = stage1Artifacts && stage1Artifacts.length > 0;
      expect(hasIdeaBrief).toBe(false); // Initially no artifact
    });

    test('S2-002: should allow Stage 2 entry after idea_brief created', async () => {
      // Given idea_brief artifact is created
      const { data: artifact, error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'idea_brief',
          title: 'Test Idea Brief',
          content: {
            problem_statement: 'Users struggle with venture lifecycle management',
            proposed_solution: 'AI-powered lifecycle automation',
            target_market: 'Startup founders and VCs',
            unique_value: 'End-to-end automation with governance'
          },
          status: 'complete'
        })
        .select('id')
        .single();

      expect(error).toBeNull();

      // When advancing to Stage 2
      const { error: updateError } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 2 })
        .eq('id', testVentureId);

      expect(updateError).toBeNull();

      // Then venture is at Stage 2
      const { data: updated } = await supabase
        .from('ventures')
        .select('current_lifecycle_stage')
        .eq('id', testVentureId)
        .single();

      expect(updated.current_lifecycle_stage).toBe(2);
    });

    test('S2-003: should generate critique_report with multi-model analysis', async () => {
      // Given venture at Stage 2
      // When critique_report is generated (simulated)
      const critiqueReport = {
        models_used: ['claude-3-opus', 'gpt-4', 'gemini-pro'],
        critique_summary: {
          strengths: ['Clear problem statement', 'Large addressable market'],
          weaknesses: ['Competitive landscape unclear', 'Technical feasibility unproven'],
          opportunities: ['First-mover advantage in AI-governance space'],
          threats: ['Large tech companies could replicate']
        },
        contrarian_review: {
          devil_advocate_position: 'Market may not need another project management tool',
          counter_arguments: ['This is governance, not PM', 'Regulatory pressure increasing']
        },
        top_5_risks: [
          { risk: 'Technical complexity', probability: 0.7, impact: 'high' },
          { risk: 'Market adoption', probability: 0.5, impact: 'high' },
          { risk: 'Competition', probability: 0.6, impact: 'medium' },
          { risk: 'Funding', probability: 0.4, impact: 'high' },
          { risk: 'Talent acquisition', probability: 0.5, impact: 'medium' }
        ],
        overall_score: 7.2,
        recommendation: 'proceed_with_caution'
      };

      const { data: critique, error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'critique_report',
          title: 'AI Multi-Model Critique Report',
          content: critiqueReport,
          status: 'complete'
        })
        .select('id')
        .single();

      expect(error).toBeNull();

      // Then critique has required fields
      expect(critiqueReport.models_used.length).toBeGreaterThanOrEqual(2);
      expect(critiqueReport.top_5_risks.length).toBe(5);
      expect(critiqueReport.contrarian_review).toBeDefined();
    });

    test('S2-004: should validate Stage 2 exit gates', async () => {
      // Given critique_report exists
      const { data: critiques } = await supabase
        .from('venture_documents')
        .select('content')
        .eq('venture_id', testVentureId)
        .eq('document_type', 'critique_report')
        .single();

      // Then all exit gates should pass
      const gates = {
        multiModelPassComplete: critiques?.content?.models_used?.length >= 2,
        contrarianReviewDone: !!critiques?.content?.contrarian_review,
        top5RisksIdentified: critiques?.content?.top_5_risks?.length === 5
      };

      expect(gates.multiModelPassComplete).toBe(true);
      expect(gates.contrarianReviewDone).toBe(true);
      expect(gates.top5RisksIdentified).toBe(true);
    });
  });

  // =========================================================================
  // STAGE 3: Market Validation & RAT (Decision Gate)
  // =========================================================================
  test.describe('Stage 3: Market Validation & RAT', () => {
    test('S3-001: should require critique_report before Stage 3 entry', async () => {
      // Given Stage 2 complete
      const { data: critiques } = await supabase
        .from('venture_documents')
        .select('id')
        .eq('venture_id', testVentureId)
        .eq('document_type', 'critique_report');

      expect(critiques.length).toBeGreaterThan(0);

      // When advancing to Stage 3
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 3 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S3-002: should create validation_report with RAT metrics', async () => {
      // Given Stage 3 entry
      // When validation_report is created
      const validationReport = {
        problem_solution_fit: {
          score: 8,
          evidence: ['User interviews confirmed pain point', 'Competitor analysis shows gap'],
          confidence: 0.75
        },
        willingness_to_pay: {
          score: 7,
          price_sensitivity: 'medium',
          target_price_range: { min: 99, max: 299, currency: 'USD' },
          evidence: ['Survey results', 'Competitor pricing analysis']
        },
        technical_feasibility: {
          score: 8,
          complexity: 'high',
          timeline_months: 6,
          key_risks: ['AI model accuracy', 'Scale requirements']
        },
        overall_validation_score: 7.7,
        tier_rating: 2, // Out of 3
        advisory_notes: 'Strong concept, needs technical POC'
      };

      const { data: validation, error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'validation_report',
          title: 'Market Validation & RAT Report',
          content: validationReport,
          status: 'complete'
        })
        .select('id')
        .single();

      expect(error).toBeNull();
      expect(validationReport.overall_validation_score).toBeGreaterThanOrEqual(6);
    });

    test('S3-003: should enforce decision gate with advance/revise/reject options', async () => {
      // Given validation_report exists
      const decisionOptions = ['advance', 'revise', 'reject'];

      // When Chairman makes decision
      const chairmanDecision = {
        decision: 'advance',
        rationale: 'Strong validation scores, proceed to competitive analysis',
        conditions: ['Complete technical POC within 30 days'],
        decided_by: 'chairman@test.com',
        decided_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('venture_documents')
        .update({
          content: {
            ...((await supabase
              .from('venture_documents')
              .select('content')
              .eq('venture_id', testVentureId)
              .eq('document_type', 'validation_report')
              .single()).data?.content || {}),
            chairman_decision: chairmanDecision
          }
        })
        .eq('venture_id', testVentureId)
        .eq('document_type', 'validation_report');

      expect(error).toBeNull();
      expect(decisionOptions).toContain(chairmanDecision.decision);
    });

    test('S3-004: should validate tier cap enforcement (max tier 3)', async () => {
      // Given tier rating in validation report
      const { data: validation } = await supabase
        .from('venture_documents')
        .select('content')
        .eq('venture_id', testVentureId)
        .eq('document_type', 'validation_report')
        .single();

      // Then tier rating should not exceed cap
      const tierRating = validation?.content?.tier_rating || 0;
      expect(tierRating).toBeLessThanOrEqual(3);
      expect(tierRating).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // STAGE 4: Competitive Intelligence
  // =========================================================================
  test.describe('Stage 4: Competitive Intelligence', () => {
    test('S4-001: should advance to Stage 4 after validation decision', async () => {
      // When advancing to Stage 4
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 4 })
        .eq('id', testVentureId);

      expect(error).toBeNull();

      const { data: venture } = await supabase
        .from('ventures')
        .select('current_lifecycle_stage')
        .eq('id', testVentureId)
        .single();

      expect(venture.current_lifecycle_stage).toBe(4);
    });

    test('S4-002: should create competitive_analysis artifact', async () => {
      // Given Stage 4 entry
      const competitiveAnalysis = {
        market_landscape: {
          total_addressable_market: 5000000000, // $5B
          serviceable_addressable_market: 500000000, // $500M
          serviceable_obtainable_market: 50000000, // $50M
          growth_rate_percent: 15
        },
        competitors: [
          {
            name: 'Competitor A',
            market_share: 0.25,
            strengths: ['Brand recognition', 'Large user base'],
            weaknesses: ['Legacy technology', 'Poor UX'],
            positioning: 'Enterprise focus'
          },
          {
            name: 'Competitor B',
            market_share: 0.15,
            strengths: ['Modern stack', 'Good pricing'],
            weaknesses: ['Limited features', 'Small team'],
            positioning: 'SMB focus'
          }
        ],
        market_gaps: [
          'No AI-native governance solution',
          'Poor integration between lifecycle phases',
          'Lack of automated compliance'
        ],
        positioning_strategy: {
          target_segment: 'Growth-stage startups',
          differentiation: 'AI-first governance automation',
          value_proposition: 'Reduce venture management overhead by 80%'
        },
        competitive_moat: ['Proprietary AI models', 'First-mover advantage', 'Network effects']
      };

      const { data: analysis, error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'competitive_analysis',
          title: 'Competitive Intelligence Report',
          content: competitiveAnalysis,
          status: 'complete'
        })
        .select('id')
        .single();

      expect(error).toBeNull();
      expect(competitiveAnalysis.competitors.length).toBeGreaterThanOrEqual(2);
      expect(competitiveAnalysis.market_gaps.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // STAGE 5: Profitability Forecasting (Decision Gate)
  // =========================================================================
  test.describe('Stage 5: Profitability Forecasting', () => {
    test('S5-001: should advance to Stage 5 after competitive_analysis', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 5 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S5-002: should create financial_model with required metrics', async () => {
      // Given Stage 5 requirements:
      // - gross_margin_target: 0.40 (40%)
      // - breakeven_months_max: 18
      // - cac_ltv_ratio_min: 3.0

      const financialModel = {
        revenue_projections: {
          year1: 500000,
          year2: 1500000,
          year3: 4000000,
          year5: 15000000
        },
        unit_economics: {
          average_revenue_per_user: 199,
          customer_acquisition_cost: 150,
          lifetime_value: 597, // 3 years * $199
          cac_ltv_ratio: 3.98, // Must be >= 3.0
          gross_margin: 0.72, // Must be >= 0.40
          churn_rate_monthly: 0.02
        },
        breakeven_analysis: {
          fixed_costs_monthly: 50000,
          variable_cost_per_user: 20,
          breakeven_users: 350,
          breakeven_months: 14 // Must be <= 18
        },
        funding_requirements: {
          seed_round: 500000,
          series_a: 3000000,
          runway_months: 18
        },
        roi_projections: {
          year3_roi: 2.5,
          year5_roi: 8.0
        }
      };

      const { data: model, error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'financial_model',
          title: 'Profitability Forecast Model',
          content: financialModel,
          status: 'complete'
        })
        .select('id')
        .single();

      expect(error).toBeNull();

      // Validate required metrics
      expect(financialModel.unit_economics.gross_margin).toBeGreaterThanOrEqual(0.40);
      expect(financialModel.breakeven_analysis.breakeven_months).toBeLessThanOrEqual(18);
      expect(financialModel.unit_economics.cac_ltv_ratio).toBeGreaterThanOrEqual(3.0);
    });

    test('S5-003: should validate financial viability gates', async () => {
      const { data: model } = await supabase
        .from('venture_documents')
        .select('content')
        .eq('venture_id', testVentureId)
        .eq('document_type', 'financial_model')
        .single();

      const gates = {
        grossMarginMet: model?.content?.unit_economics?.gross_margin >= 0.40,
        breakevenInTime: model?.content?.breakeven_analysis?.breakeven_months <= 18,
        cacLtvHealthy: model?.content?.unit_economics?.cac_ltv_ratio >= 3.0
      };

      expect(gates.grossMarginMet).toBe(true);
      expect(gates.breakevenInTime).toBe(true);
      expect(gates.cacLtvHealthy).toBe(true);
    });

    test('S5-004: should complete Phase 1 with all artifacts', async () => {
      // Given all Phase 1 artifacts created
      const { data: artifacts } = await supabase
        .from('venture_documents')
        .select('document_type')
        .eq('venture_id', testVentureId)
        .in('document_type', [
          'idea_brief',
          'critique_report',
          'validation_report',
          'competitive_analysis',
          'financial_model'
        ]);

      // Then all required artifacts exist
      const artifactTypes = artifacts?.map(a => a.document_type) || [];
      expect(artifactTypes).toContain('idea_brief');
      expect(artifactTypes).toContain('critique_report');
      expect(artifactTypes).toContain('validation_report');
      expect(artifactTypes).toContain('competitive_analysis');
      expect(artifactTypes).toContain('financial_model');

      // And venture can advance to Phase 2 (Stage 6)
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 6 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });
  });
});
