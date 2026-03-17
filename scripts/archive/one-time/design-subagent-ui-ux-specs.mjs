#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🎨 Senior Design Sub-Agent: UI/UX Specifications');
console.log('='.repeat(60));
console.log('\n📐 Design Analysis for SD-AGENT-ADMIN-001');
console.log('   Target: Agent Engineering Department Admin Tooling\n');

const uiuxSpecs = {
  design_system: {
    framework: 'Shadcn UI',
    theme: 'Consistent with existing EHG application',
    typography: {
      headings: 'Inter font family',
      body: 'Inter font family',
      code: 'Monaco, Consolas, monospace'
    },
    colors: {
      primary: '#3b82f6', // Blue-500
      secondary: '#8b5cf6', // Purple-500
      success: '#10b981', // Green-500
      warning: '#f59e0b', // Amber-500
      error: '#ef4444', // Red-500
      neutral: '#6b7280' // Gray-500
    },
    spacing: 'Tailwind spacing scale (4px base)',
    borders: 'rounded-lg (8px) for cards, rounded-md (6px) for inputs',
    shadows: 'Tailwind shadow utilities'
  },

  navigation: {
    location: 'Add to /admin/agents route',
    menu_structure: {
      parent: 'Admin',
      children: [
        { label: 'Preset Library', path: '/admin/agents/presets', icon: 'BookmarkIcon' },
        { label: 'Prompt Management', path: '/admin/agents/prompts', icon: 'SparklesIcon' },
        { label: 'Agent Settings', path: '/admin/agents/settings', icon: 'Cog6ToothIcon' },
        { label: 'Search Config', path: '/admin/agents/search', icon: 'MagnifyingGlassIcon' },
        { label: 'Performance', path: '/admin/agents/performance', icon: 'ChartBarIcon' }
      ]
    },
    breadcrumbs: 'Admin > Agents > [Subsystem]'
  },

  subsystem_1_preset_management: {
    name: 'Preset Management System',
    layout: 'Split view with sidebar + main content',
    components: [
      {
        name: 'PresetLibrary',
        type: 'Main Container',
        layout: 'Grid with filters sidebar',
        features: [
          'Left sidebar: Filters (My Presets / Team Presets / Official)',
          'Main area: Grid of PresetCard components (3 columns)',
          'Top bar: Search input + Create Preset button',
          'Empty state: Illustration with "Create your first preset"'
        ]
      },
      {
        name: 'PresetCard',
        type: 'Card Component',
        size: '~350px wide, auto height',
        elements: [
          'Header: Preset name (h3) + Official badge',
          'Description: 2-line truncated text',
          'Metadata: Creator avatar + name, Usage count',
          'Footer: Load button (primary) + Edit/Delete (secondary)'
        ],
        states: ['default', 'hover (elevated shadow)', 'loading']
      },
      {
        name: 'PresetModal',
        type: 'Modal Dialog',
        size: '600px wide, auto height (max 80vh)',
        sections: [
          'Header: "Create New Preset" or "Edit Preset"',
          'Form: Name (input), Description (textarea), Configuration (JSON editor)',
          'Footer: Cancel (secondary) + Save (primary) buttons'
        ],
        validation: 'Real-time with Zod schema, errors below fields'
      }
    ],
    user_flows: [
      'Browse Presets: Land on library → Filter/Search → Click preset → Load or Edit',
      'Create Preset: Configure agent → Click Save as Preset → Fill modal → Save → See in library',
      'Load Preset: Browse library → Click Load → Confirmation → Fields populated'
    ],
    accessibility: [
      'Keyboard navigation: Tab through cards, Enter to select',
      'Screen reader: ARIA labels on all interactive elements',
      'Focus indicators: Visible focus ring on all focusable elements',
      'Color contrast: Minimum 4.5:1 for text'
    ]
  },

  subsystem_2_prompt_library: {
    name: 'Prompt Library with A/B Testing',
    layout: 'Tab-based interface (Prompts | A/B Tests | Analytics)',
    components: [
      {
        name: 'PromptLibrary',
        type: 'Data Table',
        columns: ['Name', 'Department', 'Agent', 'Last Modified', 'Version', 'Actions'],
        features: [
          'Search bar with fuzzy matching',
          'Column sorting',
          'Department filter dropdown',
          'Row actions: Edit, Create A/B Test, View History'
        ]
      },
      {
        name: 'PromptEditor',
        type: 'Full-screen Editor',
        layout: 'Side-by-side (editor | preview)',
        editor_features: [
          'Syntax highlighting for {{variables}}',
          'Line numbers',
          'Auto-save draft every 30 seconds',
          'Version selector dropdown (last 10 versions)'
        ],
        preview_features: [
          'Sample data selector',
          'Rendered output with variable substitution',
          'Token count display'
        ]
      },
      {
        name: 'ABTestCreator',
        type: 'Multi-step Wizard',
        steps: [
          'Step 1: Name test + Select baseline prompt',
          'Step 2: Edit variant B (side-by-side with variant A)',
          'Step 3: Configure (traffic split, success metric, duration)',
          'Step 4: Review + Start test'
        ],
        visual: 'Progress stepper at top, content area below, navigation buttons at bottom'
      },
      {
        name: 'ABTestResults',
        type: 'Dashboard',
        sections: [
          'Header: Test name, status (Running/Completed), duration',
          'Metrics cards: Variant A vs Variant B (quality score, latency, cost)',
          'Statistical significance: P-value, confidence interval, winner declaration',
          'Time series chart: Performance over time',
          'Action: Promote winner button (if significant)'
        ]
      }
    ],
    user_flows: [
      'Edit Prompt: Browse library → Click Edit → Modify in editor → Preview → Save',
      'Create A/B Test: Select prompt → Click Create Test → Follow wizard → Start test',
      'Review Results: A/B Tests tab → Select test → View metrics → Promote winner if ready'
    ],
    accessibility: [
      'Monaco editor: Built-in accessibility',
      'Tab panels: ARIA roles for tabs and tabpanels',
      'Charts: Alt text descriptions of data'
    ]
  },

  subsystem_3_agent_settings: {
    name: 'Agent Settings Panel',
    layout: 'Form-based with collapsible sections',
    components: [
      {
        name: 'AgentSettingsPanel',
        type: 'Form Container',
        sections: [
          {
            title: 'Model Configuration',
            fields: [
              { name: 'temperature', type: 'slider', range: '0.0-1.0', help: 'Controls randomness' },
              { name: 'max_tokens', type: 'number', range: '100-4000', help: 'Maximum response length' },
              { name: 'timeout', type: 'number', range: '10-120', help: 'Seconds before timeout' }
            ]
          },
          {
            title: 'Execution Settings',
            fields: [
              { name: 'verbose', type: 'toggle', help: 'Enable detailed logging' },
              { name: 'allow_delegation', type: 'toggle', help: 'Allow agent to delegate tasks' },
              { name: 'cache_enabled', type: 'toggle', help: 'Cache responses for performance' }
            ]
          },
          {
            title: 'Tools & Capabilities',
            fields: [
              { name: 'tools_enabled', type: 'multi-select', options: ['web_search', 'calculator', 'code_interpreter'], help: 'Available tools for agent' }
            ]
          }
        ],
        actions: ['Reset to Defaults', 'Save Changes']
      },
      {
        name: 'ParameterField',
        type: 'Reusable Field Component',
        variants: ['slider', 'number', 'toggle', 'multi-select'],
        features: [
          'Label with help icon (tooltip on hover)',
          'Input control specific to type',
          'Validation error message below field',
          'Reset to default icon (if changed from default)'
        ]
      }
    ],
    user_flows: [
      'Configure Agent: Navigate to agent → Settings tab → Modify parameters → Save',
      'Reset Misconfiguration: Settings tab → Reset to Defaults → Confirm → Defaults loaded'
    ],
    accessibility: [
      'Sliders: Keyboard control with arrow keys',
      'Toggles: Space to toggle, clear on/off state',
      'Tooltips: Keyboard accessible (focus to show)'
    ]
  },

  subsystem_4_search_preferences: {
    name: 'Search Preference Engine',
    layout: 'Two-panel (configuration | preview)',
    components: [
      {
        name: 'SearchPreferencesPanel',
        type: 'Form + Preview',
        left_panel: [
          'Search Providers: Multi-select (Serper, Exa, Brave)',
          'Max Results: Number input (1-50)',
          'Geographic Focus: Dropdown (US, EU, Global)',
          'Date Range: Date picker (any, past year, past month, custom)',
          'Content Types: Checkboxes (articles, PDFs, videos)',
          'Domain Allowlist: Tag input',
          'Domain Blocklist: Tag input'
        ],
        right_panel: [
          'Preview Search button',
          'Results display: Title, URL, snippet (first 5 results)',
          'Loading state while previewing'
        ]
      },
      {
        name: 'SearchProfileManager',
        type: 'List + Modal',
        features: [
          'Profile list: Name, description, last used',
          'Actions: Load, Edit, Delete',
          'Create Profile modal: Name, description, save current settings'
        ]
      }
    ],
    user_flows: [
      'Configure Search: Preferences panel → Adjust settings → Preview → Save',
      'Save Profile: Configure → Save as Profile → Name → Reuse later',
      'Load Profile: Profile manager → Select profile → Settings populated'
    ],
    accessibility: [
      'Tag inputs: Keyboard to add/remove tags',
      'Preview: Loading announcements for screen readers'
    ]
  },

  subsystem_5_performance_dashboard: {
    name: 'Performance Monitoring Dashboard',
    layout: 'Dashboard with metric cards + charts + tables',
    components: [
      {
        name: 'PerformanceDashboard',
        type: 'Dashboard Container',
        sections: [
          {
            name: 'Metric Cards Row',
            cards: [
              { metric: 'Total Executions', value: '1,234', trend: '+12%', color: 'blue' },
              { metric: 'Avg Latency', value: '1.2s', trend: '-5%', color: 'green' },
              { metric: 'Token Usage', value: '45K', trend: '+8%', color: 'yellow' },
              { metric: 'Success Rate', value: '98.5%', trend: '+1%', color: 'green' }
            ]
          },
          {
            name: 'Time Series Charts',
            charts: [
              { title: 'Latency Trend (7 days)', type: 'LineChart', data: 'agent_executions.latency_ms' },
              { title: 'Token Usage Trend (7 days)', type: 'AreaChart', data: 'agent_executions.token_count' }
            ],
            library: 'Recharts'
          },
          {
            name: 'Agent Comparison Table',
            type: 'DataTable',
            columns: ['Agent', 'Executions', 'Avg Latency', 'Success Rate', 'Sparkline'],
            sorting: 'Click column headers',
            color_coding: 'Green (<1s), Yellow (1-3s), Red (>3s) for latency'
          },
          {
            name: 'Error Log',
            type: 'Expandable Table',
            columns: ['Time', 'Agent', 'Error Type', 'Message', 'Actions'],
            row_expansion: 'Click row to see stack trace',
            filters: 'Error type dropdown, search message'
          }
        ]
      },
      {
        name: 'AlertManager',
        type: 'Form + List',
        create_alert: [
          'Alert name',
          'Condition: Metric dropdown + Operator dropdown + Threshold input',
          'Notification: Channel (email/Slack) + Recipients',
          'Frequency: Immediate / Hourly digest'
        ],
        alert_list: 'Name, condition, enabled toggle, edit/delete actions'
      }
    ],
    user_flows: [
      'Monitor Health: Dashboard → View metrics → Drill into agent details if needed',
      'Investigate Errors: Error Log section → Filter by type → Expand row → Debug',
      'Set Alert: Alert Manager → Create → Configure → Enable'
    ],
    accessibility: [
      'Charts: Keyboard navigation to data points, screen reader table alternatives',
      'Tables: Sortable with keyboard, row selection with arrow keys'
    ]
  },

  responsive_design: {
    breakpoints: {
      mobile: '< 640px',
      tablet: '640px - 1024px',
      desktop: '> 1024px'
    },
    mobile_adaptations: [
      'Preset cards: Single column on mobile',
      'Prompt editor: Stack editor and preview vertically on mobile',
      'Dashboard: Stack metric cards vertically, full-width charts',
      'Tables: Horizontal scroll with sticky first column'
    ]
  },

  component_library: {
    shadcn_components: [
      'Button', 'Input', 'Textarea', 'Select', 'Checkbox', 'Switch', 'Slider',
      'Dialog', 'Tabs', 'Table', 'Card', 'Badge', 'Avatar', 'Tooltip',
      'DropdownMenu', 'Form', 'Label', 'Separator'
    ],
    custom_components: [
      'CodeEditor (Monaco wrapper)',
      'ChartContainer (Recharts wrapper)',
      'MetricCard (Dashboard metric)',
      'PresetCard (Preset display)',
      'ABTestWizard (Multi-step form)'
    ]
  },

  design_tokens: {
    spacing: {
      xs: '4px',
      sm: '8px',
      md: '16px',
      lg: '24px',
      xl: '32px',
      '2xl': '48px'
    },
    font_sizes: {
      xs: '12px',
      sm: '14px',
      base: '16px',
      lg: '18px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '30px'
    },
    line_heights: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.75'
    }
  }
};

// Store UI/UX specs in PRD metadata
const { error: updateError } = await supabase
  .from('product_requirements_v2')
  .update({
    ui_ux_requirements: [
      'Shadcn UI component library for consistency',
      'Responsive design: mobile, tablet, desktop breakpoints',
      'WCAG 2.1 AA accessibility compliance',
      'Dark mode support (future enhancement)',
      'Real-time updates via Supabase subscriptions for Performance Dashboard'
    ],
    metadata: {
      story_points: 115,
      estimated_sprints: '8-10',
      total_user_stories: 23,
      subsystems: [
        { name: 'Preset Management', points: '20-25', sprint: '1-2' },
        { name: 'Prompt Library with A/B Testing', points: '30-35', sprint: '3-5' },
        { name: 'Agent Settings Panel', points: '15-20', sprint: '6-7' },
        { name: 'Search Preference Engine', points: '15-20', sprint: '7-8' },
        { name: 'Performance Monitoring Dashboard', points: '25-30', sprint: '8-10' }
      ],
      tech_stack: ['React 18', 'TypeScript', 'Shadcn UI', 'TanStack Query', 'Recharts', 'Supabase'],
      database_notes: 'Leverages existing agent_configs table, adds prompt_templates, search_preferences, agent_executions',
      prd_source: 'Comprehensive PRD stored in create-prd-agent-admin-001.mjs for full details',
      ui_ux_specs: uiuxSpecs
    }
  })
  .eq('id', 'PRD-SD-AGENT-ADMIN-001');

if (updateError) {
  console.error('❌ Error updating PRD with UI/UX specs:', updateError);
  process.exit(1);
}

console.log('✅ UI/UX Specifications Complete');
console.log('\n📐 Design System:');
console.log('   Framework: Shadcn UI');
console.log('   Typography: Inter font family');
console.log('   Primary Color: Blue-500 (#3b82f6)');
console.log('   Spacing: Tailwind scale (4px base)');
console.log('\n🗺️ Navigation:');
console.log('   Location: /admin/agents/*');
console.log('   Subsystems: 5 main routes');
console.log('\n🎨 Components Defined:');
console.log('   Subsystem 1: PresetLibrary, PresetCard, PresetModal');
console.log('   Subsystem 2: PromptLibrary, PromptEditor, ABTestCreator, ABTestResults');
console.log('   Subsystem 3: AgentSettingsPanel, ParameterField');
console.log('   Subsystem 4: SearchPreferencesPanel, SearchProfileManager');
console.log('   Subsystem 5: PerformanceDashboard, AlertManager, MetricCard');
console.log('\n♿ Accessibility:');
console.log('   WCAG 2.1 AA compliance');
console.log('   Keyboard navigation for all interactions');
console.log('   Screen reader support with ARIA labels');
console.log('   4.5:1 minimum color contrast');
console.log('\n' + '='.repeat(60));
console.log('🎯 UI/UX specs stored in PRD metadata');
console.log('   Access via: product_requirements_v2.metadata.ui_ux_specs');
