#!/usr/bin/env node

/**
 * Check SD completion state to diagnose blocking issues
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-BLUEPRINT-ENGINE-001';

async function check() {
  console.log('Checking SD completion state for:', SD_ID);
  console.log('='.repeat(60));

  // Check deliverables
  console.log('\n1. Deliverables (sd_scope_deliverables):');
  const { data: dels, error: delError } = await supabase
    .from('sd_scope_deliverables')
    .select('id, name, status, completed_at')
    .eq('sd_id', SD_ID);

  if (delError) {
    console.log('   Error:', delError.message);
  } else {
    console.log('   Count:', dels?.length || 0);
    dels?.forEach(d => console.log(`   - ${d.name}: ${d.status}`));
  }

  // Check user stories in various tables
  console.log('\n2. User Stories:');
  const tables = ['user_stories', 'sd_user_stories', 'prd_user_stories'];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`   ${t}: table not found or error`);
    } else {
      console.log(`   ${t}: exists, columns:`, data && data[0] ? Object.keys(data[0]).slice(0, 5).join(', ') + '...' : 'empty');
    }
  }

  // Check PRD for user stories link
  console.log('\n3. PRD User Stories:');
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, user_stories')
    .eq('id', 'PRD-SD-BLUEPRINT-ENGINE-001')
    .single();

  if (prd) {
    console.log('   PRD found:', prd.id);
    console.log('   User stories type:', typeof prd.user_stories);
    if (Array.isArray(prd.user_stories)) {
      console.log('   Stories count:', prd.user_stories.length);
    }
  }

  // Check handoffs
  console.log('\n4. Handoffs (sd_phase_handoffs):');
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('id, from_phase, to_phase, handoff_type, status')
    .eq('sd_id', SD_ID);

  handoffs?.forEach(h => {
    console.log(`   - ${h.from_phase} -> ${h.to_phase} (${h.handoff_type}): ${h.status}`);
  });

  // Check required handoff types
  console.log('\n5. Required handoffs check:');
  const requiredTypes = ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-COMPLETE'];
  for (const type of requiredTypes) {
    const match = handoffs?.find(h => h.handoff_type === type && h.status === 'accepted');
    console.log(`   ${type}: ${match ? 'FOUND (accepted)' : 'MISSING or not accepted'}`);
  }

  // Check retrospective storage options
  console.log('\n6. Retrospective storage:');
  const retroTables = ['sd_retrospectives', 'leo_retrospectives', 'retrospectives', 'sd_retros'];
  for (const t of retroTables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`   ${t}: not found`);
    } else {
      console.log(`   ${t}: EXISTS`);
      if (data && data[0]) {
        console.log('   Columns:', Object.keys(data[0]).join(', '));
      }
    }
  }

  // Check metadata for retrospective
  console.log('\n7. SD Metadata retrospective:');
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', SD_ID)
    .single();

  if (sd?.metadata?.retrospective) {
    console.log('   Retrospective in metadata: YES');
  } else {
    console.log('   Retrospective in metadata: NO');
  }

  console.log('\n' + '='.repeat(60));
}

check().catch(console.error);
