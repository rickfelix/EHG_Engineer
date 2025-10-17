#!/usr/bin/env node

/**
 * Create User Stories for SD-VENTURE-IDEATION-MVP-001
 * Intelligent Venture Creation MVP with CrewAI Foundation
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

const SD_ID = 'SD-VENTURE-IDEATION-MVP-001';

const userStories = [
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-001`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Full-Page Venture Creation Workflow',
    user_role: 'chairman',
    user_want: 'a dedicated full-page workflow for creating new ventures instead of a modal dialog',
    user_benefit: 'I have more space to input details and see AI research progress',
    story_points: 5,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Route /ventures/new loads successfully',
      'Full-page interface with multi-step progress indicator',
      'Modal VentureCreationDialog is replaced/deprecated',
      'Navigation integrates seamlessly with existing app structure'
    ],
    definition_of_done: [],
    technical_notes: 'Create new React component with route at /ventures/new, implement multi-step form with progress tracking',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-002`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Company Assignment Field',
    user_role: 'chairman',
    user_want: 'to assign a venture to a specific company (defaulting to EHG)',
    user_benefit: 'ventures are properly organized by company ownership',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Company field is required',
      'Defaults to EHG automatically',
      'Editable at Phase 3 after AI research completes',
      'Validates company selection before submission'
    ],
    definition_of_done: [],
    technical_notes: 'Add company dropdown/select with default value, implement edit lock until Phase 3',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-003`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'CrewAI Framework Integration',
    user_role: 'developer',
    user_want: 'to integrate CrewAI framework as the foundation for AI agent orchestration',
    user_benefit: 'we have enterprise-ready multi-agent capabilities with proven performance',
    story_points: 8,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'CrewAI installed via pip (crewai crewai-tools)',
      'Python FastAPI service running and accessible',
      'Hierarchical crew process configured',
      'REST API endpoints for agent execution from React frontend',
      'Database schema for crewai_agents, crewai_crews, crewai_tasks'
    ],
    definition_of_done: [],
    technical_notes: 'Setup Python backend with FastAPI, configure CrewAI hierarchical crews, create database tables for agent tracking',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-004`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Market Sizing Analyst Agent',
    user_role: 'chairman',
    user_want: 'an AI agent to calculate TAM/SAM/SOM for venture ideas',
    user_benefit: 'I receive data-driven market size estimates without manual research',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Agent deployed with role: Senior Market Intelligence Analyst',
      'Calculates TAM/SAM/SOM with market data APIs',
      'Completes analysis within 2-4 minutes',
      'Returns structured results with confidence scores',
      'Stores results in crewai_tasks table'
    ],
    definition_of_done: [],
    technical_notes: 'Create CrewAI agent with market data API tools, implement delegation, configure timeout and retry logic',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-005`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Pain Point Validator Agent',
    user_role: 'chairman',
    user_want: 'an AI agent to validate customer pain points via Reddit and forums',
    user_benefit: 'I know if the problem is real and how frustrated customers are',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Agent deployed with role: Customer Insights Researcher',
      'Integrates with Reddit API for scraping relevant subreddits',
      'Performs sentiment analysis on customer discussions',
      'Completes analysis within 3-5 minutes',
      'Returns pain point validation with evidence'
    ],
    definition_of_done: [],
    technical_notes: 'Extend GenericRestConnector for Reddit API, implement sentiment analysis, configure rate limiting (60 req/min)',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-006`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Competitive Landscape Mapper Agent',
    user_role: 'chairman',
    user_want: 'an AI agent to map the competitive landscape and identify differentiation opportunities',
    user_benefit: 'I understand who the competitors are and how to position uniquely',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Agent deployed with role: Competitive Intelligence Specialist',
      'Maps existing competitors in the space',
      'Identifies differentiation opportunities',
      'Completes analysis within 2-4 minutes',
      'Returns competitive analysis with positioning recommendations'
    ],
    definition_of_done: [],
    technical_notes: 'Configure agent with competitive tracking tools, market analysis APIs',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-007`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Strategic Fit Analyzer Agent',
    user_role: 'chairman',
    user_want: 'an AI agent to evaluate how the venture aligns with portfolio strategy',
    user_benefit: 'I make informed decisions about strategic fit and synergies',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Agent deployed with role: Strategic Portfolio Analyst',
      'Evaluates alignment with portfolio strategy',
      'Identifies synergies with existing ventures',
      'Completes analysis within 1-3 minutes',
      'Returns strategic fit score with justification'
    ],
    definition_of_done: [],
    technical_notes: 'Configure agent with portfolio analysis engine and synergy detection',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-008`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Pause and Resume Functionality',
    user_role: 'chairman',
    user_want: 'to pause venture creation mid-process and resume later',
    user_benefit: 'I can start ventures when I have time and finish them later',
    story_points: 3,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'Draft state persists to database on pause',
      'Resume functionality loads draft from database',
      'AI research progress is preserved',
      'User is returned to exact step where they left off'
    ],
    definition_of_done: [],
    technical_notes: 'Implement draft state management, database persistence for incomplete ventures',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-009`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'AI Research Progress Display',
    user_role: 'chairman',
    user_want: 'to see real-time progress as AI agents conduct research',
    user_benefit: 'I understand what\'s happening and don\'t wonder if the system is stuck',
    story_points: 3,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'Progress indicator shows which agents are running',
      'Real-time status updates (e.g., "Market Sizing Agent: Analyzing TAM...")',
      'Estimated time remaining displayed',
      'Handles 5-15 minute research duration gracefully'
    ],
    definition_of_done: [],
    technical_notes: 'Implement WebSocket or polling for real-time agent status, progress bar with step indicators',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-010`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Chairman Review and Edit Interface',
    user_role: 'chairman',
    user_want: 'to review, edit, and approve/reject AI-generated insights',
    user_benefit: 'I maintain control over final venture details and can override AI suggestions',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'Enhanced description displayed with AI-generated market insights',
      'Edit interface allows modifications to all fields',
      'Accept button saves AI suggestions as-is',
      'Reject button allows manual override',
      'Chairman feedback is tracked for learning'
    ],
    definition_of_done: [],
    technical_notes: 'Create review interface with diff view, accept/reject workflow, feedback tracking',
    created_by: 'SYSTEM'
  }
];

async function createUserStories() {
  console.log(`🎯 Creating User Stories for ${SD_ID}`);
  console.log('='.repeat(80));

  try {
    // Insert user stories
    const { data, error } = await supabase
      .from('user_stories')
      .insert(userStories)
      .select();

    if (error) throw error;

    console.log(`\n✅ Successfully created ${data.length} user stories!\n`);

    data.forEach((story, i) => {
      console.log(`${i + 1}. ${story.story_key}: ${story.title}`);
      console.log(`   Priority: ${story.priority} | Points: ${story.story_points} | Sprint: ${story.sprint}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log(`Total Story Points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
    console.log('='.repeat(80) + '\n');

    return data;
  } catch (error) {
    console.error('❌ Error creating user stories:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createUserStories();
}

export { createUserStories };
