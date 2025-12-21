#!/usr/bin/env node

/**
 * Create PRD for SD-VWC-A11Y-002
 *
 * Comprehensive PRD for Phase 2 Accessibility Compliance - VentureCreationPage
 * Part of LEO Protocol PLAN phase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

const SD_ID = 'SD-VWC-A11Y-002';
const PRD_ID = `PRD-${SD_ID}`;

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}...`);
  console.log('═'.repeat(70));

  // Get SD uuid_id
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, title, description, strategic_objectives, metadata')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found`);
    process.exit(1);
  }

  console.log(`   SD UUID: ${sdData.uuid_id}`);
  console.log(`   Title: ${sdData.title}\n`);

  const prd = {
    id: PRD_ID,
    directive_id: SD_ID,
    sd_uuid: sdData.uuid_id,
    title: 'VentureCreationPage Phase 2 Accessibility: Color Contrast, Focus Indicators & Screen Reader Testing',
    version: '1.0',
    status: 'planning',
    category: 'accessibility',
    priority: 'high',
    executive_summary: `Complete Phase 2 accessibility work deferred from SD-VWC-A11Y-001 to achieve full WCAG 2.1 AA compliance for VentureCreationPage. Phase 1 delivered semantic HTML foundation and ARIA labels (100% quality score). Phase 2 focuses on visual accessibility:

- Color contrast audit and remediation (all text 4.5:1, all UI components 3:1)
- Focus indicator implementation (visible 2px outlines on all interactive elements)
- Screen reader testing with NVDA and JAWS (complete user flow validation)
- Comprehensive E2E test coverage (keyboard navigation, ARIA announcements)
- Accessibility patterns documentation for team reuse

Timeline: 4-5 hours implementation + budget for WCAG training if needed ($100-$300)`,

    business_context: `User-approved scope split from SD-VWC-A11Y-001 to manage time constraints while maintaining accessibility goals. Phase 1 laid semantic foundation; Phase 2 ensures visual accessibility and comprehensive testing. Required for legal compliance and inclusive user experience.`,

    technical_context: `Target component: src/components/ventures/VentureCreationPage.tsx (lines 81-126). Builds on Phase 1 semantic HTML and ARIA labels. Uses Shadcn UI components which provide accessibility primitives but require customization for WCAG AA compliance. Testing stack: Playwright E2E + axe-core automated + manual NVDA/JAWS testing.`,

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Color Contrast Audit & Remediation',
        description: 'Audit all color combinations in VentureCreationPage and fix violations to meet WCAG AA',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'All normal text meets 4.5:1 contrast ratio minimum',
          'All large text (18pt+) meets 3:1 contrast ratio',
          'All UI components (buttons, inputs, icons) meet 3:1 contrast ratio',
          'Audit documented with before/after contrast measurements',
          'axe DevTools reports 0 color contrast violations'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Focus Indicator Implementation',
        description: 'Implement visible focus indicators for all interactive elements',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'All buttons show visible focus indicator on keyboard focus',
          'All form inputs show focus indicator (2px minimum)',
          'All links and interactive elements have focus styles',
          'Focus indicators use sufficient contrast against background',
          'Focus order follows logical tab sequence'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Screen Reader Testing with NVDA',
        description: 'Test complete venture creation flow with NVDA screen reader',
        priority: 'HIGH',
        acceptance_criteria: [
          'All form labels announced correctly',
          'Required fields announced as required',
          'Error messages announced when validation fails',
          'Button purposes announced clearly',
          'Complete venture creation flow testable without visual cues'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Screen Reader Testing with JAWS (Optional)',
        description: 'Validate venture creation flow with JAWS screen reader if budget permits',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Cross-validate NVDA findings with JAWS',
          'Identify JAWS-specific issues if any',
          'Document differences between NVDA and JAWS behavior',
          'Budget $100-$300 for JAWS license if not available'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Comprehensive E2E Test Coverage',
        description: 'Create Playwright E2E tests for all accessibility features',
        priority: 'HIGH',
        acceptance_criteria: [
          'E2E test validates keyboard navigation through entire form',
          'E2E test validates ARIA labels are present',
          'E2E test validates focus indicators are visible',
          'E2E test runs axe-core accessibility scan',
          'E2E test coverage reaches 100% of accessibility user stories'
        ]
      },
      {
        id: 'FR-6',
        requirement: 'Accessibility Patterns Documentation',
        description: 'Document accessibility patterns for reuse across application',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Color contrast guidelines documented in docs/accessibility/',
          'Focus indicator CSS patterns documented',
          'Screen reader testing protocol documented',
          'Code examples provided for common patterns',
          'Team training materials created or identified'
        ]
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Color Contrast Measurement Tools',
        technology: 'axe DevTools, Chrome DevTools Color Picker',
        description: 'Use browser dev tools and axe DevTools for contrast ratio measurement',
        rationale: 'WCAG AA requires precise contrast ratio measurements'
      },
      {
        id: 'TR-2',
        requirement: 'Focus Indicator CSS Implementation',
        technology: 'Tailwind CSS, custom CSS with :focus-visible',
        description: 'Implement focus styles using :focus-visible pseudo-class for keyboard-only focus',
        rationale: 'Avoid showing focus indicators on mouse click while maintaining keyboard accessibility'
      },
      {
        id: 'TR-3',
        requirement: 'NVDA Screen Reader',
        technology: 'NVDA 2023+ (free, open-source)',
        description: 'Use NVDA for Windows screen reader testing',
        rationale: 'Most popular free screen reader, representative of user experience'
      },
      {
        id: 'TR-4',
        requirement: 'Playwright Accessibility Testing',
        technology: 'Playwright + @axe-core/playwright',
        description: 'Integrate axe-core into Playwright E2E tests for automated accessibility scanning',
        rationale: 'Catch regressions automatically in CI/CD pipeline'
      },
      {
        id: 'TR-5',
        requirement: 'WCAG Training Resources (If Needed)',
        technology: 'Deque University, WebAIM courses',
        description: 'Budget $100-$300 for WCAG training if knowledge gaps identified',
        rationale: 'Ensure proper understanding of WCAG AA requirements'
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Color Contrast Audit - Normal Text',
        description: 'Measure contrast ratio for all normal text (body, labels, help text)',
        priority: 'CRITICAL',
        expected_result: 'All normal text meets 4.5:1 minimum contrast ratio'
      },
      {
        id: 'TS-2',
        scenario: 'Color Contrast Audit - UI Components',
        description: 'Measure contrast ratio for buttons, inputs, icons, borders',
        priority: 'CRITICAL',
        expected_result: 'All UI components meet 3:1 minimum contrast ratio'
      },
      {
        id: 'TS-3',
        scenario: 'Focus Indicator Keyboard Navigation',
        description: 'Tab through entire VentureCreationPage form using keyboard only',
        priority: 'CRITICAL',
        expected_result: 'Focus indicators visible at every stop, logical tab order followed'
      },
      {
        id: 'TS-4',
        scenario: 'NVDA Screen Reader Full Flow',
        description: 'Complete venture creation from start to finish using only NVDA',
        priority: 'HIGH',
        expected_result: 'All form elements announced, venture created successfully without visual cues'
      },
      {
        id: 'TS-5',
        scenario: 'JAWS Screen Reader Validation (Optional)',
        description: 'Validate venture creation flow with JAWS if budget permits',
        priority: 'MEDIUM',
        expected_result: 'JAWS behavior consistent with NVDA, no JAWS-specific issues'
      },
      {
        id: 'TS-6',
        scenario: 'Playwright E2E Accessibility Suite',
        description: 'Run complete E2E test suite with axe-core integration',
        priority: 'HIGH',
        expected_result: 'All tests pass, axe-core reports 0 WCAG AA violations'
      },
      {
        id: 'TS-7',
        scenario: 'Regression Test - Phase 1 Features',
        description: 'Verify Phase 1 semantic HTML and ARIA labels still intact',
        priority: 'HIGH',
        expected_result: 'Zero regressions from SD-VWC-A11Y-001 Phase 1 work'
      }
    ],

    acceptance_criteria: [
      'All text meets 4.5:1 color contrast ratio (WCAG AA)',
      'All UI components meet 3:1 color contrast ratio',
      'Focus indicators visible on all interactive elements (2px minimum)',
      'Complete venture creation flow tested with NVDA',
      'axe DevTools scan shows 0 WCAG 2.1 AA violations',
      'E2E tests cover 100% of accessibility user stories',
      'Accessibility patterns documented in docs/accessibility/',
      'Zero regressions from Phase 1 work',
      'WCAG training completed or skipped with justification',
      'Screen reader testing protocol documented'
    ],

    system_architecture: JSON.stringify({
      target_application: '/mnt/c/_EHG/EHG/',
      target_component: 'src/components/ventures/VentureCreationPage.tsx',
      component_lines: '81-126',
      parent_sd: 'SD-VWC-A11Y-001 (Phase 1 - completed 100%)',
      dependencies: [
        'Shadcn UI components (base accessibility)',
        'Tailwind CSS (focus indicator styling)',
        'Playwright + axe-core (E2E testing)',
        'NVDA screen reader (manual testing)'
      ],
      testing_tools: [
        'axe DevTools (color contrast measurement)',
        'Chrome DevTools Color Picker',
        'NVDA 2023+ (free screen reader)',
        'Playwright @axe-core/playwright',
        'JAWS (optional, budgeted $100-$300)'
      ],
      wcag_level: 'AA (2.1)',
      affected_areas: [
        'Button color schemes',
        'Form input borders and labels',
        'Help text and error messages',
        'Focus indicator CSS',
        'ARIA announcements (verify Phase 1)'
      ]
    }),

    implementation_approach: JSON.stringify({
      strategy: 'Incremental accessibility enhancements with comprehensive testing',
      phases: [
        {
          phase: 1,
          name: 'Color Contrast Audit',
          duration: '1-1.5 hours',
          tasks: [
            'Install axe DevTools browser extension',
            'Audit all text elements for 4.5:1 ratio',
            'Audit all UI components for 3:1 ratio',
            'Document findings with screenshots',
            'Identify CSS variables to update'
          ],
          deliverables: ['Color contrast audit report', 'List of violations']
        },
        {
          phase: 2,
          name: 'Color Contrast Remediation',
          duration: '0.5-1 hour',
          tasks: [
            'Update Tailwind config or custom CSS',
            'Fix text color violations',
            'Fix UI component color violations',
            'Re-scan with axe DevTools',
            'Verify all violations resolved'
          ],
          deliverables: ['Updated color palette', 'axe-core clean scan']
        },
        {
          phase: 3,
          name: 'Focus Indicator Implementation',
          duration: '0.5-1 hour',
          tasks: [
            'Add :focus-visible CSS for buttons',
            'Add focus styles for inputs',
            'Style focus indicators for links',
            'Test keyboard navigation through form',
            'Verify 2px minimum outline width'
          ],
          deliverables: ['Focus indicator CSS', 'Keyboard navigation video']
        },
        {
          phase: 4,
          name: 'Screen Reader Testing',
          duration: '1-1.5 hours',
          tasks: [
            'Install NVDA (if not already installed)',
            'Test complete venture creation flow',
            'Document NVDA announcements',
            'Fix any screen reader issues found',
            'Optional: Test with JAWS if budget permits'
          ],
          deliverables: ['NVDA testing report', 'Screen reader issues log']
        },
        {
          phase: 5,
          name: 'E2E Test Coverage',
          duration: '1 hour',
          tasks: [
            'Create Playwright test for keyboard navigation',
            'Integrate @axe-core/playwright',
            'Add E2E test for ARIA labels',
            'Add E2E test for focus indicators',
            'Verify 100% user story coverage'
          ],
          deliverables: ['E2E accessibility test suite', 'Coverage report']
        },
        {
          phase: 6,
          name: 'Documentation & Training',
          duration: '0.5 hour',
          tasks: [
            'Document color contrast guidelines',
            'Document focus indicator patterns',
            'Document screen reader testing protocol',
            'Create code examples for reuse',
            'Identify or complete WCAG training'
          ],
          deliverables: ['Accessibility documentation', 'Team training materials']
        }
      ],
      total_estimated_duration: '4.5-6 hours + training time',
      wcag_training_budget: '$100-$300 (if needed)',
      rollout_strategy: 'All changes bundled in single PR with comprehensive testing'
    }),

    dependencies: [
      {
        id: 'DEP-1',
        name: 'SD-VWC-A11Y-001 Phase 1',
        type: 'parent_sd',
        status: 'completed',
        blocker: false,
        description: 'Phase 1 semantic HTML and ARIA labels completed (100% quality score)'
      },
      {
        id: 'DEP-2',
        name: 'axe DevTools',
        type: 'tool',
        status: 'needs_installation',
        blocker: false,
        description: 'Browser extension for color contrast measurement'
      },
      {
        id: 'DEP-3',
        name: 'NVDA Screen Reader',
        type: 'tool',
        status: 'needs_installation',
        blocker: false,
        description: 'Free Windows screen reader for testing'
      },
      {
        id: 'DEP-4',
        name: '@axe-core/playwright',
        type: 'npm_package',
        status: 'needs_installation',
        blocker: false,
        description: 'Playwright integration for automated accessibility testing'
      },
      {
        id: 'DEP-5',
        name: 'WCAG Training (Optional)',
        type: 'training',
        status: 'optional',
        blocker: false,
        description: 'Deque University or WebAIM courses ($100-$300 budget)'
      }
    ],

    risks: [
      {
        risk: 'Color changes affect brand consistency',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Visual design changes may require stakeholder approval',
        category: 'Design',
        mitigation: 'Document color changes with before/after comparisons, get designer approval if available'
      },
      {
        risk: 'WCAG training time exceeds estimate',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'Training budget $100-$300 may be insufficient for comprehensive WCAG course',
        category: 'Resource',
        mitigation: 'Use free WebAIM resources first, budget paid training only if gaps identified'
      },
      {
        risk: 'Screen reader testing reveals major issues',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'Significant rework required if ARIA labels from Phase 1 insufficient',
        category: 'Technical',
        mitigation: 'Phase 1 laid solid foundation, Phase 2 should only require minor adjustments'
      },
      {
        risk: 'JAWS license cost exceeds budget',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'JAWS testing skipped if license >$300',
        category: 'Budget',
        mitigation: 'NVDA testing sufficient for WCAG AA compliance, JAWS optional'
      }
    ],

    constraints: [
      'Target application: /mnt/c/_EHG/EHG/ (EHG app)',
      'Target component: src/components/ventures/VentureCreationPage.tsx:81-126',
      'WCAG 2.1 AA compliance mandatory (not AAA)',
      'Color contrast: 4.5:1 normal text, 3:1 UI components',
      'Focus indicators: 2px minimum, keyboard-only (:focus-visible)',
      'Timeline: 4-6 hours implementation, budget $100-$300 for training',
      'Testing: Manual NVDA required, JAWS optional',
      'No regressions from Phase 1 work (SD-VWC-A11Y-001)',
      'All changes documented for team reuse'
    ],

    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'Functional requirements defined (6 FRs)', checked: true },
      { text: 'Technical requirements specified (5 TRs)', checked: true },
      { text: 'Test scenarios documented (7 scenarios)', checked: true },
      { text: 'Acceptance criteria established (10 criteria)', checked: true },
      { text: 'Risk assessment completed (4 risks)', checked: true },
      { text: 'System architecture defined (WCAG 2.1 AA)', checked: true },
      { text: 'Implementation approach documented (6 phases)', checked: true },
      { text: 'Dependencies identified (5 dependencies)', checked: true },
      { text: 'Constraints documented (9 constraints)', checked: true }
    ],

    exec_checklist: [
      { text: 'Navigate to /mnt/c/_EHG/EHG/ (NOT EHG_Engineer)', checked: false },
      { text: 'Install axe DevTools browser extension', checked: false },
      { text: 'Audit color contrast for all text elements', checked: false },
      { text: 'Audit color contrast for all UI components', checked: false },
      { text: 'Fix color violations in Tailwind config/CSS', checked: false },
      { text: 'Implement focus indicators with :focus-visible', checked: false },
      { text: 'Install NVDA screen reader (if Windows)', checked: false },
      { text: 'Test complete flow with NVDA', checked: false },
      { text: 'Create Playwright E2E accessibility tests', checked: false },
      { text: 'Integrate @axe-core/playwright', checked: false },
      { text: 'Document accessibility patterns', checked: false },
      { text: 'Verify zero regressions from Phase 1', checked: false }
    ],

    validation_checklist: [
      { text: 'All text meets 4.5:1 contrast (axe DevTools verified)', checked: false },
      { text: 'All UI components meet 3:1 contrast', checked: false },
      { text: 'Focus indicators visible on all interactive elements', checked: false },
      { text: 'NVDA testing completed successfully', checked: false },
      { text: 'axe DevTools shows 0 WCAG AA violations', checked: false },
      { text: 'E2E tests cover 100% of accessibility user stories', checked: false },
      { text: 'Accessibility patterns documented', checked: false },
      { text: 'Zero regressions from Phase 1', checked: false },
      { text: 'WCAG training completed or skipped with justification', checked: false },
      { text: 'Screen reader testing protocol documented', checked: false }
    ],

    progress: 15,
    phase: 'planning',
    created_by: 'PLAN (LEO Protocol)',
    metadata: {
      phase: 2,
      parent_sd: 'SD-VWC-A11Y-001',
      wcag_level: 'AA',
      wcag_version: '2.1',
      estimated_hours: '4-6 hours',
      training_budget: '$100-$300',
      deferred_from: 'SD-VWC-A11Y-001',
      testing_tools: ['axe DevTools', 'NVDA', 'Playwright', '@axe-core/playwright'],
      focus_areas: ['color-contrast', 'focus-indicators', 'screen-reader-testing', 'e2e-coverage']
    }
  };

  // Insert PRD
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      console.log(`⚠️  ${PRD_ID} already exists, updating instead...`);

      const { data: updateData, error: updateError } = await supabase
        .from('product_requirements_v2')
        .update(prd)
        .eq('id', PRD_ID)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Update error:', updateError.message);
        process.exit(1);
      }

      console.log(`✅ ${PRD_ID} updated successfully!`);
    } else {
      console.error('❌ Insert error:', error.message);
      console.error('Error details:', error);
      process.exit(1);
    }
  } else {
    console.log(`✅ ${PRD_ID} created successfully!`);
  }

  // Display summary
  console.log('\n📊 PRD Summary:');
  console.log('-'.repeat(70));
  console.log(`ID: ${PRD_ID}`);
  console.log(`Title: ${prd.title}`);
  console.log(`Status: ${prd.status}`);
  console.log(`Priority: ${prd.priority}`);
  console.log(`Progress: ${prd.progress}%`);
  console.log(`\nFunctional Requirements: ${prd.functional_requirements.length}`);
  console.log(`Technical Requirements: ${prd.technical_requirements.length}`);
  console.log(`Test Scenarios: ${prd.test_scenarios.length}`);
  console.log(`Acceptance Criteria: ${prd.acceptance_criteria.length}`);
  console.log(`Risks: ${prd.risks.length}`);
  console.log(`\nEstimated Duration: ${JSON.parse(prd.implementation_approach).total_estimated_duration}`);
  console.log(`Training Budget: ${JSON.parse(prd.implementation_approach).wcag_training_budget}`);
  console.log('═'.repeat(70));

  console.log('\n✅ PRD creation complete!');
  console.log('\n📝 Next steps:');
  console.log('1. Review PRD in database (product_requirements_v2 table)');
  console.log('2. Run Database Architect validation');
  console.log('3. Create PLAN→EXEC handoff when ready');
}

createPRD().catch(console.error);
