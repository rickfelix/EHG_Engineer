#!/usr/bin/env node

/**
 * Update LEO Protocol Agents with Simplicity-First Approach
 * Updates responsibilities for main agents and descriptions for sub-agents
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function updateAgentsWithSimplicity() {
  console.log('🔧 Updating LEO Protocol Agents with Simplicity-First Approach');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    // Update LEAD Agent
    console.log('\n📝 Updating LEAD Agent responsibilities...');
    const leadUpdate = await supabase
      .from('leo_agents')
      .update({
        responsibilities: `Strategic planning, business objectives, final approval. **SIMPLICITY FIRST**: Challenge complexity, favor simple solutions over perfect architectures. Ask "What's the simplest solution?" and "Why not just configure existing tools?" Default to 80/20 solutions that deliver value quickly.`
      })
      .eq('agent_code', 'LEAD');

    if (leadUpdate.error) {
      console.error('❌ Error updating LEAD agent:', leadUpdate.error);
    } else {
      console.log('✅ LEAD agent responsibilities updated with simplicity-first mindset');
    }

    // Update PLAN Agent
    console.log('\n📝 Updating PLAN Agent responsibilities...');
    const planUpdate = await supabase
      .from('leo_agents')
      .update({
        responsibilities: `Technical design, PRD creation with comprehensive test plans, pre-automation validation, acceptance testing. **PRAGMATIC ENGINEERING**: Use boring technology that works reliably. Prefer configuration over code, simple solutions over complex architectures. Filter sub-agent recommendations through simplicity lens.`
      })
      .eq('agent_code', 'PLAN');

    if (planUpdate.error) {
      console.error('❌ Error updating PLAN agent:', planUpdate.error);
    } else {
      console.log('✅ PLAN agent responsibilities updated with pragmatic engineering approach');
    }

    // Update EXEC Agent
    console.log('\n📝 Updating EXEC Agent responsibilities...');
    const execUpdate = await supabase
      .from('leo_agents')
      .update({
        responsibilities: `Implementation based on PRD, no validation. **SIMPLICITY IN EXECUTION**: Implement the simplest solution that meets requirements. Avoid over-engineering. Use proven patterns and existing libraries. Focus on working solutions over perfect code.`
      })
      .eq('agent_code', 'EXEC');

    if (execUpdate.error) {
      console.error('❌ Error updating EXEC agent:', execUpdate.error);
    } else {
      console.log('✅ EXEC agent responsibilities updated with simplicity focus');
    }

    // Update key sub-agents with simplicity guidance
    console.log('\n📝 Updating Sub-Agents with simplicity guidance...');

    // Update Security Sub-Agent
    const securityUpdate = await supabase
      .from('leo_sub_agents')
      .update({
        description: `Former NSA security architect with 25 years experience. **SIMPLICITY-FIRST SECURITY**: Security that enables business, not blocks it. Recommends the simplest secure approach that addresses real threats, not theoretical ones. Philosophy: "Use proven, boring security patterns over complex custom solutions." Focuses on practical protections with minimal complexity overhead.`
      })
      .eq('code', 'SECURITY');

    // Update Design Sub-Agent
    const designUpdate = await supabase
      .from('leo_sub_agents')
      .update({
        description: `Senior UX architect with 15+ years at design-forward companies. **SIMPLE, USABLE DESIGN**: Advocates for the simplest interface that solves user needs. Philosophy: "Good design is as little design as possible." Recommends proven UI patterns over novel interactions. Focuses on usability over aesthetics, configuration over custom components.`
      })
      .eq('code', 'DESIGN');

    // Update Performance Sub-Agent
    const performanceUpdate = await supabase
      .from('leo_sub_agents')
      .update({
        description: `Performance engineering lead with 20+ years optimizing high-scale systems. **SIMPLE PERFORMANCE WINS**: Recommends the simplest optimizations that provide the biggest impact. Philosophy: "Measure first, optimize the bottleneck, not everything." Prefers configuration tweaks and proven techniques over complex custom solutions.`
      })
      .eq('code', 'PERFORMANCE');

    console.log('✅ Key sub-agents updated with simplicity-first guidance');

    // Regenerate CLAUDE.md
    console.log('\n🔄 Regenerating CLAUDE.md from updated database...');
    const { exec } = await import('child_process');
    exec('node scripts/generate-claude-md-from-db.js', (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Error regenerating CLAUDE.md:', error);
      } else {
        console.log('✅ CLAUDE.md regenerated from database');
        console.log('\n🎉 LEO Protocol Agents Successfully Updated!');
        console.log('\n💡 Key Changes Applied:');
        console.log('   • LEAD: Challenges complexity, asks "What\'s the simplest solution?"');
        console.log('   • PLAN: Uses boring technology, filters sub-agent advice through simplicity');
        console.log('   • EXEC: Implements simple solutions, avoids over-engineering');
        console.log('   • Sub-Agents: Provide simple recommendations over complex ones');
        console.log('\n🚀 All agents now prioritize simple, effective solutions!');
      }
    });

  } catch (error) {
    console.error('❌ Error updating agents:', error);
  }
}

updateAgentsWithSimplicity();