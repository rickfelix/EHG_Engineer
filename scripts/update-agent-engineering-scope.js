#!/usr/bin/env node

/**
 * Update SD-AGENT-ADMIN-001 (Agent Engineering) scope
 * to include comprehensive AI Agent Management Page vision
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function updateAgentEngineeringScope() {
  console.log('🔄 Updating Agent Engineering scope with comprehensive management vision...');
  console.log('='.repeat(80));

  const newScope = 'Comprehensive AI Agent Management platform providing centralized control and visibility for entire AI agent fleet. Central dashboard with modern layout featuring filtering, search, and sorting capabilities. Agent list view displays name, role, status, and organization for all agents. Detailed agent pages with tabbed interface showing Tools (assigned tools with permissions), Activity (current tasks and history), Performance (real-time charts and metrics), and Versions (history with rollback). Agent creation wizard provides guided form for defining role/goal, selecting tools with access levels, and configuring settings. Tools Management system maintains registry of all available tools with documentation, permissions, and usage tracking. Role-based tool assignment with permission levels and cost limits per agent. Real-time activity dashboards visualize uptime, cost tracking, success rates, and resource utilization. Version management enables agent version tracking, comparison, and one-click rollback. Organization integration displays department assignments, hierarchical relationships, and team coordination. Also includes: configuration management (LLM settings, prompts, backstories, agent parameters), performance monitoring and alerting, agent lifecycle management (enable/disable, hot reload), prompt engineering tooling (library, version control, A/B testing), system presets and preferences, search optimization, agent health dashboards. Agents in this department: Agent Configuration Specialist, Prompt Engineering Specialist, Agent Performance Monitor, Agent Reliability Engineer, Agent Lifecycle Manager';

  try {
    const { data: _data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        scope: newScope,
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-AGENT-ADMIN-001')
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Successfully updated SD-AGENT-ADMIN-001 scope!');
    console.log('\n📊 Updated Scope:');
    console.log(data.scope.substring(0, 200) + '...');
    console.log(`\n📝 Full scope length: ${data.scope.length} characters`);
    console.log('='.repeat(80));

    return data;
  } catch (_error) {
    console.error('❌ Error updating SD:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  updateAgentEngineeringScope();
}

export { updateAgentEngineeringScope };
