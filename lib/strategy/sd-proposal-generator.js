/**
 * SD Proposal Generator with Governor Gate
 * Part of SD-LEO-INFRA-UNIFIED-STRATEGIC-INTELLIGENCE-001-C
 *
 * Transforms capability gaps into SD proposals stored in sd_proposals table.
 * Governor gate limits proposals to MAX_PROPOSALS_PER_CYCLE with chairman approval.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { analyzeCapabilityGaps } from './capability-gap-analyzer.js';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MAX_PROPOSALS_PER_CYCLE = 5;

const TIME_HORIZON_PRIORITY = {
  now: 'critical',
  next: 'high',
  later: 'medium',
  eventually: 'low',
};

/**
 * Generate SD proposals from capability gaps.
 * Governor gate: max MAX_PROPOSALS_PER_CYCLE per invocation.
 *
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - Log proposals without DB writes
 * @param {number} [options.maxProposals] - Override max proposals per cycle
 * @param {Object} [options.supabaseClient] - Override client for testing
 * @returns {Promise<{success: boolean, proposals: Array, skipped: number}>}
 */
export async function generateProposals(options = {}) {
  const client = options.supabaseClient || supabase;
  const dryRun = options.dryRun || false;
  const maxProposals = options.maxProposals || MAX_PROPOSALS_PER_CYCLE;

  // 1. Analyze gaps
  const gapResult = await analyzeCapabilityGaps({ supabaseClient: client });
  if (!gapResult.success) {
    return { success: false, error: gapResult.error, proposals: [], skipped: 0 };
  }

  // 2. Filter objectives that have gaps
  const objectivesWithGaps = gapResult.objectives.filter(o => o.gap_capabilities.length > 0);

  if (objectivesWithGaps.length === 0) {
    return { success: true, proposals: [], skipped: 0, message: 'No capability gaps found' };
  }

  // 3. Generate one proposal per objective (already sorted by urgency in analyzer)
  const allProposals = objectivesWithGaps.map(obj => ({
    strategy_objective_id: obj.objective_id,
    title: `Deliver ${obj.gap_capabilities.join(', ')} capabilities for "${obj.objective_title}"`,
    description: `Auto-generated proposal to close ${obj.gap_capabilities.length} capability gap(s) ` +
      `for strategy objective "${obj.objective_title}" (${obj.time_horizon}). ` +
      `Target capabilities: ${obj.gap_capabilities.join(', ')}.`,
    sd_type: 'infrastructure',
    priority: TIME_HORIZON_PRIORITY[obj.time_horizon] || 'medium',
    status: 'pending',
    gap_capabilities: obj.gap_capabilities,
    objective_title: obj.objective_title,
    time_horizon: obj.time_horizon,
    coverage_pct: obj.coverage_pct,
  }));

  // 4. Governor gate: cap at maxProposals
  const proposals = allProposals.slice(0, maxProposals);
  const skipped = allProposals.length - proposals.length;

  if (skipped > 0) {
    console.log(`Governor gate: ${skipped} additional gap(s) deferred to next cycle`);
  }

  // 5. Dry-run: log and return without DB writes
  if (dryRun) {
    console.log('\n[DRY RUN] Proposals that would be created:');
    proposals.forEach((p, i) => {
      console.log(`  ${i + 1}. [${p.priority}] ${p.title}`);
      console.log(`     Gaps: ${p.gap_capabilities.join(', ')}`);
      console.log(`     Objective: ${p.objective_title} (${p.time_horizon})`);
    });
    return { success: true, proposals, skipped, dryRun: true };
  }

  // 6. Insert proposals into sd_proposals
  const insertRows = proposals.map(p => ({
    strategy_objective_id: p.strategy_objective_id,
    title: p.title,
    description: p.description,
    sd_type: p.sd_type,
    priority: p.priority,
    status: 'pending',
    metadata: {
      gap_capabilities: p.gap_capabilities,
      time_horizon: p.time_horizon,
      coverage_pct: p.coverage_pct,
      generated_at: new Date().toISOString(),
    },
  }));

  const { data: inserted, error: insertErr } = await client
    .from('sd_proposals')
    .insert(insertRows)
    .select('id, title, priority, status');

  if (insertErr) {
    return { success: false, error: insertErr.message, proposals: [], skipped };
  }

  return { success: true, proposals: inserted, skipped };
}

/**
 * Approve a pending proposal — creates a draft SD.
 *
 * @param {string} proposalId - Proposal UUID
 * @param {Object} [options]
 * @returns {Promise<{success: boolean, sd_key?: string}>}
 */
export async function approveProposal(proposalId, options = {}) {
  const client = options.supabaseClient || supabase;

  // 1. Get proposal
  const { data: proposal, error: getErr } = await client
    .from('sd_proposals')
    .select('*')
    .eq('id', proposalId)
    .single();

  if (getErr || !proposal) {
    return { success: false, error: getErr?.message || 'Proposal not found' };
  }

  if (proposal.status !== 'pending') {
    return { success: false, error: `Proposal status is ${proposal.status}, expected pending` };
  }

  // 2. Create draft SD
  const sdKey = `SD-AUTO-GAP-${Date.now().toString(36).toUpperCase()}`;
  const { data: sd, error: sdErr } = await client
    .from('strategic_directives_v2')
    .insert({
      sd_key: sdKey,
      title: proposal.title,
      description: proposal.description,
      sd_type: proposal.sd_type || 'infrastructure',
      priority: proposal.priority || 'medium',
      status: 'draft',
      current_phase: 'LEAD',
      progress: 0,
      strategy_objective_id: proposal.strategy_objective_id,
      key_changes: proposal.metadata?.gap_capabilities?.map(g => `Deliver ${g} capability`) || [],
      success_criteria: [`All ${proposal.metadata?.gap_capabilities?.length || 0} capability gaps closed`],
    })
    .select('id, sd_key')
    .single();

  if (sdErr) {
    return { success: false, error: `SD creation failed: ${sdErr.message}` };
  }

  // 3. Update proposal status
  await client
    .from('sd_proposals')
    .update({ status: 'approved', approved_at: new Date().toISOString(), created_sd_id: sd.id })
    .eq('id', proposalId);

  return { success: true, sd_key: sd.sd_key, sd_id: sd.id };
}

/**
 * Reject a pending proposal with reason.
 *
 * @param {string} proposalId - Proposal UUID
 * @param {string} reason - Rejection reason
 * @param {Object} [options]
 * @returns {Promise<{success: boolean}>}
 */
export async function rejectProposal(proposalId, reason, options = {}) {
  const client = options.supabaseClient || supabase;

  const { error } = await client
    .from('sd_proposals')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      rejected_at: new Date().toISOString(),
    })
    .eq('id', proposalId)
    .eq('status', 'pending');

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Get pending proposals for chairman review.
 *
 * @param {Object} [options]
 * @returns {Promise<Array>} Pending proposals
 */
export async function getPendingProposals(options = {}) {
  const client = options.supabaseClient || supabase;

  const { data, error } = await client
    .from('sd_proposals')
    .select('id, title, description, priority, status, strategy_objective_id, metadata, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return [];
  return data || [];
}

// CLI support
if (process.argv[1]?.endsWith('sd-proposal-generator.js')) {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`SD Proposal Generator (${dryRun ? 'DRY RUN' : 'LIVE'})`);
  console.log(`Governor gate: max ${MAX_PROPOSALS_PER_CYCLE} proposals per cycle\n`);

  generateProposals({ dryRun }).then(result => {
    if (!result.success) {
      console.error('Error:', result.error);
      process.exit(1);
    }
    console.log(`\nProposals: ${result.proposals.length} created, ${result.skipped} deferred`);
  });
}

export default { generateProposals, approveProposal, rejectProposal, getPendingProposals, MAX_PROPOSALS_PER_CYCLE };
