#!/usr/bin/env node

/**
 * Create Comprehensive PRD for SD-VWC-PHASE1-001
 * Phase 1: Critical UX Blockers & Tier 0 Activation
 *
 * Context: This SD was falsely marked 100% complete but is actually only ~18% complete
 * (1.5 of 11 user stories done). We reverted it to in_progress (20%) and now need to
 * properly implement it.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const SD_ID = 'SD-VWC-PHASE1-001';
const PRD_TITLE = 'Phase 1: Critical UX Blockers & Tier 0 Activation - Product Requirements';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(80));

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

  console.log('\n2️⃣  Building comprehensive PRD data...');

  const prdId = randomUUID();

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    id: prdId,
    sd_uuid: sdData.uuid_id,
    directive_id: SD_ID,

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',
    category: 'User Experience',
    priority: 'high',

    // Executive & Context
    executive_summary: `
This PRD addresses the false completion issue of SD-VWC-PHASE1-001, which was incorrectly marked 100% complete when only ~18% was actually done (1.5 of 11 user stories).

**Current State**:
- 1 user story complete: Tier 0 button exists (lines 747-761)
- 0.5 user stories partial: TierGraduationModal component exists but never opens, keyboard navigation hook exists but minimal integration
- 9.5 user stories missing: Stage gating, IntelligenceDrawer embedding, GCIA cache/ETA/cost UI, LLM cost extraction, executeWithRetry wrapper, full keyboard nav, i18n wrapping, activity logging

**Impact**: Users attempting Tier 0 ventures will encounter:
- No stage cap enforcement (can progress beyond Stage 3)
- Missing tier graduation UI (modal exists but never triggers)
- IntelligenceDrawer not embedded in wizard Steps 2-3
- No GCIA cache age visibility or fresh scan option
- No cost/ETA transparency before GCIA execution
- Incomplete keyboard navigation
- No internationalization support
- Incomplete activity tracking

**Business Context**: This blocks Tier 0 venture adoption and creates false expectations about feature completeness. Estimated 16-24 hours implementation to complete all 11 user stories.
    `.trim(),

    business_context: `
**Problem Statement**:
The Venture Creation Wizard (VentureCreationPage.tsx, 1,183 LOC) has foundational infrastructure for Tier 0 ventures but critical UX blockers prevent real-world usage:

1. **Stage Gating Missing**: No enforcement preventing Tier 0 ventures from progressing beyond Stage 3
2. **Modal Never Opens**: TierGraduationModal (160 LOC) exists but lacks trigger logic
3. **Intelligence Not Embedded**: IntelligenceDrawer (452 LOC, 5 tabs) opens separately instead of being embedded in Steps 2-3
4. **No Cache Visibility**: Users can't see GCIA scan age or request fresh scans
5. **Cost Opacity**: No ETA or cost display before triggering expensive GCIA operations
6. **No i18n Support**: All UI text is hardcoded (0 instances of t())

**User Impact**:
- Tier 0 users face unexpected costs from outdated/unnecessary GCIA scans
- No keyboard accessibility for power users
- Stage progression violations create data integrity issues
- Missing internationalization prevents global expansion

**Business Value**:
- Unlock Tier 0 adoption for cost-sensitive early-stage ventures
- Reduce GCIA API costs through cache awareness
- Enable keyboard-first workflows (15-20% faster for power users)
- Support i18n for future market expansion
    `.trim(),

    technical_context: `
**Existing Infrastructure**:
- Main wizard: /mnt/c/_EHG/ehg/src/components/ventures/VentureCreationPage.tsx (1,183 LOC)
- IntelligenceDrawer: /mnt/c/_EHG/ehg/src/components/ventures/IntelligenceDrawer.tsx (452 LOC, 5 tabs)
- TierGraduationModal: /mnt/c/_EHG/ehg/src/components/ventures/TierGraduationModal.tsx (160 LOC)
- Tier 0 button: VentureCreationPage.tsx lines 747-761 (COMPLETE)
- useKeyboardNav hook: Exists but minimal integration
- wizardAnalytics: Existing activity logging infrastructure
- GCIA integration: Functional via intelligenceAgents but missing UI controls

**Technology Stack**:
- Frontend: React 18, TypeScript, Vite, Shadcn UI
- State Management: React Context API
- Database: Supabase PostgreSQL
- i18n: react-i18next (to be integrated)
- Activity Logging: wizardAnalytics via activity_logs table

**Gaps Identified**:
1. No DB trigger to enforce Stage 3 cap for Tier 0
2. TierGraduationModal has no trigger condition
3. IntelligenceDrawer opens in modal/drawer instead of embedded
4. No GCIA cache age display
5. No cost/ETA calculation before GCIA execution
6. No executeWithRetry wrapper for async ops
7. Keyboard nav hook exists but not integrated into all components
8. Zero i18n coverage (0 t() calls)
9. Incomplete wizardAnalytics tracking
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Tier 0 Stage Gating Enforcement',
        description: 'Prevent Tier 0 ventures from progressing beyond Stage 3 through database trigger and UI validation',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Database trigger prevents ventures.current_stage > 3 when tier = 0',
          'UI displays "Tier 0 limited to Stage 3" message when attempting progression',
          'TierGraduationModal opens automatically when user attempts Stage 4+ progression',
          'Modal shows "≥85% re-validation required" tooltip explaining tier upgrade requirement'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'TierGraduationModal Activation',
        description: 'Display TierGraduationModal when Tier 0 users attempt to exceed Stage 3 cap',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Modal component exists (COMPLETE: 160 LOC)',
          'Modal opens when Tier 0 venture attempts Stage 4+ progression',
          'Modal displays tier upgrade options (Tier 1/2/3)',
          'Modal shows validation requirements for each tier',
          'Tooltip explains "≥85% re-validation required" for tier upgrade',
          'Modal allows user to upgrade tier or cancel progression'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'IntelligenceDrawer Embedding',
        description: 'Embed IntelligenceDrawer into wizard Steps 2-3 instead of separate modal/drawer',
        priority: 'HIGH',
        acceptance_criteria: [
          'IntelligenceDrawer renders inline in Step 2 (Business Model)',
          'IntelligenceDrawer renders inline in Step 3 (Market Research)',
          'All 5 tabs accessible: Overview, Market, Competitors, Risks, Metrics',
          'Drawer state persists during wizard navigation',
          'No modal/drawer overlay - seamless inline integration',
          'Responsive layout maintains usability on mobile/tablet'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'GCIA Cache Age Display & Fresh Scan',
        description: 'Show GCIA scan cache age and provide "Request fresh scan" button',
        priority: 'HIGH',
        acceptance_criteria: [
          'Display cache age when GCIA results exist (e.g., "Last scan: 3 days ago")',
          '"Request fresh scan" button visible when cache exists',
          'Button disabled if last scan < 24 hours (with tooltip explaining)',
          'Button triggers new GCIA scan when clicked',
          'Loading state shown during fresh scan execution',
          'Cache age updates after fresh scan completes'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'GCIA Cost & ETA Transparency',
        description: 'Display estimated cost and time before executing GCIA scan',
        priority: 'HIGH',
        acceptance_criteria: [
          'Show ETA (e.g., "~5-8 minutes") before scan execution',
          'Show estimated cost (e.g., "$0.15 - $0.30") before scan execution',
          'Warning displayed if cost estimate exceeds $0.50',
          'User must confirm cost/ETA before scan proceeds',
          'Confirmation modal includes "Don\'t show again" checkbox',
          'Actual cost/time logged to activity_logs after scan'
        ]
      },
      {
        id: 'FR-6',
        requirement: 'LLM Cost/Token Data Extraction',
        description: 'Extract real LLM cost and token usage from intelligenceAgents responses',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Parse intelligenceAgents response metadata for cost/token data',
          'Store cost data: {prompt_tokens, completion_tokens, total_cost}',
          'Display cost breakdown in IntelligenceDrawer Overview tab',
          'Track cumulative cost across multiple GCIA scans',
          'Export cost data to activity_logs for reporting',
          'Handle missing cost data gracefully (show "N/A")'
        ]
      },
      {
        id: 'FR-7',
        requirement: 'executeWithRetry Wrapper',
        description: 'Implement retry wrapper for async operations (GCIA, API calls)',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'executeWithRetry(fn, options) function created',
          'Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)',
          'Retry on network errors, 5xx responses, timeouts',
          'Do NOT retry on 4xx client errors',
          'Error logging for each retry attempt',
          'Final error thrown after max retries exceeded',
          'Applied to all GCIA and external API calls'
        ]
      },
      {
        id: 'FR-8',
        requirement: 'Comprehensive Keyboard Navigation',
        description: 'Full keyboard accessibility (Tab, Enter, Escape) for all wizard interactions',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Tab navigates through all form fields and buttons',
          'Enter submits forms and activates focused buttons',
          'Escape closes modals and cancels operations',
          'Shift+Tab navigates backwards',
          'Arrow keys navigate within tier selection and tabs',
          'Visual focus indicators on all interactive elements',
          'Skip to main content link for screen reader users',
          'Keyboard shortcuts documented in help modal'
        ]
      },
      {
        id: 'FR-9',
        requirement: 'Internationalization (i18n) Preparation',
        description: 'Wrap all UI text in t() for future translation support',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'react-i18next integrated into project',
          'All UI strings in VentureCreationPage.tsx wrapped in t()',
          'All UI strings in IntelligenceDrawer.tsx wrapped in t()',
          'All UI strings in TierGraduationModal.tsx wrapped in t()',
          'Translation keys follow namespace pattern: ventureWizard.stepX.label',
          'English locale file created as baseline (en.json)',
          'i18n initialized in app entry point',
          'Language switcher placeholder added (non-functional in Phase 1)'
        ]
      },
      {
        id: 'FR-10',
        requirement: 'Activity Logging Integration',
        description: 'Track all wizard interactions via existing activity_logs table',
        priority: 'LOW',
        acceptance_criteria: [
          'wizardAnalytics.trackStepChange() called on step transitions',
          'wizardAnalytics.trackTierSelection() called on tier changes',
          'wizardAnalytics.trackGCIAScan() called on GCIA execution',
          'wizardAnalytics.trackModalOpen() called for all modal interactions',
          'All logs include: user_id, venture_id, timestamp, action, metadata',
          'Logs queryable via activity_logs table',
          'No PII stored in activity logs (GDPR compliance)'
        ]
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Database Trigger for Tier 0 Stage Cap',
        description: 'Create PostgreSQL trigger to enforce Stage 3 cap for Tier 0 ventures',
        dependencies: ['ventures table', 'PostgreSQL trigger functions'],
        implementation_notes: `
CREATE OR REPLACE FUNCTION enforce_tier_stage_cap()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tier = 0 AND NEW.current_stage > 3 THEN
    RAISE EXCEPTION 'Tier 0 ventures cannot progress beyond Stage 3. Upgrade tier to continue.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tier_stage_cap_enforcement
  BEFORE INSERT OR UPDATE ON ventures
  FOR EACH ROW
  EXECUTE FUNCTION enforce_tier_stage_cap();
        `
      },
      {
        id: 'TR-2',
        requirement: 'IntelligenceDrawer Inline Rendering',
        description: 'Refactor IntelligenceDrawer to support inline rendering in wizard steps',
        dependencies: ['IntelligenceDrawer.tsx', 'VentureCreationPage.tsx'],
        implementation_notes: `
Add renderMode prop to IntelligenceDrawer:
- renderMode: 'modal' | 'drawer' | 'inline'
- Default: 'inline' for Steps 2-3
- Conditional rendering based on mode
- State management via React Context to persist across steps
        `
      },
      {
        id: 'TR-3',
        requirement: 'GCIA Cache Metadata Storage',
        description: 'Store GCIA scan metadata for cache age calculation',
        dependencies: ['ventures table or new gcia_scans table'],
        implementation_notes: `
Option A: Add to ventures table:
- last_gcia_scan_at: TIMESTAMP
- gcia_scan_count: INTEGER

Option B: Create gcia_scans table:
- id, venture_id, scanned_at, cost, tokens, status
- Enables detailed scan history tracking
        `
      },
      {
        id: 'TR-4',
        requirement: 'Cost Estimation Function',
        description: 'Calculate GCIA cost estimate based on venture complexity',
        dependencies: ['intelligenceAgents API', 'OpenAI pricing data'],
        implementation_notes: `
Factors:
- Venture description length (~500 chars = baseline)
- Number of competitors to analyze (3-5 typical)
- Market research depth (Tier 0: shallow, Tier 3: deep)
Baseline cost: $0.15-$0.30 for Tier 0, $0.50-$1.50 for Tier 3
        `
      },
      {
        id: 'TR-5',
        requirement: 'react-i18next Integration',
        description: 'Setup i18n infrastructure with react-i18next',
        dependencies: ['react-i18next', 'i18next'],
        implementation_notes: `
Install: npm install react-i18next i18next
Config: /src/i18n/config.ts
Locales: /src/i18n/locales/en.json
Provider: Wrap app in I18nextProvider
Usage: const { t } = useTranslation('ventureWizard');
        `
      }
    ],

    ui_ux_requirements: [
      {
        component: 'VentureCreationPage.tsx',
        description: 'Main wizard orchestration - add TierGraduationModal trigger, IntelligenceDrawer embedding',
        wireframe: 'Existing component (1,183 LOC), add ~150-200 LOC for new features',
        changes: [
          'Add TierGraduationModal trigger on Stage 4+ attempt',
          'Embed IntelligenceDrawer in Steps 2-3',
          'Add GCIA cache age display',
          'Add cost/ETA confirmation modal',
          'Wrap all UI text in t()',
          'Integrate full keyboard navigation'
        ]
      },
      {
        component: 'IntelligenceDrawer.tsx',
        description: 'Intelligence results display - add inline rendering mode, cost breakdown',
        wireframe: 'Existing component (452 LOC), add ~50-80 LOC for new features',
        changes: [
          'Add renderMode prop (modal/drawer/inline)',
          'Add cost breakdown in Overview tab',
          'Add "Request fresh scan" button',
          'Display cache age',
          'Wrap all UI text in t()'
        ]
      },
      {
        component: 'TierGraduationModal.tsx',
        description: 'Tier upgrade modal - add trigger logic',
        wireframe: 'Existing component (160 LOC), add ~30-50 LOC for trigger',
        changes: [
          'Add opening condition: tier=0 AND stage>=4',
          'Add tooltip: "≥85% re-validation required"',
          'Wrap all UI text in t()'
        ]
      },
      {
        component: 'GCIACostConfirmationModal.tsx',
        description: 'New component for cost/ETA confirmation',
        wireframe: 'New component (~120 LOC)',
        features: [
          'Display ETA range (e.g., "5-8 minutes")',
          'Display cost estimate (e.g., "$0.15-$0.30")',
          'Warning for costs >$0.50',
          'Confirm/Cancel buttons',
          '"Don\'t show again" checkbox',
          'Fully keyboard accessible',
          'i18n wrapped text'
        ]
      }
    ],

    implementation_approach: `
## Phase 1: Database & Backend (4-6 hours)

### Step 1: Database Changes
- Create PostgreSQL trigger for Tier 0 stage cap (TR-1)
- Add GCIA cache metadata to ventures table or create gcia_scans table (TR-3)
- Test trigger with manual INSERT/UPDATE statements
- Verify RLS policies don't interfere

### Step 2: Cost Estimation Logic
- Implement GCIA cost estimation function (TR-4)
- Calculate ETA based on venture complexity
- Store cost/ETA metadata structure
- Unit test cost calculations

## Phase 2: Intelligence & Component Integration (6-8 hours)

### Step 3: IntelligenceDrawer Refactor
- Add renderMode prop: 'modal' | 'drawer' | 'inline' (TR-2)
- Implement inline rendering for Steps 2-3 (FR-3)
- Add cost breakdown display in Overview tab (FR-6)
- Add "Request fresh scan" button (FR-4)
- Display cache age (FR-4)
- Test all 5 tabs in inline mode

### Step 4: TierGraduationModal Trigger
- Add opening condition: tier=0 AND stage>=4 attempt (FR-2)
- Connect to stage progression logic
- Add "≥85% re-validation required" tooltip
- Test upgrade flow from Tier 0 to Tier 1/2/3

### Step 5: GCIACostConfirmationModal
- Create new component (120 LOC) (FR-5)
- Integrate cost/ETA display
- Add warning for >$0.50 estimates
- Implement "Don't show again" preference storage
- Test confirmation → GCIA execution flow

## Phase 3: UX Enhancements (4-6 hours)

### Step 6: Keyboard Navigation
- Integrate useKeyboardNav hook fully (FR-8)
- Add Tab/Enter/Escape handlers to all components
- Add visual focus indicators
- Test with keyboard-only navigation
- Add keyboard shortcuts help modal

### Step 7: executeWithRetry Wrapper
- Implement retry logic with exponential backoff (FR-7)
- Apply to GCIA calls
- Apply to external API calls
- Add error logging
- Test retry behavior with simulated failures

### Step 8: Activity Logging
- Integrate wizardAnalytics tracking (FR-10)
- Add trackStepChange, trackTierSelection, trackGCIAScan calls
- Test log entries in activity_logs table
- Verify no PII in logs

## Phase 4: Internationalization & Testing (2-4 hours)

### Step 9: i18n Integration
- Install react-i18next (TR-5)
- Create en.json locale file (FR-9)
- Wrap all UI text in t() across 3 components
- Setup I18nextProvider
- Test language switching (with placeholder switcher)

### Step 10: Testing & Validation
- Unit tests for cost estimation
- Unit tests for executeWithRetry
- E2E test: Tier 0 stage cap enforcement
- E2E test: TierGraduationModal trigger
- E2E test: IntelligenceDrawer inline rendering
- E2E test: GCIA cost confirmation flow
- E2E test: Keyboard navigation
- Accessibility audit (WCAG 2.1 AA)

**Total Estimated Time**: 16-24 hours
    `.trim(),

    technology_stack: [
      'React 18',
      'TypeScript 5',
      'Vite',
      'Shadcn UI',
      'Supabase PostgreSQL',
      'react-i18next',
      'i18next',
      'wizardAnalytics (existing)'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'VentureCreationPage.tsx',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'IntelligenceDrawer.tsx',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'TierGraduationModal.tsx',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'useKeyboardNav hook',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'wizardAnalytics',
        status: 'completed',
        blocker: false
      },
      {
        type: 'external',
        name: 'react-i18next',
        status: 'blocked',
        blocker: true,
        notes: 'Must install before i18n work'
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Tier 0 Stage Cap Enforcement',
        description: 'Attempt to progress Tier 0 venture beyond Stage 3',
        expected_result: 'Database trigger blocks progression, TierGraduationModal opens',
        test_type: 'e2e'
      },
      {
        id: 'TS-2',
        scenario: 'TierGraduationModal Opens',
        description: 'User on Tier 0 attempts Stage 4+ progression',
        expected_result: 'Modal displays with tier upgrade options and validation requirements',
        test_type: 'e2e'
      },
      {
        id: 'TS-3',
        scenario: 'IntelligenceDrawer Inline Rendering',
        description: 'Navigate to Step 2 and Step 3 in wizard',
        expected_result: 'IntelligenceDrawer renders inline, all 5 tabs accessible',
        test_type: 'e2e'
      },
      {
        id: 'TS-4',
        scenario: 'GCIA Cache Age Display',
        description: 'View venture with existing GCIA scan',
        expected_result: 'Cache age displayed (e.g., "Last scan: 3 days ago"), fresh scan button visible',
        test_type: 'e2e'
      },
      {
        id: 'TS-5',
        scenario: 'GCIA Cost Confirmation',
        description: 'Request GCIA scan without previous scan',
        expected_result: 'Confirmation modal shows ETA and cost, requires confirmation',
        test_type: 'e2e'
      },
      {
        id: 'TS-6',
        scenario: 'Cost Data Extraction',
        description: 'Complete GCIA scan and view results',
        expected_result: 'Cost breakdown displayed in Overview tab with token counts',
        test_type: 'integration'
      },
      {
        id: 'TS-7',
        scenario: 'executeWithRetry Wrapper',
        description: 'Simulate GCIA API failure',
        expected_result: '3 retry attempts with exponential backoff, final error after retries exhausted',
        test_type: 'unit'
      },
      {
        id: 'TS-8',
        scenario: 'Keyboard Navigation',
        description: 'Navigate wizard using only keyboard (Tab, Enter, Escape)',
        expected_result: 'All interactions accessible, visual focus indicators present',
        test_type: 'e2e'
      },
      {
        id: 'TS-9',
        scenario: 'i18n Text Wrapping',
        description: 'Check all UI text in 3 main components',
        expected_result: 'All text wrapped in t(), en.json locale file complete',
        test_type: 'unit'
      },
      {
        id: 'TS-10',
        scenario: 'Activity Logging',
        description: 'Perform wizard interactions and check activity_logs',
        expected_result: 'All interactions logged with correct metadata, no PII',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'All 11 user stories implemented and verified',
      'Tier 0 stage cap enforced via database trigger',
      'TierGraduationModal opens when Tier 0 user attempts Stage 4+',
      'IntelligenceDrawer embedded inline in Steps 2-3',
      'GCIA cache age displayed with fresh scan option',
      'Cost/ETA confirmation modal shown before GCIA execution',
      'LLM cost/token data extracted and displayed',
      'executeWithRetry wrapper applied to all async operations',
      'Full keyboard navigation implemented (Tab, Enter, Escape)',
      'All UI text wrapped in t() for i18n',
      'Activity logging tracking all wizard interactions',
      'All E2E tests passing (TS-1 through TS-10)',
      'Accessibility audit passes WCAG 2.1 AA',
      'No regression on existing Tier 1/2/3 functionality'
    ],

    performance_requirements: {
      page_load_time: '<2s for wizard page load',
      interaction_response: '<100ms for all UI interactions',
      gcia_execution: '5-8 minutes (existing performance, no change)',
      cost_calculation: '<50ms for cost/ETA estimation'
    },

    risks: [
      {
        category: 'Technical',
        risk: 'Database trigger may conflict with existing RLS policies',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Tier 0 stage cap not enforced',
        mitigation: 'Test trigger thoroughly with RLS enabled, verify error messages propagate to UI'
      },
      {
        category: 'UX',
        risk: 'IntelligenceDrawer inline rendering may not fit mobile viewport',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Poor mobile UX in Steps 2-3',
        mitigation: 'Responsive design with collapsible drawer on mobile, fallback to modal on small screens'
      },
      {
        category: 'Integration',
        risk: 'GCIA cost estimation may be inaccurate',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'Users surprised by actual costs',
        mitigation: 'Use conservative estimates (high end of range), track actual vs estimated for refinement'
      },
      {
        category: 'Scope',
        risk: 'i18n wrapping all text may take longer than estimated',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: '2-4 hours additional time',
        mitigation: 'Prioritize critical user-facing strings first, defer internal debugging strings if needed'
      },
      {
        category: 'Testing',
        risk: 'E2E tests for modal triggers may be flaky',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'Test failures block PR approval',
        mitigation: 'Use waitFor() and proper selectors, add retry logic to E2E tests'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must maintain backward compatibility with existing Tier 1/2/3 workflows',
        impact: 'Cannot refactor shared components in breaking ways'
      },
      {
        type: 'UX',
        constraint: 'IntelligenceDrawer must remain fully functional in modal mode for other features',
        impact: 'renderMode prop must be backward compatible with default modal behavior'
      },
      {
        type: 'cost',
        constraint: 'GCIA cost estimation must be conservative (better to overestimate)',
        impact: 'May deter some users if estimates are too high, but prevents cost surprises'
      }
    ],

    assumptions: [
      {
        assumption: 'ventures table has sufficient columns for GCIA cache metadata',
        validation_method: 'Schema review before implementation'
      },
      {
        assumption: 'intelligenceAgents API returns cost/token metadata in responses',
        validation_method: 'Test GCIA call and inspect response structure'
      },
      {
        assumption: 'react-i18next is compatible with existing build setup',
        validation_method: 'Install and test with simple t() call before full integration'
      }
    ],

    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning & PRD Creation',
        involvement_level: 'high'
      },
      {
        name: 'EXEC Agent',
        role: 'Implementation',
        involvement_level: 'high'
      },
      {
        name: 'QA Director',
        role: 'Testing Strategy & E2E Coverage',
        involvement_level: 'medium'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week

    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'All 11 user stories mapped to functional requirements', checked: false },
      { text: 'Technical requirements documented (5 items)', checked: false },
      { text: 'Database trigger design reviewed', checked: false },
      { text: 'IntelligenceDrawer refactor approach approved', checked: false },
      { text: 'Cost estimation algorithm designed', checked: false },
      { text: 'Test scenarios defined (10 items)', checked: false },
      { text: 'Acceptance criteria established (14 items)', checked: false },
      { text: 'Risk assessment completed (5 risks)', checked: false },
      { text: 'STORIES sub-agent generates user story contexts', checked: false }
    ],

    exec_checklist: [
      { text: 'Database trigger created and tested', checked: false },
      { text: 'GCIA cache metadata storage implemented', checked: false },
      { text: 'IntelligenceDrawer inline rendering mode added', checked: false },
      { text: 'TierGraduationModal trigger logic implemented', checked: false },
      { text: 'GCIACostConfirmationModal component created', checked: false },
      { text: 'Cost estimation function implemented', checked: false },
      { text: 'executeWithRetry wrapper implemented', checked: false },
      { text: 'Keyboard navigation fully integrated', checked: false },
      { text: 'react-i18next integrated and all text wrapped', checked: false },
      { text: 'Activity logging tracking added', checked: false },
      { text: 'Unit tests written and passing', checked: false },
      { text: 'E2E tests written and passing (10 scenarios)', checked: false },
      { text: 'Accessibility audit completed', checked: false },
      { text: 'Code review completed', checked: false }
    ],

    validation_checklist: [
      { text: 'All 11 user stories verified complete', checked: false },
      { text: 'Tier 0 stage cap enforcement validated', checked: false },
      { text: 'TierGraduationModal trigger tested', checked: false },
      { text: 'IntelligenceDrawer inline mode tested on mobile/desktop', checked: false },
      { text: 'GCIA cache age display verified', checked: false },
      { text: 'Cost/ETA confirmation flow tested', checked: false },
      { text: 'LLM cost extraction verified with real GCIA call', checked: false },
      { text: 'executeWithRetry wrapper tested with failures', checked: false },
      { text: 'Keyboard navigation tested (keyboard-only user)', checked: false },
      { text: 'i18n coverage verified (all text wrapped)', checked: false },
      { text: 'Activity logs verified in database', checked: false },
      { text: 'Performance requirements met', checked: false },
      { text: 'No regression on Tier 1/2/3 workflows', checked: false },
      { text: 'WCAG 2.1 AA compliance verified', checked: false }
    ],

    progress: 10,
    phase: 'planning',
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 10,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    metadata: {
      false_completion_context: {
        original_progress: 100,
        actual_progress: 18,
        user_stories_complete: 1.5,
        user_stories_total: 11,
        reverted_to: 20,
        reason: 'SD falsely marked complete when only Tier 0 button was implemented (1 of 11 stories)'
      },
      estimated_effort_hours: {
        database_backend: 5,
        intelligence_integration: 7,
        ux_enhancements: 5,
        i18n_testing: 3,
        total: 20
      },
      component_changes: [
        { file: 'VentureCreationPage.tsx', lines_existing: 1183, lines_added: 180, lines_modified: 50 },
        { file: 'IntelligenceDrawer.tsx', lines_existing: 452, lines_added: 70, lines_modified: 30 },
        { file: 'TierGraduationModal.tsx', lines_existing: 160, lines_added: 40, lines_modified: 20 },
        { file: 'GCIACostConfirmationModal.tsx', lines_existing: 0, lines_added: 120, lines_modified: 0 }
      ]
    },

    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // -------------------------------------------------------------------------
  // STEP 3: Check if PRD already exists
  // -------------------------------------------------------------------------

  console.log('\n3️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status, created_at')
    .eq('directive_id', SD_ID)
    .maybeSingle();

  if (existing) {
    console.warn(`⚠️  PRD for ${SD_ID} already exists!`);
    console.log(`   ID: ${existing.id}`);
    console.log(`   Created: ${existing.created_at}`);
    console.log(`   Status: ${existing.status}`);
    console.log('\n   Options:');
    console.log('   1. Delete the existing PRD first');
    console.log('   2. Use an UPDATE script instead');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 4: Insert PRD into database
  // -------------------------------------------------------------------------

  console.log('\n4️⃣  Inserting PRD into database...');

  const { data: insertedPRD, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (insertError) {
    console.error('❌ Failed to insert PRD:', insertError.message);
    console.error('   Code:', insertError.code);
    console.error('   Details:', insertError.details);
    console.error('   Hint:', insertError.hint);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 5: Success!
  // -------------------------------------------------------------------------

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(80));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD UUID: ${insertedPRD.sd_uuid}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Phase: ${insertedPRD.phase}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);
  console.log('');
  console.log('📊 PRD Summary:');
  console.log(`   Functional Requirements: ${prdData.functional_requirements.length}`);
  console.log(`   Technical Requirements: ${prdData.technical_requirements.length}`);
  console.log(`   Test Scenarios: ${prdData.test_scenarios.length}`);
  console.log(`   Acceptance Criteria: ${prdData.acceptance_criteria.length}`);
  console.log(`   Risks: ${prdData.risks.length}`);
  console.log('');
  console.log('⚠️  False Completion Context:');
  console.log(`   Original Progress: ${prdData.metadata.false_completion_context.original_progress}%`);
  console.log(`   Actual Progress: ${prdData.metadata.false_completion_context.actual_progress}%`);
  console.log(`   User Stories Complete: ${prdData.metadata.false_completion_context.user_stories_complete} / ${prdData.metadata.false_completion_context.user_stories_total}`);
  console.log('');
  console.log('📝 Next Steps:');
  console.log('   1. Review PRD in EHG_Engineer dashboard');
  console.log('   2. Run STORIES sub-agent to generate implementation contexts');
  console.log('   3. Create PLAN→EXEC handoff when ready');
  console.log('   4. Begin implementation in /mnt/c/_EHG/ehg/');
  console.log('');
  console.log('='.repeat(80));
}

createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  console.error(error.stack);
  process.exit(1);
});
