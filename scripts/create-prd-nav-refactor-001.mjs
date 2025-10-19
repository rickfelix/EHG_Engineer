#!/usr/bin/env node

/**
 * Create PRD for SD-NAV-REFACTOR-001: Database-First Sidebar Navigation with Maturity Filtering
 * LEO Protocol v4.2.0 - PLAN Phase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('📋 CREATING PRD: SD-NAV-REFACTOR-001');
  console.log('='.repeat(70));

  const sdKey = 'SD-NAV-REFACTOR-001';

  // Get SD
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, title')
    .eq('id', sdKey)
    .single();

  if (!sd) {
    console.error('❌ SD not found');
    return;
  }

  const prdId = 'PRD-NAV-REFACTOR-001';

  const prd = {
    id: prdId,
    directive_id: sd.uuid_id,
    title: 'Database-First Sidebar Navigation with Maturity Filtering - Technical Requirements',
    version: '1.0.0',
    status: 'approved',
    category: 'Platform Architecture',
    priority: 'critical',
    created_by: 'PLAN Agent',
    phase: 'planning',
    progress: 0,

    executive_summary: `Refactor EHG application sidebar from hard-coded navigationTaxonomy.ts (67 routes) to database-driven architecture with maturity filtering (Draft/Development/Complete). Prioritizes Venture Workflow (40 stages) + EVA Assistant as top navigation sections. Includes user preferences, admin controls, and comprehensive 0-route-loss migration with feature flag rollout. WCAG 2.1 AA compliant throughout.`,

    business_context: `Current navigation uses hard-coded routes in navigationTaxonomy.ts, preventing dynamic route management, maturity filtering, and user personalization. Business needs: (1) Filter routes by maturity to hide WIP features, (2) Prioritize 40-stage Venture Workflow + EVA in IA, (3) Enable route management without code deployments, (4) Support user-specific maturity preferences, (5) Provide admin controls via Settings UI.`,

    technical_context: `Current: navigationTaxonomy.ts (67 routes, 10 categories), Navigation.tsx (renders from taxonomy). Target: Supabase tables (nav_routes, nav_preferences) with RLS policies, navigationService.ts, useNavigation() hook, MaturityToggle component, Settings integration. Database: liapbndqlqxdcgpwntbv.supabase.co. Stack: React 18, TypeScript, Supabase, Shadcn UI, Tailwind.`,

    functional_requirements: [
      { id: 'FR-1', title: 'Database Schema - nav_routes', description: 'Table: nav_routes (id, path, title, section, venture_stage, maturity, icon_key, sort_index, is_enabled). Indexes on section, maturity, venture_stage.', priority: 'CRITICAL' },
      { id: 'FR-2', title: 'Database Schema - nav_preferences', description: 'Table: nav_preferences (id, user_id FK auth.users, default_maturity, show_draft, show_development, show_complete). Unique on user_id.', priority: 'CRITICAL' },
      { id: 'FR-3', title: 'RLS Policies - nav_routes', description: 'SELECT: all authenticated users. INSERT/UPDATE/DELETE: admin users only (auth.jwt()->>role = admin).', priority: 'CRITICAL' },
      { id: 'FR-4', title: 'RLS Policies - nav_preferences', description: 'All operations: user owns row (auth.uid() = user_id). CASCADE delete on user removal.', priority: 'CRITICAL' },
      { id: 'FR-5', title: 'Migration Parity Gate', description: 'Count match: nav_routes count === 67. Path match: every navigationTaxonomy path exists in DB. UI parity: all routes visible with all maturity filters enabled.', priority: 'CRITICAL' },
      { id: 'FR-6', title: 'Migration Backup', description: 'Export navigation_backup.json before deprecating navigationTaxonomy.ts. Include timestamp, route count, full taxonomy data.', priority: 'CRITICAL' },
      { id: 'FR-7', title: 'Maturity Toggle Component', description: 'Segmented button control (Draft | Development | Complete) at top of sidebar. Visual indicators: ● Draft | ⚙️ Dev | ✓ Complete. Persists to nav_preferences.', priority: 'CRITICAL' },
      { id: 'FR-8', title: 'Enhanced Navigation Component', description: 'Section grouping with collapsible categories. Workflow stage badges (S1-S40). Active route highlighting (aria-current="page"). Renders from nav_routes table.', priority: 'CRITICAL' },
      { id: 'FR-9', title: 'Navigation Settings Tab', description: 'Settings page integration: Navigation tab with user preference controls (default maturity radio + show/hide switches). Admin route management table (feature-gated).', priority: 'HIGH' },
      { id: 'FR-10', title: 'Workflow Stage Grouping', description: '40-stage Venture Workflow section groups stages by category: ideation, validation, planning, development, launch, growth, operations, advanced.', priority: 'HIGH' },
      { id: 'FR-11', title: 'Feature Flag Rollout', description: 'VITE_FEATURE_NEW_NAV environment variable. If false, use legacy navigationTaxonomy.ts. If true, use database-driven navigation. Toggle for 1 release cycle.', priority: 'CRITICAL' },
      { id: 'FR-12', title: 'Real-Time Navigation Updates', description: 'Supabase real-time subscription to nav_routes table. Updates navigation immediately when admin changes routes.', priority: 'MEDIUM' }
    ],

    non_functional_requirements: [
      { category: 'Performance', requirement: 'Navigation render <100ms (same as current). Database query cached client-side. Real-time updates via WebSocket.' },
      { category: 'Accessibility', requirement: 'WCAG 2.1 AA compliance. Keyboard navigation (Tab → Section → Routes). ARIA attributes (role="navigation", aria-current, aria-expanded). Focus indicators 3px outline. Text/background contrast ≥4.5:1. Maturity badges: color + icon (not color-only).' },
      { category: 'Migration Safety', requirement: '0-route-loss validation. Migration blocked if nav_routes count ≠ 67 OR any path missing. Backup export required before deprecation. RLS validation with admin + standard user before go-live.' },
      { category: 'Scalability', requirement: 'Support 200+ routes without performance degradation. Index optimization on section, maturity, venture_stage columns.' },
      { category: 'Security', requirement: 'RLS policies enforce read-all/write-admin pattern. User preferences isolated via auth.uid(). No cross-user data access.' }
    ],

    technical_requirements: [
      { component: 'nav_routes migration', path: 'database/migrations/', changes: 'Create table, indexes, RLS policies. Seed with 67 routes from navigationTaxonomy.ts. Validation script.', effort: '3h' },
      { component: 'nav_preferences migration', path: 'database/migrations/', changes: 'Create table, FK to auth.users, unique constraint, RLS policies, CASCADE delete.', effort: '1h' },
      { component: 'navigationService.ts', path: 'src/services/', changes: 'New service: getRoutes(maturityFilter), getUserPreferences(), updateRoute(admin), subscribeToRoutes().', effort: '2h' },
      { component: 'useNavigation.ts', path: 'src/hooks/', changes: 'New hook: useNavigation() with real-time updates, maturity filtering, preference persistence.', effort: '2h' },
      { component: 'MaturityToggle.tsx', path: 'src/components/layout/', changes: 'New component: Segmented control with Draft/Dev/Complete states. Persists to nav_preferences.', effort: '2h' },
      { component: 'Navigation.tsx', path: 'src/components/layout/', changes: 'Refactor to use navigationService instead of hard-coded taxonomy. Feature flag support. ~400 lines.', effort: '4h' },
      { component: 'NavigationSettings.tsx', path: 'src/pages/settings/', changes: 'New Settings tab: User preference controls + admin route management table (feature-gated).', effort: '4h' },
      { component: 'migration-parity-validator.ts', path: 'scripts/', changes: 'Validation script: count check, path check, UI parity test, backup export. Blocks migration if fails.', effort: '2h' },
      { component: 'E2E tests', path: 'tests/e2e/', changes: 'Playwright tests: filter behavior, workflow stage grouping, admin route table, legacy nav fallback.', effort: '3h' },
      { component: 'A11y tests', path: 'tests/a11y/', changes: 'Axe scan, keyboard nav, ARIA attributes, contrast ratios. WCAG 2.1 AA compliance.', effort: '2h' }
    ],

    system_architecture: `Database: 2 new tables (nav_routes, nav_preferences) with RLS policies. Service layer: navigationService.ts with Supabase client. React hooks: useNavigation() for state management + real-time subscriptions. UI components: MaturityToggle (top of sidebar), enhanced Navigation (renders from DB), NavigationSettings (Settings page tab). Migration: Parity validator (count/path/UI checks), backup export, feature flag rollout. Stack: React 18, TypeScript, Supabase Realtime, Shadcn UI, Tailwind, Playwright, Axe.`,

    implementation_approach: `Phase 1: Database schema + migration (3h). Phase 2: Service layer + hooks (4h). Phase 3: UI components (MaturityToggle, Navigation refactor) (6h). Phase 4: Settings integration (4h). Phase 5: E2E + A11y testing (5h). Phase 6: Feature flag rollout + legacy deprecation (2h). Total: 24h (3 days). **CRITICAL**: Migration parity validation BLOCKS Phase 6. All 67 routes MUST exist in DB with matching paths before deprecating navigationTaxonomy.ts.`,

    technology_stack: [
      { name: 'React', version: '18.x' },
      { name: 'TypeScript', version: '5.x' },
      { name: 'Supabase', version: '2.x', purpose: 'Database + RLS + Realtime' },
      { name: 'Supabase Realtime', version: '2.x', purpose: 'WebSocket subscriptions' },
      { name: 'Shadcn UI', version: 'latest', purpose: 'UI components' },
      { name: 'Tailwind CSS', version: '3.x', purpose: 'Styling' },
      { name: 'Lucide React', version: 'latest', purpose: 'Icons' },
      { name: 'Playwright', version: '1.x', purpose: 'E2E testing' },
      { name: 'Axe Core', version: '4.x', purpose: 'A11y testing' }
    ],

    dependencies: [
      { name: 'Supabase EHG database', status: 'available', type: 'service', notes: 'liapbndqlqxdcgpwntbv.supabase.co' },
      { name: 'navigationTaxonomy.ts', status: 'available', type: 'code', notes: '67 routes to migrate' },
      { name: 'Settings page infrastructure', status: 'available', type: 'code', notes: 'Tab structure exists' },
      { name: 'Playwright test framework', status: 'available', type: 'testing', notes: 'Configured in EHG app' }
    ],

    constraints: [
      '0-route-loss requirement: Migration MUST maintain all 67 routes',
      'Feature flag rollout: VITE_FEATURE_NEW_NAV for gradual migration',
      'WCAG 2.1 AA compliance: Non-negotiable accessibility requirement',
      'Performance: Navigation render must remain <100ms',
      'Admin role definition: Requires JWT claim or user list (MVP uses JWT)',
      'RLS validation: Must test with admin + standard user before go-live'
    ],

    risks: [
      { risk: 'Route loss during migration', severity: 'critical', mitigation: 'Count match validation, path match check, UI parity test, backup export. Migration blocked if any check fails.' },
      { risk: 'RLS policy misconfiguration', severity: 'high', mitigation: 'Test with admin + standard users before deprecating legacy nav. Verify read-all/write-admin pattern works.' },
      { risk: 'Performance degradation from DB queries', severity: 'medium', mitigation: 'Client-side caching, real-time subscriptions, indexed queries on section/maturity/venture_stage.' },
      { risk: 'Accessibility regression', severity: 'high', mitigation: 'Playwright a11y suite, manual keyboard nav testing, ARIA validation, contrast ratio checks.' },
      { risk: 'Feature flag confusion', severity: 'low', mitigation: 'Clear documentation, 1 release cycle transition period, admin communications.' }
    ],

    acceptance_criteria: [
      { id: 'AC-1', criteria: 'nav_routes table exists with 67 rows matching navigationTaxonomy.ts paths', verification: 'SELECT COUNT(*) FROM nav_routes; -- Must return 67. Query paths and compare with navigationTaxonomy.ts.' },
      { id: 'AC-2', criteria: 'nav_preferences table exists with RLS policies (user-owns-data pattern)', verification: 'Test INSERT/UPDATE/DELETE as different users. Verify only own preferences accessible.' },
      { id: 'AC-3', criteria: 'MaturityToggle component renders and persists selection to nav_preferences', verification: 'Click Draft/Dev/Complete buttons. Verify nav_preferences.default_maturity updates. Reload page, verify persistence.' },
      { id: 'AC-4', criteria: 'Navigation component renders routes from nav_routes table filtered by maturity', verification: 'Set maturity to Draft. Verify only draft routes visible. Repeat for Dev/Complete. Check all 67 routes visible with all filters enabled.' },
      { id: 'AC-5', criteria: 'Workflow section displays as top section with 40 stages grouped by category', verification: 'Visual inspection: Workflow is first section. Count route items: should show stage-based grouping.' },
      { id: 'AC-6', criteria: 'NavigationSettings tab exists in Settings page with user preferences + admin table', verification: 'Navigate to /settings. Click Navigation tab. Verify preference controls visible. If admin, verify route management table.' },
      { id: 'AC-7', criteria: 'RLS validation: Admin users can write to nav_routes, standard users cannot', verification: 'Test as admin: INSERT route succeeds. Test as standard user: INSERT route fails with RLS error.' },
      { id: 'AC-8', criteria: 'Migration parity: navigation_backup.json exported with 67 routes', verification: 'Check backup file exists. Verify JSON contains 67 routes with paths matching navigationTaxonomy.ts.' },
      { id: 'AC-9', criteria: 'Feature flag: VITE_FEATURE_NEW_NAV=false uses legacy nav, =true uses database nav', verification: 'Toggle env variable. Rebuild app. Verify navigation source switches (inspect network tab for Supabase queries).' },
      { id: 'AC-10', criteria: 'WCAG 2.1 AA compliance: Keyboard nav works, ARIA attributes present, contrast ≥4.5:1', verification: 'Playwright axe scan: 0 violations. Manual keyboard test: Tab through nav. Screen reader test: NVDA/JAWS announce correctly.' },
      { id: 'AC-11', criteria: 'E2E tests pass: filter behavior, workflow grouping, admin table, legacy fallback', verification: 'npm run test:e2e -- nav-refactor.spec.ts. All tests green.' },
      { id: 'AC-12', criteria: 'Real-time updates: Admin route change reflects immediately in user navigation', verification: 'Open nav as user. Admin updates route title. Verify user sees change within 2 seconds (no refresh).' },
      { id: 'AC-13', criteria: 'Performance: Navigation render <100ms, no regressions from current baseline', verification: 'Chrome DevTools Performance tab. Measure navigation component render time. Compare with current navigationTaxonomy.ts render.' }
    ],

    test_scenarios: [
      { id: 'TS-1', scenario: 'Smoke Test: nav_routes count === 67', type: 'smoke', priority: 'CRITICAL', steps: 'Query database: SELECT COUNT(*) FROM nav_routes;', expected: 'Returns 67' },
      { id: 'TS-2', scenario: 'Smoke Test: MaturityToggle renders and persists', type: 'smoke', priority: 'CRITICAL', steps: 'Click Draft/Dev/Complete buttons, reload page', expected: 'Selection persists' },
      { id: 'TS-3', scenario: 'Smoke Test: Navigation renders from database', type: 'smoke', priority: 'CRITICAL', steps: 'Load sidebar, inspect network tab', expected: 'Supabase query for nav_routes visible' },
      { id: 'TS-4', scenario: 'Smoke Test: Settings tab exists', type: 'smoke', priority: 'CRITICAL', steps: 'Navigate to /settings, check for Navigation tab', expected: 'Tab visible' },
      { id: 'TS-5', scenario: 'Smoke Test: Feature flag toggles source', type: 'smoke', priority: 'CRITICAL', steps: 'Toggle VITE_FEATURE_NEW_NAV, rebuild, inspect source', expected: 'Navigation source switches' },
      { id: 'TS-6', scenario: 'E2E Test: Filter behavior (Draft/Dev/Complete)', type: 'e2e', priority: 'HIGH', steps: 'Set maturity filter to each state, count visible routes', expected: 'Correct routes shown per maturity' },
      { id: 'TS-7', scenario: 'E2E Test: Workflow stage grouping displays', type: 'e2e', priority: 'HIGH', steps: 'Check Workflow section, verify stage grouping', expected: '40 stages grouped by category' },
      { id: 'TS-8', scenario: 'E2E Test: Admin route management table', type: 'e2e', priority: 'MEDIUM', steps: 'Login as admin, navigate to Navigation settings', expected: 'Route management table visible' },
      { id: 'TS-9', scenario: 'E2E Test: Legacy nav fallback', type: 'e2e', priority: 'HIGH', steps: 'Set VITE_FEATURE_NEW_NAV=false, rebuild', expected: 'Uses navigationTaxonomy.ts' },
      { id: 'TS-10', scenario: 'A11y Test: Axe scan', type: 'a11y', priority: 'CRITICAL', steps: 'Run Playwright axe scan on sidebar', expected: '0 violations' },
      { id: 'TS-11', scenario: 'A11y Test: Keyboard navigation', type: 'a11y', priority: 'CRITICAL', steps: 'Tab through nav, press Enter/Space', expected: 'All interactive elements accessible' },
      { id: 'TS-12', scenario: 'A11y Test: ARIA attributes', type: 'a11y', priority: 'CRITICAL', steps: 'Inspect DOM for role, aria-current, aria-expanded', expected: 'All present and correct' },
      { id: 'TS-13', scenario: 'A11y Test: Contrast ratios', type: 'a11y', priority: 'CRITICAL', steps: 'Use Axe or Lighthouse to check contrast', expected: 'All text/background ≥4.5:1' }
    ],

    metadata: {
      estimated_effort: {
        planning: 4,
        design: 2,
        development: 14,
        testing: 5,
        documentation: 2,
        deployment: 1,
        total: 28
      },
      timeline: {
        planning: 'Week 1 (4h)',
        development: 'Week 1-2 (14h over 3 days)',
        testing: 'Week 2 (5h)',
        deployment: 'Week 2 (1h)',
        total_duration: '2 weeks'
      },
      success_metrics: [
        'Route coverage: 67/67 routes migrated (100%)',
        'Zero route loss: 0 broken links after migration',
        'User adoption: 80%+ users enable new nav within 1 week',
        'Performance: Navigation render time <100ms',
        'Accessibility: 0 WCAG violations on axe scan',
        'Test coverage: ≥85% coverage on nav components',
        'Feature flag rollout: 100% users migrated within 1 release cycle'
      ],
      notes: `**CRITICAL MIGRATION GUARDRAILS:**
1. Migration parity gate: nav_routes count === 67 (blocking)
2. Path match check: every navigationTaxonomy path in DB (blocking)
3. UI parity test: all routes visible with all maturity filters enabled (blocking)
4. Backup export: navigation_backup.json before deprecation (blocking)
5. Feature flag rollout: VITE_FEATURE_NEW_NAV for 1 release cycle (required)
6. RLS validation: admin + standard user tests before go-live (blocking)

**IA PRIORITY:**
- Workflow section MUST be first section (sort_index: 1)
- EVA section MUST be second section (sort_index: 2)
- Stage grouping logic: Group 40 stages by category (ideation, validation, planning, development, launch, growth, operations, advanced)

**ACCESSIBILITY REQUIREMENTS:**
- Keyboard navigation: Tab → Section headers → Routes
- Arrow keys for section expansion/collapse
- Enter/Space for activation
- role="navigation" on sidebar
- aria-current="page" on active route
- aria-expanded on collapsible sections
- aria-label on MaturityToggle buttons
- Focus indicators: 3px outline
- Text/background contrast: ≥4.5:1 (AA compliant)
- Maturity badges: Color + icon (not color-only)

**ADMIN ROLE DEFINITION (MVP):**
- Use JWT claim: auth.jwt()->>\'role\' = \'admin\'
- Future: Admin users table with explicit user IDs
- RLS check adequate for MVP, enhance post-launch`
    }
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating PRD:', error);
    process.exit(1);
  }

  console.log('✅ PRD Created Successfully!\n');
  console.log('PRD ID:', data.id);
  console.log('Title:', data.title);
  console.log('Status:', data.status);
  console.log('Priority:', data.priority);
  console.log('Estimated Effort:', data.estimated_effort.total, 'hours');
  console.log('\n📊 Requirements Summary:');
  console.log('  Functional Requirements:', data.functional_requirements.length);
  console.log('  Non-Functional Requirements:', data.non_functional_requirements.length);
  console.log('  Technical Requirements:', data.technical_requirements.length);
  console.log('  Acceptance Criteria:', data.acceptance_criteria.length);
  console.log('\n🎯 Next Steps:');
  console.log('  1. PLAN: Engage Design & Testing sub-agents');
  console.log('  2. PLAN→EXEC: Create handoff for implementation');
  console.log('  3. EXEC: Implement Phase 1 (Database schema)');
}

createPRD().catch(console.error);
