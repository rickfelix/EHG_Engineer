#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-FRONTEND-DESIGN-001 with your SD ID (e.g., SD-AUTH-001)
 *   3. Fill in PRD details
 *   4. Run: node scripts/create-prd-sd-XXX.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

// ============================================================================
// CONFIGURATION - Update these values
// ============================================================================

const SD_ID = 'SD-FRONTEND-DESIGN-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Frontend Design Excellence - Architecture & Consistency Improvements'; // TODO: Replace with your PRD title

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

  // SD ID Schema Cleanup: Use SD.id directly (uuid_id is deprecated)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   ID: ${sdData.id}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object (Use only valid schema fields)
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    // SD ID Schema Cleanup: sd_uuid column was DROPPED (2025-12-12)
    // sd_id is now the canonical FK to strategic_directives_v2.id
    id: prdId,
    sd_id: SD_ID,                   // FK to strategic_directives_v2.id (canonical)
    directive_id: SD_ID,            // Backward compatibility

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',              // draft, planning, in_progress, testing, approved, completed, archived
    category: 'frontend',
    priority: 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
This PRD addresses critical frontend architecture issues identified through multi-perspective design reviews (Claude, OpenAI, Anti-Gravity). The primary objective is to decompose the App.tsx routing monolith (1,794 LOC) into modular route files, split oversized components (VentureCreationPage 2,059 LOC, Stage4 1,290 LOC), eliminate 162 inline styles in favor of Tailwind classes, and consolidate duplicate directories (chairman/chairman-v2, ai/ai-ceo/ai-docs).

This refactoring is essential for long-term maintainability. The current monolithic structure makes it difficult to navigate, test, and modify routing logic. Component size violations exceed the 600 LOC guideline by 3x in some cases, creating code review friction and merge conflicts. Accessibility gaps affect 15%+ of users who rely on assistive technologies.

The expected outcome is a clean, modular codebase that follows established component architecture guidelines (300-600 LOC per file), achieves WCAG 2.1 AA compliance (Lighthouse score ≥90), and eliminates technical debt from duplicate patterns.
    `.trim(),

    business_context: `
**User Pain Points:**
- Developers struggle with 1,794-line App.tsx when adding/modifying routes
- Code reviews are difficult due to oversized components
- Accessibility users encounter navigation and focus management issues

**Business Objectives:**
- Reduce developer onboarding friction for routing changes
- Improve code maintainability and reduce merge conflict frequency
- Achieve accessibility compliance for broader user adoption

**Success Metrics:**
- App.tsx: 1,794 → ≤500 LOC
- Max component size: ≤600 LOC (currently 2,059 max)
- Inline styles: 162 → 0 (excluding PDF files)
- Lighthouse accessibility: ≥90
    `.trim(),

    technical_context: `
**Existing Systems:**
- React 18 with React Router v6 for routing
- Tailwind CSS for styling with design system tokens
- Vite for build tooling with code splitting support
- Playwright for E2E testing

**Architecture Patterns:**
- Lazy loading via React.lazy() for route components
- ProtectedRoute/AuthenticatedLayout wrappers for auth
- Barrel exports (index.ts) for component directories
- Custom hooks for state extraction

**Integration Points:**
- EVA floating interface (uses context, not DOM queries)
- Chairman Glass Cockpit dashboard
- Venture creation wizard with research polling
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Decompose App.tsx routing monolith into modular route files',
        description: 'Extract ~120 routes from App.tsx into domain-specific route modules (publicRoutes, chairmanRoutes, adminRoutes, ventureRoutes, boardRoutes, analyticsRoutes, featureRoutes)',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'App.tsx reduced to ≤500 lines of code',
          'All routes remain functional after migration',
          'No changes to route paths or behavior',
          'Route modules use consistent LazyRoute pattern'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Split VentureCreationPage into sub-components and hooks',
        description: 'Extract state management hooks, UI sections, and type definitions from the 2,059-line component',
        priority: 'HIGH',
        acceptance_criteria: [
          'Main orchestrator file ≤350 LOC',
          'All existing functionality preserved',
          'No regression in form validation or auto-save'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Split Stage4CompetitiveIntelligence into tab modules',
        description: 'Extract tab content into separate components (CompetitorsTab, FeaturesTab, ComparisonMatrixTab, AnalysisTab)',
        priority: 'HIGH',
        acceptance_criteria: [
          'Main orchestrator file ≤400 LOC',
          'Tab navigation remains functional',
          'No regression in competitive analysis features'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Migrate inline styles to Tailwind CSS classes',
        description: 'Convert 162 inline style occurrences to Tailwind utility classes, excluding PDF generation files',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Zero inline styles in non-PDF files',
          'Visual appearance unchanged',
          'PDF export functionality preserved'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Consolidate duplicate directory structures',
        description: 'Merge chairman/chairman-v2 and ai/ai-ceo/ai-docs directories into unified structures',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'No duplicate directories remain',
          'All imports updated to new paths',
          'Barrel exports maintained for backward compatibility'
        ]
      },
      {
        id: 'FR-6',
        requirement: 'Fix accessibility gaps',
        description: 'Add missing ARIA labels, fix fragile DOM query in BriefingDashboard, improve keyboard navigation',
        priority: 'HIGH',
        acceptance_criteria: [
          'Lighthouse accessibility score ≥90',
          'No document.querySelector for interactive elements',
          'All interactive elements have ARIA labels'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'maintainability',
        requirement: 'Component size compliance',
        target_metric: 'All components ≤600 LOC (target 300-600 LOC)'
      },
      {
        type: 'accessibility',
        requirement: 'WCAG 2.1 AA compliance',
        target_metric: 'Lighthouse accessibility score ≥90'
      },
      {
        type: 'performance',
        requirement: 'No performance regression from code splitting',
        target_metric: 'Route lazy loading <1s on initial navigation'
      },
      {
        type: 'testability',
        requirement: 'All refactored code must pass existing E2E tests',
        target_metric: '100% E2E test pass rate'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Use React.lazy() for all route components',
        description: 'Ensure proper code splitting with Suspense boundaries',
        dependencies: ['React 18', 'React Router v6']
      },
      {
        id: 'TR-2',
        requirement: 'Use custom hooks for extracted state logic',
        description: 'Follow existing hook patterns (useVentureCreationState, etc.)',
        dependencies: ['React hooks']
      },
      {
        id: 'TR-3',
        requirement: 'Use barrel exports for new directory structures',
        description: 'Create index.ts files for clean imports',
        dependencies: ['TypeScript']
      },
      {
        id: 'TR-4',
        requirement: 'Use EVA context instead of DOM queries',
        description: 'Replace document.querySelector("[data-eva-trigger]") with useEVA hook',
        dependencies: ['EVA Context provider']
      }
    ],

    // Architecture & Design
    system_architecture: `
## Architecture Overview
Target route module structure:
\`\`\`
src/routes/
  index.ts              # Main router composition (~200 LOC)
  publicRoutes.tsx      # 3 routes (Landing, Login, Reset)
  chairmanRoutes.tsx    # 8 routes (Chairman dashboard family)
  adminRoutes.tsx       # 12 routes (Admin panel)
  ventureRoutes.tsx     # 10 routes (Venture management)
  boardRoutes.tsx       # 5 routes (Board governance)
  analyticsRoutes.tsx   # 5 routes (Analytics/reporting)
  featureRoutes.tsx     # ~80 routes (Feature pages)
  components/
    LazyRoute.tsx       # Standardized lazy loading wrapper
\`\`\`

## Component Architecture
Target component structure for large components:
\`\`\`
ComponentName/
  index.ts              # Barrel export
  ComponentName.tsx     # Orchestrator (300-600 LOC)
  hooks/                # State extraction
  components/           # UI sub-components
  types/                # TypeScript interfaces
\`\`\`

## Integration Points
- EVA Interface: Use EVAContext for modal control (not DOM queries)
- Chairman Layout: Wrap chairman routes with ChairmanLayoutV2
- Protected Routes: Use ProtectedRoute + AuthenticatedLayout wrappers
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'No database changes',
          columns: ['This is a refactor SD'],
          relationships: ['No schema modifications required']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: 'N/A',
        method: 'N/A',
        description: 'No API changes - this is a frontend refactoring SD',
        request: {},
        response: {}
      }
    ],

    ui_ux_requirements: [
      {
        component: 'All existing components',
        description: 'No visual changes - refactoring preserves existing UI/UX',
        wireframe: 'N/A - behavior preservation'
      },
      {
        component: 'Accessibility improvements',
        description: 'Add ARIA labels to interactive elements, improve focus management',
        wireframe: 'WCAG 2.1 AA compliance guidelines'
      }
    ],

    // Implementation
    implementation_approach: `
## Phase 1: Baseline & PRD (Current)
- Capture E2E test baseline
- Record Lighthouse accessibility score
- Create route inventory manifest
- Git tag: baseline-sd-frontend-design-001

## Phase 2: App.tsx Decomposition (Week 1)
Migration order (lowest risk first):
1. publicRoutes (3 routes) - No auth wrapper
2. boardRoutes (5 routes) - Self-contained
3. adminRoutes (12 routes) - AdminRoute wrapper
4. chairmanRoutes (8 routes) - ChairmanLayoutV2 wrapper
5. ventureRoutes (10 routes) - Complex nested
6. analyticsRoutes (5 routes) - Standard protected
7. featureRoutes (~80 routes) - Large batch

## Phase 3: Component Splitting (Week 2)
- VentureCreationPage: Extract hooks, split into sub-components
- Stage4CompetitiveIntelligence: Extract tab modules
- Follow existing patterns in codebase

## Phase 4: Style Migration (Days 3-4)
- Batch 1: Spacing/sizing styles
- Batch 2: Typography styles
- Batch 3: Layout styles
- Exclude PDF files

## Phase 5: Directory Consolidation (Days 2-3)
- Consolidate chairman/chairman-v2
- Consolidate ai/ai-ceo/ai-docs

## Phase 6: Accessibility Fixes (Days 2-3)
- Fix BriefingDashboard DOM query
- Add ARIA labels
- Improve keyboard navigation

## Phase 7: Testing & Validation (Days 3-4)
- Full E2E test suite
- Lighthouse accessibility verification
- Route manifest validation
    `.trim(),

    technology_stack: [
      'React 18',
      'TypeScript 5',
      'Vite',
      'Shadcn UI',
      'Supabase PostgreSQL'
      // Add specific technologies for this PRD
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'TODO: Internal dependency',
        status: 'completed', // completed, in_progress, blocked
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Route module migration verification',
        description: 'Verify all routes from manifest are accessible after migration',
        expected_result: 'All 120+ routes load correctly with no 404 errors',
        test_type: 'e2e'
      },
      {
        id: 'TS-2',
        scenario: 'Cross-module navigation',
        description: 'Verify navigation between different route modules works',
        expected_result: 'Navigation transitions smoothly without full page reload',
        test_type: 'e2e'
      },
      {
        id: 'TS-3',
        scenario: 'VentureCreationPage functionality',
        description: 'Verify form validation, auto-save, and step navigation after refactor',
        expected_result: 'All venture creation features work as before',
        test_type: 'e2e'
      },
      {
        id: 'TS-4',
        scenario: 'Stage4CompetitiveIntelligence tabs',
        description: 'Verify tab navigation and data persistence after splitting',
        expected_result: 'All tabs render correct content, data persists across tab switches',
        test_type: 'e2e'
      },
      {
        id: 'TS-5',
        scenario: 'Accessibility compliance',
        description: 'Verify Lighthouse accessibility score meets target',
        expected_result: 'Lighthouse accessibility score ≥90',
        test_type: 'e2e'
      },
      {
        id: 'TS-6',
        scenario: 'EVA interface activation',
        description: 'Verify EVA modal opens via context (not DOM query)',
        expected_result: 'EVA opens correctly from BriefingDashboard',
        test_type: 'e2e'
      }
    ],

    acceptance_criteria: [
      'App.tsx reduced to ≤500 lines of code',
      'No component exceeds 600 LOC',
      'Zero inline styles in non-PDF files',
      'No duplicate directory structures remain',
      'Lighthouse accessibility score ≥90',
      'All E2E tests passing (100% pass rate)',
      'All routes from manifest are accessible',
      'No visual regressions detected'
    ],

    performance_requirements: {
      page_load_time: '<2s',
      api_response_time: '<500ms',
      concurrent_users: 100
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: false },
      { text: 'Technical architecture defined', checked: false },
      { text: 'Implementation approach documented', checked: false },
      { text: 'Test scenarios defined', checked: false },
      { text: 'Acceptance criteria established', checked: false },
      { text: 'User stories generated (STORIES sub-agent)', checked: false },
      { text: 'Database schema reviewed (DATABASE sub-agent)', checked: false },
      { text: 'Security assessment completed (SECURITY sub-agent)', checked: false }
    ],

    exec_checklist: [
      { text: 'Development environment setup', checked: false },
      { text: 'Core functionality implemented', checked: false },
      { text: 'Unit tests written and passing', checked: false },
      { text: 'E2E tests written and passing', checked: false },
      { text: 'Code review completed', checked: false },
      { text: 'Documentation updated', checked: false },
      { text: 'Performance requirements validated', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Performance requirements validated', checked: false },
      { text: 'Security review completed', checked: false },
      { text: 'User acceptance testing passed', checked: false },
      { text: 'Deployment readiness confirmed', checked: false }
    ],

    // Progress Tracking
    progress: 10, // 0-100
    phase: 'planning', // planning, design, implementation, verification, approval
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
        risk: 'Route migration breaks navigation',
        severity: 'HIGH',
        probability: 'MEDIUM',
        impact: 'Users unable to access pages, critical workflow disruption',
        mitigation: 'Keep identical import paths, use barrel exports, comprehensive E2E tests before/after each migration batch'
      },
      {
        category: 'Technical',
        risk: 'Component split breaks state management',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Form data loss, incorrect UI state',
        mitigation: 'Use custom hooks for shared state, preserve existing prop interfaces'
      },
      {
        category: 'Technical',
        risk: 'Inline style migration breaks PDF export',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'PDF reports render incorrectly',
        mitigation: 'Exclude PDF files from style migration, test PDF export after each batch'
      },
      {
        category: 'Technical',
        risk: 'Directory consolidation breaks existing imports',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Build failures, component not found errors',
        mitigation: 'Update paths incrementally, maintain barrel exports for backward compatibility'
      },
      {
        category: 'Regression',
        risk: 'Visual regressions from Tailwind conversion',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'UI looks different than before',
        mitigation: 'Visual regression testing, side-by-side comparison before committing'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must preserve all existing functionality',
        impact: 'No behavior changes allowed - pure refactoring'
      },
      {
        type: 'technical',
        constraint: 'PDF files must keep inline styles',
        impact: 'Not all inline styles can be removed'
      },
      {
        type: 'technical',
        constraint: 'No database schema changes',
        impact: 'Frontend-only refactoring'
      }
    ],

    assumptions: [
      {
        assumption: 'All routes in App.tsx are actively used',
        validation_method: 'Check route usage analytics or dead code detection'
      },
      {
        assumption: 'EVA context is available where needed',
        validation_method: 'Verify EVAProvider wraps all routes using EVA'
      },
      {
        assumption: 'Existing E2E tests cover critical functionality',
        validation_method: 'Review test coverage before starting'
      }
    ],

    // Stakeholders & Timeline
    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning',
        involvement_level: 'high'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks

    // Metadata (for custom fields that don't fit schema)
    metadata: {
      refactor_type: 'architectural',
      intensity_level: 'architectural',
      critical_files: [
        '../ehg/src/App.tsx',
        '../ehg/src/components/ventures/VentureCreationPage/VentureCreationPage.tsx',
        '../ehg/src/components/stages/Stage4CompetitiveIntelligence.tsx',
        '../ehg/src/components/chairman-v2/BriefingDashboard.tsx'
      ],
      loc_targets: {
        app_tsx: { current: 1794, target: 500 },
        venture_creation_page: { current: 2059, target: 350 },
        stage4: { current: 1290, target: 400 }
      },
      inline_styles: { current: 162, target: 0, excluded: ['StageOutputPDF.tsx', 'PDFExportButton.tsx'] },
      design_review_sources: ['Claude', 'OpenAI', 'Anti-Gravity'],
      sub_agents_required: ['DESIGN', 'TESTING', 'REGRESSION', 'VALIDATION']
    },

    // Audit Trail
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // -------------------------------------------------------------------------
  // STEP 3: Validate PRD Data (CRITICAL - catches schema mismatches)
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
  console.log(`   SD ID: ${insertedPRD.sd_id || insertedPRD.sd_uuid}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Phase: ${insertedPRD.phase}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Update TODO items in PRD (executive_summary, requirements, etc.)');
  console.log('   2. Run STORIES sub-agent: node scripts/create-user-stories-[sd-id].mjs');
  console.log('   3. Run DATABASE sub-agent: node scripts/database-architect-schema-review.js');
  console.log('   4. Run SECURITY sub-agent: node scripts/security-architect-assessment.js');
  console.log('   5. Mark plan_checklist items as complete');
  console.log('   6. Create PLAN→EXEC handoff when ready');
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
