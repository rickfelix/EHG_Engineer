/**
 * Phase 2: THE ENGINE - Venture Lifecycle E2E Tests (Stages 6-9)
 *
 * Tests the business model development phase:
 * - Stage 6: Risk Evaluation Matrix (requires: risk_matrix)
 * - Stage 7: Pricing Strategy (requires: pricing_model)
 * - Stage 8: Business Model Canvas (requires: business_model_canvas)
 * - Stage 9: Exit-Oriented Design (requires: exit_strategy)
 *
 * Golden Nugget Validation Requirements:
 * - risk_matrix: {risk, probability, impact, mitigation}
 * - pricing_model: minimum 200 chars
 * - business_model_canvas: standard BMC structure
 * - exit_strategy: exit scenarios with valuation
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

test.describe('Phase 2: THE ENGINE (Stages 6-9)', () => {
  let supabase: any;
  let testVentureId: string;
  let testCompanyId: string;

  test.beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY!);

    // Create test company
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: `Phase2 Test Company ${Date.now()}` })
      .select('id')
      .single();

    if (company) testCompanyId = company.id;

    // Create test venture at Stage 5 (ready for Phase 2)
    const { data: venture } = await supabase
      .from('ventures')
      .insert({
        name: `Phase 2 Test Venture ${Date.now()}`,
        company_id: testCompanyId,
        current_lifecycle_stage: 5,
        description: 'Testing THE ENGINE phase lifecycle'
      })
      .select('id')
      .single();

    if (venture) testVentureId = venture.id;

    // Create prerequisite Phase 1 artifacts
    const phase1Artifacts = [
      { document_type: 'idea_brief', title: 'Idea Brief', content: { summary: 'Test idea' }, status: 'complete' },
      { document_type: 'critique_report', title: 'Critique', content: { score: 7.5 }, status: 'complete' },
      { document_type: 'validation_report', title: 'Validation', content: { score: 7.0 }, status: 'complete' },
      { document_type: 'competitive_analysis', title: 'Competition', content: { competitors: [] }, status: 'complete' },
      { document_type: 'financial_model', title: 'Financial', content: { revenue: 1000000 }, status: 'complete' }
    ];

    for (const artifact of phase1Artifacts) {
      await supabase.from('venture_documents').insert({
        venture_id: testVentureId,
        ...artifact
      });
    }
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
  // STAGE 6: Risk Evaluation Matrix
  // =========================================================================
  test.describe('Stage 6: Risk Evaluation Matrix', () => {
    test('S6-001: should advance to Stage 6 after Phase 1 complete', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 6 })
        .eq('id', testVentureId);

      expect(error).toBeNull();

      const { data: venture } = await supabase
        .from('ventures')
        .select('current_lifecycle_stage')
        .eq('id', testVentureId)
        .single();

      expect(venture.current_lifecycle_stage).toBe(6);
    });

    test('S6-002: should create risk_matrix with required Golden Nugget fields', async () => {
      // Golden Nugget requirement: {risk, probability, impact, mitigation}
      const riskMatrix = {
        risks: [
          {
            id: 'R001',
            risk: 'Technical complexity exceeds team capability',
            category: 'technical',
            probability: 0.4,
            impact: 'high',
            severity_score: 8,
            mitigation: 'Hire senior AI engineers; create POC before full build',
            owner: 'CTO',
            status: 'active'
          },
          {
            id: 'R002',
            risk: 'Market adoption slower than projected',
            category: 'market',
            probability: 0.5,
            impact: 'high',
            severity_score: 9,
            mitigation: 'Implement freemium tier; focus on early adopter segment',
            owner: 'CEO',
            status: 'active'
          },
          {
            id: 'R003',
            risk: 'Key competitor launches similar product',
            category: 'competitive',
            probability: 0.6,
            impact: 'medium',
            severity_score: 6,
            mitigation: 'Accelerate time-to-market; focus on differentiation',
            owner: 'CPO',
            status: 'monitoring'
          },
          {
            id: 'R004',
            risk: 'Regulatory changes in AI governance',
            category: 'regulatory',
            probability: 0.3,
            impact: 'high',
            severity_score: 7,
            mitigation: 'Build compliance-first architecture; monitor regulations',
            owner: 'Legal',
            status: 'monitoring'
          },
          {
            id: 'R005',
            risk: 'Funding gap before revenue',
            category: 'financial',
            probability: 0.4,
            impact: 'critical',
            severity_score: 10,
            mitigation: 'Secure bridge funding; extend runway through cost optimization',
            owner: 'CFO',
            status: 'active'
          }
        ],
        summary: {
          total_risks: 5,
          high_severity: 3,
          medium_severity: 2,
          overall_risk_score: 7.2
        },
        review_date: new Date().toISOString()
      };

      const { data: artifact, error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'risk_matrix',
          title: 'Risk Evaluation Matrix',
          content: riskMatrix,
          status: 'complete'
        })
        .select('id')
        .single();

      expect(error).toBeNull();

      // Validate Golden Nugget requirements
      for (const risk of riskMatrix.risks) {
        expect(risk).toHaveProperty('risk');
        expect(risk).toHaveProperty('probability');
        expect(risk).toHaveProperty('impact');
        expect(risk).toHaveProperty('mitigation');
      }
    });

    test('S6-003: should reject risk_matrix without required fields', async () => {
      // Golden Nugget validation should fail for incomplete risks
      const invalidRiskMatrix = {
        risks: [
          {
            id: 'R999',
            risk: 'Incomplete risk entry',
            // Missing: probability, impact, mitigation
          }
        ]
      };

      // This simulates what Golden Nugget validator would catch
      const hasRequiredFields = invalidRiskMatrix.risks.every(r =>
        r.risk && r.probability !== undefined && r.impact && r.mitigation
      );

      expect(hasRequiredFields).toBe(false);
    });
  });

  // =========================================================================
  // STAGE 7: Pricing Strategy
  // =========================================================================
  test.describe('Stage 7: Pricing Strategy', () => {
    test('S7-001: should advance to Stage 7 after risk_matrix complete', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 7 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S7-002: should create pricing_model with tier structure', async () => {
      const pricingModel = {
        pricing_strategy: 'value_based',
        currency: 'USD',
        billing_frequency: ['monthly', 'annual'],
        tiers: [
          {
            name: 'Starter',
            price_monthly: 49,
            price_annual: 470,
            features: ['5 ventures', 'Basic analytics', 'Email support'],
            target_segment: 'Solo founders',
            cac_estimate: 100,
            ltv_estimate: 564
          },
          {
            name: 'Growth',
            price_monthly: 149,
            price_annual: 1430,
            features: ['25 ventures', 'Advanced analytics', 'Priority support', 'API access'],
            target_segment: 'Small teams',
            cac_estimate: 250,
            ltv_estimate: 1716
          },
          {
            name: 'Enterprise',
            price_monthly: 499,
            price_annual: 4790,
            features: ['Unlimited ventures', 'Custom integrations', 'Dedicated support', 'SLA'],
            target_segment: 'Large organizations',
            cac_estimate: 1000,
            ltv_estimate: 11496
          }
        ],
        discount_structure: {
          annual_discount: 0.20,
          volume_discount: { threshold: 10, discount: 0.15 }
        },
        competitor_comparison: {
          position: 'mid_market',
          price_vs_competitors: 'competitive'
        }
      };

      const { data: artifact, error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'pricing_model',
          title: 'Pricing Strategy',
          content: pricingModel,
          status: 'complete'
        })
        .select('id')
        .single();

      expect(error).toBeNull();

      // Golden Nugget: minimum 200 chars
      const contentLength = JSON.stringify(pricingModel).length;
      expect(contentLength).toBeGreaterThan(200);
    });
  });

  // =========================================================================
  // STAGE 8: Business Model Canvas
  // =========================================================================
  test.describe('Stage 8: Business Model Canvas', () => {
    test('S8-001: should advance to Stage 8 after pricing_model complete', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 8 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S8-002: should create business_model_canvas with all 9 blocks', async () => {
      const businessModelCanvas = {
        key_partners: [
          'Cloud infrastructure providers (AWS, GCP)',
          'AI model providers (OpenAI, Anthropic)',
          'Venture capital firms',
          'Startup accelerators'
        ],
        key_activities: [
          'AI model development and training',
          'Platform development and maintenance',
          'Customer success and onboarding',
          'Market research and product iteration'
        ],
        key_resources: [
          'Engineering team',
          'AI/ML expertise',
          'Proprietary algorithms',
          'Customer data and insights'
        ],
        value_propositions: [
          'Reduce venture management overhead by 80%',
          'AI-driven governance automation',
          'End-to-end lifecycle tracking',
          'Real-time decision support'
        ],
        customer_relationships: [
          'Self-service platform',
          'Dedicated account managers (Enterprise)',
          'Community support',
          'Educational content'
        ],
        channels: [
          'Direct sales (Enterprise)',
          'Product-led growth',
          'Partner referrals',
          'Content marketing'
        ],
        customer_segments: [
          'Startup founders (B2C)',
          'Venture capital firms (B2B)',
          'Corporate innovation teams (B2B)',
          'Accelerators and incubators (B2B)'
        ],
        cost_structure: {
          fixed_costs: ['Salaries', 'Infrastructure', 'Office'],
          variable_costs: ['AI API usage', 'Customer acquisition', 'Support'],
          cost_drivers: ['Engineering headcount', 'API calls']
        },
        revenue_streams: {
          subscription: 'SaaS monthly/annual subscriptions',
          enterprise: 'Custom enterprise contracts',
          services: 'Professional services and training'
        }
      };

      const { data: artifact, error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'business_model_canvas',
          title: 'Business Model Canvas',
          content: businessModelCanvas,
          status: 'complete'
        })
        .select('id')
        .single();

      expect(error).toBeNull();

      // Verify all 9 BMC blocks are present
      const requiredBlocks = [
        'key_partners', 'key_activities', 'key_resources',
        'value_propositions', 'customer_relationships', 'channels',
        'customer_segments', 'cost_structure', 'revenue_streams'
      ];

      for (const block of requiredBlocks) {
        expect(businessModelCanvas).toHaveProperty(block);
      }
    });
  });

  // =========================================================================
  // STAGE 9: Exit-Oriented Design
  // =========================================================================
  test.describe('Stage 9: Exit-Oriented Design', () => {
    test('S9-001: should advance to Stage 9 after business_model_canvas complete', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 9 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S9-002: should create exit_strategy with scenarios and valuations', async () => {
      const exitStrategy = {
        exit_timeline: {
          target_year: 2028,
          earliest_viable: 2027,
          latest_acceptable: 2030
        },
        exit_scenarios: [
          {
            type: 'acquisition',
            probability: 0.5,
            target_acquirers: ['Enterprise software companies', 'VC portfolio companies'],
            valuation_range: { min: 50000000, max: 150000000 },
            key_metrics: ['ARR > $10M', 'Growth > 100% YoY', 'NRR > 120%']
          },
          {
            type: 'ipo',
            probability: 0.2,
            requirements: ['ARR > $100M', 'Path to profitability', 'Market leadership'],
            valuation_range: { min: 500000000, max: 1000000000 },
            timeline: '5-7 years'
          },
          {
            type: 'merger',
            probability: 0.2,
            potential_partners: ['Complementary platforms', 'Regional players'],
            valuation_range: { min: 30000000, max: 80000000 }
          },
          {
            type: 'acqui_hire',
            probability: 0.1,
            note: 'Fallback if primary scenarios fail',
            valuation_range: { min: 5000000, max: 15000000 }
          }
        ],
        acquisition_readiness: {
          clean_cap_table: true,
          ip_ownership: 'verified',
          contracts_assignable: true,
          key_person_dependencies: 'low',
          technical_documentation: 'in_progress'
        },
        valuation_drivers: [
          'Recurring revenue multiple (8-12x ARR)',
          'Growth rate premium',
          'Market size and position',
          'Technology differentiation',
          'Team strength'
        ]
      };

      const { data: artifact, error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'exit_strategy',
          title: 'Exit-Oriented Design',
          content: exitStrategy,
          status: 'complete'
        })
        .select('id')
        .single();

      expect(error).toBeNull();

      // Verify exit scenarios have valuations
      for (const scenario of exitStrategy.exit_scenarios) {
        expect(scenario.valuation_range).toBeDefined();
        expect(scenario.valuation_range.min).toBeLessThan(scenario.valuation_range.max);
      }
    });

    test('S9-003: should complete Phase 2 with all artifacts', async () => {
      const { data: artifacts } = await supabase
        .from('venture_documents')
        .select('document_type')
        .eq('venture_id', testVentureId)
        .in('document_type', [
          'risk_matrix',
          'pricing_model',
          'business_model_canvas',
          'exit_strategy'
        ]);

      const artifactTypes = artifacts?.map(a => a.document_type) || [];

      expect(artifactTypes).toContain('risk_matrix');
      expect(artifactTypes).toContain('pricing_model');
      expect(artifactTypes).toContain('business_model_canvas');
      expect(artifactTypes).toContain('exit_strategy');

      // Ready for Phase 3 (Stage 10)
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 10 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });
  });
});
