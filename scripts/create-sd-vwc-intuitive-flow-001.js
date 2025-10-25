#!/usr/bin/env node

/**
 * Create SD-VWC-INTUITIVE-FLOW-001: Venture Wizard User Experience Completion
 *
 * This SD delivers an intuitive, dark-mode, accessible, and trustworthy wizard experience
 * that fulfills the full "browse-select-create" vision.
 *
 * Parent SD: SD-VWC-OPPORTUNITY-BRIDGE-001 (Browse Opportunities Integration)
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createStrategicDirective() {
  console.log('\n🚀 Creating SD-VWC-INTUITIVE-FLOW-001...\n');

  const strategicDirective = {
    // ========================================================================
    // REQUIRED FIELDS
    // ========================================================================

    id: 'SD-VWC-INTUITIVE-FLOW-001',
    title: 'Venture Wizard User Experience Completion',

    description: `Complete the "browse-select-create" user experience vision for the EHG Venture Wizard by delivering critical UX enhancements that transform the current 65% implementation into a 90% production-ready flow. This directive addresses the gap between functional implementation and intuitive user experience: while the browse-to-prefill pipeline works technically, users currently face modal interruptions (drawer-only intelligence), missing guidance (no tooltips), visual jarring (no dark mode/skeletons), and trust issues (hardcoded API keys). The completed wizard will provide a smooth, intentional flow where AI insights appear inline during the 5-step journey, disabled buttons explain themselves, loading states feel responsive, and the entire interface respects user accessibility preferences—achieving the vision where "AI gives me a head start, but I'm still in control."`,

    rationale: `The current Browse Opportunities implementation (SD-VWC-OPPORTUNITY-BRIDGE-001) delivered 90% of core functionality but left critical UX gaps that impact user perception of completeness and trust. Audit findings show: (1) Security issue - hardcoded API keys exposed in client bundle, (2) Intelligence insights only available via drawer modal - breaking wizard flow, (3) No dark mode support - 0% implementation, (4) Partial accessibility - 40% WCAG AA compliance, (5) Missing guidance - disabled buttons don't explain why. These gaps prevent production launch and create friction in the user journey. Addressing these issues aligns with the locked user-facing vision of providing "a smooth, intentional flow" where AI assistance feels integrated, not interruptive.`,

    scope: `**IN SCOPE:**
- P1: Security hardening (remove hardcoded Supabase keys), inline intelligence cards (embed STA/GCIA in Steps 2-3), disabled button tooltips, full dark mode implementation (dashboard + wizard)
- P2: Keyboard navigation + ARIA labels, loading skeletons, unit tests for adapter + dashboard
- P3: Completeness signals (Entry C placeholder, portfolio impact placeholder, expanded analytics)

**OUT OF SCOPE (Future SDs):**
- Portfolio Balance Engine (Entry C implementation) - requires portfolio coordination system
- Portfolio Impact Calculation (Step 5 real data) - requires portfolio analytics backend
- Dynamic ETA/Cost (research backend integration) - requires CrewAI deployment`,

    category: 'product_feature',
    priority: 'high',
    status: 'draft',

    // ========================================================================
    // STRATEGIC FIELDS
    // ========================================================================

    sd_key: 'SD-VWC-INTUITIVE-FLOW-001',
    target_application: 'EHG',
    current_phase: 'IDEATION',

    strategic_intent: `Transform the Browse Opportunities feature from functional-but-rough (65% vision) into production-ready (90% vision) by addressing UX polish gaps identified in comprehensive audit. Achieve "smooth, intentional flow" user experience where AI intelligence is inline (not modal-based), security is trustworthy (no exposed keys), visual design is polished (dark mode + skeletons), and accessibility is comprehensive (WCAG 2.1 AA compliant).`,

    strategic_objectives: [
      '**Security**: Remove 100% of hardcoded API keys from client-side code',
      '**Inline Intelligence**: Embed STA/GCIA summary cards in Steps 2-3 (0→100% inline presence)',
      '**Dark Mode**: Implement full dark mode support across dashboard + wizard (0→100% coverage)',
      '**Accessibility**: Achieve WCAG 2.1 AA compliance (current 40%→100% for keyboard nav + ARIA)',
      '**Guidance**: Add tooltips to 100% of disabled buttons (0→100% coverage)',
      '**Perceived Performance**: Replace 100% of spinners with skeleton loaders in critical paths',
      '**Test Coverage**: Achieve 100% unit test coverage for adapter + 80% for dashboard component',
      '**User Satisfaction**: Reduce "flow interruption" friction points from 5 to 0'
    ],

    success_criteria: [
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

    key_changes: [
      'Remove hardcoded Supabase API keys from OpportunitySourcingDashboard.jsx',
      'Create IntelligenceSummaryCard.tsx component (200-300 LOC)',
      'Add shadcn/ui Tooltip to disabled buttons in wizard + dashboard',
      'Implement dark mode classes across OpportunitySourcingDashboard + VentureCreationPage',
      'Add keyboard navigation (tabIndex, arrow keys, focus management)',
      'Add ARIA labels (aria-describedby, aria-live, aria-label)',
      'Replace spinners with shadcn/ui Skeleton components',
      'Create opportunityToVentureAdapter.test.ts (12 test cases)',
      'Create OpportunitySourcingDashboard.test.jsx (7 test cases)',
      'Add Entry (C) placeholder card to VentureCreationPage Step 1',
      'Add portfolio impact Alert to VentureCreationPage Step 5',
      'Expand analytics tracking to wizard/browse interactions'
    ],

    key_principles: [
      'Security-first: No API keys in client code, enforce env validation',
      'User-centric flow: Inline intelligence > modal interruptions',
      'Accessibility mandatory: WCAG 2.1 AA compliance non-negotiable',
      'Visual polish: Dark mode + loading skeletons for perceived performance',
      'Testing-first: Unit tests + E2E tests both required',
      'Honesty in UI: Use placeholders for missing features vs hiding them',
      'Database-first: Track all progress in EHG_Engineer database',
      'Evidence-based: Screenshots + test results required for handoffs'
    ],

    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    // ========================================================================
    // OPTIONAL FIELDS
    // ========================================================================

    uuid_id: randomUUID(),
    version: '1.0',
    phase_progress: 0,
    progress: 0,
    is_active: true,

    dependencies: [
      'Parent SD: SD-VWC-OPPORTUNITY-BRIDGE-001 must be 90% complete (already done)',
      'Supabase environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY must be set',
      'shadcn/ui components: Tooltip, Skeleton, Alert already installed',
      'EHG app dev server running on port 8080'
    ],

    risks: [
      {
        description: 'Dark mode color inconsistencies: Different components use different color tokens',
        mitigation: 'Use shadcn/ui theme tokens exclusively (bg-background, text-foreground, border-border)',
        severity: 'medium'
      },
      {
        description: 'Accessibility regression: New components break keyboard navigation or screen reader compatibility',
        mitigation: 'Test with keyboard-only navigation during development, run WAVE checker after each component update',
        severity: 'high'
      },
      {
        description: 'Unit test complexity: Mocking Supabase + React Router may be time-consuming',
        mitigation: 'Use existing test utilities, mock at service boundary, focus on critical paths',
        severity: 'low'
      },
      {
        description: 'Inline intelligence card design: Cards may not fit visually or feel cluttered',
        mitigation: 'Design cards to be collapsible (expand/collapse state), use consistent spacing',
        severity: 'medium'
      }
    ],

    success_metrics: [
      'Security audit: 0 hardcoded secrets (verified via static analysis)',
      'Test coverage: 100% adapter, 80% dashboard, 16/16 E2E tests passing',
      'Accessibility score: WAVE checker 0 critical errors, 0 serious errors',
      'Dark mode coverage: 100% of wizard + dashboard components',
      'Tooltip coverage: 100% of disabled buttons',
      'Performance: No layout shifts (CLS = 0), skeleton load time < 100ms',
      'User flow smoothness: 0 modal interruptions in wizard flow',
      'Visual consistency: All components use shadcn/ui design language',
      'Vision alignment score: 90% (up from 65%)'
    ],

    implementation_guidelines: [
      'P1 (Critical Path, 14 hours): Security → Inline intelligence → Tooltips → Dark mode',
      'P2 (Polish, 10 hours): Keyboard nav + ARIA → Loading skeletons → Unit tests',
      'P3 (Completeness, 4 hours): Entry C placeholder → Portfolio impact placeholder → Analytics',
      'Timeline: 24 hours total (3 working days)',
      'Test after each priority: Run E2E tests after P1, P2, P3 to catch regressions',
      'Dark mode validation: Use visual regression testing with screenshots',
      'Accessibility testing: Manual keyboard nav + WAVE checker + axe-core',
      'Component sizing: IntelligenceSummaryCard ~250 LOC (within 300-600 sweet spot)'
    ],

    metadata: {
      estimated_effort: '24 hours (3 days)',
      parent_sd_id: 'SD-VWC-OPPORTUNITY-BRIDGE-001',
      relationship_type: 'child',
      vision_alignment_before: '65%',
      vision_alignment_after: '90%',
      technical_requirements: [
        'shadcn/ui components (Tooltip, Skeleton, Alert)',
        'React Testing Library + Vitest (unit tests)',
        'Playwright (E2E tests)',
        'WAVE accessibility checker',
        'axe-core (automated a11y testing)'
      ],
      acceptance_testing_required: true,
      database_changes: false,
      ui_changes: true,
      requires_server_restart: true,
      target_files: [
        'OpportunitySourcingDashboard.jsx',
        'VentureCreationPage.tsx',
        'IntelligenceSummaryCard.tsx (new)',
        'opportunityToVentureAdapter.test.ts (new)',
        'OpportunitySourcingDashboard.test.jsx (new)'
      ],
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
      future_dependencies: [
        'Portfolio Balance Engine (SD-VWC-PORTFOLIO-BALANCE-001) - for Entry C implementation',
        'Dynamic Research Cost Estimation (SD-VWC-RESEARCH-BACKEND-001) - for ETA/cost',
        'Advanced Analytics & Insights (SD-VWC-ANALYTICS-001) - for funnel visualization'
      ]
    }
  };

  try {
    // Check if SD already exists
    const { data: existing, error: checkError } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', strategicDirective.id)
      .single();

    if (existing) {
      console.log(`⚠️  SD ${strategicDirective.id} already exists. Updating...`);

      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', strategicDirective.id)
        .select()
        .single();

      if (error) throw error;
      console.log(`✅ SD ${strategicDirective.id} updated successfully!`);
      return data;
    }

    // Create new SD
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(strategicDirective)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ SD ${strategicDirective.id} created successfully!`);
    console.log('\n📊 Strategic Directive Details:');
    console.log('='.repeat(70));
    console.log(`ID: ${data.id}`);
    console.log(`SD Key: ${data.sd_key}`);
    console.log(`Title: ${data.title}`);
    console.log(`Priority: ${data.priority}`);
    console.log(`Status: ${data.status}`);
    console.log(`Target Application: ${data.target_application}`);
    console.log(`Current Phase: ${data.current_phase}`);
    console.log(`Parent SD: SD-VWC-OPPORTUNITY-BRIDGE-001`);
    console.log(`Estimated Effort: 24 hours (3 days)`);
    console.log(`Vision Alignment: 65% → 90%`);
    console.log('='.repeat(70));

    console.log('\n📋 Next Steps (LEO Protocol will handle):');
    console.log('1. PRD creation via add-prd-to-database.js');
    console.log('2. User story generation via Product Requirements Expert');
    console.log('3. Handoff orchestration via unified-handoff-system.js');
    console.log('4. Sub-agent execution (QA, Security, Database, Design)');

    return data;

  } catch (error) {
    console.error(`\n❌ Error creating SD:`, error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createStrategicDirective()
    .then(() => {
      console.log('\n🎉 SD-VWC-INTUITIVE-FLOW-001 created successfully!');
      console.log('\n💡 Ready for LEAD phase validation.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Fatal error:', error);
      process.exit(1);
    });
}

export { createStrategicDirective };
