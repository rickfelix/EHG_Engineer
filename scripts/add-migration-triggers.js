#!/usr/bin/env node
/**
 * Add migration-related triggers to DATABASE sub-agent
 * Prevention for PAT-DB-MIGRATION-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addTriggers() {
  // Get DATABASE sub-agent ID
  const { data: dbAgent } = await supabase
    .from('leo_sub_agents')
    .select('id, code')
    .eq('code', 'DATABASE')
    .single();

  if (!dbAgent) {
    console.log('DATABASE sub-agent not found');
    return;
  }

  console.log('DATABASE sub-agent ID:', dbAgent.id);

  // Add new trigger phrases for migrations
  const newTriggers = [
    'migration script',
    'run migration',
    'execute migration',
    'apply migration',
    'sql migration',
    'database migration script'
  ];

  for (const phrase of newTriggers) {
    const { error } = await supabase
      .from('leo_sub_agent_triggers')
      .insert({
        sub_agent_id: dbAgent.id,
        trigger_phrase: phrase,
        trigger_type: 'keyword',
        priority: 5,
        active: true,
        metadata: { added_from: 'PAT-DB-MIGRATION-001', note: 'Ensure migration scripts use correct pattern' }
      });

    if (error && !error.message.includes('duplicate')) {
      console.log('Error adding', phrase, ':', error.message);
    } else {
      console.log('Added trigger:', phrase);
    }
  }
}

addTriggers().catch(console.error);
