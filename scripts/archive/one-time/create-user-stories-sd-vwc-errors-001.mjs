#!/usr/bin/env node

/**
 * Create User Stories for SD-VWC-ERRORS-001
 * Error Message Enhancement: User-Friendly Error Handling
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const SD_ID = 'SD-VWC-ERRORS-001';
const PRD_ID = 'PRD-SD-VWC-ERRORS-001';

const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'ErrorMessageMap Service Implementation',
    user_role: 'Developer',
    user_want: 'Create centralized error message mapping service with TypeScript types',
    user_benefit: 'Consistent error message translations across the application',
    story_points: 3,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Service exports getErrorMessage(error: Error | string): string function',
      'TypeScript types exported for error categories',
      'Fallback for unmapped errors included',
      'Covers network, auth, and validation errors'
    ],
    implementation_context: 'Create src/services/errorMessageMap.ts with error code mappings. Use TypeScript enums for error categories. Export getErrorMessage function that accepts Error objects or string codes.',
    test_scenarios: [
      {
        scenario: 'Happy Path',
        test_type: 'unit',
        description: 'Error code is mapped to user-friendly message',
        input: 'Network error code',
        expected_output: 'User-friendly network error message',
        priority: 'HIGH'
      }
    ]
  },
  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Toast Integration Helper',
    user_role: 'Developer',
    user_want: 'Create showErrorToast helper that integrates ErrorMessageMap with useToast',
    user_benefit: 'Easy-to-use error display function throughout the application',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'showErrorToast(error) function uses ErrorMessageMap',
      'Integrates with existing useToast hook',
      'Uses destructive variant for error styling',
      'Works with both Error objects and strings'
    ],
    implementation_context: 'Create helper function that wraps useToast().toast() with ErrorMessageMap translation. Export from src/hooks/use-toast.ts or create new src/utils/errorToast.ts.',
    test_scenarios: [
      {
        scenario: 'Error Display',
        test_type: 'e2e',
        description: 'Error toast appears with user-friendly message',
        input: 'API error',
        expected_output: 'Toast with translated message visible',
        priority: 'HIGH'
      }
    ]
  },
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Network Error Messages',
    user_role: 'User',
    user_want: 'See clear messages when network errors occur',
    user_benefit: 'Understand network issues and know what action to take',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Connection timeout: "Unable to connect. Please check your internet connection."',
      'Connection refused: "Service temporarily unavailable. Please try again."',
      'Offline: "You appear to be offline. Check your connection and try again."',
      'All messages include actionable next steps'
    ],
    implementation_context: 'Add network error mappings to ErrorMessageMap. Map common HTTP status codes and network error types to user-friendly messages.',
    test_scenarios: [
      {
        scenario: 'Network Timeout',
        test_type: 'e2e',
        description: 'User sees clear message on timeout',
        input: 'Network timeout error',
        expected_output: 'User-friendly timeout message with retry suggestion',
        priority: 'HIGH'
      }
    ]
  },
  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Authentication Error Messages',
    user_role: 'User',
    user_want: 'See clear messages when authentication errors occur',
    user_benefit: 'Understand auth issues and know how to resolve them',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Invalid credentials: "Invalid email or password. Please try again."',
      'Session expired: "Your session has expired. Please log in again."',
      'Unauthorized: "You don\'t have permission to access this. Contact support if needed."',
      'Token invalid: "Authentication error. Please log in again."'
    ],
    implementation_context: 'Add auth error mappings to ErrorMessageMap. Handle Supabase auth errors (INVALID_CREDENTIALS, SESSION_EXPIRED, etc.).',
    test_scenarios: [
      {
        scenario: 'Session Expired',
        test_type: 'e2e',
        description: 'User sees clear message when session expires',
        input: 'Session expired error',
        expected_output: 'User-friendly session expired message',
        priority: 'HIGH'
      }
    ]
  },
  {
    story_key: `${SD_ID}:US-005`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Validation Error Messages',
    user_role: 'User',
    user_want: 'See clear messages when form validation fails',
    user_benefit: 'Understand what needs to be fixed in forms',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    acceptance_criteria: [
      'Required field: "This field is required."',
      'Invalid email: "Please enter a valid email address."',
      'Duplicate entry: "This value already exists. Please use a different one."',
      'Invalid format: Clear message about expected format'
    ],
    implementation_context: 'Add validation error mappings to ErrorMessageMap. Handle common validation patterns from React Hook Form and Supabase constraints.',
    test_scenarios: [
      {
        scenario: 'Required Field Validation',
        test_type: 'e2e',
        description: 'User sees clear message for required field',
        input: 'Empty required field',
        expected_output: 'User-friendly required field message',
        priority: 'MEDIUM'
      }
    ]
  },
  {
    story_key: `${SD_ID}:US-006`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Unit Tests for ErrorMessageMap',
    user_role: 'Developer',
    user_want: 'Comprehensive unit tests for error message mapping',
    user_benefit: 'Ensure error messages are reliable and correct',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Test all error categories (network, auth, validation)',
      'Test fallback for unmapped errors',
      'Test both Error objects and string codes',
      '100% coverage for ErrorMessageMap service'
    ],
    implementation_context: 'Create tests/unit/services/errorMessageMap.test.ts using Vitest. Test all error code mappings and edge cases.',
    test_scenarios: [
      {
        scenario: 'Unmapped Error Fallback',
        test_type: 'unit',
        description: 'Service handles unmapped errors gracefully',
        input: 'Unknown error code',
        expected_output: 'Fallback message with technical details',
        priority: 'HIGH'
      }
    ]
  }
];

async function createUserStories() {
  console.log(`\n📋 Creating User Stories for ${SD_ID}`);
  console.log('='.repeat(70));

  let created = 0;
  let failed = 0;

  for (const story of userStories) {
    console.log(`\n📝 Creating ${story.story_key}...`);

    const { data, error } = await supabase
      .from('user_stories')
      .insert(story)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        console.log(`   ⏭️  Already exists`);
      } else {
        console.error(`   ❌ Error: ${error.message}`);
        failed++;
      }
    } else {
      console.log(`   ✅ Created: ${story.title}`);
      created++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`✅ User Story Creation Complete`);
  console.log(`   Created: ${created}/${userStories.length}`);
  console.log(`   Failed: ${failed}`);
  console.log('\n📋 Next Steps:');
  console.log('   1. Verify user stories in database');
  console.log('   2. Create PLAN→EXEC handoff');
  console.log('   3. Begin EXEC phase implementation');
}

createUserStories().catch(console.error);
