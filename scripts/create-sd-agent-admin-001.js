#!/usr/bin/env node

/**
 * Create Strategic Directive: SD-AGENT-ADMIN-001
 * Agent Configuration & Control Platform
 *
 * This adds admin control, configuration, and monitoring capabilities
 * for the AI agent platform, including preset management, prompt library,
 * agent settings, search preferences, and performance dashboards.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createAgentAdmin() {
  console.log('⚙️  Creating Strategic Directive: Agent Configuration & Control Platform');
  console.log('==========================================================================\n');

  const strategicDirective = {
    id: 'SD-AGENT-ADMIN-001',
    sd_key: 'SD-AGENT-ADMIN-001',
    title: 'Agent Configuration & Control Platform',
    description: `Build comprehensive admin tooling for AI agent platform configuration, optimization, and monitoring.
    Includes: (1) Preset Management for industry-specific templates, (2) Prompt Library with versioning and A/B testing,
    (3) Agent Settings Panel for LLM selection and parameter tuning, (4) Search Preference Engine for personalized
    research, and (5) Performance Monitoring Dashboard for agent analytics and optimization.

    This enables continuous improvement, personalization, and admin control over AI behavior without code changes.`,
    priority: 'high',
    status: 'draft',
    category: 'admin-tooling',
    rationale: `AI agents are powerful but require tuning and configuration to optimize performance.
    Without admin tooling, every prompt change requires code deployment, no A/B testing is possible,
    and performance monitoring is manual. This SD delivers:
    (1) Admin control over AI behavior (no code changes needed)
    (2) Continuous optimization through prompt versioning and A/B testing
    (3) Personalization via search preferences
    (4) Data-driven decisions via performance dashboards

    While lower urgency than core functionality, this accelerates iteration and optimization cycles.`,
    scope: 'Preset management, prompt library, agent settings, search preferences, performance monitoring',
    strategic_objectives: [
      'Build Preset Management System for industry-specific venture templates (admin-editable, not hardcoded)',
      'Create Prompt Library Admin UI with version control and A/B testing framework',
      'Develop Agent Settings Panel for LLM selection, temperature tuning, and performance thresholds',
      'Implement Search Preference Engine to save and personalize research directions',
      'Deploy Performance Monitoring Dashboard with real-time agent metrics',
      'Enable prompt optimization without code deployments',
      'Support personalized venture research based on user patterns',
      'Provide data-driven insights for agent performance tuning'
    ],
    success_criteria: [
      'Admin can create/edit 10+ industry-specific presets via UI',
      'Prompt Library tracks 50+ prompt iterations with version control',
      'Agent Settings Panel persists LLM configs and applies correctly to agents',
      'Search Preference Engine stores user preferences and improves research relevance by 40%',
      'Performance Dashboard shows real-time metrics (success rates, confidence, execution time)',
      'Prompt A/B testing framework can run experiments with statistical significance',
      'Admin changes to prompts/settings apply without code deployment',
      'Performance insights drive 20%+ improvement in agent effectiveness'
    ],
    metadata: {
      timeline: {
        start_date: null, // Set when SD-AGENT-PLATFORM-001 completes
        target_completion: null, // 3 weeks after start
        milestones: [
          'Week 1: Build Preset Management + Prompt Library foundations',
          'Week 2: Develop Agent Settings Panel + Search Preferences',
          'Week 3: Deploy Performance Dashboard, testing, deployment'
        ]
      },
      business_impact: 'MEDIUM - Enables continuous optimization and personalization without code changes',
      technical_impact: 'Establishes configuration-driven architecture for future admin features',
      dependencies: {
        before: ['SD-AGENT-PLATFORM-001'],
        after: []
      },
      technical_details: {
        preset_management: {
          route: '/admin/venture-presets',
          purpose: 'Industry-specific templates that configure agent research focus',
          features: [
            'Create/edit/delete presets via admin UI',
            'Preset includes: industry name, key focus areas, data sources, agent weights',
            'Admin can activate/deactivate presets',
            'Presets available in venture creation dropdown'
          ],
          database_table: {
            name: 'venture_ideation_presets',
            schema: {
              columns: [
                'id UUID PRIMARY KEY',
                'preset_name VARCHAR(255) UNIQUE',
                'industry VARCHAR(100)',
                'focus_areas JSONB', // Array of research focus keywords
                'data_sources JSONB', // Which external sources to prioritize
                'agent_weights JSONB', // Relative importance of each agent
                'prompt_overrides JSONB', // Custom prompts for this preset
                'is_active BOOLEAN DEFAULT true',
                'created_by UUID REFERENCES auth.users(id)',
                'created_at TIMESTAMPTZ DEFAULT NOW()',
                'updated_at TIMESTAMPTZ DEFAULT NOW()'
              ]
            }
          },
          example_presets: [
            {
              preset_name: 'SaaS Healthcare Pain Points',
              industry: 'HealthTech',
              focus_areas: ['HIPAA compliance', 'clinician workflows', 'patient experience'],
              data_sources: { reddit: 0.4, producthunt: 0.3, crunchbase: 0.3 },
              agent_weights: { pain_points: 1.5, regulatory: 1.3, competitive: 1.0 }
            },
            {
              preset_name: 'FinTech Compliance Requirements',
              industry: 'FinTech',
              focus_areas: ['financial regulations', 'security', 'banking partnerships'],
              data_sources: { crunchbase: 0.5, reddit: 0.3, hackernews: 0.2 },
              agent_weights: { regulatory: 2.0, tech_feasibility: 1.3, competitive: 1.0 }
            },
            {
              preset_name: 'E-commerce Market Sizing',
              industry: 'E-commerce',
              focus_areas: ['market size', 'customer acquisition cost', 'logistics'],
              data_sources: { crunchbase: 0.4, producthunt: 0.3, reddit: 0.3 },
              agent_weights: { market_sizing: 1.5, financial: 1.3, competitive: 1.2 }
            }
          ]
        },
        prompt_library: {
          route: '/admin/prompts',
          purpose: 'Version control and A/B testing for agent prompts',
          features: [
            'View all prompts by agent role',
            'Create new prompt versions',
            'Compare prompt versions side-by-side',
            'Run A/B tests with statistical significance tracking',
            'Promote winning prompt to production',
            'Rollback to previous versions'
          ],
          database_table: {
            name: 'prompt_templates',
            schema: {
              columns: [
                'id UUID PRIMARY KEY',
                'template_name VARCHAR(255)',
                'agent_role VARCHAR(255)', // Which agent uses this prompt
                'prompt_text TEXT NOT NULL',
                'variables JSONB', // Dynamic variables in prompt
                'version INTEGER DEFAULT 1',
                'is_active BOOLEAN DEFAULT true',
                'ab_test_id UUID REFERENCES ab_tests(id)',
                'performance_metrics JSONB', // Success rate, avg confidence, etc
                'created_by UUID REFERENCES auth.users(id)',
                'created_at TIMESTAMPTZ DEFAULT NOW()',
                'updated_at TIMESTAMPTZ DEFAULT NOW()'
              ],
              indexes: [
                'CREATE INDEX ON prompt_templates(agent_role, is_active)',
                'CREATE INDEX ON prompt_templates(ab_test_id)'
              ]
            }
          },
          ab_testing_framework: {
            table: 'ab_tests',
            workflow: [
              '1. Admin creates new prompt variant',
              '2. System assigns 50/50 traffic split',
              '3. Track metrics: confidence scores, Chairman acceptance, completion rate',
              '4. After N=30 samples, run t-test for statistical significance',
              '5. If p<0.05 and variant performs better, prompt to promote',
              '6. Admin reviews and promotes winning variant to production'
            ],
            metrics_tracked: [
              'Average confidence score',
              'Chairman acceptance rate (accept vs reject/edit)',
              'Task completion rate',
              'Execution time',
              'Error rate'
            ]
          }
        },
        agent_settings_panel: {
          route: '/admin/agent-settings',
          purpose: 'Configure LLM models, parameters, and thresholds per agent',
          features: [
            'Select LLM per agent (GPT-4, Claude 3.5, Gemini Pro)',
            'Tune temperature (0.0 - 1.0) for creativity vs consistency',
            'Set max tokens and context window',
            'Configure retry policies (attempts, backoff)',
            'Set performance thresholds (confidence, execution time)',
            'Enable/disable agents globally',
            'View agent health status'
          ],
          configuration_storage: {
            method: 'Store in crewai_agents.llm_config JSONB field',
            hot_reload: 'Agents reload config every 60 seconds (no deployment needed)',
            example_config: {
              llm_provider: 'anthropic',
              model: 'claude-3-5-sonnet-20250107',
              temperature: 0.7,
              max_tokens: 2000,
              retry_attempts: 3,
              retry_backoff_seconds: [1, 2, 4],
              confidence_threshold: 0.85,
              max_execution_time_seconds: 300,
              enabled: true
            }
          }
        },
        search_preference_engine: {
          purpose: 'Save user search preferences to guide agent research',
          features: [
            'User enters search preference (e.g., "SaaS products addressing healthcare pain points")',
            'System parses and extracts keywords, industry, focus areas',
            'Agents use preferences to prioritize data sources and research angles',
            'Track which preferences lead to successful ventures',
            'Suggest refinements based on historical success'
          ],
          database_table: {
            name: 'user_search_preferences',
            schema: {
              columns: [
                'id UUID PRIMARY KEY',
                'user_id UUID REFERENCES auth.users(id)',
                'preference_text TEXT',
                'parsed_keywords JSONB',
                'industry VARCHAR(100)',
                'focus_areas JSONB',
                'success_metrics JSONB', // Track ventures created with this preference
                'usage_count INTEGER DEFAULT 0',
                'last_used_at TIMESTAMPTZ',
                'created_at TIMESTAMPTZ DEFAULT NOW()'
              ]
            }
          },
          personalization_logic: [
            'When user submits venture, check for matching search preferences',
            'If match found, pass preference keywords to agents',
            'Agents weight data sources and research angles based on keywords',
            'After venture approval, increment usage_count and update success_metrics',
            'Recommend successful preferences to new users'
          ],
          expected_improvement: '40%+ increase in research relevance based on user feedback'
        },
        performance_monitoring_dashboard: {
          route: '/admin/agent-performance',
          purpose: 'Real-time metrics and insights for agent performance',
          metrics_displayed: [
            {
              category: 'Execution Metrics',
              metrics: ['Tasks completed', 'Tasks failed', 'Average execution time', 'Success rate']
            },
            {
              category: 'Quality Metrics',
              metrics: ['Average confidence score', 'Chairman acceptance rate', 'Edit frequency']
            },
            {
              category: 'Resource Metrics',
              metrics: ['API costs', 'Token usage', 'Cache hit rate', 'Error rate']
            },
            {
              category: 'Learning Metrics',
              metrics: ['Patterns learned', 'Knowledge base growth', 'Prediction accuracy']
            }
          ],
          visualizations: [
            'Agent success rate trends (7 days, 30 days, all time)',
            'Confidence score distributions by agent',
            'Execution time comparison across agents',
            'Chairman feedback patterns (accept/edit/reject)',
            'External data source contribution to results',
            'Cost per venture analysis'
          ],
          real_time_updates: 'WebSocket connection updates dashboard every 5 seconds',
          export_functionality: 'Export metrics to CSV for deeper analysis',
          alerting: 'Email alerts when agent success rate drops below threshold'
        }
      },
      resource_requirements: [
        'Full-stack developer for admin UI components and dashboards',
        'Backend developer for configuration hot-reload and A/B testing logic',
        'Data analyst for performance metrics and statistical significance testing',
        'UX designer for admin panel user experience',
        'QA engineer for admin workflow testing'
      ],
      performance_targets: {
        admin_preset_creation: '10+ presets in first month',
        prompt_iterations_tracked: '50+ versions',
        search_preference_improvement: '40%+ relevance increase',
        prompt_optimization_impact: '20%+ agent effectiveness improvement',
        config_change_latency: '<60 seconds (no deployment)',
        dashboard_load_time: '<2 seconds',
        ab_test_sample_size: 'N=30 for statistical significance'
      },
      related_sds: ['SD-VENTURE-IDEATION-MVP-001', 'SD-AGENT-PLATFORM-001']
    },
    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', 'SD-AGENT-ADMIN-001')
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', 'SD-AGENT-ADMIN-001')
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive updated successfully!');
    } else {
      const { data, error} = await supabase
        .from('strategic_directives_v2')
        .insert(strategicDirective)
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive created successfully!');
    }

    console.log('   ID: SD-AGENT-ADMIN-001');
    console.log('   Title: Agent Configuration & Control Platform');
    console.log('   Priority: HIGH');
    console.log('   Status: DRAFT (depends on SD-AGENT-PLATFORM-001)');
    console.log('   Timeline: 3 weeks after Agent Platform complete');
    console.log('   Impact: Admin control and continuous optimization');
    console.log('\n⚙️  5 admin systems: Presets, Prompts, Settings, Preferences, Dashboard');
    console.log('🔧 Config changes apply without code deployment (<60s)');
    console.log('📊 Expected: 20%+ agent improvement, 40%+ relevance increase');
    console.log('==========================================================================');

    return strategicDirective;
  } catch (error) {
    console.error('❌ Error creating Strategic Directive:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

// Export for use in other scripts
export { createAgentAdmin };

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createAgentAdmin();
}
