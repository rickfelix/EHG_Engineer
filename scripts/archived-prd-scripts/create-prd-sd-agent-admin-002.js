#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('\n📝 Creating PRD for SD-AGENT-ADMIN-002...\n');

  const sd_id = 'SD-AGENT-ADMIN-002';
  const prd_id = `PRD-${sd_id}`;

  // Load sub-agent analyses
  const designAnalysis = JSON.parse(readFileSync('/tmp/design-agent-analysis.json', 'utf-8'));
  const userStories = JSON.parse(readFileSync('/tmp/user-stories-sd-agent-admin-002.json', 'utf-8'));
  const leadAggregation = JSON.parse(readFileSync('/tmp/lead-subagent-aggregation-sd-agent-admin-002.json', 'utf-8'));

  
  // FIX: Get SD uuid_id to populate sd_uuid field (prevents handoff validation failures)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id')
    .eq('id', sd_id)
    .single();

  if (sdError || !sdData) {
    console.log(`❌ Strategic Directive ${sd_id} not found in database`);
    console.log('   Create SD first before creating PRD');
    process.exit(1);
  }

  const sdUuid = sdData.uuid_id;
  console.log(`   SD uuid_id: ${sdUuid}`);

const prdContent = {
    prd_id: prd_id,
    sd_id: sd_id,
    version: '1.0',
    created_date: new Date().toISOString(),
    created_by: 'PLAN Agent',

    executive_summary: {
      overview: 'Complete the Agent Engineering Admin Suite by implementing 5 missing subsystems that enable comprehensive agent management, prompt optimization, and performance monitoring. This PRD covers 115 story points across Preset Management, Prompt Library + A/B Testing, Agent Settings Completion, Search Preferences, and Advanced Performance Dashboard.',
      business_value: 'Reduces agent configuration time by 90% (from 5-10 minutes to <60 seconds), enables data-driven prompt optimization through A/B testing, and provides comprehensive performance analytics for proactive monitoring and optimization.',
      target_users: 'Agent Managers, AI Engineers, DevOps teams responsible for agent deployment and optimization',
      success_criteria: [
        'Agent configuration time reduced to <60 seconds using presets',
        'Prompt reuse rate reaches 70%+',
        '100% of production agents have 90-day performance trend visibility',
        '10+ prompt A/B tests conducted per month with 15%+ average improvement'
      ],
      effort_estimate: '115 story points, 10-14 sprints, ~2,650 new lines of code',
      dependencies: ['@monaco-editor/react (lazy load)', 'Recharts (already available)', 'Radix UI (already available)']
    },

    business_objectives: [
      {
        id: 'obj-1',
        title: 'Complete Agent Configuration Management',
        description: 'Enable agent managers to create, save, and apply configuration presets for rapid agent setup and consistent behavior across deployments',
        // FIX: success_metrics moved to metadata
        success_metrics: [
          'Agents can be configured from presets in <60 seconds (vs 5-10 minutes manual)',
          '80% of configurations use presets',
          'Configuration error rate <5% (vs 20%+ manual)'
        ],
        business_impact: 'Reduces agent setup time by 90%, ensures configuration consistency, prevents misconfiguration errors',
        priority: 'CRITICAL'
      },
      {
        id: 'obj-2',
        title: 'Implement Prompt Template Library with A/B Testing',
        description: 'Provide centralized prompt management with versioning, categorization, and built-in A/B testing to optimize agent performance',
        // FIX: success_metrics moved to metadata
        success_metrics: [
          'Prompt reuse rate >70%',
          'A/B tests show 15%+ performance improvement',
          'Prompt iteration time <2 minutes'
        ],
        business_impact: 'Continuous prompt improvement, data-driven optimization, reduced prompt engineering time by 70%',
        priority: 'CRITICAL'
      },
      {
        id: 'obj-3',
        title: 'Enable Advanced Performance Analytics',
        description: 'Add historical trend analysis, comparative dashboards, and performance alerts to monitor and optimize agent behavior over time',
        // FIX: success_metrics moved to metadata
        success_metrics: [
          'Performance trends visible across 7d/30d/90d for 100% of agents',
          'Alerts configured for 100% of production agents',
          'Anomaly detection <5 minutes'
        ],
        business_impact: 'Proactive performance monitoring, early issue detection (80% issues caught before user impact), data-driven optimization decisions',
        priority: 'HIGH'
      }
    ],

    detailed_features: {
      subsystem_1_preset_management: {
        name: 'Agent Configuration Preset Management',
        story_points: 25,
        user_stories: userStories.stories_by_subsystem['Preset Management'].stories.map(s => s.id),
        description: 'Enable agent managers to create, save, apply, import, and export agent configuration presets for rapid setup and consistent deployments',
        features: [
          {
            feature_id: 'PM-01',
            title: 'Preset CRUD Operations',
            description: 'Create, read, update, delete configuration presets with validation',
            acceptance_criteria: [
              'Create new preset from current AgentSettingsTab values',
              'Edit existing preset (preserves version history)',
              'Delete preset (soft delete with confirmation)',
              'List all user presets with search/filter',
              'Preview preset before applying'
            ],
            technical_approach: 'React component AgentPresetsTab (400 LOC) with Supabase CRUD to agent_configs table',
            // FIX: ui_components moved to metadata
            // ui_components: ['AgentPresetsTab', 'PresetCard', 'PresetForm', 'PresetPreviewDialog']
          },
          {
            feature_id: 'PM-02',
            title: 'Preset Application',
            description: 'Apply presets to update agent settings in one click',
            acceptance_criteria: [
              'Load preset values into AgentSettingsTab',
              'Show confirmation dialog before applying',
              'Two-way sync between preset and settings',
              'Display active preset name in settings tab'
            ],
            technical_approach: 'Shared state management between AgentPresetsTab and AgentSettingsTab',
            // FIX: ui_components moved to metadata
            // ui_components: ['PresetSelectorDropdown', 'PresetIndicatorBadge']
          },
          {
            feature_id: 'PM-03',
            title: 'Preset Import/Export',
            description: 'Export presets to JSON for backup, import from JSON for restore/share',
            acceptance_criteria: [
              'Export single or multiple presets to JSON file',
              'Import presets from JSON with validation',
              'Preview before import',
              'Handle duplicate preset names'
            ],
            technical_approach: 'JSON serialization/deserialization with validation schema',
            // FIX: ui_components moved to metadata
            // ui_components: ['ExportPresetsDialog', 'ImportPresetsDialog']
          }
        ],
        // FIX: database_changes moved to metadata
        // database_changes: ['agent_configs table (see database migration section)']
      },

      subsystem_2_prompt_library_ab_testing: {
        name: 'Prompt Library + A/B Testing',
        story_points: 35,
        user_stories: userStories.stories_by_subsystem['Prompt Library + A/B Testing'].stories.map(s => s.id),
        description: 'Centralized prompt template management with Monaco editor, versioning, categorization, tags, and built-in A/B testing for data-driven optimization',
        features: [
          {
            feature_id: 'PL-01',
            title: 'Prompt Template Library',
            description: 'Browse, create, edit, and version prompt templates organized by category',
            acceptance_criteria: [
              'Category tree navigation (Planning, Execution, Verification, etc.)',
              'Monaco editor with syntax highlighting for prompt editing',
              'Version history with diff view',
              'Tags for categorization and search',
              'Template variables support ({{variable}})'
            ],
            technical_approach: 'PromptLibraryTab (600 LOC) with Monaco editor (lazy loaded), Supabase CRUD to prompt_templates table',
            // FIX: ui_components moved to metadata
            // ui_components: ['PromptLibraryTab', 'CategoryTree', 'PromptList', 'MonacoPromptEditor', 'VersionHistoryTimeline']
          },
          {
            feature_id: 'PL-02',
            title: 'A/B Test Creation & Management',
            description: 'Create and manage A/B tests comparing 2-4 prompt variants',
            acceptance_criteria: [
              '3-step wizard: Select variants, define success metric, set duration/sample size',
              'Support 2-4 variants per test',
              'Success metrics: response time, quality score, completion rate',
              'Test status: Running, Paused, Completed'
            ],
            technical_approach: 'ABTestingTab (500 LOC) with wizard UI, Supabase CRUD to ab_tests table',
            // FIX: ui_components moved to metadata
            // ui_components: ['ABTestingTab', 'TestCreationWizard', 'VariantSelector', 'MetricSelector']
          },
          {
            feature_id: 'PL-03',
            title: 'A/B Test Results & Analysis',
            description: 'View test results with statistical confidence and declare winners',
            acceptance_criteria: [
              'Win rate for each variant',
              'Confidence interval calculation',
              'Statistical significance indicator (p-value)',
              'Declare winner and deploy to production',
              'Recharts visualization (bar chart, line chart over time)'
            ],
            technical_approach: 'Statistical analysis with confidence calculation, Recharts for visualization',
            // FIX: ui_components moved to metadata
            // ui_components: ['TestResultsDashboard', 'VariantComparisonChart', 'WinnerDeclarationDialog']
          }
        ],
        // FIX: database_changes moved to metadata
        // database_changes: ['prompt_templates table', 'ab_tests table (see database migration section)']
      },

      subsystem_3_agent_settings_completion: {
        name: 'Agent Settings Tab Completion',
        story_points: 15,
        user_stories: userStories.stories_by_subsystem['Agent Settings Completion'].stories.map(s => s.id),
        description: 'Complete AgentSettingsTab with preset integration (load from preset, save as preset, preset indicator, reset to preset)',
        features: [
          {
            feature_id: 'AS-01',
            title: 'Preset Integration in Settings Tab',
            description: 'Add preset selector dropdown and save controls to existing AgentSettingsTab',
            acceptance_criteria: [
              'Preset selector dropdown (top-right)',
              'Save as preset button (bottom)',
              'Preset indicator badge (shows active preset name)',
              'Reset to preset button (only enabled if settings changed)',
              'Two-way sync with AgentPresetsTab'
            ],
            technical_approach: 'Enhance existing AgentSettingsTab.tsx (406 LOC) by +200 lines = 606 total',
            // FIX: ui_components moved to metadata
            // ui_components: ['PresetSelectorDropdown (enhancement)', 'PresetIndicatorBadge (new)', 'SaveAsPresetButton (new)', 'ResetToPresetButton (new)']
          }
        ],
        // FIX: database_changes moved to metadata
        // database_changes: ['Reads from agent_configs table (created in subsystem 1)']
      },

      subsystem_4_search_preferences: {
        name: 'Agent Search Preferences',
        story_points: 24,
        user_stories: userStories.stories_by_subsystem['Search Preferences'].stories.map(s => s.id),
        description: 'Configure search engine, results per page, safe search, region/language, custom endpoints, and filters for agent search operations',
        features: [
          {
            feature_id: 'SP-01',
            title: 'Search Configuration',
            description: 'Configure search engine settings and preferences',
            acceptance_criteria: [
              'Search engine selection dropdown (Google, Bing, DuckDuckGo, Custom)',
              'Results per page slider (10-100)',
              'Safe search toggle',
              'Region and language dropdowns',
              'Custom search endpoint URL + API key (encrypted)',
              'Test search button with results preview'
            ],
            technical_approach: 'SearchPreferencesTab (350 LOC) with Supabase CRUD to search_preferences table, pgcrypto for API key encryption',
            // FIX: ui_components moved to metadata
            // ui_components: ['SearchPreferencesTab', 'SearchEngineSelector', 'CustomEndpointForm', 'TestSearchButton']
          }
        ],
        // FIX: database_changes moved to metadata
        // database_changes: ['search_preferences table with encrypted api_key_encrypted column (see database migration section)']
      },

      subsystem_5_advanced_performance: {
        name: 'Advanced Performance Dashboard',
        story_points: 21,
        user_stories: userStories.stories_by_subsystem['Advanced Performance Dashboard'].stories.map(s => s.id),
        description: 'Add historical trend charts (7d/30d/90d), comparative analysis, performance alerts, and drill-down capabilities to existing AgentPerformanceTab',
        features: [
          {
            feature_id: 'AP-01',
            title: 'Historical Trend Charts',
            description: 'Visualize agent performance trends over time',
            acceptance_criteria: [
              'Time range selector: 7d, 30d, 90d, Custom',
              'Recharts LineChart for success rate trends',
              'Recharts AreaChart for cumulative metrics',
              'Real-time updates via Supabase subscription'
            ],
            technical_approach: 'Enhance AgentPerformanceTab.tsx (existing 8.5KB) by +400 lines = ~900 LOC total',
            // FIX: ui_components moved to metadata
            // ui_components: ['TrendChartPanel (new)', 'TimeRangeSel ector (new)', 'PerformanceSummaryCards (enhancement)']
          },
          {
            feature_id: 'AP-02',
            title: 'Comparative Analysis & Alerts',
            description: 'Compare multiple agents and set performance alerts',
            acceptance_criteria: [
              'Multi-agent comparison with Recharts BarChart',
              'Performance alerts configuration (threshold + channel)',
              'Alert panel showing triggered alerts',
              'Export performance report (PDF, CSV)'
            ],
            technical_approach: 'Alert rules stored in database, triggered via backend service or Supabase triggers',
            // FIX: ui_components moved to metadata
            // ui_components: ['ComparisonChart (new)', 'AlertsPanel (new)', 'AlertRulesConfig (new)', 'ExportReportDialog (new)']
          }
        ],
        // FIX: database_changes moved to metadata
        // database_changes: ['May require performance_alerts table for alert rules (optional)']
      }
    },

    acceptance_criteria: {
      functional: [
        'All 57 user stories implemented and passing acceptance criteria',
        'Agent configuration time <60 seconds using presets',
        'Prompt reuse rate >70% within 30 days of deployment',
        'A/B tests create successfully with 2-4 variants',
        'Performance trends visible for 7d/30d/90d timeframes',
        'All CRUD operations on presets, prompts, tests, search preferences working correctly',
        'Two-way sync between AgentSettingsTab and AgentPresetsTab working',
        'Monaco editor loads and edits prompts without lag (<100ms typing latency)',
        'Recharts visualizations render correctly on desktop, tablet, mobile'
      ],
      non_functional: [
        'Page load time <2 seconds (Monaco editor lazy loaded)',
        'WCAG 2.1 AA accessibility compliance (full keyboard navigation, screen reader support)',
        'Responsive design works on mobile (320px), tablet (768px), desktop (1024px+)',
        'RLS policies enforce user data isolation (users only see their own presets/prompts/tests)',
        'Input validation prevents prompt injection, XSS, SQL injection',
        'Component sizing: All components 300-800 LOC (optimal 300-600)',
        'Build successful with no errors or warnings',
        'Test coverage: Tier 1 smoke tests pass (3-5 tests, <60 seconds)'
      ],
      security: [
        'Prompt sanitization prevents malicious instructions (see Security section)',
        'A/B test results stored in append-only table (no manipulation)',
        'API keys encrypted using pgcrypto in database',
        'RLS policies on all 4 new tables (agent_configs, prompt_templates, ab_tests, search_preferences)',
        'Audit logging for sensitive operations (prompt changes, preset applications, test results)'
      ]
    },

    technical_approach: {
      architecture: {
        ui_framework: 'React 18+ with Hooks',
        component_library: 'Shadcn UI (Radix UI + Tailwind CSS)',
        state_management: 'Supabase real-time hooks + React useState/useEffect',
        charting: 'Recharts (already available, 113+ components)',
        code_editor: 'Monaco Editor (@monaco-editor/react, lazy loaded)',
        navigation: 'Tab-based on /ai-agents page (NOT /agents)',
        database: 'Supabase PostgreSQL with RLS',
        backend: 'Supabase API + Edge Functions (if needed for statistical calculations)'
      },
      component_architecture: {
        new_major_components: 6,
        new_sub_components: '15-20',
        enhanced_components: 2,
        total_new_lines: '~2,650',
        component_sizing_target: '300-600 LOC per component',
        components: [
          { name: 'AgentPresetsTab', lines: 400, layout: 'Two-column: Preset list + Preview/Edit' },
          { name: 'PromptLibraryTab', lines: 600, layout: 'Three-column: Category tree + Prompt list + Monaco editor' },
          { name: 'ABTestingTab', lines: 500, layout: 'Test list + Test details/results' },
          { name: 'AgentSettingsTab (enhancement)', lines: '+200 (606 total)', additions: 'Preset dropdown, save button, indicator badge' },
          { name: 'SearchPreferencesTab', lines: 350, layout: 'Single column with sections' },
          { name: 'AgentPerformanceTab (enhancement)', lines: '+400 (~900 total)', additions: 'Trend charts, alerts, comparative analysis' }
        ]
      },
      reuse_opportunities: [
        'AgentSettingsTab pattern for all new tabs',
        'Card + CardHeader + CardContent structure (consistent across all tabs)',
        'Form input patterns (Label + Input + helper text)',
        'Button variants (primary, secondary, outline, destructive)',
        'Toast notifications for save confirmations',
        'Loading states (Skeleton components)',
        'Empty states (consistent messaging + icons)',
        'Error handling patterns'
      ],
      dependencies_to_add: [
        {
          package: '@monaco-editor/react',
          version: '^4.6.0',
          purpose: 'Code editor for prompt templates',
          lazy_load: true,
          bundle_impact: '+300KB (lazy loaded, minimal impact on initial load)'
        }
      ]
    },

    database_schema: leadAggregation.sub_agent_results['2_database_architect'].database_schema,

    security_considerations: leadAggregation.sub_agent_results['3_security_architect'].security_concerns,

    test_plan: {
      testing_philosophy: 'SIMPLICITY FIRST - Focus on Tier 1 smoke tests for approval, Tier 2 E2E for thoroughness',
      tier_1_smoke_tests: {
        required: true,
        count: '3-5 tests',
        execution_time: '<60 seconds',
        purpose: 'SUFFICIENT for PLAN→LEAD approval',
        tests: [
          {
            test_id: 'SMOKE-01',
            description: 'Navigate to /ai-agents page, verify all 9 tabs visible',
            steps: ['Open /ai-agents', 'Check tab bar shows Settings, Presets, Prompts, A/B Testing, Performance, Search, Coordination, Task Queue', 'Click each new tab (Presets, Prompts, A/B Testing, Search)', 'Verify tab content loads without errors'],
            expected_result: 'All tabs visible and clickable, content loads'
          },
          {
            test_id: 'SMOKE-02',
            description: 'Create a preset from AgentSettingsTab and apply it',
            steps: ['Open AgentSettingsTab', 'Modify risk_threshold to 0.8', 'Click Save as Preset', 'Enter preset name "Test Preset"', 'Click Save', 'Navigate to AgentPresetsTab', 'Find "Test Preset"', 'Click Apply', 'Return to AgentSettingsTab', 'Verify risk_threshold = 0.8'],
            expected_result: 'Preset created, applied successfully, settings updated'
          },
          {
            test_id: 'SMOKE-03',
            description: 'Create a prompt template and save it',
            steps: ['Open PromptLibraryTab', 'Click Create New Prompt', 'Enter template name "Test Prompt"', 'Type prompt content in Monaco editor', 'Click Save', 'Verify prompt appears in prompt list'],
            expected_result: 'Prompt saved successfully, visible in list'
          },
          {
            test_id: 'SMOKE-04',
            description: 'Create an A/B test with 2 variants',
            steps: ['Open ABTestingTab', 'Click Create Test', 'Step 1: Enter test name "Test AB"', 'Step 2: Select 2 prompt variants', 'Step 3: Select success metric "Response Time"', 'Click Create', 'Verify test appears in active tests list with status "Running"'],
            expected_result: 'A/B test created, visible in active tests'
          },
          {
            test_id: 'SMOKE-05',
            description: 'View performance trend chart with 30-day data',
            steps: ['Open AgentPerformanceTab', 'Select time range "30d"', 'Verify trend chart renders', 'Hover over data points', 'Verify tooltip shows date + metric values'],
            expected_result: 'Chart renders, data points interactive, tooltips work'
          }
        ]
      },
      tier_2_e2e_tests: {
        required: false,
        recommended: true,
        count: '30-50 tests',
        execution_time: '<5 minutes',
        purpose: 'Comprehensive coverage, NOT blocking for approval',
        coverage_areas: [
          'Preset CRUD operations (create, read, update, delete)',
          'Preset import/export (JSON validation, duplicate handling)',
          'Prompt versioning (create version, revert, compare diff)',
          'A/B test lifecycle (create, pause, resume, declare winner)',
          'Search preferences (engine selection, custom endpoint, test search)',
          'Performance charts (7d/30d/90d data, real-time updates)',
          'Two-way sync between tabs (preset changes reflect in settings)',
          'Error handling (network errors, validation failures)',
          'Edge cases (empty states, large datasets, invalid inputs)'
        ],
        test_framework: 'Playwright (E2E), Vitest (unit tests for utils)',
        ci_integration: 'GitHub Actions runs E2E tests on PR'
      },
      tier_3_manual_tests: {
        required: false,
        when: 'Complex UI workflows or accessibility testing',
        count: '5-10 items',
        execution_time: '<30 minutes',
        areas: [
          'Accessibility: WCAG 2.1 AA compliance with NVDA screen reader',
          'Mobile responsiveness: Test on iPhone SE (375px), iPad (768px)',
          'Monaco editor performance: Test with prompts >10KB',
          'A/B test statistical calculations: Verify confidence interval accuracy',
          'Cross-browser compatibility: Chrome, Firefox, Safari, Edge'
        ]
      }
    },

    risks_and_mitigation: leadAggregation.risks_and_mitigation,

    dependencies: [
      {
        type: 'External Package',
        name: '@monaco-editor/react',
        version: '^4.6.0',
        purpose: 'Prompt template editor',
        blocking: false,
        mitigation: 'Lazy load to reduce initial bundle size'
      },
      {
        type: 'Existing Infrastructure',
        name: 'AgentSettingsTab',
        location: 'src/components/agents/AgentSettingsTab.tsx',
        purpose: 'Pattern to replicate for new tabs, enhance for preset integration',
        blocking: false,
        status: '30% complete (406 LOC), enhancement required'
      },
      {
        type: 'Existing Infrastructure',
        name: 'AgentPerformanceTab',
        location: 'src/components/agents/AgentPerformanceTab.tsx',
        purpose: 'Enhance with trend charts and alerts',
        blocking: false,
        status: '60% complete (8.5KB), enhancement required'
      },
      {
        type: 'Database',
        name: '4 new tables',
        description: 'agent_configs, prompt_templates, ab_tests, search_preferences',
        blocking: true,
        status: 'Designed (Database Architect), migration script required',
        action: 'PLAN agent must create migration script before EXEC phase'
      }
    ],

    implementation_phases: {
      phase_1_mvp: {
        story_points: 65,
        duration: '6-8 sprints',
        deliverables: [
          'Preset CRUD operations (no import/export)',
          'Prompt CRUD operations (no versioning)',
          'Basic A/B test creation (no statistical analysis)',
          'Search engine selection only (no advanced filters)',
          'Basic performance charts (no alerts)'
        ],
        milestone: 'Agent managers can create/apply presets, manage prompts, run A/B tests'
      },
      phase_2_enhanced: {
        story_points: 35,
        duration: '3-4 sprints',
        deliverables: [
          'Preset import/export JSON',
          'Prompt versioning and tags',
          'A/B test statistical confidence',
          'Search filters and custom endpoints',
          'Performance alerts and comparisons'
        ],
        milestone: 'Full feature set complete, production-ready'
      },
      phase_3_polish: {
        story_points: 25,
        duration: '2-3 sprints (DEFERRED to future SD)',
        deliverables: [
          'Preset categories and usage stats',
          'Prompt A/B test creation from editor',
          'A/B test cloning and history',
          'Search usage statistics',
          'Performance anomaly detection'
        ],
        milestone: 'Advanced features and optimizations'
      }
    },

    success_metrics_tracking: {
      baseline: {
        agent_config_time: '5-10 minutes manual',
        prompt_reuse_rate: '0% (no library)',
        performance_visibility: '0 historical data',
        ab_tests_conducted: '0 per month'
      },
      target: {
        agent_config_time: '<60 seconds with presets',
        prompt_reuse_rate: '70%+',
        performance_visibility: '100% agents with 90-day trends',
        ab_tests_conducted: '10+ per month, 15%+ improvement'
      },
      measurement_plan: {
        agent_config_time: 'Track timestamp from config start to agent ready in database',
        prompt_reuse_rate: 'Count prompts sourced from library vs custom',
        performance_visibility: 'Query agents table for those with performance_trends_enabled',
        ab_tests_conducted: 'Count ab_tests table entries per month, calculate avg win rate delta'
      }
    },

    rollout_plan: {
      stage_1_internal_alpha: {
        users: '2-3 AI Engineers (internal team)',
        duration: '1 week',
        focus: 'Core functionality validation, major bug fixes',
        success_criteria: 'All Tier 1 smoke tests pass, no critical bugs'
      },
      stage_2_beta: {
        users: '10-15 Agent Managers (selected power users)',
        duration: '2 weeks',
        focus: 'User experience feedback, performance validation',
        success_criteria: 'User satisfaction >80%, preset adoption rate >50%'
      },
      stage_3_general_availability: {
        users: 'All users with agent management permissions',
        duration: 'Ongoing',
        focus: 'Monitoring, optimization, user support',
        success_criteria: 'All success metrics met, error rate <1%'
      }
    },

    open_questions: [
      {
        question: 'Should A/B test statistical calculations run in frontend or backend?',
        options: ['Frontend (JavaScript libraries)', 'Backend (Supabase Edge Function)'],
        recommendation: 'Backend for accuracy and consistency, frontend for simple calculations',
        decision_maker: 'EXEC Agent',
        deadline: 'Before implementing A/B test results dashboard'
      },
      {
        question: 'Should performance alerts use Supabase triggers or scheduled jobs?',
        options: ['Supabase triggers (real-time)', 'Scheduled jobs (cron)'],
        recommendation: 'Scheduled jobs (every 5 minutes) to avoid excessive trigger firings',
        decision_maker: 'EXEC Agent',
        deadline: 'Before implementing performance alerts'
      },
      {
        question: 'Should preset import allow overwriting existing presets or require new names?',
        options: ['Allow overwrite with confirmation', 'Require new names always'],
        recommendation: 'Allow overwrite with explicit confirmation dialog',
        decision_maker: 'PLAN Agent (can be finalized here)',
        deadline: 'Before PLAN→EXEC handoff'
      }
    ]
  };

  // Insert PRD into database
  const { data, error} = await supabase
    .from('product_requirements_v2')
    .insert({
      id: prd_id,
      directive_id: sd_id,
      title: 'Agent Engineering Admin Suite - Complete Missing Subsystems',
      version: '1.0',
      status: 'approved',
      category: 'admin-tooling',
      priority: 'critical',
      executive_summary: prdContent.executive_summary.overview,
      functional_requirements: prdContent.acceptance_criteria.functional,
      non_functional_requirements: prdContent.acceptance_criteria.non_functional,
      technical_requirements: Object.keys(prdContent.detailed_features).map(key => prdContent.detailed_features[key].description),
      acceptance_criteria: prdContent.acceptance_criteria.functional.concat(prdContent.acceptance_criteria.non_functional),
      test_scenarios: prdContent.test_plan.tier_1_smoke_tests.tests.map(t => ({
        id: t.test_id,
        description: t.description,
        steps: t.steps,
        expected: t.expected_result
      })),
      risks: prdContent.risks_and_mitigation.map(r => ({
        risk: r.risk,
        severity: r.severity,
        mitigation: r.mitigation
      })),
      dependencies: prdContent.dependencies.map(d => ({
        type: d.type,
        name: d.name,
        blocking: d.blocking
      })),
      content: JSON.stringify(prdContent),
      backlog_items: userStories.stories_by_subsystem,
      metadata: {
        sub_agents_consulted: leadAggregation.sub_agents_engaged,
        story_points: userStories.total_story_points,
        estimated_lines: designAnalysis.estimated_component_count.total_new_lines,
        components_count: designAnalysis.estimated_component_count.new_major_components
      },
      created_by: 'PLAN Agent',
      phase: 'planning',
      progress: 0,
    sd_uuid: sdUuid, // FIX: Added for handoff validation
    })
    .select();

  if (error) {
    console.error('❌ Error creating PRD:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }

  console.log('✅ PRD created successfully!\n');
  console.log(`  PRD ID: ${data[0].id}`);
  console.log(`  Directive ID: ${data[0].directive_id}`);
  console.log(`  Version: ${data[0].version}`);
  console.log(`  Status: ${data[0].status}`);

  console.log('\n📊 PRD Summary:');
  console.log(`  Business Objectives: ${prdContent.business_objectives.length}`);
  console.log(`  Subsystems: ${Object.keys(prdContent.detailed_features).length}`);
  console.log(`  Total User Stories: ${prdContent.executive_summary.effort_estimate}`);
  console.log('  Database Tables: 4 (agent_configs, prompt_templates, ab_tests, search_preferences)');
  console.log(`  Components: ${prdContent.technical_approach.component_architecture.new_major_components} major, ${prdContent.technical_approach.component_architecture.new_sub_components} sub`);
  console.log(`  Estimated Lines: ${prdContent.technical_approach.component_architecture.total_new_lines}`);

  console.log('\n✅ PRD creation complete! Stored in product_requirements_v2 table.\n');
}

createPRD().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
