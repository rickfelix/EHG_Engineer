#!/usr/bin/env node

/**
 * ENRICH PRD - SD-EVA-MEETING-002
 *
 * Populates comprehensive PRD details for EVA Meeting Interface
 * Production Visual Polish & Design Refinement
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const PRD_ID = 'PRD-SD-EVA-MEETING-002';
const SD_ID = 'SD-EVA-MEETING-002';

console.log('\n🔄 ENRICHING PRD - SD-EVA-MEETING-002');
console.log('═'.repeat(60));

async function enrichPRD() {
  try {
    // First, get the SD details
    console.log('\n📋 Fetching SD details...');
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', SD_ID)
      .single();

    if (sdError) throw new Error(`Failed to fetch SD: ${sdError.message}`);
    console.log(`✅ SD fetched: ${sd.title}`);

    const enrichedPRD = {
      title: 'EVA Meeting Interface - Production Visual Polish PRD',
      status: 'planning',
      priority: 'high',
      progress: 30, // Updated from 10% to 30%

      // Executive Summary
      executive_summary: `
## Executive Summary

This PRD defines the implementation roadmap for **SD-EVA-MEETING-002**, transforming the EVA Meeting Interface from a functional MVP (delivered in SD-EVA-MEETING-001) into a production-ready visual experience matching professional video conferencing standards.

**Parent SD**: SD-EVA-MEETING-001 (COMPLETED - 6/6 user stories, 12/12 E2E tests passing, 84.7% component reuse)

**Strategic Context**: SD-001 explicitly deferred Phase 2 visual enhancements (dark theme, professional avatar, advanced waveform, custom dashboard) to maintain focus on functional requirements. This PRD addresses those deferred items.

**Effort Estimate**: 18-27 hours (~3-5 sprints)
**New Code**: ~650 LOC (3 new components + theme overhaul)
**Component Reuse**: 70%+ (EVARealtimeVoice, Recharts, Shadcn UI, Tailwind)

**Visual Transformation**:
- FROM: Light blue gradient MVP with placeholder avatar
- TO: Dark navy professional interface (#1a2332) with real assets

**Success Metric**: 95%+ visual similarity to design mockup screenshot
      `.trim(),

      // Business Context (instead of business_objectives)
      business_context: JSON.stringify([
        {
          objective: 'Production Readiness for Enterprise Sales',
          rationale: 'Professional visual design unblocks enterprise customer demos',
          success_metric: 'Screenshot match ≥95%, customer feedback positive'
        },
        {
          objective: 'Complete Phase 2 Enhancements from SD-001',
          rationale: 'Deliver on explicitly deferred features (waveform, avatar, theme)',
          success_metric: 'All Phase 2 items from SD-001 implementation notes delivered'
        },
        {
          objective: 'Maintain Performance & Accessibility',
          rationale: 'Visual polish must not regress on <2s load, WCAG 2.1 AA compliance',
          success_metric: 'Performance ≤2s, a11y tests pass, existing E2E tests pass'
        },
        {
          objective: 'Establish Scalable Design System',
          rationale: 'Dark navy theme creates foundation for future EVA features',
          success_metric: 'Theme variables reusable, documented in design system'
        }
      ]),

      // Functional Requirements (instead of features)
      functional_requirements: JSON.stringify({
        core: [
          {
            feature: 'Dark Navy Theme Implementation',
            description: 'Replace light blue gradient with cohesive dark navy (#1a2332) color scheme',
            technical_approach: 'Tailwind CSS dark mode utilities, update all className props',
            components_affected: ['EVAAssistantPage.tsx', 'EVAMeetingNavBar.tsx (NEW)', 'EVAMeetingDashboard.tsx (NEW)'],
            effort: '2-3 hours',
            dependencies: []
          },
          {
            feature: 'Professional Avatar Integration',
            description: 'Replace placeholder gradient circle with professional female avatar image',
            technical_approach: 'Asset sourcing (stock image or AI-generated), image optimization, Avatar component with proper sizing',
            components_affected: ['EVAAssistantPage.tsx'],
            effort: '2-3 hours',
            dependencies: ['Avatar asset acquisition']
          },
          {
            feature: 'Custom Dashboard Metrics Layout',
            description: 'Implement specific 7-metric dashboard matching screenshot mockup',
            technical_approach: 'New EVAMeetingDashboard.tsx component using Recharts (LineChart, BarChart, PieChart), Card grid layout',
            components_affected: ['EVAMeetingDashboard.tsx (NEW)'],
            metrics: [
              'Venture Performance line chart',
              'Cost Savings $25,000 card',
              'Revenue bar chart',
              'Active Ventures: 5 count',
              'Investment Allocation pie chart (50%, 30%)',
              'Quarterly trend line',
              'Growth indicator'
            ],
            effort: '4-5 hours',
            dependencies: ['Recharts library']
          },
          {
            feature: 'Top Navigation Bar Component',
            description: 'Add meeting interface top nav with title, status, controls',
            technical_approach: 'New EVAMeetingNavBar.tsx component with Shadcn Button, Badge',
            components_affected: ['EVAMeetingNavBar.tsx (NEW)', 'EVAAssistantPage.tsx'],
            elements: [
              'EVA Assistant title (left)',
              'Live Analysis Mode subtitle',
              'Mic icon button',
              'Camera icon button',
              'End Session button (right)'
            ],
            effort: '2-3 hours',
            dependencies: ['Lucide icons']
          },
          {
            feature: 'Real-Time Waveform Visualization',
            description: 'Implement Canvas API waveform with 60fps animation',
            technical_approach: 'New AudioWaveform.tsx component using Canvas API, requestAnimationFrame, synced with EVARealtimeVoice audio levels',
            components_affected: ['AudioWaveform.tsx (NEW)', 'EVAAssistantPage.tsx'],
            performance_target: '60fps sustained animation',
            effort: '3-4 hours',
            dependencies: ['Canvas API', 'EVARealtimeVoice integration']
          },
          {
            feature: 'Control Bar Refinement',
            description: 'Restructure bottom controls with waveform, transcript toggle, transcript link',
            technical_approach: 'Update layout in EVAAssistantPage.tsx, integrate AudioWaveform component',
            components_affected: ['EVAAssistantPage.tsx'],
            effort: '1-2 hours',
            dependencies: ['AudioWaveform.tsx complete']
          },
          {
            feature: 'Typography & Spacing Polish',
            description: 'Refine font weights, sizes, spacing for professional appearance',
            technical_approach: 'Tailwind utility adjustments, gap/padding optimization',
            components_affected: ['All EVA meeting components'],
            effort: '2-3 hours',
            dependencies: []
          }
        ],
        out_of_scope: [
          'Functional changes to EVA voice assistant',
          'New features beyond visual design',
          'Backend or database modifications',
          'EVA orchestration logic changes',
          'Authentication or user preference changes'
        ]
      }),

      // Technical Requirements
      technical_requirements: JSON.stringify({
        technology_stack: {
          frontend: 'React 18 + TypeScript',
          build_tool: 'Vite',
          styling: 'Tailwind CSS 3.x (dark mode)',
          ui_components: 'Shadcn UI (Button, Card, Badge, Avatar)',
          charts: 'Recharts 2.x (LineChart, BarChart, PieChart)',
          animation: 'Canvas API (60fps waveform)',
          testing: 'Playwright (E2E), Vitest (unit)'
        },

        component_architecture: [
          {
            component: 'EVAMeetingNavBar.tsx',
            location: '../ehg/src/components/eva-meeting/',
            size: '~150 LOC',
            dependencies: ['Shadcn Button', 'Lucide icons', 'Badge'],
            props: ['onMicToggle', 'onCameraToggle', 'onEndSession', 'isMicActive', 'isCameraActive'],
            styling: 'Dark navy theme, consistent with page background'
          },
          {
            component: 'EVAMeetingDashboard.tsx',
            location: '../ehg/src/components/eva-meeting/',
            size: '~300 LOC',
            dependencies: ['Recharts', 'Shadcn Card'],
            data_sources: ['Mock data (Phase 1), Real venture data (Phase 2)'],
            layout: 'CSS Grid (2 rows: top metrics, bottom charts)',
            styling: 'Dark theme cards with proper contrast'
          },
          {
            component: 'AudioWaveform.tsx',
            location: '../ehg/src/components/eva-meeting/',
            size: '~200 LOC',
            dependencies: ['Canvas API', 'EVARealtimeVoice (audio level props)'],
            performance: '60fps via requestAnimationFrame',
            fallback: 'Static placeholder if Canvas not supported',
            styling: 'Vertical bars, blue accent color'
          }
        ],

        color_palette: {
          background: '#1a2332',
          foreground: '#e2e8f0',
          accent: '#3b82f6',
          borders: '#334155',
          cards: '#1e293b',
          muted_text: '#94a3b8',
          success: '#10b981',
          warning: '#f59e0b',
          contrast_ratio: '4.5:1 minimum (WCAG AA)'
        },

        performance_targets: {
          page_load: '<2s (no regression from SD-001)',
          waveform_fps: '60fps sustained',
          bundle_size_increase: '<50KB (new components)',
          lighthouse_score: '≥90 (performance, accessibility)'
        },

        accessibility_requirements: [
          'WCAG 2.1 AA compliance maintained',
          'Dark theme color contrast ≥4.5:1',
          'Keyboard navigation support (nav controls)',
          'Screen reader labels (ARIA attributes)',
          'Focus indicators visible on dark background'
        ],

        browser_compatibility: [
          'Chrome 90+ (Canvas API support)',
          'Firefox 88+',
          'Safari 14+',
          'Edge 90+'
        ]
      }),

      // Acceptance Criteria
      acceptance_criteria: JSON.stringify([
        {
          criterion: 'Visual Design Match',
          requirement: 'UI matches screenshot mockup with ≥95% similarity',
          verification: 'Screenshot comparison, stakeholder review',
          priority: 'MUST HAVE'
        },
        {
          criterion: 'Dark Navy Theme Consistency',
          requirement: 'All panels, cards, and components use cohesive dark navy palette (#1a2332)',
          verification: 'Visual inspection, color picker verification',
          priority: 'MUST HAVE'
        },
        {
          criterion: 'Professional Avatar Display',
          requirement: 'Avatar image renders correctly (business attire, professional quality)',
          verification: 'Visual inspection, image load success',
          priority: 'MUST HAVE'
        },
        {
          criterion: 'Custom Dashboard Metrics',
          requirement: 'Dashboard displays all 7 metrics from mockup (Venture Performance, Cost Savings, Revenue, Active Ventures, Investment Allocation, Quarterly, Growth)',
          verification: 'E2E test validates presence of all metrics',
          priority: 'MUST HAVE'
        },
        {
          criterion: 'Top Navigation Bar Complete',
          requirement: 'Nav bar includes title, status, mic button, camera button, end session button',
          verification: 'E2E test validates all 5 elements present and functional',
          priority: 'MUST HAVE'
        },
        {
          criterion: 'Waveform Animation Performance',
          requirement: 'Waveform animates at 60fps (no dropped frames)',
          verification: 'Performance profiling, Chrome DevTools FPS counter',
          priority: 'MUST HAVE'
        },
        {
          criterion: 'Control Bar Layout',
          requirement: 'Bottom bar shows waveform (left), transcript toggle (center), transcript link (right)',
          verification: 'E2E test validates layout structure',
          priority: 'MUST HAVE'
        },
        {
          criterion: 'Typography Polish',
          requirement: 'Font weights, sizes, spacing refined for professional appearance',
          verification: 'Design review, stakeholder approval',
          priority: 'SHOULD HAVE'
        },
        {
          criterion: 'Performance No Regression',
          requirement: 'Page load time remains <2s (SD-001 target)',
          verification: 'Lighthouse performance score ≥90',
          priority: 'MUST HAVE'
        },
        {
          criterion: 'Accessibility Maintained',
          requirement: 'WCAG 2.1 AA compliance (color contrast ≥4.5:1, keyboard nav, screen reader)',
          verification: 'Playwright a11y tests pass',
          priority: 'MUST HAVE'
        },
        {
          criterion: 'Existing Tests Pass',
          requirement: 'All 12 E2E tests from SD-001 continue to pass',
          verification: 'npm run test:e2e (12/12 passing)',
          priority: 'MUST HAVE'
        },
        {
          criterion: 'Component Size Compliance',
          requirement: 'Each new component 300-600 LOC (optimal range)',
          verification: 'Code review, LOC count',
          priority: 'SHOULD HAVE'
        },
        {
          criterion: 'Theme Reusability',
          requirement: 'Dark navy theme variables documented and reusable for future EVA features',
          verification: 'Design system documentation updated',
          priority: 'SHOULD HAVE'
        }
      ]),

      // Test Scenarios (instead of test_plan)
      test_scenarios: JSON.stringify({
        strategy: 'Comprehensive E2E testing via Playwright with visual regression and performance validation',

        unit_tests: {
          framework: 'Vitest',
          target_coverage: '50% minimum',
          test_files: [
            'AudioWaveform.test.tsx (Canvas API mocking, FPS validation)',
            'EVAMeetingDashboard.test.tsx (metric rendering, chart data)',
            'EVAMeetingNavBar.test.tsx (button interactions, prop handling)'
          ],
          estimated_tests: '15-20 unit tests'
        },

        e2e_tests: {
          framework: 'Playwright',
          test_file: 'tests/e2e/eva-meeting-visual-polish.spec.ts',
          estimated_duration: '<10 minutes',
          test_scenarios: [
            {
              scenario: 'Dark Navy Theme Verification',
              steps: [
                'Navigate to /eva-assistant',
                'Verify background color is #1a2332',
                'Verify all cards have dark navy theme',
                'Take screenshot for evidence'
              ],
              assertions: ['Background color matches', 'Cards consistent with theme']
            },
            {
              scenario: 'Professional Avatar Display',
              steps: [
                'Navigate to /eva-assistant',
                'Verify avatar image loads successfully',
                'Verify avatar is not placeholder gradient',
                'Take screenshot'
              ],
              assertions: ['Avatar src attribute present', 'Image loaded']
            },
            {
              scenario: 'Custom Dashboard Metrics',
              steps: [
                'Navigate to /eva-assistant',
                'Verify Venture Performance chart visible',
                'Verify Cost Savings card shows $25,000',
                'Verify Revenue bar chart visible',
                'Verify Active Ventures count shows 5',
                'Verify Investment Allocation pie chart (50%, 30%)',
                'Verify Quarterly trend line visible',
                'Verify Growth indicator visible',
                'Take screenshot'
              ],
              assertions: ['All 7 metrics present and visible']
            },
            {
              scenario: 'Top Navigation Bar',
              steps: [
                'Navigate to /eva-assistant',
                'Verify "EVA Assistant" title visible',
                'Verify "Live Analysis Mode" subtitle visible',
                'Verify Mic button visible and clickable',
                'Verify Camera button visible and clickable',
                'Verify "End Session" button visible and clickable',
                'Take screenshot'
              ],
              assertions: ['All 5 nav elements present and functional']
            },
            {
              scenario: 'Waveform Animation',
              steps: [
                'Navigate to /eva-assistant',
                'Verify waveform canvas element exists',
                'Monitor FPS via DevTools (expect 60fps)',
                'Verify waveform updates during voice activity',
                'Take screenshot'
              ],
              assertions: ['Canvas present', 'FPS ≥58', 'Animation runs']
            },
            {
              scenario: 'Control Bar Layout',
              steps: [
                'Navigate to /eva-assistant',
                'Verify waveform on left side of control bar',
                'Verify transcript toggle in center',
                'Verify transcript link on right',
                'Take screenshot'
              ],
              assertions: ['Layout matches mockup']
            }
          ]
        },

        visual_regression: {
          tool: 'Playwright screenshot comparison',
          baseline: 'Design mockup screenshot (c:/Users/rickf/OneDrive/Desktop/Screenshot 2025-10-08 173653.png)',
          threshold: '95% similarity',
          areas_to_compare: [
            'Full page layout',
            'Avatar section',
            'Dashboard metrics grid',
            'Navigation bar',
            'Control bar'
          ]
        },

        performance_testing: {
          tool: 'Lighthouse CI',
          metrics: [
            'Page load time <2s',
            'Waveform FPS monitoring (Chrome DevTools)',
            'Bundle size increase <50KB',
            'Performance score ≥90'
          ]
        },

        accessibility_testing: {
          tool: 'Playwright + axe-core',
          requirements: [
            'Color contrast ≥4.5:1 (WCAG AA)',
            'Keyboard navigation functional',
            'Screen reader labels present',
            'Focus indicators visible'
          ]
        },

        regression_testing: {
          requirement: 'All 12 existing E2E tests from SD-001 must continue to pass',
          test_suite: 'tests/e2e/eva-meeting-interface.spec.ts',
          verification: 'npm run test:e2e (expect 12/12 passing)'
        }
      }),

      // Implementation Approach (instead of implementation_phases)
      implementation_approach: JSON.stringify([
        {
          phase: 1,
          name: 'Dark Navy Theme Implementation',
          duration: '2-3 hours',
          tasks: [
            'Update EVAAssistantPage.tsx background from light blue to #1a2332',
            'Update all card backgrounds to dark navy variants',
            'Ensure text colors have ≥4.5:1 contrast (#e2e8f0)',
            'Update border colors to #334155',
            'Test dark mode consistency across all panels'
          ],
          deliverables: ['Updated EVAAssistantPage.tsx with dark theme'],
          verification: 'E2E test validates background color'
        },
        {
          phase: 2,
          name: 'Professional Avatar Integration',
          duration: '2-3 hours',
          tasks: [
            'Source professional avatar image (stock or AI-generated)',
            'Optimize image (WebP format, appropriate size)',
            'Replace placeholder gradient with Avatar component',
            'Add proper alt text for accessibility',
            'Test image loading and display'
          ],
          deliverables: ['Avatar image asset', 'Updated avatar section in EVAAssistantPage.tsx'],
          verification: 'E2E test validates avatar image loads'
        },
        {
          phase: 3,
          name: 'Custom Dashboard Metrics Component',
          duration: '4-5 hours',
          tasks: [
            'Create EVAMeetingDashboard.tsx component',
            'Implement CSS Grid layout (2 rows)',
            'Add Venture Performance LineChart (Recharts)',
            'Add Cost Savings card ($25,000)',
            'Add Revenue BarChart',
            'Add Active Ventures count (5)',
            'Add Investment Allocation PieChart (50%, 30%)',
            'Add Quarterly trend line',
            'Add Growth indicator',
            'Style with dark navy theme',
            'Add unit tests for metric rendering'
          ],
          deliverables: ['EVAMeetingDashboard.tsx (~300 LOC)', 'Unit tests'],
          verification: 'E2E test validates all 7 metrics present'
        },
        {
          phase: 4,
          name: 'Top Navigation Bar Component',
          duration: '2-3 hours',
          tasks: [
            'Create EVAMeetingNavBar.tsx component',
            'Add "EVA Assistant" title (left)',
            'Add "Live Analysis Mode" badge',
            'Add Mic button with icon (Lucide)',
            'Add Camera button with icon',
            'Add "End Session" button (right)',
            'Implement onClick handlers (props)',
            'Style with dark navy theme',
            'Add unit tests for button interactions'
          ],
          deliverables: ['EVAMeetingNavBar.tsx (~150 LOC)', 'Unit tests'],
          verification: 'E2E test validates all 5 nav elements'
        },
        {
          phase: 5,
          name: 'Real-Time Waveform Visualization',
          duration: '3-4 hours',
          tasks: [
            'Create AudioWaveform.tsx component',
            'Implement Canvas API setup (ref, context)',
            'Create vertical bar drawing logic',
            'Integrate requestAnimationFrame (60fps loop)',
            'Sync with EVARealtimeVoice audio levels (props)',
            'Add fallback for Canvas unsupported',
            'Optimize for 60fps performance',
            'Add unit tests for Canvas rendering'
          ],
          deliverables: ['AudioWaveform.tsx (~200 LOC)', 'Unit tests'],
          verification: 'Performance profiling validates 60fps'
        },
        {
          phase: 6,
          name: 'Control Bar Refinement',
          duration: '1-2 hours',
          tasks: [
            'Update EVAAssistantPage.tsx control bar layout',
            'Position AudioWaveform component (left)',
            'Center transcript toggle',
            'Position transcript link (right)',
            'Adjust spacing and alignment',
            'Test layout responsiveness'
          ],
          deliverables: ['Updated control bar in EVAAssistantPage.tsx'],
          verification: 'E2E test validates layout structure'
        },
        {
          phase: 7,
          name: 'Typography & Spacing Polish',
          duration: '2-3 hours',
          tasks: [
            'Refine font weights across all components',
            'Adjust font sizes for hierarchy',
            'Optimize gap/padding values',
            'Ensure consistent spacing in grid layouts',
            'Review typography with design mockup'
          ],
          deliverables: ['Polished typography across all EVA components'],
          verification: 'Design review approval'
        },
        {
          phase: 8,
          name: 'Comprehensive Testing & Validation',
          duration: '2-3 hours',
          tasks: [
            'Run all E2E tests (new + existing 12 from SD-001)',
            'Run unit tests (target 50% coverage)',
            'Run Lighthouse performance audit',
            'Run a11y tests (WCAG AA compliance)',
            'Visual regression testing (95% match)',
            'Fix any failing tests',
            'Capture evidence (screenshots, reports)',
            'Document test results'
          ],
          deliverables: ['Test evidence package', 'Passing test suite'],
          verification: 'All tests passing, 95% visual match'
        }
      ]),

      // Dependencies
      dependencies: JSON.stringify({
        parent_sd: 'SD-EVA-MEETING-001 (COMPLETED)',
        existing_components: [
          'EVARealtimeVoice.tsx (100% reuse)',
          'EVAAssistantPage.tsx (modify)',
          'Shadcn UI components (Button, Card, Badge, Avatar)',
          'Recharts (LineChart, BarChart, PieChart)'
        ],
        new_assets: [
          'Professional avatar image (stock or AI-generated)'
        ],
        libraries: [
          'Recharts 2.x (already installed)',
          'Lucide icons (already installed)',
          'Canvas API (browser native)'
        ],
        blockers: []
      }),

      // Risks
      risks: JSON.stringify([
        {
          risk: 'Avatar Asset Acquisition Delay',
          impact: 'Medium',
          mitigation: 'Use AI-generated avatar (DALL-E, Midjourney) as backup if stock images insufficient',
          status: 'Open'
        },
        {
          risk: 'Waveform Performance <60fps',
          impact: 'High',
          mitigation: 'Implement throttling, reduce bar count, use OffscreenCanvas as fallback',
          status: 'Open'
        },
        {
          risk: 'Color Contrast Accessibility Failure',
          impact: 'High',
          mitigation: 'Use Contrast Checker tool upfront, test with axe-core early',
          status: 'Open'
        },
        {
          risk: 'Regression in Existing E2E Tests',
          impact: 'Medium',
          mitigation: 'Run SD-001 test suite frequently during implementation',
          status: 'Open'
        }
      ]),

      // Metadata
      metadata: {
        target_application: 'EHG',
        application_path: '../ehg/',
        url: 'http://localhost:5173/eva-assistant',
        port: 5173,

        parent_sd_reference: {
          id: 'SD-EVA-MEETING-001',
          status: 'completed',
          user_stories_delivered: 6,
          e2e_tests_passing: 12,
          component_reuse: '84.7%',
          deferred_features: [
            'Advanced waveform animation (60fps Canvas API)',
            'EVA avatar video/animation',
            'Advanced glow effects',
            'Performance optimization'
          ]
        },

        new_components: [
          {
            name: 'EVAMeetingNavBar.tsx',
            path: '../ehg/src/components/eva-meeting/EVAMeetingNavBar.tsx',
            size: '~150 LOC',
            purpose: 'Top navigation bar with title, status, controls'
          },
          {
            name: 'EVAMeetingDashboard.tsx',
            path: '../ehg/src/components/eva-meeting/EVAMeetingDashboard.tsx',
            size: '~300 LOC',
            purpose: 'Custom dashboard with 7 specific metrics'
          },
          {
            name: 'AudioWaveform.tsx',
            path: '../ehg/src/components/eva-meeting/AudioWaveform.tsx',
            size: '~200 LOC',
            purpose: 'Real-time waveform visualization (Canvas API, 60fps)'
          }
        ],

        modified_components: [
          {
            name: 'EVAAssistantPage.tsx',
            path: '../ehg/src/pages/EVAAssistantPage.tsx',
            current_size: '261 LOC',
            changes: [
              'Dark navy theme (all className updates)',
              'Avatar component integration',
              'EVAMeetingDashboard integration',
              'EVAMeetingNavBar integration',
              'AudioWaveform integration',
              'Control bar restructure'
            ]
          }
        ],

        estimated_effort: {
          total_hours: '18-27 hours',
          sprints: '3-5 sprints',
          new_loc: '~650 LOC',
          modified_loc: '~100 LOC (EVAAssistantPage.tsx updates)',
          total_impact: '~750 LOC'
        },

        design_reference: {
          screenshot_path: 'c:/Users/rickf/OneDrive/Desktop/Screenshot 2025-10-08 173653.png',
          screenshot_wsl_path: '/mnt/c/Users/rickf/OneDrive/Desktop/Screenshot 2025-10-08 173653.png',
          match_target: '95% visual similarity'
        }
      },

      updated_at: new Date().toISOString()
    };

    // Update PRD in database
    console.log('\n📝 Updating PRD in database...');

    const { error: updateError } = await supabase
      .from('product_requirements_v2')
      .update(enrichedPRD)
      .eq('id', PRD_ID);

    if (updateError) {
      throw new Error(`Failed to update PRD: ${updateError.message}`);
    }

    console.log('\n✅ PRD enriched successfully!');
    console.log('═'.repeat(60));
    console.log(`   PRD ID: ${PRD_ID}`);
    console.log(`   Progress: 10% → 30% (+20 points)`);
    console.log('');
    console.log('📊 Content Added:');
    console.log(`   ✅ Executive Summary: Comprehensive context`);
    console.log(`   ✅ Business Objectives: 4 objectives with metrics`);
    console.log(`   ✅ Features: 7 core features + out-of-scope`);
    console.log(`   ✅ Technical Requirements: Full stack, architecture, palette`);
    console.log(`   ✅ Acceptance Criteria: 13 criteria (MUST/SHOULD)`);
    console.log(`   ✅ Test Plan: Unit, E2E, visual, performance, a11y`);
    console.log(`   ✅ Implementation Phases: 8 phases (18-27 hours)`);
    console.log(`   ✅ Dependencies: Parent SD, components, assets`);
    console.log(`   ✅ Risks: 4 risks with mitigation`);
    console.log(`   ✅ Metadata: Paths, components, effort estimate`);
    console.log('═'.repeat(60));

    return {
      success: true,
      prd_id: PRD_ID,
      progress: { from: 10, to: 30 },
      content_sections: 10
    };

  } catch (error) {
    console.error('\n❌ Error enriching PRD:', error.message);
    throw error;
  }
}

// Execute
enrichPRD()
  .then(result => {
    console.log('\n🎉 PRD enrichment complete!');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
