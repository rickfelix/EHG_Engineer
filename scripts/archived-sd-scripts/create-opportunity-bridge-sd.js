#!/usr/bin/env node

/**
 * Create SD-VWC-OPPORTUNITY-BRIDGE-001: Bridge AI Opportunity Sourcing to Venture Creation Wizard
 *
 * Creates Strategic Directive for connecting the existing ventureIdeationService
 * (competitive intelligence & opportunity generation) to the VentureCreationPage wizard.
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

const strategicDirective = {
  id: 'SD-VWC-OPPORTUNITY-BRIDGE-001',
  sd_key: 'VWC-OPPORTUNITY-BRIDGE-001',
  title: 'Bridge AI Opportunity Sourcing to Venture Creation Wizard',
  version: '1.0',
  status: 'draft',
  category: 'product_feature',
  priority: 'high',
  target_application: 'EHG',
  current_phase: 'IDEATION',

  description: 'Enable users to start venture creation from AI-generated opportunity blueprints discovered through competitive intelligence system. Connect existing ventureIdeationService (SD-041B) to VentureCreationPage wizard to enable "Browse-first" venture creation flow alongside existing "Idea-first" flow.',

  strategic_intent: 'Unlock the value of the hidden competitive intelligence system by integrating it into the main venture creation workflow. Users can now discover AI-generated opportunities from market analysis and launch them directly into the venture wizard with pre-filled data.',

  rationale: 'Discovery: Complete opportunity sourcing system exists (ventureIdeationService.ts, 471 lines) with competitive intelligence, customer feedback analysis, and AI-generated blueprints. However, it\'s architecturally isolated from venture creation wizard. Users cannot: (1) discover AI-generated opportunities, (2) browse market intelligence, (3) launch blueprints into wizard, (4) track blueprint→venture conversion. This creates a "hidden feature" problem where valuable infrastructure goes unused.',

  scope: 'Minimal integration hooks between two existing systems. No new features, just connecting what exists. Implementation: adapter service (80 LOC), wizard modifications (+50 LOC), opportunity dashboard updates (+30 LOC), database migration (15 LOC), E2E tests (200 LOC). Total: 375 LOC across 5 files.',

  strategic_objectives: [
    'Enable "Browse-first" venture creation flow: Opportunities → Wizard → Venture',
    'Add "Browse AI Opportunities" button in wizard Step 1',
    'Deep link from opportunity cards: "Create Venture" → wizard with blueprint ID',
    'Pre-fill wizard form from blueprint data (name, description, problem, target market, competitive gaps)',
    'Track blueprint→venture conversion for analytics (source_blueprint_id)',
    'Maintain existing "Idea-first" flow (no regressions)'
  ],

  success_criteria: [
    'Browse button visible and functional in wizard Step 1',
    'Deep link navigates correctly: /ventures/new?blueprintId=<uuid>',
    'Form pre-fills all 6 fields from blueprint data',
    'Error handling for invalid/missing blueprints',
    'E2E test validates complete browse→create→venture journey',
    'Ventures table tracks source_blueprint_id for conversion analytics',
    'Zero regressions in existing wizard functionality'
  ],

  key_changes: [
    'Create opportunityToVentureAdapter.ts service (80 LOC)',
    'Modify VentureCreationPage.tsx: add browse button + URL param handler (+50 LOC)',
    'Modify OpportunitySourcingDashboard.jsx: add "Create Venture" button (+30 LOC)',
    'Add source_blueprint_id to ventures table (migration, 15 LOC)',
    'Create opportunity-to-venture-bridge.spec.ts E2E test (200 LOC)'
  ],

  key_principles: [
    'Zero new features - only connect existing systems',
    'Minimal code changes - leverage what exists',
    'Database-first - track conversion for analytics',
    'No regressions - existing wizard must work identically',
    'Mandatory E2E testing - validate complete journey',
    'Progressive enhancement - browse is optional, wizard still works standalone'
  ],

  metadata: {
    related_sds: [
      {
        id: 'SD-VWC-PHASE1-001',
        relationship: 'enhances',
        note: 'Adds opportunity browsing entry point to existing wizard'
      },
      {
        id: 'SD-041B',
        relationship: 'activates',
        note: 'Connects hidden competitive intelligence system to main workflow'
      }
    ],

    existing_infrastructure: {
      opportunity_system: {
        service: 'ventureIdeationService.ts (471 LOC)',
        ui: 'OpportunitySourcingDashboard.jsx',
        route: '/opportunity-sourcing',
        tables: [
          'market_segments',
          'competitor_tracking',
          'customer_feedback_sources',
          'opportunity_blueprints',
          'listening_radar_config'
        ],
        status: 'built but isolated from venture workflow'
      },

      venture_wizard: {
        component: 'VentureCreationPage.tsx',
        route: '/ventures/new',
        status: 'fully functional, no opportunity integration'
      },

      gap: 'No integration point - opportunity sourcing cannot launch ventures'
    },

    implementation_plan: {
      phase_1: {
        name: 'Minimal Integration Hooks',
        files: 5,
        loc: 375,
        time_estimate: '2-3 hours',
        components: [
          'Adapter service (transformation logic)',
          'Browse button (wizard entry point)',
          'Deep link (opportunity→wizard)',
          'URL param handler (pre-fill logic)',
          'E2E test (validation)'
        ]
      },

      phase_2_future: {
        name: 'Enhanced Discovery (Optional)',
        features: [
          'Filter opportunities by segment/score',
          'Preview competitive gaps & evidence',
          'Side-by-side opportunity comparison',
          'Bookmark/favorite system'
        ],
        note: 'Phase 2 can wait - Phase 1 proves value first'
      },

      phase_3_future: {
        name: 'Feedback Loop (Optional)',
        features: [
          'Track blueprint→venture→success conversion rate',
          'Refine opportunity scoring based on venture outcomes',
          'Chairman dashboard: "Best performing blueprints"'
        ],
        note: 'Phase 3 requires longitudinal data from Phase 1'
      }
    },

    testing_strategy: {
      e2e_scenarios: [
        'Browse button visibility and keyboard accessibility',
        'Navigation to opportunity sourcing with return URL',
        'Deep link from opportunity card to wizard',
        'Form pre-fill from blueprint data (all 6 fields)',
        'End-to-end flow: browse→select→create→verify',
        'Error handling: invalid blueprintId, unapproved blueprint, network failure'
      ],

      test_file: 'tests/e2e/opportunity-to-venture-bridge.spec.ts',
      estimated_loc: 200,
      coverage_target: '100% of integration points'
    },

    risk_assessment: {
      architectural_risk: 'low - minimal changes to existing systems',
      regression_risk: 'low - wizard works standalone, browse is additive',
      data_risk: 'low - read-only from blueprints, standard write to ventures',
      complexity_risk: 'low - straightforward data transformation',
      testing_risk: 'low - clear E2E scenarios, existing test infrastructure'
    },

    deployment_notes: {
      backwards_compatible: true,
      requires_migration: true,
      migration_safe: true,
      migration_note: 'Adds nullable source_blueprint_id column, no data changes',
      rollback_safe: true,
      rollback_note: 'Remove column if needed, no data loss'
    },

    success_metrics: {
      adoption: 'Track browse button clicks vs direct wizard access',
      conversion: 'Track blueprint→venture conversion rate',
      quality: 'Compare venture quality scores: blueprint-sourced vs manual',
      time_to_create: 'Measure time savings from pre-filled data',
      chairman_feedback: 'Qualitative feedback on discovery experience'
    }
  },

  created_by: 'LEAD',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

async function createSD() {
  console.log('📋 Creating Strategic Directive: SD-VWC-OPPORTUNITY-BRIDGE-001\n');
  console.log('Title:', strategicDirective.title);
  console.log('Priority:', strategicDirective.priority);
  console.log('Target:', strategicDirective.target_application);
  console.log('Phase:', strategicDirective.current_phase);
  console.log('\n' + '='.repeat(80) + '\n');

  try {
    // Insert into strategic_directives_v2 table
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert([strategicDirective])
      .select()
      .single();

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    console.log('✅ Strategic Directive created successfully!\n');
    console.log('SD ID:', data.id);
    console.log('SD Key:', data.sd_key);
    console.log('Status:', data.status);
    console.log('Priority:', data.priority);
    console.log('\n📊 Database Record:');
    console.log(JSON.stringify(data, null, 2));
    console.log('\n' + '='.repeat(80));
    console.log('\n📝 Next Steps:');
    console.log('1. View SD in EHG_Engineer dashboard: http://localhost:3000');
    console.log('2. Review and approve SD (LEAD phase)');
    console.log('3. Create handoff to PLAN phase');
    console.log('4. PLAN creates detailed PRD');
    console.log('5. EXEC implements integration (375 LOC)');
    console.log('\n✨ SD ready for LEAD review and approval!');

  } catch (error) {
    console.error('\n❌ Error creating Strategic Directive:', error.message);
    console.error('\nDetails:', error);
    process.exit(1);
  }
}

createSD();
