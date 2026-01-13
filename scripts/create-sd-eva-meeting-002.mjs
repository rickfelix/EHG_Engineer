#!/usr/bin/env node

/**
 * CREATE SD-EVA-MEETING-002
 *
 * Strategic Directive: EVA Meeting Interface - Production Visual Polish & Design Refinement
 *
 * Context: SD-EVA-MEETING-001 delivered functional MVP with all requirements met.
 * This SD addresses Phase 2 visual enhancements to match production design mockup.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('\n🎨 CREATING SD-EVA-MEETING-002: Production Visual Polish');
console.log('═'.repeat(70));

const sd = {
  id: 'SD-EVA-MEETING-002',
  sd_key: 'SD-EVA-MEETING-002', // Required NOT NULL field
  title: 'EVA Meeting Interface - Production Visual Polish & Design Refinement',
  version: '1.0',
  status: 'draft', // LEAD will approve
  category: 'EVA Assistant',
  priority: 'high', // Visual gap blocks production readiness
  target_application: 'EHG',
  current_phase: 'IDEATION',

  description: `Phase 2 visual design refinement of EVA Meeting Interface to match production design mockup. Builds on completed SD-EVA-MEETING-001 functional foundation (6 user stories validated, 12/12 E2E tests passing, 84.7% component reuse).

Transforms light blue gradient MVP into professional dark navy theme with:
- Complete color scheme overhaul (dark navy #1a2332 background)
- Professional avatar integration (business-attired AI presenter)
- Custom dashboard metrics layout (Venture Performance, Cost Savings $25K, Revenue charts, Active Ventures count, Investment Allocation pie chart)
- Top navigation bar (title, "Live Analysis Mode" subtitle, mic/camera controls, "End Session" button)
- Real-time waveform visualization (Canvas API, 60fps animation)
- Refined control bar layout (waveform + transcript toggle + link)
- Typography and spacing polish (production-ready appearance)

NOTE: This is Phase 2 enhancement, NOT a bug fix. SD-EVA-MEETING-001 explicitly deferred these features in implementation notes (lines 239-243): "Phase 2 Enhancements (Deferred): Advanced waveform animation (60fps Canvas API), EVA avatar video/animation, Advanced glow effects, Performance optimization"`,

  strategic_intent: 'Elevate EVA Meeting Interface from functional MVP to production-ready visual design matching professional video conferencing standards (Zoom, Teams, Google Meet quality)',

  rationale: `SD-EVA-MEETING-001 successfully delivered functional requirements:
✅ All 6 user stories validated via E2E tests
✅ 84.7% component reuse (exceeded 70% target)
✅ <2s page load time
✅ WCAG 2.1 AA accessibility compliance
✅ All PRD acceptance criteria met

However, visual design gaps prevent production deployment:
1. **Light Theme Mismatch**: Current light blue gradient doesn't match enterprise dark navy mockup
2. **Placeholder Avatar**: Gradient circle with "EVA" text lacks professional AI presenter feel
3. **Generic Dashboard**: EVAOrchestrationDashboard component doesn't show specific metrics from mockup (Cost Savings $25K, Revenue bars, Investment Allocation 50%/30%)
4. **Missing Top Nav**: No navigation bar with mode display ("Live Analysis Mode") or session controls
5. **Placeholder Waveform**: Static div text instead of real Canvas API audio visualization
6. **Production Polish Gap**: Spacing, typography, and cohesive dark theme need refinement

Market Context:
- Professional AI assistants (ChatGPT Enterprise, Claude for Work, Gemini Advanced) set high visual quality bar
- Video conferencing tools (Zoom, Teams, Meet) establish dark theme + professional UI expectations
- EHG targets enterprise clients who expect production-quality interfaces
- Current MVP appearance may reduce user confidence in AI capabilities

This SD addresses visual gaps to match industry standards and client expectations.`,

  scope: JSON.stringify({
    in_scope: [
      'Dark navy theme implementation (#1a2332 background, consistent color palette)',
      'Professional avatar integration (stock image or AI-generated, business attire)',
      'Custom dashboard metrics layout (Venture Performance chart, Cost Savings card, Revenue bars, Active Ventures count, Investment Allocation pie chart, Quarterly trend, Growth indicator)',
      'Top navigation bar component (~150 LOC: title, "Live Analysis Mode" subtitle, mic icon, camera icon, "End Session" button)',
      'Real-time waveform visualization (~200 LOC: Canvas API, 60fps animation, audio sync)',
      'Control bar refinement (waveform left, transcript toggle center, "Transcript >" link right)',
      'Typography polish (font weights, sizes, line heights)',
      'Spacing refinement (tighter gaps, optimized padding)',
      'Production-ready visual consistency across all panels'
    ],
    out_of_scope: [
      'Functional changes (all features working from SD-001)',
      'New features beyond visual design mockup',
      'Backend/database schema changes',
      'Performance optimization beyond maintaining <2s load',
      'Additional user stories beyond visual refinement',
      'Third-party integrations or API changes'
    ]
  }),

  key_changes: [],

  strategic_objectives: [
    'Match production design mockup screenshot (95%+ visual similarity)',
    'Implement cohesive dark navy theme across all panels and components',
    'Integrate professional avatar to establish AI presenter credibility',
    'Display specific dashboard metrics from mockup (Cost Savings, Revenue, Ventures, Investment Allocation)',
    'Create top navigation bar with mode indicator and session controls',
    'Implement real-time audio waveform visualization at 60fps',
    'Refine typography and spacing for professional polish',
    'Maintain performance (<2s load, 60fps animations) and accessibility (WCAG 2.1 AA)',
    'Preserve all existing functionality from SD-EVA-MEETING-001 (no regressions)'
  ],

  success_criteria: [
    'Visual design matches screenshot mockup (95%+ similarity verified by PLAN supervisor)',
    'Dark navy theme (#1a2332 or similar) consistent across all panels',
    'Professional avatar displays correctly (business attire, professional appearance)',
    'Custom dashboard shows all mockup metrics: Venture Performance line chart, Cost Savings $25,000 card, Revenue bar chart, Active Ventures: 5, Investment Allocation pie chart (50%/30%), Quarterly trend, Growth indicator',
    'Top navigation bar functional with title, "Live Analysis Mode" subtitle, mic icon button, camera icon button, "End Session" button',
    'Waveform visualization animates at 60fps using Canvas API',
    'Control bar layout matches mockup: waveform (left), "Show Transcript" toggle (center), "Transcript >" link (right)',
    'Typography refined: appropriate font weights, sizes, line heights',
    'Spacing optimized: tighter gaps where appropriate, balanced padding',
    'No performance regression (load time <2s maintained)',
    'All existing E2E tests still pass (12/12 from SD-001)',
    'Accessibility maintained (WCAG 2.1 AA compliance)',
    'No functional regressions (all 6 user stories from SD-001 still work)'
  ],

  key_principles: [
    'BUILD ON SUCCESS: SD-001 delivered all functional requirements - preserve that foundation',
    'VISUAL POLISH ONLY: No functional changes, feature additions, or backend modifications',
    'PRODUCTION QUALITY: Match industry standards (Zoom, Teams, ChatGPT Enterprise)',
    'DESIGN CONSISTENCY: Cohesive dark navy theme, unified typography, balanced spacing',
    'PERFORMANCE MAINTAINED: <2s load time, 60fps animations, no regressions',
    'ACCESSIBILITY PRESERVED: WCAG 2.1 AA compliance maintained from SD-001',
    'COMPONENT REUSE: Leverage existing Recharts, Shadcn, Tailwind infrastructure'
  ],

  implementation_guidelines: [
    'Phase 1: Theme Overhaul (2-3 hours)',
    '  - Replace light blue gradient with dark navy (#1a2332)',
    '  - Update all color classes in EVAAssistantPage.tsx',
    '  - Ensure dark theme consistency (background, foreground, borders)',
    '  - Test dark mode variant compatibility',
    '',
    'Phase 2: Professional Avatar Integration (2-3 hours)',
    '  - Source professional avatar image (stock or AI-generated)',
    '  - Optimize image (WebP format, appropriate size)',
    '  - Replace gradient placeholder with avatar',
    '  - Add subtle border/shadow for polish',
    '  - Test avatar loading performance',
    '',
    'Phase 3: Custom Dashboard Metrics Layout (4-5 hours)',
    '  - Create EVAMeetingDashboard.tsx component (~300 LOC)',
    '  - Implement metric grid:',
    '    * Venture Performance line chart (Recharts LineChart)',
    '    * Cost Savings card ($25,000 display)',
    '    * Revenue bar chart (Recharts BarChart)',
    '    * Active Ventures count badge (5)',
    '    * Investment Allocation pie chart (Recharts PieChart: 50%, 30%)',
    '    * Quarterly trend line',
    '    * Growth indicator',
    '  - Replace EVAOrchestrationDashboard with EVAMeetingDashboard',
    '  - Test responsive layout',
    '',
    'Phase 4: Top Navigation Bar (2-3 hours)',
    '  - Create EVAMeetingNavBar.tsx component (~150 LOC)',
    '  - Implement navigation elements:',
    '    * "EVA Assistant" title (left)',
    '    * "Live Analysis Mode" subtitle',
    '    * Mic icon button (mute/unmute)',
    '    * Camera icon button (camera on/off)',
    '    * "End Session" button (right)',
    '  - Position nav bar at top of page',
    '  - Test button functionality',
    '',
    'Phase 5: Real-Time Waveform Visualization (3-4 hours)',
    '  - Create AudioWaveform.tsx component (~200 LOC)',
    '  - Implement Canvas API visualization:',
    '    * Vertical bars animation',
    '    * 60fps target performance',
    '    * Audio level sync (connect to EVARealtimeVoice)',
    '  - Replace placeholder waveform',
    '  - Test animation performance',
    '',
    'Phase 6: Control Bar Refinement (1-2 hours)',
    '  - Restructure control bar layout:',
    '    * Left: AudioWaveform component',
    '    * Center: "Show Transcript" toggle',
    '    * Right: "Transcript >" link',
    '  - Remove "Meeting Active" indicator (replaced by nav bar)',
    '  - Adjust button positioning',
    '  - Test layout responsiveness',
    '',
    'Phase 7: Typography & Spacing Polish (1-2 hours)',
    '  - Refine font weights (titles, body text, labels)',
    '  - Adjust font sizes for hierarchy',
    '  - Optimize line heights for readability',
    '  - Tighten gaps where appropriate (gap-4 → gap-2)',
    '  - Balance padding for visual harmony',
    '  - Test typography scale across all panels',
    '',
    'Phase 8: Testing & Verification (2-3 hours)',
    '  - Run all existing E2E tests (must pass 12/12)',
    '  - Create new E2E tests for visual elements:',
    '    * Avatar displays correctly',
    '    * Dashboard metrics visible',
    '    * Top nav bar functional',
    '    * Waveform animating',
    '  - Performance testing (load time <2s, 60fps waveform)',
    '  - Accessibility audit (WCAG 2.1 AA maintained)',
    '  - Visual comparison to mockup (95%+ similarity)',
    '  - Cross-browser testing (Chrome, Firefox, Edge)'
  ],

  dependencies: [
    'SD-EVA-MEETING-001 (COMPLETED) - Functional foundation must remain intact',
    'EXISTING EVAAssistantPage.tsx component (261 LOC)',
    'EXISTING EVARealtimeVoice component (voice interaction)',
    'EXISTING Recharts library (LineChart, BarChart, PieChart)',
    'EXISTING Shadcn UI components (Button, Card, Badge)',
    'EXISTING Tailwind CSS + design system',
    'EXISTING Supabase client (user preferences loading)',
    'ASSET REQUIRED: Professional avatar image (stock or AI-generated)',
    'Canvas API (browser native for waveform visualization)',
    'React hooks: useState, useEffect, useRef'
  ],

  risks: [
    {
      description: 'Avatar image optimization may impact page load time',
      severity: 'low',
      probability: 0.2,
      mitigation: 'Use WebP format, lazy loading, compressed file size (<50KB). Test load performance.'
    },
    {
      description: 'Custom dashboard component may have layout issues on different screen sizes',
      severity: 'medium',
      probability: 0.3,
      mitigation: 'Use responsive Tailwind grid, test on multiple resolutions, implement media queries.'
    },
    {
      description: 'Canvas API waveform may not achieve 60fps on older hardware',
      severity: 'medium',
      probability: 0.25,
      mitigation: 'Use requestAnimationFrame, optimize render cycle, test on low-end devices, provide fallback.'
    },
    {
      description: 'Dark theme may have color contrast accessibility issues',
      severity: 'low',
      probability: 0.15,
      mitigation: 'Use WCAG contrast checker, test with screen readers, ensure 4.5:1 contrast ratio minimum.'
    },
    {
      description: 'Existing E2E tests may break if selectors change during visual refinement',
      severity: 'medium',
      probability: 0.4,
      mitigation: 'Preserve existing test IDs and data attributes, update tests incrementally, verify 12/12 passing.'
    }
  ],

  success_metrics: [
    'Visual similarity to mockup: 95%+ (verified by PLAN supervisor visual comparison)',
    'Dark navy theme consistency: 100% of panels',
    'Professional avatar integrated: YES (displays correctly on all devices)',
    'Dashboard metrics complete: 7/7 (Venture Performance, Cost Savings, Revenue, Active Ventures, Investment Allocation, Quarterly, Growth)',
    'Top navigation bar functional: 100% (all 5 elements working)',
    'Waveform performance: 60fps achieved',
    'Control bar layout: Matches mockup (3-section layout)',
    'Typography refined: Font weights, sizes, line heights optimized',
    'Spacing optimized: Tighter gaps, balanced padding',
    'Performance maintained: <2s load time (no regression)',
    'E2E tests passing: 12/12 (100% from SD-001)',
    'New E2E tests: 5-6 tests for visual elements',
    'Accessibility: WCAG 2.1 AA maintained',
    'No functional regressions: All 6 user stories from SD-001 working',
    'User feedback: "Professional", "Production-ready" impressions'
  ],

  stakeholders: [],
  approved_by: null,
  approval_date: null,
  effective_date: null,
  expiry_date: null,
  review_schedule: null,

  metadata: {
    created_by: 'LEAD Agent - Based on screenshot comparison analysis',
    parent_sd: 'SD-EVA-MEETING-001',
    parent_sd_status: 'completed',
    parent_sd_achievements: {
      user_stories_validated: '6/6',
      e2e_tests_passing: '12/12',
      component_reuse: '84.7%',
      load_time: '<2s',
      accessibility: 'WCAG 2.1 AA compliant'
    },
    phase: 'Phase 2 Visual Polish (follows Phase 1 MVP)',
    estimated_effort: '18-27 hours (~3-5 sprints)',
    target_application: 'EHG',
    application_path: '../ehg/',
    database_changes: false,
    requires_migrations: false,
    mockup_reference: 'Screenshot 2025-10-08 173653.png',

    scope_comparison: {
      sd_001_delivered: [
        'Functional 2-panel meeting interface',
        'Light blue gradient background',
        'Placeholder EVA avatar (gradient circle)',
        'Generic EVAOrchestrationDashboard component',
        'Transcript toggle (<100ms response)',
        'Meeting controls (Mute, End, Settings)',
        'User preferences loading',
        'Theme support (dark mode variants)',
        '84.7% component reuse',
        '6/6 user stories validated',
        '12/12 E2E tests passing',
        '<2s load time',
        'WCAG 2.1 AA compliant'
      ],
      sd_002_additions: [
        'Dark navy theme (#1a2332)',
        'Professional avatar image',
        'Custom dashboard metrics layout (7 metrics)',
        'Top navigation bar (5 elements)',
        'Real waveform visualization (Canvas API, 60fps)',
        'Refined control bar layout',
        'Typography polish',
        'Spacing optimization',
        'Production-ready visual consistency'
      ],
      explicitly_deferred_from_sd_001: [
        'Advanced waveform animation (60fps Canvas API)',
        'EVA avatar video/animation',
        'Advanced glow effects',
        'Performance optimization'
      ]
    },

    sub_agents_required: [
      'Senior Design Sub-Agent (UI/UX for dark theme, component layouts, typography) - Priority 70',
      'QA Engineering Director (E2E tests for visual elements, regression testing) - Priority 5',
      'Performance Engineering Lead (waveform 60fps, load time maintenance) - Priority 4',
      'Principal Systems Analyst (verify no duplication with existing components) - Priority 0'
    ],

    simplicity_evaluation: {
      is_large_effort: true, // 18-27 hours
      is_overly_complex: false, // Uses proven technologies (Canvas API, Recharts, Tailwind)
      justification: 'Large scope acceptable - visual polish using standard patterns. NOT over-engineered.',
      technology_stack: 'Proven: React, Canvas API, Recharts, Tailwind CSS, Shadcn UI',
      no_custom_frameworks: true,
      leverages_existing_infrastructure: true,
      strategic_value: 'High - production readiness blocks enterprise client confidence'
    },

    success_pattern_from_sd_001: {
      component_reuse_strategy: '84.7% achieved - reuse EVARealtimeVoice, Recharts components',
      e2e_testing_approach: '100% user story coverage - continue same pattern',
      database_first: 'All tracking in database, not files',
      accessibility_commitment: 'WCAG 2.1 AA maintained throughout'
    }
  }
};

async function createSD() {
  try {
    console.log('\n📝 Inserting SD-EVA-MEETING-002 into database...\n');

    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sd)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert SD: ${error.message}`);
    }

    console.log('✅ SD-EVA-MEETING-002 created successfully!');
    console.log('═'.repeat(70));
    console.log(`   ID: ${data.id}`);
    console.log(`   Title: ${data.title}`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Priority: ${data.priority}`);
    console.log(`   Category: ${data.category}`);
    console.log('');
    console.log('📊 Scope Summary:');
    console.log(`   In Scope: ${JSON.parse(data.scope).in_scope.length} items`);
    console.log(`   Out of Scope: ${JSON.parse(data.scope).out_of_scope.length} items`);
    console.log(`   Strategic Objectives: ${data.strategic_objectives.length}`);
    console.log(`   Success Criteria: ${data.success_criteria.length}`);
    console.log(`   Implementation Phases: 8`);
    console.log('');
    console.log('🎯 Estimated Effort: 18-27 hours (~3-5 sprints)');
    console.log('🔗 Dependencies: SD-EVA-MEETING-001 (completed ✅)');
    console.log('📱 Target Application: EHG (../ehg/)');
    console.log('');
    console.log('🚀 Next Steps:');
    console.log('   1. LEAD Pre-Approval: Run 5-step evaluation checklist');
    console.log('   2. Sub-Agents: Systems Analyst, Design, Security, Database');
    console.log('   3. SIMPLICITY FIRST Gate: Evaluate complexity vs value');
    console.log('   4. LEAD→PLAN Handoff: Create handoff if approved');
    console.log('═'.repeat(70));

    return { success: true, sd_id: data.id };

  } catch (error) {
    console.error('\n❌ Error creating SD:', error.message);
    throw error;
  }
}

// Execute
createSD()
  .then(result => {
    console.log('\n🎉 SD creation complete!');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
