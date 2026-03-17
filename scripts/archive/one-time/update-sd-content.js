#!/usr/bin/env node

/**
 * Update Strategic Directive content in database
 * LEO Protocol v3.1.5 compliant
 */

import { createClient  } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function updateSDContent() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const sdData = {
    title: 'EHG_Engineer Platform Foundation',
    description: 'Establish a minimal, clean LEO Protocol v3.1.5 implementation for strategic directive management. This platform provides the essential components needed to build other applications with proven strategic planning workflows.',
    strategic_intent: 'Create a foundation platform that can be used as a template for building strategic planning applications',
    rationale: 'The full EHG platform has grown complex with interdependencies. A clean, minimal implementation of just the LEO Protocol core components would provide a better foundation for new application development.',
    scope: 'Core LEO Protocol implementation including database schema, strategic directive management, epic execution sequences, HAP blocks, and agent communication templates.',
    strategic_objectives: [
      'Extract core LEO Protocol components from EHG platform',
      'Create minimal database schema with only essential tables',
      'Implement strategic directive lifecycle management',
      'Provide templates for all LEO Protocol artifacts',
      'Enable rapid application development with strategic planning'
    ],
    success_criteria: [
      'Clean LEO Protocol v3.1.5 implementation',
      'Working database with core tables',
      'Complete template system for all artifacts',
      'Strategic directive lifecycle management',
      'Agent communication protocols implemented'
    ],
    key_principles: [
      'Minimal footprint - only essential components',
      'Database-first architecture',
      'Template-driven artifact generation',
      'Clear separation of concerns',
      'Extensible foundation for future development'
    ],
    implementation_guidelines: [
      'Phase 1: Foundation setup with Node.js and Supabase',
      'Phase 2: Database schema and core scripts',
      'Phase 3: Template system and documentation',
      'Phase 4: First strategic directive and testing'
    ],
    success_metrics: [
      'All database tables created and accessible',
      'All templates created and functional',
      'First strategic directive successfully created',
      'End-to-end workflow tested and validated',
      'LEO Protocol compliance achieved'
    ],
    stakeholders: [
      { role: 'LEAD', name: 'Strategic Direction Agent' },
      { role: 'PLAN', name: 'Tactical Planning Agent' },
      { role: 'EXEC', name: 'Implementation Agent' },
      { role: 'HUMAN', name: 'Oversight and Approval' }
    ],
    dependencies: [
      'Supabase database account',
      'Node.js runtime environment',
      'LEO Protocol v3.1.5 documentation'
    ],
    risks: [
      { risk: 'Database connectivity issues', mitigation: 'Multiple connection methods tested' },
      { risk: 'Template complexity', mitigation: 'Iterative refinement based on usage' },
      { risk: 'Protocol compliance', mitigation: 'Compliance audit script created' }
    ],
    category: 'platform',
    priority: 'critical',
    status: 'active',
    approved_by: 'HUMAN',
    approval_date: new Date().toISOString(),
    effective_date: new Date().toISOString(),
    review_schedule: 'Quarterly',
    sequence_rank: 1
  };

  console.log('📋 Updating SD-2025-01-15-A with full content...\n');

  const { data: _data, error } = await supabase
    .from('strategic_directives_v2')
    .update(sdData)
    .eq('id', 'SD-2025-01-15-A')
    .select();

  if (error) {
    console.error('❌ Error updating Strategic Directive:', error.message);
    process.exit(1);
  }

  console.log('✅ Strategic Directive updated successfully!');
  console.log('\n📊 Updated fields:');
  console.log('  Title:', data[0].title);
  console.log('  Status:', data[0].status);
  console.log('  Priority:', data[0].priority);
  console.log('  Category:', data[0].category);
  console.log('  Objectives:', data[0].strategic_objectives.length, 'defined');
  console.log('  Success Criteria:', data[0].success_criteria.length, 'defined');
  console.log('  Approved by:', data[0].approved_by);
  console.log('  Approval date:', data[0].approval_date);
}

updateSDContent();