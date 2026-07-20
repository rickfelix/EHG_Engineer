// @wire-check-exempt: foundation desired-state manifest (SD-A fleet-launcher substrate). Pure
// drift core built first; the coordinator-audit consumer (computeManifestDrift over live counts)
// is the activation follow-up. Consumed today by its unit tests.
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

// ---------------------------------------------------------------------------
// DESIRED-STATE SLOT SCHEMA — SD-LEO-INFRA-LEO-COMPLETION-001-B (FR-1/FR-2).
//
// Solomon checkpoint-1 REQUIRED amendment (FR-3, cited verbatim): "the manifest
// [must be] DESIRED state: the chairman-editable slot list (name/color/role/
// account_profile/model/effort/worktree) that reboot-respawn spawns FROM and
// that the reconciliation loop diffs AGAINST the registry." Plus resume_uuid
// per the sibling FR-4 (respawn resume-consumer wiring, owned by Child D).
//
// These are NEW, additive exports. The three {role,min} functions above are
// UNTOUCHED — lib/fleet/session-registry-adapter.js is a live runtime consumer
// of their exact current signature/shape (SD-B validation finding), so this
// SD adds a parallel slot-keyed schema rather than mutating the drift core.
// ---------------------------------------------------------------------------

/**
 * Normalize a desired-state slot list. Each slot is chairman-editable and keyed by `name` (the
 * stable identifier reboot-respawn and the reconciliation loop diff against). Slots without a
 * name are dropped — name is the one required field, everything else defaults to null so a
 * partially-specified slot is still representable (and diffable) rather than rejected outright.
 * @param {Array<{name?:string, color?:string, role?:string, account_profile?:string, model?:string, effort?:string, worktree?:string, resume_uuid?:string}>} desired
 * @returns {Array<{name:string, color:string|null, role:string|null, account_profile:string|null, model:string|null, effort:string|null, worktree:string|null, resume_uuid:string|null}>}
 */
export function normalizeDesiredSlots(desired = []) {
  return (Array.isArray(desired) ? desired : [])
    .map((d) => ({
      name: (d && d.name) || null,
      color: (d && d.color) || null,
      role: (d && d.role) || null,
      account_profile: (d && d.account_profile) || null,
      model: (d && d.model) || null,
      effort: (d && d.effort) || null,
      worktree: (d && d.worktree) || null,
      resume_uuid: (d && d.resume_uuid) || null,
    }))
    .filter((s) => s.name);
}

/**
 * Compute DRIFT of the actual live fleet vs the DESIRED slot list, keyed by slot `name` (not role —
 * multiple slots may share a role, e.g. two "worker" slots with different names/accounts). A desired
 * slot with no matching actual entry is MISSING; a matching entry is present (drift-free on presence;
 * field-level mismatch is surfaced separately for the reconciliation loop to act on). Extra actual
 * entries not in the desired list are surfaced as unexpected, mirroring computeManifestDrift's shape.
 * @param {{ desired?: Array<object>, actualByKey?: Record<string, {name?:string, color?:string, role?:string, account_profile?:string, model?:string, effort?:string, worktree?:string, resume_uuid?:string}> }} input
 * @returns {{ drift:boolean, missing:Array<{name:string}>, present:Array<{name:string, mismatches:string[]}>, unexpected:string[] }}
 */
export function computeSlotDrift({ desired = [], actualByKey = {} } = {}) {
  const norm = normalizeDesiredSlots(desired);
  const desiredNames = new Set(norm.map((d) => d.name));
  const FIELDS = ['color', 'role', 'account_profile', 'model', 'effort', 'worktree', 'resume_uuid'];
  const missing = [];
  const present = [];
  for (const d of norm) {
    const actual = actualByKey[d.name];
    if (!actual) { missing.push({ name: d.name }); continue; }
    const mismatches = FIELDS.filter((f) => (actual[f] || null) !== (d[f] || null));
    present.push({ name: d.name, mismatches });
  }
  const unexpected = Object.keys(actualByKey || {}).filter((name) => !desiredNames.has(name));
  return { drift: missing.length > 0, missing, present, unexpected };
}
