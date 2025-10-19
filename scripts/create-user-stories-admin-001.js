#!/usr/bin/env node

/**
 * Create User Stories for SD-AGENT-ADMIN-001
 * Agent Configuration & Control Platform
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

const SD_ID = 'SD-AGENT-ADMIN-001';

const userStories = [
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-001`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Venture Preset Management UI',
    user_role: 'admin',
    user_want: 'a UI to create and manage industry-specific venture presets',
    user_benefit: 'I can configure agent research focus without code changes',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Route /admin/venture-presets accessible to admins',
      'Create/edit/delete presets via UI',
      'Preset includes: industry, focus areas, data sources, agent weights',
      'Activate/deactivate presets',
      'Presets available in venture creation dropdown'
    ],
    definition_of_done: [],
    technical_notes: 'Create venture_ideation_presets table, admin UI component, preset selection dropdown in venture creation',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-002`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Example Industry Presets',
    user_role: 'admin',
    user_want: 'pre-configured presets for common industries (SaaS HealthTech, FinTech, E-commerce)',
    user_benefit: 'I can quickly configure agents for these industries without manual setup',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'SaaS Healthcare Pain Points preset created',
      'FinTech Compliance Requirements preset created',
      'E-commerce Market Sizing preset created',
      'Each preset includes appropriate focus areas and agent weights'
    ],
    definition_of_done: [],
    technical_notes: 'Seed database with 3 example presets matching SD technical details',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-003`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Prompt Library Admin UI',
    user_role: 'admin',
    user_want: 'a UI to view and manage all agent prompts by role',
    user_benefit: 'I can see all prompts in one place and make changes without deployments',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Route /admin/prompts accessible to admins',
      'View all prompts organized by agent role',
      'Create new prompt versions',
      'Compare prompt versions side-by-side',
      'Track performance metrics per prompt'
    ],
    definition_of_done: [],
    technical_notes: 'Create prompt_templates table, prompt library UI, version comparison view',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-004`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Prompt Version Control',
    user_role: 'admin',
    user_want: 'version control for prompts with ability to rollback',
    user_benefit: 'I can experiment with prompts safely and revert if needed',
    story_points: 3,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Version numbers auto-increment for each prompt',
      'View version history',
      'Rollback to previous version',
      'Only one version is active per agent role at a time'
    ],
    definition_of_done: [],
    technical_notes: 'Implement version tracking in prompt_templates, rollback functionality',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-005`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Prompt A/B Testing Framework',
    user_role: 'admin',
    user_want: 'to run A/B tests on prompt variants with statistical significance tracking',
    user_benefit: 'I can objectively determine which prompts perform better',
    story_points: 8,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Create prompt variant and assign 50/50 traffic split',
      'Track metrics: confidence scores, Chairman acceptance, completion rate, execution time, error rate',
      'Run t-test after N=30 samples',
      'If p<0.05 and variant performs better, prompt to promote',
      'Admin can review and promote winning variant'
    ],
    definition_of_done: [],
    technical_notes: 'Create ab_tests table, implement traffic splitting, statistical significance testing',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-006`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Agent Settings Panel',
    user_role: 'admin',
    user_want: 'a UI to configure LLM models and parameters per agent',
    user_benefit: 'I can tune agent performance without code deployments',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Route /admin/agent-settings accessible to admins',
      'Select LLM per agent (GPT-4, Claude 3.5, Gemini Pro)',
      'Tune temperature (0.0-1.0)',
      'Set max tokens and context window',
      'Configure retry policies (attempts, backoff)',
      'Set performance thresholds (confidence, execution time)'
    ],
    definition_of_done: [],
    technical_notes: 'Store config in crewai_agents.llm_config JSONB field, admin UI for editing',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-007`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Agent Config Hot Reload',
    user_role: 'admin',
    user_want: 'agents to reload configuration every 60 seconds without deployment',
    user_benefit: 'my config changes apply immediately',
    story_points: 3,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Agents check database for config updates every 60 seconds',
      'Config changes apply within 60 seconds',
      'No deployment required',
      'Log when config is reloaded'
    ],
    definition_of_done: [],
    technical_notes: 'Implement config polling in agent runtime, cache invalidation',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-008`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Search Preference Engine',
    user_role: 'user',
    user_want: 'to save my search preferences to guide agent research',
    user_benefit: 'agents prioritize research areas I care about',
    story_points: 5,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'User enters search preference (e.g., "SaaS products addressing healthcare pain points")',
      'System parses and extracts keywords, industry, focus areas',
      'Agents use preferences to prioritize data sources and research angles',
      'Track which preferences lead to successful ventures',
      'Suggest refinements based on historical success'
    ],
    definition_of_done: [],
    technical_notes: 'Create user_search_preferences table, keyword extraction, agent preference integration',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-009`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Performance Monitoring Dashboard',
    user_role: 'admin',
    user_want: 'a dashboard showing real-time agent performance metrics',
    user_benefit: 'I can identify performance issues and optimization opportunities',
    story_points: 8,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'Route /admin/agent-performance accessible to admins',
      'Display metrics: tasks completed/failed, execution time, success rate, confidence scores, Chairman acceptance, costs, errors',
      'Visualizations: success rate trends (7d, 30d, all time), confidence distributions, execution time comparison, feedback patterns',
      'WebSocket updates every 5 seconds',
      'Export metrics to CSV'
    ],
    definition_of_done: [],
    technical_notes: 'Create performance dashboard component, WebSocket integration, chart library (Recharts)',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-010`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Performance Alerting System',
    user_role: 'admin',
    user_want: 'email alerts when agent success rate drops below threshold',
    user_benefit: 'I know immediately when agents are underperforming',
    story_points: 3,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'Configure alert thresholds per agent',
      'Email sent when success rate drops below threshold',
      'Alert includes agent name, current success rate, threshold',
      'Alert frequency: max once per hour per agent'
    ],
    definition_of_done: [],
    technical_notes: 'Implement alerting service with email integration, threshold monitoring',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-011`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Enable/Disable Agents Globally',
    user_role: 'admin',
    user_want: 'to enable or disable agents globally without code changes',
    user_benefit: 'I can quickly disable problematic agents',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Toggle agent enabled/disabled in agent settings panel',
      'Disabled agents skip execution',
      'Venture creation workflow adapts to disabled agents',
      'Log when agent is disabled/enabled'
    ],
    definition_of_done: [],
    technical_notes: 'Add enabled flag check before agent execution, UI toggle in settings panel',
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
