#!/usr/bin/env node
/**
 * Update Agent Responsibilities - Add Parallel Sub-Agent Execution Notes
 * Adds guidance on when agents can call sub-agents in parallel
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateAgentResponsibilities() {
  console.log('🔄 Updating agent responsibilities with parallel sub-agent guidance...\n');

  const updates = [
    {
      agent_code: 'PLAN',
      new_note: '\n- **🔍 Supervisor Mode**: Final "done done" verification with all sub-agents'
    },
    {
      agent_code: 'LEAD',
      new_note: '' // LEAD already has extensive notes, no change needed
    },
    {
      agent_code: 'EXEC',
      new_note: '' // EXEC doesn't call sub-agents in parallel for initial implementation
    }
  ];

  for (const update of updates) {
    if (!update.new_note) {
      console.log(`⏭️  Skipping ${update.agent_code} (no changes needed)`);
      continue;
    }

    // Get current responsibilities
    const { data: agent, error: fetchError } = await supabase
      .from('leo_agents')
      .select('responsibilities')
      .eq('agent_code', update.agent_code)
      .single();

    if (fetchError) {
      console.error(`❌ Error fetching ${update.agent_code}:`, fetchError);
      continue;
    }

    // Check if note already exists
    if (agent.responsibilities.includes('Supervisor Mode')) {
      console.log(`✓ ${update.agent_code} already has supervisor mode note`);
      continue;
    }

    // Append new note
    const newResponsibilities = agent.responsibilities + update.new_note;

    // Update database
    const { error: updateError } = await supabase
      .from('leo_agents')
      .update({ responsibilities: newResponsibilities })
      .eq('agent_code', update.agent_code);

    if (updateError) {
      console.error(`❌ Error updating ${update.agent_code}:`, updateError);
    } else {
      console.log(`✅ Updated ${update.agent_code} responsibilities`);
    }
  }

  console.log('\n🎉 Agent responsibilities updated!');
  console.log('📋 Next step: Regenerate CLAUDE.md to verify changes');
}

updateAgentResponsibilities();