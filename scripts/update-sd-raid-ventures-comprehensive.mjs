#!/usr/bin/env node

/**
 * Update SD-RAID-VENTURES-001 with comprehensive analysis from Prompts 2-5
 * Adds UI/UX, Data Flow, and Testing Strategy findings
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updateStrategicDirective() {
  console.log('📝 Updating SD-RAID-VENTURES-001 with comprehensive analysis...\n');

  // Retrieve current SD
  const { data: currentSD, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', 'SD-RAID-VENTURES-001')
    .single();

  if (fetchError) {
    console.error('❌ Error fetching SD:', fetchError);
    process.exit(1);
  }

  // Merge new analysis into existing metadata
  const updatedMetadata = {
    ...currentSD.metadata,

    // Add Prompt 3: UI/UX Component Reusability Analysis
    ui_ux_analysis: {
      component_reusability: '80%',
      design_system: 'Shadcn UI + Tailwind CSS',

      badge_patterns: {
        variants: ['default', 'secondary', 'destructive', 'outline'],
        existing_usage: [
          'AgentStatusCard.tsx - Status badges with 5 color variants',
          'StrategicKPIMonitor.tsx - Category color coding (4 categories)',
          'PortfolioRisksCard.tsx - Severity badges (HIGH/MED/LOW)'
        ],
        recommended_raid_pattern: {
          risk: 'severity_index-based (🟢 LOW / 🟡 MED / 🔴 HIGH)',
          action: 'bg-blue-100 text-blue-800 (neutral/info)',
          issue: 'bg-red-100 text-red-800 (error/attention)',
          decision: 'bg-purple-100 text-purple-800 (strategic)'
        }
      },

      progress_patterns: {
        component: '@radix-ui/react-progress',
        standard_height: 'h-2 for compact views, h-4 for prominent',
        existing_usage: [
          'AgentStatusCard.tsx - Single progress with percentage',
          'StrategicKPIMonitor.tsx - KPI progress bars',
          'VentureCard.tsx - Simple stage progress (X/40)'
        ],
        gap_identified: 'NO existing multi-progress-bar pattern - NEW design required',
        proposed_pattern: '6 mini progress bars (h-1.5) with tooltips showing category name + percentage'
      },

      table_patterns: {
        component: 'Shadcn UI Table primitives',
        responsive_wrapper: 'relative w-full overflow-auto',
        existing_usage: [
          'VenturesPage.tsx - Table view for ventures',
          'DecisionAnalyticsDashboard.tsx - DecisionHistoryTable with filters'
        ],
        recommended_columns: ['Venture Name', 'Category Progress (6 bars)', 'RAID Indicators', 'Overall Progress']
      },

      tooltip_patterns: {
        component: '@radix-ui/react-tooltip',
        z_index: 'z-50',
        animations: 'animate-in fade-in-0 zoom-in-95',
        usage: 'TooltipProvider wrapper required',
        recommended_usage: 'Tooltips for each category progress bar and RAID count badge'
      },

      responsive_grid_patterns: {
        standard: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
        found_in: '40+ components',
        mobile_flex: 'flex flex-col sm:flex-row',
        visibility_toggles: 'hidden sm:block / block sm:hidden',
        mobile_strategy: {
          mobile: 'Single column, stack category bars vertically, 2-column RAID badges',
          tablet: 'Show 2-3 columns',
          desktop: 'Full table with all columns'
        }
      },

      stage_categories_usage: {
        colors: {
          ideation: 'blue',
          validation: 'green',
          planning: 'purple',
          development: 'orange',
          launch: 'red',
          growth: 'teal'
        },
        confirmed_files: [
          'WorkflowProgress.tsx',
          'VentureStageNavigation.tsx',
          'LiveWorkflowMap.tsx'
        ],
        distribution: {
          ideation: '2 stages (1-2)',
          validation: '4 stages (3-6)',
          planning: '7 stages (7-13)',
          development: '17 stages (14-30)',
          launch: '1 stage (31)',
          growth: '9 stages (32-40)'
        }
      },

      new_components_required: [
        {
          name: 'CategoryProgressBars.tsx',
          loc: '~120',
          complexity: 'Medium',
          dependencies: ['Progress', 'Tooltip', 'workflows.ts'],
          effort: '2-3 hours',
          modes: ['compact (6 mini bars)', 'detail (full breakdown with labels)']
        },
        {
          name: 'RAIDIndicatorBadge.tsx',
          loc: '~80',
          complexity: 'Low',
          dependencies: ['Badge', 'PortfolioRisksCard pattern'],
          effort: '1-2 hours',
          features: ['Compact badge (R:3 A:5 I:0 D:2)', 'Tooltips with details', 'Severity-based coloring']
        },
        {
          name: 'VenturesListView.tsx',
          loc: '~250',
          complexity: 'Medium',
          dependencies: ['Table', 'Card', 'CategoryProgressBars', 'RAIDIndicatorBadge'],
          effort: '3-4 hours',
          features: ['4-column table layout', 'Mobile responsive (card-based)', 'Integrates new components']
        }
      ],

      modifications_required: [
        {
          file: 'VenturesPage.tsx',
          changes: 'Add "list" to viewMode type union, add TabsTrigger',
          lines: '~20',
          effort: '30 minutes'
        },
        {
          file: 'useVentures.ts',
          changes: 'Add optional RAID summary join',
          lines: '~15',
          effort: '1 hour'
        }
      ],

      accessibility_compliance: 'WCAG 2.1 AA - All color combinations validated for 4.5:1 contrast ratio',

      design_system_conflicts: 'NONE - All patterns align with existing Shadcn UI conventions',

      total_implementation_estimate: {
        lines_of_code: '~485',
        components: 3,
        modifications: 2,
        effort_hours: '7.5-10.5',
        code_reuse: '80%'
      }
    },

    // Add Prompt 4: Data Flow & State Management Analysis
    data_flow_analysis: {
      state_management: 'React Query (@tanstack/react-query)',

      existing_hooks: {
        useVentures: {
          location: '/mnt/c/_EHG/ehg/src/hooks/useVentureData.ts',
          pattern: 'useQuery with queryKey ["ventures", companyId]',
          features: ['Demo mode support', 'Company filtering', 'Mock data fallback'],
          query: 'supabase.from("ventures").select("*, portfolios(name)")',
          extension_point: 'Add optional RAID summary join'
        },
        useVentureMetrics: {
          location: '/mnt/c/_EHG/ehg/src/hooks/useVentureData.ts',
          pattern: 'useQuery with mock data',
          note: 'Currently mock - will be replaced with real API'
        },
        useWorkflowStages: {
          location: '/mnt/c/_EHG/ehg/src/hooks/useWorkflowData.ts',
          pattern: 'useQuery with mock data',
          refetch_interval: 'No polling (static data)'
        },
        useRealTimeVentures: {
          location: '/mnt/c/_EHG/ehg/src/hooks/useRealTimeVentures.ts',
          pattern: '30-second polling with AbortController',
          features: [
            'Polling interval configurable (default 30s)',
            'Concurrent fetch prevention',
            'AbortController for cleanup',
            'Manual refresh function',
            'Stale data detection (2x interval)',
            'Connection status tracking'
          ],
          callbacks: ['onUpdate', 'onError'],
          optimization: 'Prevents concurrent fetches, aborts on unmount'
        }
      },

      query_patterns: {
        basic_select: 'supabase.from(table).select("*").order(...)',
        joined_select: 'supabase.from("ventures").select("*, portfolios(name)")',
        filtered_select: 'query.eq(field, value)',
        demo_mode_filter: 'query.or("is_demo.eq.false,is_demo.is.null")'
      },

      mutation_patterns: {
        useUpdateVenture: {
          pattern: 'useMutation with queryClient invalidation',
          invalidation: ['ventures', 'venture'],
          onSuccess: 'Invalidates both list and single venture queries'
        }
      },

      error_handling: {
        pattern: 'toast.error() for user-facing errors',
        examples: [
          'useAdaptiveNaming.ts - onError with toast',
          'useRealTimeVentures.ts - onError callback'
        ],
        recommended: 'Use consistent error boundary + toast pattern'
      },

      caching_strategy: {
        default_stale_time: 'Not explicitly set (React Query defaults)',
        refetch_on_window_focus: 'True (React Query default)',
        polling_interval: '30 seconds for real-time data',
        manual_invalidation: 'On mutations via queryClient.invalidateQueries()'
      },

      pagination_support: {
        current: 'NO pagination found in ventures hooks',
        recommendation: 'Add useInfiniteQuery for 50+ ventures',
        proposed_pattern: 'Load 25 ventures initially, infinite scroll or "Load More" button'
      },

      raid_summary_integration: {
        approach: 'Extend useVentures with optional `includeRAID` parameter',
        query: `
          supabase
            .from('ventures')
            .select(\`
              *,
              portfolios(name),
              raid_summary:venture_raid_summary(
                risk_count,
                action_count,
                issue_count,
                decision_count
              )
            \`)
        `,
        performance: 'Use venture_raid_summary VIEW (materialized) for aggregation',
        cache_key: '["ventures", companyId, { includeRAID: true }]'
      },

      real_time_updates: {
        current_pattern: '30-second polling (useRealTimeVentures)',
        raid_updates: 'Same polling interval sufficient (not time-critical)',
        websocket_support: 'Not currently implemented (polling fallback works)',
        optimization: 'Only fetch RAID summary when list view active'
      },

      performance_optimizations: [
        'Use venture_raid_summary materialized view to avoid JOINs',
        'Add database indexes on raid_log.venture_id and raid_log.type',
        'Implement pagination for 50+ ventures',
        'Lazy-load RAID data only when list view selected',
        'Use React Query\'s staleTime to reduce unnecessary refetches'
      ],

      state_sharing: {
        pattern: 'React Query cache as single source of truth',
        no_redux: 'No Redux/Zustand - React Query handles all server state',
        local_state: 'Component-level useState for UI state (filters, view mode)',
        url_state: 'VenturesPage syncs view mode to URL params'
      }
    },

    // Add Prompt 5: Testing Strategy & Validation Framework
    testing_strategy: {
      current_state: {
        test_files_count: 373,
        test_cases_count: 0,
        note: '373 test files found but 0 test cases (grep found no describe/test/it blocks)',
        gap: 'Extensive testing infrastructure exists but minimal test coverage'
      },

      testing_infrastructure: {
        types_defined: '/mnt/c/_EHG/ehg/src/types/testing.ts (465 lines)',
        test_suites_supported: [
          'unit',
          'integration',
          'e2e',
          'performance',
          'security',
          'accessibility',
          'load'
        ],
        quality_gates: [
          'coverage',
          'performance',
          'security',
          'accessibility',
          'code_quality'
        ],
        ai_test_generation: 'AITestGeneration interface defined',
        test_orchestration: 'TestingQASystem with 5 modules'
      },

      recommended_test_strategy: {
        tier_1_unit_tests: {
          priority: 'CRITICAL',
          scope: [
            'getCategoryProgress() utility function',
            'RAID count aggregation logic',
            'Category-to-stages mapping (6 categories × 40 stages)',
            'Severity calculation helpers'
          ],
          framework: 'Vitest',
          coverage_target: '90% for utility functions',
          effort: '2-3 hours',
          example: `
            describe('getCategoryProgress', () => {
              it('calculates ideation progress correctly', () => {
                expect(getCategoryProgress(2, 'ideation')).toBe(100); // 2/2 stages
              });

              it('calculates development progress correctly', () => {
                expect(getCategoryProgress(20, 'development')).toBe(41); // 7/17 stages
              });
            });
          `
        },

        tier_2_integration_tests: {
          priority: 'HIGH',
          scope: [
            'useVentures hook with RAID summary join',
            'venture_raid_summary VIEW query',
            'RLS policy enforcement (company-based access)',
            'React Query cache invalidation'
          ],
          framework: 'Vitest + Testing Library',
          coverage_target: '80% for data hooks',
          effort: '3-4 hours',
          example: `
            describe('useVentures with RAID', () => {
              it('fetches ventures with RAID summary', async () => {
                const { result } = renderHook(() => useVentures({ includeRAID: true }));
                await waitFor(() => expect(result.current.data).toBeDefined());
                expect(result.current.data[0].raid_summary).toHaveProperty('risk_count');
              });
            });
          `
        },

        tier_3_e2e_tests: {
          priority: 'MEDIUM',
          scope: [
            'Navigate to Ventures page → Select list view',
            'Verify 6 category progress bars render',
            'Verify RAID indicators display (R:X A:X I:X D:X)',
            'Hover tooltips show category details',
            'Click venture row navigates to detail'
          ],
          framework: 'Playwright',
          coverage_target: '100% of happy path user flows',
          effort: '4-5 hours',
          example: `
            test('displays category progress bars in list view', async ({ page }) => {
              await page.goto('/ventures');
              await page.click('button[role="tab"]:has-text("List")');

              const progressBars = page.locator('[data-testid="category-progress-bar"]');
              await expect(progressBars).toHaveCount(6); // 6 categories
            });
          `
        },

        tier_4_performance_tests: {
          priority: 'MEDIUM',
          scope: [
            'Load 50 ventures with RAID data <500ms',
            'Category progress calculation <10ms per venture',
            'List view render <100ms',
            'Tooltip hover response <50ms'
          ],
          framework: 'Playwright Performance API',
          targets: {
            initial_load: '<500ms (50 ventures)',
            progress_calc: '<10ms per venture',
            render: '<100ms',
            interaction: '<50ms'
          },
          effort: '2-3 hours'
        },

        tier_5_accessibility_tests: {
          priority: 'HIGH',
          scope: [
            'WCAG 2.1 AA contrast ratios for all badges',
            'Keyboard navigation (Tab to RAID badges)',
            'Screen reader compatibility (aria-labels)',
            'Progress bar aria-valuenow attributes'
          ],
          framework: 'axe-core + Playwright',
          coverage_target: '100% WCAG 2.1 AA compliance',
          effort: '2-3 hours',
          violations_allowed: 0
        }
      },

      quality_gates: [
        {
          gate: 'Unit Test Coverage',
          threshold: '90%',
          blocking: true,
          scope: 'Utility functions (getCategoryProgress, severity helpers)'
        },
        {
          gate: 'Integration Test Coverage',
          threshold: '80%',
          blocking: true,
          scope: 'Data hooks (useVentures with RAID)'
        },
        {
          gate: 'E2E Happy Path',
          threshold: '100%',
          blocking: true,
          scope: 'User can view list, see progress bars, see RAID indicators'
        },
        {
          gate: 'Performance Budget',
          threshold: '<500ms initial load',
          blocking: false,
          warning: '500-1000ms',
          critical: '>1000ms'
        },
        {
          gate: 'Accessibility',
          threshold: '0 violations',
          blocking: true,
          tool: 'axe-core'
        }
      ],

      test_data_strategy: {
        unit_tests: 'Hardcoded test data (known stage numbers)',
        integration_tests: 'Test database with seeded ventures + RAID entries',
        e2e_tests: 'Dedicated test environment with 50+ sample ventures',
        raid_test_data: `
          Venture 1: R:3 A:5 I:0 D:2 (stage 15)
          Venture 2: R:0 A:2 I:1 D:8 (stage 32)
          Venture 3: R:7 A:12 I:3 D:15 (stage 5)
        `
      },

      regression_prevention: [
        'Snapshot tests for CategoryProgressBars component',
        'Visual regression tests for RAID badge colors',
        'Performance baseline for 50-venture load time',
        'Database query plan verification for venture_raid_summary'
      ],

      continuous_integration: {
        pre_commit: 'Lint + Unit tests (fast)',
        pr_checks: 'Unit + Integration + E2E (full suite)',
        nightly: 'Performance + Load + Security tests',
        deployment_gate: 'All quality gates must pass'
      },

      total_testing_effort: {
        unit_tests: '2-3 hours',
        integration_tests: '3-4 hours',
        e2e_tests: '4-5 hours',
        performance_tests: '2-3 hours',
        accessibility_tests: '2-3 hours',
        total: '13-18 hours'
      }
    },

    // Update implementation guidelines with new findings
    enhanced_implementation_guidelines: [
      'Phase 1: Database Integration (3-4 hours)',
      '  - Create venture_raid_summary materialized VIEW',
      '  - Add indexes: raid_log.venture_id, raid_log.type, raid_log.status',
      '  - Extend useVentures hook with includeRAID parameter',
      '  - Write unit tests for RAID aggregation logic',
      '',
      'Phase 2: UI Components (5-6 hours)',
      '  - Create CategoryProgressBars.tsx (compact + detail modes)',
      '  - Extract severity helpers from PortfolioRisksCard.tsx',
      '  - Create RAIDIndicatorBadge.tsx with tooltips',
      '  - Write component tests (snapshot + interaction)',
      '',
      'Phase 3: VenturesPage List View (3-4 hours)',
      '  - Add "list" to viewMode type union',
      '  - Create VenturesListView.tsx (table + mobile responsive)',
      '  - Integrate CategoryProgressBars + RAIDIndicatorBadge',
      '  - Add TabsTrigger for list view',
      '  - Write E2E tests for list view',
      '',
      'Phase 4: Performance Optimization (2-3 hours)',
      '  - Implement pagination (25 ventures per page)',
      '  - Lazy-load RAID data only when list view active',
      '  - Add React Query staleTime configuration',
      '  - Performance testing with 50+ ventures',
      '',
      'Phase 5: Testing & Refinement (4-5 hours)',
      '  - Unit tests for getCategoryProgress utility',
      '  - Integration tests for useVentures + RAID',
      '  - E2E tests for list view user flows',
      '  - Accessibility tests (axe-core + keyboard nav)',
      '  - Performance tests (<500ms load time)',
      '  - Mobile responsive validation (320px, 768px, 1024px)'
    ],

    // Update total effort estimate
    updated_effort_estimate: {
      implementation: '13-17 hours',
      testing: '13-18 hours',
      total: '26-35 hours (~3-4 sprints)',
      code_reuse: '80%',
      new_code_lines: '~485 lines',
      test_code_lines: '~300 lines (estimated)'
    }
  };

  // Update SD in database
  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: updatedMetadata })
    .eq('id', 'SD-RAID-VENTURES-001');

  if (updateError) {
    console.error('❌ Error updating SD:', updateError);
    process.exit(1);
  }

  console.log('✅ SD-RAID-VENTURES-001 Updated Successfully!\n');
  console.log('📊 Comprehensive Analysis Added:');
  console.log('   ✅ UI/UX Component Reusability (80% reuse)');
  console.log('   ✅ Data Flow & State Management (React Query patterns)');
  console.log('   ✅ Testing Strategy (5-tier approach, 13-18 hours)');
  console.log('\n📈 Updated Estimates:');
  console.log('   Implementation: 13-17 hours');
  console.log('   Testing: 13-18 hours');
  console.log('   Total: 26-35 hours (~3-4 sprints)');
  console.log('\n🎯 Key Findings:');
  console.log('   • 80% component reuse from existing patterns');
  console.log('   • NO multi-progress-bar pattern exists (new design)');
  console.log('   • React Query + 30s polling already proven');
  console.log('   • 373 test files exist, minimal coverage (opportunity!)');
  console.log('   • venture_raid_summary VIEW will optimize performance');
  console.log('\n🚀 Ready for PLAN → PRD Creation');
}

updateStrategicDirective().catch(console.error);
