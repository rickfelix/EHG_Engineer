/**
 * Fleet session-manifest SSOT — SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001 (FR-3).
 *
 * Per the coordinator design review (APPROVE + required amendment: "manifest = DESIRED state, U6/G1"):
 * the manifest declares the TARGET fleet session set — what the fleet SHOULD be (e.g. one live
 * coordinator, one live Adam, and N live workers) — NOT a passive view of whatever happens to be
 * alive. Pairing the desired manifest with the ACTUAL live set (counts derived from the session-
 * registry SSOT, FR-1) yields observable DRIFT: the manifest is the source of truth for the intended
 * fleet shape, and any shortfall (a missing/under-provisioned role) is surfaced, never silent.
 *
 * PURE CORE (data-in / verdict-out, no DB) so both the manifest normalization and the drift
 * computation are unit-testable without a database; a thin adapter supplies the desired manifest
 * (config/roadmap) and the actual per-role live counts.
 */

/**
 * Normalize desired-manifest entries to { role, min } where `min` is the minimum number of live
 * sessions DESIRED for that role (defaults to 1). Entries without a role are dropped.
 * @param {Array<{role?:string, min?:number}>} desired
 * @returns {Array<{role:string, min:number}>}
 */
export function normalizeDesiredManifest(desired = []) {
  return (Array.isArray(desired) ? desired : [])
    .map((d) => ({ role: (d && d.role) || null, min: d && Number.isFinite(d.min) && d.min > 0 ? d.min : 1 }))
    .filter((d) => d.role);
}

/**
 * Compute DRIFT of the actual live fleet vs the DESIRED manifest. A role whose live count is below
 * its desired minimum is UNDER-provisioned (drift); at/above is satisfied. Extra live roles not in
 * the manifest are surfaced separately (unexpected) but do not, by themselves, constitute a shortfall.
 * @param {{ desired?: Array<{role:string,min?:number}>, actualByRole?: Record<string,number> }} input
 * @returns {{ drift:boolean, under:Array<{role:string,desired:number,actual:number}>, satisfied:Array<{role:string,actual:number}>, unexpected:string[] }}
 */
export function computeManifestDrift({ desired = [], actualByRole = {} } = {}) {
  const norm = normalizeDesiredManifest(desired);
  const desiredRoles = new Set(norm.map((d) => d.role));
  const under = [];
  const satisfied = [];
  for (const d of norm) {
    const actual = Number(actualByRole[d.role]) || 0;
    if (actual < d.min) under.push({ role: d.role, desired: d.min, actual });
    else satisfied.push({ role: d.role, actual });
  }
  const unexpected = Object.keys(actualByRole || {})
    .filter((role) => !desiredRoles.has(role) && (Number(actualByRole[role]) || 0) > 0);
  return { drift: under.length > 0, under, satisfied, unexpected };
}

/**
 * Human/remediation summary of a drift verdict (for a coordinator advisory / audit line).
 * @param {ReturnType<typeof computeManifestDrift>} verdict
 * @returns {{ detail:string, remediation:string|null }}
 */
export function summarizeManifestDrift(verdict) {
  if (!verdict || !verdict.drift) {
    return { detail: `fleet matches desired manifest (${(verdict && verdict.satisfied.length) || 0} role(s) satisfied)`, remediation: null };
  }
  const gaps = verdict.under.map((u) => `${u.role}: ${u.actual}/${u.desired}`).join(', ');
  return {
    detail: `fleet DRIFT vs desired manifest — under-provisioned: ${gaps}`,
    remediation: `ACTION: spawn/route sessions to satisfy the desired manifest roles: ${verdict.under.map((u) => u.role).join(', ')}`,
  };
}
