#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { createPRDLink } from '../lib/sd-helpers.js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  const prdContent = {
    functional_requirements: [
      'Navigation to settings page must be accessible from main menu',
      'Profile settings tab must load user data from database',
      'Profile updates must save to database and persist',
      'Notification preferences tab must be fully functional (not placeholder)',
      'Theme selection (light/dark/system) must work across application',
      'Security settings tab must display 2FA and session controls',
      'Admin-only company settings tab for authorized users',
      'All settings changes must save with loading states',
      'Form validation for all input fields',
      'Success/error feedback for save operations'
    ],

    technical_requirements: [
      'Connect UserProfileSettings component to Supabase user_profiles table',
      'Implement notification preferences storage in user_preferences table',
      'Create theme provider for application-wide theme management',
      'Add RBAC checks for admin settings visibility',
      'Implement optimistic updates with rollback on errors',
      'Add form validation using Zod or similar',
      'Ensure responsive design for mobile devices',
      'Follow existing Shadcn UI component patterns'
    ],

    acceptance_criteria: [
      'Settings page loads successfully at /settings route',
      'Profile tab displays current user data from database',
      'Profile changes save to database within 2 seconds',
      'Notification preferences tab is functional (not placeholder)',
      'Theme selection changes apply immediately across app',
      'Security tab displays real user security settings',
      'Admin settings only visible to users with admin role',
      'All form fields validate before submission',
      'Success messages appear after successful saves',
      'Error messages appear with specific error details',
      'Settings persist after page refresh',
      'Mobile responsive on screens <768px width'
    ],

    test_scenarios: [
      {scenario: 'Navigate to /settings from dashboard', expected: 'Page loads successfully'},
      {scenario: 'Update first name in profile tab', expected: 'Saves to database, success message shows'},
      {scenario: 'Toggle notification preference', expected: 'Persists after page refresh'},
      {scenario: 'Change theme to dark mode', expected: 'UI updates immediately across all pages'},
      {scenario: 'Enable 2FA in security tab', expected: 'Security settings update correctly'},
      {scenario: 'Non-admin accesses settings', expected: 'Admin tab is hidden'},
      {scenario: 'Admin user accesses settings', expected: 'Admin tab visible and functional'},
      {scenario: 'Submit invalid email format', expected: 'Validation error message appears'},
      {scenario: 'Network error during save', expected: 'Error message with details displays'},
      {scenario: 'Save multiple profile changes', expected: 'All changes persist, success message shows'}
    ],

    user_stories: [
      {
        title: 'User Profile Management',
        description: 'As a user, I want to update my profile information so that my account details are current and accurate',
        acceptance_criteria: 'Profile changes save to database and persist across sessions'
      },
      {
        title: 'Notification Preferences',
        description: 'As a user, I want to configure my notification preferences so that I receive relevant updates without being overwhelmed',
        acceptance_criteria: 'Notification settings control actual notification delivery'
      },
      {
        title: 'Theme Selection',
        description: 'As a user, I want to choose my preferred theme (light/dark/system) so that the interface matches my visual preference',
        acceptance_criteria: 'Theme persists and applies across all pages and sessions'
      },
      {
        title: 'Security Management',
        description: 'As a user, I want to manage my security settings including 2FA so that my account is secure',
        acceptance_criteria: '2FA and security settings are functional and persist'
      },
      {
        title: 'Admin Company Settings',
        description: 'As an admin, I want to manage company-wide settings so that I can configure system behavior',
        acceptance_criteria: 'Admin settings only accessible to authorized admin users'
      }
    ]
  };

  const prd = {
    id: randomUUID(),
    ...await createPRDLink('SD-UAT-020'),
    title: 'PRD-SD-UAT-020: Settings Section Implementation',
    content: JSON.stringify(prdContent, null, 2),
    status: 'approved',
    target_url: 'http://localhost:8080/settings',
    component_name: 'SettingsPage',
    app_path: '/mnt/c/_EHG/ehg',
    port: 8080,
    metadata: {
      priority: 'CRITICAL',
      estimated_hours: 8,
      complexity_score: 7,
      risk_level: 'MEDIUM'
    }
  };

  const { data, error } = await supabase
    .from('prds')
    .insert(prd)
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('✅ PRD Created Successfully');
  console.log('');
  console.log('📋 PRD Details:');
  console.log('   ID:', data[0].id);
  console.log('   Title:', data[0].title);
  console.log('   Status:', data[0].status);
  console.log('   Target URL:', data[0].target_url);
  console.log('   Component:', data[0].component_name);
  console.log('');
  console.log('📊 Requirements Summary:');
  console.log('   Functional Requirements:', prdContent.functional_requirements.length);
  console.log('   Technical Requirements:', prdContent.technical_requirements.length);
  console.log('   Acceptance Criteria:', prdContent.acceptance_criteria.length);
  console.log('   Test Scenarios:', prdContent.test_scenarios.length);
  console.log('   User Stories:', prdContent.user_stories.length);
  console.log('');
  console.log('✅ PRD ready for PLAN→EXEC handoff');

  return data[0];
}

createPRD().catch(console.error);
