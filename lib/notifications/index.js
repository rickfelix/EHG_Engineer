/**
 * Chairman Notification Service - Public API
 * SD: SD-EVA-FEAT-NOTIFICATION-001
 *
 * Provides immediate notifications, daily digests, and weekly summaries
 * for the EHG Chairman via Resend email delivery.
 */

export { sendEmail } from './resend-adapter.js';
export { checkRateLimit } from './rate-limiter.js';
export { immediateTemplate, dailyDigestTemplate, weeklySummaryTemplate, visionScoreTemplate } from './email-templates.js';
export { sendImmediateNotification, sendDailyDigest, sendWeeklySummary, sendVisionScoreNotification } from './orchestrator.js';
export { runDailyDigestScheduler, runWeeklySummaryScheduler } from './scheduler.js';
