#!/usr/bin/env node

/**
 * Rename SD-AGENT-ADMIN-001 to "Agent Operations Department"
 * Aligns with corporate naming conventions and technical industry standards
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function renameAdminToAgentEngineering() {
  console.log('🔄 Renaming Admin Department to Agent Engineering...');
  console.log('='.repeat(80));

  try {
    // Update SD title and scope
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .update({
        title: 'Agent Engineering Department',
        scope: 'Agent Engineering infrastructure for managing AI agent fleet, including configuration management (LLM settings, prompts, backstories, agent parameters), performance monitoring and alerting, agent lifecycle management (enable/disable, hot reload), prompt engineering tooling (library, version control, A/B testing), system presets and preferences, search optimization, agent health dashboards. Agents in this department: Agent Configuration Specialist, Prompt Engineering Specialist, Agent Performance Monitor, Agent Reliability Engineer, Agent Lifecycle Manager',
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-AGENT-ADMIN-001')
      .select()
      .single();

    if (sdError) throw sdError;

    console.log('✅ Successfully renamed SD-AGENT-ADMIN-001 to "Agent Engineering Department"');
    console.log('\n📊 Updated Strategic Directive:');
    console.log(`ID: ${sd.id}`);
    console.log(`Title: ${sd.title}`);
    console.log(`Status: ${sd.status}`);
    console.log(`Priority: ${sd.priority}`);
    console.log('\nScope:');
    console.log(sd.scope);
    console.log('='.repeat(80));

    return sd;
  } catch (error) {
    console.error('❌ Error renaming SD:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  renameAdminToAgentEngineering();
}

export { renameAdminToAgentEngineering };
