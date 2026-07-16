/**
 * Rate Limiter for Chairman Notifications
 * SD: SD-EVA-FEAT-NOTIFICATION-001
 *
 * Enforces per-recipient rate limiting on immediate notifications.
 * Default: 10 sends per rolling 60-minute window.
 * Checks against chairman_notifications table for sent count.
 */

const DEFAULT_RATE_LIMIT = parseInt(process.env.CHAIRMAN_RATE_LIMIT_PER_HOUR || '10', 10);
const WINDOW_MINUTES = 60;

/**
 * Check if a recipient has exceeded their immediate notification rate limit.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} recipientEmail
 * @param {number} [limit] - Override the per-hour limit
 * @param {{channel?: string}} [opts] - SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001: optional channel scope
 *   (e.g. 'sms') giving that channel its own rate budget. Omitted (existing callers) preserves
 *   the exact prior query — zero behavior change for the email path.
 * @returns {Promise<{ allowed: boolean, currentCount: number, limit: number }>}
 */
export async function checkRateLimit(supabase, recipientEmail, limit, { channel } = {}) {
  const effectiveLimit = limit || DEFAULT_RATE_LIMIT;
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  let query = supabase
    .from('chairman_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_email', recipientEmail)
    .eq('notification_type', 'immediate')
    .eq('status', 'sent')
    .gte('created_at', windowStart);
  if (channel) query = query.eq('channel', channel);

  const { count, error } = await query;

  if (error) {
    // On query error, allow the send but log warning
    console.warn('[RateLimiter] Query error, allowing send:', error.message);
    return { allowed: true, currentCount: 0, limit: effectiveLimit };
  }

  return {
    allowed: (count || 0) < effectiveLimit,
    currentCount: count || 0,
    limit: effectiveLimit
  };
}
