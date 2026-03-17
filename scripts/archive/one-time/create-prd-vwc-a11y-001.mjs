#!/usr/bin/env node

/**
 * Create comprehensive PRD for SD-VWC-A11Y-001
 * WCAG 2.1 AA Accessibility Compliance - VentureCreationPage
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('📋 Creating PRD-VWC-A11Y-001...\n');

  const sdId = 'SD-VWC-A11Y-001';
  const prdId = 'PRD-VWC-A11Y-001';

  // First, get the SD uuid_id
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id')
    .eq('id', sdId)
    .single();

  if (sdError || !sdData) {
    console.log(`❌ Strategic Directive ${sdId} not found`);
    console.log('Please create the SD first before running this script.');
    process.exit(1);
  }

  const sdUuid = sdData.uuid_id;
  console.log(`✅ Found SD: ${sdId} (uuid: ${sdUuid})`);

  // Create the comprehensive PRD
  const prdData = {
    id: prdId,
    directive_id: sdId,
    sd_uuid: sdUuid,
    title: 'WCAG 2.1 AA Accessibility Compliance - VentureCreationPage',
    version: '1.0',
    status: 'active',
    category: 'compliance',
    priority: 'high',
    phase: 'planning',

    executive_summary: 'Comprehensive WCAG 2.1 AA accessibility audit and remediation for VentureCreationPage component to ensure legal compliance (ADA, Section 508) and inclusive user experience.',

    business_context: 'Accessibility compliance is a legal requirement under ADA and Section 508. Ensuring VentureCreationPage meets WCAG 2.1 AA standards reduces legal risk and provides an inclusive experience for all users, including those using assistive technologies.',

    technical_context: 'VentureCreationPage is an existing React component in the EHG application. The component includes tier selection, form inputs, and modal dialogs. Current accessibility status is unknown and requires comprehensive audit.',

    functional_requirements: [
      'VentureCreationPage passes axe DevTools audit with 0 WCAG 2.1 AA violations',
      'All buttons, inputs, and interactive elements have descriptive ARIA labels',
      'Color contrast ratios meet WCAG standards (4.5:1 for normal text, 3:1 for large text and UI components)',
      'Complete keyboard navigation support using Tab, Shift+Tab, Enter, Escape keys',
      'Screen reader announces all page sections, form fields, and status messages in logical order',
      'All focusable elements display visible focus indicators (outline or ring)',
      'Tier selection buttons have accessible names and states',
      'Form validation errors are announced to screen readers',
      'Modal dialogs (e.g., TierGraduationModal) trap focus and announce properly',
      'No color-only information conveyance (use text labels + icons)'
    ],

    technical_requirements: [
      'Install and configure eslint-plugin-jsx-a11y for automated linting',
      'Add axe-core/playwright integration for E2E accessibility testing',
      'Use semantic HTML elements (button, label, input, section, nav)',
      'Leverage existing useKeyboardNav hook from SD-VWC-PHASE1-001 (185 LOC)',
      'Add proper ARIA attributes: aria-label, aria-describedby, aria-live, role',
      'Implement focus management for modals (focus trap, Escape to close)',
      'Ensure color contrast meets 4.5:1 (text) and 3:1 (UI) using contrast checker',
      'Add skip navigation links for keyboard users',
      'Configure CI/CD to fail builds on accessibility lint errors',
      'Document remediation patterns in inline code comments'
    ],

    acceptance_criteria: [
      'axe DevTools browser extension scan shows 0 violations for WCAG 2.1 AA',
      'All interactive elements have aria-label or aria-labelledby',
      'Color contrast analyzer confirms all text/UI meets minimum ratios',
      'Keyboard-only navigation completes full venture creation flow',
      'NVDA/JAWS screen reader announces all content in logical order',
      'Focus indicators visible on all focusable elements (2px outline minimum)',
      'E2E test suite includes @axe-core/playwright automated checks',
      'eslint-plugin-jsx-a11y rules enabled and passing in CI/CD',
      'Manual accessibility testing checklist completed and documented',
      'Remediation patterns documented for future component development'
    ],

    test_scenarios: [
      {
        name: 'Tier 1 - Automated Accessibility Scan',
        type: 'E2E',
        description: 'axe-core automated scans in E2E tests catch WCAG violations',
        expected_result: '0 WCAG 2.1 AA violations reported',
        priority: 'MANDATORY'
      },
      {
        name: 'Tier 2 - Manual Screen Reader Testing',
        type: 'Manual',
        description: 'Test with NVDA, JAWS (Windows), and VoiceOver (macOS)',
        expected_result: 'All page sections and interactions announced correctly',
        priority: 'RECOMMENDED'
      },
      {
        name: 'Keyboard Navigation Flow',
        type: 'E2E',
        description: 'Complete venture creation using only keyboard',
        expected_result: 'All interactive elements reachable and operable via keyboard',
        priority: 'MANDATORY'
      },
      {
        name: 'Color Contrast Validation',
        type: 'Manual',
        description: 'Use contrast checker on all text and UI components',
        expected_result: 'All text meets 4.5:1, all UI meets 3:1 minimum',
        priority: 'MANDATORY'
      },
      {
        name: 'Focus Management in Modals',
        type: 'E2E',
        description: 'Test focus trap and Escape key in TierGraduationModal',
        expected_result: 'Focus trapped within modal, Escape closes and returns focus',
        priority: 'MANDATORY'
      }
    ],

    implementation_approach: `
## Implementation Strategy

### Phase 1: Audit (2 hours)
1. Install axe DevTools browser extension
2. Run comprehensive scan of VentureCreationPage
3. Document all WCAG 2.1 AA violations
4. Categorize by severity (Critical, Serious, Moderate, Minor)

### Phase 2: Remediation (2 hours)
1. Install eslint-plugin-jsx-a11y and configure rules
2. Add ARIA attributes to all interactive elements
3. Fix color contrast issues using contrast checker
4. Implement keyboard navigation enhancements using useKeyboardNav hook
5. Add focus indicators (2px outline minimum)
6. Implement focus trap for modals
7. Add skip navigation links

### Phase 3: Testing (1 hour)
1. Integrate @axe-core/playwright for E2E testing
2. Run automated accessibility tests
3. Manual screen reader testing (NVDA, JAWS, VoiceOver)
4. Verify all acceptance criteria met
5. Document remediation patterns

### Estimated Effort
- Total: 5 hours
- Audit: 2 hours
- Remediation: 2 hours
- Testing: 1 hour
- Estimated LOC: 250 LOC changes (ARIA attributes, focus management, contrast fixes)

### Budget Considerations
- WCAG 2.1 AA training: $100-$300
- OR external consultation: $500-$2,000
`,

    technology_stack: [
      'eslint-plugin-jsx-a11y (automated linting)',
      '@axe-core/playwright (E2E accessibility testing)',
      'axe DevTools browser extension (manual audit)',
      'NVDA (Windows screen reader)',
      'JAWS (Windows screen reader)',
      'VoiceOver (macOS screen reader)',
      'Contrast checker tool (color validation)'
    ],

    dependencies: [
      'SD-VWC-PHASE1-001 (useKeyboardNav hook, 185 LOC)',
      'VentureCreationPage component (existing)',
      'TierGraduationModal component (existing)'
    ],

    metadata: {
      target_application: 'EHG',
      success_metrics: {
        audit_violations: '0 WCAG 2.1 AA violations (baseline: unknown)',
        keyboard_nav_coverage: '100% of user flows accessible via keyboard only',
        contrast_compliance: '100% of text/UI meets WCAG contrast ratios',
        screen_reader_compatibility: 'Tested with NVDA and JAWS on Windows, VoiceOver on macOS',
        automated_test_coverage: 'E2E tests include axe-core scans for regression prevention',
        lint_compliance: '0 eslint-plugin-jsx-a11y errors in CI/CD',
        estimated_effort: '5 hours (audit: 2h, remediation: 2h, testing: 1h)',
        estimated_loc: '250 LOC changes (ARIA attributes, focus management, contrast fixes)',
        training_budget: '$100-$300 for WCAG 2.1 training OR $500-$2,000 for external consultation'
      },
      database_changes_required: false,
      database_changes_description: 'NONE (UI-only remediation - no schema modifications)',
      testing_strategy: {
        tier_1_smoke: 'axe-core automated scans in E2E tests (MANDATORY)',
        tier_2_comprehensive: 'Manual screen reader testing (NVDA, JAWS, VoiceOver) (RECOMMENDED)',
        unit_tests: 'Not applicable (accessibility is integration-level concern)',
        e2e_tests: '@axe-core/playwright integration to catch regressions'
      },
      implementation_guidelines: [
        'Use axe DevTools browser extension for initial audit',
        'Leverage useKeyboardNav hook from SD-VWC-PHASE1-001 for keyboard navigation',
        'Enable eslint-plugin-jsx-a11y in ESLint config',
        'Allocate budget for WCAG 2.1 AA training ($100-$300) OR external consultation ($500-$2,000)',
        'Document all remediation patterns for future reference',
        'Run manual screen reader tests on Windows (NVDA/JAWS) and macOS (VoiceOver)'
      ]
    },

    plan_checklist: [
      { text: 'PRD created and saved', checked: true },
      { text: 'Functional requirements defined (10 items)', checked: true },
      { text: 'Technical requirements defined (10 items)', checked: true },
      { text: 'Acceptance criteria established (10 items)', checked: true },
      { text: 'Test scenarios defined (5 scenarios)', checked: true },
      { text: 'Implementation approach documented', checked: true },
      { text: 'Success metrics established', checked: true },
      { text: 'Budget considerations documented', checked: true },
      { text: 'Dependencies identified', checked: true }
    ],

    exec_checklist: [
      { text: 'Install axe DevTools browser extension', checked: false },
      { text: 'Run comprehensive accessibility audit', checked: false },
      { text: 'Install and configure eslint-plugin-jsx-a11y', checked: false },
      { text: 'Add ARIA attributes to interactive elements', checked: false },
      { text: 'Fix color contrast issues', checked: false },
      { text: 'Implement keyboard navigation enhancements', checked: false },
      { text: 'Add focus indicators', checked: false },
      { text: 'Implement focus trap for modals', checked: false },
      { text: 'Integrate @axe-core/playwright for E2E testing', checked: false },
      { text: 'Run manual screen reader tests', checked: false },
      { text: 'Document remediation patterns', checked: false }
    ],

    validation_checklist: [
      { text: 'axe DevTools scan shows 0 WCAG 2.1 AA violations', checked: false },
      { text: 'All interactive elements have ARIA labels', checked: false },
      { text: 'Color contrast meets minimum ratios', checked: false },
      { text: 'Keyboard navigation completes full flow', checked: false },
      { text: 'Screen readers announce content correctly', checked: false },
      { text: 'Focus indicators visible on all elements', checked: false },
      { text: 'E2E tests include axe-core checks', checked: false },
      { text: 'eslint-plugin-jsx-a11y passing in CI/CD', checked: false },
      { text: 'Manual testing checklist completed', checked: false },
      { text: 'Remediation patterns documented', checked: false }
    ],

    progress: 0,
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Insert PRD
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      console.log(`⚠️  PRD ${prdId} already exists in database`);
      console.log('\nTo update it, first delete the existing record:');
      console.log(`DELETE FROM product_requirements_v2 WHERE id = '${prdId}';`);
    } else {
      console.error('❌ Database insert error:', error.message);
      console.error('Error details:', error);
    }
    process.exit(1);
  }

  console.log(`✅ ${prdId} created successfully!\n`);
  console.log('═══════════════════════════════════════════════════');
  console.log('📊 PRD SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`ID: ${data.id}`);
  console.log(`Title: ${data.title}`);
  console.log(`Status: ${data.status}`);
  console.log(`Priority: ${data.priority}`);
  console.log(`Target Application: EHG`);
  console.log(`\nFunctional Requirements: ${data.functional_requirements.length} items`);
  console.log(`Technical Requirements: ${data.technical_requirements.length} items`);
  console.log(`Acceptance Criteria: ${data.acceptance_criteria.length} items`);
  console.log(`Test Scenarios: ${data.test_scenarios.length} scenarios`);
  console.log(`\nDatabase Changes Required: No`);
  console.log(`Estimated Effort: 5 hours`);
  console.log(`Estimated LOC: 250 LOC changes`);
  console.log('═══════════════════════════════════════════════════');

  // Now trigger the Product Requirements Expert sub-agent (STORIES)
  console.log('\n🤖 Next Step: Trigger Product Requirements Expert (STORIES) sub-agent');
  console.log('This will generate user stories with implementation context.');
  console.log('\nRun:');
  console.log(`  node lib/sub-agent-executor.js STORIES ${sdId}`);
  console.log('\nOr use the orchestrator:');
  console.log(`  node scripts/orchestrate-phase-subagents.js PLAN_PRD ${sdId}`);
}

createPRD().catch(console.error);
