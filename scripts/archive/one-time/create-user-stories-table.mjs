#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('📋 Product Requirements Expert: Creating User Stories Table');
console.log('='.repeat(60));

// Check if user_stories table exists, if not we'll create records in metadata
// For now, store in PRD metadata and SD metadata for linkage

const userStories = [
  // Subsystem 1: Preset Management (US-1 to US-5)
  {
    id: 'US-1',
    title: 'Save agent configuration as preset',
    description: 'As a business analyst, I want to save my frequently-used agent configurations as presets so that I don\'t have to reconfigure agents for similar ventures.',
    subsystem: 'Preset Management',
    acceptance_criteria: [
      'Save button visible after configuring any agent',
      'Preset naming modal with description field',
      'Preset saved to database with user_id, agent_key, configuration JSON',
      'Success notification with "Load Preset" quick action'
    ],
    story_points: 5,
    priority: 'high',
    sprint: 1
  },
  {
    id: 'US-2',
    title: 'Browse available presets',
    description: 'As a team lead, I want to browse available presets so that I can use team-validated configurations.',
    subsystem: 'Preset Management',
    acceptance_criteria: [
      'Preset library accessible from agent configuration page',
      'Grid/list view with preset name, description, creator, usage count',
      'Filter by agent type',
      'Search by name or description'
    ],
    story_points: 3,
    priority: 'high',
    sprint: 1
  },
  {
    id: 'US-3',
    title: 'Load preset to configure agent',
    description: 'As a user, I want to load a preset to quickly configure an agent.',
    subsystem: 'Preset Management',
    acceptance_criteria: [
      'Load Preset button in configuration panel',
      'Preset selection modal with preview',
      'One-click apply populates all configuration fields',
      'Ability to modify preset values before saving'
    ],
    story_points: 3,
    priority: 'high',
    sprint: 2
  },
  {
    id: 'US-4',
    title: 'View preset usage analytics',
    description: 'As a preset creator, I want to see who\'s using my presets so that I know which ones are valuable.',
    subsystem: 'Preset Management',
    acceptance_criteria: [
      'Usage analytics per preset (view count, apply count)',
      'User feedback mechanism (thumbs up/down)',
      'Last used timestamp'
    ],
    story_points: 3,
    priority: 'medium',
    sprint: 2
  },
  {
    id: 'US-5',
    title: 'Mark presets as official',
    description: 'As an admin, I want to mark presets as "official" so that team members use vetted configurations.',
    subsystem: 'Preset Management',
    acceptance_criteria: [
      'Admin toggle for official status',
      'Official presets appear at top of list',
      'Badge/indicator for official presets'
    ],
    story_points: 2,
    priority: 'medium',
    sprint: 2
  },

  // Subsystem 2: Prompt Library with A/B Testing (US-6 to US-11)
  {
    id: 'US-6',
    title: 'View all agent prompts',
    description: 'As a prompt engineer, I want to view all prompts used by agents so that I can audit and improve them.',
    subsystem: 'Prompt Library',
    acceptance_criteria: [
      'Prompt library lists all prompts with agent association',
      'Grouping by department',
      'Search by prompt name or content',
      'Filter by agent, department, or status'
    ],
    story_points: 5,
    priority: 'critical',
    sprint: 3
  },
  {
    id: 'US-7',
    title: 'Edit prompts via UI',
    description: 'As a prompt engineer, I want to edit prompts without touching code so that I can iterate quickly.',
    subsystem: 'Prompt Library',
    acceptance_criteria: [
      'Inline editing or modal-based prompt editor',
      'Syntax highlighting for prompt variables',
      'Version history (last 10 versions saved)',
      'Preview with sample data before saving'
    ],
    story_points: 8,
    priority: 'critical',
    sprint: 3
  },
  {
    id: 'US-8',
    title: 'Create A/B tests for prompts',
    description: 'As a prompt engineer, I want to create A/B tests for prompts so that I can validate improvements.',
    subsystem: 'Prompt Library',
    acceptance_criteria: [
      'Create A/B Test button on any prompt',
      'Side-by-side editor for variant A vs variant B',
      'Test configuration: traffic split, success metric selection',
      'Start/Stop test controls'
    ],
    story_points: 8,
    priority: 'high',
    sprint: 4
  },
  {
    id: 'US-9',
    title: 'View A/B test results',
    description: 'As a product manager, I want to see A/B test results so that I know which prompts perform better.',
    subsystem: 'Prompt Library',
    acceptance_criteria: [
      'Test results dashboard with performance metrics',
      'Statistical significance calculation (p-value, confidence interval)',
      'Winner declaration when significance threshold met',
      'One-click promote winner to production'
    ],
    story_points: 8,
    priority: 'high',
    sprint: 4
  },
  {
    id: 'US-10',
    title: 'Version control for prompts',
    description: 'As a prompt engineer, I want to version prompts so that I can roll back if needed.',
    subsystem: 'Prompt Library',
    acceptance_criteria: [
      'Version history sidebar',
      'Diff view between versions',
      'One-click rollback to any version',
      'Version tagging'
    ],
    story_points: 5,
    priority: 'medium',
    sprint: 5
  },
  {
    id: 'US-11',
    title: 'View prompt dependencies',
    description: 'As an agent admin, I want to see which prompts are used by which agents so that I understand dependencies.',
    subsystem: 'Prompt Library',
    acceptance_criteria: [
      'Prompt detail view shows "Used by X agents"',
      'Click to see list of dependent agents',
      'Warning before editing prompts with high usage'
    ],
    story_points: 3,
    priority: 'medium',
    sprint: 5
  },

  // Subsystem 3: Agent Settings Panel (US-12 to US-15)
  {
    id: 'US-12',
    title: 'Configure agent parameters via UI',
    description: 'As a user, I want to configure agent parameters via UI so that I don\'t need to edit code.',
    subsystem: 'Agent Settings',
    acceptance_criteria: [
      'Settings panel accessible from agent detail page',
      'Form fields for all configurable parameters',
      'Real-time validation with error messages',
      'Save button with confirmation'
    ],
    story_points: 5,
    priority: 'high',
    sprint: 6
  },
  {
    id: 'US-13',
    title: 'View parameter descriptions',
    description: 'As a user, I want to see parameter descriptions so that I understand what each setting does.',
    subsystem: 'Agent Settings',
    acceptance_criteria: [
      'Tooltip on hover for each parameter',
      'Help modal with detailed explanations',
      'Example values for guidance'
    ],
    story_points: 3,
    priority: 'medium',
    sprint: 6
  },
  {
    id: 'US-14',
    title: 'Reset to default settings',
    description: 'As a user, I want to reset to default settings so that I can recover from misconfiguration.',
    subsystem: 'Agent Settings',
    acceptance_criteria: [
      'Reset to Defaults button',
      'Confirmation modal before reset',
      'Defaults loaded from agent definition'
    ],
    story_points: 2,
    priority: 'medium',
    sprint: 7
  },
  {
    id: 'US-15',
    title: 'Set system-wide defaults',
    description: 'As an admin, I want to set system-wide defaults so that all new agent instances use vetted configurations.',
    subsystem: 'Agent Settings',
    acceptance_criteria: [
      'Global defaults configuration page (admin only)',
      'Per-department default overrides',
      'Defaults cascade: System → Department → Agent → User'
    ],
    story_points: 5,
    priority: 'medium',
    sprint: 7
  },

  // Subsystem 4: Search Preference Engine (US-16 to US-18)
  {
    id: 'US-16',
    title: 'Configure search preferences',
    description: 'As a user, I want to configure search preferences so that agents find more relevant information.',
    subsystem: 'Search Preferences',
    acceptance_criteria: [
      'Search preferences panel in agent settings',
      'Configurable parameters: providers, max results, geographic focus, date range, content types, domain lists',
      'Preview search results with current settings'
    ],
    story_points: 5,
    priority: 'medium',
    sprint: 7
  },
  {
    id: 'US-17',
    title: 'Save search preference profiles',
    description: 'As a researcher, I want to save search preferences as profiles so that I can reuse them across ventures.',
    subsystem: 'Search Preferences',
    acceptance_criteria: [
      'Save as Profile button',
      'Profile naming and description',
      'Profile library with load/edit/delete'
    ],
    story_points: 3,
    priority: 'medium',
    sprint: 8
  },
  {
    id: 'US-18',
    title: 'Set default search preferences per agent',
    description: 'As an admin, I want to set default search preferences per agent type so that specialized agents use appropriate sources.',
    subsystem: 'Search Preferences',
    acceptance_criteria: [
      'Default profiles per agent',
      'Override user preferences with admin-locked settings',
      'Audit log of preference changes'
    ],
    story_points: 3,
    priority: 'low',
    sprint: 8
  },

  // Subsystem 5: Performance Monitoring Dashboard (US-19 to US-23)
  {
    id: 'US-19',
    title: 'View all agent metrics dashboard',
    description: 'As a platform admin, I want to see all agent metrics in one dashboard so that I can monitor system health.',
    subsystem: 'Performance Dashboard',
    acceptance_criteria: [
      'Dashboard displays: total executions, average latency, token usage, success rate, error rate',
      'Filterable by date range, department, agent',
      'Auto-refresh every 30 seconds'
    ],
    story_points: 8,
    priority: 'high',
    sprint: 8
  },
  {
    id: 'US-20',
    title: 'View performance trends over time',
    description: 'As a user, I want to see performance trends over time so that I can identify degradation.',
    subsystem: 'Performance Dashboard',
    acceptance_criteria: [
      'Time series charts for latency, token usage, success rate',
      'Anomaly highlighting',
      'Drill-down to specific agent execution details'
    ],
    story_points: 5,
    priority: 'high',
    sprint: 9
  },
  {
    id: 'US-21',
    title: 'Compare agent performance',
    description: 'As a product manager, I want to compare agent performance so that I know which agents need optimization.',
    subsystem: 'Performance Dashboard',
    acceptance_criteria: [
      'Agent comparison table with sortable columns',
      'Color-coded performance indicators',
      'Export to CSV for analysis'
    ],
    story_points: 5,
    priority: 'medium',
    sprint: 9
  },
  {
    id: 'US-22',
    title: 'View error details for debugging',
    description: 'As a developer, I want to see error details so that I can debug failures.',
    subsystem: 'Performance Dashboard',
    acceptance_criteria: [
      'Error log table with timestamp, agent, error type, message',
      'Stack trace (expandable)',
      'Filter by error type and search by message'
    ],
    story_points: 3,
    priority: 'medium',
    sprint: 10
  },
  {
    id: 'US-23',
    title: 'Set performance alerts',
    description: 'As an admin, I want to set performance alerts so that I\'m notified of issues.',
    subsystem: 'Performance Dashboard',
    acceptance_criteria: [
      'Alert configuration UI with trigger conditions',
      'Notification channels (email, Slack webhook)',
      'Alert history log and snooze/disable capability'
    ],
    story_points: 5,
    priority: 'medium',
    sprint: 10
  }
];

// Get SD ID from command line argument
const sdId = process.argv[2] || 'SD-AGENT-ADMIN-002';

console.log(`\n🎯 Linking user stories to: ${sdId}`);

// Store user stories in database - link to SD
const { error: updateError } = await supabase
  .from('strategic_directives_v2')
  .update({
    metadata: {
      ...{
        lead_approval_date: new Date().toISOString(),
        estimated_story_points: 105,
        estimated_sprints: '8-10',
        lead_decision: 'APPROVED - Full scope with all 5 subsystems',
        user_directive: 'Keep the original scope',
        subsystems: [
          { name: 'Preset Management System', story_points: '16', description: 'Agent configuration presets for common use cases' },
          { name: 'Prompt Library Admin UI with A/B Testing', story_points: '32', description: 'Manage and test prompt templates with versioning' },
          { name: 'Agent Settings Panel', story_points: '15', description: 'Configure agent parameters and behavior' },
          { name: 'Search Preference Engine', story_points: '11', description: 'Customize search behavior and data sources' },
          { name: 'Performance Monitoring Dashboard', story_points: '26', description: 'Track agent performance and system health' }
        ],
        lead_notes: [
          'Applied SIMPLICITY FIRST evaluation - scope is appropriate for value delivered',
          'All 5 subsystems are necessary for complete admin functionality',
          'No over-engineering concerns - standard admin tooling patterns',
          'User explicitly requested full scope retention'
        ]
      },
      user_stories: userStories
    }
  })
  .eq('id', sdId);

if (updateError) {
  console.error('❌ Error updating SD with user stories:', updateError);
  process.exit(1);
}

console.log(`✅ User Stories Created and Linked to ${sdId}`);
console.log(`\n📊 Summary:`);
console.log(`   Total User Stories: ${userStories.length}`);
console.log(`   By Subsystem:`);
console.log(`     - Preset Management: 5 stories (US-1 to US-5)`);
console.log(`     - Prompt Library: 6 stories (US-6 to US-11)`);
console.log(`     - Agent Settings: 4 stories (US-12 to US-15)`);
console.log(`     - Search Preferences: 3 stories (US-16 to US-18)`);
console.log(`     - Performance Dashboard: 5 stories (US-19 to US-23)`);
console.log(`\n📈 Story Points Distribution:`);
console.log(`     - Sprint 1: 8 points (US-1, US-2)`);
console.log(`     - Sprint 2: 8 points (US-3, US-4, US-5)`);
console.log(`     - Sprint 3: 13 points (US-6, US-7)`);
console.log(`     - Sprint 4: 16 points (US-8, US-9)`);
console.log(`     - Sprint 5: 8 points (US-10, US-11)`);
console.log(`     - Sprint 6: 8 points (US-12, US-13)`);
console.log(`     - Sprint 7: 12 points (US-14, US-15, US-16)`);
console.log(`     - Sprint 8: 14 points (US-17, US-18, US-19)`);
console.log(`     - Sprint 9: 10 points (US-20, US-21)`);
console.log(`     - Sprint 10: 8 points (US-22, US-23)`);
console.log(`\n   Total: 105 story points across 23 user stories`);
console.log('\n' + '='.repeat(60));
console.log('🎯 User Stories now linked in SD metadata');
console.log('   Access via: strategic_directives_v2.metadata.user_stories');
