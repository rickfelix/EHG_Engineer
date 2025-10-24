#!/usr/bin/env node

/**
 * Create Strategic Directives for "Hidden Value" Discoveries
 *
 * Discovered during architectural audit - complete systems built but not surfaced to users:
 * 1. SD-CUSTOMER-INTEL-UI-001: Customer Intelligence UI (5 tables, zero UI)
 * 2. SD-CHAIRMAN-ANALYTICS-NAV-001: Chairman Analytics Navigation (built but hidden)
 * 3. SD-COMPETITIVE-INTEL-NAV-001: Competitive Intelligence Navigation (built but hidden)
 * 4. SD-GTM-INTEL-DISCOVERY-001: GTM Intelligence Discovery Enhancement
 *
 * Per LEO Protocol v4.2.0 - Database-first approach
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const strategicDirectives = [
  // SD 1: Customer Intelligence UI (Highest Priority)
  {
    id: 'SD-CUSTOMER-INTEL-UI-001',
    sd_key: 'CUSTOMER-INTEL-UI-001',
    title: 'Surface Hidden Customer Intelligence System',
    version: '1.0',
    status: 'draft',
    category: 'product_feature',
    priority: 'high',
    target_application: 'EHG',
    current_phase: 'IDEATION',

    description: 'Create UI layer for the complete customer intelligence system that exists in database but has zero user interface. Surface AI-generated customer personas, ICP scoring (0-100), 4-stage journey maps, and willingness-to-pay analysis. System is 100% built (5 tables, 796 LOC service layer) but completely hidden from users.',

    strategic_intent: 'Unlock massive hidden value by surfacing a complete customer intelligence infrastructure. Users currently cannot: (1) view AI-generated personas, (2) access ICP scores, (3) visualize customer journeys, (4) leverage WTP analysis. This is the largest "built but unused" discovery in the codebase.',

    rationale: 'Architectural audit revealed complete customer intelligence system with zero UI. Database schema exists (customer_personas, icp_profiles, customer_journeys, market_segments, willingness_to_pay), service layer fully implemented (customerIntelligence.ts, 796 LOC), AI analysis methods ready, but NO components display this data. This creates "dark matter" problem - valuable infrastructure users cannot access.',

    scope: 'Create 4 core UI components + integration into existing stages. Components: CustomerPersonasManager, ICPScoringDashboard, CustomerJourneyVisualizer, WillingnessToPayAnalysis. Integration: Stage 3 (view personas), Stage 15 (WTP analysis), Stage 17 (journey maps), new standalone page (/customer-intelligence). Estimated: 400-600 LOC across 6 files.',

    strategic_objectives: [
      'Create CustomerPersonasManager component - view/edit AI-generated personas',
      'Create ICPScoringDashboard - display 0-100 ICP scores with category breakdowns',
      'Create CustomerJourneyVisualizer - 4-stage journey visualization (awareness→consideration→decision→retention)',
      'Create WillingnessToPayAnalysis - pricing intelligence display',
      'Integrate "View Customer Intelligence" button into Stage 3',
      'Embed WTP analysis widget into Stage 15 (Pricing Strategy)',
      'Embed journey map widget into Stage 17 (GTM Strategy)',
      'Create standalone page at /customer-intelligence',
      'Add navigation link in Intelligence section'
    ],

    success_criteria: [
      'Users can view all AI-generated personas for a venture',
      'ICP score (0-100) displays with category breakdown rationales',
      'Customer journey visualizes all 4 stages with touchpoints',
      'WTP analysis shows pricing recommendations with confidence scores',
      'Stage 3 "View Intelligence" button navigates to personas',
      'Stage 15 displays WTP data inline (no navigation required)',
      'Stage 17 displays journey map inline',
      '/customer-intelligence page accessible from main navigation',
      'Zero data loss - all existing DB data displays correctly'
    ],

    key_changes: [
      'Create src/components/customer-intelligence/CustomerPersonasManager.tsx (~150 LOC)',
      'Create src/components/customer-intelligence/ICPScoringDashboard.tsx (~120 LOC)',
      'Create src/components/customer-intelligence/CustomerJourneyVisualizer.tsx (~130 LOC)',
      'Create src/components/customer-intelligence/WillingnessToPayAnalysis.tsx (~100 LOC)',
      'Modify Stage3ComprehensiveValidation.tsx: add "View Intelligence" button (+20 LOC)',
      'Modify Stage15PricingStrategy: embed WTP widget (+30 LOC)',
      'Modify Stage17GTMStrategy: embed journey map widget (+30 LOC)',
      'Create src/pages/CustomerIntelligencePage.tsx (~50 LOC)',
      'Update ModernNavigationSidebar: add /customer-intelligence link (+5 LOC)',
      'Create tests/e2e/customer-intelligence.spec.ts (~150 LOC)'
    ],

    key_principles: [
      'Surface existing data - no new service layer needed',
      'Progressive disclosure - widgets in stages, full view in dedicated page',
      'Read-only to start - editing can come in Phase 2',
      'Respect existing AI confidence scores in UI',
      'Handle empty states gracefully (no data yet generated)',
      'Mandatory E2E testing before deployment'
    ],

    metadata: {
      related_sds: [
        {
          id: 'SD-CUSTOMER-INTEL-001',
          relationship: 'completes',
          note: 'Original SD created tables/service, this SD creates UI layer'
        }
      ],

      existing_infrastructure: {
        database_tables: [
          'customer_personas (demographics, psychographics, pain_points, jobs_to_be_done)',
          'icp_profiles (firmographics, decision_makers, buying_signals, icp_score 0-100)',
          'customer_journeys (4 stages: awareness, consideration, decision, retention)',
          'market_segments (target markets, scanning sources, chairman approval)',
          'willingness_to_pay (pricing tiers, value metrics, price sensitivity)'
        ],
        service_layer: 'customerIntelligence.ts (796 LOC) - fully implemented',
        current_ui: 'ZERO - no components display this data',
        migration_file: 'supabase/migrations/20251011_customer_intelligence_system.sql'
      },

      implementation_plan: {
        phase_1: {
          name: 'Core UI Components',
          files: 10,
          loc: 785,
          time_estimate: '3-5 days',
          components: [
            'CustomerPersonasManager (persona CRUD + display)',
            'ICPScoringDashboard (score visualization + breakdown)',
            'CustomerJourneyVisualizer (4-stage flow diagram)',
            'WillingnessToPayAnalysis (pricing tiers + recommendations)',
            'Stage integrations (buttons + inline widgets)',
            'Standalone page + navigation',
            'E2E tests (persona view, ICP display, journey nav)'
          ]
        },

        phase_2_future: {
          name: 'Editing & Generation (Optional)',
          features: [
            'Manual persona creation/editing',
            'ICP score recalculation triggers',
            'Journey stage editing',
            'AI regeneration buttons ("Regenerate Personas")',
            'Persona comparison (before/after AI refinement)'
          ],
          note: 'Phase 2 requires AI generation endpoints - Phase 1 is display-only'
        },

        phase_3_future: {
          name: 'Analytics & Insights (Optional)',
          features: [
            'Persona evolution tracking over time',
            'ICP score trends (how it changes across venture stages)',
            'Journey drop-off analysis',
            'WTP vs actual pricing comparison'
          ],
          note: 'Phase 3 requires longitudinal data from Phase 1'
        }
      },

      testing_strategy: {
        e2e_scenarios: [
          'Navigate to /customer-intelligence page',
          'View personas for a venture with existing data',
          'View ICP score breakdown (0-100 with rationales)',
          'Visualize 4-stage customer journey',
          'View WTP analysis with pricing tiers',
          'Navigate from Stage 3 "View Intelligence" button',
          'Verify WTP widget displays inline in Stage 15',
          'Verify journey map displays inline in Stage 17',
          'Handle empty states (no data generated yet)',
          'Error handling: venture without intelligence data'
        ],

        test_file: 'tests/e2e/customer-intelligence.spec.ts',
        estimated_loc: 150,
        coverage_target: '100% of UI components'
      },

      risk_assessment: {
        data_risk: 'low - read-only from existing tables',
        complexity_risk: 'medium - visualization components require careful UX design',
        integration_risk: 'low - stages already import customerIntelligence service',
        backwards_compatible: true,
        rollback_safe: true
      },

      success_metrics: {
        adoption: 'Track /customer-intelligence page views',
        engagement: 'Track "View Intelligence" button clicks from Stage 3',
        value: 'Measure user feedback on persona/ICP usefulness',
        coverage: 'Track % of ventures with intelligence data generated'
      }
    },

    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },

  // SD 2: Chairman Analytics Navigation
  {
    id: 'SD-CHAIRMAN-ANALYTICS-NAV-001',
    sd_key: 'CHAIRMAN-ANALYTICS-NAV-001',
    title: 'Surface Chairman Decision Analytics Dashboard',
    version: '1.0',
    status: 'draft',
    category: 'ux_improvement',
    priority: 'high',
    target_application: 'EHG',
    current_phase: 'IDEATION',

    description: 'Add navigation link for the fully-functional Chairman Decision Analytics dashboard (/chairman-analytics) built in SD-RECONNECT-011. Dashboard is 100% complete (6 components, 1060 LOC, 5 APIs, 4 tables) but has no navigation link, making it effectively hidden from users.',

    strategic_intent: 'Make a complete, high-value feature discoverable. Chairman Analytics provides decision history, confidence scores, threshold calibration, and feature flags - but users cannot find it because it lacks a navigation entry.',

    rationale: 'SD-RECONNECT-011 built complete Chairman Decision Analytics infrastructure including UI (DecisionAnalyticsDashboard, DecisionHistoryTable, ConfidenceScoreChart, ThresholdCalibrationReview, FeatureFlagControls), backend (5 APIs), and database (4 tables). Route exists (/chairman-analytics) but is not linked in navigation. Users must manually type URL to access.',

    scope: 'Add navigation link in Chairman section. Minimal effort (5-10 LOC), high value unlock. No functional changes - purely discovery enhancement.',

    strategic_objectives: [
      'Add /chairman-analytics link to ModernNavigationSidebar',
      'Place in Chairman section (after /chairman, before /chairman/settings)',
      'Add icon (BarChart3 or Analytics)',
      'Add NEW badge for 30 days',
      'Verify navigation accessibility (keyboard navigation)',
      'Update E2E tests to include navigation path'
    ],

    success_criteria: [
      'Chairman Analytics link visible in navigation',
      'Link navigates to /chairman-analytics correctly',
      'NEW badge displays for first 30 days',
      'Link is keyboard accessible (tab navigation)',
      'E2E test validates navigation path',
      'Analytics show increased page views after deployment'
    ],

    key_changes: [
      'Modify src/components/navigation/ModernNavigationSidebar.tsx (+8 LOC)',
      'Update tests/e2e/navigation.spec.ts (+15 LOC)',
      'Add NEW badge logic with 30-day expiry (+10 LOC)'
    ],

    key_principles: [
      'Zero functional changes - navigation only',
      'Maintain existing chairman section organization',
      'Follow existing navigation patterns',
      'Ensure keyboard accessibility',
      'Test before deployment'
    ],

    metadata: {
      related_sds: [
        {
          id: 'SD-RECONNECT-011',
          relationship: 'surfaces',
          note: 'Original SD built the dashboard, this SD makes it discoverable'
        }
      ],

      existing_infrastructure: {
        route: '/chairman-analytics (fully functional)',
        components: [
          'DecisionAnalyticsDashboard (170 LOC)',
          'DecisionHistoryTable (174 LOC)',
          'ConfidenceScoreChart (75 LOC)',
          'ThresholdCalibrationReview (262 LOC)',
          'FeatureFlagControls (102 LOC)',
          'TypeScript interfaces (277 LOC)'
        ],
        apis: 5,
        tables: 4,
        total_loc: 1060,
        status: 'Complete and functional, just not discoverable'
      },

      implementation_plan: {
        phase_1: {
          name: 'Add Navigation Link',
          files: 2,
          loc: 33,
          time_estimate: '30 minutes',
          tasks: [
            'Add link to navigation config',
            'Add NEW badge with expiry logic',
            'Update E2E tests',
            'Verify accessibility'
          ]
        }
      },

      testing_strategy: {
        e2e_scenarios: [
          'Navigation link visible in sidebar',
          'Click link navigates to /chairman-analytics',
          'NEW badge displays correctly',
          'Keyboard navigation works (Tab + Enter)',
          'Link highlighted when on /chairman-analytics page'
        ],
        test_file: 'tests/e2e/navigation.spec.ts (update existing)',
        estimated_loc: 15
      },

      risk_assessment: {
        risk: 'none - navigation change only',
        backwards_compatible: true,
        rollback_safe: true
      },

      success_metrics: {
        adoption: 'Track /chairman-analytics page views before vs after',
        target: '10x increase in page views within 2 weeks',
        engagement: 'Track feature usage (decision history, calibration)'
      }
    },

    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },

  // SD 3: Competitive Intelligence Navigation
  {
    id: 'SD-COMPETITIVE-INTEL-NAV-001',
    sd_key: 'COMPETITIVE-INTEL-NAV-001',
    title: 'Surface Competitive Intelligence Module',
    version: '1.0',
    status: 'draft',
    category: 'ux_improvement',
    priority: 'high',
    target_application: 'EHG',
    current_phase: 'IDEATION',

    description: 'Add navigation link for the fully-functional Competitive Intelligence module (/competitive-intelligence). Module includes AI competitive research service (428 LOC), complete UI components, and 2 database tables, but has no navigation link.',

    strategic_intent: 'Make competitive intelligence capabilities discoverable. Module provides AI-powered competitor analysis, market research, and strategic insights - but users cannot find it.',

    rationale: 'Competitive Intelligence module is complete with AICompetitiveResearchService (428 LOC), CompetitiveIntelligenceModule UI, route configuration, and database tables. However, it lacks navigation entry, making it accessible only via direct URL entry.',

    scope: 'Add navigation link in Intelligence section. Minimal effort (5-10 LOC), surfaces complete competitive research capabilities.',

    strategic_objectives: [
      'Add /competitive-intelligence link to ModernNavigationSidebar',
      'Place in Intelligence section (near /opportunity-sourcing)',
      'Add icon (Target or TrendingUp)',
      'Add NEW badge for 30 days',
      'Verify navigation accessibility',
      'Update E2E tests'
    ],

    success_criteria: [
      'Competitive Intelligence link visible in navigation',
      'Link navigates to /competitive-intelligence correctly',
      'NEW badge displays for first 30 days',
      'Link is keyboard accessible',
      'E2E test validates navigation path',
      'Usage metrics show feature discovery'
    ],

    key_changes: [
      'Modify src/components/navigation/ModernNavigationSidebar.tsx (+8 LOC)',
      'Update tests/e2e/navigation.spec.ts (+15 LOC)',
      'Add NEW badge logic with expiry (+10 LOC)'
    ],

    key_principles: [
      'Zero functional changes - navigation only',
      'Group with related Intelligence features',
      'Follow existing navigation patterns',
      'Ensure discoverability',
      'Test navigation flow'
    ],

    metadata: {
      existing_infrastructure: {
        route: '/competitive-intelligence (fully functional)',
        service: 'AICompetitiveResearchService.ts (428 LOC)',
        components: [
          'CompetitiveIntelligenceModule',
          'Component exports in index.ts'
        ],
        tables: 2,
        status: 'Complete and functional, not discoverable'
      },

      implementation_plan: {
        phase_1: {
          name: 'Add Navigation Link',
          files: 2,
          loc: 33,
          time_estimate: '30 minutes'
        }
      },

      testing_strategy: {
        e2e_scenarios: [
          'Navigation link visible',
          'Click navigates correctly',
          'NEW badge displays',
          'Keyboard accessible',
          'Active state highlights'
        ],
        test_file: 'tests/e2e/navigation.spec.ts',
        estimated_loc: 15
      },

      risk_assessment: {
        risk: 'none - navigation only',
        backwards_compatible: true,
        rollback_safe: true
      },

      success_metrics: {
        adoption: 'Track page views increase',
        target: '5x increase in 2 weeks',
        engagement: 'Track competitive analysis usage'
      }
    },

    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },

  // SD 4: GTM Intelligence Discovery
  {
    id: 'SD-GTM-INTEL-DISCOVERY-001',
    sd_key: 'GTM-INTEL-DISCOVERY-001',
    title: 'Enhance GTM Intelligence Discoverability',
    version: '1.0',
    status: 'draft',
    category: 'ux_improvement',
    priority: 'high',
    target_application: 'EHG',
    current_phase: 'IDEATION',

    description: 'Improve discoverability of GTM Intelligence system (gtmIntelligence.ts, 714 LOC). Currently used only in Stage 35 (GTM Timing), making it hard to discover. Add navigation link and consider earlier-stage integration.',

    strategic_intent: 'Make GTM intelligence capabilities more discoverable. System provides timing recommendations, market readiness assessment, and competitive positioning - but is buried deep in Stage 35.',

    rationale: 'GTM Intelligence is substantial (714 LOC) and provides valuable insights but is only accessible in Stage 35. Most ventures never reach Stage 35, so this intelligence goes unused. Adding navigation and earlier integration increases value capture.',

    scope: 'Add navigation link + optional early integration. Minimal effort (5-15 LOC navigation, 20-30 LOC if adding early-stage widget).',

    strategic_objectives: [
      'Add /gtm-intelligence link to ModernNavigationSidebar',
      'Place in Intelligence section',
      'Add icon (Calendar or Clock)',
      'Consider adding GTM preview in Stage 15 or 17 (optional)',
      'Verify accessibility',
      'Update E2E tests'
    ],

    success_criteria: [
      'GTM Intelligence link visible in navigation',
      'Link navigates correctly',
      'Usage metrics show increased access',
      'Optional: Early-stage GTM preview drives engagement'
    ],

    key_changes: [
      'Modify src/components/navigation/ModernNavigationSidebar.tsx (+8 LOC)',
      'Optional: Add GTM preview widget to Stage 15/17 (+20-30 LOC)',
      'Update tests/e2e/navigation.spec.ts (+15 LOC)'
    ],

    key_principles: [
      'Minimal changes - navigation focus',
      'Early-stage integration is optional Phase 2',
      'Do not disrupt Stage 35 existing functionality',
      'Test navigation flow'
    ],

    metadata: {
      existing_infrastructure: {
        service: 'gtmIntelligence.ts (714 LOC)',
        current_usage: 'Stage 35 (GTM Timing Intelligence)',
        tables: 3,
        status: 'Functional but hard to discover'
      },

      implementation_plan: {
        phase_1: {
          name: 'Add Navigation Link',
          files: 2,
          loc: 23,
          time_estimate: '30 minutes'
        },
        phase_2_optional: {
          name: 'Early-Stage Integration',
          files: 2,
          loc: 50,
          time_estimate: '2 hours',
          note: 'Add GTM preview in Stage 15/17 for earlier visibility'
        }
      },

      testing_strategy: {
        e2e_scenarios: [
          'Navigation link visible',
          'Click navigates correctly',
          'Stage 35 still works (regression check)',
          'Optional: Early-stage widget displays'
        ],
        test_file: 'tests/e2e/navigation.spec.ts',
        estimated_loc: 15
      },

      risk_assessment: {
        risk: 'none - navigation only',
        backwards_compatible: true,
        rollback_safe: true
      },

      success_metrics: {
        adoption: 'Track page views increase',
        early_engagement: 'If Phase 2: track early-stage GTM preview usage'
      }
    },

    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

async function createSDs() {
  console.log('📋 Creating 4 Strategic Directives for Hidden Value Discoveries\n');
  console.log('=' + '='.repeat(79) + '\n');

  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (const sd of strategicDirectives) {
    console.log(`Creating: ${sd.id}`);
    console.log(`Title: ${sd.title}`);
    console.log(`Priority: ${sd.priority}`);

    try {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert([sd])
        .select()
        .single();

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      console.log(`✅ SUCCESS: ${sd.id} created`);
      console.log(`   UUID: ${data.uuid_id}`);
      successCount++;
      results.push({ success: true, id: sd.id, data });

    } catch (error) {
      console.error(`❌ FAILED: ${sd.id}`);
      console.error(`   Error: ${error.message}`);
      failureCount++;
      results.push({ success: false, id: sd.id, error: error.message });
    }

    console.log(''); // Empty line between SDs
  }

  console.log('=' + '='.repeat(79));
  console.log('\n📊 Summary:');
  console.log(`   Total SDs: ${strategicDirectives.length}`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failureCount}`);

  console.log('\n📝 Created Strategic Directives:');
  results.filter(r => r.success).forEach(r => {
    console.log(`   ✅ ${r.id}`);
  });

  if (failureCount > 0) {
    console.log('\n❌ Failed Strategic Directives:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   ❌ ${r.id}: ${r.error}`);
    });
  }

  console.log('\n' + '=' + '='.repeat(79));
  console.log('\n📝 Next Steps:');
  console.log('1. View SDs in EHG_Engineer dashboard: http://localhost:3000');
  console.log('2. Review and prioritize SDs (all marked HIGH priority)');
  console.log('3. Create handoffs to PLAN phase for approved SDs');
  console.log('4. Estimated total effort:');
  console.log('   - Customer Intelligence UI: 3-5 days (highest value)');
  console.log('   - Chairman Analytics Nav: 30 minutes');
  console.log('   - Competitive Intel Nav: 30 minutes');
  console.log('   - GTM Intel Discovery: 30 minutes (or 2.5 hours with early integration)');
  console.log('\n✨ All SDs ready for LEAD review and approval!');

  if (failureCount > 0) {
    process.exit(1);
  }
}

createSDs();
