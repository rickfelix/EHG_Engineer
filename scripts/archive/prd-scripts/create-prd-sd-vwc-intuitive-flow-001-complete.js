#!/usr/bin/env node

/**
 * PRD: Venture Wizard User Experience Completion
 * SD: SD-VWC-INTUITIVE-FLOW-001
 *
 * Complete PRD with all details from Strategic Directive filled in.
 * Vision: Transform Browse Opportunities from 65% → 90% production-ready.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

const SD_ID = 'SD-VWC-INTUITIVE-FLOW-001';
const PRD_TITLE = 'Venture Wizard User Experience Completion - Technical Implementation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // -------------------------------------------------------------------------
  // STEP 1: Fetch Strategic Directive
  // -------------------------------------------------------------------------

  console.log('\n1️⃣  Fetching Strategic Directive...');

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id, title, category, priority, strategic_objectives, success_criteria, key_changes, risks')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.uuid_id}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys
    id: prdId,
    sd_uuid: sdData.uuid_id,
    directive_id: SD_ID,

    // Core Metadata
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',
    category: 'product_feature',
    priority: 'high',

    // Executive & Context
    executive_summary: `
Transform the EHG Venture Wizard's Browse Opportunities feature from functional-but-rough (65% vision) into production-ready (90% vision) by addressing UX polish gaps. This PRD delivers critical enhancements: security hardening (remove hardcoded API keys), inline intelligence cards (STA/GCIA in Steps 2-3), full dark mode support, WCAG 2.1 AA accessibility compliance, disabled button tooltips, loading skeletons, and comprehensive unit test coverage.

**Current State**: Browse Opportunities technically functional with 16 E2E tests passing, but has production blockers: hardcoded Supabase keys (CRITICAL security issue), drawer-only intelligence (breaks wizard flow), 0% dark mode implementation, 40% WCAG compliance, no unit tests.

**Target State**: Production-ready wizard with inline AI guidance, secure environment configuration, polished dark mode, full keyboard navigation, 100% disabled button guidance, skeleton loading states, and 100% adapter unit test coverage + 80% dashboard coverage.

**Impact**: Enables production launch of Browse Opportunities feature, prevents security breach from exposed API keys, reduces user friction by 5 interruption points, improves accessibility for keyboard-only and screen reader users.
    `.trim(),

    business_context: `
**User Pain Points**:
1. Security risk: Hardcoded API keys visible in client bundle (CVE-level issue)
2. Flow interruption: Must open drawer modal to see AI intelligence, breaks wizard immersion
3. Visual jarring: No dark mode support despite user preference (0% implementation)
4. Accessibility barriers: 40% WCAG 2.1 AA compliance blocks keyboard-only and screen reader users
5. Missing guidance: Disabled buttons don't explain why (e.g., Entry C "Coming Soon", research disabled when no opportunity selected)
6. Perceived performance: Spinners instead of skeletons cause layout shifts

**Business Objectives**:
1. Enable production launch: Cannot deploy with hardcoded secrets exposed
2. User trust: Professional dark mode + accessibility = enterprise credibility
3. Reduce support burden: Inline intelligence + tooltips reduce confusion
4. Compliance: WCAG 2.1 AA required for government/enterprise contracts
5. Quality assurance: Unit tests prevent regression of complex adapter logic

**Success Metrics**:
- Security: 0 hardcoded secrets (verified via grep)
- User satisfaction: 0 flow interruptions (down from 5)
- Accessibility score: WAVE checker 0 critical errors
- Test coverage: 100% adapter + 80% dashboard component
- Vision alignment: 90% (up from 65%)
    `.trim(),

    technical_context: `
**Existing Systems**:
- OpportunitySourcingDashboard.jsx (1,000+ lines): Browse interface with hardcoded keys at lines 28-32
- VentureCreationPage.tsx (1,215 lines): 5-step wizard with blueprint prefill
- opportunityToVentureAdapter.ts (157 lines): Production-ready transformer (needs unit tests)
- IntelligenceDrawer.tsx: Current drawer-only implementation
- opportunity-to-venture-bridge.spec.ts (547 lines): 16 comprehensive E2E tests

**Architecture Patterns**:
- Vite + React + TypeScript stack
- Shadcn UI components (dark mode ready via CSS variables)
- Supabase for data persistence
- React Router for navigation
- Zustand for state management (opportunity selection)

**Integration Points**:
- Supabase: opportunity_blueprints, ventures tables
- Environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
- Intelligence services: STA (market timing), GCIA (competitive intelligence)
- Parent SD: SD-VWC-OPPORTUNITY-BRIDGE-001 (90% complete, foundation in place)
    `.trim(),

    // Functional Requirements (from strategic objectives)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Security Hardening: Remove 100% of hardcoded API keys',
        description: 'Replace hardcoded SUPABASE_URL and SUPABASE_ANON_KEY in OpportunitySourcingDashboard.jsx:28-32 with environment variables. Verify via grep that no secrets remain in client code.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'grep -r "SUPABASE_URL.*https" src/ returns 0 results',
          'grep -r "SUPABASE_ANON_KEY.*ey" src/ returns 0 results',
          'Dashboard uses import.meta.env.VITE_SUPABASE_URL',
          'Dashboard uses import.meta.env.VITE_SUPABASE_ANON_KEY',
          'All existing functionality still works with env vars'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Inline Intelligence: Embed STA/GCIA cards in Steps 2-3',
        description: 'Create IntelligenceSummaryCard.tsx component (200-300 LOC) to display market timing analysis (STA) in Step 2 and competitive intelligence (GCIA) in Step 3. Replace drawer-only access with inline, collapsible cards.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'IntelligenceSummaryCard component created (shadcn/ui Card)',
          'STA summary visible inline in VentureCreationPage Step 2',
          'GCIA summary visible inline in VentureCreationPage Step 3',
          'Cards collapsible (expand/collapse state)',
          'No need to open drawer to see intelligence',
          'Drawer still accessible for full intelligence details'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Dark Mode: Full implementation across dashboard + wizard',
        description: 'Add shadcn/ui dark mode classes (dark:*) to OpportunitySourcingDashboard and VentureCreationPage. Implement theme toggle with system/light/dark options. Target 100% coverage of all visible UI elements.',
        priority: 'HIGH',
        acceptance_criteria: [
          'OpportunitySourcingDashboard renders correctly in light/dark mode',
          'VentureCreationPage (all 5 steps) render correctly in dark mode',
          'IntelligenceSummaryCard supports dark mode',
          'All text readable (contrast ratio ≥4.5:1)',
          'Theme toggle persists via localStorage',
          'System preference detected and applied by default'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Accessibility: Achieve WCAG 2.1 AA compliance',
        description: 'Implement full keyboard navigation (Tab, Shift+Tab, Escape, Enter, Arrow keys), add ARIA labels (aria-describedby, aria-live, aria-label), ensure focus indicators visible, support screen readers.',
        priority: 'HIGH',
        acceptance_criteria: [
          'Full keyboard navigation works (no mouse required)',
          'Tab order logical and complete',
          'Escape closes modals/drawers',
          'Enter/Space activates buttons',
          'Arrow keys navigate lists',
          'ARIA labels on all interactive elements',
          'Focus indicators visible (outline or ring)',
          'WAVE checker shows 0 critical errors',
          'Screen reader announces all content and states'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Disabled Button Tooltips: 100% coverage',
        description: 'Add shadcn/ui Tooltip to all disabled buttons explaining why disabled and what action needed. Examples: Entry C "Coming Soon - Portfolio Balance Engine required", Research "Select an opportunity first".',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'All disabled buttons have tooltip on hover/focus',
          'Tooltip explains why button is disabled',
          'Tooltip suggests action to enable (if applicable)',
          'Entry C tooltip: "Coming Soon - Portfolio Balance Engine"',
          'Research button tooltip when no selection made',
          'Tooltips accessible via keyboard (focus)',
          'Tooltip styling consistent (shadcn/ui Tooltip component)'
        ]
      },
      {
        id: 'FR-6',
        requirement: 'Loading Skeletons: Replace spinners in critical paths',
        description: 'Replace all loading spinners with shadcn/ui Skeleton components to prevent layout shifts (CLS = 0). Critical paths: dashboard opportunity cards, intelligence cards, venture preview.',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Dashboard opportunity cards show skeleton while loading',
          'Intelligence cards show skeleton before data loads',
          'Venture preview shows skeleton in Steps 2-5',
          'No layout shifts (CLS = 0)',
          'Skeleton load time < 100ms',
          '100% of critical paths use skeletons (not spinners)'
        ]
      },
      {
        id: 'FR-7',
        requirement: 'Unit Tests: 100% adapter + 80% dashboard coverage',
        description: 'Create opportunityToVentureAdapter.test.ts with 12 test cases covering all transformation logic. Create OpportunitySourcingDashboard.test.jsx with 7 test cases covering rendering, filtering, selection.',
        priority: 'HIGH',
        acceptance_criteria: [
          'opportunityToVentureAdapter.test.ts created with 12 tests',
          '100% coverage of adapter functions',
          'OpportunitySourcingDashboard.test.jsx created with 7 tests',
          '80% coverage of dashboard component',
          'All unit tests passing (npm run test:unit)',
          'Tests use React Testing Library + Vitest',
          'Mock Supabase and external dependencies'
        ]
      },
      {
        id: 'FR-8',
        requirement: 'Entry C Placeholder: Disabled with "Coming Soon" text',
        description: 'Add Entry Choice (C) card to VentureCreationPage Step 1 as disabled option with tooltip explaining Portfolio Balance Engine dependency.',
        priority: 'LOW',
        acceptance_criteria: [
          'Entry C card visible in Step 1 (alongside A and B)',
          'Card visually disabled (opacity, cursor-not-allowed)',
          'Tooltip on hover: "Coming Soon - Portfolio Balance Engine"',
          'Card does not select when clicked',
          'Existing Entry A/B functionality unaffected'
        ]
      },
      {
        id: 'FR-9',
        requirement: 'Portfolio Impact Placeholder: Show current venture count',
        description: 'Add portfolio impact Alert to VentureCreationPage Step 5 (Review) showing current venture count and noting future portfolio balance analysis.',
        priority: 'LOW',
        acceptance_criteria: [
          'Alert component added to Step 5',
          'Shows "You currently have X ventures" (X from database)',
          'Note: "Portfolio impact analysis coming soon"',
          'Alert styling: info (blue) with InfoIcon',
          'Non-blocking (does not prevent submission)'
        ]
      }
    ],

    // Non-Functional Requirements
    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Loading skeletons prevent layout shifts',
        target_metric: 'CLS (Cumulative Layout Shift) = 0, skeleton load time < 100ms'
      },
      {
        type: 'security',
        requirement: 'Zero hardcoded secrets in client code',
        target_metric: 'grep -r "ey[A-Za-z0-9]" src/ returns 0 API key matches'
      },
      {
        type: 'accessibility',
        requirement: 'WCAG 2.1 AA compliance',
        target_metric: 'WAVE checker 0 critical errors, 0 serious errors, full keyboard nav, 4.5:1 contrast ratio'
      },
      {
        type: 'usability',
        requirement: 'Inline intelligence reduces flow interruptions',
        target_metric: 'User can complete wizard without opening drawer (0 modal interruptions)'
      },
      {
        type: 'maintainability',
        requirement: 'Unit test coverage prevents regression',
        target_metric: '100% adapter coverage, 80% dashboard coverage, all tests passing'
      }
    ],

    // Technical Requirements
    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Environment variable configuration',
        description: 'Use Vite environment variables (import.meta.env.VITE_*) for all Supabase credentials. Never hardcode secrets.',
        dependencies: ['dotenv', 'Vite env system']
      },
      {
        id: 'TR-2',
        requirement: 'Shadcn UI components',
        description: 'Use shadcn/ui Tooltip, Skeleton, Alert, Card for consistent styling and dark mode support.',
        dependencies: ['@radix-ui/react-tooltip', 'shadcn/ui CLI']
      },
      {
        id: 'TR-3',
        requirement: 'Testing infrastructure',
        description: 'Vitest for unit tests, React Testing Library for component tests, mock Supabase client.',
        dependencies: ['vitest', '@testing-library/react', '@testing-library/user-event']
      },
      {
        id: 'TR-4',
        requirement: 'Dark mode implementation',
        description: 'Use CSS variables (hsl-based) and dark: prefix classes. Toggle via <html> class="dark".',
        dependencies: ['tailwindcss dark mode', 'next-themes or custom toggle']
      }
    ],

    // Architecture
    system_architecture: `
## Component Architecture

### New Components
1. **IntelligenceSummaryCard.tsx** (200-300 LOC)
   - Props: \`intelligenceType: "STA" | "GCIA"\`, \`data: IntelligenceData\`, \`isCollapsible: boolean\`
   - Displays market timing (STA) or competitive intelligence (GCIA) inline
   - Collapsible with expand/collapse animation
   - Dark mode support via shadcn/ui Card

2. **ThemeToggle.tsx** (50-100 LOC)
   - System/Light/Dark options
   - Persists to localStorage
   - Updates <html> class

### Modified Components
3. **OpportunitySourcingDashboard.jsx**
   - Remove hardcoded keys (lines 28-32)
   - Add dark mode classes
   - Add loading skeletons for opportunity cards
   - Add unit tests (7 test cases)

4. **VentureCreationPage.tsx**
   - Embed IntelligenceSummaryCard in Steps 2-3
   - Add dark mode classes
   - Add Entry C placeholder in Step 1
   - Add portfolio impact Alert in Step 5
   - Add disabled button tooltips

5. **opportunityToVentureAdapter.ts**
   - Add comprehensive unit tests (12 test cases)
   - No logic changes (already production-ready)

## Data Flow
1. User browses opportunities (dashboard)
2. Selects opportunity → stores in Zustand state
3. Navigates to wizard → adapter transforms opportunity to venture blueprint
4. Intelligence services (STA, GCIA) fetch in parallel
5. IntelligenceSummaryCard displays inline in Steps 2-3
6. User reviews Step 5 → submits venture

## Integration Points
- **Supabase**: opportunity_blueprints (read), ventures (create)
- **Environment**: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
- **Intelligence**: STA (market timing), GCIA (competitive analysis)
- **State**: Zustand (opportunity selection)
- **Routing**: React Router (navigation)
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'opportunity_blueprints',
          columns: ['id', 'title', 'description', 'market_data', 'intelligence_summary'],
          relationships: ['Read-only (no changes)']
        },
        {
          name: 'ventures',
          columns: ['id', 'title', 'description', 'entry_choice', 'status'],
          relationships: ['Insert via wizard submission (existing)']
        }
      ],
      notes: 'NO NEW TABLES. All database operations use existing schema.'
    },

    api_specifications: [
      {
        endpoint: 'None',
        method: 'N/A',
        description: 'This SD is purely UI/UX enhancements. No new API endpoints.',
        request: {},
        response: {}
      }
    ],

    ui_ux_requirements: [
      {
        component: 'IntelligenceSummaryCard',
        description: 'Inline collapsible card for STA/GCIA intelligence',
        wireframe: 'Shadcn/ui Card with title, summary text, expand/collapse button'
      },
      {
        component: 'ThemeToggle',
        description: 'System/Light/Dark mode selector in header',
        wireframe: 'Dropdown or segmented control with sun/moon/auto icons'
      },
      {
        component: 'Disabled Button Tooltips',
        description: 'Shadcn/ui Tooltip on all disabled buttons',
        wireframe: 'Tooltip appears on hover/focus with explanation text'
      },
      {
        component: 'Loading Skeletons',
        description: 'Shadcn/ui Skeleton for dashboard cards and intelligence cards',
        wireframe: 'Skeleton matches component dimensions (prevents layout shift)'
      },
      {
        component: 'Entry C Placeholder',
        description: 'Disabled card in Step 1 with "Coming Soon" tooltip',
        wireframe: 'Same card style as Entry A/B but disabled (opacity 50%, cursor-not-allowed)'
      }
    ],

    // Implementation
    implementation_approach: `
## Phase 1: Critical Path (P1) - 14 hours
**Focus**: Security, inline intelligence, tooltips, dark mode

### P1.1: Security Hardening (2h)
- Remove hardcoded Supabase keys from OpportunitySourcingDashboard.jsx:28-32
- Replace with import.meta.env.VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
- Verify no secrets remain: \`grep -r "ey[A-Za-z0-9]" src/\`
- Test dashboard functionality with env vars

### P1.2: Inline Intelligence Cards (4h)
- Create src/components/ventures/IntelligenceSummaryCard.tsx (200-300 LOC)
- Props: intelligenceType, data, isCollapsible
- Implement expand/collapse state
- Embed in VentureCreationPage.tsx Step 2 (STA) and Step 3 (GCIA)
- Test inline display (no drawer required)

### P1.3: Disabled Button Tooltips (2h)
- Install shadcn/ui Tooltip component if needed
- Add tooltips to Entry C button
- Add tooltips to disabled wizard buttons
- Test keyboard accessibility (focus triggers tooltip)

### P1.4: Dark Mode - Dashboard (3h)
- Add dark mode classes to OpportunitySourcingDashboard.jsx
- Update all text, borders, backgrounds with dark: variants
- Test contrast ratios (≥4.5:1)
- Verify all elements visible in dark mode

### P1.5: Dark Mode - Wizard (3h)
- Add dark mode classes to VentureCreationPage.tsx (all 5 steps)
- Add dark mode to IntelligenceSummaryCard
- Create ThemeToggle component (header integration)
- Test full wizard flow in light/dark modes

## Phase 2: Polish (P2) - 10 hours
**Focus**: Keyboard nav, ARIA labels, loading skeletons, unit tests

### P2.1: Keyboard Navigation + ARIA (4h)
- Add tabIndex to all interactive elements
- Implement arrow key navigation for lists
- Add ARIA labels (aria-describedby, aria-live, aria-label)
- Add visible focus indicators (ring or outline)
- Test with keyboard only (no mouse)
- Run WAVE checker (target: 0 critical errors)

### P2.2: Loading Skeletons (3h)
- Install shadcn/ui Skeleton component
- Replace spinners in dashboard opportunity cards
- Replace spinners in intelligence cards
- Add skeleton for venture preview in Steps 2-5
- Verify CLS = 0 (no layout shifts)

### P2.3: Unit Tests (5h)
- Create tests/unit/opportunityToVentureAdapter.test.ts (12 tests)
  - Test basic transformation
  - Test edge cases (null, undefined, empty)
  - Test data mapping accuracy
  - Test error handling
- Create tests/unit/OpportunitySourcingDashboard.test.jsx (7 tests)
  - Test rendering with opportunities
  - Test filtering
  - Test opportunity selection
  - Test loading states
  - Test error states
- Run: npm run test:unit (verify 100% adapter, 80% dashboard)

## Phase 3: Completeness (P3) - 4 hours
**Focus**: Entry C placeholder, portfolio impact, analytics

### P3.1: Entry C Placeholder (1h)
- Add Entry C card to VentureCreationPage Step 1
- Set disabled state (opacity 50%, cursor-not-allowed)
- Add tooltip: "Coming Soon - Portfolio Balance Engine"
- Test that card does not select when clicked

### P3.2: Portfolio Impact Placeholder (1h)
- Query current venture count from database
- Add Alert to VentureCreationPage Step 5
- Show "You currently have X ventures"
- Add note: "Portfolio impact analysis coming soon"
- Style: info (blue) with InfoIcon

### P3.3: Analytics Expansion (2h)
- Track wizard step views
- Track form field interactions
- Track browse interactions (filter, sort, select)
- Store in existing analytics system

## Total Timeline: 24 hours (3 working days)
    `.trim(),

    technology_stack: [
      'React 18',
      'TypeScript 5',
      'Vite',
      'Shadcn UI (Tooltip, Skeleton, Alert, Card)',
      'Tailwind CSS (dark mode)',
      'Vitest (unit tests)',
      'React Testing Library',
      '@testing-library/user-event',
      'Supabase Client',
      'Zustand (state management)',
      'React Router'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'SD-VWC-OPPORTUNITY-BRIDGE-001 (parent)',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'opportunityToVentureAdapter.ts',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'OpportunitySourcingDashboard.jsx',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'VentureCreationPage.tsx',
        status: 'completed',
        blocker: false
      },
      {
        type: 'external',
        name: 'shadcn/ui components (Tooltip, Skeleton, Alert)',
        status: 'completed',
        blocker: false
      },
      {
        type: 'external',
        name: 'Vitest + React Testing Library',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Security: No hardcoded API keys',
        description: 'Verify no hardcoded Supabase credentials in client code',
        expected_result: 'grep -r "ey[A-Za-z0-9]" src/ returns 0 matches',
        test_type: 'unit'
      },
      {
        id: 'TS-2',
        scenario: 'Inline Intelligence: STA in Step 2',
        description: 'Navigate to wizard Step 2, verify STA summary visible inline',
        expected_result: 'IntelligenceSummaryCard visible, collapsible, shows market timing data',
        test_type: 'e2e'
      },
      {
        id: 'TS-3',
        scenario: 'Dark Mode: Dashboard rendering',
        description: 'Toggle to dark mode, verify all dashboard elements visible and readable',
        expected_result: 'All text contrast ≥4.5:1, borders visible, backgrounds correct',
        test_type: 'e2e'
      },
      {
        id: 'TS-4',
        scenario: 'Accessibility: Keyboard navigation',
        description: 'Navigate entire wizard using Tab/Shift+Tab/Enter/Escape only',
        expected_result: 'All interactive elements reachable, focus indicators visible, no mouse required',
        test_type: 'e2e'
      },
      {
        id: 'TS-5',
        scenario: 'Tooltips: Disabled Entry C',
        description: 'Hover/focus on disabled Entry C card in Step 1',
        expected_result: 'Tooltip displays: "Coming Soon - Portfolio Balance Engine"',
        test_type: 'e2e'
      },
      {
        id: 'TS-6',
        scenario: 'Loading Skeletons: Dashboard cards',
        description: 'Load dashboard, verify skeleton displays before opportunity cards',
        expected_result: 'Skeleton visible, matches card dimensions, no layout shift (CLS=0)',
        test_type: 'e2e'
      },
      {
        id: 'TS-7',
        scenario: 'Unit Tests: Adapter transformation',
        description: 'Run opportunityToVentureAdapter.test.ts',
        expected_result: '12/12 tests passing, 100% coverage',
        test_type: 'unit'
      }
    ],

    acceptance_criteria: sdData.success_criteria || [
      'No hardcoded API keys in any source file (verified via grep)',
      'STA/GCIA cards visible inline in Steps 2 & 3 without drawer interaction',
      'All disabled buttons display explanatory tooltip on hover/focus',
      'OpportunitySourcingDashboard + VentureCreationPage render correctly in light/dark mode',
      'Full keyboard navigation works (Tab, Shift+Tab, Escape, Enter, Arrow keys)',
      'WAVE accessibility checker shows 0 critical errors',
      '12 unit tests for opportunityToVentureAdapter (100% coverage)',
      '7 unit tests for OpportunitySourcingDashboard (80% coverage)',
      'All 16 existing E2E tests still pass (no regressions)',
      'Loading states use skeleton loaders (no layout shifts)',
      'Entry (C) shows as disabled with "Coming Soon" text',
      'Step 5 includes portfolio impact placeholder with current venture count',
      'Analytics track wizard steps, form fields, browse interactions'
    ],

    performance_requirements: {
      page_load_time: '<2s',
      skeleton_load_time: '<100ms',
      cumulative_layout_shift: 0
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Implementation approach documented (P1/P2/P3 phases)', checked: true },
      { text: 'Test scenarios defined (7 test scenarios)', checked: true },
      { text: 'Acceptance criteria established (13 criteria)', checked: true },
      { text: 'User stories generated (STORIES sub-agent)', checked: false },
      { text: 'Database schema reviewed (DATABASE sub-agent)', checked: true },
      { text: 'Security assessment completed (SECURITY sub-agent)', checked: false }
    ],

    exec_checklist: [
      { text: 'P1.1: Security hardening (remove hardcoded keys)', checked: false },
      { text: 'P1.2: Inline intelligence cards created', checked: false },
      { text: 'P1.3: Disabled button tooltips added', checked: false },
      { text: 'P1.4: Dark mode - Dashboard', checked: false },
      { text: 'P1.5: Dark mode - Wizard', checked: false },
      { text: 'P2.1: Keyboard navigation + ARIA labels', checked: false },
      { text: 'P2.2: Loading skeletons implemented', checked: false },
      { text: 'P2.3: Unit tests (12 adapter + 7 dashboard)', checked: false },
      { text: 'P3.1: Entry C placeholder added', checked: false },
      { text: 'P3.2: Portfolio impact placeholder added', checked: false },
      { text: 'P3.3: Analytics expansion', checked: false },
      { text: 'All 16 E2E tests still passing', checked: false },
      { text: 'WAVE accessibility check (0 critical errors)', checked: false },
      { text: 'Security verification (0 hardcoded keys)', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met (13/13)', checked: false },
      { text: 'Performance requirements validated (CLS=0, <100ms)', checked: false },
      { text: 'Security review completed (no hardcoded secrets)', checked: false },
      { text: 'Accessibility validation (WAVE + keyboard nav)', checked: false },
      { text: 'Unit test coverage verified (100% adapter, 80% dashboard)', checked: false },
      { text: 'E2E tests passing (16/16)', checked: false },
      { text: 'Dark mode tested in both themes', checked: false },
      { text: 'Deployment readiness confirmed', checked: false }
    ],

    // Progress
    progress: 10,
    phase: 'planning',
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 10,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    // Risks (from SD)
    risks: sdData.risks || [
      {
        category: 'Technical',
        risk: 'Dark mode color inconsistencies across components',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Visual inconsistencies, unprofessional appearance',
        mitigation: 'Use shadcn/ui theme tokens exclusively (bg-background, text-foreground, border-border). Test all components in both themes.'
      },
      {
        category: 'Technical',
        risk: 'Accessibility regression from new components',
        severity: 'HIGH',
        probability: 'MEDIUM',
        impact: 'Keyboard navigation broken, screen reader incompatibility',
        mitigation: 'Test with keyboard-only navigation during development. Run WAVE checker after each component update. Use ARIA labels throughout.'
      },
      {
        category: 'Technical',
        risk: 'Unit test complexity (mocking Supabase + React Router)',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Time-consuming test setup, potential delays',
        mitigation: 'Use existing test utilities. Mock at service boundary. Focus on critical paths.'
      },
      {
        category: 'UX',
        risk: 'Inline intelligence card design may feel cluttered',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'User confusion, reduced wizard clarity',
        mitigation: 'Design cards to be collapsible (expand/collapse state). Use consistent spacing. Test with real users if possible.'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Parent SD (SD-VWC-OPPORTUNITY-BRIDGE-001) must remain 90% complete',
        impact: 'Cannot modify core opportunity fetching or adapter transformation logic'
      },
      {
        type: 'technical',
        constraint: 'All 16 existing E2E tests must continue passing',
        impact: 'Regression testing required, cannot break existing flows'
      },
      {
        type: 'technical',
        constraint: 'Zero new database tables allowed',
        impact: 'All features must use existing schema (opportunity_blueprints, ventures)'
      },
      {
        type: 'time',
        constraint: '24 hour target (3 working days)',
        impact: 'Must prioritize P1 (critical path) if time limited'
      }
    ],

    assumptions: [
      {
        assumption: 'Shadcn/ui components (Tooltip, Skeleton, Alert) already installed',
        validation_method: 'Verify package.json and components/ui/ directory'
      },
      {
        assumption: 'Vitest + React Testing Library configured for unit tests',
        validation_method: 'Run npm run test:unit and verify environment works'
      },
      {
        assumption: 'EHG app dev server accessible on port 8080',
        validation_method: 'Verify PORT=8080 npm run dev starts successfully'
      },
      {
        assumption: 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY set in .env',
        validation_method: 'Check .env file and verify environment variables load'
      }
    ],

    // Stakeholders
    stakeholders: [
      {
        name: 'LEAD Agent',
        role: 'Strategic Approval',
        involvement_level: 'high'
      },
      {
        name: 'PLAN Agent',
        role: 'Technical Planning',
        involvement_level: 'high'
      },
      {
        name: 'EXEC Agent',
        role: 'Implementation',
        involvement_level: 'high'
      },
      {
        name: 'QA Director',
        role: 'Testing & Validation',
        involvement_level: 'high'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days

    // Metadata
    metadata: {
      parent_sd_id: 'SD-VWC-OPPORTUNITY-BRIDGE-001',
      vision_alignment_before: '65%',
      vision_alignment_after: '90%',
      estimated_hours: 24,
      deliverables: [
        'P1.1: Security hardening (2h)',
        'P1.2: Inline intelligence cards (4h)',
        'P1.3: Disabled button tooltips (2h)',
        'P1.4: Dark mode - Dashboard (3h)',
        'P1.5: Dark mode - Wizard (3h)',
        'P2.1: Keyboard nav + ARIA (4h)',
        'P2.2: Loading skeletons (3h)',
        'P2.3: Unit tests (5h)',
        'P3.1: Entry C placeholder (1h)',
        'P3.2: Portfolio impact placeholder (1h)',
        'P3.3: Analytics expansion (2h)'
      ],
      components_modified: [
        'OpportunitySourcingDashboard.jsx (security + dark mode + skeletons)',
        'VentureCreationPage.tsx (inline cards + dark mode + placeholders)',
        'opportunityToVentureAdapter.ts (unit tests only)'
      ],
      components_created: [
        'IntelligenceSummaryCard.tsx (200-300 LOC)',
        'ThemeToggle.tsx (50-100 LOC)',
        'opportunityToVentureAdapter.test.ts (12 tests)',
        'OpportunitySourcingDashboard.test.jsx (7 tests)'
      ],
      database_changes: false,
      ui_changes: true,
      requires_server_restart: true,
      target_application: 'EHG'
    },

    // Audit Trail
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // -------------------------------------------------------------------------
  // STEP 3: Validate PRD Schema
  // -------------------------------------------------------------------------

  console.log('\n3️⃣  Validating PRD schema...');

  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.valid) {
    console.error('\n❌ PRD validation failed!');
    process.exit(1);
  }

  console.log('✅ PRD schema validation passed!');

  // -------------------------------------------------------------------------
  // STEP 4: Check for existing PRD
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
  // Success!
  // -------------------------------------------------------------------------

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD UUID: ${insertedPRD.sd_uuid}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);
  console.log(`   Functional Requirements: ${prdData.functional_requirements.length}`);
  console.log(`   Test Scenarios: ${prdData.test_scenarios.length}`);
  console.log(`   Risks: ${prdData.risks.length}`);
  console.log(`   Acceptance Criteria: ${prdData.acceptance_criteria.length}`);

  console.log('\n📝 Next Steps:');
  console.log('   1. ✅ PRD created with comprehensive details');
  console.log('   2. ⏳ STORIES sub-agent will auto-generate user stories');
  console.log('   3. ⏳ SECURITY sub-agent assessment (if needed)');
  console.log('   4. ⏳ Create PLAN→EXEC handoff when ready');
  console.log('');
}

// Execute
createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  console.error(error.stack);
  process.exit(1);
});
