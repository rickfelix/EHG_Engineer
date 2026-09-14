// lib/michael/checkpoint-identity.mjs — resolves the Michael-scoped Twilio identity for
// scripts/michael/checkpoint-send.mjs. SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001 (FR-3/TR-6).
//
// WHY a separate module, not inline in the verb: keeps the "all three or null" rule in exactly one
// place, matching lib/messaging/providers/twilio-provider.js's own resolveTransportIdentity()
// seam it feeds. TESTING H4: a partial identity (e.g. sid+token set, messagingService unset) is
// NEVER "close enough" -- the provider would otherwise make a real authenticated POST with an
// empty MessagingServiceSid. Any subset short of all three resolves to null here, so the verb's
// caller-side check and the provider's own internal check are two independent enforcements of the
// same rule (defense in depth).
//
// Distinct env var NAMES from the fleet-lane TWILIO_* set (never the same names) is the whole
// point of FR-3: the provider reads TWILIO_* from process.env when no identity is passed, so
// reusing those names here would make revoking Michael also revoke Adam's chairman-SMS sends.

/**
 * @returns {{accountSid: string, authToken: string, messagingService: string} | null}
 */
export function resolveCheckpointIdentity() {
  const accountSid = process.env.MICHAEL_TWILIO_ACCOUNT_SID || '';
  const authToken = process.env.MICHAEL_TWILIO_AUTH_TOKEN || '';
  const messagingService = process.env.MICHAEL_TWILIO_MESSAGING_SERVICE || '';
  if (accountSid && authToken && messagingService) {
    return { accountSid, authToken, messagingService };
  }
  return null;
}
