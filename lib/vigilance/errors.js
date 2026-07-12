/**
 * Typed failure contract for the vigilance watcher framework — SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-F.
 *
 * Mirrors lib/creative/errors.js (Child D's provider-abstraction pattern): every adapter failure
 * is typed, never a silent empty/placeholder observation.
 */

export class AdapterNotConfiguredError extends Error {
  constructor(sourceKind) {
    super(`vigilance adapter not configured: ${sourceKind}`);
    this.name = 'AdapterNotConfiguredError';
    this.sourceKind = sourceKind;
    this.code = 'ADAPTER_NOT_CONFIGURED';
  }
}

export class ObservationRejectedError extends Error {
  constructor(reason, detail = {}) {
    super(`vigilance observation rejected: ${reason}`);
    this.name = 'ObservationRejectedError';
    this.reason = reason;
    this.detail = detail;
    this.code = 'OBSERVATION_REJECTED';
  }
}
