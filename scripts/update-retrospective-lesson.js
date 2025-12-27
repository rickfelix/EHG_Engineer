#!/usr/bin/env node
/**
 * Add lesson learned to SD-NAV-ANALYTICS-001B retrospective
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateRetrospective() {
  console.log('=== Updating Retrospective for SD-NAV-ANALYTICS-001B ===\n');

  // Get existing retrospective
  const { data: retroData, error: fetchError } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('sd_id', 'SD-NAV-ANALYTICS-001B')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !retroData) {
    console.log('Error fetching retrospective:', fetchError?.message);
    return;
  }

  console.log(`Retrospective ID: ${retroData.id}`);
  console.log(`Quality Score: ${retroData.quality_score}`);

  // Get existing key_learnings
  let keyLearnings = retroData.key_learnings || [];
  console.log(`\nExisting key_learnings (${keyLearnings.length}):`);
  keyLearnings.forEach((l, i) => {
    console.log(`  ${i + 1}. [${l.category}] ${l.learning?.substring(0, 60)}...`);
  });

  // Add new lesson to key_learnings
  const newLesson = {
    category: 'PROCESS_IMPROVEMENT',
    evidence: 'User feedback during SD-NAV-ANALYTICS-001B completion - handoffs were run as afterthought after all implementation instead of at phase transitions',
    learning: 'Handoffs are integral to LEO Protocol, not administrative afterthought. Anti-pattern: do ALL implementation, commit, then try to close SD administratively. Correct pattern: run handoff script IMMEDIATELY after each phase (EXEC-TO-PLAN after implementation, PLAN-TO-LEAD after verification, LEAD-FINAL-APPROVAL to complete).',
    applicability: 'After completing any phase work, run the appropriate handoff script BEFORE proceeding to next task or SD. Re-read phase-specific CLAUDE_*.md files at each transition.'
  };

  keyLearnings.push(newLesson);

  // Add to what_needs_improvement
  let improvements = retroData.what_needs_improvement || [];
  improvements.push('Handoffs should be run immediately at phase transitions, not batched after all work is done');

  // Add protocol improvement
  let protocolImprovements = retroData.protocol_improvements || [];
  protocolImprovements.push({
    category: 'PHASE_TRANSITION_DISCIPLINE',
    improvement: 'Enforce handoff execution at phase boundaries - each phase completion MUST trigger handoff before next phase begins',
    evidence: 'SD-NAV-ANALYTICS-001B: All handoffs (EXEC-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL) were run after implementation was complete instead of at natural phase boundaries',
    impact: 'Ensures continuous validation and tracking throughout SD lifecycle rather than retroactive compliance'
  });

  // Update the retrospective
  const { data: updated, error: updateError } = await supabase
    .from('retrospectives')
    .update({
      key_learnings: keyLearnings,
      what_needs_improvement: improvements,
      protocol_improvements: protocolImprovements,
      updated_at: new Date().toISOString()
    })
    .eq('id', retroData.id)
    .select('id, key_learnings, what_needs_improvement, protocol_improvements')
    .single();

  if (updateError) {
    console.log('\nError updating retrospective:', updateError.message);
    return;
  }

  console.log('\n✅ Retrospective updated successfully');
  console.log(`  Key learnings: ${updated.key_learnings.length}`);
  console.log(`  Improvements: ${updated.what_needs_improvement.length}`);
  console.log(`  Protocol improvements: ${updated.protocol_improvements.length}`);

  console.log('\n📝 New lesson added:');
  console.log(`  Category: ${newLesson.category}`);
  console.log(`  Learning: ${newLesson.learning.substring(0, 100)}...`);
}

updateRetrospective().catch(console.error);
