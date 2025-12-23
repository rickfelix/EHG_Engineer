#!/usr/bin/env node
/**
 * Create E2E Test Orchestrator SD (Run 3) - Human-Like Testing
 *
 * Creates a fresh E2E testing round using Human-Like testing approach:
 * - Accessibility (WCAG 2.1 AA compliance, keyboard navigation)
 * - Chaos/Resilience (network failures, error recovery)
 * - Visual Regression (CLS, layout shifts)
 * - UX Evaluation (LLM-based human-like assessment)
 *
 * This is a FRESH START - no knowledge of Runs 1 or 2.
 * Tests the EHG frontend as if seeing it for the first time.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Parent Orchestrator SD (Run 3 - Human-Like Testing)
const parentSD = {
  id: 'SD-E2E-TEST-ORCHESTRATOR-003',
  title: 'E2E Human-Like Testing Orchestrator (Run 3)',
  category: 'Quality Assurance',
  priority: 'high',
  status: 'draft',
  current_phase: 'LEAD_APPROVAL',
  phase_progress: 0,
  progress: 0,
  progress_percentage: 0,
  sd_type: 'orchestrator',
  sd_key: 'E2E-HUMAN-LIKE-R3',
  description: `Parent orchestrator for Human-Like E2E testing of the EHG frontend.
This run uses a fresh perspective - testing as if seeing the application for the first time.

Human-Like Testing evaluates:
1. Accessibility - Can all users access and use the application?
2. Resilience - Does the app recover gracefully from failures?
3. Visual Quality - Are there jarring layout shifts or visual issues?
4. UX Quality - Does the UI "feel right" to a human user?

Unlike traditional E2E tests that verify specific flows, Human-Like testing catches
issues that "feel wrong" but might pass functional tests.`,
  rationale: `Previous E2E test runs focused on functional correctness. Human-Like testing
adds a layer that catches:
- Accessibility violations that block users with disabilities
- Poor error recovery that frustrates users
- Layout shifts that feel janky
- UI patterns that confuse first-time users

This complements functional testing by evaluating the human experience.`,
  scope: `Tests in /tests/e2e/:
- accessibility/ - WCAG 2.1 AA compliance, keyboard navigation
- resilience/ - Network chaos, error recovery, multi-tab behavior
- visual/ - CLS tracking, screenshot comparisons
- ux-evaluation/ - LLM-based UX assessment

Target: EHG frontend at http://localhost:8080`,
  relationship_type: 'parent',
  parent_sd_id: null,
  sequence_rank: 1,
  is_active: true,
  is_working_on: false,
  metadata: {
    is_parent: true,
    children_count: 6,
    children_completed: 0,
    orchestrator_state: 'pending',
    waiting_for_children: false,
    run_number: 3,
    testing_approach: 'human-like',
    fresh_perspective: true,
    target_url: 'http://localhost:8080'
  }
};

// Child SDs for Human-Like Testing (Run 3)
const childSDs = [
  {
    id: 'SD-E2E-ACCESSIBILITY-001-R3',
    title: 'E2E Accessibility: WCAG 2.1 AA Compliance (Run 3)',
    category: 'Quality Assurance',
    priority: 'critical',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    phase_progress: 0,
    progress: 0,
    progress_percentage: 0,
    sd_type: 'infrastructure',
    sd_key: 'E2E-A11Y-R3',
    description: `Comprehensive accessibility testing using axe-core.

Tests verify:
- WCAG 2.1 AA compliance on all pages
- Form accessibility (labels, error messages, focus management)
- Navigation accessibility (semantic HTML, ARIA landmarks)
- Color contrast and text readability
- Screen reader compatibility

FRESH PERSPECTIVE: Evaluate as if auditing for the first time.`,
    rationale: `Accessibility is both a legal requirement and a user experience priority.
axe-core catches 57% of WCAG violations automatically with zero false positives.`,
    scope: `Tests: tests/e2e/accessibility/wcag-check.spec.ts
Pages to audit:
- Home page (/)
- Login page (/login)
- Chairman dashboard (/chairman)
- Venture creation (/ventures)
- All primary navigation paths

Stringency: standard (block critical/serious, warn moderate)`,
    relationship_type: 'child',
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR-003',
    sequence_rank: 1,
    is_active: true,
    is_working_on: false,
    dependency_chain: { dependencies: [], execution_order: 1 }
  },
  {
    id: 'SD-E2E-KEYBOARD-NAV-002-R3',
    title: 'E2E Keyboard Navigation: Focus Management (Run 3)',
    category: 'Quality Assurance',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    phase_progress: 0,
    progress: 0,
    progress_percentage: 0,
    sd_type: 'infrastructure',
    sd_key: 'E2E-KEYBOARD-R3',
    description: `Keyboard navigation testing for users who can't use a mouse.

Tests verify:
- Tab order is logical and follows visual layout
- Focus is visible on all interactive elements
- No focus traps (except intentional modal traps)
- Skip links work correctly
- All functionality accessible via keyboard

FRESH PERSPECTIVE: Navigate the entire app using only keyboard.`,
    rationale: `Keyboard navigation is critical for accessibility. Focus traps and
broken tab order are common issues that frustrate keyboard users.`,
    scope: `Tests: tests/e2e/accessibility/wcag-check.spec.ts (keyboard tests)
Flows to verify:
- Home → Login → Dashboard flow
- Modal dialogs trap focus correctly
- Dropdown menus accessible
- Form submission via Enter key

Fixtures: keyboard-oracle.ts`,
    relationship_type: 'child',
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR-003',
    sequence_rank: 2,
    is_active: true,
    is_working_on: false,
    dependency_chain: { dependencies: ['SD-E2E-ACCESSIBILITY-001-R3'], execution_order: 2 }
  },
  {
    id: 'SD-E2E-CHAOS-RESILIENCE-003-R3',
    title: 'E2E Chaos Testing: Error Recovery & Resilience (Run 3)',
    category: 'Quality Assurance',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    phase_progress: 0,
    progress: 0,
    progress_percentage: 0,
    sd_type: 'infrastructure',
    sd_key: 'E2E-CHAOS-R3',
    description: `Chaos engineering tests that verify graceful degradation.

Tests verify:
- Network failure handling (offline mode, API errors)
- Double-submit prevention (idempotency)
- Multi-tab conflict resolution
- Refresh during loading states
- Error message clarity and recovery paths

FRESH PERSPECTIVE: Try to break the app - see how it handles abuse.`,
    rationale: `Real users experience network issues, accidentally double-click,
and use multiple tabs. The app should handle these gracefully.`,
    scope: `Tests: tests/e2e/resilience/
Scenarios:
- API returns 500 error - does app show helpful message?
- Network drops during form submission - no duplicate data?
- Open same page in two tabs, edit in both - conflict handling?
- Refresh during loading - state preserved?

Fixtures: chaos-saboteur.ts`,
    relationship_type: 'child',
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR-003',
    sequence_rank: 3,
    is_active: true,
    is_working_on: false,
    dependency_chain: { dependencies: ['SD-E2E-ACCESSIBILITY-001-R3'], execution_order: 3 }
  },
  {
    id: 'SD-E2E-VISUAL-REGRESSION-004-R3',
    title: 'E2E Visual Testing: CLS & Layout Stability (Run 3)',
    category: 'Quality Assurance',
    priority: 'medium',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    phase_progress: 0,
    progress: 0,
    progress_percentage: 0,
    sd_type: 'infrastructure',
    sd_key: 'E2E-VISUAL-R3',
    description: `Visual regression testing to catch layout shifts and visual bugs.

Tests verify:
- Cumulative Layout Shift (CLS) < 0.1 on all pages
- No visual regressions from baseline screenshots
- Above-fold content loads without shifting
- Images and fonts load without layout jumps
- Responsive design works across viewport sizes

FRESH PERSPECTIVE: Watch the page load - does anything jump around?`,
    rationale: `Layout shifts are jarring and feel unprofessional. CLS is a Core Web
Vital that affects both UX and SEO.`,
    scope: `Tests: tests/e2e/visual/
Measurements:
- CLS score on page load
- Screenshot comparison (2% tolerance)
- Above-fold density check
- Loading state stability

Fixtures: visual-oracle.ts`,
    relationship_type: 'child',
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR-003',
    sequence_rank: 4,
    is_active: true,
    is_working_on: false,
    dependency_chain: { dependencies: ['SD-E2E-ACCESSIBILITY-001-R3'], execution_order: 4 }
  },
  {
    id: 'SD-E2E-UX-EVALUATION-005-R3',
    title: 'E2E UX Evaluation: LLM-Based Human Assessment (Run 3)',
    category: 'Quality Assurance',
    priority: 'medium',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    phase_progress: 0,
    progress: 0,
    progress_percentage: 0,
    sd_type: 'infrastructure',
    sd_key: 'E2E-UX-EVAL-R3',
    description: `LLM-based UX evaluation that catches "feels wrong" issues.

Multi-lens evaluation:
1. First-time user - Is the purpose clear? Are CTAs obvious?
2. Accessibility lens - Visual a11y issues axe-core misses
3. Mobile user - Touch targets, thumb zones, scroll fatigue
4. Error recovery - Helpful errors? Clear recovery paths?
5. Cognitive load - Too many choices? Overwhelming forms?

FRESH PERSPECTIVE: Ask an LLM to evaluate each page as a first-time user.`,
    rationale: `Some UX issues pass programmatic tests but "feel wrong" to humans.
LLM evaluation catches confusing flows, unclear CTAs, and cognitive overload.`,
    scope: `Tests: tests/e2e/ux-evaluation/
Pages to evaluate:
- Landing page (first impression)
- Login/signup flow
- Main dashboard
- Critical user journeys

Budget: ~$20/month for comprehensive coverage
Fixtures: llm-ux-oracle.ts`,
    relationship_type: 'child',
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR-003',
    sequence_rank: 5,
    is_active: true,
    is_working_on: false,
    dependency_chain: { dependencies: ['SD-E2E-ACCESSIBILITY-001-R3'], execution_order: 5 }
  },
  {
    id: 'SD-E2E-RETROSPECTIVE-006-R3',
    title: 'E2E Testing Retrospective: Continuous Improvement (Run 3)',
    category: 'Quality Assurance',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    phase_progress: 0,
    progress: 0,
    progress_percentage: 0,
    sd_type: 'infrastructure',
    sd_key: 'E2E-RETRO-R3',
    description: `Generate comprehensive retrospective from all Human-Like E2E results.

Deliverables:
1. Metrics summary - pass rates, duration, category breakdown
2. Flaky test detection - tests with inconsistent results
3. Improvement opportunities - prioritized by impact
4. Trend analysis - comparison with baseline
5. Action items - specific fixes to implement

This SD runs AFTER all other tests complete.`,
    rationale: `The retrospective captures learnings and ensures continuous improvement.
Without it, we miss opportunities to make the testing process faster and more accurate.`,
    scope: `Script: npm run test:e2e:retro
Outputs:
- Console summary
- Database metrics (human_like_e2e_runs table)
- Improvement suggestions (human_like_e2e_improvements table)

Review and prioritize findings for next iteration.`,
    relationship_type: 'child',
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR-003',
    sequence_rank: 6,
    is_active: true,
    is_working_on: false,
    dependency_chain: {
      dependencies: [
        'SD-E2E-ACCESSIBILITY-001-R3',
        'SD-E2E-KEYBOARD-NAV-002-R3',
        'SD-E2E-CHAOS-RESILIENCE-003-R3',
        'SD-E2E-VISUAL-REGRESSION-004-R3',
        'SD-E2E-UX-EVALUATION-005-R3'
      ],
      execution_order: 6,
      note: 'Runs after all tests complete'
    }
  }
];

async function createSDs() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   Creating E2E Human-Like Testing Orchestrator (Run 3)          ║');
  console.log('║   Fresh Perspective - Testing as if seeing app first time       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Create parent SD
  console.log('1. Creating parent orchestrator SD...');
  const { data: parent, error: parentError } = await supabase
    .from('strategic_directives_v2')
    .upsert(parentSD, { onConflict: 'id' })
    .select('id, title');

  if (parentError) {
    console.error('   ERROR creating parent:', parentError.message);
    process.exit(1);
  }
  console.log(`   ✅ Created: ${parent[0].id}`);
  console.log(`      ${parent[0].title}\n`);

  // Create child SDs
  console.log('2. Creating child SDs...');
  for (const childSD of childSDs) {
    const { data: child, error: childError } = await supabase
      .from('strategic_directives_v2')
      .upsert(childSD, { onConflict: 'id' })
      .select('id, title, priority');

    if (childError) {
      console.error(`   ❌ ERROR creating ${childSD.id}:`, childError.message);
    } else {
      const priorityIcon = child[0].priority === 'critical' ? '🔴' :
                          child[0].priority === 'high' ? '🟠' : '🟡';
      console.log(`   ${priorityIcon} [${child[0].priority.toUpperCase()}] ${child[0].id}`);
      console.log(`      ${child[0].title}`);
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('✅ Human-Like E2E Test Orchestrator Created Successfully!');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log('📋 ORCHESTRATOR STRUCTURE:');
  console.log('');
  console.log('   Parent: SD-E2E-TEST-ORCHESTRATOR-003');
  console.log('   Approach: Human-Like Testing (fresh perspective)');
  console.log('   Target: http://localhost:8080 (EHG Frontend)');
  console.log('');
  console.log('   Children (6 SDs):');
  console.log('   ┌─────────────────────────────────────────────────────────────┐');
  console.log('   │ 1. SD-E2E-ACCESSIBILITY-001-R3    [CRITICAL] WCAG Compliance│');
  console.log('   │ 2. SD-E2E-KEYBOARD-NAV-002-R3     [HIGH] Focus Management   │');
  console.log('   │ 3. SD-E2E-CHAOS-RESILIENCE-003-R3 [HIGH] Error Recovery     │');
  console.log('   │ 4. SD-E2E-VISUAL-REGRESSION-004-R3 [MEDIUM] CLS & Layout    │');
  console.log('   │ 5. SD-E2E-UX-EVALUATION-005-R3    [MEDIUM] LLM UX Review    │');
  console.log('   │ 6. SD-E2E-RETROSPECTIVE-006-R3    [HIGH] Continuous Improv. │');
  console.log('   └─────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('📊 EXECUTION ORDER:');
  console.log('   1 → Accessibility (foundation - must pass first)');
  console.log('   2 → Keyboard Navigation (depends on a11y)');
  console.log('   3 → Chaos/Resilience (parallel with 2)');
  console.log('   4 → Visual Regression (parallel with 2,3)');
  console.log('   5 → UX Evaluation (parallel with 2,3,4)');
  console.log('   6 → Retrospective (runs after ALL others complete)');
  console.log('');
  console.log('🚀 NEXT STEPS:');
  console.log('   1. Run: npm run sd:next');
  console.log('   2. Select SD-E2E-TEST-ORCHESTRATOR-003 for LEAD approval');
  console.log('   3. Execute child SDs in order');
  console.log('   4. Use: npm run test:e2e:human:restart for each test run');
  console.log('');
}

createSDs().catch(console.error);
