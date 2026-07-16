/**
 * MessagingProvider contract — SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001 FR-2.
 *
 * The ONLY seam between lib/chairman/sms-bridge.js and any SMS vendor. Swapping
 * Twilio for Bandwidth/Telnyx later means writing a new module that satisfies
 * this shape — sms-bridge.js and every caller stay untouched.
 *
 * @typedef {Object} SendResult
 * @property {string} provider_message_id
 * @property {'queued'|'sent'|'failed'} status
 *
 * @typedef {Object} InboundMessage
 * @property {string} from - E.164 sender phone number
 * @property {string} to - E.164 recipient phone number
 * @property {string} body - raw untrusted reply text
 * @property {string} messageSid - provider message id
 *
 * @typedef {Object} StatusCallback
 * @property {string} messageSid
 * @property {'queued'|'sent'|'delivered'|'failed'|'undelivered'} status
 *
 * @typedef {Object} MessagingProvider
 * @property {(args: {to: string, body: string}) => Promise<SendResult>} send
 * @property {(args: {url: string, params: Record<string,string>, signature: string}) => boolean} verifyInboundSignature
 * @property {(body: Record<string,string>) => InboundMessage} normalizeInboundWebhook
 * @property {(body: Record<string,string>) => StatusCallback} parseStatusCallback
 */

const REQUIRED_METHODS = ['send', 'verifyInboundSignature', 'normalizeInboundWebhook', 'parseStatusCallback'];

/**
 * Asserts an object satisfies the MessagingProvider contract — used by tests to prove the
 * seam is swappable (any conforming fake can stand in for the real Twilio implementation).
 * @param {Object} provider
 * @returns {{valid: boolean, missing: string[]}}
 */
export function isMessagingProvider(provider) {
  const missing = REQUIRED_METHODS.filter((m) => typeof provider?.[m] !== 'function');
  return { valid: missing.length === 0, missing };
}

export { REQUIRED_METHODS };
