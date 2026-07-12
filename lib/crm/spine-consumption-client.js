// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-C: Relationship Engine satellite (FR-5)
// Consumes spine S-1 (roles/authority), S-2 (typed exception routing), S-3
// (objective/guard registry) via the interface contract in
// docs/design/operating-company-satellite-architecture-v1.md §2 — never re-derives
// this governance. SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B (spine-stub) is a sibling
// build; until it ships, calls route through the STUB implementation below (tracked
// follow-up: swap `useLiveSpine` to true once the real services land).
//
// STUB — do not treat as governance of record. Born-denied default preserved even
// in the stub so no code path silently becomes fail-open.

const useLiveSpine = false;

export async function checkAuthority(_roleKey, _action) {
  if (useLiveSpine) throw new Error('spine-consumption-client: live spine wiring not yet implemented');
  // Born-denied stub: deny unless explicitly overridden by a caller-supplied allowlist.
  return { authorized: false, source: 'stub', reason: 'spine-stub SD not yet live; born-denied default' };
}

export async function routeException(exceptionType, payload = {}) {
  if (useLiveSpine) throw new Error('spine-consumption-client: live spine wiring not yet implemented');
  // Routine pipeline events self-serve at venture-CEO tier per S-2; only the bounded
  // chairman-only set escalates. The stub conservatively routes everything to CEO tier
  // (never auto-escalates to chairman) until the real typed-routing table exists.
  return { routed_to: 'venture-ceo-tier', exception_type: exceptionType, payload, source: 'stub' };
}

export async function registerObjective(_satelliteKey, _objective, _guard) {
  if (useLiveSpine) throw new Error('spine-consumption-client: live spine wiring not yet implemented');
  return { registered: false, source: 'stub', reason: 'spine-stub SD not yet live; objective/guard registry unavailable' };
}
