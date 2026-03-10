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

// sd_proposals.urgency_level only allows: low, medium, critical
const TIME_HORIZON_URGENCY = {
  now: 'critical',
  next: 'medium',
  later: 'low',
  eventually: 'low',
};

// Impact score derived from time_horizon (0-1)
const TIME_HORIZON_IMPACT = {
  now: 0.95,
  next: 0.75,
  later: 0.50,
  eventually: 0.30,
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
  const allProposals = objectivesWithGaps.map(obj => {
    const gapList = obj.gap_capabilities.join(', ');
    const title = `Deliver ${gapList} for "${obj.objective_title}"`.substring(0, 200);
    const urgency = TIME_HORIZON_URGENCY[obj.time_horizon] || 'medium';
    const impact = TIME_HORIZON_IMPACT[obj.time_horizon] || 0.50;
    // Higher confidence when coverage is lower (more certain there's a real gap)
    const confidence = Math.min(0.99, Math.max(0.50, (100 - obj.coverage_pct) / 100));

    return {
      title,
      description: `Auto-generated proposal to close ${obj.gap_capabilities.length} capability gap(s) ` +
        `for strategy objective "${obj.objective_title}" (${obj.time_horizon}). ` +
        `Target capabilities: ${gapList}.`,
      trigger_type: 'manual',
      urgency_level: urgency,
      confidence_score: confidence,
      impact_score: impact,
      dedupe_key: `gap-${obj.objective_id}`,
      created_by: 'capability-gap-analyzer',
      proposed_scope: {
        sd_type: 'infrastructure',
        objectives: [`Close ${obj.gap_capabilities.length} capability gap(s) for ${obj.objective_title}`],
        success_criteria: obj.gap_capabilities.map(g => `${g} capability delivered and verified`),
        risks: [{ risk: 'Capability requirements may evolve', mitigation: 'Review target_capabilities before implementation' }],
      },
      evidence_data: {
        strategy_objective_id: obj.objective_id,
        strategy_objective_title: obj.objective_title,
        time_horizon: obj.time_horizon,
        gap_capabilities: obj.gap_capabilities,
        delivered_capabilities: obj.delivered_capabilities,
        coverage_pct: obj.coverage_pct,
        generated_at: new Date().toISOString(),
      },
      // Keep for display/logging but not inserted
      _display: {
        gap_capabilities: obj.gap_capabilities,
        objective_title: obj.objective_title,
        time_horizon: obj.time_horizon,
        coverage_pct: obj.coverage_pct,
      },
    };
  });

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
      console.log(`  ${i + 1}. [${p.urgency_level}] ${p.title}`);
      console.log(`     Gaps: ${p._display.gap_capabilities.join(', ')}`);
      console.log(`     Objective: ${p._display.objective_title} (${p._display.time_horizon})`);
      console.log(`     Confidence: ${(p.confidence_score * 100).toFixed(0)}% | Impact: ${(p.impact_score * 100).toFixed(0)}%`);
    });
    return { success: true, proposals: proposals.map(p => ({ ...p, _display: undefined })), skipped, dryRun: true };
  }

  // 6. Insert proposals into sd_proposals (only schema-valid columns)
  const insertRows = proposals.map(p => ({
    title: p.title,
    description: p.description,
    trigger_type: p.trigger_type,
    urgency_level: p.urgency_level,
    confidence_score: p.confidence_score,
    impact_score: p.impact_score,
    dedupe_key: p.dedupe_key,
    created_by: p.created_by,
    proposed_scope: p.proposed_scope,
    evidence_data: p.evidence_data,
  }));

  const { data: inserted, error: insertErr } = await client
    .from('sd_proposals')
    .insert(insertRows)
    .select('id, title, urgency_level, status');

  if (insertErr) {
    return { success: false, error: insertErr.message, proposals: [], skipped };
  }

  return { success: true, proposals: inserted, skipped };
}

/**
 * Approve a pending proposal — creates a draft SD via RPC.
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

  if (proposal.status !== 'pending' && proposal.status !== 'seen') {
    return { success: false, error: `Proposal status is ${proposal.status}, expected pending or seen` };
  }

  // 2. Try RPC first (if fn_create_sd_from_proposal exists)
  const { data: sdId, error: rpcErr } = await client
    .rpc('fn_create_sd_from_proposal', { proposal_id: proposal.id });

  if (!rpcErr && sdId) {
    return { success: true, sd_id: sdId };
  }

  // 3. Fallback: manual SD creation
  const evidence = proposal.evidence_data || {};
  const scope = proposal.proposed_scope || {};
  const sdKey = `SD-AUTO-GAP-${Date.now().toString(36).toUpperCase()}`;

  const { data: sd, error: sdErr } = await client
    .from('strategic_directives_v2')
    .insert({
      sd_key: sdKey,
      title: proposal.title,
      description: proposal.description,
      sd_type: scope.sd_type || 'infrastructure',
      priority: proposal.urgency_level === 'critical' ? 'critical' : proposal.urgency_level === 'medium' ? 'high' : 'medium',
      status: 'draft',
      current_phase: 'LEAD',
      progress: 0,
      key_changes: (evidence.gap_capabilities || []).map(g => `Deliver ${g} capability`),
      success_criteria: scope.success_criteria || [],
    })
    .select('id, sd_key')
    .single();

  if (sdErr) {
    return { success: false, error: `SD creation failed: ${sdErr.message}` };
  }

  // 4. Update proposal status
  await client
    .from('sd_proposals')
    .update({ status: 'approved', approved_at: new Date().toISOString(), created_sd_id: sd.id })
    .eq('id', proposalId);

  return { success: true, sd_key: sd.sd_key, sd_id: sd.id };
}

/**
 * Dismiss a pending proposal with reason.
 *
 * @param {string} proposalId - Proposal UUID
 * @param {string} reason - Dismissal reason (not_relevant, wrong_timing, duplicate, too_small, too_large, already_fixed, other)
 * @param {Object} [options]
 * @returns {Promise<{success: boolean}>}
 */
export async function dismissProposal(proposalId, reason, options = {}) {
  const client = options.supabaseClient || supabase;

  const { error } = await client
    .from('sd_proposals')
    .update({
      status: 'dismissed',
      dismissal_reason: reason,
      dismissed_at: new Date().toISOString(),
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
    .select('id, title, description, urgency_level, status, evidence_data, proposed_scope, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return [];
  return data || [];
}

// CLI support
const isDirectRun = process.argv[1]?.includes('sd-proposal-generator');
if (isDirectRun) {
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

export default { generateProposals, approveProposal, dismissProposal, getPendingProposals, MAX_PROPOSALS_PER_CYCLE };
