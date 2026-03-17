#!/usr/bin/env node

/**
 * Create User Stories for SD-VWC-PHASE1-001
 * Phase 1: Critical UX Blockers & Tier 0 Activation
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const SD_ID = 'SD-VWC-PHASE1-001';
const PRD_ID = 'PRD-VWC-PHASE1-001';

const userStories = [
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-001`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Add Tier 0 button to tier selection UI (algorithm exists, just add UI)',
    user_role: 'product user',
    user_want: 'to select Tier 0 for quick MVP validation',
    user_benefit: 'I can cap my venture at Stage 3 with 70% validation gates',
    story_points: 3,
    priority: 'high',
    status: 'completed',
    acceptance_criteria: [
      'Tier 0 button visible in tier selection UI',
      'Button shows "MVP" label with green badge',
      'Tooltip explains 70% gates and Stage 1-3 cap',
      'Selection updates venture tier correctly'
    ],
    definition_of_done: [],
    technical_notes: 'Already implemented in VentureCreationPage.tsx lines 747-761',
    created_by: 'SYSTEM',
    validation_status: 'validated',
    implementation_context: JSON.stringify({
      approach: 'Tier 0 button already implemented in tier selection UI',
      technical_details: [
        'Tier selection UI at VentureCreationPage.tsx lines 747-761',
        'Button shows MVP label with green badge',
        'Tooltip explains 70% gates and Stage 1-3 cap'
      ],
      files_to_modify: [],
      files_to_create: [],
      dependencies: []
    }),
    e2e_test_status: 'created'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-002`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Implement Tier 0 stage gating (cap at Stage 3, prevent progression)',
    user_role: 'product user',
    user_want: 'Tier 0 ventures to be prevented from progressing past Stage 3',
    user_benefit: 'the system enforces stage caps and prevents invalid progression',
    story_points: 8,
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'Database trigger prevents Tier 0 ventures from Stage 4+',
      'Attempting Stage 4 transition shows error message',
      'TierGraduationModal opens when Stage 3→4 attempted',
      'Graduation validation required before tier upgrade'
    ],
    definition_of_done: [],
    technical_notes: 'Create prevent_tier0_stage_progression trigger, wire modal trigger logic',
    created_by: 'SYSTEM',
    implementation_context: JSON.stringify({
      approach: 'Create database trigger to prevent Tier 0 ventures from progressing past Stage 3',
      technical_details: [
        'Create prevent_tier0_stage_progression trigger on ventures table',
        'Check venture tier before stage updates',
        'Raise exception if Tier 0 attempts Stage 4+ transition',
        'Wire TierGraduationModal trigger logic in VentureCreationPage.tsx'
      ],
      files_to_modify: ['VentureCreationPage.tsx'],
      files_to_create: ['database/migrations/create_prevent_tier0_stage_progression_trigger.sql'],
      dependencies: []
    }),
    e2e_test_status: 'created'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-003`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Create TierGraduationModal with ≥85% re-validation required tooltip',
    user_role: 'product user',
    user_want: 'to see graduation requirements when hitting Tier 0 stage cap',
    user_benefit: 'I understand what validation is needed to upgrade tiers',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Modal component exists (already created)',
      'Modal opens when Tier 0 venture hits Stage 3 cap',
      'Tooltip shows ≥85% for Tier 1, ≥90% for Tier 2',
      'Graduation options clearly presented'
    ],
    definition_of_done: [],
    technical_notes: 'Component exists (TierGraduationModal.tsx), need trigger integration',
    created_by: 'SYSTEM',
    implementation_context: JSON.stringify({
      approach: 'Integrate existing TierGraduationModal with stage progression logic',
      technical_details: [
        'TierGraduationModal component already exists',
        'Add trigger logic when Tier 0 hits Stage 3 cap',
        'Display tooltip showing ≥85% for Tier 1, ≥90% for Tier 2',
        'Wire modal to stage progression handler'
      ],
      files_to_modify: ['VentureCreationPage.tsx', 'TierGraduationModal.tsx'],
      files_to_create: [],
      dependencies: ['US-002']
    }),
    e2e_test_status: 'created'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-004`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Embed IntelligenceDrawer into wizard Steps 2-3 (not separate)',
    user_role: 'product user',
    user_want: 'to access AI intelligence analysis inline during wizard steps',
    user_benefit: 'I can view research and competitive intel without leaving the wizard',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'IntelligenceDrawer renders inline in Step 2 (Research)',
      'IntelligenceDrawer renders inline in Step 3 (Results)',
      'No separate drawer button needed',
      'Context passed correctly (ventureId, step)'
    ],
    definition_of_done: [],
    technical_notes: 'Refactor IntelligenceDrawer for inline mode, embed in VentureCreationPage Steps 2-3',
    created_by: 'SYSTEM',
    implementation_context: JSON.stringify({
      approach: 'Refactor IntelligenceDrawer for inline embedding in wizard steps',
      technical_details: [
        'Add inline mode prop to IntelligenceDrawer component',
        'Embed drawer in VentureCreationPage Step 2 (Research)',
        'Embed drawer in VentureCreationPage Step 3 (Results)',
        'Remove separate drawer button',
        'Pass ventureId and step context correctly'
      ],
      files_to_modify: ['IntelligenceDrawer.tsx', 'VentureCreationPage.tsx'],
      files_to_create: [],
      dependencies: []
    }),
    e2e_test_status: 'created'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-005`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Add GCIA Request fresh scan button with cache age display',
    user_role: 'product user',
    user_want: 'to see when GCIA last ran and request a fresh scan',
    user_benefit: 'I know if intelligence data is stale and can refresh it',
    story_points: 3,
    priority: 'medium',
    status: 'ready',
    acceptance_criteria: [
      'Badge shows "Last scan: X minutes ago"',
      '"Request fresh scan" button visible',
      'Button triggers new GCIA execution',
      'Cache age calculated from last execution timestamp'
    ],
    definition_of_done: [],
    technical_notes: 'Add cache age service, update GCIA tab UI with badge and button',
    created_by: 'SYSTEM',
    implementation_context: JSON.stringify({
      approach: 'Add cache age display and fresh scan button to GCIA tab',
      technical_details: [
        'Create cache age calculation service',
        'Add badge showing "Last scan: X minutes ago"',
        'Add "Request fresh scan" button to UI',
        'Wire button to GCIA execution trigger',
        'Fetch last execution timestamp from database'
      ],
      files_to_modify: ['IntelligenceDrawer.tsx', 'intelligenceAgents.ts'],
      files_to_create: ['services/cacheAgeService.ts'],
      dependencies: ['US-007']
    }),
    e2e_test_status: 'created'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-006`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Show ETA and cost before GCIA execution',
    user_role: 'product user',
    user_want: 'to see estimated time and cost before executing GCIA',
    user_benefit: 'I can make informed decisions about running expensive operations',
    story_points: 3,
    priority: 'medium',
    status: 'ready',
    acceptance_criteria: [
      'Estimate shown: "Estimated: 45s, ~$0.12"',
      'ETA calculated from historical execution times',
      'Cost estimated from token usage patterns',
      'Displayed before execution button'
    ],
    definition_of_done: [],
    technical_notes: 'Create ETA estimation function, cost calculation service',
    created_by: 'SYSTEM',
    implementation_context: JSON.stringify({
      approach: 'Display ETA and cost estimates before GCIA execution',
      technical_details: [
        'Create ETA estimation function from historical execution times',
        'Create cost calculation service using token patterns',
        'Display "Estimated: 45s, ~$0.12" before execution button',
        'Update IntelligenceDrawer UI with estimate display'
      ],
      files_to_modify: ['IntelligenceDrawer.tsx', 'intelligenceAgents.ts'],
      files_to_create: ['services/etaEstimation.ts'],
      dependencies: ['US-007']
    }),
    e2e_test_status: 'created'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-007`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Extract real LLM cost/token data from intelligenceAgents responses',
    user_role: 'developer',
    user_want: 'to extract actual OpenAI usage data from API responses',
    user_benefit: 'users see real costs instead of hardcoded $0.00',
    story_points: 5,
    priority: 'medium',
    status: 'ready',
    acceptance_criteria: [
      'Parse usage.total_tokens from OpenAI responses',
      'Calculate cost from token count and model pricing',
      'Display real costs in intelligence results',
      'Fallback to estimates if extraction fails'
    ],
    definition_of_done: [],
    technical_notes: 'Update intelligenceAgents service to parse usage data, remove TODOs at lines 133, 146, 184, 220',
    created_by: 'SYSTEM',
    implementation_context: JSON.stringify({
      approach: 'Extract and display real LLM costs from OpenAI API responses',
      technical_details: [
        'Parse usage.total_tokens from OpenAI API responses',
        'Calculate cost using model pricing (gpt-4o rates)',
        'Remove TODOs at intelligenceAgents.ts lines 133, 146, 184, 220',
        'Add fallback to estimates if extraction fails',
        'Display real costs in intelligence results UI'
      ],
      files_to_modify: ['intelligenceAgents.ts', 'IntelligenceDrawer.tsx'],
      files_to_create: [],
      dependencies: []
    }),
    e2e_test_status: 'created'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-008`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Implement executeWithRetry wrapper for async operations',
    user_role: 'developer',
    user_want: 'automatic retry logic for transient failures',
    user_benefit: 'async operations are more reliable and resilient',
    story_points: 3,
    priority: 'medium',
    status: 'ready',
    acceptance_criteria: [
      'Utility function created: executeWithRetry(fn, options)',
      '3 retries with exponential backoff',
      'Retries on network errors, timeouts, 5xx responses',
      'Integrated with intelligence services'
    ],
    definition_of_done: [],
    technical_notes: 'Create src/utils/executeWithRetry.ts, integrate with intelligenceAgents',
    created_by: 'SYSTEM',
    implementation_context: JSON.stringify({
      approach: 'Create retry wrapper utility for resilient async operations',
      technical_details: [
        'Create executeWithRetry(fn, options) utility function',
        'Implement exponential backoff (3 retries)',
        'Retry on network errors, timeouts, 5xx responses',
        'Integrate with intelligenceAgents service',
        'Add unit tests for retry logic'
      ],
      files_to_modify: ['intelligenceAgents.ts'],
      files_to_create: ['utils/executeWithRetry.ts'],
      dependencies: []
    }),
    e2e_test_status: 'created'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-009`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Add keyboard navigation (Tab, Enter, Escape)',
    user_role: 'product user',
    user_want: 'full keyboard access to wizard actions',
    user_benefit: 'I can navigate efficiently without mouse',
    story_points: 3,
    priority: 'low',
    status: 'ready',
    acceptance_criteria: [
      'Ctrl/Cmd+Enter advances to next step',
      'Escape closes modals',
      'Tab navigates through form fields',
      'All actions accessible via keyboard'
    ],
    definition_of_done: [],
    technical_notes: 'Enhance useKeyboardNav hook, add Ctrl+Enter handler to VentureCreationPage',
    created_by: 'SYSTEM',
    implementation_context: JSON.stringify({
      approach: 'Add comprehensive keyboard navigation to wizard',
      technical_details: [
        'Enhance useKeyboardNav hook with Ctrl/Cmd+Enter handler',
        'Add Escape key handler for modals',
        'Ensure Tab navigation works through all form fields',
        'Test all wizard actions accessible via keyboard'
      ],
      files_to_modify: ['VentureCreationPage.tsx', 'hooks/useKeyboardNav.ts'],
      files_to_create: [],
      dependencies: []
    }),
    e2e_test_status: 'created'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-010`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Wrap all UI text in t() for future i18n',
    user_role: 'developer',
    user_want: 'all wizard text prepared for internationalization',
    user_benefit: 'we can easily add multi-language support later',
    story_points: 8,
    priority: 'medium',
    status: 'ready',
    acceptance_criteria: [
      'react-i18next installed and configured',
      'Zero hardcoded strings in VentureCreationPage.tsx',
      'All text wrapped in t() calls',
      'en.json translation file created'
    ],
    definition_of_done: [],
    technical_notes: 'Install react-i18next, wrap ~200 strings, create translation keys',
    created_by: 'SYSTEM',
    implementation_context: JSON.stringify({
      approach: 'Prepare wizard for internationalization with react-i18next',
      technical_details: [
        'Install and configure react-i18next package',
        'Wrap all hardcoded strings in VentureCreationPage.tsx with t() calls',
        'Create en.json translation file with ~200 keys',
        'Configure i18n provider in app root',
        'Add type safety for translation keys'
      ],
      files_to_modify: ['VentureCreationPage.tsx', 'App.tsx'],
      files_to_create: ['locales/en.json', 'i18n.ts'],
      dependencies: []
    }),
    e2e_test_status: 'created'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-011`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Track all interactions via existing activity_logs table',
    user_role: 'product manager',
    user_want: 'all wizard interactions logged for analytics',
    user_benefit: 'we can analyze user behavior and improve UX',
    story_points: 2,
    priority: 'low',
    status: 'ready',
    acceptance_criteria: [
      'wizardAnalytics service integrated',
      'Step transitions logged',
      'GCIA executions tracked',
      'Tier selection changes recorded'
    ],
    definition_of_done: [],
    technical_notes: 'wizardAnalytics already exists, verify integration complete',
    created_by: 'SYSTEM',
    implementation_context: JSON.stringify({
      approach: 'Verify and complete wizardAnalytics integration',
      technical_details: [
        'Verify wizardAnalytics service is integrated',
        'Ensure step transitions are logged to activity_logs',
        'Track GCIA execution events',
        'Record tier selection changes',
        'Add missing analytics events if any'
      ],
      files_to_modify: ['VentureCreationPage.tsx', 'wizardAnalytics.ts'],
      files_to_create: [],
      dependencies: []
    }),
    e2e_test_status: 'created'
  }
];

async function main() {
  console.log(`Creating ${userStories.length} user stories for ${SD_ID}...\n`);

  const { data, error } = await supabase
    .from('user_stories')
    .insert(userStories)
    .select('id, story_key, title, status, validation_status');

  if (error) {
    console.error('❌ Error creating user stories:', error.message);
    process.exit(1);
  }

  console.log(`✅ Successfully created ${data.length} user stories\n`);

  const validated = data.filter(s => s.validation_status === 'validated').length;
  const ready = data.filter(s => s.status === 'ready').length;
  const completed = data.filter(s => s.status === 'completed').length;

  console.log('Status Summary:');
  console.log(`  Validated: ${validated}/11`);
  console.log(`  Ready: ${ready}/11`);
  console.log(`  Completed: ${completed}/11`);
  console.log('');
  console.log('Sample stories:');
  data.slice(0, 3).forEach(s => {
    console.log(`  - ${s.story_key}: ${s.title.substring(0, 50)}...`);
  });
}

main().catch(console.error);
