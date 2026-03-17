#!/usr/bin/env node

/**
 * PRD Creation Script for SD-VWC-ERRORS-001
 * Error Message Enhancement: User-Friendly Error Handling
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SD_ID = 'SD-VWC-ERRORS-001';
const PRD_TITLE = 'Error Message Enhancement: User-Friendly Error Handling - Technical Implementation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // Fetch Strategic Directive
  console.log('\n1️⃣  Fetching Strategic Directive...');

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found`);
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.uuid_id}`);

  // Build PRD Data
  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys
    id: prdId,
    sd_uuid: sdData.uuid_id,
    directive_id: SD_ID,
    sd_id: SD_ID,

    // Core Metadata
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',
    category: 'Developer Experience',
    priority: 'low',

    // Executive & Context
    executive_summary: `
Create a centralized error message handling system to replace cryptic technical errors with user-friendly, actionable messages. This system will integrate with the existing toast notification infrastructure to provide consistent error experiences across the application.

**Scope**: ~300 LOC implementation covering ErrorMessageMap service, toast integration, and common error translations for network, authentication, and validation errors.

**Impact**: Reduces user confusion, decreases support burden by 30%, and establishes a maintainable pattern for error handling across the application.
    `.trim(),

    business_context: `
**User Pain Points:**
- Cryptic error messages like "ERR_CONNECTION_REFUSED" confuse users
- Users don't know what action to take when errors occur
- Support tickets increase due to unclear error messaging

**Business Objectives:**
- Reduce support tickets related to error message confusion by 30%
- Improve user satisfaction scores for error handling (target: 8/10)
- Establish consistent error UX across application

**Success Metrics:**
- 80%+ of common errors have user-friendly mappings
- Error resolution time reduced by 40%
- Measurable decrease in support tickets related to error messages
    `.trim(),

    technical_context: `
**Existing Systems:**
- Shadcn/UI toast system with useToast hook (src/hooks/use-toast.ts)
- Toast component infrastructure (src/components/ui/toast.tsx, toaster.tsx)
- Generic ErrorBoundary component (src/components/error/ErrorBoundary.tsx)

**Architecture Patterns:**
- Centralized service pattern for error mapping
- Toast notifications for user feedback
- React hooks for component integration

**Integration Points:**
- All API error handling
- Form validation errors
- Network connectivity errors
- Authentication/authorization errors
    `.trim(),

    // Requirements
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Centralized ErrorMessageMap Service',
        description: 'Create a TypeScript service that maps technical error codes to user-friendly messages',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Service exports getErrorMessage(error: Error | string): string function',
          'Covers top 20 most common errors (network, auth, validation)',
          'Includes fallback for unmapped errors',
          'TypeScript types exported for all error categories'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Toast Integration',
        description: 'Integrate ErrorMessageMap with existing useToast hook',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Helper function showErrorToast(error) uses ErrorMessageMap',
          'Consistent error toast styling (destructive variant)',
          'Actionable next steps included in error messages',
          'Works with both Error objects and string error codes'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Common Error Coverage',
        description: 'Map user-friendly messages for most common error types',
        priority: 'HIGH',
        acceptance_criteria: [
          'Network errors: timeout, connection refused, offline',
          'Auth errors: invalid credentials, session expired, unauthorized',
          'Validation errors: required fields, invalid format, duplicate entry',
          'Each message includes suggested action ("Try again", "Contact support")'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Error message lookup must be instantaneous',
        target_metric: '<1ms lookup time'
      },
      {
        type: 'maintainability',
        requirement: 'Error messages must be easily updateable',
        target_metric: 'Single source of truth (ErrorMessageMap)'
      },
      {
        type: 'usability',
        requirement: 'Error messages must be clear to non-technical users',
        target_metric: 'No technical jargon, 8th grade reading level'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'TypeScript Service Layer',
        description: 'Implement ErrorMessageMap as a TypeScript service with proper types',
        dependencies: ['TypeScript 5', 'Existing toast infrastructure']
      },
      {
        id: 'TR-2',
        requirement: 'Integration with useToast Hook',
        description: 'Create helper functions that work seamlessly with existing toast system',
        dependencies: ['src/hooks/use-toast.ts', 'src/components/ui/toast.tsx']
      }
    ],

    // Architecture
    system_architecture: `
## Architecture Overview
ErrorMessageMap Service (Pure TypeScript)
   ↓
showErrorToast Helper (React Hook wrapper)
   ↓
useToast Hook (Existing infrastructure)
   ↓
Toast Component UI (Existing Shadcn/UI)

## Data Flow
1. Error occurs (API, validation, network)
2. showErrorToast(error) called
3. ErrorMessageMap.getErrorMessage(error) translates error
4. useToast().toast({ variant: "destructive", ...}) displays
5. User sees friendly message with action

## Integration Points
- API error handlers (try/catch blocks)
- Form validation (React Hook Form errors)
- Network interceptors (fetch/axios wrappers)
- Authentication service errors
    `.trim(),

    data_model: null, // No database tables needed

    api_specifications: [], // No new API endpoints

    ui_ux_requirements: [
      {
        component: 'Error Toast',
        description: 'Uses existing toast component with destructive variant. Error messages should be clear, concise, and include next steps.',
        wireframe: 'Existing toast UI (red/destructive styling)'
      }
    ],

    // Implementation
    implementation_approach: `
## Phase 1: Core Service (2 hours)
- Create src/services/errorMessageMap.ts
- Implement getErrorMessage function
- Add error category types
- Map top 20 common errors

## Phase 2: Integration (1.5 hours)
- Create showErrorToast helper
- Update useToast hook integration
- Test with existing error scenarios

## Phase 3: Testing (1.5 hours)
- Unit tests for ErrorMessageMap
- E2E tests for error display
- Manual verification of error flows
    `.trim(),

    technology_stack: [
      'TypeScript 5',
      'React 18',
      'Shadcn UI (toast components)',
      'Vitest (unit tests)',
      'Playwright (E2E tests)'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'useToast hook',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'Toast UI components',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Network Error Display',
        description: 'User encounters network timeout',
        expected_result: 'Toast shows "Unable to connect. Please check your internet connection and try again."',
        test_type: 'e2e'
      },
      {
        id: 'TS-2',
        scenario: 'Auth Error Display',
        description: 'User session expires',
        expected_result: 'Toast shows "Your session has expired. Please log in again."',
        test_type: 'e2e'
      },
      {
        id: 'TS-3',
        scenario: 'Unmapped Error Fallback',
        description: 'Error code not in ErrorMessageMap',
        expected_result: 'Toast shows technical error with "Contact support if this persists" message',
        test_type: 'unit'
      }
    ],

    acceptance_criteria: [
      'ErrorMessageMap service implemented with 20+ error mappings',
      'showErrorToast helper integrated with useToast',
      'Unit tests passing (100% coverage for ErrorMessageMap)',
      'E2E tests passing (error display verified)',
      'All common errors show user-friendly messages',
      'No breaking changes to existing error handling'
    ],

    performance_requirements: {
      error_lookup_time: '<1ms',
      toast_display_time: '<100ms',
      memory_overhead: '<5KB'
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Implementation approach documented', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true },
      { text: 'User stories generated (STORIES sub-agent)', checked: false },
      { text: 'Integration points verified', checked: true }
    ],

    exec_checklist: [
      { text: 'Development environment setup', checked: false },
      { text: 'ErrorMessageMap service implemented', checked: false },
      { text: 'showErrorToast helper created', checked: false },
      { text: 'Unit tests written and passing', checked: false },
      { text: 'E2E tests written and passing', checked: false },
      { text: 'Code review completed', checked: false },
      { text: 'Documentation updated', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Performance requirements validated', checked: false },
      { text: 'Error display verified in all scenarios', checked: false },
      { text: 'No breaking changes to existing code', checked: false },
      { text: 'User feedback collected (8/10 clarity rating)', checked: false }
    ],

    // Progress
    progress: 10,
    phase: 'planning',
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 10,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    // Risks
    risks: [
      {
        category: 'Technical',
        risk: 'Incomplete error coverage',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'Some errors still show technical messages',
        mitigation: 'Start with top 20 errors, expand incrementally. Include fallback for unmapped errors.'
      },
      {
        category: 'Implementation',
        risk: 'Breaking existing error handling',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Existing error flows stop working',
        mitigation: 'Comprehensive testing (unit + E2E). Gradual rollout. Fallback to technical error if mapping fails.'
      }
    ],

    constraints: [
      {
        type: 'Technical',
        description: 'Must work with existing useToast hook',
        workaround: null
      },
      {
        type: 'Scope',
        description: 'Limited to 300 LOC implementation',
        workaround: 'Focus on most common errors first'
      }
    ]
  };

  // Insert PRD
  console.log('\n3️⃣  Inserting PRD into database...');

  const { data: insertedPRD, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (insertError) {
    console.error('\n❌ Error inserting PRD:', insertError.message);
    console.error('   Details:', insertError);
    process.exit(1);
  }

  console.log('\n✅ PRD Created Successfully!');
  console.log('='.repeat(70));
  console.log(`   ID: ${insertedPRD.id}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);
  console.log('\n📋 Next Steps:');
  console.log('   1. User stories will be auto-generated by STORIES sub-agent');
  console.log('   2. Create PLAN→EXEC handoff when ready');
  console.log('   3. Begin implementation in EXEC phase');
}

createPRD().catch(console.error);
