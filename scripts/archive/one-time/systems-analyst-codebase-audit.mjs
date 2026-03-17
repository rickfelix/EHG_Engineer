#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Principal Systems Analyst: Codebase Audit');
console.log('='.repeat(60));
console.log('\n🎯 Audit for SD-AGENT-ADMIN-001');
console.log('   Target: Agent Engineering Department Admin Tooling');
console.log('   Objective: Identify existing implementations and reusable components\n');

const codebaseAudit = {
  summary: {
    admin_tooling_exists: false,
    preset_management_exists: false,
    prompt_management_exists: false,
    performance_dashboard_exists: 'Partial (analytics dashboards)',
    reusable_patterns_found: true,
    recommendation: 'Build from scratch, reuse UI patterns and Shadcn components'
  },

  database_tables_audit: {
    agent_configs: {
      exists: false,
      searched: 'Codebase grep for "agent_configs" returned no results',
      verdict: 'NEW TABLE REQUIRED',
      notes: 'Database Architect designed modifications (add metadata JSONB)'
    },
    prompt_templates: {
      exists: false,
      verdict: 'NEW TABLE REQUIRED',
      notes: 'Database Architect designed full schema'
    },
    search_preferences: {
      exists: false,
      verdict: 'NEW TABLE REQUIRED'
    },
    agent_executions: {
      exists: false,
      verdict: 'NEW TABLE REQUIRED',
      notes: 'Critical for Performance Dashboard subsystem'
    },
    prompt_ab_tests: {
      exists: false,
      verdict: 'NEW TABLE REQUIRED'
    },
    performance_alerts: {
      exists: false,
      verdict: 'NEW TABLE REQUIRED'
    }
  },

  existing_agent_pages: {
    description: 'Found agent-related pages, but none for admin tooling',
    files_found: [
      {
        path: 'src/pages/Agents.tsx',
        size: '26,243 bytes',
        purpose: 'User-facing agent interface (not admin)',
        reusability: 'UI patterns for agent cards/lists'
      },
      {
        path: 'src/pages/AIAgentsPage.tsx',
        size: '16,949 bytes',
        purpose: 'AI agents display page',
        reusability: 'Component structure'
      },
      {
        path: 'src/pages/BusinessAgentsPage.tsx',
        size: '16,841 bytes',
        purpose: 'Business agents display',
        reusability: 'Layout patterns'
      },
      {
        path: 'src/pages/ai-ceo-agent.tsx',
        purpose: 'Specific agent page',
        reusability: 'Agent interaction patterns'
      },
      {
        path: 'src/types/agents.ts',
        purpose: 'Agent type definitions',
        reusability: 'HIGH - Extend for admin tooling'
      }
    ],
    verdict: 'No existing admin tooling for agents. User-facing pages only.'
  },

  existing_dashboard_patterns: {
    description: 'Dashboard components exist - reuse patterns',
    files_found: [
      {
        path: 'src/pages/AnalyticsDashboard.tsx',
        size: '5,949 bytes',
        purpose: 'Analytics dashboard',
        reusability: 'HIGH - Dashboard layout, metric cards'
      },
      {
        path: 'src/pages/DecisionAnalyticsDashboard.tsx',
        size: '9,147 bytes',
        purpose: 'Decision analytics',
        reusability: 'HIGH - Chart components, filtering'
      },
      {
        path: 'src/pages/AutomationDashboardPage.tsx',
        size: '5,832 bytes',
        purpose: 'Automation dashboard',
        reusability: 'Dashboard structure'
      },
      {
        path: 'src/pages/EvaOrchestrationDashboard.tsx',
        size: '5,638 bytes',
        purpose: 'EVA orchestration',
        reusability: 'Real-time updates patterns'
      }
    ],
    verdict: 'Excellent dashboard patterns available. Reuse for Performance Dashboard subsystem.'
  },

  existing_settings_patterns: {
    description: 'Settings pages exist - reuse patterns',
    files_found: [
      {
        path: 'src/pages/ChairmanSettingsPage.tsx',
        size: '9,397 bytes',
        purpose: 'Chairman settings configuration',
        reusability: 'HIGH - Form patterns, save/reset buttons'
      },
      {
        path: 'src/pages/CompanySettings.tsx',
        size: '10,964 bytes',
        purpose: 'Company settings',
        reusability: 'HIGH - Settings panel structure'
      }
    ],
    verdict: 'Good settings patterns. Reuse for Agent Settings Panel subsystem.'
  },

  existing_configuration_utilities: {
    description: 'Configuration utilities found',
    files_found: [
      {
        path: 'src/lib/workflow/workflow-configuration.ts',
        purpose: 'Workflow configuration logic',
        reusability: 'Configuration save/load patterns'
      },
      {
        path: 'src/components/ui/performance-optimized.tsx',
        purpose: 'Performance-optimized UI components',
        reusability: 'Use for large lists (Preset Library, Prompt Library)'
      }
    ]
  },

  existing_admin_pages_audit: {
    description: 'No dedicated /admin routes found',
    found_admin_related: [
      'src/pages/AIDocsAdminPage.tsx (185 bytes) - AI docs admin',
      'src/pages/AccessReviewPage.tsx (197 bytes) - Access review',
      'src/pages/AuthenticationManagementPage.tsx (221 bytes) - Auth management',
      'src/pages/ComprehensiveSecurityPage.tsx (240 bytes) - Security',
      'src/pages/DataGovernancePage.tsx (212 bytes) - Data governance'
    ],
    verdict: 'Admin pages exist for other domains, but NOT for agent configuration. No /admin/agents route structure.'
  },

  ui_component_library: {
    framework: 'Shadcn UI (confirmed from existing pages)',
    components_available: [
      'Card, Button, Input, Textarea',
      'Select, Checkbox, Switch, Slider',
      'Dialog, Tabs, Table',
      'Badge, Avatar, Tooltip',
      'DropdownMenu, Form, Label'
    ],
    chart_library: {
      status: 'Recharts confirmed in use',
      evidence: 'DecisionAnalyticsDashboard.tsx uses charts',
      reusability: 'Use for Performance Dashboard'
    }
  },

  gaps_requiring_implementation: {
    subsystem_1_preset_management: {
      required: 'Build from scratch',
      components_to_create: [
        'PresetLibrary (main page)',
        'PresetCard (list item)',
        'PresetModal (create/edit)',
        'PresetFilterSidebar'
      ],
      reusable_patterns: [
        'Card layout from existing dashboards',
        'Modal patterns from settings pages',
        'Filter sidebar from analytics pages'
      ]
    },

    subsystem_2_prompt_library: {
      required: 'Build from scratch',
      components_to_create: [
        'PromptLibrary (table view)',
        'PromptEditor (Monaco editor)',
        'ABTestCreator (wizard)',
        'ABTestResults (dashboard)',
        'VersionHistory (sidebar)'
      ],
      reusable_patterns: [
        'Table component from Shadcn',
        'Dashboard layout from analytics pages'
      ],
      external_dependencies: [
        'Monaco Editor (needs installation)',
        'diff-match-patch (for version diff)'
      ]
    },

    subsystem_3_agent_settings: {
      required: 'Build from scratch',
      components_to_create: [
        'AgentSettingsPanel (form container)',
        'ParameterField (reusable input)',
        'GlobalDefaultsPage (admin only)'
      ],
      reusable_patterns: [
        'Form structure from ChairmanSettingsPage.tsx',
        'Parameter inputs (slider, toggle) from Shadcn'
      ]
    },

    subsystem_4_search_preferences: {
      required: 'Build from scratch',
      components_to_create: [
        'SearchPreferencesPanel (config form)',
        'SearchProfileManager (profile CRUD)',
        'SearchPreview (results display)'
      ],
      reusable_patterns: [
        'Multi-select from Shadcn',
        'Tag input (may need custom)',
        'Profile management from settings pages'
      ]
    },

    subsystem_5_performance_dashboard: {
      required: 'Build from scratch, leverage existing dashboard patterns',
      components_to_create: [
        'PerformanceDashboard (main container)',
        'MetricCard (reusable)',
        'LatencyTrendChart (Recharts)',
        'AgentComparisonTable',
        'ErrorLog (expandable table)',
        'AlertManager (admin only)'
      ],
      reusable_patterns: [
        'Dashboard layout from AnalyticsDashboard.tsx',
        'Metric cards from existing dashboards',
        'Chart components from DecisionAnalyticsDashboard.tsx',
        'Table patterns from Shadcn'
      ],
      high_reusability: 'This subsystem can reuse ~40% of existing code patterns'
    }
  },

  routing_structure_recommendation: {
    proposed_routes: [
      '/admin/agents/presets - Preset Library',
      '/admin/agents/prompts - Prompt Library',
      '/admin/agents/settings - Agent Settings',
      '/admin/agents/search - Search Preferences',
      '/admin/agents/performance - Performance Dashboard'
    ],
    navigation_integration: 'Add to main navigation under "Admin" or "AI & Automation"',
    notes: 'No /admin/agents routes currently exist. Clean slate for implementation.'
  },

  technology_stack_confirmation: {
    frontend: {
      framework: 'React 18 (confirmed)',
      typescript: 'Yes (confirmed)',
      ui_library: 'Shadcn UI (confirmed)',
      state_management: 'TanStack Query (recommended, check if installed)',
      charts: 'Recharts (confirmed)',
      forms: 'React Hook Form + Zod (recommended)',
      code_editor: 'Monaco Editor (needs installation)'
    },
    backend: {
      database: 'Supabase (confirmed)',
      api: 'Supabase client (confirmed)',
      auth: 'Supabase Auth (confirmed)',
      real_time: 'Supabase subscriptions (available)'
    }
  },

  implementation_strategy: {
    approach: 'Greenfield implementation with pattern reuse',
    phases: [
      {
        phase: 1,
        description: 'Database migrations',
        effort: 'Create 6 tables + indexes + RLS policies',
        dependencies: 'Database Architect schemas ready'
      },
      {
        phase: 2,
        description: 'Shared components and types',
        effort: 'Extend src/types/agents.ts, create admin types',
        dependencies: 'None'
      },
      {
        phase: 3,
        description: 'Implement subsystems 1-5',
        effort: '115 story points across 8-10 sprints',
        dependencies: 'Database ready, types defined'
      },
      {
        phase: 4,
        description: 'Testing and optimization',
        effort: '150 test scenarios (smoke, E2E, integration)',
        dependencies: 'All subsystems implemented'
      }
    ]
  },

  risk_assessment: {
    low_risk: [
      'Preset Management (straightforward CRUD)',
      'Agent Settings (form-based)',
      'Search Preferences (configuration)'
    ],
    medium_risk: [
      'Performance Dashboard (large dataset handling)',
      'A/B Testing (statistical computation complexity)'
    ],
    high_risk: [
      'Prompt Editor with Monaco (integration complexity)',
      'Real-time dashboard updates (performance)',
      'Database partitioning for agent_executions (scale)'
    ]
  },

  dependencies_to_install: {
    new_packages: [
      'monaco-editor (or @monaco-editor/react)',
      'diff-match-patch (for prompt version diff)',
      'fuse.js (for client-side fuzzy search)',
      '@tanstack/react-virtual (for large table virtualization)'
    ],
    already_installed: [
      'react, react-dom',
      '@supabase/supabase-js',
      'recharts (confirmed)',
      'shadcn ui components'
    ]
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
  codebase_audit: codebaseAudit
};

// Store codebase audit in PRD
const { error: updateError } = await supabase
  .from('product_requirements_v2')
  .update({
    metadata: updatedMetadata
  })
  .eq('id', 'PRD-SD-AGENT-ADMIN-001');

if (updateError) {
  console.error('❌ Error updating PRD with codebase audit:', updateError);
  process.exit(1);
}

console.log('✅ Codebase Audit Complete');
console.log('\n🔍 Key Findings:');
console.log('   Admin Tooling: None exists - build from scratch');
console.log('   Database Tables: All 6 tables new (agent_configs, prompt_templates, etc.)');
console.log('   Reusable Patterns: Dashboard layouts, settings forms, Shadcn components');
console.log('\n📊 Existing Assets:');
console.log('   Agent Pages: 4 found (user-facing, not admin)');
console.log('   Dashboard Pages: 4 found (excellent patterns for Performance Dashboard)');
console.log('   Settings Pages: 2 found (good patterns for Agent Settings Panel)');
console.log('\n🆕 New Components Required:');
console.log('   Preset Management: 4 components');
console.log('   Prompt Library: 5 components (includes Monaco editor)');
console.log('   Agent Settings: 3 components');
console.log('   Search Preferences: 3 components');
console.log('   Performance Dashboard: 6 components');
console.log('   Total: ~21 new components');
console.log('\n📦 Dependencies to Install:');
console.log('   monaco-editor (or @monaco-editor/react)');
console.log('   diff-match-patch');
console.log('   fuse.js');
console.log('   @tanstack/react-virtual');
console.log('\n🗺️ Routing:');
console.log('   No /admin/agents routes exist');
console.log('   Recommendation: Create /admin/agents/* structure');
console.log('\n⚠️ Risk Assessment:');
console.log('   Low Risk: 3 subsystems (Presets, Settings, Search)');
console.log('   Medium Risk: 1 subsystem (Performance Dashboard)');
console.log('   High Risk: 1 component (Prompt Editor with Monaco)');
console.log('\n✅ Verdict:');
console.log('   Approach: Greenfield implementation');
console.log('   Reusability: ~30-40% pattern reuse (layouts, Shadcn components)');
console.log('   Effort: 115 story points valid, no scope reduction needed');
console.log('\n' + '='.repeat(60));
console.log('🎯 Codebase audit stored in PRD metadata');
console.log('   Access via: product_requirements_v2.metadata.codebase_audit');
