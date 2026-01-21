#!/usr/bin/env node
/**
 * Update Orchestrator Progress Calculation
 *
 * This script calculates and updates orchestrator SD progress based on
 * actual child SD completion through the LEO Protocol workflow.
 *
 * Part of SD-LEO-GATE0-ORCHPROGRESS-001: Orchestrator Progress Calculation Fix
 *
 * Progress Formula:
 *   progress = (children_with_PLAN-TO-LEAD / total_children) * 100
 *
 * A child is considered "complete through workflow" when:
 * - status = 'completed' AND progress_percentage = 100
 * - OR has PLAN-TO-LEAD handoff with status = 'accepted'
 *
 * This prevents the issue where orchestrators show 50% progress
 * while all children are still in draft status.
 *
 * Usage:
 *   node scripts/update-orchestrator-progress.js [SD-ID]
 *
 * If SD-ID is provided, updates only that orchestrator.
 * If not provided, updates all orchestrators.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getOrchestratorChildren(orchestratorId) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, progress_percentage')
    .eq('parent_sd_id', orchestratorId);

  if (error) {
    console.error(`Error fetching children for ${orchestratorId}:`, error.message);
    return [];
  }

  return data || [];
}

async function getChildHandoffs(childId) {
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, status')
    .eq('sd_id', childId)
    .eq('handoff_type', 'PLAN-TO-LEAD');

  if (error) {
    return [];
  }

  return data || [];
}

async function isChildCompleteInWorkflow(child) {
  // Check 1: Status is completed with 100% progress
  if (child.status === 'completed' && child.progress_percentage === 100) {
    return true;
  }

  // Check 2: Has accepted PLAN-TO-LEAD handoff
  const handoffs = await getChildHandoffs(child.id);
  const completedHandoff = handoffs.find(h =>
    h.handoff_type === 'PLAN-TO-LEAD' && h.status === 'accepted'
  );

  return !!completedHandoff;
}

async function updateOrchestratorProgress(orchestratorId) {
  console.log(`\nUpdating: ${orchestratorId}`);

  // Get children
  const children = await getOrchestratorChildren(orchestratorId);

  if (children.length === 0) {
    console.log('  No children found - skipping');
    return null;
  }

  console.log(`  Children: ${children.length}`);

  // Count completed children
  let completedCount = 0;
  const childStatuses = [];

  for (const child of children) {
    const isComplete = await isChildCompleteInWorkflow(child);
    childStatuses.push({
      id: child.sd_key || child.id,
      title: (child.title || '').substring(0, 30),
      complete: isComplete
    });
    if (isComplete) {
      completedCount++;
    }
  }

  // Calculate progress
  const progress = Math.round((completedCount / children.length) * 100);

  console.log(`  Completed: ${completedCount}/${children.length} (${progress}%)`);

  // Display child status breakdown
  for (const cs of childStatuses) {
    const icon = cs.complete ? '✅' : '⏳';
    console.log(`    ${icon} ${cs.id}: ${cs.title}`);
  }

  // Update orchestrator
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({
      progress_percentage: progress,
      metadata: supabase.sql`
        COALESCE(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'orchestrator_progress_updated', NOW(),
          'children_complete', ${completedCount},
          'children_total', ${children.length}
        )
      `
    })
    .eq('id', orchestratorId)
    .select('id, progress_percentage')
    .single();

  if (error) {
    // Try simpler update without metadata SQL
    const { error: simpleError } = await supabase
      .from('strategic_directives_v2')
      .update({ progress_percentage: progress })
      .eq('id', orchestratorId);

    if (simpleError) {
      console.error(`  Error updating: ${simpleError.message}`);
      return null;
    }
  }

  console.log(`  ✅ Progress updated to ${progress}%`);

  return { orchestratorId, progress, completedCount, totalChildren: children.length };
}

async function getAllOrchestrators() {
  // Orchestrators are SDs that have children (relationship_type = 'parent')
  // or sd_type = 'orchestrator'
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title')
    .or('relationship_type.eq.parent,sd_type.eq.orchestrator')
    .neq('status', 'completed')
    .neq('status', 'abandoned');

  if (error) {
    console.error('Error fetching orchestrators:', error.message);
    return [];
  }

  return data || [];
}

async function main() {
  const specificId = process.argv[2];

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  ORCHESTRATOR PROGRESS RECALCULATION');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Progress is based on children with completed PLAN-TO-LEAD handoff');
  console.log('  (not just arbitrary progress_percentage)');
  console.log('');

  if (specificId) {
    // Update specific orchestrator
    await updateOrchestratorProgress(specificId);
  } else {
    // Update all orchestrators
    const orchestrators = await getAllOrchestrators();
    console.log(`Found ${orchestrators.length} active orchestrator(s)`);

    for (const orch of orchestrators) {
      await updateOrchestratorProgress(orch.id);
    }
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  COMPLETE');
  console.log('════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
