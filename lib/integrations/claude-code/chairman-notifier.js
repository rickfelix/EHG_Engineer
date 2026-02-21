/**
 * Claude Code Release — Chairman Notifier
 *
 * Formats a Telegram message for evaluated releases, sends via the
 * existing telegram-adapter, and creates chairman_notifications +
 * chairman_approval_requests records for audit trail.
 *
 * Pattern: lib/notifications/orchestrator.js:sendVisionScoreTelegramNotification
 */

import { createClient } from '@supabase/supabase-js';
import { sendTelegramMessage } from '../../notifications/telegram-adapter.js';
import dotenv from 'dotenv';

dotenv.config();

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
 * Format a Telegram message for a release
 * @param {Object} intake - eva_claude_code_intake row (with analysis fields)
 * @returns {string}
 */
function formatTelegramMessage(intake) {
  const relevancePct = Math.round((intake.relevance_score || 0) * 100);
  const rec = (intake.recommendation || 'evaluate').toUpperCase();

  let text = `📦 Claude Code ${intake.tag_name} Released\n\n`;
  text += `Relevance: ${relevancePct}% | Recommendation: ${rec}\n`;

  // Key improvements
  const improvements = intake.workflow_improvements || [];
  if (improvements.length > 0) {
    text += '\nKey Improvements for EHG:\n';
    for (const imp of improvements.slice(0, 5)) {
      text += `• ${imp.area}: ${imp.description}\n`;
    }
  }

  // Impact areas
  const areas = intake.impact_areas || [];
  if (areas.length > 0) {
    text += `\nImpact: ${areas.join(', ')}`;
  }

  text += '\n\nApprove to add to inbox, or ignore (auto-skips in 48h)';

  return text;
}

/**
 * Send notification and create approval request for a single release
 * @param {Object} intake - eva_claude_code_intake row
 * @param {Object} options
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @param {boolean} [options.verbose=false]
 * @returns {Promise<Object>} { notificationId, approvalRequestId, status }
 */
async function notifyForRelease(intake, options = {}) {
  const supabase = options.supabase || createSupabaseClient();
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) {
    console.warn('[release-notifier] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping');
    return { notificationId: null, approvalRequestId: null, status: 'skipped_not_configured' };
  }

  const text = formatTelegramMessage(intake);

  // 1. Create chairman_notifications record
  const { data: notification, error: notifError } = await supabase
    .from('chairman_notifications')
    .insert({
      recipient_email: chatId,
      notification_type: 'telegram_release_monitor',
      status: 'queued',
      subject: `[Telegram] Claude Code ${intake.tag_name} — ${(intake.recommendation || 'evaluate').toUpperCase()}`,
      email_metadata: {
        channel: 'telegram',
        tag_name: intake.tag_name,
        relevance_score: intake.relevance_score,
        recommendation: intake.recommendation,
        intake_id: intake.id
      }
    })
    .select('id')
    .single();

  if (notifError) {
    console.error(`[release-notifier] Failed to create notification record: ${notifError.message}`);
    return { notificationId: null, approvalRequestId: null, status: 'failed' };
  }

  // 2. Send Telegram message
  const sendResult = await sendTelegramMessage({ chatId, text });

  // 3. Update notification status
  const notifStatus = sendResult.success ? 'sent' : 'failed';
  const notifUpdate = sendResult.success
    ? { status: 'sent', provider_message_id: sendResult.providerMessageId, sent_at: new Date().toISOString() }
    : { status: 'failed', error_code: sendResult.errorCode, error_message: sendResult.errorMessage };

  await supabase
    .from('chairman_notifications')
    .update(notifUpdate)
    .eq('id', notification.id);

  if (!sendResult.success) {
    return { notificationId: notification.id, approvalRequestId: null, status: 'send_failed' };
  }

  // 4. Create chairman_approval_requests record (venture_id nullable for system requests)
  const timeoutHours = parseInt(process.env.RELEASE_APPROVAL_TIMEOUT_HOURS || '48', 10);
  const deadline = new Date(Date.now() + timeoutHours * 60 * 60 * 1000).toISOString();

  const { data: approval, error: approvalError } = await supabase
    .from('chairman_approval_requests')
    .insert({
      venture_id: null,
      request_type: 'release_enhancement',
      request_title: `Claude Code ${intake.tag_name} Release`,
      request_description: intake.analysis_summary || `New Claude Code release: ${intake.tag_name}`,
      request_data: {
        intake_id: intake.id,
        tag_name: intake.tag_name,
        relevance_score: intake.relevance_score,
        impact_areas: intake.impact_areas,
        improvements: intake.workflow_improvements,
        recommendation: intake.recommendation,
        release_url: intake.release_url
      },
      priority: intake.relevance_score >= 0.7 ? 'high' : 'normal',
      status: 'pending',
      deadline_at: deadline
    })
    .select('id')
    .single();

  if (approvalError) {
    console.error(`[release-notifier] Failed to create approval request: ${approvalError.message}`);
    return { notificationId: notification.id, approvalRequestId: null, status: 'partial' };
  }

  // 5. Update intake row with forward links + status
  await supabase
    .from('eva_claude_code_intake')
    .update({
      status: 'notified',
      approval_request_id: approval.id
    })
    .eq('id', intake.id);

  return {
    notificationId: notification.id,
    approvalRequestId: approval.id,
    status: 'notified'
  };
}

/**
 * Notify for all evaluated (but not yet notified) releases
 * @param {Object} options
 * @param {boolean} [options.verbose=false]
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @returns {Promise<Object>} Notification results
 */
export async function notifyEvaluatedReleases(options = {}) {
  const { verbose = false } = options;
  const supabase = options.supabase || createSupabaseClient();

  const { data: rows, error } = await supabase
    .from('eva_claude_code_intake')
    .select('*')
    .eq('status', 'evaluating')
    .order('published_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch evaluated releases: ${error.message}`);
  }

  const results = {
    notified: 0,
    skipped: 0,
    failed: 0,
    items: []
  };

  for (const intake of rows || []) {
    if (verbose) {
      console.log(`  Notifying: ${intake.tag_name}`);
    }

    const result = await notifyForRelease(intake, { supabase, verbose });
    results.items.push({ tag: intake.tag_name, ...result });

    if (result.status === 'notified') results.notified++;
    else if (result.status === 'skipped_not_configured') results.skipped++;
    else results.failed++;
  }

  return results;
}

export { formatTelegramMessage };
export default { notifyEvaluatedReleases };
