#!/usr/bin/env node

/**
 * Create PRD: SD-AGENT-ADMIN-003 (Database Sub-Agent Pattern)
 * Using direct database connection to bypass RLS issues
 */

import { createDatabaseClient } from '../../ehg/scripts/lib/supabase-connection.js';

console.log('📄 Creating PRD: SD-AGENT-ADMIN-003');
console.log('='.repeat(70));

let client;

try {
  client = await createDatabaseClient('engineer', {
    verify: true,
    verbose: true
  });

  console.log('');
  console.log('📝 Preparing comprehensive PRD data...\n');

  const prdSQL = `
    INSERT INTO product_requirements_v2 (
      id,
      directive_id,
      title,
      version,
      status,
      category,
      priority,
      executive_summary,
      business_context,
      technical_context,
      functional_requirements,
      non_functional_requirements,
      technical_requirements,
      system_architecture,
      data_model,
      ui_ux_requirements,
      implementation_approach,
      technology_stack,
      dependencies,
      test_scenarios,
      acceptance_criteria,
      performance_requirements,
      plan_checklist,
      exec_checklist,
      validation_checklist,
      risks,
      constraints,
      assumptions,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
    RETURNING id;
  `;

  const prdData = [
    // $1: id
    'PRD-AGENT-ADMIN-003',

    // $2: directive_id
    'SD-AGENT-ADMIN-003',

    // $3: title
    'AI Agent Management Platform - Complete Implementation',

    // $4: version
    '1.0.0',

    // $5: status
    'draft',

    // $6: category
    'agent-platform',

    // $7: priority
    'critical',

    // $8: executive_summary
    `This PRD covers the complete implementation of the AI Agent Management Platform, addressing all 57 backlog items from SD-AGENT-ADMIN-002 (which was marked complete but had 0/57 items implemented).

**Strategic Objectives:**
1. Enable rapid agent configuration (<60 seconds via presets)
2. Increase prompt reuse rate to >70% through library and versioning
3. Provide real-time performance visibility with 7d/30d/90d trends
4. Optimize search configuration for different use cases
5. Reduce configuration errors through validation and templates

**Scope:** 5 subsystems, 57 backlog items, 6 new database tables, 28 seed data records`,

    // $9: business_context
    `SD-AGENT-ADMIN-002 was marked "completed" with 100% progress, but investigation revealed:
- 57/57 backlog items NOT_STARTED
- All database tables empty (0 records)
- Seed data migration failed silently
- RLS policies blocking anon access
- UI queries wrong tables

**Business Impact:**
- Agent platform cannot launch without management UI
- No preset system = 10x longer agent setup time (10min vs <60s)
- No A/B testing = cannot optimize prompts systematically
- No performance monitoring = blind to agent quality issues

**Fresh Start Rationale:**
Create SD-AGENT-ADMIN-003 to ensure proper LEO Protocol flow (LEAD→PLAN→EXEC→PLAN→LEAD) and 100% requirement completion.`,

    // $10: technical_context
    `**Existing Infrastructure (30%):**
- AgentSettingsTab.tsx (654 LOC, functional preset management)
- AgentPresetsTab.tsx (658 LOC, complete CRUD operations)
- Recharts library (113+ components available)
- Radix UI library (complete)
- Supabase Auth (working)

**Must Build (70%):**
- @monaco-editor/react integration
- A/B testing statistical framework (jStat)
- 6 new database tables
- Performance alerts system
- Prompt versioning logic
- Two-way state sync (Zustand or Context)

**Database Status:**
- 7 existing tables (1 functional, 6 empty requiring seed data)
- 6 new tables required
- 3 RLS policy updates needed
- 28 seed data records to create`,

    // $11: functional_requirements (JSONB array)
    JSON.stringify([
      {
        id: 'FR-1',
        category: 'Preset Management',
        priority: 'HIGH',
        requirements: [
          'View/create/apply/edit/delete presets',
          'Export/import presets (JSON backup)',
          'Preset usage statistics tracking',
          'Configuration validation before save',
          'Preview preset before applying',
          'Categorization by use case',
          'Two-way sync with AgentSettingsTab'
        ]
      },
      {
        id: 'FR-2',
        category: 'Prompt Library + A/B Testing',
        priority: 'CRITICAL',
        requirements: [
          'Browse prompts by category (system/user/assistant/function/custom)',
          'Create/edit/version prompt templates',
          'Tag and search prompts',
          'Test prompts before deployment',
          'Create A/B tests with 2-4 variants',
          'Monitor active A/B tests',
          'View results with statistical confidence (p<0.05)',
          'Visualize results (Recharts)',
          'Declare winning variant and deploy',
          'Automatic A/B test data collection',
          'Historical test results',
          'Clone tests for re-testing',
          'Prevent invalid test configurations',
          'Monaco editor keyboard shortcuts',
          'Link prompts to agent roles'
        ]
      },
      {
        id: 'FR-3',
        category: 'Agent Settings Integration',
        priority: 'HIGH',
        requirements: [
          'Load preset from AgentSettingsTab',
          'Save current settings as new preset',
          'Show active preset indicator',
          'Reset settings to active preset',
          'Update existing preset with current settings',
          'Real-time sync between tabs',
          'Keyboard shortcuts in AgentSettingsTab'
        ]
      },
      {
        id: 'FR-4',
        category: 'Search Preference Engine',
        priority: 'MEDIUM',
        requirements: [
          'Select default search engine (Google/Bing/DuckDuckGo/Custom)',
          'Configure results per page (10-100)',
          'Enable/disable safe search',
          'Set region and language preferences',
          'Configure custom search endpoint',
          'Test search configuration',
          'Configure result filtering',
          'Set timeout preferences (10-60s)',
          'Cache search preferences',
          'View search usage statistics'
        ]
      },
      {
        id: 'FR-5',
        category: 'Advanced Performance Dashboard',
        priority: 'HIGH',
        requirements: [
          'View historical performance trends (7d/30d/90d)',
          'Compare performance across agents',
          'Drill down by capability',
          'Set performance alerts',
          'View active alerts',
          'Export performance reports (CSV/PDF)',
          'Highlight performance anomalies',
          'Customize dashboard layout',
          'Real-time data loading (30s refresh)',
          'Performance metrics summary cards'
        ]
      }
    ]),

    // $12: non_functional_requirements (JSONB array)
    JSON.stringify([
      { requirement: 'Page load time <2 seconds', category: 'Performance', priority: 'HIGH' },
      { requirement: 'Monaco typing latency <100ms', category: 'Performance', priority: 'HIGH' },
      { requirement: 'Dashboard rendering <2 seconds with 7d/30d/90d data', category: 'Performance', priority: 'MEDIUM' },
      { requirement: 'WCAG 2.1 AA accessibility compliance', category: 'Accessibility', priority: 'HIGH' },
      { requirement: 'Responsive design: 320px (mobile), 768px (tablet), 1024px+ (desktop)', category: 'Responsiveness', priority: 'HIGH' },
      { requirement: 'Component sizing: 300-800 LOC (optimal 300-600)', category: 'Maintainability', priority: 'MEDIUM' },
      { requirement: 'RLS policies enforce user data isolation', category: 'Security', priority: 'CRITICAL' },
      { requirement: 'Input validation prevents injection attacks', category: 'Security', priority: 'CRITICAL' },
      { requirement: 'Zero critical bugs in preset/prompt management post-launch', category: 'Quality', priority: 'CRITICAL' }
    ]),

    // $13: technical_requirements (JSONB array)
    JSON.stringify([
      { requirement: '@monaco-editor/react for code editing', type: 'npm_package', status: 'required' },
      { requirement: 'recharts (already installed)', type: 'npm_package', status: 'existing' },
      { requirement: 'jstat for A/B testing statistical calculations', type: 'npm_package', status: 'required' },
      { requirement: 'date-fns for date formatting', type: 'npm_package', status: 'required' },
      { requirement: 'prompt_templates table', type: 'database', status: 'required', priority: 'CRITICAL' },
      { requirement: 'prompt_ab_tests table', type: 'database', status: 'required', priority: 'CRITICAL' },
      { requirement: 'ab_test_results table', type: 'database', status: 'required', priority: 'CRITICAL' },
      { requirement: 'search_preferences table', type: 'database', status: 'required', priority: 'MEDIUM' },
      { requirement: 'agent_executions table (partitioned monthly)', type: 'database', status: 'required', priority: 'HIGH' },
      { requirement: 'performance_alerts table', type: 'database', status: 'required', priority: 'HIGH' },
      { requirement: 'Seed data for 6 existing tables (28 records)', type: 'database', status: 'required', priority: 'CRITICAL' },
      { requirement: 'RLS policy updates for 3 tables (anon SELECT)', type: 'database', status: 'required', priority: 'HIGH' }
    ]),

    // $14: system_architecture
    `**Technology Stack:**
- Frontend: React 18 + TypeScript
- UI Library: Radix UI (complete library available)
- Code Editor: @monaco-editor/react (syntax highlighting, IntelliSense)
- Visualization: Recharts (113+ components available)
- State Management: Zustand or React Context (for two-way sync)
- Styling: Tailwind CSS
- Build Tool: Vite
- Database: Supabase PostgreSQL
- Realtime: Supabase Realtime subscriptions
- Authentication: Supabase Auth (existing)
- Storage: Supabase Storage (for exports)

**Component Architecture:**
- Target: 300-600 LOC per component
- Pattern: Leverage existing AgentSettingsTab/AgentPresetsTab patterns (654/658 LOC)
- Organization: Feature-based folders (preset/, prompt/, search/, performance/)
- State: Zustand store for cross-tab sync, local state for component-specific

**Database Architecture:**
- 6 new tables with proper indexes
- Partitioning for agent_executions (monthly, >1M rows)
- RLS policies for data isolation
- Materialized views for dashboard aggregations
- BRIN indexes for time-series queries`,

    // $15: data_model (JSONB object)
    JSON.stringify({
      new_tables: [
        {
          name: 'prompt_templates',
          columns: ['id', 'name', 'description', 'content', 'variables', 'category', 'tags', 'agent_roles', 'created_by', 'created_at', 'updated_at', 'version', 'parent_version_id', 'status', 'usage_count', 'avg_token_count', 'metadata'],
          indexes: ['category', 'status', 'tags (GIN)', 'created_at DESC', 'usage_count DESC'],
          rls: 'Anon SELECT active, authenticated INSERT/UPDATE own, admins all'
        },
        {
          name: 'prompt_ab_tests',
          columns: ['id', 'name', 'description', 'prompt_template_id', 'variant_a_content', 'variant_b_content', 'variant_c_content', 'variant_d_content', 'traffic_split', 'success_metric', 'sample_size', 'confidence_level', 'metrics', 'results', 'status', 'winner', 'statistical_significance', 'started_at', 'completed_at', 'created_by', 'created_at', 'updated_at', 'metadata'],
          indexes: ['status', 'prompt_template_id', 'started_at DESC'],
          rls: 'Anon SELECT running, authenticated INSERT/UPDATE own, admins all'
        },
        {
          name: 'ab_test_results',
          columns: ['id', 'test_id', 'variant', 'execution_id', 'outcome', 'score', 'latency_ms', 'token_count', 'created_at'],
          indexes: ['test_id', 'variant', 'created_at DESC'],
          rls: 'Anon SELECT for running tests, admins all'
        },
        {
          name: 'search_preferences',
          columns: ['id', 'name', 'description', 'user_id', 'agent_key', 'default_engine', 'results_per_page', 'safe_search', 'region', 'language', 'custom_endpoint', 'filter_config', 'timeout_seconds', 'cache_enabled', 'cache_ttl_minutes', 'is_default', 'is_locked', 'usage_count', 'created_at', 'updated_at', 'metadata'],
          indexes: ['user_id', 'agent_key', 'is_default'],
          rls: 'Users own profiles, admins all + lock defaults, anon read defaults'
        },
        {
          name: 'agent_executions',
          columns: ['id', 'agent_key', 'agent_type', 'department', 'user_id', 'execution_type', 'started_at', 'completed_at', 'duration_ms (generated)', 'token_count', 'cost_usd', 'status', 'error_message', 'error_type', 'quality_score', 'input_params', 'output_summary', 'metadata', 'created_at'],
          indexes: ['agent_key', 'started_at DESC', 'status', 'user_id', 'department', 'created_at BRIN'],
          partitioning: 'RANGE (started_at) - monthly partitions',
          rls: 'Users own executions, admins all, anon aggregate stats only'
        },
        {
          name: 'performance_alerts',
          columns: ['id', 'name', 'description', 'alert_type', 'condition', 'threshold_value', 'comparison', 'time_window_minutes', 'notification_channels', 'enabled', 'last_triggered', 'trigger_count', 'created_by', 'created_at', 'updated_at', 'metadata'],
          indexes: ['enabled', 'alert_type'],
          rls: 'Admins full access, users read-only own alerts'
        }
      ],
      existing_tables_requiring_seed_data: [
        { name: 'agent_departments', records: 11 },
        { name: 'agent_tools', records: 8 },
        { name: 'crewai_agents', records: 4 },
        { name: 'crewai_crews', records: 1 },
        { name: 'crew_members', records: 4 }
      ],
      existing_tables_functional: [
        { name: 'agent_configs', status: 'FUNCTIONAL', usage: 'Preset management' }
      ]
    }),

    // $16: ui_ux_requirements (JSONB array)
    JSON.stringify([
      { component: 'Preset Management UI', requirements: 'Grid view with search/filter, CRUD modals, export/import buttons, usage stats badges', priority: 'HIGH' },
      { component: 'Prompt Library UI', requirements: 'Monaco editor integration, category tabs, tag search, version history', priority: 'CRITICAL' },
      { component: 'A/B Testing UI', requirements: 'Test creation wizard, active tests dashboard, results visualization (Recharts), winner selection UI', priority: 'CRITICAL' },
      { component: 'Search Preferences UI', requirements: 'Form with validation, test button, usage stats display', priority: 'MEDIUM' },
      { component: 'Performance Dashboard', requirements: 'Summary cards, timeframe selector (7d/30d/90d), comparison tool, alert indicators, Recharts integration', priority: 'HIGH' },
      { component: 'Two-way Sync Indicator', requirements: 'Active preset badge, sync status icon, change notifications', priority: 'HIGH' },
      { component: 'Keyboard Shortcuts', requirements: 'Documented shortcuts, modal with command palette', priority: 'MEDIUM' }
    ]),

    // $17: implementation_approach
    `**Phase 1: Database Setup + Preset Management (2-3 days)**
- Seed data for 6 existing tables (28 records)
- RLS policy updates (3 tables)
- Preset Management subsystem (12 items)
- Two-way sync with AgentSettingsTab
- E2E tests for all preset operations

**Phase 2: Prompt Library + Monaco Integration (3-4 days)**
- prompt_templates table creation
- Monaco editor integration
- Prompt CRUD operations
- Prompt versioning
- Tag search functionality
- E2E tests for prompt management

**Phase 3: A/B Testing Framework (2-3 days)**
- prompt_ab_tests, ab_test_results tables
- A/B test creation flow
- Statistical calculations (jStat)
- Results visualization (Recharts)
- Winner selection and deployment
- E2E tests for A/B workflow

**Phase 4: Search Preferences + Performance Dashboard (2-3 days)**
- search_preferences table
- Search configuration UI
- agent_executions table (partitioned)
- performance_alerts table
- Performance dashboard with Recharts
- Alert system
- E2E tests for search and performance

**Phase 5: Integration + QA (1-2 days)**
- Complete two-way sync
- Keyboard shortcuts
- Accessibility fixes
- Performance optimization
- Final E2E test run (all 57 stories)
- Test evidence collection`,

    // $18: technology_stack (JSONB array)
    JSON.stringify([
      { name: 'React', version: '18', type: 'framework', status: 'existing' },
      { name: 'TypeScript', version: 'latest', type: 'language', status: 'existing' },
      { name: 'Vite', version: 'latest', type: 'build_tool', status: 'existing' },
      { name: 'Tailwind CSS', version: '3', type: 'styling', status: 'existing' },
      { name: 'Radix UI', version: 'latest', type: 'ui_library', status: 'existing' },
      { name: 'Recharts', version: '^2.10.0', type: 'visualization', status: 'existing' },
      { name: '@monaco-editor/react', version: 'latest', type: 'code_editor', status: 'required' },
      { name: 'jstat', version: 'latest', type: 'statistics', status: 'required' },
      { name: 'date-fns', version: '^2.30.0', type: 'utilities', status: 'required' },
      { name: 'Zustand', version: 'latest', type: 'state_management', status: 'required' },
      { name: 'Supabase', version: 'latest', type: 'backend', status: 'existing' }
    ]),

    // $19: dependencies (JSONB array)
    JSON.stringify([
      { dependency: 'Database migration: 6 new tables created', type: 'database', criticality: 'CRITICAL', status: 'pending' },
      { dependency: 'Seed data: 28 records inserted', type: 'database', criticality: 'CRITICAL', status: 'pending' },
      { dependency: 'RLS policies: 3 tables updated for anon access', type: 'database', criticality: 'HIGH', status: 'pending' },
      { dependency: 'npm install: @monaco-editor/react, jstat, date-fns', type: 'npm', criticality: 'HIGH', status: 'pending' },
      { dependency: 'AgentSettingsTab: Existing component (leverage)', type: 'code', criticality: 'MEDIUM', status: 'existing' },
      { dependency: 'AgentPresetsTab: Existing component (leverage)', type: 'code', criticality: 'MEDIUM', status: 'existing' }
    ]),

    // $20: test_scenarios (JSONB array) - Will be replaced by user stories, but include key scenarios
    JSON.stringify([
      { scenario: 'Preset Management: User creates preset from current settings, applies to another agent', expected: 'Settings sync correctly, confirmation shown', priority: 'HIGH' },
      { scenario: 'Prompt Library: User creates prompt template with Monaco editor, versions it, searches by tag', expected: 'Monaco loads <100ms, version increments, search finds tagged prompts', priority: 'CRITICAL' },
      { scenario: 'A/B Testing: User creates test with 2 variants, runs 100 executions, declares winner', expected: 'Statistical significance calculated (p<0.05), winning variant deployed', priority: 'CRITICAL' },
      { scenario: 'Search Preferences: User configures custom search endpoint, tests configuration', expected: 'Test query succeeds, results displayed', priority: 'MEDIUM' },
      { scenario: 'Performance Dashboard: User views 30d trends, sets latency alert, receives notification', expected: 'Dashboard loads <2s, alert triggers when threshold exceeded', priority: 'HIGH' },
      { scenario: 'Two-way Sync: User changes setting in AgentSettingsTab, preset updates automatically', expected: 'Change reflects in AgentPresetsTab within 100ms', priority: 'HIGH' }
    ]),

    // $21: acceptance_criteria (JSONB array)
    JSON.stringify([
      'All 57 backlog items implemented with passing acceptance criteria',
      'Agent configuration time <60 seconds using presets',
      'Prompt reuse rate >70% within 30 days',
      'A/B tests complete with statistical confidence (p<0.05)',
      'Performance trends visible for 7d/30d/90d timeframes',
      'All CRUD operations working (presets, prompts, tests, search prefs)',
      'Two-way sync between AgentSettingsTab and AgentPresetsTab working (<100ms latency)',
      'Monaco editor loads with <100ms typing latency',
      'Recharts visualizations render on desktop/tablet/mobile',
      'Page load time <2 seconds (Monaco lazy loaded)',
      'WCAG 2.1 AA accessibility compliance verified',
      'Responsive design tested: 320px (mobile), 768px (tablet), 1024px+ (desktop)',
      'RLS policies enforce user data isolation (tested with multiple users)',
      'Input validation prevents injection attacks (security audit passed)',
      'Component sizing: 300-800 LOC (optimal 300-600)',
      'Build successful with no errors',
      '100% user story coverage with E2E tests (Playwright)',
      'Zero critical bugs in preset/prompt management post-launch'
    ]),

    // $22: performance_requirements (JSONB object)
    JSON.stringify({
      page_load: { target: '<2 seconds', critical_path: 'Monaco lazy loaded via code splitting' },
      dashboard_load: { target: '<2 seconds', data_range: '7d/30d/90d trends' },
      agent_configuration: { target: '<60 seconds', method: 'Using presets' },
      monaco_typing_latency: { target: '<100ms', measurement: 'Input lag from keypress to character render' },
      ab_test_statistical_confidence: { target: 'p<0.05', framework: 'jStat library' },
      two_way_sync: { target: '<100ms', measurement: 'Tab A change to Tab B update' },
      dashboard_refresh: { target: '30 seconds', method: 'Supabase Realtime subscriptions' }
    }),

    // $23: plan_checklist (JSONB array)
    JSON.stringify([
      { item: 'Database Architect sub-agent executed', status: 'COMPLETED', result_id: 'd1da4a7e-b1b6-4c4b-8881-8eceac8264c1' },
      { item: '5-step SD evaluation completed', status: 'COMPLETED' },
      { item: 'Backlog items reviewed (57 items)', status: 'COMPLETED' },
      { item: 'Existing infrastructure identified (30%)', status: 'COMPLETED' },
      { item: 'Gap analysis: backlog vs existing code', status: 'COMPLETED' },
      { item: 'PRD created with all required fields', status: 'IN_PROGRESS' },
      { item: 'User stories generated (57 items)', status: 'PENDING' },
      { item: 'Database migration files created', status: 'PENDING' },
      { item: 'Seed data validation script created', status: 'PENDING' },
      { item: 'PLAN→EXEC handoff created', status: 'PENDING' }
    ]),

    // $24: exec_checklist (JSONB array)
    JSON.stringify([
      { item: 'Navigate to /mnt/c/_EHG/ehg/ (verify pwd)', status: 'PENDING' },
      { item: 'Install npm dependencies (@monaco-editor/react, jstat, date-fns)', status: 'PENDING' },
      { item: 'Create 6 new database tables', status: 'PENDING' },
      { item: 'Insert seed data (28 records)', status: 'PENDING' },
      { item: 'Update RLS policies (3 tables)', status: 'PENDING' },
      { item: 'Implement Preset Management (12 items)', status: 'PENDING' },
      { item: 'Implement Prompt Library + Monaco (9 items)', status: 'PENDING' },
      { item: 'Implement A/B Testing Framework (9 items)', status: 'PENDING' },
      { item: 'Implement Agent Settings Integration (7 items)', status: 'PENDING' },
      { item: 'Implement Search Preferences (10 items)', status: 'PENDING' },
      { item: 'Implement Performance Dashboard (10 items)', status: 'PENDING' },
      { item: 'Two-way state sync implementation', status: 'PENDING' },
      { item: 'Keyboard shortcuts implementation', status: 'PENDING' },
      { item: 'Accessibility compliance (WCAG 2.1 AA)', status: 'PENDING' },
      { item: 'Responsive design testing (320px/768px/1024px+)', status: 'PENDING' },
      { item: 'Component sizing verified (300-600 LOC)', status: 'PENDING' },
      { item: 'Unit tests executed (Vitest)', status: 'PENDING' },
      { item: 'E2E tests executed (Playwright, 57 user stories)', status: 'PENDING' },
      { item: 'CI/CD pipelines green', status: 'PENDING' },
      { item: 'Test evidence collected (screenshots, reports)', status: 'PENDING' },
      { item: 'Git commits with SD-ID (Conventional Commits)', status: 'PENDING' },
      { item: 'EXEC→PLAN handoff created', status: 'PENDING' }
    ]),

    // $25: validation_checklist (JSONB array)
    JSON.stringify([
      { item: 'QA Engineering Director v2.0 executed', status: 'PENDING', priority: 'CRITICAL' },
      { item: 'DevOps Platform Architect verified CI/CD green', status: 'PENDING', priority: 'CRITICAL' },
      { item: 'Chief Security Architect reviewed RLS policies', status: 'PENDING', priority: 'HIGH' },
      { item: 'Principal Database Architect verified schema', status: 'COMPLETED', result_id: 'd1da4a7e-b1b6-4c4b-8881-8eceac8264c1' },
      { item: 'Senior Design Sub-Agent reviewed component sizing', status: 'PENDING', priority: 'MEDIUM' },
      { item: 'Performance Engineering Lead verified load times', status: 'PENDING', priority: 'MEDIUM' },
      { item: '100% user story E2E coverage confirmed', status: 'PENDING', priority: 'CRITICAL' },
      { item: 'All acceptance criteria met', status: 'PENDING', priority: 'CRITICAL' },
      { item: 'Testing learnings captured for retrospective', status: 'PENDING', priority: 'HIGH' },
      { item: 'PLAN→LEAD handoff created', status: 'PENDING', priority: 'HIGH' }
    ]),

    // $26: risks (JSONB array)
    JSON.stringify([
      { risk: 'Monaco editor bundle size', impact: 'Page load time >2 seconds', probability: 'MEDIUM', mitigation: 'Code splitting and lazy loading with React.lazy()', owner: 'EXEC' },
      { risk: 'A/B testing statistical framework complexity', impact: 'Incorrect confidence calculations', probability: 'LOW', mitigation: 'Use proven library (jStat), peer review algorithms, unit tests for calculations', owner: 'EXEC' },
      { risk: 'Two-way state sync race conditions', impact: 'Settings desync between tabs', probability: 'MEDIUM', mitigation: 'Use Zustand with debouncing, thorough E2E testing of sync scenarios', owner: 'EXEC' },
      { risk: 'RLS policy conflicts with existing auth', impact: 'Users see wrong data', probability: 'LOW', mitigation: 'Test policies with multiple users, audit logs, QA validation', owner: 'PLAN + EXEC' },
      { risk: 'Seed data failure recurrence (SD-AGENT-ADMIN-002)', impact: 'Empty tables like previous SD', probability: 'LOW', mitigation: 'Robust error handling, migration validation script with count verification', owner: 'PLAN' }
    ]),

    // $27: constraints (JSONB array)
    JSON.stringify([
      'Must leverage existing AgentSettingsTab/AgentPresetsTab (30% infrastructure)',
      'Monaco editor must be lazy loaded (bundle size constraint)',
      'Component sizing: 300-800 LOC maximum',
      'Database migrations must include validation scripts',
      'RLS policies must be tested with both anon and authenticated contexts',
      'E2E test coverage: 100% user stories (57 tests minimum)',
      'Target application: EHG (/mnt/c/_EHG/ehg/)',
      'LEO Protocol compliance: All phases (LEAD→PLAN→EXEC→PLAN→LEAD)'
    ]),

    // $28: assumptions (JSONB array)
    JSON.stringify([
      'Existing AgentSettingsTab and AgentPresetsTab are functional and can be leveraged',
      'Recharts library (113+ components) is already installed and working',
      'Radix UI library is complete and available',
      'Supabase Auth is working for authentication',
      'Database schema for 7 existing tables is correct (just needs seed data)',
      '@monaco-editor/react will integrate smoothly with React 18',
      'jStat library will provide accurate statistical calculations',
      'Zustand can handle two-way sync without race conditions (with proper debouncing)',
      'Users will adopt preset system and achieve >70% prompt reuse',
      'A/B testing will be used regularly for prompt optimization'
    ]),

    // $29: metadata (JSONB object)
    JSON.stringify({
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
      created_by: 'PLAN Agent (Database Sub-Agent Pattern)',
      leo_protocol_version: 'v4.2.0',
      target_application: 'EHG',
      target_path: '/mnt/c/_EHG/ehg/'
    })
  ];

  const result = await client.query(prdSQL, prdData);

  console.log('✅ PRD Created Successfully!');
  console.log('='.repeat(70));
  console.log(`\nPRD ID: ${result.rows[0].id}`);
  console.log(`\n📊 PRD Scope:`);
  console.log('   - 5 Strategic Objectives');
  console.log('   - 57 Backlog Items (5 subsystems)');
  console.log('   - 6 New Database Tables');
  console.log('   - 28 Seed Data Records');
  console.log('   - 3 RLS Policy Updates');
  console.log('   - 115 Story Points');
  console.log('   - 7-9 Days Estimated Effort');
  console.log(`\n✅ Success Metrics: 8 defined`);
  console.log(`✅ Acceptance Criteria: 18 items`);
  console.log(`✅ Risk Mitigation: 5 risks identified`);
  console.log(`✅ Implementation Phases: 5 phases planned`);
  console.log(`\n📝 Next Steps:`);
  console.log('   1. Generate 57 user stories from PRD');
  console.log('   2. Create database migration files for EHG app');
  console.log('   3. Create seed data validation script');
  console.log('   4. Create PLAN→EXEC handoff');

} catch (error) {
  console.error('\n❌ PRD Creation Failed:', error.message);
  process.exit(1);
} finally {
  if (client) {
    await client.end();
    console.log('\n📡 Database connection closed');
  }
}
