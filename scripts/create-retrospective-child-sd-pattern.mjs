import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const client = await createSupabaseServiceClient('engineer', { verbose: false });

console.log('\n📝 Creating retrospective: Child SD Pattern for Phased Work...\n');

const retrospective = {
  sd_id: 'SD-CREWAI-ARCHITECTURE-001',
  title: 'Child SD Pattern: Learning from Phased Multi-Session Implementation',

  what_worked: [
    'Phased implementation approach allowed parallel work across multiple sessions',
    'Breaking work into distinct phases (Phase 2: Agent Migration, Phase 6: RAG UI, Infrastructure: RLS Fixes) enabled focused completion',
    'Each phase had clear deliverables and could be completed independently',
    'Technical implementation was successful (44 agents migrated, RAG UI complete, RLS policies fixed)',
    'Retrospective generation captured comprehensive lessons (quality score 90/100)'
  ],

  what_didnt_work: [
    'LEO Protocol progress validation expects linear single-session completion',
    'Progress stuck at 55% despite 100% implementation complete',
    'Had to retroactively create handoffs and mark user stories complete',
    'Progress calculation does not support parallel phased work',
    'Database triggers block completion when phases completed out of order',
    'No native support for parent/child SD hierarchy'
  ],

  key_lessons: [
    '**CRITICAL INSIGHT**: Multi-phase SDs should use Child SD Pattern, not phases within single SD',
    'Linear LEO Protocol validation (LEAD→PLAN→EXEC→PLAN→LEAD) assumes single-session completion',
    'Phased work across multiple sessions needs hierarchical SD structure (parent orchestrator + child implementations)',
    'Current approach: Single SD with phases = Validation mismatch and retroactive fixes',
    'Proposed approach: Parent SD (orchestrator) + Child SDs (implementation units) = Natural progress tracking',
    'Child SD Pattern benefits: (1) Each phase goes through full LEO cycle independently, (2) Progress calculation naturally aggregates from children, (3) No retroactive handoff creation needed, (4) Supports parallel work by different agents/people'
  ],

  action_items: [
    {
      description: 'Add parent_sd_id column to strategic_directives_v2 table',
      assignee: 'DATABASE',
      priority: 'high',
      status: 'pending'
    },
    {
      description: 'Create sd_children view for parent/child hierarchy queries',
      assignee: 'DATABASE',
      priority: 'high',
      status: 'pending'
    },
    {
      description: 'Update CLAUDE_PLAN.md with "When to Create Child SDs" section',
      assignee: 'PLAN',
      priority: 'high',
      status: 'pending'
    },
    {
      description: 'Update CLAUDE_EXEC.md with "Working with Child SDs" section',
      assignee: 'EXEC',
      priority: 'high',
      status: 'pending'
    },
    {
      description: 'Implement calculate_parent_sd_progress() function for weighted child progress',
      assignee: 'DATABASE',
      priority: 'medium',
      status: 'pending'
    },
    {
      description: 'Update SD creation prompts to suggest Child SD pattern for large scopes (≥8 user stories)',
      assignee: 'LEAD',
      priority: 'medium',
      status: 'pending'
    }
  ],

  impact_assessment: {
    scope: 'LEO Protocol Enhancement',
    affected_areas: ['Strategic Directive Management', 'Progress Tracking', 'Multi-Session Workflows', 'CLAUDE.md Documentation'],
    benefits: [
      'Natural support for phased multi-session implementations',
      'Eliminates retroactive handoff creation',
      'Accurate progress tracking for parallel work',
      'Clean orchestration of complex SDs',
      'Better separation of concerns (orchestration vs implementation)'
    ],
    risks: [
      'Database schema change requires migration',
      'Learning curve for LEAD/PLAN agents to decide when to use pattern',
      'Existing in-progress phased SDs may need migration strategy'
    ]
  },

  metadata: {
    implementation_phases_completed: ['Phase 2: Agent Migration', 'Phase 6: RAG UI', 'Infrastructure: RLS Fixes'],
    total_user_stories: 25,
    total_story_points: 64,
    agents_migrated: 44,
    crewai_version: '1.3.0',
    learning_source: 'SD-CREWAI-ARCHITECTURE-001 completion challenges',
    recommendation_document: 'docs/recommendations/child-sd-pattern-for-phased-work.md',
    user_insight: 'In retrospective, do you think it would have made more sense to create children strategic directives instead of phases?'
  },

  quality_score: 92,
  status: 'PUBLISHED'
};

const { data, error } = await client
  .from('retrospectives')
  .insert(retrospective)
  .select()
  .single();

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log('✅ Retrospective created successfully!\n');
console.log(`   ID: ${data.id}`);
console.log(`   Title: ${data.title}`);
console.log(`   Quality Score: ${data.quality_score}/100`);
console.log(`   Status: ${data.status}`);
console.log(`\n📊 Key Lessons:`);
retrospective.key_lessons.forEach(lesson => console.log(`   • ${lesson}`));
console.log(`\n🎯 Action Items: ${retrospective.action_items.length}`);
