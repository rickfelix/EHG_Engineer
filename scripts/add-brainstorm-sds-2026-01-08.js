#!/usr/bin/env node

/**
 * Add Brainstorm Strategic Directives to database
 * Created: 2026-01-08
 * Source: Ground-Truth Triangulation Protocol (Claude, OpenAI, Antigravity)
 *
 * Topics:
 * - SD-GENESIS-FIX-001: Fix Genesis Pipeline + Make Tiered
 * - SD-CAP-LEDGER-001: Automated Capability Ledger
 * - SD-EVAL-MATRIX-001: Venture Evaluation Matrix with Portfolio Scatter
 * - SD-EHG-WEBSITE-001: External EHG Website
 *
 * LEO Protocol v4.3.3 - Database First Approach
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function addBrainstormSDsToDatabase() {
  console.log('🚀 LEO Protocol v4.3.3 - Brainstorm SDs Database Insertion');
  console.log('================================================================');
  console.log('Source: Ground-Truth Triangulation Protocol (2026-01-08)\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Use service role key for database operations (bypasses RLS)
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey ||
      supabaseUrl === 'your_supabase_url_here' ||
      supabaseKey === 'your_supabase_anon_key_here') {
    console.log('❌ Missing or placeholder Supabase credentials in .env file');
    console.log('Please update .env with your actual Supabase URL and API key');
    process.exit(1);
  }

  console.log(`Using ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service role' : 'anon'} key`);

  const supabase = createClient(supabaseUrl, supabaseKey);

  // =========================================================================
  // SD 1: Fix Genesis Pipeline + Make Tiered
  // =========================================================================

  const sd1 = {
    id: 'SD-GENESIS-FIX-001',
    sd_key: 'GENESIS-FIX-001',
    title: 'Fix Genesis Pipeline + Implement Tiered Simulation System',
    version: '1.0',
    status: 'draft',
    category: 'infrastructure',
    priority: 'high',
    target_application: 'EHG_Engineer',
    current_phase: 'LEAD',
    sd_type: 'infrastructure',
    description: `Fix critical issues in the Genesis simulation pipeline and implement a tiered system for venture prototyping.

**Current Issues Identified (Triangulation Protocol):**
1. Schema Mismatch: epistemic_status constraint allows ('simulation', 'official', 'archived', 'incinerated') but code writes 'deployment_failed', 'ratified'
2. Deployment Pipeline Broken: 5 simulation sessions exist, 0 have preview_url populated
3. PRD Generation Stubbed: generatePRD() is placeholder, not real implementation

**Tiered Approach (Consensus Recommendation):**
- Tier A (Default): PRD-only + AI mockups (no deployment)
- Tier B (Complex Ventures): Full simulation with Vercel preview

**Evidence Files:**
- lib/genesis/vercel-deploy.js:79-88 (invalid status writes)
- src/pages/api/genesis/ratify.ts:93-101 (invalid status writes)
- database/migrations/20251230_genesis_virtual_bunker.sql:10-23 (constraint definition)`,

    strategic_intent: 'Restore Genesis as a functional venture prototyping system with appropriate complexity tiers',

    rationale: 'Genesis represents 8,482 LOC of investment across two codebases but is not delivering value. All three AI analysts (Claude, OpenAI, Antigravity) agreed the pipeline is necessary but broken. The schema mismatch is a critical bug that will cause runtime failures.',

    scope: `1. Fix epistemic_status constraint (database migration)
2. Diagnose and fix Vercel deployment pipeline
3. Implement tier selection in Genesis intake UI
4. Make PRD generation functional or clearly mark as stub
5. TESTING: E2E tests for Genesis workflow (tier selection, simulation creation, deployment)
6. DOCUMENTATION: Update Genesis technical docs with tiered architecture and troubleshooting guide`,

    strategic_objectives: [
      'Fix epistemic_status schema mismatch to prevent runtime errors',
      'Successfully deploy at least 1 simulation to Vercel preview URL',
      'Implement Tier A/B selection in Genesis intake workflow',
      'Reduce infrastructure maintenance burden through tiering',
      'TESTING: Achieve 80%+ E2E test coverage for Genesis critical paths',
      'DOCUMENTATION: Comprehensive Genesis architecture and operations guide'
    ],

    success_criteria: [
      'Schema allows all status values written by code',
      'At least one simulation reaches Vercel preview',
      'Tier selection visible in Genesis intake UI',
      'Chairman can choose simulation depth per venture',
      'TESTING: E2E tests pass for tier selection, simulation creation, and deployment flows',
      'DOCUMENTATION: Genesis architecture doc, troubleshooting guide, and operations runbook exist'
    ],

    key_changes: [
      'Database migration to fix epistemic_status constraint',
      'Vercel deployment pipeline diagnosis and fix',
      'Genesis intake UI tier selection component',
      'E2E test suite for Genesis workflows'
    ],

    key_principles: [
      'Must maintain backward compatibility with existing 5 simulations',
      'Cannot break existing Genesis UI components',
      'Vercel API authentication must be properly configured',
      'Single developer, existing Vercel account'
    ],

    metadata: {
      source: 'Ground-Truth Triangulation Protocol',
      triangulation_date: '2026-01-08',
      track: 'A',
      estimated_effort_hours: 16,
      risks: [
        {
          type: 'technical',
          description: 'Vercel deployment may require additional configuration',
          probability: 'medium',
          impact: 'medium',
          mitigation: 'Diagnose root cause before attempting fixes'
        },
        {
          type: 'data',
          description: 'Existing simulations may have invalid status values',
          probability: 'high',
          impact: 'low',
          mitigation: 'Migration script to clean up existing data'
        }
      ],
      testing_requirements: {
        e2e_coverage_percent: 80,
        documentation_pages: 3
      }
    },

    created_by: 'LEAD-Triangulation',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // =========================================================================
  // SD 2: Automated Capability Ledger (No UI)
  // =========================================================================

  const sd2 = {
    id: 'SD-CAP-LEDGER-001',
    sd_key: 'CAP-LEDGER-001',
    title: 'Automated Capability Ledger with Plane 1 Integration',
    version: '1.0',
    status: 'draft',
    category: 'infrastructure',
    priority: 'high',
    target_application: 'EHG_Engineer',
    current_phase: 'LEAD',
    sd_type: 'infrastructure',
    description: `Implement an automated capability tracking system that analyzes venture code for capabilities leveraged and introduced, feeding into the Evaluation Matrix Plane 1 score.

**Key Design Decisions (Chairman Approved):**
- NO separate UI - capabilities managed automatically
- Analysis happens during venture evaluation
- Feeds directly into Plane 1 (Capability Graph Impact) score
- Tracks both consumed capabilities (from ecosystem) and produced capabilities (new)

**Triangulation Consensus:**
- All three AIs agreed capability tracking is valuable
- OpenAI found existing sd_capabilities table (needs audit)
- "Ecosystem lift" measurement is currently missing
- Reuse tracking is essential for compounding value`,

    strategic_intent: 'Enable automated measurement of capability compounding across the EHG ecosystem',

    rationale: 'The capability compounding strategy requires measurement infrastructure. Without tracking what capabilities exist and how they\'re reused, the doctrine becomes non-falsifiable. Automated analysis removes human bias and ensures consistency.',

    scope: `1. Design capability taxonomy (types, hierarchy)
2. Audit/redesign sd_capabilities table
3. Create automated capability analysis pipeline
4. Integrate with Plane 1 scoring algorithm
5. Track capability reuse across ventures
6. TESTING: Unit tests for capability detection, integration tests for Plane 1 calculation
7. DOCUMENTATION: Capability taxonomy reference, analysis algorithm docs, integration guide`,

    strategic_objectives: [
      'Define formal capability taxonomy with clear types',
      'Automate capability detection from venture code',
      'Calculate Plane 1 score from capability analysis',
      'Track reuse frequency for ecosystem lift measurement',
      'TESTING: 90%+ unit test coverage for capability detection algorithms',
      'DOCUMENTATION: Complete capability taxonomy and integration documentation'
    ],

    success_criteria: [
      'Capability taxonomy documented and enforced',
      'New ventures automatically analyzed for capabilities',
      'Plane 1 score reflects actual capability contribution',
      'Reuse events logged when capability is consumed',
      'TESTING: All capability detection patterns have unit tests with edge cases',
      'DOCUMENTATION: Taxonomy reference doc, algorithm explanation, and developer integration guide'
    ],

    key_changes: [
      'Capability taxonomy definition',
      'sd_capabilities table audit/redesign',
      'Automated analysis pipeline',
      'Plane 1 scoring integration'
    ],

    key_principles: [
      'Must integrate with existing sd_capabilities table',
      'Analysis must complete within venture evaluation flow',
      'No manual data entry required',
      'Single developer, existing database infrastructure'
    ],

    metadata: {
      source: 'Ground-Truth Triangulation Protocol',
      triangulation_date: '2026-01-08',
      track: 'A',
      estimated_effort_hours: 24,
      risks: [
        {
          type: 'technical',
          description: 'Capability detection accuracy may be low initially',
          probability: 'medium',
          impact: 'medium',
          mitigation: 'Start with pattern matching, add ML later'
        },
        {
          type: 'design',
          description: 'Taxonomy may not cover all capability types',
          probability: 'medium',
          impact: 'low',
          mitigation: 'Design for extensibility, iterate based on usage'
        }
      ],
      testing_requirements: {
        unit_test_coverage_percent: 90,
        documentation_completeness_percent: 100
      }
    },

    created_by: 'LEAD-Triangulation',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // =========================================================================
  // SD 3: Venture Evaluation Matrix with Portfolio Scatter
  // =========================================================================

  const sd3 = {
    id: 'SD-EVAL-MATRIX-001',
    sd_key: 'EVAL-MATRIX-001',
    title: 'Venture Evaluation Matrix with Portfolio Scatter Dashboard',
    version: '1.0',
    status: 'draft',
    category: 'feature',
    priority: 'high',
    target_application: 'EHG',
    current_phase: 'LEAD',
    sd_type: 'feature',
    description: `Implement the four-plane Venture Evaluation Matrix with Success Outlook as EVA output, and create the Portfolio Scatter dashboard for Chairman decision-making.

**Model Design (Triangulation Consensus):**
- Keep 4 planes as inputs (Capability, Vectors, Constraints, Exploration)
- Add Success Outlook as EVA computed output (not 5th plane)
- Success Outlook: Bucketed probability (0-20%, 20-40%, etc.) + Confidence + Drivers

**Dashboard Design:**
- Primary: Portfolio Scatter (Capability × Success Outlook)
- Quadrants: Home Runs, Strategic Bets, Cash Cows, Dead Zone
- Dot encoding: Shape=mode, Color=constraints, Size=resources
- Attention queue for items needing action

**Soft Portfolio Quotas:**
- 30-50% Home Runs (high-cap + high-success)
- 10-25% Strategic Bets (high-cap + low-success)
- 20-30% Cash Cows (low-cap + high-success)
- 0% Dead Zone (reject)`,

    strategic_intent: 'Enable data-driven portfolio management with visual decision support for the Chairman',

    rationale: 'The current four-plane model is a spec document, not code. Chairman needs a decision dashboard to manage the venture portfolio. The triangulation revealed strong consensus on the 2×2 quadrant approach with soft quotas.',

    scope: `1. Implement four-plane scoring in database
2. Create EVA Success Outlook calculation algorithm
3. Build Portfolio Scatter primary view
4. Build individual venture dual-gauge cards
5. Implement attention queue for items needing action
6. Add portfolio health metrics
7. TESTING: E2E tests for dashboard views, unit tests for EVA calculations, visual regression tests
8. DOCUMENTATION: Four-plane model reference, EVA algorithm docs, dashboard user guide`,

    strategic_objectives: [
      'Calculate all four plane scores for ventures',
      'Compute Success Outlook with bucketed probabilities',
      'Display portfolio scatter with quadrant classification',
      'Enable Chairman to make informed portfolio decisions',
      'TESTING: Comprehensive test suite covering all dashboard interactions and calculations',
      'DOCUMENTATION: Complete user guide and technical reference for evaluation system'
    ],

    success_criteria: [
      'Chairman can see all ventures on scatter plot',
      'Quadrant distribution visible at a glance',
      'Attention queue highlights items needing action',
      'Individual venture details accessible via click',
      'TESTING: E2E tests for scatter plot, gauges, quadrant classification, and drill-down flows',
      'DOCUMENTATION: Four-plane model reference, EVA algorithm explanation, user guide, and API docs'
    ],

    key_changes: [
      'Four-plane scoring database tables',
      'EVA Success Outlook algorithm',
      'Portfolio Scatter React component',
      'Venture dual-gauge card component',
      'Attention queue component'
    ],

    key_principles: [
      'Must integrate with existing ventures table',
      'Dark mode first (cockpit design)',
      'Glanceable in under 10 seconds',
      'Mobile responsive for Chairman access',
      'Single developer, existing design system'
    ],

    metadata: {
      source: 'Ground-Truth Triangulation Protocol',
      triangulation_date: '2026-01-08',
      track: 'B',
      estimated_effort_hours: 40,
      risks: [
        {
          type: 'design',
          description: 'Information density may be too high',
          probability: 'medium',
          impact: 'medium',
          mitigation: 'Start with 7 key metrics, rest in drill-down'
        },
        {
          type: 'algorithm',
          description: 'Success Outlook calculation may need calibration',
          probability: 'high',
          impact: 'low',
          mitigation: 'Track predictions vs outcomes, adjust weights'
        }
      ],
      testing_requirements: {
        e2e_test_coverage_percent: 85,
        documentation_pages: 4
      },
      design_specs: {
        primary_view: 'Portfolio Scatter (Capability × Success Outlook)',
        quadrants: ['Home Runs', 'Strategic Bets', 'Cash Cows', 'Dead Zone'],
        dot_encoding: {
          shape: 'mode',
          color: 'constraints',
          size: 'resources'
        }
      }
    },

    created_by: 'LEAD-Triangulation',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // =========================================================================
  // SD 4: External EHG Website
  // =========================================================================

  const sd4 = {
    id: 'SD-EHG-WEBSITE-001',
    sd_key: 'EHG-WEBSITE-001',
    title: 'External EHG Public Website with Narrative Mask',
    version: '1.0',
    status: 'draft',
    category: 'feature',
    priority: 'medium',
    target_application: 'EHG',
    current_phase: 'LEAD',
    sd_type: 'feature',
    description: `Implement the external-facing EHG website based on approved mockups, implementing the "narrative mask" positioning as a conservative micro-holdco.

**Pages (Approved):**
- Homepage: Text-only hero, conservative tone
- About: Four pillars with line icons (KEEP icons)
- Approach: Three columns, principle-based
- Ventures: Dynamic cards from database (NOT static examples)
- Contact: Selective inbound form

**Design Decisions (Chairman Approved):**
- About page icons: KEEP
- Venture cards: DYNAMIC (must pull from EHG ventures table)
- Color accent: DEEP NAVY

**Narrative Mask Requirements:**
- No AI mentions
- No platform language
- Ventures appear independent
- Selective contact language`,

    strategic_intent: 'Establish professional external presence with intentional positioning to avoid competitive attention',

    rationale: 'The external website establishes EHG\'s public presence with intentional positioning as a "boring holdco" to avoid competitive attention and regulatory curiosity. The mockups have been reviewed and approved.',

    scope: `1. Implement Homepage with conservative design
2. Implement About page with four pillars
3. Implement Approach page with three columns
4. Implement Ventures page with dynamic database-driven cards
5. Implement Contact page with selective form
6. Deploy to production domain
7. TESTING: E2E tests for all pages, accessibility tests, cross-browser tests, mobile responsiveness
8. DOCUMENTATION: Content management guide, deployment runbook, narrative mask compliance checklist`,

    strategic_objectives: [
      'Create professional external presence for EHG',
      'Implement narrative mask positioning',
      'Display real ventures from database',
      'Establish controlled inbound contact channel',
      'TESTING: Full E2E and accessibility test coverage for public-facing website',
      'DOCUMENTATION: Complete content management and deployment documentation'
    ],

    success_criteria: [
      'Visitors feel "reassured" not "impressed"',
      'No curiosity-generating elements',
      'Ventures appear independent',
      'Contact form filters appropriately',
      'TESTING: All pages pass accessibility audit, cross-browser tests, and mobile tests',
      'DOCUMENTATION: Content guide, deployment runbook, and narrative mask compliance checklist complete'
    ],

    key_changes: [
      'Homepage component with conservative design',
      'About page with four pillars and icons',
      'Approach page with three columns',
      'Ventures page with database integration',
      'Contact page with selective form'
    ],

    key_principles: [
      'Must connect to EHG ventures database',
      'Must match approved mockups',
      'No AI/platform language',
      'Deep navy accent color',
      'Single developer, existing hosting infrastructure'
    ],

    metadata: {
      source: 'Ground-Truth Triangulation Protocol',
      triangulation_date: '2026-01-08',
      track: 'B',
      estimated_effort_hours: 24,
      risks: [
        {
          type: 'design',
          description: 'Mockup translation may lose intended feel',
          probability: 'low',
          impact: 'medium',
          mitigation: 'Review each page against mockup before approval'
        },
        {
          type: 'content',
          description: 'Venture descriptions may reveal too much',
          probability: 'medium',
          impact: 'high',
          mitigation: 'Review all venture copy for mask compliance'
        }
      ],
      testing_requirements: {
        e2e_test_coverage_percent: 95,
        wcag_compliance_level: 'AA',
        lighthouse_performance_score: 90,
        lighthouse_accessibility_score: 95
      },
      design_decisions: {
        about_icons: 'KEEP',
        venture_cards: 'DYNAMIC',
        accent_color: 'DEEP_NAVY'
      }
    },

    created_by: 'LEAD-Triangulation',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // =========================================================================
  // Insert all SDs
  // =========================================================================

  const sds = [sd1, sd2, sd3, sd4];

  for (const sd of sds) {
    console.log(`\n📋 Inserting ${sd.id}: ${sd.title}...`);

    // Check if exists first
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', sd.id)
      .single();

    let result;
    if (existing) {
      // Update existing
      result = await supabase
        .from('strategic_directives_v2')
        .update(sd)
        .eq('id', sd.id)
        .select();

      if (result.error) {
        console.error(`❌ Error updating ${sd.id}:`, result.error.message);
        if (result.error.details) console.error('Details:', result.error.details);
      } else {
        console.log(`✅ ${sd.id} updated successfully`);
      }
    } else {
      // Insert new
      result = await supabase
        .from('strategic_directives_v2')
        .insert(sd)
        .select();

      if (result.error) {
        console.error(`❌ Error inserting ${sd.id}:`, result.error.message);
        if (result.error.details) console.error('Details:', result.error.details);
      } else {
        console.log(`✅ ${sd.id} inserted successfully`);
      }
    }
  }

  console.log('\n================================================================');
  console.log('🎉 Brainstorm SDs insertion complete!');
  console.log('\n📝 Next steps:');
  console.log('1. Run: npm run sd:next to see the queue');
  console.log('2. Pick an SD to work on');
  console.log('3. Run: node scripts/handoff.js execute LEAD-TO-PLAN <SD-ID>');
  console.log('\n📊 SDs Created:');
  console.log('- SD-GENESIS-FIX-001: Fix Genesis Pipeline (Track A, High Priority)');
  console.log('- SD-CAP-LEDGER-001: Capability Ledger (Track A, High Priority)');
  console.log('- SD-EVAL-MATRIX-001: Evaluation Matrix (Track B, High Priority)');
  console.log('- SD-EHG-WEBSITE-001: External Website (Track B, Medium Priority)');
}

addBrainstormSDsToDatabase().catch(console.error);
