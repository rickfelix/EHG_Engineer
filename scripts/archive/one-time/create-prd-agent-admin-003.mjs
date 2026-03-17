#!/usr/bin/env node

/**
 * Create PRD: SD-AGENT-ADMIN-003
 * AI Agent Management Platform - Complete Implementation
 *
 * Purpose: Comprehensive PRD covering all 57 backlog items across 5 subsystems
 *
 * Source Data:
 * - SD-AGENT-ADMIN-003 metadata
 * - Database Architect analysis (ID: d1da4a7e-b1b6-4c4b-8881-8eceac8264c1)
 * - 57 backlog items from SD-AGENT-ADMIN-002
 * - LEAD→PLAN handoff (ID: ba5b03f4-0660-4875-a630-7f4edb3f7e42)
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

console.log('📄 Creating PRD: SD-AGENT-ADMIN-003');
console.log('='.repeat(70));
console.log('AI Agent Management Platform - Complete Implementation\n');

const prdData = {
  directive_id: 'SD-AGENT-ADMIN-003',
  title: 'AI Agent Management Platform - Complete Implementation',
  version: '1.0.0',
  status: 'draft',
  target_application: 'EHG',

  // Strategic Objectives (5 objectives from LEAD approval)
  objectives: [
    {
      id: 'OBJ-1',
      title: 'Enable Rapid Agent Configuration',
      description: 'Provide preset system for <60 second agent configuration',
      success_criteria: [
        'Agent configuration time <60 seconds using presets',
        'Preset creation and management interface functional',
        'Two-way sync between AgentSettingsTab and AgentPresetsTab working',
        'Preset export/import (JSON) working',
        'Preset usage statistics tracking implemented'
      ],
      priority: 'CRITICAL',
      business_value: 'Reduces agent setup overhead by 90% (from 10min to <60s)'
    },
    {
      id: 'OBJ-2',
      title: 'Increase Prompt Reuse and Quality',
      description: 'Build prompt library with versioning and A/B testing for >70% reuse rate',
      success_criteria: [
        'Prompt reuse rate >70% within 30 days of deployment',
        'Prompt library with Monaco editor integration functional',
        'Prompt versioning system working',
        'A/B tests complete with statistical confidence (p<0.05)',
        'A/B test visualization (Recharts) rendering correctly',
        'Winning variant deployment automated'
      ],
      priority: 'CRITICAL',
      business_value: 'Improves prompt quality through systematic testing and reuse'
    },
    {
      id: 'OBJ-3',
      title: 'Provide Real-Time Performance Visibility',
      description: 'Performance dashboard with 7d/30d/90d trends for proactive management',
      success_criteria: [
        'Performance dashboard loads <2 seconds with 7d/30d/90d trends',
        'Performance metrics summary cards displaying correctly',
        'Historical performance trends visible',
        'Agent comparison functionality working',
        'Performance alerts triggering correctly',
        'Drill-down by capability functional'
      ],
      priority: 'HIGH',
      business_value: 'Enables data-driven agent optimization and issue detection'
    },
    {
      id: 'OBJ-4',
      title: 'Optimize Search Configuration',
      description: 'Search preference engine for customizable agent search behavior',
      success_criteria: [
        'Search preference profiles created and saved',
        'Default search engine selection working',
        'Region/language preferences applied correctly',
        'Search configuration testing functional',
        'Search usage statistics tracked'
      ],
      priority: 'MEDIUM',
      business_value: 'Improves search quality and customization for different use cases'
    },
    {
      id: 'OBJ-5',
      title: 'Reduce Configuration Errors',
      description: 'Validation and templates to prevent agent configuration mistakes',
      success_criteria: [
        'Zero critical bugs in preset/prompt management post-launch',
        'Configuration validation preventing invalid states',
        'Template system for common agent configurations',
        'Error messages clear and actionable'
      ],
      priority: 'HIGH',
      business_value: 'Reduces support overhead and improves user experience'
    }
  ],

  // Feature Breakdown (57 backlog items mapped to 5 subsystems)
  features: [
    {
      subsystem: 'Preset Management',
      priority: 'HIGH',
      story_points: 25,
      items: [
        { id: 'PM-1', title: 'View all saved presets', description: 'Display list of all saved presets with search and filtering', acceptance: 'Presets grid displays with name, description, category, usage count' },
        { id: 'PM-2', title: 'Create new preset', description: 'Create new preset from current agent configuration', acceptance: 'Modal opens, form validates, preset saves to database' },
        { id: 'PM-3', title: 'Apply preset to agent', description: 'Load preset values into AgentSettingsTab', acceptance: 'Preset values populate all fields, confirmation shown' },
        { id: 'PM-4', title: 'Edit existing preset', description: 'Modify preset name, description, configuration', acceptance: 'Edit modal opens, changes save, grid updates' },
        { id: 'PM-5', title: 'Delete preset', description: 'Soft delete preset with confirmation', acceptance: 'Confirmation dialog, preset marked deleted, removed from grid' },
        { id: 'PM-6', title: 'Export preset to JSON', description: 'Download preset as JSON file for backup', acceptance: 'JSON file downloads with correct structure' },
        { id: 'PM-7', title: 'Import preset from JSON', description: 'Upload JSON file to create preset', acceptance: 'File upload validates, preset created, appears in grid' },
        { id: 'PM-8', title: 'View preset usage statistics', description: 'Show how many times preset has been applied', acceptance: 'Usage count displays, increments on apply' },
        { id: 'PM-9', title: 'Validate preset configuration', description: 'Check preset values before saving', acceptance: 'Validation errors shown, invalid presets cannot save' },
        { id: 'PM-10', title: 'Preview preset before applying', description: 'Show what will change before applying', acceptance: 'Diff view shows current vs preset values' },
        { id: 'PM-11', title: 'Categorize presets by use case', description: 'Organize presets into categories', acceptance: 'Category dropdown, filter by category working' },
        { id: 'PM-12', title: 'Two-way sync with AgentSettingsTab', description: 'Settings changes reflect in presets automatically', acceptance: 'Changes in settings update active preset, vice versa' }
      ]
    },
    {
      subsystem: 'Prompt Library + A/B Testing',
      priority: 'CRITICAL',
      story_points: 35,
      items: [
        { id: 'PL-1', title: 'Browse prompts by category', description: 'View prompts organized by system/user/assistant/function/custom', acceptance: 'Category tabs display, prompts filtered correctly' },
        { id: 'PL-2', title: 'Create new prompt template', description: 'Create prompt with Monaco editor', acceptance: 'Monaco editor loads, syntax highlighting works, prompt saves' },
        { id: 'PL-3', title: 'Edit prompt template', description: 'Modify existing prompt with versioning', acceptance: 'Edit creates new version, parent reference maintained' },
        { id: 'PL-4', title: 'Version prompt templates', description: 'Track prompt versions with parent links', acceptance: 'Version number increments, parent_version_id set correctly' },
        { id: 'PL-5', title: 'Tag prompts for search', description: 'Add tags to prompts for discovery', acceptance: 'Tag input works, tags save, search by tag functional' },
        { id: 'PL-6', title: 'Search prompts by tag/keyword', description: 'Full-text search across prompts', acceptance: 'Search returns relevant results, highlights matches' },
        { id: 'PL-7', title: 'Test prompt before deployment', description: 'Preview prompt with sample data', acceptance: 'Test panel renders, variables substituted, output shown' },
        { id: 'PL-8', title: 'Create A/B test with 2-4 variants', description: 'Set up A/B test comparing prompt variants', acceptance: 'Modal opens, 2-4 variants configurable, traffic split adjustable' },
        { id: 'PL-9', title: 'Monitor active A/B tests', description: 'Dashboard showing running tests', acceptance: 'Active tests list displays, real-time metrics update' },
        { id: 'PL-10', title: 'View A/B test results with statistical confidence', description: 'Display results with p-values and confidence intervals', acceptance: 'Results table shows metrics, statistical significance calculated' },
        { id: 'PL-11', title: 'Visualize A/B test results', description: 'Charts showing variant performance (Recharts)', acceptance: 'Bar chart compares variants, line chart shows trends over time' },
        { id: 'PL-12', title: 'Declare winning variant and deploy', description: 'Mark winner and promote to production', acceptance: 'Winner selection works, prompt updated, test marked complete' },
        { id: 'PL-13', title: 'Automatic A/B test data collection', description: 'Record test executions automatically', acceptance: 'Executions insert into ab_test_results, metrics aggregate correctly' },
        { id: 'PL-14', title: 'View historical test results', description: 'Browse past A/B tests and outcomes', acceptance: 'Completed tests list displays, results viewable' },
        { id: 'PL-15', title: 'Clone test for re-testing', description: 'Duplicate test configuration', acceptance: 'Clone button creates new test with same config' },
        { id: 'PL-16', title: 'Prevent invalid test configurations', description: 'Validate test setup before starting', acceptance: 'Validation errors shown, invalid tests cannot start' },
        { id: 'PL-17', title: 'Monaco editor keyboard shortcuts', description: 'Standard editor shortcuts (Cmd+S, Cmd+F, etc.)', acceptance: 'Shortcuts documented, all working' },
        { id: 'PL-18', title: 'Link prompts to agent roles', description: 'Associate prompts with specific agent roles', acceptance: 'Role dropdown works, filter by role functional' }
      ]
    },
    {
      subsystem: 'Agent Settings Integration',
      priority: 'HIGH',
      story_points: 15,
      items: [
        { id: 'AS-1', title: 'Load preset from AgentSettingsTab', description: 'Button to load preset into settings', acceptance: 'Load button opens preset picker, values populate settings' },
        { id: 'AS-2', title: 'Save current settings as new preset', description: 'Button to save current config as preset', acceptance: 'Save button opens dialog, preset created with current values' },
        { id: 'AS-3', title: 'Show active preset indicator', description: 'Display which preset is currently active', acceptance: 'Preset name shown in header, updates on load' },
        { id: 'AS-4', title: 'Reset settings to active preset', description: 'Revert changes back to preset values', acceptance: 'Reset button restores preset values, confirmation shown' },
        { id: 'AS-5', title: 'Update existing preset with current settings', description: 'Overwrite preset with new values', acceptance: 'Update button saves changes, confirmation shown' },
        { id: 'AS-6', title: 'Real-time sync between tabs', description: 'Changes in settings reflect in presets tab', acceptance: 'State synced via Zustand/Context, updates immediate' },
        { id: 'AS-7', title: 'Keyboard shortcuts in AgentSettingsTab', description: 'Quick actions via keyboard', acceptance: 'Shortcuts work (Cmd+S save, Cmd+L load, Cmd+R reset)' }
      ]
    },
    {
      subsystem: 'Search Preference Engine',
      priority: 'MEDIUM',
      story_points: 20,
      items: [
        { id: 'SP-1', title: 'Select default search engine', description: 'Choose Google/Bing/DuckDuckGo/Custom', acceptance: 'Dropdown shows options, selection saves' },
        { id: 'SP-2', title: 'Configure results per page', description: 'Set 10-100 results per page', acceptance: 'Number input validates range, saves to profile' },
        { id: 'SP-3', title: 'Enable/disable safe search', description: 'Toggle safe search filter', acceptance: 'Checkbox toggles, saves to profile' },
        { id: 'SP-4', title: 'Set region and language preferences', description: 'Select region (US/UK/etc) and language (en/es/etc)', acceptance: 'Dropdowns populate, selections save' },
        { id: 'SP-5', title: 'Configure custom search endpoint', description: 'URL input for custom search API', acceptance: 'URL validates, saves, used for custom engine' },
        { id: 'SP-6', title: 'Test search configuration', description: 'Run test query to verify setup', acceptance: 'Test button triggers search, results shown' },
        { id: 'SP-7', title: 'Configure result filtering', description: 'Set filters for search results', acceptance: 'Filter config saves, applied to searches' },
        { id: 'SP-8', title: 'Set timeout preferences', description: 'Configure search timeout (10-60s)', acceptance: 'Number input validates, timeout applied' },
        { id: 'SP-9', title: 'Cache search preferences', description: 'Cache results for faster repeat searches', acceptance: 'Cache toggle works, TTL configurable' },
        { id: 'SP-10', title: 'View search usage statistics', description: 'Show search count and patterns', acceptance: 'Usage stats display, updated on each search' }
      ]
    },
    {
      subsystem: 'Advanced Performance Dashboard',
      priority: 'HIGH',
      story_points: 20,
      items: [
        { id: 'PD-1', title: 'View historical performance trends', description: 'Charts for 7d/30d/90d timeframes', acceptance: 'Timeframe selector works, charts update' },
        { id: 'PD-2', title: 'Compare performance across agents', description: 'Side-by-side agent comparison', acceptance: 'Multi-select agents, comparison table displays' },
        { id: 'PD-3', title: 'Drill down by capability', description: 'Filter metrics by capability', acceptance: 'Capability dropdown works, metrics filter correctly' },
        { id: 'PD-4', title: 'Set performance alerts', description: 'Configure alerts for thresholds', acceptance: 'Alert form validates, alerts save to database' },
        { id: 'PD-5', title: 'View active alerts', description: 'List of triggered alerts', acceptance: 'Alert list displays, sorted by time' },
        { id: 'PD-6', title: 'Export performance reports', description: 'Download CSV/PDF of metrics', acceptance: 'Export button generates file, downloads correctly' },
        { id: 'PD-7', title: 'Highlight performance anomalies', description: 'Visual indicators for outliers', acceptance: 'Anomalies highlighted in charts, tooltips explain' },
        { id: 'PD-8', title: 'Customize dashboard layout', description: 'Drag-and-drop widget arrangement', acceptance: 'Widgets draggable, layout saves to localStorage' },
        { id: 'PD-9', title: 'Real-time data loading', description: 'Dashboard updates without refresh', acceptance: 'Data refreshes every 30s, loading states shown' },
        { id: 'PD-10', title: 'Performance metrics summary cards', description: 'Key metrics at a glance', acceptance: 'Cards display avg latency, success rate, cost, quality score' }
      ]
    }
  ],

  // Technical Architecture
  technical_architecture: {
    technology_stack: {
      frontend: 'React 18 + TypeScript',
      ui_library: 'Radix UI (complete library available)',
      code_editor: '@monaco-editor/react (syntax highlighting, IntelliSense)',
      visualization: 'Recharts (113+ components available)',
      state_management: 'Zustand or React Context (for two-way sync)',
      styling: 'Tailwind CSS',
      build_tool: 'Vite'
    },
    backend: {
      database: 'Supabase PostgreSQL',
      realtime: 'Supabase Realtime subscriptions',
      authentication: 'Supabase Auth (existing)',
      storage: 'Supabase Storage (for exports)'
    },
    database_schema: {
      existing_tables: [
        'agent_configs (LEVERAGE - already functional for presets)',
        'ai_ceo_agents (SEED DATA REQUIRED - 0 records)',
        'crewai_agents (SEED DATA REQUIRED - 4 research agents)',
        'agent_departments (SEED DATA REQUIRED - 11 departments)',
        'crewai_crews (SEED DATA REQUIRED - 1 crew)',
        'crew_members (SEED DATA REQUIRED - 4 assignments)',
        'agent_tools (SEED DATA REQUIRED - 8 tools)'
      ],
      new_tables_required: [
        'prompt_templates (CRITICAL - prompt library with versioning)',
        'prompt_ab_tests (CRITICAL - A/B test configurations)',
        'ab_test_results (CRITICAL - individual test execution results)',
        'search_preferences (MEDIUM - search configuration profiles)',
        'agent_executions (HIGH - performance data, partitioned monthly)',
        'performance_alerts (HIGH - alert configurations)'
      ],
      rls_policies: [
        'Update ai_ceo_agents: Add anon SELECT for active agents',
        'Update agent_departments: Add anon SELECT for all departments',
        'Update crew_members: Add anon SELECT for crew composition',
        'New tables: Anon SELECT for active/public data, authenticated for CRUD'
      ],
      seed_data: {
        total_records: 28,
        agent_departments: 11,
        agent_tools: 8,
        crewai_agents: 4,
        crewai_crews: 1,
        crew_members: 4
      }
    },
    infrastructure_leverage: {
      existing_components: [
        'AgentSettingsTab.tsx (654 LOC, functional preset management)',
        'AgentPresetsTab.tsx (658 LOC, complete CRUD operations)',
        'Recharts patterns from 113+ existing chart components',
        'Radix UI components (buttons, modals, dropdowns, tabs, sliders)',
        'Supabase real-time subscriptions (already working)'
      ],
      must_build: [
        '@monaco-editor/react integration (new npm dependency)',
        'A/B testing statistical framework (jStat library)',
        'Performance alerts system',
        'Prompt versioning logic',
        'Two-way state sync between tabs (Zustand or Context)',
        'Search preference engine'
      ]
    },
    performance_requirements: {
      page_load: '<2 seconds (Monaco lazy loaded via code splitting)',
      dashboard_load: '<2 seconds with 7d/30d/90d trends',
      agent_configuration: '<60 seconds using presets',
      monaco_typing_latency: '<100ms',
      ab_test_statistical_confidence: 'p<0.05'
    },
    component_sizing_targets: {
      optimal: '300-600 LOC per component',
      maximum: '800 LOC (must split if exceeded)',
      guidance: 'Preset Management tabs already demonstrate proper sizing (654/658 LOC)'
    }
  },

  // Acceptance Criteria (from investigation report + LEAD approval)
  acceptance_criteria: [
    'All 57 backlog items implemented with passing acceptance criteria',
    'Agent configuration time <60 seconds using presets',
    'Prompt reuse rate >70% within 30 days',
    'A/B tests create successfully with 2-4 variants',
    'Performance trends visible for 7d/30d/90d timeframes',
    'All CRUD operations working (presets, prompts, tests, search prefs)',
    'Two-way sync between AgentSettingsTab and AgentPresetsTab working',
    'Monaco editor loads with <100ms typing latency',
    'Recharts visualizations render on desktop/tablet/mobile',
    'Page load time <2 seconds (Monaco lazy loaded)',
    'WCAG 2.1 AA accessibility compliance',
    'Responsive design: 320px (mobile), 768px (tablet), 1024px+ (desktop)',
    'RLS policies enforce user data isolation',
    'Input validation prevents injection attacks',
    'Component sizing: 300-800 LOC (optimal 300-600)',
    'Build successful with no errors',
    'Test coverage: 100% user story coverage with E2E tests (Playwright)',
    'Zero critical bugs in preset/prompt management post-launch'
  ],

  // Risks and Mitigation
  risks: [
    {
      risk: 'Monaco editor bundle size',
      impact: 'Page load time >2 seconds',
      probability: 'MEDIUM',
      mitigation: 'Code splitting and lazy loading with React.lazy()',
      owner: 'EXEC'
    },
    {
      risk: 'A/B testing statistical framework complexity',
      impact: 'Incorrect confidence calculations',
      probability: 'LOW',
      mitigation: 'Use proven library (jStat), peer review algorithms, unit tests for calculations',
      owner: 'EXEC'
    },
    {
      risk: 'Two-way state sync race conditions',
      impact: 'Settings desync between tabs',
      probability: 'MEDIUM',
      mitigation: 'Use Zustand with debouncing, thorough E2E testing of sync scenarios',
      owner: 'EXEC'
    },
    {
      risk: 'RLS policy conflicts with existing auth',
      impact: 'Users see wrong data',
      probability: 'LOW',
      mitigation: 'Test policies with multiple users, audit logs, QA validation',
      owner: 'PLAN + EXEC'
    },
    {
      risk: 'Seed data failure recurrence (SD-AGENT-ADMIN-002)',
      impact: 'Empty tables like previous SD',
      probability: 'LOW',
      mitigation: 'Robust error handling, migration validation script with count verification',
      owner: 'PLAN'
    }
  ],

  // Dependencies
  dependencies: {
    database: [
      'Fix seed data for 6 existing tables (28 records total)',
      'Update RLS policies for 3 existing tables (anon SELECT)',
      'Create 6 new tables with proper indexes',
      'Create seed data validation script'
    ],
    npm_packages: [
      '@monaco-editor/react (code editor)',
      'recharts (already installed, visualization)',
      'jstat (A/B testing statistical calculations)',
      'date-fns (date formatting)'
    ],
    infrastructure: [
      'Supabase database migration applied',
      'RLS policies tested with anon and authenticated contexts',
      'Real-time subscriptions configured for dashboard updates'
    ]
  },

  // Testing Strategy
  testing_strategy: {
    unit_tests: {
      framework: 'Vitest',
      coverage_target: '50% minimum',
      focus: 'Business logic, calculations (A/B statistical significance), validation functions',
      location: 'tests/unit/'
    },
    e2e_tests: {
      framework: 'Playwright',
      coverage_target: '100% user story coverage (57 stories)',
      test_types: [
        'Smoke tests: Load all pages, no errors',
        'User flow tests: Complete workflows (create preset, run A/B test, etc.)',
        'Integration tests: Two-way sync, Monaco integration, Recharts rendering',
        'Accessibility tests: WCAG 2.1 AA compliance'
      ],
      test_evidence: 'Screenshots, videos (on failure), HTML reports',
      location: 'tests/e2e/'
    },
    performance_tests: {
      tools: 'Playwright trace viewer, Lighthouse',
      metrics: [
        'Page load time <2 seconds',
        'Monaco typing latency <100ms',
        'Dashboard rendering <2 seconds with 7d/30d/90d data'
      ]
    },
    testing_learnings: 'Captured in retrospective after each subsystem implementation'
  },

  // Success Metrics
  success_metrics: [
    'Agent configuration time <60 seconds using presets',
    'Prompt reuse rate >70% within 30 days of deployment',
    'A/B tests complete with statistical confidence (p<0.05)',
    'Performance dashboard loads <2 seconds with 7d/30d/90d trends',
    'Zero critical bugs in preset/prompt management post-launch',
    'All 57 backlog items implemented with passing E2E tests',
    '100% user story coverage in E2E test suite',
    'WCAG 2.1 AA accessibility compliance verified'
  ],

  // Implementation Phases
  implementation_phases: [
    {
      phase: 1,
      name: 'Database Setup + Preset Management',
      duration: '2-3 days',
      deliverables: [
        'Seed data for 6 existing tables (28 records)',
        'RLS policy updates (3 tables)',
        'Preset Management subsystem (12 items)',
        'Two-way sync with AgentSettingsTab'
      ],
      tests: 'E2E tests for all preset operations (12 user stories)'
    },
    {
      phase: 2,
      name: 'Prompt Library + Monaco Integration',
      duration: '3-4 days',
      deliverables: [
        'prompt_templates table',
        'Monaco editor integration',
        'Prompt CRUD operations',
        'Prompt versioning',
        'Tag search functionality'
      ],
      tests: 'E2E tests for prompt management (9 user stories)'
    },
    {
      phase: 3,
      name: 'A/B Testing Framework',
      duration: '2-3 days',
      deliverables: [
        'prompt_ab_tests table',
        'ab_test_results table',
        'A/B test creation flow',
        'Statistical calculations (jStat)',
        'Results visualization (Recharts)',
        'Winner selection and deployment'
      ],
      tests: 'E2E tests for A/B testing workflow (9 user stories)'
    },
    {
      phase: 4,
      name: 'Search Preferences + Performance Dashboard',
      duration: '2-3 days',
      deliverables: [
        'search_preferences table',
        'Search configuration UI',
        'agent_executions table (partitioned)',
        'performance_alerts table',
        'Performance dashboard with Recharts',
        'Alert system'
      ],
      tests: 'E2E tests for search and performance features (20 user stories)'
    },
    {
      phase: 5,
      name: 'Integration + QA',
      duration: '1-2 days',
      deliverables: [
        'Complete two-way sync',
        'Keyboard shortcuts',
        'Accessibility fixes',
        'Performance optimization',
        'Final E2E test run (all 57 stories)',
        'Test evidence collection'
      ],
      tests: 'Full regression testing, accessibility audit'
    }
  ],

  // Metadata
  metadata: {
    parent_sd: 'SD-AGENT-ADMIN-003',
    database_architect_result_id: 'd1da4a7e-b1b6-4c4b-8881-8eceac8264c1',
    lead_plan_handoff_id: 'ba5b03f4-0660-4875-a630-7f4edb3f7e42',
    total_backlog_items: 57,
    total_subsystems: 5,
    total_story_points: 115,
    estimated_effort: '7-9 days (56-71 hours)',
    existing_infrastructure_pct: 30,
    new_implementation_pct: 70,
    database_tables_new: 6,
    database_tables_existing: 7,
    seed_data_records: 28,
    rls_policy_updates: 3,
    created_by: 'PLAN Agent',
    leo_protocol_version: 'v4.2.0'
  }
};

try {
  console.log('📝 Inserting PRD into database...');

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating PRD:', error);
    process.exit(1);
  }

  console.log('\n✅ PRD Created Successfully!');
  console.log('='.repeat(70));
  console.log(`\n📋 PRD Details:`);
  console.log(`   ID: ${data.id}`);
  console.log(`   Title: ${data.title}`);
  console.log(`   Version: ${data.version}`);
  console.log(`   Status: ${data.status}`);
  console.log(`   Target Application: ${data.target_application}`);

  console.log(`\n📊 Scope:`);
  console.log(`   Objectives: ${data.objectives.length}`);
  console.log(`   Features: ${data.features.length} subsystems, 57 backlog items`);
  console.log(`   Acceptance Criteria: ${data.acceptance_criteria.length}`);
  console.log(`   Risks: ${data.risks.length}`);
  console.log(`   Implementation Phases: ${data.implementation_phases.length}`);

  console.log(`\n🗄️ Database:`);
  console.log(`   New Tables: 6`);
  console.log(`   Existing Tables: 7`);
  console.log(`   Seed Data Records: 28`);
  console.log(`   RLS Updates: 3`);

  console.log(`\n✅ Success Metrics:`);
  data.success_metrics.forEach((metric, i) => {
    console.log(`   ${i + 1}. ${metric}`);
  });

  console.log(`\n📝 Next Steps:`);
  console.log(`   1. Generate user stories (57) from PRD`);
  console.log(`   2. Create database migration files`);
  console.log(`   3. Create seed data validation script`);
  console.log(`   4. Create PLAN→EXEC handoff`);

} catch (err) {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
}
