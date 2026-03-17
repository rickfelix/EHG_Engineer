#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('⚡ Performance Engineering Lead: Performance Requirements');
console.log('='.repeat(60));
console.log('\n🎯 Performance Analysis for SD-AGENT-ADMIN-001');
console.log('   Target: Agent Engineering Department Admin Tooling\n');

const performanceRequirements = {
  overview: {
    performance_critical_subsystems: [
      'Preset Library (fast filtering/search)',
      'Prompt Library (Monaco editor responsiveness)',
      'Performance Dashboard (large dataset visualization)',
      'A/B Test Results (statistical computation)'
    ],
    user_expectations: {
      page_load: 'Users expect admin tools to load within 2-3 seconds',
      interaction: 'Form saves, searches, filters should feel instant (<500ms)',
      data_viz: 'Charts and dashboards should render smoothly even with large datasets'
    }
  },

  performance_targets: {
    page_load_metrics: {
      first_contentful_paint: '<1.5s (good), <2.5s (acceptable)',
      largest_contentful_paint: '<2.0s (good), <3.0s (acceptable)',
      time_to_interactive: '<2.5s (good), <4.0s (acceptable)',
      cumulative_layout_shift: '<0.1 (good), <0.25 (acceptable)',
      first_input_delay: '<100ms (good), <300ms (acceptable)'
    },

    api_response_times: {
      preset_crud: '<200ms (GET), <500ms (POST/PUT)',
      prompt_crud: '<300ms (GET), <800ms (POST/PUT with version)',
      settings_update: '<200ms',
      search_preview: '<2s (external API call)',
      dashboard_metrics: '<1s (aggregation of 10K+ rows)',
      ab_test_results: '<1.5s (statistical computation)'
    },

    database_query_performance: {
      simple_selects: '<50ms (single row by ID)',
      filtered_lists: '<200ms (preset library with filters)',
      aggregations: '<500ms (dashboard metric cards)',
      complex_joins: '<1s (prompt dependencies)',
      time_series: '<1s (latency trend chart, 7 days of data)'
    },

    client_side_performance: {
      react_render: '<16ms per frame (60fps)',
      form_validation: '<50ms (client-side Zod validation)',
      list_filtering: '<100ms (preset/prompt search)',
      chart_render: '<500ms (Recharts line/area charts)',
      monaco_editor: 'Smooth typing, no lag on prompts up to 5KB'
    }
  },

  subsystem_1_preset_management: {
    name: 'Preset Management System',
    performance_requirements: [
      {
        operation: 'Load Preset Library',
        target: '<500ms',
        data_size: 'Up to 500 presets',
        optimization: 'Pagination (25 per page), lazy loading preset details'
      },
      {
        operation: 'Search presets',
        target: '<200ms',
        implementation: 'Client-side fuzzy search (Fuse.js) after initial load'
      },
      {
        operation: 'Filter presets (My/Team/Official)',
        target: '<100ms',
        implementation: 'Client-side filtering, no additional API calls'
      },
      {
        operation: 'Load preset configuration',
        target: '<300ms',
        implementation: 'Single SELECT by ID, JSONB deserialization'
      },
      {
        operation: 'Save preset',
        target: '<500ms',
        implementation: 'INSERT with JSONB, RLS check'
      }
    ],
    scalability: {
      max_presets_per_user: 100,
      max_official_presets: 50,
      total_system_presets: '5,000 (across all users)'
    }
  },

  subsystem_2_prompt_library: {
    name: 'Prompt Library Admin UI with A/B Testing',
    performance_requirements: [
      {
        operation: 'Load Prompt Library table',
        target: '<1s',
        data_size: 'Up to 500 prompts',
        optimization: 'Server-side pagination (50 per page), column sorting'
      },
      {
        operation: 'Open Prompt Editor (Monaco)',
        target: '<800ms',
        implementation: 'Lazy load Monaco editor, syntax highlighting on demand'
      },
      {
        operation: 'Save prompt with version',
        target: '<800ms',
        implementation: 'INSERT new version + UPDATE parent_version_id, transaction'
      },
      {
        operation: 'Preview prompt with sample data',
        target: '<500ms',
        implementation: 'Client-side variable substitution, no API call'
      },
      {
        operation: 'Load version history',
        target: '<400ms',
        data_size: 'Last 10 versions',
        optimization: 'LIMIT 10, ORDER BY version DESC'
      },
      {
        operation: 'Compute version diff',
        target: '<200ms',
        implementation: 'Client-side diff algorithm (diff-match-patch)'
      },
      {
        operation: 'Create A/B test',
        target: '<600ms',
        implementation: 'INSERT into prompt_ab_tests, transaction'
      },
      {
        operation: 'Load A/B test results',
        target: '<1.5s',
        implementation: 'Aggregate metrics from agent_executions, compute p-value'
      },
      {
        operation: 'View prompt dependencies',
        target: '<500ms',
        implementation: 'Query agent_keys ARRAY for matches'
      }
    ],
    scalability: {
      max_prompts: 500,
      max_versions_per_prompt: 50,
      active_ab_tests: 20,
      completed_ab_tests: 200
    },
    critical_path: 'Monaco editor must not freeze during typing (16ms frame budget)'
  },

  subsystem_3_agent_settings: {
    name: 'Agent Settings Panel',
    performance_requirements: [
      {
        operation: 'Load settings',
        target: '<300ms',
        implementation: 'SELECT from agent_configs by agent_key + user_id'
      },
      {
        operation: 'Save settings',
        target: '<400ms',
        implementation: 'UPSERT into agent_configs, RLS check'
      },
      {
        operation: 'Reset to defaults',
        target: '<200ms',
        implementation: 'Client-side reset (no API call), then save'
      },
      {
        operation: 'Load global defaults (admin)',
        target: '<300ms',
        implementation: 'SELECT defaults by department'
      }
    ],
    scalability: {
      settings_per_agent: '10-20 parameters',
      total_agents: 42,
      total_configurations: '5,000 (users × agents)'
    }
  },

  subsystem_4_search_preferences: {
    name: 'Search Preference Engine',
    performance_requirements: [
      {
        operation: 'Load preferences',
        target: '<300ms',
        implementation: 'SELECT from search_preferences'
      },
      {
        operation: 'Save profile',
        target: '<400ms',
        implementation: 'INSERT into search_preferences'
      },
      {
        operation: 'Preview search results',
        target: '<2s',
        implementation: 'External API call to Serper/Exa, timeout=2s',
        note: 'Dependent on third-party API performance'
      },
      {
        operation: 'Load profile list',
        target: '<300ms',
        data_size: 'Up to 100 profiles per user'
      }
    ],
    scalability: {
      profiles_per_user: 20,
      total_profiles: '2,000 (across all users)'
    }
  },

  subsystem_5_performance_dashboard: {
    name: 'Performance Monitoring Dashboard',
    performance_requirements: [
      {
        operation: 'Load dashboard (metric cards)',
        target: '<1.5s',
        data_size: 'Aggregate 100K agent_executions (last 7 days)',
        optimization: 'Materialized view for common aggregations, refresh every 5 minutes'
      },
      {
        operation: 'Render latency trend chart',
        target: '<1s',
        data_size: '168 data points (7 days × 24 hours)',
        optimization: 'Hourly bucketing, pre-aggregated'
      },
      {
        operation: 'Render token usage chart',
        target: '<1s',
        data_size: '168 data points',
        optimization: 'Same as latency trend'
      },
      {
        operation: 'Load agent comparison table',
        target: '<800ms',
        data_size: '42 agents × 5 metrics',
        optimization: 'Pre-aggregated per agent'
      },
      {
        operation: 'Drill down to execution details',
        target: '<500ms',
        data_size: 'Single execution record + metadata'
      },
      {
        operation: 'Filter dashboard by date range',
        target: '<2s',
        implementation: 'Re-run aggregation queries, cache results'
      },
      {
        operation: 'Filter by department',
        target: '<1s',
        implementation: 'Filter pre-aggregated data client-side'
      },
      {
        operation: 'Export to CSV',
        target: '<3s',
        data_size: 'Up to 10K rows',
        implementation: 'Generate CSV server-side, stream to client'
      },
      {
        operation: 'Real-time updates (WebSocket)',
        target: '<500ms latency',
        implementation: 'Supabase real-time subscriptions, debounced updates'
      }
    ],
    scalability: {
      agent_executions_per_day: '10,000-50,000',
      retention: '6 months active, 2 years archive',
      concurrent_users: '10-20 (admin users)',
      dashboard_auto_refresh: 'Every 30 seconds'
    },
    critical_optimization: 'Database partitioning by month for agent_executions table'
  },

  database_optimizations: {
    indexing_strategy: {
      agent_configs: [
        'PRIMARY KEY (id)',
        'INDEX (user_id)',
        'INDEX (agent_key)',
        'UNIQUE (user_id, agent_key) for fast lookups'
      ],
      prompt_templates: [
        'PRIMARY KEY (id)',
        'INDEX (department)',
        'INDEX (status)',
        'GIN INDEX (agent_keys) for array search',
        'INDEX (created_at DESC) for recent prompts'
      ],
      agent_executions: [
        'PRIMARY KEY (id)',
        'INDEX (agent_key)',
        'INDEX (started_at DESC) for time-series queries',
        'INDEX (status) for error filtering',
        'INDEX (user_id) for RLS',
        'COMPOSITE INDEX (agent_key, started_at) for dashboard'
      ],
      search_preferences: [
        'PRIMARY KEY (id)',
        'INDEX (user_id)',
        'INDEX (agent_key)'
      ],
      prompt_ab_tests: [
        'PRIMARY KEY (id)',
        'INDEX (prompt_id)',
        'INDEX (status)',
        'INDEX (started_at DESC)'
      ]
    },

    materialized_views: {
      agent_execution_metrics_daily: {
        description: 'Pre-aggregated metrics per agent per day',
        refresh: 'Every 5 minutes via pg_cron',
        query: `
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
        `
      }
    },

    partitioning: {
      agent_executions: {
        strategy: 'RANGE partitioning by started_at (monthly)',
        reason: 'Table will grow to millions of rows, partitioning improves query performance',
        retention: 'Drop partitions older than 6 months',
        example: `
CREATE TABLE agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL,
  ...
) PARTITION BY RANGE (started_at);

CREATE TABLE agent_executions_2025_01 PARTITION OF agent_executions
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
        `
      }
    },

    query_optimization: {
      connection_pooling: 'Supabase Pooler (pgBouncer) for connection reuse',
      prepared_statements: 'Use parameterized queries via Supabase client',
      limit_clauses: 'Always use LIMIT in admin UI queries (no unbounded SELECT *)',
      select_specific_columns: 'Avoid SELECT *, specify needed columns',
      jsonb_indexing: 'Use GIN indexes for JSONB metadata searches if needed'
    }
  },

  frontend_optimizations: {
    code_splitting: {
      description: 'Lazy load admin routes',
      implementation: 'React.lazy() + Suspense for admin/* routes',
      benefit: 'Reduce initial bundle size by ~200KB'
    },

    react_query_caching: {
      description: 'Cache API responses in TanStack Query',
      strategy: {
        presets: 'staleTime: 5 minutes, cacheTime: 10 minutes',
        prompts: 'staleTime: 2 minutes, cacheTime: 5 minutes',
        dashboard_metrics: 'staleTime: 30 seconds, cacheTime: 1 minute, refetchInterval: 30s',
        settings: 'staleTime: 5 minutes, cacheTime: 10 minutes'
      }
    },

    virtualization: {
      prompt_library_table: 'Use TanStack Virtual for 500+ rows',
      agent_comparison_table: 'Use TanStack Virtual for 42+ agents',
      benefit: 'Only render visible rows, ~10x performance improvement'
    },

    debouncing: {
      search_inputs: 'Debounce 300ms',
      filter_inputs: 'Debounce 200ms',
      real_time_updates: 'Debounce 500ms'
    },

    image_optimization: {
      user_avatars: 'WebP format, 50x50px thumbnails',
      chart_exports: 'SVG (scalable), lazy load PNG fallbacks'
    },

    bundle_optimization: {
      monaco_editor: 'Lazy load only when Prompt Editor opened',
      recharts: 'Tree-shake unused chart types',
      shadcn_components: 'Import only used components'
    }
  },

  monitoring_and_alerting: {
    performance_monitoring: {
      tool: 'Supabase Dashboard + Custom performance_alerts table',
      metrics_to_track: [
        'API endpoint response times (p50, p95, p99)',
        'Database query execution times',
        'Dashboard render times (LCP, FCP)',
        'Error rates by endpoint',
        'Real-time subscriber count'
      ]
    },

    performance_alerts: [
      {
        name: 'Slow API responses',
        condition: 'p95 response time > 2s for any endpoint',
        action: 'Notify DevOps, investigate slow queries'
      },
      {
        name: 'Dashboard load timeout',
        condition: 'Dashboard metrics fail to load in 5s',
        action: 'Check materialized view refresh, investigate locks'
      },
      {
        name: 'Database connection pool exhaustion',
        condition: 'Active connections > 80% of pool size',
        action: 'Scale pool size, investigate connection leaks'
      },
      {
        name: 'High error rate',
        condition: 'Error rate > 5% for any endpoint',
        action: 'Alert on-call engineer'
      }
    ],

    user_feedback: {
      slow_operation_detection: 'Log client-side operations >3s to database',
      user_reported_issues: 'Feedback widget in admin UI for performance complaints'
    }
  },

  load_testing: {
    description: 'Validate performance under realistic load',
    tool: 'k6 or Artillery for load testing',
    scenarios: [
      {
        name: 'Dashboard concurrent users',
        setup: '20 concurrent users, dashboard auto-refresh every 30s',
        duration: '10 minutes',
        success_criteria: 'p95 response time <3s, no errors'
      },
      {
        name: 'Prompt save spike',
        setup: '10 users saving prompts simultaneously',
        duration: '1 minute',
        success_criteria: 'All saves complete in <1s'
      },
      {
        name: 'Agent executions ingestion',
        setup: 'Insert 10K executions over 1 hour',
        duration: '1 hour',
        success_criteria: 'Dashboard reflects new data within 5 minutes'
      }
    ]
  },

  progressive_enhancement: {
    description: 'Graceful degradation for slower connections',
    strategies: [
      'Show loading skeletons during data fetch',
      'Pagination instead of infinite scroll',
      'Disable real-time updates if latency >1s',
      'Fallback to static charts if Recharts slow',
      'Timeout external API calls (search preview) after 3s'
    ]
  },

  performance_budget: {
    description: 'Performance constraints for each subsystem',
    budgets: {
      preset_management: {
        bundle_size: '<50KB (gzipped)',
        initial_load: '<1.5s',
        interaction_response: '<500ms'
      },
      prompt_library: {
        bundle_size: '<150KB (gzipped, includes Monaco)',
        initial_load: '<2s',
        editor_open: '<800ms'
      },
      agent_settings: {
        bundle_size: '<30KB (gzipped)',
        initial_load: '<1s',
        save_response: '<400ms'
      },
      search_preferences: {
        bundle_size: '<40KB (gzipped)',
        initial_load: '<1s',
        preview_response: '<2s (external API)'
      },
      performance_dashboard: {
        bundle_size: '<100KB (gzipped, includes Recharts)',
        initial_load: '<2s',
        chart_render: '<1s',
        real_time_update_latency: '<500ms'
      }
    }
  }
};

// First read existing PRD metadata
const { data: existingPRD } = await supabase
  .from('product_requirements_v2')
  .select('metadata')
  .eq('id', 'PRD-SD-AGENT-ADMIN-001')
  .single();

const updatedMetadata = {
  ...(existingPRD?.metadata || {}),
  performance_requirements: performanceRequirements
};

// Store performance requirements in PRD
const { error: updateError } = await supabase
  .from('product_requirements_v2')
  .update({
    metadata: updatedMetadata
  })
  .eq('id', 'PRD-SD-AGENT-ADMIN-001');

if (updateError) {
  console.error('❌ Error updating PRD with performance requirements:', updateError);
  process.exit(1);
}

console.log('✅ Performance Requirements Complete');
console.log('\n⚡ Performance Targets:');
console.log('   Page Load: <2s (FCP), <3s (LCP)');
console.log('   API Responses: <500ms (CRUD), <1.5s (aggregations)');
console.log('   Client Rendering: <16ms per frame (60fps)');
console.log('\n📊 By Subsystem:');
console.log('   Preset Management: <500ms library load, <200ms search');
console.log('   Prompt Library: <1s table load, <800ms editor open');
console.log('   Agent Settings: <300ms load, <400ms save');
console.log('   Search Preferences: <2s preview (external API)');
console.log('   Performance Dashboard: <1.5s metric cards, <1s charts');
console.log('\n🗄️ Database Optimizations:');
console.log('   Indexes: Defined for all frequent queries');
console.log('   Materialized Views: Daily metrics, refresh every 5min');
console.log('   Partitioning: Monthly for agent_executions');
console.log('   Connection Pooling: Supabase Pooler (pgBouncer)');
console.log('\n🎯 Frontend Optimizations:');
console.log('   Code Splitting: Lazy load admin routes');
console.log('   React Query: Cache API responses (5-30s stale time)');
console.log('   Virtualization: TanStack Virtual for large tables');
console.log('   Debouncing: Search (300ms), Filters (200ms)');
console.log('\n🔍 Monitoring:');
console.log('   Performance Alerts: Slow APIs (>2s), High errors (>5%)');
console.log('   Load Testing: k6 scenarios for 20 concurrent users');
console.log('   User Feedback: Log slow operations (>3s)');
console.log('\n📦 Performance Budget:');
console.log('   Preset Management: <50KB bundle');
console.log('   Prompt Library: <150KB bundle (incl Monaco)');
console.log('   Performance Dashboard: <100KB bundle (incl Recharts)');
console.log('\n' + '='.repeat(60));
console.log('🎯 Performance requirements stored in PRD metadata');
console.log('   Access via: product_requirements_v2.metadata.performance_requirements');
