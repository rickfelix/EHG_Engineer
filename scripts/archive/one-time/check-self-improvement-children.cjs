#!/usr/bin/env node
/**
 * Check Self-Improvement Loop Children Status
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getNextChild() {
  // Get all children of the orchestrator
  const { data: children, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, dependency_chain')
    .eq('parent_sd_id', 'SD-LEO-SELF-IMPROVEMENT-001')
    .order('id');

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('Self-Improvement Loop Children:');
  console.log('================================\n');

  for (const child of children || []) {
    const deps = child.dependency_chain || [];
    const statusIcon = child.status === 'completed' ? '✅' : child.status === 'in_progress' ? '🔄' : '⏳';
    console.log(statusIcon + ' ' + child.id);
    console.log('   Title: ' + child.title);
    console.log('   Status: ' + child.status + ' | Phase: ' + child.current_phase);
    if (deps.length > 0) {
      console.log('   Dependencies: ' + deps.join(', '));
    }
    console.log('');
  }

  // Find next ready child
  const nextReady = children?.find(c =>
    c.status !== 'completed' &&
    (!c.dependency_chain || c.dependency_chain.length === 0 ||
      c.dependency_chain.every(dep => children.find(ch => ch.id === dep)?.status === 'completed'))
  );

  if (nextReady) {
    console.log('=====================================');
    console.log('🎯 NEXT READY: ' + nextReady.id);
    console.log('   ' + nextReady.title);
    console.log('   Status: ' + nextReady.status + ' | Phase: ' + nextReady.current_phase);
  } else {
    console.log('No children ready (all completed or blocked)');
  }
}

getNextChild().catch(console.error);
