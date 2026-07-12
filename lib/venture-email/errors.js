/**
 * Typed errors for the venture-email provisioning leg.
 * SD-LEO-FEAT-PROVISION-VENTURE-EMAIL-001 — follows the lib/vigilance/errors.js /
 * lib/creative/errors.js precedent (DESIGN review d1793007, recommendation 3).
 *
 * Taxonomy: absent credentials are NOT errors (adapters return null → plan-mode);
 * these classes cover conditions that must fail LOUD with a machine-readable name.
 */

/** A sequence-send attempted without a capture-record reference (Resend AUP witness, FR-7). */
export class AupWitnessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AupWitnessError';
  }
}

/** RESEND_API_KEY present but lacks the domain-management scope (send ≠ domains:write). */
export class ResendScopeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ResendScopeError';
  }
}

/** A state transition lost the optimistic-CAS race or found an invalid stored state. */
export class ProvisioningStateError extends Error {
  constructor(message, { domain, expected, found } = {}) {
    super(message);
    this.name = 'ProvisioningStateError';
    this.domain = domain;
    this.expected = expected;
    this.found = found;
  }
}

/** Bounded verify-poll exhausted without the domain reaching verified (resumable, not terminal). */
export class VerifyPollTimeoutError extends Error {
  constructor(message, { domain, attempts } = {}) {
    super(message);
    this.name = 'VerifyPollTimeoutError';
    this.domain = domain;
    this.attempts = attempts;
  }
}
