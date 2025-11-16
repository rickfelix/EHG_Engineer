#!/usr/bin/env node

/**
 * PRD Creation Script for SD-STAGE4-AI-FIRST-UX-001
 * AI-First Competitive Intelligence UX
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const SD_ID = 'SD-STAGE4-AI-FIRST-UX-001';
const PRD_TITLE = 'AI-First Competitive Intelligence UX - Technical Implementation';

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

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, priority, category')
    .eq('id', SD_ID)
    .single();

  if (sdError) {
    console.error('❌ Error fetching SD:', sdError);
    process.exit(1);
  }

  if (!sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found`);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   Status: ${sdData.status} | Phase: ${sdData.current_phase}`);

  const directiveId = sdData.id; // This is the UUID

  // -------------------------------------------------------------------------
  // STEP 2: Check for Existing PRD
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Checking for existing PRD...');

  const { data: existingPRD } = await supabase
    .from('product_requirements_v2')
    .select('id, title')
    .eq('directive_id', SD_ID)
    .single();

  if (existingPRD) {
    console.log(`⚠️  PRD already exists: ${existingPRD.title}`);
    console.log('   To update, please use update-prd script');
    process.exit(0);
  }

  console.log('✅ No existing PRD found, proceeding with creation...');

  // -------------------------------------------------------------------------
  // STEP 3: Build PRD Data Object
  // -------------------------------------------------------------------------

  console.log('\n3️⃣  Building PRD data...');

  const prdData = {
    // Primary Keys (REQUIRED)
    id: `PRD-${SD_ID}`,
    sd_uuid: 'cdf1bd82-5656-4454-8f36-01103bafa99e', // UUID from strategic_directives_v2
    sd_id: SD_ID, // Mirror for compatibility
    directive_id: SD_ID, // Deprecated but included for compatibility

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    category: sdData.category || 'feature',
    status: 'draft',
    priority: sdData.priority || 'high',
    phase: 'planning', // Must be one of: planning, design, implementation, verification, approval
    progress: 0,

    // Executive & Context (using correct field names)
    business_context: `The current Stage 4 (Competitive Intelligence) UI is manual-first, requiring users to enter competitor data manually. The AI agent capabilities that auto-research competitors are hidden and triggered silently in the background. This inverts EHG's value proposition as an AI-powered platform. Users have explicitly stated they will not manually enter competitor information.`,

    executive_summary: `Transform Stage 4 to showcase EHG's AI capabilities by auto-starting competitor analysis on page load, providing prominent progress tracking, and relegating manual entry to an advanced fallback option. This aligns with the product positioning as an AI-powered venture building platform and meets explicit user expectations.`,

    technical_context: `Stage 4 currently uses the CompetitiveIntelligence.tsx component with hidden AI agent triggers. The Agent Platform has operational CrewAI agents for competitive analysis but lacks UI visibility. venture_drafts.research_results (JSONB) exists for storing results, but real-time progress tracking infrastructure is missing.`,

    // Requirements (using JSONB fields per schema)
    functional_requirements: [
      {
        requirement: 'Auto-start AI agent analysis on Stage 4 page load',
        description: 'When user navigates to Stage 4, AI competitive analysis should automatically begin without requiring user action',
        acceptance_criteria: [
          'useEffect hook triggers ventureResearch.startAgentAnalysis() on mount',
          'API call to /api/agents/start made within 2 seconds of page load',
          'No user click required to initiate analysis'
        ]
      },
      {
        requirement: 'Display prominent AI progress card with task breakdown',
          description: 'Show real-time progress of AI agents with task-level granularity and live activity feed',
          acceptance_criteria: [
            'Progress card prominently displayed at top of Stage 4',
            'Shows current task name and completion percentage',
            'Expandable activity log displays agent actions in real-time',
            'Updates visible within 5 seconds of agent task transitions'
          ]
        },
        {
          requirement: 'Block navigation during AI analysis with skip option',
          description: 'Prevent users from moving forward/backward during analysis but provide explicit skip capability',
          acceptance_criteria: [
            'Next/Back navigation buttons disabled when agent_status = "running"',
            'Skip button appears after 10 seconds of analysis',
            'Skip button shows confirmation modal before proceeding',
            'Navigation re-enabled when analysis completes or user skips'
          ]
        },
        {
          requirement: 'Hide manual competitor entry in Advanced Settings',
          description: 'Move manual data entry forms to collapsed accordion labeled as advanced option',
          acceptance_criteria: [
            'Manual entry forms moved to "Advanced Settings" accordion',
            'Accordion collapsed by default',
            'Accordion labeled "Manual Entry (Advanced)"',
            'Forms remain fully functional when expanded'
          ]
        }
      ]
    ],

    non_functional_requirements: [
      {
        requirement: 'Progress update latency',
        target_metric: '≤5 seconds from agent state change to UI update'
      },
      {
        requirement: 'Polling interval efficiency',
        target_metric: '3-second polling interval for progress updates'
      },
      {
        requirement: 'Skip button appearance timing',
        target_metric: 'Appears within 1 second of 10-second threshold'
      },
      {
        requirement: 'Secure agent execution tracking',
        target_metric: 'RLS policies on agent_execution_logs table'
      },
      {
        requirement: 'Prevent unauthorized progress access',
        target_metric: 'User can only view progress for their own ventures'
      }
    ],

    // Technical Specifications
    technical_specifications: {
      requirements: [
        {
          requirement: 'Create agent_execution_logs table',
          description: 'New database table to track agent progress for UI display',
          dependencies: ['Supabase PostgreSQL', 'RLS policies']
        },
        {
          requirement: 'Implement progress polling service',
          description: 'Frontend service to poll /api/agents/execution-logs endpoint',
          dependencies: ['ventureResearch.ts', 'React hooks']
        },
        {
          requirement: 'Update CompetitiveIntelligence.tsx component',
          description: 'Refactor to support auto-start and progress tracking',
          dependencies: ['React', 'Shadcn UI', 'useCompetitiveIntelligence hook']
        }
      ],

      architecture: `The solution uses a polling-based architecture where the React frontend polls a new API endpoint for agent execution progress. The agent_execution_logs table serves as the source of truth for progress data, populated by the Agent Platform during execution.`,

      data_flow: `1. User navigates to Stage 4 → 2. useEffect triggers agent start → 3. Agent Platform begins execution → 4. Progress written to agent_execution_logs → 5. Frontend polls for updates → 6. Progress card displays real-time status → 7. Results saved to venture_drafts.research_results`,

      dependencies: `External: Agent Platform (Python/CrewAI), Supabase Edge Functions. Internal: ventureResearch service, useCompetitiveIntelligence hook, CompetitiveIntelligence component`
    },

    // Database Schema
    database_schema: {
      changes: [
        {
          type: 'create_table',
          name: 'agent_execution_logs',
          description: 'Track AI agent execution progress for real-time UI updates',
          columns: [
            { name: 'id', type: 'uuid', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'venture_id', type: 'uuid', constraints: 'REFERENCES ventures(id) ON DELETE CASCADE' },
            { name: 'agent_type', type: 'text', constraints: 'NOT NULL' },
            { name: 'task_name', type: 'text', constraints: 'NOT NULL' },
            { name: 'status', type: 'text', constraints: "CHECK (status IN ('pending', 'running', 'completed', 'failed'))" },
            { name: 'progress', type: 'integer', constraints: 'DEFAULT 0 CHECK (progress >= 0 AND progress <= 100)' },
            { name: 'activity_log', type: 'jsonb', constraints: 'DEFAULT \'[]\'::jsonb' },
            { name: 'error_message', type: 'text', constraints: null },
            { name: 'started_at', type: 'timestamp with time zone', constraints: 'DEFAULT now()' },
            { name: 'completed_at', type: 'timestamp with time zone', constraints: null },
            { name: 'created_at', type: 'timestamp with time zone', constraints: 'DEFAULT now()' },
            { name: 'updated_at', type: 'timestamp with time zone', constraints: 'DEFAULT now()' }
          ]
        }
      ],
      migrations: [
        {
          type: 'add_rls',
          table: 'agent_execution_logs',
          policy: 'Users can only view logs for their own ventures'
        }
      ]
    },

    // Implementation Details
    implementation_approach: {
      overview: 'Four-phase implementation focusing on UI restructure, agent integration, results display, and error handling',

      phases: [
        {
          name: 'Phase 1: UI Restructure',
          duration: '2-3 days',
          activities: [
            'Move manual entry to Advanced Settings accordion',
            'Create prominent AI progress card component',
            'Implement navigation blocking logic'
          ]
        },
        {
          name: 'Phase 2: Agent Integration & Progress Tracking',
          duration: '2-3 days',
          activities: [
            'Create agent_execution_logs table with migrations',
            'Implement progress API endpoint',
            'Add polling service to ventureResearch.ts',
            'Connect progress updates to UI'
          ]
        },
        {
          name: 'Phase 3: Results Display',
          duration: '1-2 days',
          activities: [
            'Update 6-tab results UI to consume AI data',
            'Handle data transformation from agent format',
            'Implement loading states for each tab'
          ]
        },
        {
          name: 'Phase 4: Error Handling',
          duration: '1 day',
          activities: [
            'Implement graceful fallback to manual entry',
            'Add retry mechanism for failed agents',
            'Create explicit skip functionality',
            'Add error notifications'
          ]
        }
      ],

      validation_approach: 'Component-level unit tests for progress tracking, integration tests for API endpoints, E2E tests for complete user flows including auto-start, progress visibility, and navigation blocking'
    },

    // Test Scenarios
    test_scenarios: [
      {
        scenario: 'Auto-start on page load',
        steps: [
          'Navigate to Stage 4',
          'Observe agent execution starts automatically',
          'Verify API call made within 2 seconds'
        ],
        expected_outcome: 'AI analysis begins without user interaction',
        test_type: 'e2e'
      },
      {
        scenario: 'Progress tracking visibility',
        steps: [
          'Start AI analysis',
          'Monitor progress card updates',
          'Verify task names and percentages display'
        ],
        expected_outcome: 'Real-time progress updates visible every 3-5 seconds',
        test_type: 'e2e'
      },
      {
        scenario: 'Navigation blocking during analysis',
        steps: [
          'Start AI analysis',
          'Attempt to click Next button',
          'Verify button is disabled'
        ],
        expected_outcome: 'Navigation prevented until analysis complete or skipped',
        test_type: 'e2e'
      },
      {
        scenario: 'Skip functionality',
        steps: [
          'Start AI analysis',
          'Wait 10+ seconds',
          'Click Skip button',
          'Confirm in modal'
        ],
        expected_outcome: 'Analysis cancelled, manual entry becomes available',
        test_type: 'e2e'
      },
      {
        scenario: 'Agent failure fallback',
        steps: [
          'Simulate agent failure',
          'Observe error message',
          'Verify Advanced Settings auto-expands'
        ],
        expected_outcome: 'Graceful fallback to manual entry on failure',
        test_type: 'integration'
      }
    ],

    // Checklists
    validation_checklist: [
      'Database verification completed',
      'agent_execution_logs table does not exist (needs creation)',
      'venture_drafts.research_results column exists',
      'competitors table structure supports AI-generated fields',
      'CompetitiveIntelligence.tsx component identified',
      'Agent Platform integration points verified'
    ],

    stakeholder_review_checklist: [
      'Product owner approved AI-first approach',
      'UX team validated progress card design',
      'Engineering confirmed technical feasibility',
      'QA approved test scenarios',
      'DevOps confirmed deployment approach'
    ],

    metadata: {
      created_by: 'PLAN',
      api_version: 'v2',
      review_status: 'pending',
      estimated_hours: 60,
      actual_hours: null,
      completion_date: null
    }
  };

  // -------------------------------------------------------------------------
  // STEP 4: Validate PRD Schema
  // -------------------------------------------------------------------------

  console.log('\n4️⃣  Validating PRD schema...');

  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.isValid) {
    console.error('\n❌ PRD validation failed. Please fix the errors above.');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 5: Insert PRD into Database
  // -------------------------------------------------------------------------

  console.log('\n5️⃣  Inserting PRD into database...');

  const { data: insertedPRD, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert([prdData])
    .select()
    .single();

  if (insertError) {
    console.error('❌ Error inserting PRD:', insertError);
    process.exit(1);
  }

  console.log('✅ PRD created successfully!');
  console.log(`   ID: ${insertedPRD.id}`);
  console.log(`   Title: ${insertedPRD.title}`);

  // -------------------------------------------------------------------------
  // STEP 6: Auto-generate User Stories
  // -------------------------------------------------------------------------

  console.log('\n6️⃣  Auto-generating user stories...');
  console.log('   The STORIES sub-agent will create user stories based on this PRD.');
  console.log('   Check the user_stories_v2 table for generated stories.');

  // -------------------------------------------------------------------------
  // Success Summary
  // -------------------------------------------------------------------------

  console.log('\n' + '='.repeat(70));
  console.log('✅ PRD CREATION COMPLETE');
  console.log('='.repeat(70));
  console.log(`\n📋 Next Steps:`);
  console.log(`   1. Review generated user stories in user_stories_v2 table`);
  console.log(`   2. Run validation: node scripts/validate-user-stories.js ${SD_ID}`);
  console.log(`   3. Create PLAN→EXEC handoff when ready`);
  console.log(`   4. Begin implementation in /mnt/c/_EHG/ehg/`);
}

// ============================================================================
// Execute
// ============================================================================

createPRD().catch(console.error);