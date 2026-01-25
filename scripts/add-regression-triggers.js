#!/usr/bin/env node

/**
 * Add triggers for REGRESSION sub-agent
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const REGRESSION_ID = 'b2c3d4e5-1234-4567-8901-0123456789ab';

async function addTriggers() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const triggers = [
    'refactor', 'refactoring', 'restructure', 'reorganize', 'cleanup',
    'extract method', 'extract function', 'rename', 'move file',
    'consolidate', 'split file', 'backward compatibility', 'regression',
    'breaking change', 'api signature', 'interface change', 'migration',
    'code smell', 'technical debt', 'DRY violation'
  ];

  // Check existing triggers
  const { data: existing } = await supabase
    .from('leo_sub_agent_triggers')
    .select('trigger_phrase')
    .eq('sub_agent_id', REGRESSION_ID);

  const existingPhrases = new Set(existing?.map(e => e.trigger_phrase) || []);
  const newTriggers = triggers.filter(t => !existingPhrases.has(t));

  if (newTriggers.length === 0) {
    console.log('✅ All triggers already exist');
    return;
  }

  const rows = newTriggers.map(t => ({
    id: randomUUID(),
    sub_agent_id: REGRESSION_ID,
    trigger_phrase: t,
    trigger_type: 'keyword',
    priority: 5,
    active: true,
    metadata: { source: 'refactoring-workflow-enhancement' }
  }));

  const { data, error } = await supabase
    .from('leo_sub_agent_triggers')
    .insert(rows)
    .select('trigger_phrase');

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log(`✅ Added ${data.length} triggers for REGRESSION sub-agent:`);
  data.forEach(t => console.log('   -', t.trigger_phrase));
}

addTriggers();
