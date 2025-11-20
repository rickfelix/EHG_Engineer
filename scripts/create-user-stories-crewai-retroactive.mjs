import { createSupabaseServiceClient } from './lib/supabase-connection.js';

async function createUserStories() {
  const client = await createSupabaseServiceClient('engineer', { verbose: false });

  // Check existing stories
  const { data: existingStories } = await client
    .from('user_stories')
    .select('id, story_key')
    .eq('sd_id', 'SD-CREWAI-ARCHITECTURE-001');

  console.log('Existing user stories:', existingStories?.length || 0);

  if (existingStories && existingStories.length > 0) {
    console.log('✅ User stories already exist');
    existingStories.forEach(s => console.log('   -', s.story_key));
    return;
  }

  // Create user stories for the phased implementation
  const stories = [
    {
      sd_id: 'SD-CREWAI-ARCHITECTURE-001',
      story_key: 'SD-CREWAI-ARCHITECTURE-001:US-001',
      title: 'Phase 2: Migrate 44 CrewAI agents to database',
      user_role: 'system administrator',
      user_want: 'migrate all 44 Python-based CrewAI agents from files to the crewai_agents database table',
      user_benefit: 'centralized management of agents is achieved',
      description: 'As a system administrator, I want to migrate all 44 Python-based CrewAI agents from files to the crewai_agents database table so that centralized management of agents is achieved.',
      acceptance_criteria: ['All 44 agents scanned', 'Schema validation passes', 'RLS policies configured', 'Migration to database successful'],
      status: 'completed',
      implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

      priority: 'high',

      story_points: 8
    },
    {
      sd_id: 'SD-CREWAI-ARCHITECTURE-001',
      story_key: 'SD-CREWAI-ARCHITECTURE-001:US-002',
      title: 'Phase 6: Knowledge Sources & RAG UI',
      user_role: 'user',
      user_want: 'configure knowledge sources and embedder settings for agents via UI',
      user_benefit: 'RAG functionality can be enabled',
      description: 'As a user, I want to configure knowledge sources and embedder settings for agents via UI so that RAG functionality can be enabled.',
      acceptance_criteria: ['Knowledge source management UI', 'Embedder configuration (OpenAI/Cohere/HuggingFace)', 'File upload support', 'URL ingestion support'],
      status: 'completed',
      implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

      priority: 'high',

      story_points: 8
    },
    {
      sd_id: 'SD-CREWAI-ARCHITECTURE-001',
      story_key: 'SD-CREWAI-ARCHITECTURE-001:US-003',
      title: 'Infrastructure: Fix RLS policies for sub-agent orchestration',
      user_role: 'developer',
      user_want: 'fix RLS policies for sub-agent orchestration',
      user_benefit: 'sub-agent orchestration can access database tables during handoff creation',
      description: 'As a developer, I want RLS policies fixed so that sub-agent orchestration can access database tables during handoff creation.',
      acceptance_criteria: ['Service role key pattern implemented', 'lib/sub-agent-executor.js updated', 'orchestrate-phase-subagents.js updated', 'unified-handoff-system.js template loading fixed'],
      status: 'completed',
      implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

      priority: 'critical',

      story_points: 5
    }
  ];

  const { data, error } = await client
    .from('user_stories')
    .insert(stories)
    .select();

  if (error) {
    console.log('❌ Error creating stories:', error.message);
    throw error;
  }

  console.log('✅ Created', data.length, 'user stories');
  data.forEach(s => console.log('   -', s.story_key, ':', s.title));
}

createUserStories().catch(console.error);
