#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('📋 Creating Implementation Specification');
console.log('='.repeat(60));
console.log('\nSD-AGENT-ADMIN-001: Agent Engineering Department Admin Tooling');
console.log('Total Scope: 115 story points, 5 subsystems, 23 user stories\n');

const implementationSpec = {
  overview: {
    description: 'Comprehensive specification for implementing Agent Engineering Department Admin Tooling',
    total_story_points: 115,
    total_sprints: '8-10',
    implementation_approach: 'Greenfield implementation in /mnt/c/_EHG/EHG application',
    target_directory: '/mnt/c/_EHG/EHG',
    estimated_loc: '~8,000 lines (components + tests + migrations)',
    dependencies_to_install: [
      '@monaco-editor/react',
      'diff-match-patch',
      'fuse.js',
      '@tanstack/react-virtual'
    ]
  },

  database_migrations: {
    location: '/mnt/c/_EHG/EHG/supabase/migrations/',
    files: [
      {
        filename: '001_create_agent_configs.sql',
        description: 'Modify existing or create agent_configs table with metadata JSONB',
        content: `
-- Agent configuration presets
CREATE TABLE IF NOT EXISTS agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  agent_key TEXT NOT NULL,
  configuration JSONB NOT NULL,
  metadata JSONB, -- { name, description, is_official, usage_count }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, agent_key)
);

CREATE INDEX idx_agent_configs_user_id ON agent_configs(user_id);
CREATE INDEX idx_agent_configs_agent_key ON agent_configs(agent_key);

-- RLS Policies
ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own configs + official"
  ON agent_configs FOR SELECT
  USING (user_id = auth.uid() OR metadata->>'is_official' = 'true');

CREATE POLICY "Users create own configs"
  ON agent_configs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own configs, admins can mark official"
  ON agent_configs FOR UPDATE
  USING (user_id = auth.uid() OR (auth.jwt()->>'user_metadata'->'role')::text = 'admin');
        `
      },
      {
        filename: '002_create_prompt_templates.sql',
        description: 'Prompt management with versioning',
        content: `
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  variables JSONB, -- { var_name: { type, description, example } }
  department TEXT,
  agent_keys TEXT[], -- Which agents use this prompt
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  parent_version_id UUID REFERENCES prompt_templates(id),
  status TEXT CHECK (status IN ('active', 'archived', 'testing')) DEFAULT 'active',
  metadata JSONB
);

CREATE INDEX idx_prompt_templates_department ON prompt_templates(department);
CREATE INDEX idx_prompt_templates_status ON prompt_templates(status);
CREATE INDEX idx_prompt_templates_agent_keys ON prompt_templates USING GIN(agent_keys);
CREATE INDEX idx_prompt_templates_created_at ON prompt_templates(created_at DESC);

-- RLS Policies
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All users view active prompts"
  ON prompt_templates FOR SELECT
  USING (status = 'active' OR created_by = auth.uid());

CREATE POLICY "Admins create prompts"
  ON prompt_templates FOR INSERT
  WITH CHECK ((auth.jwt()->>'user_metadata'->'role')::text = 'admin');

CREATE POLICY "Admins or creators edit prompts"
  ON prompt_templates FOR UPDATE
  USING ((auth.jwt()->>'user_metadata'->'role')::text = 'admin' OR created_by = auth.uid());
        `
      },
      {
        filename: '003_create_prompt_ab_tests.sql',
        description: 'A/B testing for prompts',
        content: `
CREATE TABLE prompt_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  prompt_id UUID REFERENCES prompt_templates,
  variant_a TEXT NOT NULL,
  variant_b TEXT NOT NULL,
  traffic_split JSONB DEFAULT '{"a": 50, "b": 50}',
  metrics JSONB, -- { quality_score, latency, cost, sample_size }
  status TEXT CHECK (status IN ('running', 'completed', 'stopped')) DEFAULT 'running',
  winner TEXT CHECK (winner IN (null, 'a', 'b', 'inconclusive')),
  statistical_significance JSONB, -- { p_value, confidence_interval }
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ab_tests_status ON prompt_ab_tests(status);
CREATE INDEX idx_ab_tests_prompt_id ON prompt_ab_tests(prompt_id);

-- RLS Policies
ALTER TABLE prompt_ab_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access AB tests"
  ON prompt_ab_tests FOR ALL
  USING ((auth.jwt()->>'user_metadata'->'role')::text = 'admin');

CREATE POLICY "Users view AB tests"
  ON prompt_ab_tests FOR SELECT
  USING (true);
        `
      },
      {
        filename: '004_create_search_preferences.sql',
        description: 'Search configuration profiles',
        content: `
CREATE TABLE search_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  user_id UUID REFERENCES auth.users,
  agent_key TEXT,
  preferences JSONB NOT NULL, -- { providers, max_results, geo_focus, date_range, content_types, allowlist, blocklist }
  is_default BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false, -- Admin-locked defaults
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_search_prefs_user_id ON search_preferences(user_id);
CREATE INDEX idx_search_prefs_agent_key ON search_preferences(agent_key);

-- RLS Policies
ALTER TABLE search_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own + unlocked defaults"
  ON search_preferences FOR SELECT
  USING (user_id = auth.uid() OR (is_default = true AND is_locked = false));

CREATE POLICY "Users create own profiles"
  ON search_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users edit own, admins lock defaults"
  ON search_preferences FOR UPDATE
  USING (user_id = auth.uid() OR (auth.jwt()->>'user_metadata'->'role')::text = 'admin');
        `
      },
      {
        filename: '005_create_agent_executions.sql',
        description: 'Performance monitoring data (partitioned)',
        content: `
CREATE TABLE agent_executions (
  id UUID DEFAULT gen_random_uuid(),
  agent_key TEXT NOT NULL,
  department TEXT,
  user_id UUID REFERENCES auth.users,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  latency_ms INTEGER,
  token_count INTEGER,
  cost_usd DECIMAL(10, 4),
  status TEXT CHECK (status IN ('success', 'error', 'timeout')),
  error_message TEXT,
  error_type TEXT,
  input_params JSONB,
  output_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, started_at)
) PARTITION BY RANGE (started_at);

-- Create first partition (current month)
CREATE TABLE agent_executions_2025_10 PARTITION OF agent_executions
  FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

-- Indexes on partition
CREATE INDEX idx_agent_exec_agent_key ON agent_executions(agent_key);
CREATE INDEX idx_agent_exec_started_at ON agent_executions(started_at DESC);
CREATE INDEX idx_agent_exec_status ON agent_executions(status);
CREATE INDEX idx_agent_exec_user_id ON agent_executions(user_id);

-- RLS Policies
ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own executions, admins view all"
  ON agent_executions FOR SELECT
  USING (user_id = auth.uid() OR (auth.jwt()->>'user_metadata'->'role')::text = 'admin');

CREATE POLICY "System inserts only (service role)"
  ON agent_executions FOR INSERT
  WITH CHECK (false); -- Prevent client inserts
        `
      },
      {
        filename: '006_create_performance_alerts.sql',
        description: 'Alert configurations',
        content: `
CREATE TABLE performance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  condition JSONB NOT NULL, -- { metric, operator, threshold }
  notification_channel JSONB, -- { type: 'email'|'slack', recipients }
  enabled BOOLEAN DEFAULT true,
  last_triggered TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_perf_alerts_enabled ON performance_alerts(enabled);

-- RLS Policies
ALTER TABLE performance_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access alerts"
  ON performance_alerts FOR ALL
  USING ((auth.jwt()->>'user_metadata'->'role')::text = 'admin');
        `
      },
      {
        filename: '007_create_materialized_view.sql',
        description: 'Pre-aggregated metrics for dashboard',
        content: `
CREATE MATERIALIZED VIEW agent_execution_metrics_daily AS
SELECT
  agent_key,
  DATE(started_at) as date,
  COUNT(*) as total_executions,
  AVG(latency_ms) as avg_latency,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency,
  SUM(token_count) as total_tokens,
  SUM(cost_usd) as total_cost,
  COUNT(*) FILTER (WHERE status = 'success') * 100.0 / COUNT(*) as success_rate
FROM agent_executions
WHERE started_at > NOW() - INTERVAL '30 days'
GROUP BY agent_key, DATE(started_at);

CREATE INDEX ON agent_execution_metrics_daily (agent_key, date DESC);

-- Refresh strategy (via pg_cron or manual)
-- SELECT cron.schedule('refresh-metrics', '*/5 * * * *', 'REFRESH MATERIALIZED VIEW agent_execution_metrics_daily');
        `
      }
    ]
  },

  file_structure: {
    root: '/mnt/c/_EHG/EHG/src',
    structure: {
      'pages/admin/agents/': [
        'PresetLibrary.tsx',
        'PromptLibrary.tsx',
        'AgentSettings.tsx',
        'SearchPreferences.tsx',
        'PerformanceDashboard.tsx'
      ],
      'components/admin/presets/': [
        'PresetCard.tsx',
        'PresetModal.tsx',
        'PresetFilterSidebar.tsx'
      ],
      'components/admin/prompts/': [
        'PromptEditor.tsx',
        'PromptTable.tsx',
        'ABTestCreator.tsx',
        'ABTestResults.tsx',
        'VersionHistory.tsx'
      ],
      'components/admin/settings/': [
        'AgentSettingsPanel.tsx',
        'ParameterField.tsx',
        'GlobalDefaultsPage.tsx'
      ],
      'components/admin/search/': [
        'SearchPreferencesPanel.tsx',
        'SearchProfileManager.tsx',
        'SearchPreview.tsx'
      ],
      'components/admin/performance/': [
        'MetricCard.tsx',
        'LatencyTrendChart.tsx',
        'TokenUsageChart.tsx',
        'AgentComparisonTable.tsx',
        'ErrorLog.tsx',
        'AlertManager.tsx'
      ],
      'lib/api/admin/': [
        'presets.ts',
        'prompts.ts',
        'settings.ts',
        'search.ts',
        'performance.ts'
      ],
      'types/': [
        'admin-presets.ts',
        'admin-prompts.ts',
        'admin-settings.ts',
        'admin-search.ts',
        'admin-performance.ts'
      ],
      'hooks/admin/': [
        'usePresets.ts',
        'usePrompts.ts',
        'useABTests.ts',
        'useSettings.ts',
        'useSearchPrefs.ts',
        'usePerformanceMetrics.ts'
      ]
    },
    estimated_files: 45,
    estimated_loc: 8000
  },

  implementation_details_by_subsystem: {
    subsystem_1_preset_management: {
      story_points: 22,
      sprints: '1-2',
      components: [
        {
          name: 'PresetLibrary.tsx',
          path: 'src/pages/admin/agents/PresetLibrary.tsx',
          loc: 400,
          description: 'Main page with grid layout, filters, search',
          key_features: [
            'Grid display of PresetCard components (3 columns)',
            'Left sidebar with filters (My/Team/Official)',
            'Search bar with fuzzy search (Fuse.js)',
            'Create Preset button',
            'Empty state handling'
          ]
        },
        {
          name: 'PresetCard.tsx',
          path: 'src/components/admin/presets/PresetCard.tsx',
          loc: 150,
          description: 'Individual preset display card',
          key_features: [
            'Preset name + description (2-line truncate)',
            'Official badge (if applicable)',
            'Creator avatar + usage count',
            'Load, Edit, Delete actions',
            'Hover state with elevated shadow'
          ]
        },
        {
          name: 'PresetModal.tsx',
          path: 'src/components/admin/presets/PresetModal.tsx',
          loc: 300,
          description: 'Create/Edit preset modal',
          key_features: [
            'Form with name, description, configuration (JSON editor)',
            'Zod validation',
            'Save + Cancel buttons',
            'Error handling'
          ]
        },
        {
          name: 'usePresets.ts',
          path: 'src/hooks/admin/usePresets.ts',
          loc: 200,
          description: 'TanStack Query hooks for preset CRUD',
          exports: [
            'usePresets() - Fetch all presets',
            'useCreatePreset() - Mutation',
            'useUpdatePreset() - Mutation',
            'useDeletePreset() - Mutation',
            'useLoadPreset() - Load into form'
          ]
        }
      ],
      api_endpoints: [
        'GET /api/admin/presets - List presets with filters',
        'POST /api/admin/presets - Create preset',
        'PUT /api/admin/presets/:id - Update preset',
        'DELETE /api/admin/presets/:id - Delete preset',
        'POST /api/admin/presets/:id/mark-official - Admin only'
      ],
      test_files: [
        'tests/unit/admin/presets/PresetCard.test.tsx',
        'tests/unit/admin/presets/PresetModal.test.tsx',
        'tests/integration/admin/presets-api.test.ts',
        'tests/e2e/admin/preset-workflow.spec.ts'
      ]
    },

    subsystem_2_prompt_library: {
      story_points: 32,
      sprints: '3-5',
      components: [
        {
          name: 'PromptLibrary.tsx',
          path: 'src/pages/admin/agents/PromptLibrary.tsx',
          loc: 500,
          description: 'Main prompt library with tabs (Prompts | A/B Tests | Analytics)',
          key_features: [
            'DataTable with sortable columns',
            'Search + department filter',
            'Row actions (Edit, Create A/B Test, View History)',
            'Pagination (50 per page)'
          ]
        },
        {
          name: 'PromptEditor.tsx',
          path: 'src/components/admin/prompts/PromptEditor.tsx',
          loc: 600,
          description: 'Full-screen editor with Monaco',
          key_features: [
            'Monaco editor with syntax highlighting for {{variables}}',
            'Side-by-side preview',
            'Version selector dropdown',
            'Auto-save draft every 30s',
            'Token count display'
          ]
        },
        {
          name: 'ABTestCreator.tsx',
          path: 'src/components/admin/prompts/ABTestCreator.tsx',
          loc: 800,
          description: 'Multi-step wizard for A/B tests',
          key_features: [
            'Step 1: Name + select baseline',
            'Step 2: Edit variant B (side-by-side)',
            'Step 3: Configure (traffic, metrics, duration)',
            'Step 4: Review + start',
            'Progress stepper'
          ]
        },
        {
          name: 'ABTestResults.tsx',
          path: 'src/components/admin/prompts/ABTestResults.tsx',
          loc: 700,
          description: 'A/B test results dashboard',
          key_features: [
            'Metric cards (Variant A vs B)',
            'Statistical significance (p-value, confidence)',
            'Time series chart (performance over time)',
            'Winner declaration',
            'Promote winner button'
          ]
        }
      ],
      dependencies: [
        '@monaco-editor/react - Code editor',
        'diff-match-patch - Version diff algorithm',
        'jstat - Statistical calculations (optional)'
      ],
      api_endpoints: [
        'GET /api/admin/prompts - List prompts',
        'POST /api/admin/prompts - Create prompt',
        'PUT /api/admin/prompts/:id - Update prompt (creates new version)',
        'GET /api/admin/prompts/:id/versions - Version history',
        'GET /api/admin/prompts/:id/dependencies - Agent dependencies',
        'POST /api/admin/ab-tests - Create A/B test',
        'GET /api/admin/ab-tests/:id - Get test results',
        'POST /api/admin/ab-tests/:id/promote - Promote winner'
      ],
      test_files: [
        'tests/unit/admin/prompts/PromptEditor.test.tsx',
        'tests/unit/admin/prompts/ABTestCreator.test.tsx',
        'tests/integration/admin/prompt-versioning.test.ts',
        'tests/e2e/admin/ab-test-workflow.spec.ts'
      ]
    },

    subsystem_3_agent_settings: {
      story_points: 18,
      sprints: '6-7',
      components: [
        {
          name: 'AgentSettings.tsx',
          path: 'src/pages/admin/agents/AgentSettings.tsx',
          loc: 400,
          description: 'Settings page with collapsible sections',
          key_features: [
            'Model Configuration section',
            'Execution Settings section',
            'Tools & Capabilities section',
            'Reset to Defaults button',
            'Save button with confirmation'
          ]
        },
        {
          name: 'ParameterField.tsx',
          path: 'src/components/admin/settings/ParameterField.tsx',
          loc: 250,
          description: 'Reusable parameter input component',
          variants: ['slider', 'number', 'toggle', 'multi-select'],
          key_features: [
            'Label with help tooltip',
            'Input control (variant-specific)',
            'Validation error display',
            'Reset to default icon (if changed)'
          ]
        }
      ],
      api_endpoints: [
        'GET /api/admin/settings/:agent_key - Get settings',
        'PUT /api/admin/settings/:agent_key - Update settings',
        'GET /api/admin/settings/:agent_key/defaults - Get defaults',
        'PUT /api/admin/settings/global-defaults - Admin only'
      ],
      test_files: [
        'tests/unit/admin/settings/ParameterField.test.tsx',
        'tests/integration/admin/settings-crud.test.ts',
        'tests/e2e/admin/settings-workflow.spec.ts'
      ]
    },

    subsystem_4_search_preferences: {
      story_points: 16,
      sprints: '7-8',
      components: [
        {
          name: 'SearchPreferences.tsx',
          path: 'src/pages/admin/agents/SearchPreferences.tsx',
          loc: 500,
          description: 'Two-panel layout (config | preview)',
          key_features: [
            'Provider multi-select (Serper, Exa, Brave)',
            'Max results, geo focus, date range',
            'Content types checkboxes',
            'Domain allowlist/blocklist (tag input)',
            'Preview button + results display'
          ]
        },
        {
          name: 'SearchProfileManager.tsx',
          path: 'src/components/admin/search/SearchProfileManager.tsx',
          loc: 300,
          description: 'Profile CRUD list + modal',
          key_features: [
            'Profile list with Load/Edit/Delete',
            'Create Profile modal',
            'Save current settings as profile'
          ]
        }
      ],
      api_endpoints: [
        'GET /api/admin/search/preferences - List profiles',
        'POST /api/admin/search/preferences - Create profile',
        'PUT /api/admin/search/preferences/:id - Update profile',
        'DELETE /api/admin/search/preferences/:id - Delete profile',
        'POST /api/admin/search/preview - Preview search results'
      ],
      test_files: [
        'tests/unit/admin/search/SearchProfileManager.test.tsx',
        'tests/integration/admin/search-crud.test.ts',
        'tests/e2e/admin/search-workflow.spec.ts'
      ]
    },

    subsystem_5_performance_dashboard: {
      story_points: 27,
      sprints: '8-10',
      components: [
        {
          name: 'PerformanceDashboard.tsx',
          path: 'src/pages/admin/agents/PerformanceDashboard.tsx',
          loc: 800,
          description: 'Main dashboard with metrics, charts, tables',
          key_features: [
            'Metric cards row (Executions, Latency, Tokens, Success Rate)',
            'Time series charts (Latency, Token usage)',
            'Agent comparison table',
            'Error log (expandable)',
            'Date range filter',
            'Auto-refresh every 30s'
          ]
        },
        {
          name: 'MetricCard.tsx',
          path: 'src/components/admin/performance/MetricCard.tsx',
          loc: 150,
          description: 'Reusable metric display card',
          key_features: [
            'Metric name + value',
            'Trend indicator (+/- %)',
            'Color coding (green/yellow/red)',
            'Sparkline (optional)'
          ]
        },
        {
          name: 'LatencyTrendChart.tsx',
          path: 'src/components/admin/performance/LatencyTrendChart.tsx',
          loc: 300,
          description: 'Recharts line chart for latency over time',
          key_features: [
            'Time series (hourly buckets)',
            'Hover tooltips',
            'Anomaly highlighting',
            'Responsive sizing'
          ]
        },
        {
          name: 'AlertManager.tsx',
          path: 'src/components/admin/performance/AlertManager.tsx',
          loc: 500,
          description: 'Alert configuration UI',
          key_features: [
            'Alert list with enabled toggle',
            'Create alert form',
            'Condition builder (metric, operator, threshold)',
            'Notification channel selector',
            'Alert history'
          ]
        }
      ],
      dependencies: [
        'recharts - Charts library',
        '@tanstack/react-virtual - Large table virtualization'
      ],
      api_endpoints: [
        'GET /api/admin/performance/metrics - Dashboard metrics',
        'GET /api/admin/performance/executions - Execution list',
        'GET /api/admin/performance/trends - Time series data',
        'GET /api/admin/performance/errors - Error log',
        'POST /api/admin/performance/alerts - Create alert',
        'GET /api/admin/performance/alerts - List alerts',
        'PUT /api/admin/performance/alerts/:id - Update alert'
      ],
      real_time: [
        'Supabase subscription to agent_executions table',
        'Debounced updates (500ms)',
        'Selective query (last 1 hour only)'
      ],
      test_files: [
        'tests/unit/admin/performance/MetricCard.test.tsx',
        'tests/unit/admin/performance/LatencyTrendChart.test.tsx',
        'tests/integration/admin/performance-api.test.ts',
        'tests/e2e/admin/dashboard-workflow.spec.ts'
      ]
    }
  },

  routing_configuration: {
    file: 'src/App.tsx or src/routes/admin.tsx',
    routes: [
      {
        path: '/admin/agents',
        element: '<AdminAgentsLayout />',
        children: [
          { path: 'presets', element: '<PresetLibrary />' },
          { path: 'prompts', element: '<PromptLibrary />' },
          { path: 'settings', element: '<AgentSettings />' },
          { path: 'search', element: '<SearchPreferences />' },
          { path: 'performance', element: '<PerformanceDashboard />' }
        ]
      }
    ],
    navigation_integration: {
      location: 'Main sidebar under "Admin" or "AI & Automation"',
      menu_items: [
        { label: 'Preset Library', path: '/admin/agents/presets', icon: 'BookmarkIcon' },
        { label: 'Prompt Management', path: '/admin/agents/prompts', icon: 'SparklesIcon' },
        { label: 'Agent Settings', path: '/admin/agents/settings', icon: 'Cog6ToothIcon' },
        { label: 'Search Config', path: '/admin/agents/search', icon: 'MagnifyingGlassIcon' },
        { label: 'Performance', path: '/admin/agents/performance', icon: 'ChartBarIcon' }
      ]
    }
  },

  testing_implementation: {
    smoke_tests: {
      location: 'tests/smoke/admin/',
      count: 20,
      execution_time: '<60s',
      files: [
        'preset-crud.smoke.test.ts',
        'prompt-crud.smoke.test.ts',
        'settings-crud.smoke.test.ts',
        'search-crud.smoke.test.ts',
        'dashboard-load.smoke.test.ts'
      ]
    },
    e2e_tests: {
      location: 'tests/e2e/admin/',
      count: 50,
      execution_time: '5-10min',
      framework: 'Playwright',
      files: [
        'preset-workflow.spec.ts',
        'prompt-ab-test.spec.ts',
        'settings-reset.spec.ts',
        'search-profile.spec.ts',
        'dashboard-filtering.spec.ts'
      ]
    },
    integration_tests: {
      location: 'tests/integration/admin/',
      count: 30,
      execution_time: '3-5min',
      files: [
        'preset-api.test.ts',
        'prompt-versioning.test.ts',
        'settings-defaults.test.ts',
        'search-api.test.ts',
        'performance-aggregations.test.ts'
      ]
    }
  },

  deployment_checklist: [
    '1. Run database migrations in order (001-007)',
    '2. Create first monthly partition for agent_executions',
    '3. Set up materialized view refresh (pg_cron or manual)',
    '4. Install npm dependencies (@monaco-editor/react, etc.)',
    '5. Build frontend assets (npm run build)',
    '6. Configure environment variables (if needed)',
    '7. Seed initial data (optional: official presets, default prompts)',
    '8. Run smoke tests (npm run test:smoke)',
    '9. Deploy to staging environment',
    '10. Run full E2E test suite',
    '11. Performance testing with load (k6 or Artillery)',
    '12. Security audit (RLS policies, OWASP ZAP)',
    '13. Deploy to production',
    '14. Monitor for 24 hours (check performance_alerts)',
    '15. Documentation update (README, component docs)'
  ],

  success_metrics: {
    implementation: {
      all_components_built: '45 files created',
      all_tests_passing: '100 tests (smoke + E2E + integration)',
      database_migrations_applied: '7 migrations',
      rls_policies_verified: '6 tables with policies',
      code_coverage: '≥80% unit, ≥70% integration'
    },
    performance: {
      page_load: '<2s (FCP)',
      api_responses: '<500ms (CRUD)',
      dashboard_load: '<1.5s (100K records)',
      real_time_latency: '<500ms'
    },
    acceptance: {
      all_23_user_stories_tested: 'US-1 through US-23',
      all_acceptance_criteria_met: 'Per user story definitions',
      smoke_tests_pass: '20/20 passing',
      no_critical_bugs: 'Zero severity: critical or high'
    }
  }
};

// Update PRD with implementation specification
const { data: existingPRD } = await supabase
  .from('product_requirements_v2')
  .select('metadata')
  .eq('id', 'PRD-SD-AGENT-ADMIN-001')
  .single();

const updatedMetadata = {
  ...(existingPRD?.metadata || {}),
  implementation_specification: implementationSpec
};

const { error: prdError } = await supabase
  .from('product_requirements_v2')
  .update({ metadata: updatedMetadata })
  .eq('id', 'PRD-SD-AGENT-ADMIN-001');

if (prdError) {
  console.error('❌ Error updating PRD:', prdError);
  process.exit(1);
}

// Update SD progress to 50% (EXEC specification complete)
const { error: progressError } = await supabase
  .from('strategic_directives_v2')
  .update({ progress: 50 })
  .eq('id', 'SD-AGENT-ADMIN-001');

if (progressError) {
  console.error('❌ Error updating progress:', progressError);
  process.exit(1);
}

console.log('✅ Implementation Specification Complete');
console.log('\n📋 Specification Summary:');
console.log('   Total Files: 45 (components + tests + migrations)');
console.log('   Total LOC: ~8,000');
console.log('   Database Migrations: 7');
console.log('   Component Count: 21');
console.log('   Test Files: 15');
console.log('\n🗄️ Database Schema:');
console.log('   Tables: 6 (agent_configs, prompt_templates, etc.)');
console.log('   Materialized View: 1 (agent_execution_metrics_daily)');
console.log('   Partitioning: agent_executions (monthly)');
console.log('\n📊 By Subsystem:');
console.log('   Preset Management: 4 components, 22 points');
console.log('   Prompt Library: 5 components, 32 points');
console.log('   Agent Settings: 3 components, 18 points');
console.log('   Search Preferences: 3 components, 16 points');
console.log('   Performance Dashboard: 6 components, 27 points');
console.log('\n🧪 Testing:');
console.log('   Smoke Tests: 20 (<60s)');
console.log('   E2E Tests: 50 (5-10min)');
console.log('   Integration Tests: 30 (3-5min)');
console.log('\n' + '='.repeat(60));
console.log('🎯 Implementation specification stored in PRD metadata');
console.log('📈 Progress updated: 50% (EXEC specification complete)');
