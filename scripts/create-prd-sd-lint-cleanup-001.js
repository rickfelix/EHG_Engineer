#!/usr/bin/env node

/**
 * PRD Creation Script for SD-LINT-CLEANUP-001
 * Codebase Lint Cleanup - Pre-Existing CI/CD Blockers
 *
 * Fixes 8 a11y errors and 5 React hooks warnings blocking CI/CD pipeline
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const SD_ID = 'SD-LINT-CLEANUP-001';
const PRD_TITLE = 'Codebase Lint Cleanup - Pre-Existing CI/CD Blockers - Technical Implementation';

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
  // STEP 1: Fetch Strategic Directive UUID
  // -------------------------------------------------------------------------

  console.log('\n1️⃣  Fetching Strategic Directive...');

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.uuid_id}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    id: prdId,
    sd_uuid: sdData.uuid_id,
    directive_id: SD_ID,

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',
    category: 'Optimization',
    priority: 'high',

    // Executive & Context
    executive_summary: `
Fix 8 accessibility errors and 5 React hooks warnings in pre-existing codebase components that are blocking CI/CD pipeline for ALL Strategic Directives.

**What**: Systematic lint error cleanup across 5 component directories (chairman/, audio/, analytics/, ai-ceo/, onboarding/).

**Why**: Pre-existing lint errors cause all PRs to fail CI/CD validation, creating false negatives that prevent legitimate work from progressing. This blocks quality gates and wastes developer time (1-2 hours per SD) debugging unrelated lint failures.

**Impact**: Unblocks CI/CD for entire codebase, enabling proper quality gates. Estimated ROI: 2-3 hour investment saves 20-40 hours quarterly (10-20x return).
    `.trim(),

    business_context: `
**Problem**: During SD-E2E-INFRASTRUCTURE-001 PLAN verification, CI/CD pipeline failed due to pre-existing lint errors in UNRELATED files. These errors exist in production code and block all new work from passing CI/CD validation.

**User Pain Points**:
- Developers creating PRs encounter lint failures in files they didn't touch
- CI/CD quality gates produce false negatives, hiding real issues
- 1-2 hours wasted per SD debugging and working around pre-existing errors
- Quality gates are ineffective when baseline code quality is compromised

**Business Objectives**:
1. Restore CI/CD pipeline effectiveness for quality validation
2. Establish clean code quality baseline for future development
3. Reduce developer friction and wasted time on unrelated lint errors
4. Enable proper accessibility compliance (jsx-a11y rules)
5. Prevent React hooks anti-patterns (exhaustive-deps violations)

**Success Metrics**:
- CI/CD lint check passes with 0 errors, 0 warnings
- Test PRs pass all quality gates without lint failures
- Developer time saved: 20-40 hours per quarter (measured by reduction in lint-related PR failures)
    `.trim(),

    technical_context: `
**Existing Systems**:
- ESLint configuration with jsx-a11y and React hooks plugins already enabled
- CI/CD pipeline (GitHub Actions) runs lint checks on all PRs
- Pre-existing lint errors in 5 component directories block all PR validation

**Current State**:
- 8 accessibility errors (jsx-a11y rules): missing ARIA labels, alt text, keyboard navigation
- 5 React hooks warnings (exhaustive-deps): missing dependencies in useEffect/useCallback hooks
- Affected components: chairman/, audio/, analytics/, ai-ceo/, onboarding/

**Architecture Patterns**:
- React 18 with TypeScript
- Shadcn UI component library
- Vite build system with ESLint integration

**Constraints**:
- Must maintain existing component behavior (no breaking changes)
- Must not suppress warnings (fix errors at source)
- Must follow established ESLint rules (no rule disabling)
- Incremental approach to minimize risk
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Fix accessibility errors in chairman/ components',
        description: 'Chairman Dashboard analytics components have missing ARIA labels and keyboard navigation issues. Fix all jsx-a11y rule violations while maintaining existing functionality.',
        priority: 'HIGH',
        acceptance_criteria: [
          'All jsx-a11y errors fixed in chairman/ directory',
          'ARIA labels added to interactive elements',
          'Keyboard navigation fully functional',
          'npm run lint passes cleanly for chairman/ files',
          'Existing component behavior unchanged (verified by E2E tests)'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Fix accessibility errors in audio/ components',
        description: 'Audio player and recording components have missing alt text and button labels. Fix all jsx-a11y violations.',
        priority: 'HIGH',
        acceptance_criteria: [
          'All jsx-a11y errors fixed in audio/ directory',
          'Alt text added to audio control icons',
          'Button labels properly defined for screen readers',
          'npm run lint passes cleanly for audio/ files',
          'Audio player functionality verified (manual test)'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Fix React hooks warnings in ai-ceo/ and onboarding/ components',
        description: 'AI CEO interface and user onboarding components have exhaustive-deps violations. Add missing dependencies to useEffect/useCallback hooks.',
        priority: 'HIGH',
        acceptance_criteria: [
          'All React hooks exhaustive-deps warnings fixed',
          'Proper dependency arrays for all hooks',
          'No unnecessary re-renders introduced (performance check)',
          'Component behavior unchanged (verified by tests)',
          'npm run lint passes cleanly for ai-ceo/ and onboarding/ files'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Fix remaining errors in analytics/ components',
        description: 'Analytics dashboard components have mixed a11y and hooks issues. Complete cleanup for all errors.',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'All lint errors fixed in analytics/ directory',
          'Both jsx-a11y and React hooks rules compliant',
          'npm run lint passes cleanly for analytics/ files',
          'Dashboard functionality verified'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Verify no new lint errors introduced',
        description: 'Full codebase lint check to ensure fixes didn\'t introduce new errors elsewhere.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'npm run lint passes with 0 errors, 0 warnings globally',
          'CI/CD lint check passes on test PR',
          'No new errors in unrelated files',
          'Lint configuration unchanged (no rule suppression)'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'quality',
        requirement: 'Zero lint errors and warnings across entire codebase',
        target_metric: '0 errors, 0 warnings in npm run lint output'
      },
      {
        type: 'accessibility',
        requirement: 'Full WCAG 2.1 Level A compliance for affected components',
        target_metric: '100% jsx-a11y rule compliance'
      },
      {
        type: 'maintainability',
        requirement: 'Inline comments explaining a11y fixes for future developers',
        target_metric: 'Comment added for each non-obvious accessibility fix'
      },
      {
        type: 'performance',
        requirement: 'No performance degradation from hooks dependency fixes',
        target_metric: 'Component render counts unchanged (React DevTools verification)'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Use existing ESLint configuration',
        description: 'No changes to .eslintrc configuration. Fix errors at source rather than suppressing rules.',
        dependencies: ['ESLint', '@eslint/js', 'eslint-plugin-jsx-a11y', 'eslint-plugin-react-hooks']
      },
      {
        id: 'TR-2',
        requirement: 'Incremental component-by-component approach',
        description: 'Fix one component directory at a time, test, commit. Minimize risk of introducing breaking changes.',
        dependencies: ['Git branching', 'E2E test suite']
      },
      {
        id: 'TR-3',
        requirement: 'Preserve existing component API and behavior',
        description: 'Fixes must not change props, state management, or user-facing behavior. Only fix lint violations.',
        dependencies: ['TypeScript type system', 'React Testing Library', 'Playwright E2E tests']
      }
    ],

    // Architecture & Design
    system_architecture: `
## Architecture Overview
No architectural changes - this is a code quality fix only. All components maintain their existing structure, props, and behavior.

## Affected Components
1. **chairman/** - Chairman Dashboard analytics (React components)
2. **audio/** - Audio player and recording controls (React components)
3. **analytics/** - Analytics dashboards and charts (React + Recharts)
4. **ai-ceo/** - AI CEO interface components (React)
5. **onboarding/** - User onboarding flow components (React)

## Fix Approach
- Component-by-component incremental fixes
- Each fix: Edit → Lint → Test → Commit
- No changes to component interfaces or behavior
- Add inline comments for non-obvious accessibility fixes

## Integration Points
- ESLint configuration (no changes)
- CI/CD pipeline (GitHub Actions lint job)
- E2E test suite (verify no regressions)
    `.trim(),

    data_model: {
      tables: []
      // No database changes for lint cleanup
    },

    api_specifications: [],
    // No API changes for lint cleanup

    ui_ux_requirements: [
      {
        component: 'All affected components',
        description: 'UI/UX behavior must remain identical. Accessibility improvements (ARIA labels, alt text) enhance experience without changing visual design.',
        wireframe: 'N/A - no visual changes'
      }
    ],

    // Implementation
    implementation_approach: `
## Phase 1: Chairman Components (Estimated: 45 minutes)
1. Run lint on chairman/ directory to identify specific errors
2. Fix jsx-a11y errors (ARIA labels, keyboard navigation)
3. Fix any React hooks warnings
4. Test: npm run lint chairman/
5. Manual test: Verify dashboard functionality
6. Commit: "fix(lint): resolve a11y errors in chairman components"

## Phase 2: Audio Components (Estimated: 30 minutes)
1. Run lint on audio/ directory
2. Fix jsx-a11y errors (alt text, button labels)
3. Fix any React hooks warnings
4. Test: npm run lint audio/
5. Manual test: Verify audio player works
6. Commit: "fix(lint): resolve a11y errors in audio components"

## Phase 3: Analytics Components (Estimated: 45 minutes)
1. Run lint on analytics/ directory
2. Fix mixed jsx-a11y and React hooks errors
3. Test: npm run lint analytics/
4. Manual test: Verify analytics dashboards render correctly
5. Commit: "fix(lint): resolve lint errors in analytics components"

## Phase 4: AI CEO & Onboarding Components (Estimated: 30 minutes)
1. Run lint on ai-ceo/ and onboarding/ directories
2. Fix React hooks exhaustive-deps warnings
3. Test: npm run lint ai-ceo/ onboarding/
4. Manual test: Verify workflows function correctly
5. Commit: "fix(lint): resolve hooks warnings in ai-ceo and onboarding"

## Phase 5: Final Verification (Estimated: 30 minutes)
1. Run full codebase lint: npm run lint
2. Verify 0 errors, 0 warnings
3. Create test PR to verify CI/CD passes
4. Review all commits for quality
5. Merge to main branch
    `.trim(),

    technology_stack: [
      'React 18',
      'TypeScript 5',
      'ESLint 8+',
      'eslint-plugin-jsx-a11y',
      'eslint-plugin-react-hooks',
      'Vite',
      'Playwright (E2E testing)'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'ESLint configuration',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'E2E test suite',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Lint check passes globally',
        description: 'Run npm run lint and verify 0 errors, 0 warnings',
        expected_result: 'Clean lint output with no violations',
        test_type: 'integration'
      },
      {
        id: 'TS-2',
        scenario: 'Chairman dashboard functionality unchanged',
        description: 'Navigate chairman dashboard, verify all analytics render and interactions work',
        expected_result: 'Dashboard fully functional, no visual or behavioral changes',
        test_type: 'e2e'
      },
      {
        id: 'TS-3',
        scenario: 'Audio player controls work correctly',
        description: 'Test audio playback, recording, and all controls',
        expected_result: 'Audio functionality unchanged after a11y fixes',
        test_type: 'manual'
      },
      {
        id: 'TS-4',
        scenario: 'Analytics charts render without errors',
        description: 'Load analytics page, verify charts display data correctly',
        expected_result: 'Charts render correctly, no console errors',
        test_type: 'e2e'
      },
      {
        id: 'TS-5',
        scenario: 'CI/CD pipeline passes on test PR',
        description: 'Create test PR with fixes, verify GitHub Actions lint job passes',
        expected_result: 'All CI/CD checks green, including lint validation',
        test_type: 'integration'
      },
      {
        id: 'TS-6',
        scenario: 'No unnecessary re-renders introduced',
        description: 'Use React DevTools to check render counts before and after hooks fixes',
        expected_result: 'Render counts unchanged, no performance degradation',
        test_type: 'performance'
      }
    ],

    acceptance_criteria: [
      'All 8 accessibility errors fixed (jsx-a11y compliance)',
      'All 5 React hooks warnings fixed (exhaustive-deps compliance)',
      'npm run lint passes with 0 errors, 0 warnings',
      'CI/CD pipeline passes for test PR without lint errors',
      'All affected components tested and verified functional',
      'No new lint errors introduced in unrelated files',
      'Inline comments added explaining non-obvious accessibility fixes',
      'Performance verified unchanged (no unnecessary re-renders)'
    ],

    performance_requirements: {
      page_load_time: 'unchanged',
      component_render_time: 'unchanged',
      lint_execution_time: '<30s'
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: true },
      { text: 'Technical approach defined (component-by-component)', checked: true },
      { text: 'Implementation approach documented (5 phases)', checked: true },
      { text: 'Test scenarios defined (6 scenarios)', checked: true },
      { text: 'Acceptance criteria established (8 criteria)', checked: true },
      { text: 'User stories generated (STORIES sub-agent)', checked: false },
      { text: 'Security assessment completed (SECURITY sub-agent)', checked: false }
    ],

    exec_checklist: [
      { text: 'Development environment setup (branch created)', checked: false },
      { text: 'Phase 1: Chairman components fixed and tested', checked: false },
      { text: 'Phase 2: Audio components fixed and tested', checked: false },
      { text: 'Phase 3: Analytics components fixed and tested', checked: false },
      { text: 'Phase 4: AI CEO & onboarding components fixed and tested', checked: false },
      { text: 'Phase 5: Full codebase lint verification', checked: false },
      { text: 'Test PR created and CI/CD passing', checked: false },
      { text: 'Code review completed', checked: false },
      { text: 'All commits merged to main', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met (8/8)', checked: false },
      { text: 'CI/CD pipeline verified passing', checked: false },
      { text: 'Component functionality verified unchanged', checked: false },
      { text: 'Performance verified unchanged (render counts)', checked: false },
      { text: 'Deployment readiness confirmed', checked: false }
    ],

    // Progress Tracking
    progress: 10,
    phase: 'planning',
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
        risk: 'Fixing a11y errors may inadvertently break existing UI behavior',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Could require rollback and rework if component behavior changes',
        mitigation: 'Test each component after fixes, use E2E tests to verify no regressions, incremental approach with separate commits'
      },
      {
        category: 'Technical',
        risk: 'React hooks dependency array fixes may cause unexpected re-renders',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'Performance degradation if components re-render unnecessarily',
        mitigation: 'Review each hooks fix carefully, add React.memo where needed, use React DevTools to verify render counts'
      },
      {
        category: 'Adoption',
        risk: 'Developer resistance to stricter lint rules',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Future PRs may introduce new lint errors if developers don\'t understand rationale',
        mitigation: 'Document rationale in inline comments, lint rules already in place just being enforced, CI/CD prevents new errors'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must not change component behavior or API',
        impact: 'Limits fix options to non-breaking changes only'
      },
      {
        type: 'quality',
        constraint: 'Cannot suppress ESLint rules (must fix at source)',
        impact: 'Requires proper accessibility implementation, not workarounds'
      },
      {
        type: 'time',
        constraint: 'Estimated 2-3 hours total effort',
        impact: 'Must prioritize high-impact fixes, defer nice-to-have improvements'
      }
    ],

    assumptions: [
      {
        assumption: 'Existing E2E tests provide adequate regression coverage',
        validation_method: 'Run full E2E test suite after fixes, verify all tests pass'
      },
      {
        assumption: 'Component directories have isolated lint errors (fixes won\'t cascade)',
        validation_method: 'Test each directory independently with npm run lint <directory>'
      },
      {
        assumption: 'CI/CD pipeline will pass once lint errors are fixed',
        validation_method: 'Create test PR and verify all GitHub Actions checks pass'
      }
    ],

    // Stakeholders & Timeline
    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning & PRD Creation',
        involvement_level: 'high'
      },
      {
        name: 'EXEC Agent',
        role: 'Implementation & Testing',
        involvement_level: 'high'
      },
      {
        name: 'All Developers',
        role: 'Beneficiaries (unblocked CI/CD)',
        involvement_level: 'medium'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days (generous buffer)

    // Metadata
    metadata: {
      source: 'SD-E2E-INFRASTRUCTURE-001 retrospective',
      parent_sd_id: 'SD-E2E-INFRASTRUCTURE-001',
      retrospective_id: '86a815a3-e0a6-4f58-8d6a-3225da3bdc5c',
      ci_cd_impact: 'CRITICAL - Blocks all future SDs',
      estimated_hours: 2.5,
      roi: 'HIGH (10-20x return)',
      error_breakdown: {
        jsx_a11y_errors: 8,
        react_hooks_warnings: 5,
        affected_directories: ['chairman/', 'audio/', 'analytics/', 'ai-ceo/', 'onboarding/']
      }
    },

    // Audit Trail
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // -------------------------------------------------------------------------
  // STEP 3: Validate PRD Data
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
  // STEP 6: Success!
  // -------------------------------------------------------------------------

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD UUID: ${insertedPRD.sd_uuid}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Phase: ${insertedPRD.phase}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);

  console.log('\n📝 Next Steps:');
  console.log('   1. ✅ PRD complete with all requirements defined');
  console.log('   2. Run STORIES sub-agent: node scripts/execute-subagent.js STORIES SD-LINT-CLEANUP-001');
  console.log('   3. Run SECURITY sub-agent: node scripts/execute-subagent.js SECURITY SD-LINT-CLEANUP-001');
  console.log('   4. Mark plan_checklist items as complete');
  console.log('   5. Create PLAN→EXEC handoff when ready: node scripts/unified-handoff-system.js execute PLAN-to-EXEC SD-LINT-CLEANUP-001');
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
