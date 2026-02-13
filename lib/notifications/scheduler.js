/**
 * Chairman Notification Scheduler
 * SD: SD-EVA-FEAT-NOTIFICATION-001
 *
 * Timezone-aware scheduling for daily digest and weekly summary.
 * Computes deterministic time windows and idempotency keys.
 */

import { sendDailyDigest, sendWeeklySummary } from './orchestrator.js';

/**
 * Run the daily digest scheduler for all eligible chairmen.
 * Should be called periodically (e.g., every 15 minutes via cron).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Array<{ chairmanId: string, status: string }>>}
 */
export async function runDailyDigestScheduler(supabase) {
  const results = [];

  // Get all chairmen with daily digest enabled
  const { data: preferences } = await supabase
    .from('chairman_preferences')
    .select('chairman_id, preference_value')
    .eq('preference_key', 'daily_digest')
    .eq('value_type', 'json');

  if (!preferences || preferences.length === 0) return results;

  const now = new Date();

  for (const pref of preferences) {
    const config = typeof pref.preference_value === 'string'
      ? JSON.parse(pref.preference_value)
      : pref.preference_value;

    if (!config.enabled) continue;

    const timezone = config.timezone || 'UTC';
    const sendTime = config.send_time || '08:00';

    // Check if it's time to send (within 15-minute window)
    if (!isWithinSendWindow(now, sendTime, timezone, 15)) continue;

    // Get recipient email
    const email = await getChairmanEmail(supabase, pref.chairman_id);
    if (!email) continue;

    const sendDate = formatDateInTimezone(now, timezone);

    try {
      const result = await sendDailyDigest(supabase, {
        chairmanUserId: pref.chairman_id,
        recipientEmail: email,
        timezone,
        sendDate
      });
      results.push({ chairmanId: pref.chairman_id, status: result.status });
    } catch (err) {
      results.push({ chairmanId: pref.chairman_id, status: 'error', error: err.message });
    }
  }

  return results;
}

/**
 * Run the weekly summary scheduler for all eligible chairmen.
 * Should be called periodically (e.g., every 15 minutes via cron).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Array<{ chairmanId: string, status: string }>>}
 */
export async function runWeeklySummaryScheduler(supabase) {
  const results = [];

  const { data: preferences } = await supabase
    .from('chairman_preferences')
    .select('chairman_id, preference_value')
    .eq('preference_key', 'weekly_summary')
    .eq('value_type', 'json');

  if (!preferences || preferences.length === 0) return results;

  const now = new Date();

  for (const pref of preferences) {
    const config = typeof pref.preference_value === 'string'
      ? JSON.parse(pref.preference_value)
      : pref.preference_value;

    if (!config.enabled) continue;

    const timezone = config.timezone || 'UTC';
    const sendDay = config.send_day || 1; // 1 = Monday
    const sendTime = config.send_time || '08:00';

    // Check if it's the right day and within send window
    const localDay = getDayInTimezone(now, timezone);
    if (localDay !== sendDay) continue;
    if (!isWithinSendWindow(now, sendTime, timezone, 15)) continue;

    const email = await getChairmanEmail(supabase, pref.chairman_id);
    if (!email) continue;

    const weekStart = getWeekStartInTimezone(now, timezone);
    const weekEnd = formatDateInTimezone(now, timezone);

    try {
      const result = await sendWeeklySummary(supabase, {
        chairmanUserId: pref.chairman_id,
        recipientEmail: email,
        timezone,
        weekStart,
        weekEnd
      });
      results.push({ chairmanId: pref.chairman_id, status: result.status });
    } catch (err) {
      results.push({ chairmanId: pref.chairman_id, status: 'error', error: err.message });
    }
  }

  return results;
}

// ============================================================
// Timezone helpers
// ============================================================

function isWithinSendWindow(now, sendTime, timezone, windowMinutes) {
  const [targetH, targetM] = sendTime.split(':').map(Number);
  const targetMinutes = targetH * 60 + targetM;

  // Get current time in the target timezone
  const localTimeStr = now.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
  const [currentH, currentM] = localTimeStr.split(':').map(Number);
  const currentMinutes = currentH * 60 + currentM;

  const diff = currentMinutes - targetMinutes;
  return diff >= 0 && diff < windowMinutes;
}

function getDayInTimezone(date, timezone) {
  const localDateStr = date.toLocaleDateString('en-US', {
    timeZone: timezone,
    weekday: 'short'
  });
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return dayMap[localDateStr] ?? 0;
}

function formatDateInTimezone(date, timezone) {
  return date.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD format
}

function getWeekStartInTimezone(date, timezone) {
  const localDay = getDayInTimezone(date, timezone);
  const daysToMonday = localDay === 0 ? 6 : localDay - 1;
  const mondayDate = new Date(date);
  mondayDate.setDate(mondayDate.getDate() - daysToMonday);
  return formatDateInTimezone(mondayDate, timezone);
}

async function getChairmanEmail(supabase, chairmanId) {
  const { data } = await supabase
    .from('chairman_preferences')
    .select('preference_value')
    .eq('chairman_id', chairmanId)
    .eq('preference_key', 'notification_email')
    .single();

  if (data) {
    const val = typeof data.preference_value === 'string'
      ? JSON.parse(data.preference_value)
      : data.preference_value;
    return val.email || val;
  }

  // Fallback: look up from auth users
  const { data: userData } = await supabase.auth.admin.getUserById(chairmanId);
  return userData?.user?.email || null;
}
