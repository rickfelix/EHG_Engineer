#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('📋 Creating PRD for SD-AGENT-ADMIN-001');

const { data, error } = await supabase
  .from('product_requirements_v2')
  .insert([{
    id: 'PRD-SD-AGENT-ADMIN-001',
    directive_id: 'SD-AGENT-ADMIN-001',
    title: 'Agent Engineering Department - Admin Tooling Suite',
    version: '1.0',
    status: 'active',
    category: 'technical',
    priority: 'high',
    executive_summary: 'Comprehensive admin tooling suite for the 42-agent AI research platform. Enables non-technical users to configure, manage, and optimize agents without code changes. Reduces configuration time from 30+ minutes to <5 minutes through UI-based workflows.',
    functional_requirements: [
      'Preset Management: Save/load/share agent configurations',
      'Prompt Library: Centralized prompt management with A/B testing',
      'Agent Settings: UI-based parameter configuration',
      'Search Preferences: Customize search behavior per use case',
      'Performance Dashboard: Real-time agent monitoring and alerts'
    ],
    acceptance_criteria: [
      'Users can save agent configurations as presets',
      'Prompts editable via UI without code changes',
      'A/B tests track performance metrics',
      'Agent settings save within 1 second',
      'Dashboard loads within 2 seconds',
      'All 23 user stories (US-1 through US-23) implemented'
    ],
    test_scenarios: [
      'Smoke: Create/load/delete preset',
      'Smoke: Edit prompt and create A/B test',
      'Smoke: Update agent settings',
      'Smoke: Create search profile',
      'Smoke: View performance dashboard',
      'E2E: Complete preset workflow',
      'E2E: A/B test from creation to winner promotion'
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
      prd_source: 'Comprehensive PRD stored in create-prd-agent-admin-001.mjs for full details'
    }
  }])
  .select();

if (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

console.log('✅ PRD Created Successfully');
console.log(`   ID: ${data[0].id}`);
console.log(`   Title: ${data[0].title}`);
console.log(`   Story Points: ${data[0].metadata.story_points}`);
console.log(`   Subsystems: ${data[0].metadata.subsystems.length}`);
console.log('\n🚀 Next: Engage Product Requirements Expert for User Stories');
