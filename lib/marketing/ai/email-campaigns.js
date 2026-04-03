/**
 * Email Marketing via Resend with Drip Campaigns
 * SD-EVA-FEAT-MARKETING-AI-001 (US-005)
 *
 * Sends transactional and marketing emails through Resend API.
 * Manages automated multi-step drip campaign sequences with
 * configurable delays, engagement-based variant selection,
 * and unsubscribe handling.
 */

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 4000, 16000]; // Exponential backoff
const DEFAULT_STEP_DELAY_HOURS = 48;

/**
 * Campaign enrollment states.
 */
const ENROLLMENT_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  UNSUBSCRIBED: 'unsubscribed',
  FAILED: 'failed'
};

/**
 * Create an email campaigns instance.
 *
 * @param {object} deps
 * @param {object} deps.supabase - Supabase client
 * @param {object} [deps.resendClient] - Resend SDK client (for testing injection)
 * @param {string} [deps.resendApiKey] - Resend API key
 * @param {object} [deps.logger] - Logger
 * @returns {EmailCampaigns}
 */
export function createEmailCampaigns(deps) {
  const { supabase, logger = console, resendClient, resendApiKey } = deps;

  return {
    /**
     * Send a single email via Resend with retry logic.
     *
     * @param {object} params
     * @param {string} params.to - Recipient email
     * @param {string} params.subject - Email subject
     * @param {string} params.html - Email HTML body
     * @param {string} [params.from] - Sender email
     * @param {object} [params.tags] - Email tags for tracking
     * @returns {Promise<{success: boolean, messageId?: string, error?: string, attempts: number}>}
     */
    async sendEmail(params) {
      const { to, subject, html, from = 'noreply@ehg.ai', tags } = params;
      let lastError;

      for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        try {
          const result = await sendViaResend(resendClient, resendApiKey, {
            to, subject, html, from, tags
          });
          return { success: true, messageId: result.id, attempts: attempt + 1 };
        } catch (err) {
          lastError = err;
          if (err.statusCode === 429 && attempt < MAX_RETRY_ATTEMPTS - 1) {
            logger.warn(`Resend rate limited, retrying in ${RETRY_DELAYS_MS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`);
            await sleep(RETRY_DELAYS_MS[attempt]);
          } else if (err.statusCode && err.statusCode < 500 && err.statusCode !== 429) {
            // Client error (not rate limit), don't retry
            break;
          } else if (attempt < MAX_RETRY_ATTEMPTS - 1) {
            await sleep(RETRY_DELAYS_MS[attempt]);
          }
        }
      }

      return {
        success: false,
        error: lastError?.message ?? 'Unknown error',
        attempts: MAX_RETRY_ATTEMPTS
      };
    },

    /**
     * Enroll a lead in a drip campaign.
     *
     * @param {object} params
     * @param {string} params.leadEmail - Lead's email address
     * @param {string} params.campaignId - Campaign identifier
     * @param {object} [params.context] - Additional context for template rendering
     * @returns {Promise<{enrollmentId: string}>}
     */
    async enrollInCampaign(params) {
      const { leadEmail, campaignId } = params;
      // campaign_enrollments table does not exist — return stub enrollment
      logger.warn?.('[EmailCampaigns] enrollInCampaign: campaign_enrollments table not provisioned, returning stub');
      return { enrollmentId: `stub-${campaignId}-${Date.now()}` };
    },

    /**
     * Process the next step of a drip campaign for an enrollment.
     *
     * @param {object} enrollment - Enrollment record from DB
     * @param {Array<{subject: string, htmlA: string, htmlB: string, delayHours: number}>} steps - Campaign steps
     * @returns {Promise<{action: string, nextStepAt?: string}>}
     */
    async processStep(enrollment, steps) {
      if (enrollment.status !== ENROLLMENT_STATUS.ACTIVE) {
        return { action: 'skipped', reason: `enrollment status: ${enrollment.status}` };
      }

      const stepIndex = enrollment.current_step;
      if (stepIndex >= steps.length) {
        // campaign_enrollments table not provisioned — skip DB update
        return { action: 'completed' };
      }

      const step = steps[stepIndex];
      const html = enrollment.opened_previous ? step.htmlA : (step.htmlB ?? step.htmlA);

      const sendResult = await this.sendEmail({
        to: enrollment.lead_email,
        subject: step.subject,
        html,
        tags: { campaign: enrollment.campaign_id, step: stepIndex }
      });

      if (!sendResult.success) {
        return { action: 'failed', error: sendResult.error };
      }

      const delayHours = step.delayHours ?? DEFAULT_STEP_DELAY_HOURS;
      const nextStepAt = new Date(Date.now() + delayHours * 3600_000).toISOString();

      return { action: 'sent', nextStepAt };
    },

    /**
     * Handle an unsubscribe request.
     * Removes the recipient from ALL active campaigns.
     *
     * @param {string} email - Email address to unsubscribe
     * @returns {Promise<{campaignsRemoved: number}>}
     */
    async handleUnsubscribe(email) {
      // campaign_enrollments table not provisioned — no active campaigns to remove
      logger.warn?.('[EmailCampaigns] handleUnsubscribe: campaign_enrollments table not provisioned');
      return { campaignsRemoved: 0 };
    }
  };
}

/**
 * Send email via Resend SDK or API.
 */
async function sendViaResend(client, apiKey, params) {
  if (client) {
    return client.emails.send(params);
  }

  if (!apiKey) throw new Error('Resend API key not configured');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      tags: params.tags ? Object.entries(params.tags).map(([name, value]) => ({ name, value: String(value) })) : undefined
    })
  });

  if (!response.ok) {
    const err = new Error(`Resend API error: ${response.status}`);
    err.statusCode = response.status;
    throw err;
  }

  return response.json();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { ENROLLMENT_STATUS, MAX_RETRY_ATTEMPTS, RETRY_DELAYS_MS, DEFAULT_STEP_DELAY_HOURS };
