#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-MKT-DISTRIBUTION-001 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-MKT-DISTRIBUTION-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Scheduler + UTM Governance'; // TODO: Replace with your PRD title

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
    category: 'feature',
    priority: 'medium', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
      The Scheduler + UTM Governance module provides automated content distribution scheduling and
      UTM parameter management for reliable marketing attribution. The scheduling queue allows
      ventures to queue posts by channel and date, while the UTM builder enforces naming conventions
      and validates parameters before publish. A campaign ledger logs all distribution activity
      for downstream ROI attribution.

      This eliminates manual daily posting work and ensures all campaign links have proper UTM
      parameters for attribution tracking. The campaign ledger provides a complete audit trail
      of what content ran, where, and when - enabling accurate ROI calculation in SD-MKT-ROI-001.
    `.trim(),

    business_context: `
      **Pain Points:**
      - Manual posting requires daily attention and is error-prone
      - Inconsistent UTM parameters break ROI attribution
      - No centralized record of what campaigns ran and where

      **Objectives:**
      - Automate content distribution scheduling
      - Enforce UTM naming standards for reliable attribution
      - Create audit trail for campaign distribution

      **Success Metrics:**
      - ≥90% of campaign links have valid UTM parameters
      - 100% of publishes logged in campaign ledger
      - ≥95% posting reliability rate
    `.trim(),

    technical_context: `
      **Existing Systems:**
      - Content Forge (SD-MKT-CONTENT-001) generates content to be scheduled
      - ROI Dashboard (SD-MKT-ROI-001) consumes attribution data
      - Supabase PostgreSQL for data storage

      **Architecture Patterns:**
      - React Query for data fetching with optimistic updates
      - Shadcn UI components for consistent design
      - RLS policies for venture-scoped access

      **Integration Points:**
      - Content system provides content to schedule
      - UTM parameters flow to ROI attribution
      - No external platform posting (out of scope for this SD)
    `.trim(),

    // Requirements (JSONB arrays)
    // CRITICAL: Minimum 3 functional requirements required by database constraint
    // PRD validation will FAIL if fewer than 3 requirements are provided
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Scheduling Queue with Venture/Channel Organization',
        description: 'Create a scheduling system that allows users to queue content for future distribution, organized by venture, channel, and scheduled date/time.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'User can create a scheduled post with venture, channel, date/time, and content',
          'Scheduled posts display in a calendar or list view by date',
          'User can edit or delete scheduled posts before publish time',
          'Posts organized by venture and channel for filtering'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'UTM Builder and Validator',
        description: 'Implement a UTM parameter builder that enforces naming conventions and validates all campaign links before publish.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'UTM builder generates utm_source, utm_medium, utm_campaign, utm_content parameters',
          'Validator rejects links without required UTM parameters',
          'Auto-fix option adds default UTM parameters to non-compliant links',
          'UTM naming conventions documented and enforced'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Campaign Ledger for Distribution Tracking',
        description: 'Log all published content with campaign metadata for audit trail and ROI attribution.',
        priority: 'HIGH',
        acceptance_criteria: [
          'Every publish event logged with timestamp, venture, channel, content reference',
          'UTM parameters stored with each ledger entry',
          'Ledger entries queryable for ROI dashboard consumption',
          'Historical data retained for attribution analysis'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Scheduling Dashboard UI',
        description: 'Provide a dashboard for viewing and managing scheduled content across ventures and channels.',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Dashboard shows upcoming scheduled posts in chronological order',
          'Filter by venture, channel, or date range',
          'Bulk actions for rescheduling or canceling posts',
          'Status indicators for scheduled, published, failed states'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Dashboard loads within 2 seconds',
        target_metric: '<2s initial page load, <500ms for filter operations'
      },
      {
        type: 'reliability',
        requirement: 'Scheduling queue maintains data integrity',
        target_metric: '≥95% successful publish rate, no lost scheduled posts'
      },
      {
        type: 'security',
        requirement: 'Venture-scoped data access via RLS',
        target_metric: 'Users can only access their own venture schedules'
      },
      {
        type: 'usability',
        requirement: 'Intuitive UTM builder interface',
        target_metric: 'Users can build valid UTM links in <30 seconds'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Database schema for scheduling and UTM',
        description: 'Create scheduled_posts and campaign_ledger tables with proper indexes and RLS',
        dependencies: ['Supabase PostgreSQL', 'RLS policies']
      },
      {
        id: 'TR-2',
        requirement: 'React Query for data management',
        description: 'Use React Query for fetching, caching, and optimistic updates of scheduled posts',
        dependencies: ['@tanstack/react-query', 'supabase-js']
      },
      {
        id: 'TR-3',
        requirement: 'Shadcn UI components',
        description: 'Use Shadcn Calendar, Dialog, Form components for consistent UI',
        dependencies: ['shadcn/ui', 'react-hook-form', 'zod']
      }
    ],

    // Architecture & Design
    system_architecture: `
      ## Architecture Overview
      - SchedulerDashboardPage: Main page with calendar view, scheduled posts list, and create form
      - UTMBuilderDialog: Modal for building and validating UTM parameters
      - ScheduledPostCard: Card component displaying post details with edit/delete actions
      - CampaignLedgerTable: Read-only table showing published content history

      ## Data Flow
      1. User creates scheduled post via form → Insert to scheduled_posts table
      2. UTM builder validates/generates parameters → Stored with scheduled post
      3. On publish time, post moves to campaign_ledger → Available for ROI queries
      4. ROI Dashboard queries campaign_ledger for attribution data

      ## Integration Points
      - Supabase PostgreSQL: scheduled_posts, campaign_ledger tables
      - Content Forge: Provides content references for scheduling
      - ROI Dashboard: Consumes campaign_ledger for attribution
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'scheduled_posts',
          columns: ['id', 'venture_id', 'channel', 'content_id', 'scheduled_at', 'utm_params', 'status', 'created_at'],
          relationships: ['ventures(venture_id)', 'content(content_id)']
        },
        {
          name: 'campaign_ledger',
          columns: ['id', 'venture_id', 'channel', 'content_id', 'published_at', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content'],
          relationships: ['ventures(venture_id)', 'scheduled_posts(scheduled_post_id)']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: 'scheduled_posts',
        method: 'SELECT',
        description: 'Fetch scheduled posts for current venture',
        request: { venture_id: 'uuid', status: 'scheduled|published|cancelled' },
        response: { data: 'ScheduledPost[]' }
      },
      {
        endpoint: 'campaign_ledger',
        method: 'SELECT',
        description: 'Fetch campaign ledger entries for ROI attribution',
        request: { venture_id: 'uuid', date_range: 'DateRange' },
        response: { data: 'LedgerEntry[]' }
      }
    ],

    ui_ux_requirements: [
      {
        component: 'SchedulerDashboardPage',
        description: 'Main page with calendar view, scheduled posts list, and create/edit capabilities',
        wireframe: 'Calendar grid with scheduled posts, filter sidebar, create button'
      },
      {
        component: 'UTMBuilderDialog',
        description: 'Modal for generating and validating UTM parameters with auto-fill defaults',
        wireframe: 'Form with source, medium, campaign, content fields and preview URL'
      },
      {
        component: 'CampaignLedgerTable',
        description: 'Paginated table showing published campaigns with UTM parameters',
        wireframe: 'DataTable with venture, channel, date, UTM columns and export'
      }
    ],

    // Implementation
    implementation_approach: `
      ## Phase 1: Foundation
      - Create scheduled_posts and campaign_ledger tables with RLS policies
      - Implement useScheduledPosts hook with React Query
      - Create basic SchedulerDashboardPage layout

      ## Phase 2: Feature Development
      - Build ScheduledPostForm for creating/editing scheduled posts
      - Implement UTMBuilderDialog with validation logic
      - Create CampaignLedgerTable with filtering and pagination

      ## Phase 3: Testing & Deployment
      - Write E2E tests for scheduling workflow and UTM validation
      - Verify RLS policies restrict data to venture scope
      - Test integration with ROI Dashboard attribution
    `.trim(),

    technology_stack: [
      'React 18',
      'TypeScript 5',
      'Vite',
      'Shadcn UI (Calendar, Dialog, Form, Table)',
      'Supabase PostgreSQL',
      '@tanstack/react-query',
      'react-hook-form',
      'zod',
      'date-fns'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'SD-MKT-CONTENT-001 (Content Forge)',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'ventures table schema',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Schedule a post for future date',
        description: 'User creates a scheduled post with valid content and future date',
        expected_result: 'Post appears in scheduled list with pending status',
        test_type: 'e2e'
      },
      {
        id: 'TS-2',
        scenario: 'UTM validation rejects invalid links',
        description: 'User tries to schedule a post with link missing UTM parameters',
        expected_result: 'Validation error shown, UTM builder opens for correction',
        test_type: 'e2e'
      },
      {
        id: 'TS-3',
        scenario: 'Campaign ledger records published post',
        description: 'When a scheduled post is marked as published',
        expected_result: 'Entry appears in campaign ledger with UTM parameters',
        test_type: 'integration'
      },
      {
        id: 'TS-4',
        scenario: 'Venture isolation via RLS',
        description: 'User can only see scheduled posts for their venture',
        expected_result: 'Query returns only posts matching user venture_id',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'All 4 functional requirements implemented and verified',
      'E2E tests passing for scheduling workflow',
      'UTM builder validates and auto-corrects links',
      'Campaign ledger populated on publish',
      'RLS policies enforced for venture-scoped access',
      'Performance: Dashboard loads <2s'
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
        risk: 'Platform API bans from automated posting',
        severity: 'HIGH',
        probability: 'MEDIUM',
        impact: 'Unable to publish to certain channels',
        mitigation: 'Rate limiting, human-like delays, human approval for risky channels'
      },
      {
        category: 'Data Quality',
        risk: 'Invalid UTM parameters break ROI attribution',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'Inaccurate ROI calculations in dashboard',
        mitigation: 'Strict validation schema with auto-correction and defaults'
      },
      {
        category: 'Operational',
        risk: 'Scheduled posts fail silently',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Missed content distribution windows',
        mitigation: 'Status tracking with retry logic and failure notifications'
      }
    ],

    constraints: [
      {
        type: 'scope',
        constraint: 'No external platform posting APIs in this SD',
        impact: 'Scheduler prepares content but actual posting is a separate integration'
      },
      {
        type: 'technical',
        constraint: 'Must use existing Supabase infrastructure',
        impact: 'Database design within PostgreSQL capabilities'
      }
    ],

    assumptions: [
      {
        assumption: 'Content exists in content system before scheduling',
        validation_method: 'Content ID foreign key constraint'
      },
      {
        assumption: 'Users have venture_id for RLS scoping',
        validation_method: 'Auth context includes venture_id claim'
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
      exploration_summary: [
        {
          file_path: '../ehg/src/hooks/useROIDashboardData.ts',
          purpose: 'Understand React Query + Supabase hook pattern for dashboard data',
          key_findings: 'Uses useQuery with staleTime, fetches from multiple tables, falls back to mock data on error. Good pattern to follow for useScheduledPosts hook.'
        },
        {
          file_path: '../ehg/src/pages/ROIDashboardPage.tsx',
          purpose: 'Review dashboard page structure for scheduler dashboard',
          key_findings: 'Uses grid layout, card components, filter controls, loading states. Similar structure for SchedulerDashboardPage.'
        },
        {
          file_path: '../ehg/src/integrations/supabase/types.ts',
          purpose: 'Check existing table types for ventures and content references',
          key_findings: 'ventures table has id, name, status. Will need to add scheduled_posts and campaign_ledger types.'
        },
        {
          file_path: '../ehg/src/pages/content-forge/ContentForgePage.tsx',
          purpose: 'Understand content structure for scheduling integration',
          key_findings: 'Content has id, title, body, venture_id. Can use content_id as foreign key in scheduled_posts.'
        },
        {
          file_path: '../ehg/src/components/ui/calendar.tsx',
          purpose: 'Review existing calendar component for scheduler UI',
          key_findings: 'Shadcn calendar component available. Can use for date picker in scheduling form.'
        }
      ],
      ui_components: ['SchedulerDashboardPage', 'UTMBuilderDialog', 'ScheduledPostCard', 'CampaignLedgerTable'],
      database_changes: {
        new_tables: ['scheduled_posts', 'campaign_ledger'],
        new_columns: [],
        migrations_required: true
      },
      estimated_hours: 4
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
  // STEP 6: Auto-invoke PLAN phase sub-agents (Gap #1 Fix)
  // -------------------------------------------------------------------------

  console.log('\n6️⃣  Auto-invoking PLAN phase sub-agents...');

  try {
    // Dynamic import to avoid circular dependencies
    const { orchestrate } = await import('./orchestrate-phase-subagents.js');
    const orchestrationResult = await orchestrate('PLAN_PRD', SD_ID, { autoRemediate: true });

    if (orchestrationResult.status === 'PASS' || orchestrationResult.status === 'COMPLETE') {
      console.log(`   ✅ Sub-agents completed: ${orchestrationResult.executed?.join(', ') || 'All required'}`);
    } else if (orchestrationResult.status === 'PARTIAL') {
      console.log(`   ⚠️  Some sub-agents had issues: ${JSON.stringify(orchestrationResult.summary)}`);
    } else {
      console.log(`   ⚠️  Sub-agent orchestration status: ${orchestrationResult.status}`);
      console.log('   You may need to run sub-agents manually for full compliance');
    }
  } catch (orchestrationError) {
    console.warn('   ⚠️  Sub-agent auto-invocation failed:', orchestrationError.message);
    console.log('   Sub-agents can be run manually later with:');
    console.log(`      node scripts/orchestrate-phase-subagents.js PLAN_PRD ${SD_ID}`);
  }

  // -------------------------------------------------------------------------
  // STEP 7: Success Summary
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
  console.log('   2. Verify sub-agent results in database (auto-invoked above)');
  console.log('   3. Mark plan_checklist items as complete');
  console.log('   4. Create PLAN→EXEC handoff when ready');
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
