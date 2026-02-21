/**
 * Claude Code Release — Approval Handler
 *
 * Polls chairman_approval_requests for resolved release_enhancement requests.
 * Routes approved items to the feedback table (unified inbox source).
 * Auto-expires requests that exceed the timeout window.
 *
 * Pattern: lib/eva/chairman-decision-watcher.js (polling approach)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const TIMEOUT_HOURS = parseInt(process.env.RELEASE_APPROVAL_TIMEOUT_HOURS || '48', 10);

/**
 * Create a Supabase client
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Route an approved release to the feedback table
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} intake - eva_claude_code_intake row
 * @param {Object} approval - chairman_approval_requests row
 * @returns {Promise<string|null>} Feedback ID or null
 */
async function createFeedbackRow(supabase, intake, approval) {
  const improvements = intake.workflow_improvements || [];
  const description = [
    intake.analysis_summary || `Claude Code ${intake.tag_name} release`,
    '',
    improvements.length > 0 ? 'Workflow improvements:' : '',
    ...improvements.map(imp => `- ${imp.area}: ${imp.description}`),
    '',
    `Release URL: ${intake.release_url || 'N/A'}`,
    `Relevance: ${Math.round((intake.relevance_score || 0) * 100)}%`
  ].filter(Boolean).join('\n');

  const { data, error } = await supabase
    .from('feedback')
    .insert({
      title: `Claude Code ${intake.tag_name}: ${(intake.recommendation || 'evaluate').toUpperCase()}`,
      description,
      type: 'enhancement',
      source_type: 'claude_code_intake',
      source_application: 'ehg',
      status: 'new',
      priority: intake.relevance_score >= 0.7 ? 'high' : 'medium',
      category: 'tooling',
      source_id: intake.id
    })
    .select('id')
    .single();

  if (error) {
    console.error(`  Failed to create feedback row: ${error.message}`);
    return null;
  }

  return data.id;
}

/**
 * Process approved release_enhancement requests
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {boolean} verbose
 * @returns {Promise<{approved: number, items: Array}>}
 */
async function processApprovedRequests(supabase, verbose) {
  const { data: approvals } = await supabase
    .from('chairman_approval_requests')
    .select('*')
    .eq('request_type', 'release_enhancement')
    .eq('status', 'approved');

  const results = { approved: 0, items: [] };

  for (const approval of approvals || []) {
    const intakeId = approval.request_data?.intake_id;
    if (!intakeId) continue;

    // Fetch the intake row
    const { data: intake } = await supabase
      .from('eva_claude_code_intake')
      .select('*')
      .eq('id', intakeId)
      .single();

    if (!intake || intake.status === 'processed') continue;

    if (verbose) {
      console.log(`  Processing approved: ${intake.tag_name}`);
    }

    // Create feedback row
    const feedbackId = await createFeedbackRow(supabase, intake, approval);

    if (feedbackId) {
      // Update intake → processed
      await supabase
        .from('eva_claude_code_intake')
        .update({ status: 'processed', feedback_id: feedbackId })
        .eq('id', intake.id);

      results.approved++;
      results.items.push({ tag: intake.tag_name, feedbackId, intakeId: intake.id });
    }
  }

  return results;
}

/**
 * Process rejected requests
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {boolean} verbose
 * @returns {Promise<{rejected: number}>}
 */
async function processRejectedRequests(supabase, verbose) {
  const { data: rejections } = await supabase
    .from('chairman_approval_requests')
    .select('id, request_data')
    .eq('request_type', 'release_enhancement')
    .eq('status', 'rejected');

  let rejected = 0;

  for (const rejection of rejections || []) {
    const intakeId = rejection.request_data?.intake_id;
    if (!intakeId) continue;

    const { data: intake } = await supabase
      .from('eva_claude_code_intake')
      .select('id, status')
      .eq('id', intakeId)
      .single();

    if (!intake || intake.status === 'rejected') continue;

    await supabase
      .from('eva_claude_code_intake')
      .update({ status: 'rejected' })
      .eq('id', intake.id);

    rejected++;
    if (verbose) console.log(`  Rejected: intake ${intakeId}`);
  }

  return { rejected };
}

/**
 * Auto-expire pending requests past the timeout window
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {boolean} verbose
 * @returns {Promise<{expired: number}>}
 */
async function expireTimedOutRequests(supabase, verbose) {
  const cutoff = new Date(Date.now() - TIMEOUT_HOURS * 60 * 60 * 1000).toISOString();

  const { data: expired } = await supabase
    .from('chairman_approval_requests')
    .select('id, request_data')
    .eq('request_type', 'release_enhancement')
    .eq('status', 'pending')
    .lt('created_at', cutoff);

  let expiredCount = 0;

  for (const req of expired || []) {
    // Mark approval request as deferred (expired)
    await supabase
      .from('chairman_approval_requests')
      .update({
        status: 'deferred',
        decision_rationale: `Auto-expired after ${TIMEOUT_HOURS}h with no response. Auto-skipped per release monitor policy.`
      })
      .eq('id', req.id);

    // Mark intake as skipped
    const intakeId = req.request_data?.intake_id;
    if (intakeId) {
      await supabase
        .from('eva_claude_code_intake')
        .update({ status: 'skipped' })
        .eq('id', intakeId);
    }

    expiredCount++;
    if (verbose) console.log(`  Expired: approval ${req.id}`);
  }

  return { expired: expiredCount };
}

/**
 * Main handler — process all approval decisions and expirations
 * @param {Object} options
 * @param {boolean} [options.verbose=false]
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @returns {Promise<Object>}
 */
export async function processApprovals(options = {}) {
  const { verbose = false } = options;
  const supabase = options.supabase || createSupabaseClient();

  const approved = await processApprovedRequests(supabase, verbose);
  const rejected = await processRejectedRequests(supabase, verbose);
  const expired = await expireTimedOutRequests(supabase, verbose);

  return {
    approved: approved.approved,
    rejected: rejected.rejected,
    expired: expired.expired,
    feedbackItems: approved.items
  };
}

export default { processApprovals };
