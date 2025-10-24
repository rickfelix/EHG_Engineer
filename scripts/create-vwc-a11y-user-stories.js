#!/usr/bin/env node

/**
 * Create User Stories for SD-VWC-A11Y-001
 * Maps to 7 success criteria from the accessibility SD
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-VWC-A11Y-001';

const userStories = [
  {
    story_key: 'SD-VWC-A11Y-001:US-001',
    title: 'Automated Accessibility Scan with Zero Violations',
    user_role: 'venture creator with disabilities',
    user_want: 'the VentureCreationPage to pass automated WCAG 2.1 AA scans',
    user_benefit: 'I can access all functionality without barriers',
    story_points: 3,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      'axe DevTools browser extension scan shows 0 WCAG 2.1 AA violations',
      '@axe-core/playwright E2E test passes with 0 violations',
      'All automated accessibility checks pass in CI/CD pipeline'
    ],
    implementation_context: 'Install axe DevTools extension. Add @axe-core/playwright to E2E tests. Run initial audit to identify violations. Configure eslint-plugin-jsx-a11y rules. Set up CI/CD to fail on accessibility violations.',
    technical_notes: 'Use @axe-core/playwright package in E2E test suite. Configure axe-core rules for WCAG 2.1 AA level. Add to GitHub Actions workflow.',
    test_scenarios: [
      'Run axe DevTools scan on VentureCreationPage',
      'Execute @axe-core/playwright E2E test',
      'Verify CI/CD pipeline fails on violations'
    ]
  },
  {
    story_key: 'SD-VWC-A11Y-001:US-002',
    title: 'Descriptive ARIA Labels for All Interactive Elements',
    user_role: 'screen reader user',
    user_want: 'all buttons, inputs, and interactive elements to have descriptive ARIA labels',
    user_benefit: 'I understand their purpose before activating them',
    story_points: 2,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      'All buttons have aria-label or aria-labelledby attributes',
      'All form inputs have associated <label> elements or aria-label',
      'Tier selection buttons announce "(Tier 0/1/2) Select tier" to screen readers',
      'TierGraduationModal has aria-labelledby for title and aria-describedby for content'
    ],
    implementation_context: 'Audit all interactive elements in VentureCreationPage.tsx. Add aria-label to buttons without visible text. Use aria-labelledby for buttons with visible labels. Add aria-describedby for additional context. Test with NVDA/JAWS screen readers.',
    technical_notes: 'Focus on form inputs, tier selection buttons, and modal dialogs. Use semantic HTML where possible before adding ARIA attributes.',
    test_scenarios: [
      'Test with NVDA screen reader on Windows',
      'Test with JAWS screen reader',
      'Verify aria-label announcements match expected text'
    ]
  },
  {
    story_key: 'SD-VWC-A11Y-001:US-003',
    title: 'WCAG-Compliant Color Contrast Ratios',
    user_role: 'user with low vision',
    user_want: 'text and UI elements to meet WCAG contrast requirements',
    user_benefit: 'I can read all content clearly',
    story_points: 2,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      'All normal text (< 18pt) meets 4.5:1 contrast ratio',
      'All large text (≥ 18pt) and UI components meet 3:1 contrast ratio',
      'Color contrast analyzer confirms compliance for all text/background combinations',
      'No color-only information (e.g., tier selection uses text + icons)'
    ],
    implementation_context: 'Use WebAIM Contrast Checker or Chrome DevTools. Audit existing color palette (buttons, text, borders). Update CSS variables for non-compliant colors. Add text labels to supplement color-coded UI. Verify with axe DevTools contrast audit.',
    technical_notes: 'Update CSS custom properties in global styles. Ensure tier selection buttons have text labels in addition to color coding.',
    test_scenarios: [
      'Run WebAIM Contrast Checker on all text/background pairs',
      'Use Chrome DevTools color picker to verify ratios',
      'Test with axe DevTools contrast audit'
    ]
  },
  {
    story_key: 'SD-VWC-A11Y-001:US-004',
    title: 'Complete Keyboard Navigation Support',
    user_role: 'keyboard-only user',
    user_want: 'to navigate and complete the entire venture creation flow using only keyboard',
    user_benefit: 'I don\'t require a mouse',
    story_points: 3,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      'Tab key navigates through all focusable elements in logical order',
      'Shift+Tab navigates backwards through elements',
      'Enter key activates buttons and submits forms',
      'Escape key closes TierGraduationModal',
      'All interactive elements reachable via keyboard (no mouse-only functionality)'
    ],
    implementation_context: 'Leverage existing useKeyboardNav hook from SD-VWC-PHASE1-001 (185 LOC). Ensure semantic HTML (button, not div with onClick). Test tab order matches visual layout. Add keyboard event handlers for Enter/Escape. Test with keyboard only (no mouse).',
    technical_notes: 'Use existing useKeyboardNav hook. Ensure proper tabindex attributes. Avoid custom keyboard handlers where native HTML semantics suffice.',
    test_scenarios: [
      'Tab through all interactive elements without mouse',
      'Test Shift+Tab backwards navigation',
      'Test Enter key activation on all buttons',
      'Test Escape key on modal dialogs'
    ]
  },
  {
    story_key: 'SD-VWC-A11Y-001:US-005',
    title: 'Logical Screen Reader Reading Order',
    user_role: 'screen reader user',
    user_want: 'page sections, form fields, and messages announced in logical order',
    user_benefit: 'I understand the page structure and flow',
    story_points: 2,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      'Page heading announced first (e.g., "Create New Venture")',
      'Form sections announced in order: venture details, tier selection, submit',
      'Error messages announced via aria-live regions',
      'Modal dialogs announce title and content when opened',
      'NVDA, JAWS, and VoiceOver all announce content in same logical order'
    ],
    implementation_context: 'Use semantic HTML landmarks (header, main, section, form). Add ARIA landmarks (role="main", role="form"). Use aria-live="polite" for status messages. Test reading order with NVDA (Windows), JAWS (Windows), VoiceOver (macOS). Ensure DOM order matches visual order.',
    technical_notes: 'Use semantic HTML5 elements. Add aria-live regions for dynamic content updates. Test with multiple screen readers.',
    test_scenarios: [
      'Test with NVDA on Windows',
      'Test with JAWS on Windows',
      'Test with VoiceOver on macOS',
      'Verify reading order matches expected flow'
    ]
  },
  {
    story_key: 'SD-VWC-A11Y-001:US-006',
    title: 'Visible Focus Indicators for All Focusable Elements',
    user_role: 'keyboard user',
    user_want: 'to see which element currently has focus',
    user_benefit: 'I know where I am on the page',
    story_points: 1,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      'All focusable elements display visible outline when focused (minimum 2px)',
      'Focus indicators have sufficient contrast (3:1 against background)',
      'Focus indicators not removed via CSS (no outline: none)',
      'Custom focus styles maintain WCAG compliance'
    ],
    implementation_context: 'Audit CSS for outline: none or :focus { outline: 0 }. Add custom focus styles using :focus-visible pseudo-class. Use ring utility classes (e.g., focus:ring-2 focus:ring-blue-500). Test focus indicators on light and dark backgrounds. Ensure focus styles meet 3:1 contrast ratio.',
    technical_notes: 'Use :focus-visible to avoid showing focus on mouse clicks. Ensure custom focus styles meet contrast requirements.',
    test_scenarios: [
      'Tab through all focusable elements',
      'Verify focus indicators visible on all backgrounds',
      'Test focus indicators meet 3:1 contrast ratio'
    ]
  },
  {
    story_key: 'SD-VWC-A11Y-001:US-007',
    title: 'Automated E2E Accessibility Regression Prevention',
    user_role: 'developer',
    user_want: 'automated E2E tests to catch accessibility regressions',
    user_benefit: 'we maintain WCAG compliance over time',
    story_points: 3,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      'E2E test suite includes @axe-core/playwright checks for VentureCreationPage',
      'Tests run on every PR via CI/CD pipeline',
      'Tests fail if WCAG 2.1 AA violations detected',
      'Test coverage includes all user flows (tier selection, form submission, modal interactions)'
    ],
    implementation_context: 'Install @axe-core/playwright package. Create accessibility-venture-creation.spec.ts E2E test. Use await expect(page).toHaveNoViolations() assertion. Configure axe-core rules for WCAG 2.1 AA. Add test to CI/CD pipeline (GitHub Actions). Document test patterns for future components.',
    technical_notes: 'Create E2E test file in tests/e2e/ directory. Configure Playwright test to use @axe-core/playwright. Add to GitHub Actions workflow.',
    test_scenarios: [
      'Run E2E accessibility test locally',
      'Verify test fails on accessibility violations',
      'Confirm test runs in CI/CD pipeline',
      'Test all user flows covered'
    ]
  }
];

async function createUserStories() {
  console.log('=== Creating User Stories for SD-VWC-A11Y-001 ===\n');

  // Verify SD exists
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title')
    .eq('sd_key', SD_ID)
    .single();

  if (sdError) {
    console.error('❌ Error finding SD:', sdError.message);
    return;
  }

  console.log('✅ SD Found:', sd.title);
  console.log('');

  let totalStoryPoints = 0;
  let createdStories = [];
  let errors = [];

  // Insert stories one at a time (database operations guideline)
  for (const story of userStories) {
    const storyData = {
      story_key: story.story_key,
      sd_id: SD_ID,
      prd_id: null, // No PRD yet, linking directly to SD
      title: story.title,
      user_role: story.user_role,
      user_want: story.user_want,
      user_benefit: story.user_benefit,
      story_points: story.story_points,
      priority: story.priority,
      status: story.status,
      acceptance_criteria: story.acceptance_criteria,
      implementation_context: story.implementation_context,
      technical_notes: story.technical_notes,
      test_scenarios: story.test_scenarios,
      created_by: 'claude-code',
      updated_by: 'claude-code'
    };

    const { data, error } = await supabase
      .from('user_stories')
      .insert([storyData])
      .select();

    if (error) {
      errors.push({ story_key: story.story_key, error: error.message });
      console.log(`❌ Failed to create ${story.story_key}:`, error.message);
    } else {
      createdStories.push(data[0]);
      totalStoryPoints += story.story_points;
      console.log(`✅ Created ${story.story_key} (${story.story_points} pts)`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total stories created: ${createdStories.length} / ${userStories.length}`);
  console.log(`Total story points: ${totalStoryPoints}`);
  console.log(`Failed: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  - ${e.story_key}: ${e.error}`));
  }

  // BMAD coverage validation
  console.log('\n=== BMAD COVERAGE VALIDATION ===');
  const storiesWithContext = userStories.filter(s =>
    s.implementation_context && s.implementation_context.length > 50
  ).length;
  const contextCoverage = (storiesWithContext / userStories.length) * 100;

  const storiesWithAcceptanceCriteria = userStories.filter(s =>
    s.acceptance_criteria && s.acceptance_criteria.length >= 3
  ).length;
  const acceptanceCriteriaCoverage = (storiesWithAcceptanceCriteria / userStories.length) * 100;

  console.log(`Implementation Context: ${storiesWithContext}/${userStories.length} (${contextCoverage.toFixed(0)}%)`);
  console.log(`Acceptance Criteria: ${storiesWithAcceptanceCriteria}/${userStories.length} (${acceptanceCriteriaCoverage.toFixed(0)}%)`);
  console.log(`BMAD Requirement: ≥80% coverage`);

  const bmadPass = contextCoverage >= 80 && acceptanceCriteriaCoverage >= 80;
  console.log(`Status: ${bmadPass ? '✅ PASS' : '❌ FAIL'}`);

  // Show created story IDs
  if (createdStories.length > 0) {
    console.log('\n=== Created Story IDs ===');
    createdStories.forEach(s => {
      console.log(`${s.story_key}: ${s.id}`);
    });
  }
}

createUserStories();
