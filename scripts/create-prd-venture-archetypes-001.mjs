#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('🔍 Creating PRD for SD-VENTURE-ARCHETYPES-001');
  console.log('='.repeat(50));

  // Fetch SD data
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-VENTURE-ARCHETYPES-001')
    .single();

  if (!sd) {
    console.error('❌ SD not found');
    process.exit(1);
  }

  const prd = {
    id: 'PRD-VENTURE-ARCHETYPES-001',  // Explicit ID matching SD pattern
    directive_id: sd.id,
    sd_id: sd.id,
    sd_uuid: sd.uuid_id,
    title: 'Configurable Venture Archetypes & Artisanal Automation - Product Requirements',
    version: '1.0.0',
    status: 'approved',
    category: 'Venture Management',
    priority: 'high',

    executive_summary: `Enable users to configure venture "archetypes" (personality presets) that influence venture creation, UI theming, workflow emphasis, and value proposition framing. Primary archetype: "Artisanal Automation" - ventures that feel personal/handmade but are fully automated.

This PRD defines Phase 1 implementation: archetype configuration in settings, selection during venture creation, and basic visual theming. AI-generated recommendations, industry-specific templates, archetype marketplace, and workflow automation are deferred to Phase 2.`,

    business_context: `**Strategic Objectives** (from SD):
1. Enable venture personality differentiation through configurable archetypes
2. Provide consistent branding and visual identity across company ventures
3. Support Artisanal Automation philosophy: ventures that feel personal but are automated
4. Improve venture creation UX with pre-configured themes and value proposition templates
5. Establish company-wide archetype library for reusability and standardization

**Target Users**: Venture creators, company admins, portfolio managers
**Target Application**: EHG (customer-facing app at /mnt/c/_EHG/ehg/)
**Business Value**: Differentiation, brand consistency, improved UX, reusable templates`,

    technical_context: `**Existing Infrastructure** (from Systems Analyst sub-agent):
- Settings page with tabbed interface (app/settings/page.tsx, 242 LOC)
- VentureCreationDialog with form fields (src/components/ventures/VentureCreationDialog.tsx, 364 LOC)
- Ventures table with metadata JSONB field (currently stores assumptions, successCriteria)
- Shadcn UI components (Card, Dialog, Select, Button, Tabs)
- Tailwind CSS for responsive design

**Architecture Approach**: Extend existing patterns
- Add "Archetypes" tab to Settings page (reuse tab pattern)
- Add archetype selector to VentureCreationDialog (reuse Select pattern)
- Store archetype selection in ventures.metadata.archetype
- New table: venture_archetypes (company-scoped, RLS secured)`,

    functional_requirements: [
      {
        id: 'FR-001',
        title: 'Archetype CRUD Operations in Settings',
        description: 'Admin users can create, read, update, and delete venture archetypes from Settings page',
        priority: 'HIGH',
        user_story: 'As a company admin, I want to manage archetype definitions so that I can establish brand templates'
      },
      {
        id: 'FR-002',
        title: 'Archetype Selection in Venture Creation',
        description: 'Users can select an archetype when creating a new venture from a dropdown list',
        priority: 'HIGH',
        user_story: 'As a venture creator, I want to choose an archetype so that my venture has a consistent theme'
      },
      {
        id: 'FR-003',
        title: 'Visual Theme Application',
        description: 'Selected archetype applies visual theme (colors, typography, spacing) to venture views',
        priority: 'HIGH',
        user_story: 'As a venture viewer, I want to see archetype-driven styling so that ventures have distinct personalities'
      },
      {
        id: 'FR-004',
        title: 'Archetype Preview',
        description: 'Settings page shows visual preview of each archetype theme',
        priority: 'MEDIUM',
        user_story: 'As a company admin, I want to preview archetype themes so that I can validate visual design'
      },
      {
        id: 'FR-005',
        title: '5 Default Archetypes',
        description: 'System provides 5 pre-configured archetypes: Artisanal Automation, Tech Minimalist, Luxury Essentials, Sustainable Innovation, Cultural Fusion',
        priority: 'HIGH',
        user_story: 'As a new user, I want default archetype options so that I can start quickly without configuration'
      }
    ],

    technical_requirements: `**Component Architecture** (300-600 LOC optimal per component):

1. **ArchetypesSettingsTab.tsx** (~350 LOC)
   - Location: /mnt/c/_EHG/ehg/app/settings/ArchetypesSettingsTab.tsx
   - Parent: app/settings/page.tsx (add as 7th tab)
   - Responsibilities: List view (Card grid), Create/Edit dialog, Delete confirmation, Preview component
   - Dependencies: Shadcn (Card, Dialog, Button, Input, Textarea), Supabase client
   - Sizing target: 350 LOC (within 300-600 optimal range)

2. **ArchetypeSelector.tsx** (~120 LOC)
   - Location: /mnt/c/_EHG/ehg/src/components/ventures/ArchetypeSelector.tsx
   - Parent: VentureCreationDialog.tsx (add after category, before assumptions)
   - Responsibilities: Dropdown with archetype list, description display on hover
   - Dependencies: Shadcn Select, Supabase query for archetypes
   - Sizing target: 120 LOC (within 300-600 optimal range)

3. **ThemePreview.tsx** (~80 LOC)
   - Location: /mnt/c/_EHG/ehg/src/components/ventures/ThemePreview.tsx
   - Parent: ArchetypesSettingsTab.tsx (preview section)
   - Responsibilities: Visual mockup showing colors, typography, spacing
   - Dependencies: Tailwind, archetype visual_theme JSONB
   - Sizing target: 80 LOC (within 300-600 optimal range)

**Total Estimated LOC**: 350 + 120 + 80 = 550 LOC (components only, excludes migration)`,

    system_architecture: `**Database Layer**:
- Table: venture_archetypes (company-scoped, RLS secured)
- Storage: ventures.metadata.archetype (archetype snapshot for ventures)

**UI Layer**:
- Settings Page → ArchetypesSettingsTab (CRUD interface)
- Venture Creation → ArchetypeSelector (dropdown)
- Venture Views → Theme application (CSS variables)

**Theming System**:
- Archetype visual_theme JSONB → CSS variables
- CSS variables applied to venture-specific views
- Fallback to base theme if no archetype selected

**Security Layer**:
- RLS policies: Company-scoped data, admin-only CRUD
- Input validation: XSS prevention, JSONB structure validation`,

    data_model: {
      venture_archetypes: {
        columns: [
          { name: 'id', type: 'UUID PRIMARY KEY', default: 'uuid_generate_v4()' },
          { name: 'company_id', type: 'UUID', references: 'companies(id) ON DELETE CASCADE' },
          { name: 'name', type: 'VARCHAR(100) NOT NULL', validation: 'Max 100 chars, XSS sanitized' },
          { name: 'description', type: 'TEXT', validation: 'Max 2000 chars, HTML sanitized' },
          { name: 'visual_theme', type: 'JSONB NOT NULL DEFAULT {}', structure: '{ colors: {primary, secondary, accent}, typography: {fontFamily, fontSize, fontWeight}, spacing: {compact|normal|spacious} }' },
          { name: 'workflow_emphasis', type: 'JSONB', description: 'Stage priorities (optional for Phase 1)' },
          { name: 'value_proposition_template', type: 'TEXT', description: 'Template for value prop (optional for Phase 1)' },
          { name: 'is_default', type: 'BOOLEAN DEFAULT false', description: 'Read-only defaults, cannot delete' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()' },
          { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()' }
        ],
        indexes: [
          'idx_archetypes_company_id ON (company_id)',
          'idx_archetypes_default ON (company_id, is_default) WHERE is_default = true'
        ],
        rls_policies: [
          'SELECT: company_id = (SELECT company_id FROM users WHERE id = auth.uid())',
          'INSERT: (SELECT role FROM users WHERE id = auth.uid()) = admin AND company_id = user company',
          'UPDATE: Same as INSERT + company_id check',
          'DELETE: Same as UPDATE + is_default = false'
        ]
      },
      ventures_metadata_extension: {
        field: 'metadata.archetype',
        structure: '{ id: UUID, name: string, visual_theme: JSONB }',
        description: 'Snapshot of archetype at venture creation time (preserves theme even if archetype deleted)'
      }
    },

    ui_ux_requirements: `**Design System Compliance** (from Design Sub-Agent):
- Use existing Shadcn components (Card, Dialog, Select, Button, Tabs, Input, Textarea)
- Follow Tailwind utility patterns for responsive design
- Mobile-first approach (all components responsive)
- Accessibility: ARIA labels, keyboard navigation, WCAG 2.1 AA compliance

**Visual Theme Structure** (visual_theme JSONB):
{
  "colors": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex"
  },
  "typography": {
    "fontFamily": "string",
    "fontSize": "base|lg|xl",
    "fontWeight": "normal|medium|bold"
  },
  "spacing": "compact|normal|spacious"
}

**Theme Application**:
- CSS variables: --archetype-primary, --archetype-secondary, --archetype-accent
- Apply to venture-specific views (not global)
- Dark/light mode compatibility: Themes as overlays on base theme (test both modes)

**Component Sizing Constraints**:
- ArchetypesSettingsTab: 300-600 LOC (target 350)
- ArchetypeSelector: 300-600 LOC (target 120)
- ThemePreview: 300-600 LOC (target 80)`,

    implementation_approach: `**Phase 1 Implementation Steps**:

1. **Database Migration** (45-60 min):
   - Create migration file: database/migrations/XXX_venture_archetypes.sql
   - CREATE TABLE venture_archetypes with all columns
   - CREATE RLS policies (company-scoped, admin CRUD)
   - INSERT 5 default archetypes with seed data
   - Run two-phase validation:
     - Phase 1: node scripts/validate-migration-files.js SD-VENTURE-ARCHETYPES-001
     - Phase 2: node scripts/validate-migration-files.js SD-VENTURE-ARCHETYPES-001 --verify-db --check-seed-data

2. **ArchetypesSettingsTab Component** (90-120 min):
   - Create /mnt/c/_EHG/ehg/app/settings/ArchetypesSettingsTab.tsx
   - Implement list view (Card grid with archetype cards)
   - Implement Create/Edit dialog (name, description, visual_theme fields)
   - Implement Delete confirmation (check is_default = false)
   - Implement ThemePreview component integration
   - Add to app/settings/page.tsx as 7th tab

3. **ArchetypeSelector Component** (45-60 min):
   - Create /mnt/c/_EHG/ehg/src/components/ventures/ArchetypeSelector.tsx
   - Implement Select dropdown with archetype options
   - Query venture_archetypes table (company-scoped)
   - Display archetype description on hover
   - Store selection in venture.metadata.archetype (snapshot)
   - Add to VentureCreationDialog.tsx (after category field)

4. **ThemePreview Component** (30-45 min):
   - Create /mnt/c/_EHG/ehg/src/components/ventures/ThemePreview.tsx
   - Render visual mockup using visual_theme JSONB
   - Show colors (swatches), typography (sample text), spacing (box model)
   - Used in ArchetypesSettingsTab for archetype preview

5. **Theming System** (45-60 min):
   - Create theme utility: src/utils/applyArchetypeTheme.ts
   - Parse visual_theme JSONB → CSS variables
   - Apply CSS variables to venture views
   - Test dark/light mode compatibility

**Technology Stack**:
- Frontend: React, TypeScript, Tailwind CSS, Shadcn UI
- Backend: Supabase (PostgreSQL, RLS, Auth)
- State: Local component state + Supabase queries
- Theming: CSS variables + Tailwind theme extension

**Security Implementation** (from Security Architect):
- Input validation: Max lengths (name: 100, description: 2000), XSS sanitization
- JSONB validation: visual_theme structure check (allowed keys, value types)
- RLS enforcement: Company-scoped queries, admin role check
- Error handling: Graceful degradation if archetype not found`,

    test_scenarios: `**E2E Testing Strategy** (Playwright - MANDATORY):

**Test Infrastructure**:
- Framework: Playwright (existing setup at /mnt/c/_EHG/ehg/)
- Mode: Dev mode (port 5173, NOT preview 4173)
- Coverage Requirement: 100% user story coverage
- Evidence: Screenshots (success), videos (failures), HTML reports

**Test Suites**:

1. **Archetype CRUD Tests** (tests/e2e/archetypes/crud.spec.ts):
   - US-001: Admin can navigate to Settings → Archetypes tab
   - US-002: Admin can view list of existing archetypes
   - US-003: Admin can create new archetype with valid data
   - US-004: Admin can edit existing archetype
   - US-005: Admin cannot delete default archetypes (is_default = true)
   - US-006: Admin can delete custom archetypes (is_default = false)

2. **Archetype Selection Tests** (tests/e2e/archetypes/selection.spec.ts):
   - US-007: User can open venture creation dialog
   - US-008: User sees archetype selector dropdown
   - US-009: User can select archetype from dropdown
   - US-010: Selected archetype is stored in venture.metadata.archetype

3. **Theme Application Tests** (tests/e2e/archetypes/theming.spec.ts):
   - US-011: Venture with archetype displays correct theme colors
   - US-012: Theme works in both dark and light modes
   - US-013: Venture without archetype falls back to base theme

4. **Preview Tests** (tests/e2e/archetypes/preview.spec.ts):
   - US-014: Archetype preview shows visual mockup in settings
   - US-015: Preview accurately represents archetype theme

**QA Engineering Director Execution**:
- Professional test case generation from user stories (Given-When-Then)
- Playwright E2E execution with evidence collection
- 100% user story validation required
- Testing learnings captured for retrospective

**Unit Testing** (Vitest):
- Component render tests (ArchetypesSettingsTab, ArchetypeSelector, ThemePreview)
- Theme utility tests (applyArchetypeTheme)
- JSONB validation tests
- Input sanitization tests
- Target: 50%+ coverage for business logic`,

    acceptance_criteria: [
      {
        id: 'AC-001',
        criterion: 'Archetype CRUD operations: 100% success rate in settings',
        test_method: 'E2E: Create, read, update, delete operations all pass without errors',
        status: 'pending'
      },
      {
        id: 'AC-002',
        criterion: 'Archetype selection rate: 80%+ of ventures have archetype assigned',
        test_method: 'Manual verification: Query ventures.metadata.archetype after 30 days',
        status: 'pending'
      },
      {
        id: 'AC-003',
        criterion: 'Theme perception: 90%+ users can identify archetype by visual aesthetic',
        test_method: 'User survey after deployment',
        status: 'pending'
      },
      {
        id: 'AC-004',
        criterion: 'Performance: Archetype selection adds <200ms to venture creation',
        test_method: 'Performance tests: Measure venture creation time with/without archetype',
        status: 'pending'
      },
      {
        id: 'AC-005',
        criterion: 'Adoption: 3+ archetypes used across portfolio within 30 days',
        test_method: 'Database query: SELECT COUNT(DISTINCT metadata->>archetype) FROM ventures',
        status: 'pending'
      },
      {
        id: 'AC-006',
        criterion: 'User satisfaction: 4.0/5.0 rating for archetype feature',
        test_method: 'User feedback survey',
        status: 'pending'
      }
    ],

    plan_checklist: [
      { id: 'PC-001', item: 'PRD created and approved', checked: true },
      { id: 'PC-002', item: 'User stories generated (15 stories)', checked: false },
      { id: 'PC-003', item: 'Database migration file created', checked: false },
      { id: 'PC-004', item: 'Database migration validated (two-phase)', checked: false },
      { id: 'PC-005', item: 'Component architecture documented', checked: true },
      { id: 'PC-006', item: 'Security requirements documented', checked: true },
      { id: 'PC-007', item: 'Testing strategy defined', checked: true },
      { id: 'PC-008', item: 'PLAN→EXEC handoff created', checked: false }
    ],

    exec_checklist: [
      { id: 'EC-001', item: 'Database migration applied successfully', checked: false },
      { id: 'EC-002', item: 'ArchetypesSettingsTab component implemented (300-600 LOC)', checked: false },
      { id: 'EC-003', item: 'ArchetypeSelector component implemented (300-600 LOC)', checked: false },
      { id: 'EC-004', item: 'ThemePreview component implemented (300-600 LOC)', checked: false },
      { id: 'EC-005', item: 'Theming system implemented (CSS variables)', checked: false },
      { id: 'EC-006', item: 'Input validation implemented (XSS, JSONB)', checked: false },
      { id: 'EC-007', item: 'RLS policies tested and verified', checked: false },
      { id: 'EC-008', item: 'Unit tests written and passed', checked: false },
      { id: 'EC-009', item: 'E2E tests written and passed (100% user story coverage)', checked: false },
      { id: 'EC-010', item: 'Dark/light mode compatibility tested', checked: false },
      { id: 'EC-011', item: 'Dev server restarted and hard refresh verified', checked: false },
      { id: 'EC-012', item: 'Evidence screenshots captured', checked: false },
      { id: 'EC-013', item: 'Git commit with Conventional Commits format', checked: false },
      { id: 'EC-014', item: 'CI/CD pipelines green (waited 2-3 min)', checked: false }
    ],

    dependencies: [
      'Existing Settings page infrastructure (app/settings/page.tsx)',
      'Existing VentureCreationDialog component',
      'Existing ventures table with metadata JSONB field',
      'Shadcn UI component library',
      'Tailwind CSS',
      'Supabase RLS and Auth',
      'Playwright test framework'
    ],

    risks: [
      {
        risk: 'Theme conflict with existing dark/light mode toggle',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        mitigation: 'Design archetype themes as overlays on base theme; test both modes during EXEC'
      },
      {
        risk: 'Component size exceeds 600 LOC (maintainability issue)',
        severity: 'LOW',
        probability: 'LOW',
        mitigation: 'Strict component sizing enforcement; split if exceeds limit'
      },
      {
        risk: 'User confusion with multiple archetype options',
        severity: 'LOW',
        probability: 'MEDIUM',
        mitigation: 'Clear descriptions, visual previews, default selections'
      },
      {
        risk: 'Performance degradation with complex theming',
        severity: 'LOW',
        probability: 'LOW',
        mitigation: 'CSS variables are performant; test with 100+ ventures'
      }
    ],

    constraints: [
      'Phase 1 scope only: No AI recommendations, marketplace, or automation',
      'Component sizing: 300-600 LOC per component (optimal maintainability)',
      'Mobile responsive: All components must work on mobile devices',
      'Security: Company-scoped data only, admin-only CRUD',
      'Testing: 100% user story coverage with E2E tests required',
      'Implementation estimate: 700-950 LOC total (excluding tests)'
    ],

    metadata: {
      sub_agent_assessments: {
        systems_analyst: { verdict: 'NO_DUPLICATES', confidence: 95 },
        database_architect: { verdict: 'APPROVED', confidence: 98 },
        design_subagent: { verdict: 'APPROVED', confidence: 92 },
        security_architect: { verdict: 'APPROVED_WITH_RECOMMENDATIONS', confidence: 88 }
      },
      lead_handoff: {
        simplicity_first_gate: 'PASSED',
        scope_lock: true,
        quality_score: 95
      },
      implementation_estimate: {
        total_loc: '700-950',
        components: 3,
        migration_file: 1,
        estimated_hours: '7.5-11.5'
      }
    },

    created_by: 'PLAN-Agent',
    phase: 'PLAN',
    status: 'approved'
  };

  // Insert PRD
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select();

  if (error) {
    console.error('❌ PRD creation failed:', error.message);
    process.exit(1);
  }

  console.log('✅ PRD CREATED SUCCESSFULLY');
  console.log('');
  console.log('=== PRD Details ===');
  console.log('ID:', data[0].id);
  console.log('Title:', data[0].title);
  console.log('Status:', data[0].status);
  console.log('Version:', data[0].version);
  console.log('');
  console.log('=== PRD Content ===');
  console.log('Functional Requirements:', prd.functional_requirements.length);
  console.log('Acceptance Criteria:', prd.acceptance_criteria.length);
  console.log('PLAN Checklist:', prd.plan_checklist.length, 'items');
  console.log('EXEC Checklist:', prd.exec_checklist.length, 'items');
  console.log('Dependencies:', prd.dependencies.length);
  console.log('Risks:', prd.risks.length);
  console.log('');
  console.log('📋 Next: Generate user stories (Product Requirements Expert)');
}

createPRD().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
