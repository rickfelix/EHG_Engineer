#!/usr/bin/env node

/**
 * Create SD-AGENT-ADMIN-003: AI Agent Management Platform (Fresh Start)
 *
 * CONTEXT:
 * - SD-AGENT-ADMIN-002 marked "completed" but 57/57 backlog items NOT_STARTED
 * - Investigation report reveals: empty database tables, RLS issues, UI query problems
 * - PRD requirements not met: "All 57 user stories implemented" = FALSE
 * - This is a complete restart with proper LEO Protocol flow: LEAD→PLAN→EXEC
 *
 * SCOPE:
 * - 5 subsystems: Preset Management, Prompt Library, Agent Settings, Search Preferences, Performance Dashboard
 * - 6 database tables: ai_ceo_agents, crewai_agents, agent_departments, crewai_crews, crew_members, agent_tools
 * - UI components: Monaco editor, Recharts visualizations, Radix UI integration
 * - RLS policies: Anon access for all agent tables
 * - Seed data: 11 departments, 8 tools, 4 research agents, 1 crew
 *
 * EVIDENCE:
 * - AGENT_DATA_INVESTIGATION_REPORT.md (489 lines, comprehensive analysis)
 * - 57 backlog items from SD-AGENT-ADMIN-002 (all NOT_STARTED)
 * - Database migration exists but seed data failed silently
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function createSD() {
  console.log('🚀 Creating SD-AGENT-ADMIN-003: AI Agent Management Platform (Fresh Start)\n');

  const sdData = {
    id: 'SD-AGENT-ADMIN-003',
    sd_key: 'SD-AGENT-ADMIN-003',
    title: 'AI Agent Management Platform - Complete Implementation',
    description: `Complete end-to-end implementation of AI Agent Management Platform based on comprehensive investigation report.

**WHY THIS SD EXISTS:**
SD-AGENT-ADMIN-002 marked "completed" with 100% progress, but investigation reveals:
- 57/57 backlog items NOT_STARTED ❌
- All database tables empty (0 records) ❌
- Seed data migration failed silently ❌
- RLS policies block anon access ❌
- UI queries wrong tables ❌
- PRD requirement "All 57 user stories implemented" = FALSE ❌

**FULL SCOPE (57 backlog items organized into 5 subsystems):**

1. **Preset Management (12 items):**
   - View/create/apply/edit/delete presets
   - Export/import presets (JSON backup)
   - Preset usage statistics
   - Configuration validation
   - Preview before applying
   - Categorization by use case
   - Two-way sync with AgentSettingsTab

2. **Prompt Library & A/B Testing (18 items):**
   - Browse prompts by category
   - Create/edit/version prompt templates
   - Tag and search prompts
   - Test prompts before deployment
   - Create A/B tests with 2-4 variants
   - Monitor active A/B tests
   - View results with statistical confidence
   - Visualize results (Recharts)
   - Declare winning variant and deploy
   - Automatic A/B test data collection
   - Historical test results
   - Clone tests for re-testing
   - Prevent invalid test configurations
   - Monaco editor keyboard shortcuts
   - Link prompts to agent roles

3. **Agent Settings Integration (7 items):**
   - Load preset from AgentSettingsTab
   - Save current settings as new preset
   - Show active preset indicator
   - Reset settings to active preset
   - Update existing preset with current settings
   - Real-time sync between AgentSettingsTab and AgentPresetsTab
   - Keyboard shortcuts in AgentSettingsTab

4. **Search Preferences Engine (10 items):**
   - Select default search engine
   - Configure results per page
   - Enable/disable safe search
   - Set region and language preferences
   - Configure custom search endpoint
   - Test search configuration
   - Configure result filtering
   - Set timeout preferences
   - Cache search preferences
   - View search usage statistics

5. **Advanced Performance Dashboard (10 items):**
   - View historical performance trends (7d/30d/90d)
   - Compare performance across agents
   - Drill down by capability
   - Set performance alerts
   - View active alerts
   - Export performance reports
   - Highlight performance anomalies
   - Customize dashboard layout
   - Real-time data loading
   - Performance metrics summary cards

**DATABASE REQUIREMENTS:**
- Tables: ai_ceo_agents, crewai_agents, agent_departments, crewai_crews, crew_members, agent_tools
- Seed Data: 11 departments, 8 tools, 4 research agents, 1 crew
- RLS Policies: Enable anon SELECT access for all agent tables
- Migrations: Fix silent seed data failure from SD-AGENT-ADMIN-002

**TECHNICAL INFRASTRUCTURE:**
- Monaco editor integration (syntax highlighting, IntelliSense)
- Recharts visualizations (113+ components available)
- Radix UI components (complete library available)
- Two-way state sync between tabs
- A/B testing statistical framework
- Performance alerts system
- Real-time data loading

**ACCEPTANCE CRITERIA (FROM INVESTIGATION REPORT):**
1. All 57 backlog items implemented with passing acceptance criteria
2. Agent configuration time <60 seconds using presets
3. Prompt reuse rate >70% within 30 days
4. A/B tests create successfully with 2-4 variants
5. Performance trends visible for 7d/30d/90d timeframes
6. All CRUD operations working (presets, prompts, tests, search prefs)
7. Two-way sync between AgentSettingsTab and AgentPresetsTab working
8. Monaco editor loads with <100ms typing latency
9. Recharts visualizations render on desktop/tablet/mobile
10. Page load time <2 seconds (Monaco lazy loaded)
11. WCAG 2.1 AA accessibility compliance
12. Responsive design: 320px (mobile), 768px (tablet), 1024px+ (desktop)
13. RLS policies enforce user data isolation
14. Input validation prevents injection attacks
15. Component sizing: 300-800 LOC (optimal 300-600)
16. Build successful with no errors
17. Test coverage: Tier 1 smoke tests + E2E tests pass (100% user story coverage)

**EVIDENCE:**
- Investigation Report: AGENT_DATA_INVESTIGATION_REPORT.md (489 lines)
- Parent SD: SD-AGENT-ADMIN-002 (57 backlog items, all NOT_STARTED)
- Database Migration: 20251008000000_agent_platform_schema.sql (tables exist, seed data missing)
- Target Application: EHG (/mnt/c/_EHG/ehg)`,

    status: 'draft',
    priority: 'critical', // CRITICAL - Stage 1 blocker, prevents agent platform launch
    category: 'agent-platform',
    target_application: 'EHG',
    current_phase: 'lead_initial_review',
    progress: 0,

    rationale: `**WHY THIS SD IS CRITICAL:**

1. **SD-AGENT-ADMIN-002 False Completion:**
   - Marked "completed" with 100% progress
   - Reality: 57/57 backlog items NOT_STARTED
   - PRD requirement "All 57 user stories implemented" = FALSE
   - Tests passed but no actual functionality delivered

2. **Business Impact:**
   - Agent platform cannot launch without management UI
   - No way to configure agents for different use cases
   - No preset system = every agent requires manual configuration
   - No A/B testing = cannot optimize prompts
   - No performance monitoring = blind to agent quality issues

3. **Technical Debt:**
   - Database schema exists but tables are empty (0 records)
   - Seed data migration failed silently
   - RLS policies block anon access (UI cannot query data)
   - UI queries wrong tables (ai_ceo_agents only, ignores crewai_agents)
   - 489-line investigation report documents all gaps

4. **Strategic Priority:**
   - Stage 1 dependency: Agent platform is core value proposition
   - EVA (AI assistant) requires agent orchestration capabilities
   - Competitive advantage: AI-powered venture analysis depends on agent quality
   - GTM blocker: Cannot demo agent platform without management UI

5. **Cost of Delay:**
   - Each day without agent management = manual configuration overhead
   - No preset reuse = 10x longer agent setup time
   - No A/B testing = suboptimal prompts reduce agent quality
   - No performance monitoring = cannot identify/fix underperforming agents

**FRESH START RATIONALE:**
Re-opening SD-AGENT-ADMIN-002 would carry technical debt and confusion. Clean slate with proper LEO Protocol flow (LEAD→PLAN→EXEC) ensures:
- Comprehensive PRD creation with clear objectives
- User stories generated from PRD (100% coverage of 57 backlog items)
- Proper database migration validation (prevent silent seed data failures)
- E2E tests with explicit user story mapping
- No premature "completion" claims`,

    scope: {
      total_story_points: 115,
      estimated_effort: '7-9 days (56-71 hours)',
      subsystems: [
        {
          name: 'Preset Management',
          priority: 'HIGH',
          story_points: 25,
          status: 'not_started',
          features: [
            'View/create/apply/edit/delete presets',
            'Export/import presets (JSON backup)',
            'Preset usage statistics',
            'Configuration validation',
            'Preview before applying',
            'Categorization by use case',
            'Two-way sync with AgentSettingsTab'
          ]
        },
        {
          name: 'Prompt Library + A/B Testing',
          priority: 'CRITICAL',
          story_points: 35,
          status: 'not_started',
          features: [
            'Browse prompts by category',
            'Create/edit/version prompt templates',
            'Tag and search prompts',
            'Test prompts before deployment',
            'Create A/B tests with 2-4 variants',
            'Monitor active A/B tests',
            'View results with statistical confidence',
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
          name: 'Agent Settings Integration',
          priority: 'HIGH',
          story_points: 15,
          status: 'partial',
          features: [
            'Load preset from AgentSettingsTab',
            'Save current settings as new preset',
            'Show active preset indicator',
            'Reset settings to active preset',
            'Update existing preset with current settings',
            'Real-time sync between AgentSettingsTab and AgentPresetsTab',
            'Keyboard shortcuts in AgentSettingsTab'
          ]
        },
        {
          name: 'Search Preference Engine',
          priority: 'MEDIUM',
          story_points: 20,
          status: 'not_started',
          features: [
            'Select default search engine',
            'Configure results per page',
            'Enable/disable safe search',
            'Set region and language preferences',
            'Configure custom search endpoint',
            'Test search configuration',
            'Configure result filtering',
            'Set timeout preferences',
            'Cache search preferences',
            'View search usage statistics'
          ]
        },
        {
          name: 'Advanced Performance Dashboard',
          priority: 'HIGH',
          story_points: 20,
          status: 'partial',
          features: [
            'View historical performance trends (7d/30d/90d)',
            'Compare performance across agents',
            'Drill down by capability',
            'Set performance alerts',
            'View active alerts',
            'Export performance reports',
            'Highlight performance anomalies',
            'Customize dashboard layout',
            'Real-time data loading',
            'Performance metrics summary cards'
          ]
        }
      ],
      codebase_leverage: [
        'AgentSettingsTab.tsx (409 lines, sliders/toggles built)',
        '113+ Recharts chart components (patterns to reuse)',
        'Complete Radix UI library (sliders, switches, tabs, selects)',
        'Supabase real-time subscriptions (already working)',
        'Database migration schema (tables exist, just need seed data)'
      ],
      must_build: [
        '@monaco-editor/react (new npm dependency)',
        '6 database tables with seed data (11 departments, 8 tools, 4 agents, 1 crew)',
        'A/B testing statistical framework (no existing pattern)',
        'Performance alerts system',
        'Prompt versioning logic',
        'Two-way state sync between tabs',
        'RLS policies for anon access'
      ]
    },

    metadata: {
      parent_sd: 'SD-AGENT-ADMIN-002',
      reason_for_restart: 'SD-AGENT-ADMIN-002 marked complete but 57/57 backlog items NOT_STARTED',
      investigation_report: 'AGENT_DATA_INVESTIGATION_REPORT.md',
      backlog_items_count: 57,
      subsystems_count: 5,
      database_tables_count: 6,
      seed_data_required: true,
      rls_fixes_required: true,
      monaco_editor_required: true,
      recharts_required: true,
      ab_testing_framework_required: true,

      estimated_effort: {
        database_setup: '2-3 hours (seed data + RLS policies)',
        preset_management: '8-10 hours (12 backlog items)',
        prompt_library_ab_testing: '16-20 hours (18 backlog items)',
        agent_settings_integration: '6-8 hours (7 backlog items)',
        search_preferences: '8-10 hours (10 backlog items)',
        performance_dashboard: '10-12 hours (10 backlog items)',
        testing_qa: '6-8 hours (E2E + unit tests for all subsystems)',
        total: '56-71 hours (7-9 days full-time)'
      },

      key_risks: [
        'Monaco editor bundle size (may require code splitting)',
        'A/B testing statistical framework complexity',
        'Two-way state sync between tabs (potential race conditions)',
        'RLS policies may conflict with existing auth policies',
        'Seed data failure recurrence (need robust error handling)'
      ],

      leverage_existing: [
        'AgentSettingsTab (30% complete - 200+ LOC)',
        '113+ Recharts components (installed and working)',
        'Complete Radix UI library (buttons, modals, dropdowns)',
        'Database migration schema (tables exist, just need seed data)',
        'Authentication system (Supabase Auth working)'
      ]
    }
  };

  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert([sdData])
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating SD:', error);
      process.exit(1);
    }

    console.log('✅ SD-AGENT-ADMIN-003 created successfully!\n');
    console.log('📋 DETAILS:');
    console.log(`   ID: ${data.id}`);
    console.log(`   Title: ${data.title}`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Priority: ${data.priority} (CRITICAL)`);
    console.log(`   Category: ${data.category}`);
    console.log(`   Target App: ${data.target_application}`);
    console.log(`   Current Phase: ${data.current_phase}`);
    console.log(`   Progress: ${data.progress}%`);

    console.log('\n📊 SCOPE:');
    console.log('   - 57 backlog items (5 subsystems)');
    console.log('   - 6 database tables + seed data');
    console.log('   - Monaco editor + Recharts + Radix UI');
    console.log('   - A/B testing framework');
    console.log('   - RLS policy fixes');

    console.log('\n⏱️  ESTIMATED EFFORT:');
    console.log('   - Total: 56-71 hours (7-9 days)');
    console.log('   - Database: 2-3 hours');
    console.log('   - Presets: 8-10 hours');
    console.log('   - Prompts/A/B: 16-20 hours');
    console.log('   - Settings: 6-8 hours');
    console.log('   - Search: 8-10 hours');
    console.log('   - Performance: 10-12 hours');
    console.log('   - Testing/QA: 6-8 hours');

    console.log('\n🔗 LINKS:');
    console.log(`   Dashboard: http://localhost:3000/strategic-directives/${data.id}`);
    console.log(`   Parent SD: SD-AGENT-ADMIN-002`);
    console.log(`   Investigation Report: AGENT_DATA_INVESTIGATION_REPORT.md`);

    console.log('\n📝 NEXT STEPS:');
    console.log('   1. LEAD reviews scope and approves SD');
    console.log('   2. LEAD creates LEAD→PLAN handoff');
    console.log('   3. PLAN creates comprehensive PRD with:');
    console.log('      - Clear objectives (5 subsystems)');
    console.log('      - Feature breakdown (57 backlog items)');
    console.log('      - Database schema (6 tables + seed data)');
    console.log('      - Technical architecture (Monaco, Recharts, A/B framework)');
    console.log('   4. PLAN generates user stories (100% coverage of 57 backlog items)');
    console.log('   5. EXEC implements with proper testing (unit + E2E)');

    console.log('\n✅ SD-AGENT-ADMIN-003 is ready for LEAD review!');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

createSD();
