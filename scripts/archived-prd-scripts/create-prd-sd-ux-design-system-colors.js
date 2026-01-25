#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-UX-DESIGN-SYSTEM-COLORS with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-UX-DESIGN-SYSTEM-COLORS'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Design System Colors - Audit, Define, Migrate, Enforce'; // TODO: Replace with your PRD title

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

  // SD ID Schema Cleanup: Support both UUID id and legacy_id lookup
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, category, priority')
    .or(`id.eq.${SD_ID},sd_key.eq.${SD_ID}`)
    .limit(1)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.id}`);
  console.log(`   Legacy ID: ${sdData.sd_key || 'N/A'}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object (Use only valid schema fields)
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  // Use legacy_id for PRD naming if available, otherwise use SD_ID
  const sdIdentifier = sdData.sd_key || SD_ID;
  const prdId = `PRD-${sdIdentifier}`;

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    // SD ID Schema Cleanup: sd_id is the canonical FK to strategic_directives_v2.id (UUID)
    id: prdId,
    sd_id: sdData.id,               // FK to strategic_directives_v2.id (UUID)
    directive_id: sdIdentifier,     // Human-readable SD identifier

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',              // draft, planning, in_progress, testing, approved, completed, archived
    category: sdData.category || 'technical',
    priority: sdData.priority || 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
This PRD establishes a comprehensive color system with complete domain ownership. The Design System Colors initiative will systematically audit, define, migrate, and enforce color token usage across the entire EHG application codebase.

**Problem**: The codebase currently contains 567+ hardcoded hex codes scattered across 598 files, with 3603+ Tailwind color class instances and 25+ duplicated color constant definitions. This leads to inconsistent theming, prevents reliable dark mode implementation, and creates maintenance burden.

**Solution**: A four-phase approach (Audit → Define → Migrate → Enforce) that creates a semantic token system in globals.css, migrates all hardcoded colors to tokens, and prevents regression via ESLint rules.

**Impact**: Establishes single source of truth for all colors, enables consistent theming and dark mode, reduces maintenance burden by eliminating color drift.
    `.trim(),

    business_context: `
**User Pain Points**:
- Inconsistent color usage across different pages and components
- Dark mode implementation blocked by scattered color definitions
- Chart colors don't match status indicator colors (red/amber/green duplicated with different hex values)

**Business Objectives**:
- Enable consistent visual experience across all application areas
- Unblock dark mode feature for improved accessibility and user preference
- Reduce developer confusion about which colors to use

**Success Metrics**:
- Zero hardcoded hex values in src/ (except design system definitions)
- Semantic color token system covering all use cases (status, charts, UI)
- ESLint rule active preventing new hardcoded colors
- Complete color audit inventory document created
    `.trim(),

    technical_context: `
**Existing Systems**:
- Design token system exists in index.css but is systematically ignored
- Tailwind CSS used throughout with arbitrary color values
- Chart libraries (Recharts) use hardcoded color arrays

**Architecture Patterns**:
- CSS variables in globals.css for theming
- Tailwind with arbitrary values [#hexcode] pattern prevalent
- Color constants duplicated in chart component files

**Integration Points**:
- globals.css / index.css for token definitions
- Tailwind config for extending color palette
- ESLint for enforcement
- All chart components (EnhancedCharts, STACharts, GCIACharts, ChartRenderer)
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Complete Color Audit',
        description: 'Scan entire codebase for all color definitions including hardcoded hex values, Tailwind color classes, CSS color properties, and color constant definitions',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Audit covers all 598 files with color references',
          'Each color instance is logged with file path, line number, and value',
          'Color audit report generated in markdown format',
          'Color categories identified (status, chart, UI, text, background)'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Semantic Color Token System',
        description: 'Create CSS custom properties in globals.css with semantic naming conventions covering all identified use cases',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Token system includes status colors (success, warning, error, info)',
          'Token system includes chart color palette (primary through septenary)',
          'Token system includes UI colors (background, foreground, border, accent)',
          'Dark mode variants defined using CSS media queries or class-based toggle',
          'Tokens documented with usage guidelines'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Color Migration',
        description: 'Replace all hardcoded color values with semantic tokens from the design system',
        priority: 'HIGH',
        acceptance_criteria: [
          'All hardcoded hex values in src/ replaced with CSS variables',
          'Tailwind arbitrary color values [#hex] replaced with theme tokens',
          'Chart component color arrays replaced with token references',
          'No visual regression - all colors render identically before/after',
          'Migration tracked per-component for verification'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'ESLint Enforcement Rule',
        description: 'Implement ESLint rule that prevents introduction of new hardcoded color values',
        priority: 'HIGH',
        acceptance_criteria: [
          'ESLint rule catches hex color patterns (#RGB, #RRGGBB, #RRGGBBAA)',
          'ESLint rule catches rgb()/rgba()/hsl()/hsla() patterns',
          'Rule allows colors in design system definition files only',
          'Rule active in CI pipeline blocking non-compliant PRs',
          'Clear error messages with remediation guidance'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'No bundle size increase',
        target_metric: 'CSS token system adds <2KB to bundle'
      },
      {
        type: 'maintainability',
        requirement: 'Single source of truth',
        target_metric: 'All colors defined in ≤2 files (globals.css + tailwind.config)'
      },
      {
        type: 'usability',
        requirement: 'Developer experience',
        target_metric: 'Token names are self-documenting (color-status-success vs #10b981)'
      },
      {
        type: 'accessibility',
        requirement: 'Dark mode support',
        target_metric: 'Token system enables dark mode without component modifications'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'CSS Custom Properties',
        description: 'Use native CSS custom properties (--color-*) for theming support',
        dependencies: ['globals.css', 'index.css']
      },
      {
        id: 'TR-2',
        requirement: 'Tailwind Integration',
        description: 'Extend tailwind.config.js to reference CSS variables for theme-aware colors',
        dependencies: ['tailwind.config.js']
      },
      {
        id: 'TR-3',
        requirement: 'ESLint Plugin',
        description: 'Use or create ESLint rule for color enforcement',
        dependencies: ['eslint', '@typescript-eslint/parser']
      }
    ],

    // Architecture & Design
    system_architecture: `
## Architecture Overview
The color system uses a three-tier architecture:

1. **Definition Layer** (globals.css)
   - CSS custom properties (--color-*) defining all color values
   - Organized by category: status, chart, ui, text, background
   - Dark mode variants using .dark class selector

2. **Bridge Layer** (tailwind.config.js)
   - Extends Tailwind theme to reference CSS variables
   - Enables use of standard Tailwind classes (bg-status-success)
   - Maintains Tailwind DX while using CSS variables under the hood

3. **Enforcement Layer** (ESLint)
   - Custom rule preventing hardcoded color introduction
   - Runs in CI/CD pipeline
   - Provides clear error messages and remediation guidance

## Data Flow
- CSS variables defined at :root level
- Dark mode overrides at .dark:root level
- Tailwind classes consume CSS variables
- Components use Tailwind classes or CSS variables directly

## Integration Points
- globals.css / index.css: Token definitions
- tailwind.config.js: Theme extension
- .eslintrc.js: Enforcement rule
- All components: Color consumption via classes or CSS vars
    `.trim(),

    data_model: {
      tables: []  // No database changes for this SD
    },

    api_specifications: [],  // No API changes for this SD

    ui_ux_requirements: [
      {
        component: 'Chart Components',
        description: 'All chart colors must use semantic tokens (--color-chart-primary through --color-chart-septenary)',
        wireframe: 'N/A - visual parity required'
      },
      {
        component: 'Status Indicators',
        description: 'Status colors must use semantic tokens (--color-status-success/warning/error/info)',
        wireframe: 'N/A - visual parity required'
      },
      {
        component: 'Dark Mode',
        description: 'All colors must have appropriate dark mode variants',
        wireframe: 'N/A - theme toggle verification'
      }
    ],

    // Implementation
    implementation_approach: `
## Phase 1: Audit
- Run codebase scan for all hardcoded colors
- Generate color audit report with file/line/value
- Categorize colors by usage (status, chart, ui, text, background)
- Identify duplicate color definitions

## Phase 2: Define
- Create semantic token naming convention
- Define all tokens in globals.css
- Create dark mode variants
- Extend Tailwind config to use CSS variables
- Document token usage guidelines

## Phase 3: Migrate
- Replace hardcoded hex values with CSS variables
- Update chart color arrays to use tokens
- Replace Tailwind arbitrary values with theme classes
- Verify visual parity (no color changes)
- Incremental commits per component/area

## Phase 4: Enforce
- Create or configure ESLint rule for color enforcement
- Add rule to ESLint configuration
- Test rule catches violations
- Enable in CI pipeline
- Document exception process for design system files
    `.trim(),

    technology_stack: [
      'CSS Custom Properties',
      'Tailwind CSS',
      'ESLint',
      'React 18',
      'TypeScript 5'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'Existing design token system (index.css)',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Visual regression check',
        description: 'All pages render with identical colors before and after migration',
        expected_result: 'No visual differences detected',
        test_type: 'e2e'
      },
      {
        id: 'TS-2',
        scenario: 'Dark mode toggle',
        description: 'All migrated colors respond correctly to dark mode toggle',
        expected_result: 'Colors switch to dark mode variants',
        test_type: 'e2e'
      },
      {
        id: 'TS-3',
        scenario: 'ESLint enforcement',
        description: 'New hardcoded color introduction is blocked by ESLint',
        expected_result: 'ESLint error with remediation guidance',
        test_type: 'unit'
      },
      {
        id: 'TS-4',
        scenario: 'Chart color consistency',
        description: 'All chart components use consistent color palette',
        expected_result: 'Charts use semantic tokens from design system',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'Zero hardcoded hex values in src/ (except design system definitions)',
      'Semantic color token system covering all use cases',
      'ESLint rule active and passing in CI',
      'Complete color audit inventory document created',
      'All 598 files with colors migrated to token system',
      'No visual regression - identical appearance before/after',
      'Dark mode functions correctly with token system'
    ],

    performance_requirements: {
      bundle_size_increase: '<2KB',
      css_specificity: 'Minimal increase',
      render_performance: 'No degradation'
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
        risk: 'Large migration surface (567+ locations across 598 files)',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Migration may take longer than expected if patterns vary significantly',
        mitigation: 'Phase-by-phase approach with incremental commits per component area'
      },
      {
        category: 'Technical',
        risk: 'Third-party component colors may not be controllable',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'Some colors may need to remain hardcoded in overrides',
        mitigation: 'Document exceptions, create CSS override layer for third-party components'
      },
      {
        category: 'Quality',
        risk: 'Visual regression during migration',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'User-facing color changes could affect UX',
        mitigation: 'Visual comparison testing before/after each migration batch'
      },
      {
        category: 'Process',
        risk: 'Token naming requires design input',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Suboptimal naming could require later refactoring',
        mitigation: 'Use semantic naming based on usage patterns already in codebase'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must maintain visual parity - no color changes',
        impact: 'Limits ability to "fix" colors during migration; refactoring only'
      },
      {
        type: 'technical',
        constraint: 'Existing Tailwind usage throughout codebase',
        impact: 'Must integrate with Tailwind config rather than replace it'
      },
      {
        type: 'process',
        constraint: 'Large codebase with 598 affected files',
        impact: 'Requires systematic approach; cannot do single-commit migration'
      }
    ],

    assumptions: [
      {
        assumption: 'CSS custom properties are supported by all target browsers',
        validation_method: 'Browser support matrix check (CSS vars supported IE11+)'
      },
      {
        assumption: 'Existing design token system in index.css can be extended',
        validation_method: 'Review current token structure and naming'
      },
      {
        assumption: 'ESLint can be configured to detect hardcoded colors',
        validation_method: 'Test existing ESLint rules or create custom rule'
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
      phases: ['audit', 'define', 'migrate', 'enforce'],
      evidence: {
        source: 'Antigravity codebase scan',
        hardcoded_hex_count: '567+',
        files_with_colors: 598,
        tailwind_color_instances: '3603+'
      },
      replaces: ['SD-UX-COLOR-TOKENS'],
      deliverables: [
        'Color audit report (file/line/value)',
        'Semantic token definitions in globals.css',
        'Tailwind config extension',
        'Migration PRs (incremental)',
        'ESLint rule configuration'
      ],
      critical_files: [
        '../ehg/src/styles/globals.css',
        '../ehg/src/index.css',
        '../ehg/tailwind.config.js',
        '../ehg/.eslintrc.js',
        '../ehg/src/components/charts/',
        '../ehg/src/components/analytics/EnhancedCharts.tsx',
        '../ehg/src/components/ventures/intelligence/charts/'
      ],
      triangulation_source: 'Antigravity recommendation',
      parent_sd: 'SD-UX-MINOR-2025-12'
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
