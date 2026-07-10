/**
 * Prompt-injection floor for inbound channel replies/DMs — SD-LEO-INFRA-VENTURE-DEMAND-
 * DISTRIBUTION-001-C FR-4.
 *
 * No ingestion path for inbound social replies/DMs existed before this module. Inbound
 * public-origin text is DATA, never instructions (chairman ratification R2,
 * docs/governance/chairman-ratifications-2026-07-08.md). This is the enforcement
 * boundary: text lands in venture_inbound_messages, gets detected+scored via
 * lib/quality/sanitizer.js + decided via lib/quality/quarantine-engine.js (TR-3 — NOT
 * lib/eva/utils/sanitize-for-prompt.js, which still concatenates neutralized text into a
 * prompt), and injection-detected items fail closed to quarantine, surfaced through the
 * existing chairman_decisions review surface (FR-7) rather than auto-processed.
 *
 * getSafeTextForDownstreamUse() is the ONLY sanctioned read path for any caller that
 * might build a tool-enabled LLM prompt from inbound text — it returns null for anything
 * not explicitly sanitization_status='sanitized', so a quarantined or unprocessed
 * message can never be raw-concatenated into a prompt by construction.
 */
import { sanitize } from '../quality/sanitizer.js';
import { evaluateQuarantine } from '../quality/quarantine-engine.js';
import { recordPendingDecision } from '../chairman/record-pending-decision.mjs';

/**
 * Ingest one inbound reply/DM. Signature verification (when a verifier is supplied)
 * fails CLOSED on both an invalid signature AND a verifier error — unlike
 * lib/marketing/ai/metrics-ingestor.js's processWebhook(), which logs and silently
 * proceeds on a verifier throw. That fail-open behavior is acceptable for a metrics
 * pipeline; it is not acceptable for a boundary whose whole job is keeping untrusted
 * text out of anything with tool-call authority.
 *
 * @param {object} params
 * @param {object} params.supabase
 * @param {string} params.ventureId
 * @param {string} params.channelType
 * @param {string} [params.channelId]
 * @param {string} params.externalMessageId
 * @param {string} params.rawText
 * @param {object} [params.headers]
 * @param {(rawText: string, headers: object) => Promise<boolean>} [params.verifySignature]
 * @param {string} [params.receivedAt]
 * @returns {Promise<{accepted: boolean, id?: string, sanitizationStatus?: string, quarantined?: boolean, reason?: string}>}
 */
export async function ingestInboundMessage({
  supabase, ventureId, channelType, channelId, externalMessageId, rawText, headers, verifySignature, receivedAt,
}) {
  if (!supabase) return { accepted: false, reason: 'no_supabase_client' };
  if (typeof rawText !== 'string' || rawText.length === 0) {
    return { accepted: false, reason: 'INVALID_PAYLOAD: rawText must be a non-empty string' };
  }

  if (typeof verifySignature === 'function') {
    let valid = false;
    try {
      valid = await verifySignature(rawText, headers);
    } catch (err) {
      return { accepted: false, reason: `SIGNATURE_VERIFICATION_ERROR (fail-closed): ${err.message}` };
    }
    if (!valid) {
      return { accepted: false, reason: 'SIGNATURE_VERIFICATION_FAILED' };
    }
  }

  let sanitizationResult;
  try {
    // Reuses sanitizer.js's full detect+score pipeline (TR-3) via a feedback-shaped
    // wrapper — `description` is one of sanitize()'s scanned fields.
    sanitizationResult = await sanitize({ description: rawText });
  } catch (err) {
    // A detector failure means we cannot vouch for this text — fail closed to the
    // same shape evaluateQuarantine() reads, forcing quarantine rather than silently
    // treating an undetectable message as safe.
    sanitizationResult = {
      injection: { detected: true, risk_score: 100, patterns: [{ type: 'detector_error', severity: 'critical', risk_score: 100 }] },
      redactions: [],
      error: err.message,
    };
  }

  const decision = await evaluateQuarantine({}, sanitizationResult);
  const sanitizationStatus = decision.shouldQuarantine ? 'quarantined' : 'sanitized';
  const quarantineReason = decision.shouldQuarantine
    ? decision.reasons.map((r) => r.type).join(', ')
    : null;

  const { data, error } = await supabase
    .from('venture_inbound_messages')
    .upsert(
      {
        venture_id: ventureId,
        channel_type: channelType,
        channel_id: channelId || null,
        external_message_id: externalMessageId,
        raw_text: rawText,
        sanitization_status: sanitizationStatus,
        quarantine_reason: quarantineReason,
        received_at: receivedAt || new Date().toISOString(),
      },
      { onConflict: 'channel_type,external_message_id' }
    )
    .select('id, sanitization_status')
    .single();

  if (error) {
    return { accepted: false, reason: `PERSIST_FAILED: ${error.message}` };
  }

  // FR-7: quarantined items route through the existing chairman_decisions surface
  // rather than a new UI. Non-blocking (best-effort) — a durable quarantine row
  // already exists regardless of whether this notification succeeds.
  if (sanitizationStatus === 'quarantined') {
    await recordPendingDecision(supabase, {
      title: `Inbound message quarantined for review (${channelType})`,
      decisionType: 'inbound_message_quarantine',
      ventureId,
      blocking: false,
      context: { message_id: data.id, channel_type: channelType, quarantine_reason: quarantineReason },
    }).catch(() => { /* fail-soft: the quarantine row is the durable record */ });
  }

  return {
    accepted: true,
    id: data.id,
    sanitizationStatus: data.sanitization_status,
    quarantined: sanitizationStatus === 'quarantined',
  };
}

/**
 * The ONLY sanctioned read path for a caller that might use inbound text downstream
 * (e.g. to build an LLM prompt). Returns null for anything not sanitization_status=
 * 'sanitized' — a quarantined or still-unprocessed message can never be returned here,
 * so it can never be raw-concatenated into a tool-enabled prompt by construction.
 *
 * @param {object} params
 * @param {object} params.supabase
 * @param {string} params.messageId
 * @returns {Promise<string|null>}
 */
export async function getSafeTextForDownstreamUse({ supabase, messageId }) {
  const { data, error } = await supabase
    .from('venture_inbound_messages')
    .select('sanitization_status, raw_text')
    .eq('id', messageId)
    .maybeSingle();

  if (error || !data || data.sanitization_status !== 'sanitized') return null;
  return data.raw_text;
}

export default { ingestInboundMessage, getSafeTextForDownstreamUse };
