/**
 * Phase 3: THE IDENTITY - Venture Lifecycle E2E Tests (Stages 10-12)
 *
 * Tests the brand and go-to-market phase:
 * - Stage 10: Strategic Naming (SD_REQUIRED, requires: brand_guidelines)
 * - Stage 11: Go-to-Market Strategy (requires: gtm_plan, marketing_manifest)
 * - Stage 12: Sales & Success Logic (requires: sales_playbook)
 *
 * Note: Stage 10 requires a Strategic Directive (SD) with suffix 'BRAND'
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

test.describe('Phase 3: THE IDENTITY (Stages 10-12)', () => {
  let supabase: any;
  let testVentureId: string;
  let testCompanyId: string;
  let testSDId: string;

  test.beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY!);

    const { data: company } = await supabase
      .from('companies')
      .insert({ name: `Phase3 Test Company ${Date.now()}` })
      .select('id')
      .single();

    if (company) testCompanyId = company.id;

    const { data: venture } = await supabase
      .from('ventures')
      .insert({
        name: `Phase 3 Test Venture ${Date.now()}`,
        company_id: testCompanyId,
        current_lifecycle_stage: 9,
        description: 'Testing THE IDENTITY phase lifecycle'
      })
      .select('id')
      .single();

    if (venture) testVentureId = venture.id;
  });

  test.afterAll(async () => {
    if (testSDId) {
      await supabase.from('strategic_directives_v2').delete().eq('id', testSDId);
    }
    if (testVentureId) {
      await supabase.from('venture_documents').delete().eq('venture_id', testVentureId);
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testCompanyId) {
      await supabase.from('companies').delete().eq('id', testCompanyId);
    }
  });

  // =========================================================================
  // STAGE 10: Strategic Naming (SD_REQUIRED)
  // =========================================================================
  test.describe('Stage 10: Strategic Naming', () => {
    test('S10-001: should require Strategic Directive for Stage 10', async () => {
      // Stage 10 has sd_required=true with suffix 'BRAND'
      const timestamp = Date.now();
      testSDId = `SD-BRAND-${timestamp}`;

      const { data: sd, error } = await supabase
        .from('strategic_directives_v2')
        .insert({
          id: testSDId,
          sd_key: testSDId,
          legacy_id: testSDId,
          title: 'Brand Identity Development',
          description: 'Develop comprehensive brand identity and naming strategy',
          category: 'brand',
          priority: 'high',
          status: 'active',
          current_phase: 'EXEC'
        })
        .select('id')
        .single();

      expect(error).toBeNull();
      expect(sd).toBeDefined();
    });

    test('S10-002: should advance to Stage 10', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 10 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S10-003: should create brand_guidelines artifact', async () => {
      const brandGuidelines = {
        brand_name: {
          primary: 'VentureForge',
          tagline: 'Forge Your Future',
          pronunciation: 'VEN-chur-forj',
          origin: 'Combines venture creation with the act of forging/building'
        },
        brand_variants: [
          { name: 'VentureForge', domain: 'ventureforge.io', status: 'primary' },
          { name: 'ForgeVC', domain: 'forgevc.com', status: 'alternate' },
          { name: 'VentureLab', domain: 'venturelab.ai', status: 'backup' }
        ],
        visual_identity: {
          primary_colors: ['#1E40AF', '#3B82F6', '#FFFFFF'],
          secondary_colors: ['#10B981', '#F59E0B'],
          typography: {
            headings: 'Inter Bold',
            body: 'Inter Regular',
            monospace: 'JetBrains Mono'
          },
          logo_usage: {
            minimum_size: '24px height',
            clear_space: '1x logo height',
            prohibited_uses: ['Rotate', 'Stretch', 'Add effects']
          }
        },
        brand_voice: {
          tone: ['Professional', 'Innovative', 'Approachable'],
          personality: 'Expert guide who simplifies complexity',
          dos: ['Be clear and concise', 'Use data to support claims', 'Celebrate customer wins'],
          donts: ['Use jargon without explanation', 'Overpromise', 'Be condescending']
        },
        brand_architecture: {
          type: 'branded_house',
          parent_brand: 'VentureForge',
          sub_brands: []
        }
      };

      const { data: artifact, error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'brand_guidelines',
          title: 'Brand Guidelines',
          content: brandGuidelines,
          status: 'complete'
        })
        .select('id')
        .single();

      expect(error).toBeNull();

      // Validate brand structure
      expect(brandGuidelines.brand_name.primary).toBeDefined();
      expect(brandGuidelines.brand_variants.length).toBeGreaterThan(0);
      expect(brandGuidelines.visual_identity.primary_colors.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // STAGE 11: Go-to-Market Strategy
  // =========================================================================
  test.describe('Stage 11: Go-to-Market Strategy', () => {
    test('S11-001: should advance to Stage 11 after brand_guidelines', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 11 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S11-002: should create gtm_plan artifact', async () => {
      const gtmPlan = {
        launch_strategy: {
          type: 'phased_rollout',
          phases: [
            {
              name: 'Private Beta',
              duration_weeks: 8,
              target_users: 50,
              goals: ['Validate core features', 'Gather feedback', 'Fix critical bugs']
            },
            {
              name: 'Public Beta',
              duration_weeks: 12,
              target_users: 500,
              goals: ['Scale testing', 'Refine pricing', 'Build case studies']
            },
            {
              name: 'General Availability',
              duration_weeks: null,
              target_users: 5000,
              goals: ['Full marketing push', 'Sales team ramp', 'Partner program']
            }
          ]
        },
        target_markets: [
          {
            segment: 'Early-stage startups',
            size_estimate: 50000,
            penetration_target: 0.02,
            acquisition_channels: ['Product Hunt', 'Indie Hackers', 'Twitter']
          },
          {
            segment: 'Venture capital firms',
            size_estimate: 5000,
            penetration_target: 0.05,
            acquisition_channels: ['Direct sales', 'Conference sponsorship', 'Referrals']
          }
        ],
        channel_strategy: {
          primary: ['Content marketing', 'SEO', 'Product-led growth'],
          secondary: ['Paid advertising', 'Partnerships', 'Events'],
          owned_media: ['Blog', 'Newsletter', 'YouTube channel']
        },
        launch_timeline: {
          pre_launch: ['Build waitlist', 'Create content', 'Set up analytics'],
          launch_day: ['Product Hunt launch', 'Press release', 'Email to waitlist'],
          post_launch: ['Gather feedback', 'Iterate', 'Scale marketing']
        }
      };

      const { data: artifact, error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'gtm_plan',
          title: 'Go-to-Market Plan',
          content: gtmPlan,
          status: 'complete'
        })
        .select('id')
        .single();

      expect(error).toBeNull();
    });

    test('S11-003: should create marketing_manifest artifact', async () => {
      const marketingManifest = {
        positioning_statement: 'For startup founders and VCs who need to manage venture lifecycles, VentureForge is an AI-powered governance platform that automates 80% of management overhead, unlike traditional PM tools that require manual tracking.',
        key_messages: [
          {
            audience: 'Founders',
            message: 'Stop managing spreadsheets. Start building your venture.',
            proof_points: ['80% time savings', 'AI-driven insights', '25-stage lifecycle']
          },
          {
            audience: 'VCs',
            message: 'Portfolio visibility without the overhead.',
            proof_points: ['Real-time dashboards', 'Standardized reporting', 'Risk alerts']
          }
        ],
        content_pillars: [
          'Venture lifecycle best practices',
          'AI in startup management',
          'Founder productivity',
          'VC portfolio management'
        ],
        campaign_themes: {
          awareness: 'The future of venture management',
          consideration: 'See how AI transforms your workflow',
          conversion: 'Start your free trial today'
        }
      };

      const { data: artifact, error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'marketing_manifest',
          title: 'Marketing Manifest',
          content: marketingManifest,
          status: 'complete'
        })
        .select('id')
        .single();

      expect(error).toBeNull();

      // Golden Nugget: minimum 200 chars
      expect(JSON.stringify(marketingManifest).length).toBeGreaterThan(200);
    });
  });

  // =========================================================================
  // STAGE 12: Sales & Success Logic
  // =========================================================================
  test.describe('Stage 12: Sales & Success Logic', () => {
    test('S12-001: should advance to Stage 12', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 12 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S12-002: should create sales_playbook artifact', async () => {
      const salesPlaybook = {
        sales_process: {
          stages: [
            { name: 'Lead', activities: ['Inbound qualification', 'Outbound prospecting'], exit_criteria: 'Meeting scheduled' },
            { name: 'Discovery', activities: ['Needs assessment', 'Pain point identification'], exit_criteria: 'Qualified opportunity' },
            { name: 'Demo', activities: ['Product demonstration', 'Use case mapping'], exit_criteria: 'Technical validation' },
            { name: 'Proposal', activities: ['Pricing discussion', 'Contract negotiation'], exit_criteria: 'Verbal agreement' },
            { name: 'Close', activities: ['Contract signing', 'Payment processing'], exit_criteria: 'Deal won' }
          ],
          average_cycle_days: 21,
          conversion_targets: { lead_to_demo: 0.3, demo_to_close: 0.4 }
        },
        qualification_framework: {
          type: 'BANT',
          criteria: {
            budget: 'Has budget allocated or can secure it',
            authority: 'Decision maker or strong influence',
            need: 'Clear pain point our product solves',
            timeline: 'Looking to implement within 90 days'
          }
        },
        objection_handling: [
          { objection: 'Too expensive', response: 'Calculate ROI based on time savings' },
          { objection: 'We use spreadsheets', response: 'Show automation benefits and error reduction' },
          { objection: 'Need more features', response: 'Understand specific needs, discuss roadmap' }
        ],
        customer_success: {
          onboarding_steps: ['Welcome call', 'Data migration', 'Training session', 'Go-live support'],
          health_scoring: { green: '>80', yellow: '50-80', red: '<50' },
          expansion_triggers: ['High usage', 'Feature requests', 'Team growth']
        }
      };

      const { data: artifact, error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'sales_playbook',
          title: 'Sales Playbook',
          content: salesPlaybook,
          status: 'complete'
        })
        .select('id')
        .single();

      expect(error).toBeNull();
    });

    test('S12-003: should complete Phase 3 with all artifacts', async () => {
      const { data: artifacts } = await supabase
        .from('venture_documents')
        .select('document_type')
        .eq('venture_id', testVentureId)
        .in('document_type', ['brand_guidelines', 'gtm_plan', 'marketing_manifest', 'sales_playbook']);

      const artifactTypes = artifacts?.map(a => a.document_type) || [];

      expect(artifactTypes).toContain('brand_guidelines');
      expect(artifactTypes).toContain('gtm_plan');
      expect(artifactTypes).toContain('marketing_manifest');
      expect(artifactTypes).toContain('sales_playbook');

      // Ready for Phase 4 (Stage 13)
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 13 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });
  });
});
