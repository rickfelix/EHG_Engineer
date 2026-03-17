#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Validating dashboard compatibility...\n');

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, priority, category, current_phase, target_application, created_at, metadata')
  .in('id', ['SD-FEEDBACK-MOAT-001', 'SD-USA-LAYER-001']);

if (error) {
  console.log('❌ ERROR fetching SDs:', error.message);
  process.exit(1);
}

console.log('📊 Dashboard Compatibility Check:\n');

data.forEach(sd => {
  console.log(`\n✅ ${sd.id}`);

  const requiredFields = {
    'id': sd.id,
    'title': sd.title,
    'status': sd.status,
    'priority': sd.priority,
    'category': sd.category,
    'current_phase': sd.current_phase,
    'target_application': sd.target_application,
    'created_at': sd.created_at,
    'metadata.theme': sd.metadata?.theme,
    'metadata.owner': sd.metadata?.owner,
    'metadata.confidence_gate': sd.metadata?.confidence_gate
  };

  let allPresent = true;
  Object.entries(requiredFields).forEach(([field, value]) => {
    const present = value !== undefined && value !== null;
    console.log(`   ${field}: ${present ? '✅' : '❌ MISSING'}`);
    if (!present) allPresent = false;
  });

  // Check if priority is valid enum
  const validPriorities = ['low', 'medium', 'high', 'critical'];
  const priorityValid = validPriorities.includes(sd.priority);
  console.log(`   priority value: ${priorityValid ? '✅' : '❌ INVALID - ' + sd.priority}`);

  // Check if status is valid
  const validStatuses = ['draft', 'in_progress', 'completed', 'approved', 'rejected'];
  const statusValid = validStatuses.includes(sd.status);
  console.log(`   status value: ${statusValid ? '✅' : '❌ INVALID - ' + sd.status}`);

  // Check LEO phase transitions
  const validPhases = ['IDEATION', 'LEAD', 'PLAN', 'EXEC', 'VERIFY'];
  const phaseValid = validPhases.includes(sd.current_phase);
  console.log(`   LEO phase: ${phaseValid ? '✅' : '❌ INVALID - ' + sd.current_phase}`);

  const compatible = allPresent && priorityValid && statusValid && phaseValid;
  console.log(`\n   Dashboard rendering: ${compatible ? '✅ COMPATIBLE' : '⚠️  MAY HAVE ISSUES'}`);
  console.log(`   LEO workflow: ${phaseValid ? '✅ READY' : '❌ PHASE INVALID'}`);
});

console.log('\n' + '='.repeat(70) + '\n');
