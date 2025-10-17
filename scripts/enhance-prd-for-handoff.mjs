#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔧 Enhancing PRD for PLAN→EXEC Handoff');
console.log('='.repeat(60));

// Read current PRD
const { data: currentPRD } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('id', 'PRD-SD-AGENT-ADMIN-001')
  .single();

if (!currentPRD) {
  console.error('❌ PRD not found');
  process.exit(1);
}

// Add missing fields
const systemArchitecture = {
  frontend_architecture: {
    framework: 'React 18 with TypeScript',
    routing: 'React Router v6 - /admin/agents/* routes',
    state_management: 'TanStack Query for server state, React Context for UI state',
    ui_components: 'Shadcn UI component library',
    styling: 'Tailwind CSS',
    code_editor: 'Monaco Editor for Prompt Library',
    charts: 'Recharts for Performance Dashboard',
    forms: 'React Hook Form + Zod validation'
  },
  backend_architecture: {
    database: 'Supabase (PostgreSQL)',
    authentication: 'Supabase Auth (JWT-based)',
    api_layer: 'Supabase client (REST + Real-time subscriptions)',
    authorization: 'Row-Level Security (RLS) policies',
    file_storage: 'Supabase Storage (if needed for prompt exports)',
    real_time: 'Supabase real-time subscriptions for Performance Dashboard'
  },
  database_schema: {
    new_tables: [
      'agent_configs - Modified (add metadata JSONB)',
      'prompt_templates - New (versioning, A/B testing)',
      'prompt_ab_tests - New (test management)',
      'search_preferences - New (user profiles)',
      'agent_executions - New (performance metrics)',
      'performance_alerts - New (alerting)'
    ],
    relationships: [
      'agent_configs.user_id -> auth.users.id',
      'prompt_templates.created_by -> auth.users.id',
      'prompt_templates.parent_version_id -> prompt_templates.id (self-join)',
      'prompt_ab_tests.prompt_id -> prompt_templates.id',
      'search_preferences.user_id -> auth.users.id',
      'agent_executions.user_id -> auth.users.id',
      'performance_alerts.created_by -> auth.users.id'
    ],
    indexing: 'GIN indexes for JSONB, B-tree indexes for FKs and timestamps',
    partitioning: 'agent_executions partitioned by month',
    materialized_views: 'agent_execution_metrics_daily for dashboard aggregations'
  },
  deployment_architecture: {
    hosting: 'Supabase (database + auth + storage + real-time)',
    frontend_hosting: 'TBD (Vercel, Netlify, or EHG existing infrastructure)',
    cdn: 'Cloudflare or similar for static assets',
    monitoring: 'Supabase Dashboard + custom performance_alerts table',
    ci_cd: 'GitHub Actions (if EHG uses it)',
    environments: ['Development', 'Staging (optional)', 'Production']
  }
};

const implementationApproach = {
  methodology: 'Agile Scrum - 2-week sprints',
  total_story_points: 115,
  estimated_sprints: '8-10 sprints (16-20 weeks)',
  team_composition: 'Assume 1 fullstack engineer + EXEC agent',
  
  sprint_breakdown: [
    {
      sprint: 1,
      focus: 'Database setup + Preset Management foundation',
      story_points: 12,
      deliverables: ['Database migrations', 'PresetLibrary component', 'PresetCard component']
    },
    {
      sprint: 2,
      focus: 'Complete Preset Management',
      story_points: 13,
      deliverables: ['PresetModal', 'CRUD operations', 'Filtering/search', 'Official presets']
    },
    {
      sprint: 3,
      focus: 'Prompt Library foundation',
      story_points: 13,
      deliverables: ['PromptLibrary table view', 'Version history', 'Basic CRUD']
    },
    {
      sprint: 4,
      focus: 'Prompt Editor + A/B Testing',
      story_points: 16,
      deliverables: ['Monaco editor integration', 'A/B test creation', 'Preview functionality']
    },
    {
      sprint: 5,
      focus: 'A/B Testing completion + Prompt dependencies',
      story_points: 11,
      deliverables: ['A/B test results dashboard', 'Statistical significance', 'Prompt dependencies view']
    },
    {
      sprint: 6,
      focus: 'Agent Settings Panel',
      story_points: 10,
      deliverables: ['ParameterField components', 'Form validation', 'Save/reset functionality']
    },
    {
      sprint: 7,
      focus: 'Agent Settings + Search Preferences',
      story_points: 12,
      deliverables: ['Global defaults (admin)', 'SearchPreferencesPanel', 'Profile management']
    },
    {
      sprint: 8,
      focus: 'Performance Dashboard foundation',
      story_points: 13,
      deliverables: ['Metric cards', 'Latency/token charts', 'Agent comparison table']
    },
    {
      sprint: 9,
      focus: 'Performance Dashboard advanced',
      story_points: 10,
      deliverables: ['Error log', 'Real-time updates', 'Date range filtering']
    },
    {
      sprint: 10,
      focus: 'Alerts + Testing + Polish',
      story_points: 5,
      deliverables: ['AlertManager', 'Smoke tests', 'E2E tests', 'Performance optimization']
    }
  ],
  
  implementation_sequence: [
    '1. Database migrations (all 6 tables + RLS policies)',
    '2. Authentication & authorization setup',
    '3. Subsystem 1: Preset Management (Sprints 1-2)',
    '4. Subsystem 2: Prompt Library (Sprints 3-5)',
    '5. Subsystem 3: Agent Settings (Sprints 6-7)',
    '6. Subsystem 4: Search Preferences (Sprint 7-8)',
    '7. Subsystem 5: Performance Dashboard (Sprints 8-10)',
    '8. Testing & optimization (Sprint 10)'
  ],
  
  key_milestones: [
    { milestone: 'Database schema complete', sprint: 1, acceptance: 'All tables created, RLS policies applied' },
    { milestone: 'Preset Management complete', sprint: 2, acceptance: 'US-1 through US-5 tested and passing' },
    { milestone: 'Prompt Library complete', sprint: 5, acceptance: 'US-6 through US-11 tested and passing' },
    { milestone: 'Settings & Search complete', sprint: 8, acceptance: 'US-12 through US-18 tested and passing' },
    { milestone: 'Performance Dashboard complete', sprint: 9, acceptance: 'US-19 through US-23 tested and passing' },
    { milestone: 'All subsystems integrated', sprint: 10, acceptance: 'Navigation works, all smoke tests pass' }
  ],
  
  testing_strategy: 'Test-Driven Development (TDD) where feasible, minimum smoke tests per sprint',
  
  definition_of_done: [
    'All acceptance criteria for user stories met',
    'Smoke tests passing (Tier 1)',
    'Code reviewed (if team available)',
    'Documentation updated (component README)',
    'Deployed to staging environment',
    'Demo-ready for stakeholder review'
  ]
};

const risks = [
  {
    id: 'RISK-001',
    category: 'Technical',
    description: 'Monaco editor integration complexity',
    impact: 'High',
    probability: 'Medium',
    mitigation: 'Allocate extra time in Sprint 4, use @monaco-editor/react wrapper, test early',
    contingency: 'Fall back to simple textarea if Monaco integration fails'
  },
  {
    id: 'RISK-002',
    category: 'Performance',
    description: 'Performance Dashboard slow with 100K+ agent_executions',
    impact: 'High',
    probability: 'Medium',
    mitigation: 'Use materialized views, database partitioning, pagination, aggregations',
    contingency: 'Add more aggressive caching, reduce default date range'
  },
  {
    id: 'RISK-003',
    category: 'Technical',
    description: 'A/B test statistical significance calculation errors',
    impact: 'Medium',
    probability: 'Low',
    mitigation: 'Use proven statistical libraries (jstat or similar), validate with known datasets',
    contingency: 'Simplify to basic comparison if statistical library fails'
  },
  {
    id: 'RISK-004',
    category: 'Security',
    description: 'RLS policy misconfiguration causing data leaks',
    impact: 'Critical',
    probability: 'Low',
    mitigation: 'Security Architect review, automated RLS testing, manual security audit',
    contingency: 'Disable feature until RLS policies verified'
  },
  {
    id: 'RISK-005',
    category: 'Scope',
    description: 'Scope creep from stakeholder requests',
    impact: 'Medium',
    probability: 'Medium',
    mitigation: 'Strict change control, defer nice-to-haves to Phase 2, LEAD approval required for scope changes',
    contingency: 'Negotiate timeline extension or defer lower-priority subsystems'
  },
  {
    id: 'RISK-006',
    category: 'Dependency',
    description: 'External search API (Serper/Exa) unreliable',
    impact: 'Low',
    probability: 'Low',
    mitigation: 'Timeout at 2s, graceful error handling, fallback message',
    contingency: 'Mock search results for testing, document as known limitation'
  },
  {
    id: 'RISK-007',
    category: 'Resource',
    description: 'Developer availability or knowledge gaps',
    impact: 'High',
    probability: 'Low',
    mitigation: 'Comprehensive documentation, code comments, pair programming (if team available)',
    contingency: 'EXEC agent assistance, extend sprint durations'
  },
  {
    id: 'RISK-008',
    category: 'Technical',
    description: 'Real-time subscriptions causing performance issues',
    impact: 'Medium',
    probability: 'Low',
    mitigation: 'Debounce updates (500ms), limit concurrent subscribers, use selective queries',
    contingency: 'Disable real-time, fall back to manual refresh button'
  }
];

// Update PRD with missing fields
const { error } = await supabase
  .from('product_requirements_v2')
  .update({
    system_architecture: systemArchitecture,
    implementation_approach: implementationApproach,
    risks: risks
  })
  .eq('id', 'PRD-SD-AGENT-ADMIN-001');

if (error) {
  console.error('❌ Error updating PRD:', error);
  process.exit(1);
}

console.log('✅ PRD Enhanced Successfully');
console.log('\n📋 Added Fields:');
console.log('   system_architecture: Frontend, Backend, Database, Deployment');
console.log('   implementation_approach: 10 sprints, 115 story points');
console.log('   risks: 8 identified risks with mitigations');
console.log('\n🎯 PRD quality should now meet 80% threshold');
console.log('   Retry PLAN→EXEC handoff');
