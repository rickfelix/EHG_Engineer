#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('✅ LEAD Approving SD-AGENT-ADMIN-001 (Full Scope)\n');

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({
    status: 'active',
    current_phase: 'PLAN',
    priority: 90,
    metadata: {
      lead_approved: true,
      approval_date: new Date().toISOString(),
      estimated_story_points: 115,
      estimated_sprints: '8-10',
      subsystems: [
        'Preset Management System',
        'Prompt Library Admin UI',
        'Agent Settings Panel',
        'Search Preference Engine',
        'Performance Monitoring Dashboard'
      ],
      scope_decision: 'FULL_SCOPE_APPROVED',
      next_phase: 'PRD_CREATION'
    }
  })
  .eq('id', 'SD-AGENT-ADMIN-001')
  .select();

if (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

console.log('✅ SD-AGENT-ADMIN-001 Status Updated');
console.log('  Status: active');
console.log('  Phase: PLAN');
console.log('  Priority: 90 (HIGH)');
console.log('  Estimated Points: 115');
console.log('  Subsystems: 5');
console.log('\n📋 Next: PLAN phase PRD creation');
