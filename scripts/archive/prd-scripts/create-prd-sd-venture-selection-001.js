#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-VENTURE-SELECTION-001 with your SD ID (e.g., SD-AUTH-001)
 *   3. Fill in PRD details
 *   4. Run: node scripts/create-prd-sd-XXX.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

// ============================================================================
// CONFIGURATION - Update these values
// ============================================================================

const SD_ID = 'SD-VENTURE-SELECTION-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Configurable Venture Selection Framework with Chairman Settings'; // TODO: Replace with your PRD title

// ============================================================================
// Supabase Client Setup
// ============================================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ============================================================================
// Main Function
// ============================================================================

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // -------------------------------------------------------------------------
  // STEP 1: Fetch Strategic Directive UUID (CRITICAL for handoff validation)
  // -------------------------------------------------------------------------

  console.log('\n1️⃣  Fetching Strategic Directive...');

  // SD ID Schema Cleanup: Use SD.id directly (uuid_id is deprecated)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   ID: ${sdData.id}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object (Use only valid schema fields)
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    // SD ID Schema Cleanup: sd_uuid column was DROPPED (2025-12-12)
    // sd_id is now the canonical FK to strategic_directives_v2.id
    id: prdId,
    sd_id: SD_ID,                   // FK to strategic_directives_v2.id (canonical)
    directive_id: SD_ID,            // Backward compatibility

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',              // draft, planning, in_progress, testing, approved, completed, archived
    category: 'product_feature',
    priority: 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
This is a PARENT/ORCHESTRATOR Strategic Directive that establishes a configurable framework for venture selection decisions. The framework replaces ad-hoc decision-making with a systematic, data-driven approach that respects the Chairman's strategic preferences.

The implementation is decomposed into 5 child SDs:
- SD-VS-CHAIRMAN-SETTINGS-001: Configuration System (foundational)
- SD-VS-PATTERN-UNLOCK-001: Pattern Library Expansion (can parallel with A)
- SD-VS-SCORING-RUBRIC-001: Scoring Engine (after A)
- SD-VS-RESEARCH-ARM-001: Research Pipeline Integration (after A+C)
- SD-VS-GLIDE-PATH-001: Portfolio Dashboard (final)

Origin: Triangulation Research (OpenAI + Gemini + Claude Code) - January 2026
    `.trim(),

    business_context: `
PROBLEM: Chairman currently evaluates venture opportunities through ad-hoc processes with no consistent scoring or configuration. Settings are stored in localStorage (unreliable), and there's no automated research pipeline.

SOLUTION: A configurable framework where:
- Chairman Settings persist to database with sensible defaults
- Scoring engine evaluates opportunities against configurable weights
- Pattern library tracks build capabilities (current: 45 patterns)
- Research arm automates opportunity discovery and ranking

SUCCESS METRICS:
- Time to evaluate: < 5 minutes (vs ad-hoc)
- Pattern library: +4 patterns (10% increase)
- Weekly digest: Auto-generated
- Scoring alignment: ≥80% with Chairman intuition
    `.trim(),

    technical_context: `
EXISTING INFRASTRUCTURE:
- Chairman Settings UI exists (7-tab interface) but uses localStorage fallback
- Pattern library: 45 patterns documented in scaffold_patterns table
- CrewAI: Venture Research Crew and Venture Quick Validation Crew exist
- useChairmanConfig hook: Falls back to localStorage (error 42P01 - table missing)

CRITICAL BLOCKERS (from triangulation):
- BLOCKER-001: chairman_dashboard_config table does not exist
- BLOCKER-002: blueprintScoring.ts uses hardcoded weights (0.4/0.4/0.2)
- BLOCKER-003: Missing StripeService and BackgroundJob patterns

TECH STACK: React 18, TypeScript, Supabase, Tailwind, Shadcn UI
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Chairman Settings Database Persistence',
        description: 'Create chairman_settings table and migrate from localStorage to database storage',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'chairman_settings table exists with correct schema',
          'Settings persist across browser sessions',
          'RLS policies restrict access to authenticated users'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Configurable Scoring Engine',
        description: 'Replace hardcoded weights in blueprintScoring.ts with database-driven configuration',
        priority: 'HIGH',
        acceptance_criteria: [
          'Scoring weights read from chairman_settings',
          'Scores update when settings change',
          'Score breakdown visible in UI'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Pattern Library Expansion',
        description: 'Add 4 critical patterns: StripeService, RBACMiddleware, useCRUD, BackgroundJob',
        priority: 'HIGH',
        acceptance_criteria: [
          'All 4 patterns have template_code in scaffold_patterns',
          'Patterns include variables and dependencies',
          'Patterns documented with usage examples'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Research Pipeline Automation',
        description: 'Integrate opportunity intake with scoring and weekly digest generation',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Weekly Top 3 opportunities digest generated',
          'CrewAI integration hooks functional',
          'Opportunity brief template populated'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Glide Path Dashboard',
        description: 'Visualize portfolio phase, pattern maturity, and venture mix',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Current glide path phase displayed',
          'Pattern maturity chart by category',
          'Exploit/explore ratio visualization'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Settings load time',
        target_metric: '<500ms from database'
      },
      {
        type: 'security',
        requirement: 'RLS enforcement',
        target_metric: 'All tables have RLS policies for authenticated users'
      },
      {
        type: 'usability',
        requirement: 'Sensible defaults',
        target_metric: 'Framework works out-of-box without configuration'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Database Schema',
        description: 'Create chairman_settings and venture_opportunity_scores tables',
        dependencies: ['Supabase PostgreSQL', 'RLS policies']
      },
      {
        id: 'TR-2',
        requirement: 'Pattern Template Standards',
        description: 'All patterns must follow scaffold_patterns schema with template_code, variables, dependencies',
        dependencies: ['scaffold_patterns table']
      }
    ],

    // Architecture & Design
    system_architecture: `
## Architecture Overview
This is an ORCHESTRATOR SD - the parent coordinates 5 child SDs:
- Child A: Chairman Settings (database + UI)
- Child B: Pattern Unlock (scaffold_patterns expansion)
- Child C: Scoring Rubric (scoring engine + UI)
- Child D: Research Arm (CrewAI pipeline integration)
- Child E: Glide Path (dashboard visualization)

## Data Flow
1. Chairman Settings → stored in chairman_settings table
2. Opportunities → scored by scoring engine using settings weights
3. Research Arm → enriches opportunities, applies scoring
4. Dashboard → displays glide path, pattern maturity, portfolio mix

## Integration Points
- useChairmanConfig hook: Reads settings from database
- blueprintScoring.ts: Uses configurable weights
- Venture Research Crew (CrewAI): Triggers research pipeline
- scaffold_patterns table: Pattern library source of truth
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'chairman_settings',
          columns: ['id', 'user_id', 'risk_tolerance', 'pattern_threshold', 'exploit_ratio', 'explore_ratio', 'settings_json', 'created_at', 'updated_at'],
          relationships: ['FK to auth.users']
        },
        {
          name: 'venture_opportunity_scores',
          columns: ['id', 'opportunity_id', 'total_score', 'feedback_speed_score', 'pattern_match_score', 'market_demand_score', 'weights_used', 'scored_at'],
          relationships: ['FK to venture_opportunities']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: '/api/chairman-settings',
        method: 'GET/PUT',
        description: 'CRUD operations for chairman settings',
        request: { user_id: 'uuid' },
        response: { settings: 'ChairmanSettings object' }
      },
      {
        endpoint: '/api/opportunity-scores',
        method: 'GET/POST',
        description: 'Score opportunities using current settings weights',
        request: { opportunity_id: 'uuid' },
        response: { score_breakdown: 'ScoreBreakdown object' }
      }
    ],

    ui_ux_requirements: [
      {
        component: 'ChairmanSettingsPanel',
        description: 'Settings UI with risk tolerance, pattern threshold, exploit/explore ratio controls',
        wireframe: 'Existing 7-tab interface - needs database connection'
      },
      {
        component: 'GlidePathDashboard',
        description: 'Portfolio visualization showing phase, pattern maturity, venture mix',
        wireframe: 'New component - progressive disclosure design'
      }
    ],

    // Implementation
    implementation_approach: `
## Phase A: SD-VS-CHAIRMAN-SETTINGS-001 (Foundational)
- Create chairman_settings table migration
- Update useChairmanConfig to use database instead of localStorage
- Add RLS policies

## Phase B: SD-VS-PATTERN-UNLOCK-001 (Can parallel with A)
- Add StripeService, RBACMiddleware, useCRUD, BackgroundJob to scaffold_patterns
- Include template_code, variables, dependencies for each

## Phase C: SD-VS-SCORING-RUBRIC-001 (After A)
- Create venture_opportunity_scores table
- Implement scoring engine using chairman_settings weights
- Replace hardcoded values in blueprintScoring.ts

## Phase D: SD-VS-RESEARCH-ARM-001 (After A+C)
- Integrate scoring with Venture Research Crew
- Implement weekly digest generator
- Create opportunity brief template

## Phase E: SD-VS-GLIDE-PATH-001 (Final)
- Build GlidePathDashboard component
- Pattern maturity visualization
- Portfolio mix chart
    `.trim(),

    technology_stack: [
      'React 18',
      'TypeScript 5',
      'Vite',
      'Shadcn UI',
      'Supabase PostgreSQL'
      // Add specific technologies for this PRD
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'TODO: Internal dependency',
        status: 'completed', // completed, in_progress, blocked
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Chairman Settings Persistence',
        description: 'Verify settings save to database and load correctly',
        expected_result: 'Settings persist across browser sessions without localStorage fallback',
        test_type: 'e2e'
      },
      {
        id: 'TS-2',
        scenario: 'Scoring Engine Calculation',
        description: 'Verify opportunity scores use configurable weights from settings',
        expected_result: 'Score breakdown matches expected calculation based on settings weights',
        test_type: 'unit'
      },
      {
        id: 'TS-3',
        scenario: 'Pattern Library Expansion',
        description: 'Verify 4 new patterns exist with complete template_code',
        expected_result: 'StripeService, RBACMiddleware, useCRUD, BackgroundJob in scaffold_patterns',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'All 5 child SDs completed through full LEAD→PLAN→EXEC cycle',
      'chairman_settings table exists with RLS policies',
      'useChairmanConfig reads from database (no localStorage fallback)',
      'Scoring engine uses configurable weights',
      '4 new patterns added to scaffold_patterns',
      'Unit tests passing',
      'E2E tests for settings persistence passing'
    ],

    performance_requirements: {
      page_load_time: '<2s',
      api_response_time: '<500ms',
      concurrent_users: 100
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: false },
      { text: 'Technical architecture defined', checked: false },
      { text: 'Implementation approach documented', checked: false },
      { text: 'Test scenarios defined', checked: false },
      { text: 'Acceptance criteria established', checked: false },
      { text: 'User stories generated (STORIES sub-agent)', checked: false },
      { text: 'Database schema reviewed (DATABASE sub-agent)', checked: false },
      { text: 'Security assessment completed (SECURITY sub-agent)', checked: false }
    ],

    exec_checklist: [
      { text: 'Development environment setup', checked: false },
      { text: 'Core functionality implemented', checked: false },
      { text: 'Unit tests written and passing', checked: false },
      { text: 'E2E tests written and passing', checked: false },
      { text: 'Code review completed', checked: false },
      { text: 'Documentation updated', checked: false },
      { text: 'Performance requirements validated', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Performance requirements validated', checked: false },
      { text: 'Security review completed', checked: false },
      { text: 'User acceptance testing passed', checked: false },
      { text: 'Deployment readiness confirmed', checked: false }
    ],

    // Progress Tracking
    progress: 10, // 0-100
    phase: 'planning', // planning, design, implementation, verification, approval
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 10,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    // Risks & Constraints
    risks: [
      {
        category: 'Technical',
        risk: 'TODO: Potential risk',
        severity: 'MEDIUM', // LOW, MEDIUM, HIGH, CRITICAL
        probability: 'MEDIUM', // LOW, MEDIUM, HIGH
        impact: 'TODO: Impact if risk occurs',
        mitigation: 'TODO: How to prevent/handle'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'TODO: Technical constraint',
        impact: 'TODO: How this limits the solution'
      }
    ],

    assumptions: [
      {
        assumption: 'TODO: What we\'re assuming',
        validation_method: 'TODO: How to validate this assumption'
      }
    ],

    // Stakeholders & Timeline
    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning',
        involvement_level: 'high'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks

    // Metadata (for custom fields that don't fit schema)
    metadata: {
      // Store custom fields here that aren't in the official schema
      // Examples:
      // ui_components: [...],
      // success_metrics: [...],
      // database_changes: {...},
      // estimated_hours: 40,
      // etc.
    },

    // Audit Trail
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // -------------------------------------------------------------------------
  // STEP 3: Validate PRD Data (CRITICAL - catches schema mismatches)
  // -------------------------------------------------------------------------

  console.log('\n3️⃣  Validating PRD schema...');

  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.valid) {
    console.error('\n❌ PRD validation failed!');
    console.error('   Fix the errors above before inserting to database');
    process.exit(1);
  }

  console.log('✅ PRD schema validation passed!');

  // -------------------------------------------------------------------------
  // STEP 4: Check if PRD already exists
  // -------------------------------------------------------------------------

  console.log('\n4️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status, created_at')
    .eq('id', prdId)
    .single();

  if (existing) {
    console.warn(`⚠️  PRD ${prdId} already exists!`);
    console.log(`   Created: ${existing.created_at}`);
    console.log(`   Status: ${existing.status}`);
    console.log('\n   Options:');
    console.log('   1. Delete the existing PRD first');
    console.log('   2. Use an UPDATE script instead');
    console.log('   3. Change the SD_ID to create a different PRD');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 5: Insert PRD into database
  // -------------------------------------------------------------------------

  console.log('\n5️⃣  Inserting PRD into database...');

  const { data: insertedPRD, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (insertError) {
    console.error('❌ Failed to insert PRD:', insertError.message);
    console.error('   Code:', insertError.code);
    console.error('   Details:', insertError.details);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 6: Success!
  // -------------------------------------------------------------------------

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD ID: ${insertedPRD.sd_id || insertedPRD.sd_uuid}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Phase: ${insertedPRD.phase}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Update TODO items in PRD (executive_summary, requirements, etc.)');
  console.log('   2. Run STORIES sub-agent: node scripts/create-user-stories-[sd-id].mjs');
  console.log('   3. Run DATABASE sub-agent: node scripts/database-architect-schema-review.js');
  console.log('   4. Run SECURITY sub-agent: node scripts/security-architect-assessment.js');
  console.log('   5. Mark plan_checklist items as complete');
  console.log('   6. Create PLAN→EXEC handoff when ready');
  console.log('');
}

// ============================================================================
// Execute
// ============================================================================

createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  console.error(error.stack);
  process.exit(1);
});
