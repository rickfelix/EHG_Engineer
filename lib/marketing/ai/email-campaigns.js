/**
 * Email Marketing via Resend with Drip Campaigns
 * SD-EVA-FEAT-MARKETING-AI-001 (US-005)
 *
 * Sends transactional and marketing emails through Resend API.
 * Manages automated multi-step drip campaign sequences with
 * configurable delays, engagement-based variant selection,
 * and unsubscribe handling.
 */

import { resolveSendPermission, recordConsentEvent, CONSENT_EVENT } from '../venture-consent.js';
import { checkStageGate, shouldEnforceBlock } from '../../governance/stage-gate-predicate.js';

// SD-LEO-INFRA-STAGE-GATE-PREDICATE-001: external-contact capabilities are gated at
// S24 (Go Live) -- the line between building (free at any stage) and contacting a
// real human (gated). This is a fixed constant, not read per-campaign.
const STAGE_GATE_REQUIRED_STAGE = 24;

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 4000, 16000]; // Exponential backoff
const DEFAULT_STEP_DELAY_HOURS = 48;

/**
 * Campaign enrollment states. Already exported at the foot of this file; the autonomy
 * gate's suppression invariant imports it from there rather than re-declaring the literal
 * 'unsubscribed' (SD-LEO-FEAT-CODIFY-HONEST-ACTIVATION-001 FR-1) — a replica drifts.
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
     * @param {string} params.ventureId - Venture owning this enrollment (tenant scope)
     * @param {string} params.leadEmail - Lead's email address
     * @param {string} params.campaignId - Campaign identifier
     * @param {object} [params.context] - Additional context for template rendering
     * @returns {Promise<{enrollmentId: string}>}
     */
    async enrollInCampaign(params) {
      const { ventureId, leadEmail, campaignId, context } = params;
      if (!ventureId) throw new Error('enrollInCampaign requires ventureId');
      const row = {
        venture_id: ventureId,
        lead_email: leadEmail,
        campaign_id: campaignId,
        current_step: 0,
        opened_previous: false,
        status: ENROLLMENT_STATUS.ACTIVE,
        metadata: context ? { context } : {}
      };
      const { data, error } = await supabase
        .from('campaign_enrollments')
        .upsert(row, { onConflict: 'venture_id,lead_email,campaign_id' })
        .select('id')
        .single();
      if (error) throw new Error(`enrollInCampaign insert failed: ${error.message}`);
      return { enrollmentId: data.id };
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
        const { error } = await supabase
          .from('campaign_enrollments')
          .update({ status: ENROLLMENT_STATUS.COMPLETED, updated_at: new Date().toISOString() })
          .eq('id', enrollment.id);
        if (error) {
          logger.warn?.(`[EmailCampaigns] processStep: failed to mark completed: ${error.message}`);
        }
        return { action: 'completed' };
      }

      // SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-7. The `enrollment.status` check above reads
      // a value off the record the CALLER loaded — it is as old as that load. An opt-out arriving
      // between load and send is invisible to it. This re-reads consent FRESH, at send time, from
      // the append-only event log, which is what makes the enroll-to-send gap closed rather than
      // merely narrow. Placed BEFORE sendEmail deliberately: a check after the send would describe
      // the harm rather than prevent it.
      const permission = await resolveSendPermission({
        supabase,
        ventureId: enrollment.venture_id,
        email: enrollment.lead_email
      });
      if (!permission.permitted) {
        return { action: 'suppressed', reason: permission.reason, detail: permission.detail };
      }

      // SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 (FR-3): action-time re-check, additive
      // alongside the consent check above -- independent gate, does not replace it.
      // Shadow mode (armed=false, the default until the sibling choke SD + chairman
      // ratification sitting land) still audit-logs the real verdict but never blocks.
      const stageGate = await checkStageGate({
        supabase,
        ventureId: enrollment.venture_id,
        requiredStage: STAGE_GATE_REQUIRED_STAGE,
        actorType: 'campaign',
        actorId: enrollment.campaign_id,
      });
      if (shouldEnforceBlock(stageGate)) {
        return { action: 'suppressed', reason: 'stage_gate', detail: stageGate.reason };
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

      const { error } = await supabase
        .from('campaign_enrollments')
        .update({
          current_step: stepIndex + 1,
          opened_previous: false,
          next_step_at: nextStepAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', enrollment.id);
      if (error) {
        logger.warn?.(`[EmailCampaigns] processStep: failed to advance step: ${error.message}`);
      }

      return { action: 'sent', nextStepAt };
    },

    /**
     * Handle an unsubscribe request.
     * Marks ALL active enrollments for this email as unsubscribed.
     *
     * @param {string} email - Email address to unsubscribe
     * @returns {Promise<{campaignsRemoved: number}>}
     */
    async handleUnsubscribe(email) {
      const { data, error } = await supabase
        .from('campaign_enrollments')
        .update({ status: ENROLLMENT_STATUS.UNSUBSCRIBED, updated_at: new Date().toISOString() })
        .eq('lead_email', email)
        .eq('status', ENROLLMENT_STATUS.ACTIVE)
        .select('id, venture_id');
      if (error) {
        logger.warn?.(`[EmailCampaigns] handleUnsubscribe: ${error.message}`);
        // suppressionComplete is FALSE on an error, not omitted: the unsubscribe did not take
        // effect, and a caller reading a missing field as falsy is relying on luck.
        return { campaignsRemoved: 0, optOutsRecorded: 0, suppressionComplete: false };
      }

      // SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-7. The status update above is now BOOKKEEPING
      // ONLY — the send path no longer reads it. Suppression is derived from the append-only event
      // log, so an unsubscribe that did not write an event would set a field nobody consults and
      // the recipient would keep receiving mail. Recording the opt_out is what makes this work.
      // One event per venture the recipient was enrolled with, since consent is per-venture.
      const ventures = [...new Set((data || []).map((r) => r.venture_id).filter(Boolean))];
      let optOutsRecorded = 0;
      for (const ventureId of ventures) {
        try {
          await recordConsentEvent({
            supabase,
            ventureId,
            email,
            eventType: CONSENT_EVENT.OPT_OUT,
            provenance: 'unsubscribe request via handleUnsubscribe',
          });
          optOutsRecorded += 1;
        } catch (e) {
          // Loud, and NOT swallowed into a success count: if the opt_out did not land, the
          // recipient is still sendable, and reporting an unsubscribe that did not suppress is
          // worse than reporting a failure.
          logger.warn?.(`[EmailCampaigns] handleUnsubscribe: FAILED to record opt_out for venture ${ventureId}: ${e.message}`);
        }
      }

      // `optOutsRecorded === ventures.length` alone is VACUOUSLY TRUE when ventures is empty —
      // it would report suppressionComplete for an unsubscribe that removed enrollments and
      // suppressed nobody. A field named suppressionComplete is a CLAIM, and a claim that cannot
      // observe its subject is worse than no claim. So: nothing removed is complete; rows removed
      // with no resolvable venture is NOT complete, because no opt_out could be written and the
      // recipient stays sendable.
      const removed = Array.isArray(data) ? data.length : 0;
      return {
        campaignsRemoved: removed,
        optOutsRecorded,
        suppressionComplete: removed === 0
          ? true
          : ventures.length > 0 && optOutsRecorded === ventures.length,
      };
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
