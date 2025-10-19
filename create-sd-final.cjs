require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

(async () => {
  const { data: minRank } = await supabase
    .from('strategic_directives_v2')
    .select('sequence_rank')
    .order('sequence_rank', { ascending: true })
    .limit(1)
    .single();

  const lowestRank = minRank ? minRank.sequence_rank - 10 : 10;

  const newSD = {
    id: 'SD-AGENT-ADMIN-002',
    sd_key: 'SD-AGENT-ADMIN-002',
    title: 'Agent Engineering Admin Suite - Complete Missing Subsystems',
    version: '1.0',
    description: 'Complete remaining 70% of SD-AGENT-ADMIN-001 based on comprehensive codebase analysis. Gap: 5 subsystems missing (Preset Management, Prompt Library, Agent Settings completion, Search Preferences, Advanced Performance Dashboard). Evidence: Screenshot audit + code review validated all gaps. Leverage: AgentSettingsTab (30% complete), 113+ Recharts components, complete Radix UI library. Must build: Monaco editor integration, 4 new database tables, A/B testing framework, performance alerts system.',
    rationale: 'Business Impact: 42-agent platform operationally bottlenecked without admin tooling. Current pain: config changes require code deployments (30+ min). ROI: 17.5 hrs/week saved, +15-20% prompt quality improvement, zero config errors via UI validation. Codebase analysis (5 comprehensive prompts) validated all 5 missing subsystems and identified leverage opportunities to accelerate delivery.',
    status: 'draft',
    priority: 'critical',
    category: 'admin-tooling',
    target_application: 'EHG',
    sequence_rank: lowestRank,
    scope: {
      total_story_points: 115,
      estimated_effort: '10-14 sprints',
      subsystems: [
        { name: 'Preset Management', priority: 'HIGH', story_points: 25, status: 'not_started' },
        { name: 'Prompt Library + A/B Testing', priority: 'CRITICAL', story_points: 35, status: 'not_started' },
        { name: 'Agent Settings Panel (Complete)', priority: 'HIGH', story_points: 15, status: 'partial' },
        { name: 'Search Preference Engine', priority: 'MEDIUM', story_points: 20, status: 'not_started' },
        { name: 'Advanced Performance Dashboard', priority: 'HIGH', story_points: 20, status: 'partial' }
      ],
      codebase_leverage: [
        'AgentSettingsTab.tsx (409 lines, sliders/toggles built)',
        '113+ Recharts chart components (patterns to reuse)',
        'Complete Radix UI library (sliders, switches, tabs, selects)',
        'Supabase real-time subscriptions (already working)',
        'Report template pattern (chairman_dashboard_tables.sql)'
      ],
      must_build: [
        '@monaco-editor/react (new npm dependency)',
        '4 new database tables (prompt_templates, agent_configs, ab_tests, search_preferences)',
        'A/B testing framework (no existing pattern)',
        'Performance alerts system',
        'Prompt versioning logic'
      ]
    },
    metadata: {
      parent_sd: 'SD-AGENT-ADMIN-001',
      gap_analysis_date: '2025-10-08',
      completion_discrepancy: '70% not delivered',
      evidence: 'Screenshot comparison + codebase audit (5 prompts)',
      analysis_prompts: [
        'Prompt 1: Agent Configuration - Found AgentConfiguration interface + AgentSettingsTab',
        'Prompt 2: UI Components - Recharts installed, Monaco missing',
        'Prompt 3: Database - ai_agents exists, missing 4 tables',
        'Prompt 4: Performance - Basic metrics exist, missing advanced charts/alerts',
        'Prompt 5: Similar Patterns - Report templates found, no A/B testing'
      ]
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'LEAD',
    current_phase: 'LEAD',
    progress: 0
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(newSD)
    .select()
    .single();

  if (error) {
    console.error('Error creating SD:', JSON.stringify(error, null, 2));
    process.exit(1);
  }

  console.log('SUCCESS: Strategic Directive Created!');
  console.log('');
  console.log('SD-AGENT-ADMIN-002 (CRITICAL PRIORITY)');
  console.log('Priority: critical | Sequence Rank:', data.sequence_rank, '(LOWEST = TOP OF BACKLOG)');
  console.log('Target: EHG | Status: draft | Phase: LEAD');
  console.log('');
  console.log('Scope: 115 story points, 5 subsystems, 10-14 sprints');
  console.log('Gap: 70% of SD-AGENT-ADMIN-001 not delivered');
  console.log('');
  console.log('Subsystems:');
  data.scope.subsystems.forEach((sub, i) => {
    console.log(' ', (i+1) + '.', sub.name, '-', sub.priority, '(' + sub.story_points, 'pts)');
  });
  console.log('');
  console.log('Analysis: 5 comprehensive prompts executed');
  console.log('Leverage:', data.scope.codebase_leverage.length, 'existing patterns');
  console.log('Must Build:', data.scope.must_build.length, 'new components');
})();
