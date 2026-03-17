#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🎯 LEAD Approval: SD-AGENT-ADMIN-001');
console.log('='.repeat(60));
console.log('\n📋 Full Scope Approval (All 5 Subsystems)');
console.log('   User Decision: "Keep the original scope."\n');

// Update SD status to active and move to PLAN phase
const { data: updateData, error: updateError } = await supabase
  .from('strategic_directives_v2')
  .update({
    status: 'active',
    current_phase: 'PLAN',
    priority: 'high',  // ✅ FIXED: String enum value, not integer
    progress: 5,  // LEAD approval = 5% of total
    metadata: {
      lead_approval_date: new Date().toISOString(),
      estimated_story_points: 115,
      estimated_sprints: '8-10',
      lead_decision: 'APPROVED - Full scope with all 5 subsystems',
      user_directive: 'Keep the original scope',
      subsystems: [
        {
          name: 'Preset Management System',
          story_points: '20-25',
          description: 'Agent configuration presets for common use cases'
        },
        {
          name: 'Prompt Library Admin UI with A/B Testing',
          story_points: '30-35',
          description: 'Manage and test prompt templates with versioning'
        },
        {
          name: 'Agent Settings Panel',
          story_points: '15-20',
          description: 'Configure agent parameters and behavior'
        },
        {
          name: 'Search Preference Engine',
          story_points: '15-20',
          description: 'Customize search behavior and data sources'
        },
        {
          name: 'Performance Monitoring Dashboard',
          story_points: '25-30',
          description: 'Track agent performance and system health'
        }
      ],
      lead_notes: [
        'Applied SIMPLICITY FIRST evaluation - scope is appropriate for value delivered',
        'All 5 subsystems are necessary for complete admin functionality',
        'No over-engineering concerns - standard admin tooling patterns',
        'User explicitly requested full scope retention'
      ]
    }
  })
  .eq('id', 'SD-AGENT-ADMIN-001')
  .select();

if (updateError) {
  console.error('❌ Error updating SD:', updateError);
  process.exit(1);
}

console.log('✅ SD-AGENT-ADMIN-001 LEAD Approval Complete');
console.log('\n📊 Updated Status:');
console.log('  Status: active');
console.log('  Phase: PLAN');
console.log('  Priority: high');
console.log('  Progress: 5%');
console.log('  Estimated Story Points: 115');
console.log('  Estimated Sprints: 8-10');
console.log('\n🏗️ Approved Subsystems:');
console.log('  1. Preset Management System (20-25 points)');
console.log('  2. Prompt Library Admin UI with A/B Testing (30-35 points)');
console.log('  3. Agent Settings Panel (15-20 points)');
console.log('  4. Search Preference Engine (15-20 points)');
console.log('  5. Performance Monitoring Dashboard (25-30 points)');
console.log('\n' + '='.repeat(60));
console.log('🚀 Next Phase: LEAD→PLAN Handoff');
