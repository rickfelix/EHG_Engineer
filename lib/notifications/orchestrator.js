/**
 * Chairman Notification Orchestrator
 * SD: SD-EVA-FEAT-NOTIFICATION-001
 *
 * Core notification logic: immediate send pipeline, quiet hours check,
 * status transitions, and idempotency. Coordinates between rate limiter,
 * Resend adapter, and email templates.
 */

import { sendEmail } from './resend-adapter.js';
import { checkRateLimit } from './rate-limiter.js';
import { immediateTemplate, dailyDigestTemplate, weeklySummaryTemplate, visionScoreTemplate } from './email-templates.js';

/**
 * Send an immediate notification for a critical chairman decision.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ decisionId: string, decisionTitle: string, ventureName: string, priority: string, chairmanUserId: string, recipientEmail: string }} params
 * @returns {Promise<{ notificationId: string, status: string }>}
 */
export async function sendImmediateNotification(supabase, params) {
  // 1. Create notification record as 'queued'
  const { data: notification, error: insertError } = await supabase
    .from('chairman_notifications')
    .insert({
      chairman_user_id: params.chairmanUserId,
      recipient_email: params.recipientEmail,
      notification_type: 'immediate',
      decision_id: params.decisionId,
      status: 'queued',
      subject: `[Action Required] ${params.decisionTitle}`
    })
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`Failed to create notification record: ${insertError.message}`);
  }

  const notificationId = notification.id;

  // 2. Check quiet hours
  const inQuietHours = await isInQuietHours(supabase, params.chairmanUserId);
  if (inQuietHours) {
    await updateNotificationStatus(supabase, notificationId, 'deferred', {
      error_code: 'QUIET_HOURS',
      error_message: 'Notification deferred due to quiet hours'
    });
    return { notificationId, status: 'deferred' };
  }

  // 3. Check rate limit
  const rateCheck = await checkRateLimit(supabase, params.recipientEmail);
  if (!rateCheck.allowed) {
    await updateNotificationStatus(supabase, notificationId, 'rate_limited', {
      error_code: 'RATE_LIMITED',
      error_message: `Rate limit exceeded: ${rateCheck.currentCount}/${rateCheck.limit} in last hour`
    });
    return { notificationId, status: 'rate_limited' };
  }

  // 4. Render email
  const { html, text, subject } = immediateTemplate({
    decisionTitle: params.decisionTitle,
    ventureName: params.ventureName,
    priority: params.priority,
    decisionId: params.decisionId,
    createdAt: new Date().toISOString()
  });

  // 5. Send via Resend
  const result = await sendEmail({ to: params.recipientEmail, subject, html, text });

  if (result.success) {
    await updateNotificationStatus(supabase, notificationId, 'sent', {
      provider_message_id: result.providerMessageId,
      sent_at: new Date().toISOString()
    });
    return { notificationId, status: 'sent' };
  }

  await updateNotificationStatus(supabase, notificationId, 'failed', {
    error_code: result.errorCode,
    error_message: result.errorMessage
  });
  return { notificationId, status: 'failed' };
}

/**
 * Send a daily digest email aggregating events from the last 24 hours.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ chairmanUserId: string, recipientEmail: string, timezone: string, sendDate: string }} params
 * @returns {Promise<{ notificationId: string | null, status: string }>}
 */
export async function sendDailyDigest(supabase, params) {
  const digestKey = `${params.sendDate}:${params.timezone}`;

  // Check idempotency - prevent duplicate digests
  const { data: existing } = await supabase
    .from('chairman_notifications')
    .select('id')
    .eq('digest_key', digestKey)
    .in('status', ['queued', 'sent'])
    .limit(1);

  if (existing && existing.length > 0) {
    return { notificationId: existing[0].id, status: 'already_sent' };
  }

  // Gather events from the last 24 hours
  const windowEnd = new Date().toISOString();
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const events = await gatherDigestEvents(supabase, windowStart, windowEnd);

  if (events.length === 0) {
    return { notificationId: null, status: 'no_events' };
  }

  // Create notification record
  const { data: notification, error: insertError } = await supabase
    .from('chairman_notifications')
    .insert({
      chairman_user_id: params.chairmanUserId,
      recipient_email: params.recipientEmail,
      notification_type: 'daily_digest',
      status: 'queued',
      digest_key: digestKey,
      email_metadata: { event_count: events.length, window_start: windowStart, window_end: windowEnd }
    })
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`Failed to create digest notification: ${insertError.message}`);
  }

  // Render and send
  const { html, text, subject } = dailyDigestTemplate({
    date: params.sendDate,
    timezone: params.timezone,
    events
  });

  const result = await sendEmail({ to: params.recipientEmail, subject, html, text });

  if (result.success) {
    await updateNotificationStatus(supabase, notification.id, 'sent', {
      provider_message_id: result.providerMessageId,
      sent_at: new Date().toISOString(),
      subject
    });
    return { notificationId: notification.id, status: 'sent' };
  }

  await updateNotificationStatus(supabase, notification.id, 'failed', {
    error_code: result.errorCode,
    error_message: result.errorMessage,
    subject
  });
  return { notificationId: notification.id, status: 'failed' };
}

/**
 * Send a weekly summary email with portfolio overview metrics.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ chairmanUserId: string, recipientEmail: string, timezone: string, weekStart: string, weekEnd: string }} params
 * @returns {Promise<{ notificationId: string | null, status: string }>}
 */
export async function sendWeeklySummary(supabase, params) {
  const summaryKey = `${params.weekStart}:${params.timezone}`;

  // Check idempotency
  const { data: existing } = await supabase
    .from('chairman_notifications')
    .select('id')
    .eq('summary_key', summaryKey)
    .in('status', ['queued', 'sent'])
    .limit(1);

  if (existing && existing.length > 0) {
    return { notificationId: existing[0].id, status: 'already_sent' };
  }

  // Gather summary metrics
  const metrics = await gatherWeeklyMetrics(supabase, params.weekStart, params.weekEnd);

  // Create notification record
  const { data: notification, error: insertError } = await supabase
    .from('chairman_notifications')
    .insert({
      chairman_user_id: params.chairmanUserId,
      recipient_email: params.recipientEmail,
      notification_type: 'weekly_summary',
      status: 'queued',
      summary_key: summaryKey,
      email_metadata: { week_start: params.weekStart, week_end: params.weekEnd }
    })
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`Failed to create weekly summary notification: ${insertError.message}`);
  }

  // Render and send
  const { html, text, subject } = weeklySummaryTemplate({
    weekStart: params.weekStart,
    weekEnd: params.weekEnd,
    timezone: params.timezone,
    venturesByStage: metrics.venturesByStage,
    decisions: metrics.decisions,
    revenueProjection: metrics.revenueProjection
  });

  const result = await sendEmail({ to: params.recipientEmail, subject, html, text });

  if (result.success) {
    await updateNotificationStatus(supabase, notification.id, 'sent', {
      provider_message_id: result.providerMessageId,
      sent_at: new Date().toISOString(),
      subject
    });
    return { notificationId: notification.id, status: 'sent' };
  }

  await updateNotificationStatus(supabase, notification.id, 'failed', {
    error_code: result.errorCode,
    error_message: result.errorMessage,
    subject
  });
  return { notificationId: notification.id, status: 'failed' };
}

/**
 * Send a vision score notification to the Chairman after scoring completes.
 * SD: SD-MAN-INFRA-VISION-SCORE-NOTIFICATIONS-001
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ sdKey: string, sdTitle: string, totalScore: number, dimensionScores: Object, scoreId: string, recipientEmail: string }} params
 * @returns {Promise<{ notificationId: string | null, status: string }>}
 */
export async function sendVisionScoreNotification(supabase, params) {
  const recipientEmail = params.recipientEmail || process.env.CHAIRMAN_EMAIL;
  if (!recipientEmail) {
    console.warn('[vision-score-notif] CHAIRMAN_EMAIL not set — skipping notification');
    return { notificationId: null, status: 'skipped_no_recipient' };
  }

  const scoredAt = new Date().toISOString();

  // Create notification record as 'queued'
  const { data: notification, error: insertError } = await supabase
    .from('chairman_notifications')
    .insert({
      recipient_email: recipientEmail,
      notification_type: 'vision_score',
      status: 'queued',
      subject: `[EVA Vision Score] ${params.sdKey}: ${params.totalScore != null ? Math.round(params.totalScore) + '%' : 'N/A'}`,
      email_metadata: { sd_key: params.sdKey, score_id: params.scoreId, total_score: params.totalScore }
    })
    .select('id')
    .single();

  if (insertError) {
    console.error(`[vision-score-notif] Failed to create record: ${insertError.message}`);
    return { notificationId: null, status: 'failed' };
  }

  const notificationId = notification.id;

  // Check rate limit
  const rateCheck = await checkRateLimit(supabase, recipientEmail);
  if (!rateCheck.allowed) {
    await updateNotificationStatus(supabase, notificationId, 'rate_limited', {
      error_code: 'RATE_LIMITED',
      error_message: `Rate limit exceeded: ${rateCheck.currentCount}/${rateCheck.limit} in last hour`
    });
    return { notificationId, status: 'rate_limited' };
  }

  // Render and send
  const { html, text, subject } = visionScoreTemplate({
    sdKey: params.sdKey,
    sdTitle: params.sdTitle,
    totalScore: params.totalScore,
    dimensionScores: params.dimensionScores || {},
    scoreId: params.scoreId,
    scoredAt,
  });

  const result = await sendEmail({ to: recipientEmail, subject, html, text });

  if (result.success) {
    await updateNotificationStatus(supabase, notificationId, 'sent', {
      provider_message_id: result.providerMessageId,
      sent_at: scoredAt,
      subject,
    });
    return { notificationId, status: 'sent' };
  }

  await updateNotificationStatus(supabase, notificationId, 'failed', {
    error_code: result.errorCode,
    error_message: result.errorMessage,
    subject,
  });
  return { notificationId, status: 'failed' };
}

// ============================================================
// Internal helpers
// ============================================================

async function updateNotificationStatus(supabase, id, status, extra = {}) {
  const update = { status, ...extra };
  await supabase.from('chairman_notifications').update(update).eq('id', id);
}

async function isInQuietHours(supabase, chairmanUserId) {
  const { data } = await supabase
    .from('chairman_preferences')
    .select('preference_value')
    .eq('chairman_id', chairmanUserId)
    .eq('preference_key', 'quiet_hours')
    .single();

  if (!data) return false;

  const prefs = typeof data.preference_value === 'string'
    ? JSON.parse(data.preference_value)
    : data.preference_value;

  if (!prefs.enabled) return false;

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const [startH, startM] = (prefs.start || '22:00').split(':').map(Number);
  const [endH, endM] = (prefs.end || '07:00').split(':').map(Number);
  const startTime = startH * 60 + startM;
  const endTime = endH * 60 + endM;

  // Handle overnight quiet hours (e.g., 22:00 - 07:00)
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  }
  return currentTime >= startTime && currentTime < endTime;
}

async function gatherDigestEvents(supabase, windowStart, windowEnd) {
  const events = [];

  // Stage completions from eva_orchestration_events
  const { data: stageEvents } = await supabase
    .from('eva_orchestration_events')
    .select('event_type, event_data, created_at')
    .gte('created_at', windowStart)
    .lte('created_at', windowEnd)
    .in('event_type', ['stage_completion', 'dfe_auto_approval', 'venture_health_change'])
    .order('created_at', { ascending: false })
    .limit(50);

  if (stageEvents) {
    for (const event of stageEvents) {
      const data = typeof event.event_data === 'string' ? JSON.parse(event.event_data) : (event.event_data || {});
      events.push({
        type: event.event_type,
        ventureName: data.venture_name || data.ventureName || 'Unknown',
        description: data.description || formatEventDescription(event.event_type, data),
        timestamp: new Date(event.created_at).toLocaleTimeString(),
        deepLink: data.deep_link || ''
      });
    }
  }

  return events;
}

async function gatherWeeklyMetrics(supabase, weekStart, weekEnd) {
  // Ventures by stage
  const { data: ventures } = await supabase
    .from('ventures')
    .select('current_stage')
    .eq('status', 'active');

  const venturesByStage = {};
  if (ventures) {
    for (const v of ventures) {
      const stage = v.current_stage || 'Unknown';
      venturesByStage[stage] = (venturesByStage[stage] || 0) + 1;
    }
  }

  // Decisions this week
  const { data: decisions } = await supabase
    .from('chairman_decisions')
    .select('decision_type')
    .gte('created_at', weekStart)
    .lte('created_at', weekEnd);

  const decisionCounts = { kills: 0, parks: 0, advances: 0 };
  if (decisions) {
    for (const d of decisions) {
      const type = (d.decision_type || '').toLowerCase();
      if (type === 'kill') decisionCounts.kills++;
      else if (type === 'park') decisionCounts.parks++;
      else if (type === 'advance') decisionCounts.advances++;
    }
  }

  // Revenue projection (simplified - uses available data)
  const revenueProjection = { current: 0, previous: 0, delta: 0 };

  return {
    venturesByStage,
    decisions: decisionCounts,
    revenueProjection
  };
}

function formatEventDescription(eventType, data) {
  switch (eventType) {
    case 'stage_completion':
      return `Completed stage ${data.stage || 'N/A'}`;
    case 'dfe_auto_approval':
      return `DFE auto-approved: ${data.reason || 'standard criteria met'}`;
    case 'venture_health_change':
      return `Health changed to ${data.new_health || data.health || 'unknown'}`;
    default:
      return eventType.replace(/_/g, ' ');
  }
}
