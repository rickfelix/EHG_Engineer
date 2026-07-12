// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (FR-1) — typed generation-failure contract.
// Async provider task handling is first-class: a failure is always this shape, never a
// silent empty/placeholder asset (the fail-toward-flattery ban, per the design spec §2).

export class TaskFailedError extends Error {
  constructor(message, { provider, capability, code, cause } = {}) {
    super(message);
    this.name = 'TaskFailedError';
    this.provider = provider;
    this.capability = capability;
    this.code = code || 'TASK_FAILED';
    if (cause) this.cause = cause;
  }
}

// Thrown when a capability/provider pairing is registered but has no usable credential yet
// (e.g. RunwayML before the chairman's account+API-key walkthrough) — distinct from a
// runtime TaskFailedError so callers can distinguish "not configured" from "attempted and failed".
export class ProviderNotConfiguredError extends Error {
  constructor(provider, capability) {
    super(`Provider "${provider}" for capability "${capability}" is registered but has no configured credential`);
    this.name = 'ProviderNotConfiguredError';
    this.provider = provider;
    this.capability = capability;
    this.code = 'PROVIDER_NOT_CONFIGURED';
  }
}
