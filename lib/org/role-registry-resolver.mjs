/**
 * SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001 (FR-5): pure, DB-independent functions proving
 * lossless equivalence between STANDARD_VENTURE_TEMPLATE (the JS constant,
 * lib/agents/venture-ceo-factory.js:44) and the three-layer versioned registry design
 * (org_role_base_versions / org_role_venture_overlays / org_role_venture_pins -- see the
 * chairman-gated migrations under database/chairman-gated/20260914_org_role_registry_*.sql,
 * NOT yet created; R1 ceremony pending).
 *
 * templateToBaseRows() derives what a first-ever "adopt the 28 roles into the registry" seed
 * would write as base version 1 rows -- structure/function/norms per role, split by the same
 * three-layer boundary Solomon design v2 section 3.2 defines. resolveVentureRoles() reconstructs
 * the {ceo, executives[], crews[], budget_distribution} shape instantiateVenture() needs, given
 * base rows + (optional) overlay rows + a pin, for a specific venture.
 *
 * Neither function touches a database. This SD does not wire either into instantiateVenture()
 * (TR-2) -- the equivalence proof is a round-trip test: template -> base rows -> resolved shape,
 * asserting nothing is lost, not a live caller switch.
 */
'use strict';

/**
 * Every field STANDARD_VENTURE_TEMPLATE's ceo/executives/crews entries may carry. A field
 * legitimately absent on a given role must stay absent after the round-trip -- collapsing
 * "absent" and "empty" here would silently pass the exact hazard VALIDATION flagged (LEAD phase):
 * a NOT NULL DEFAULT column masking a real drift.
 */
// SD-LEO-INFRA-REMOVE-EVERY-BINDING-001 (chairman ruling deb0818c): stage_ownership removed
// from STANDARD_VENTURE_TEMPLATE and dropped from this list -- no venture AI agent is bound
// to a pre-go-live workflow stage, so this layer-split has nothing left to route for that key.
const ROLE_FIELD_KEYS = [
  'agent_role', 'display_name_template', 'capabilities', 'tools', 'token_budget',
  'executive_parent', 'honest_idle', 'duty_cycle',
  'post_stage_mandate', 'delegation_authority',
];

/** Split one role entry (ceo/executive/crew) into {structure, function, norms} per section 3.2. */
function splitRoleLayers(roleEntry) {
  const structure = {};
  const fn = {};
  const norms = {};

  for (const key of ROLE_FIELD_KEYS) {
    if (!(key in roleEntry)) continue; // preserve absence -- do NOT default to null/[]/{}

    switch (key) {
      // STRUCTURE: identity, reporting.
      case 'agent_role':
      case 'display_name_template':
      case 'executive_parent':
        structure[key] = roleEntry[key];
        break;
      // FUNCTION: how the role does its work -- skills/tools/cadence/mandate.
      case 'capabilities':
      case 'tools':
      case 'honest_idle':
      case 'duty_cycle':
      case 'post_stage_mandate':
        fn[key] = roleEntry[key];
        break;
      // NORMS: budget and self-change authority -- chairman-owned.
      case 'token_budget':
      case 'delegation_authority':
        norms[key] = roleEntry[key];
        break;
      default:
        throw new Error(`splitRoleLayers: unhandled field "${key}" -- add it to a layer bucket explicitly`);
    }
  }

  return { structure, function: fn, norms };
}

/**
 * Derive base version-1 row data for all 28 roles from STANDARD_VENTURE_TEMPLATE. Returns plain
 * objects shaped like org_role_base_versions rows (minus DB-generated columns: id/created_at).
 * @param {object} template STANDARD_VENTURE_TEMPLATE (or an equivalently-shaped object)
 * @returns {Array<{role_key: string, version: number, status: string, structure: object, function: object, norms: object}>}
 */
export function templateToBaseRows(template) {
  const rows = [];

  const ceoLayers = splitRoleLayers(template.ceo);
  rows.push({ role_key: 'venture_ceo', version: 1, status: 'active', ...ceoLayers });

  for (const exec of template.executives) {
    const layers = splitRoleLayers(exec);
    rows.push({ role_key: exec.agent_role, version: 1, status: 'active', ...layers });
  }

  for (const crew of template.crews) {
    const layers = splitRoleLayers(crew);
    rows.push({ role_key: crew.agent_role, version: 1, status: 'active', ...layers });
  }

  return rows;
}

/** Recombine one base row's three layers back into a flat role-entry shape (inverse of splitRoleLayers). */
function mergeRoleLayers(baseRow, overlayRow) {
  const merged = {};
  // Overlay (structure+function only) wins over base for the keys it supplies -- this is the
  // ONLY place an overlay's content is allowed to take precedence; norms never has an overlay
  // counterpart to even consider.
  Object.assign(merged, baseRow.structure, baseRow.function, baseRow.norms);
  if (overlayRow) {
    if (overlayRow.structure) Object.assign(merged, overlayRow.structure);
    if (overlayRow.function) Object.assign(merged, overlayRow.function);
  }
  return merged;
}

/**
 * Reconstruct the {ceo, executives[], crews[], budget_distribution} shape instantiateVenture()
 * needs, from base rows + optional overlay rows + a pin, for one venture.
 * @param {Array} baseRows from templateToBaseRows() (or a live org_role_base_versions read)
 * @param {Array} overlayRows rows scoped to this ventureId (may be empty)
 * @param {{role_key: string, base_version: number, overlay_version: number|null}[]} pins
 * @param {string} ventureId unused directly (pins/overlays are pre-scoped by the caller) -- kept
 *   for call-site clarity and parity with a future live-DB resolver's signature.
 * @param {object} budgetDistribution template.budget_distribution -- portfolio-level, not
 *   per-role, so it is passed through rather than derived from any row here (out of FR-1..FR-4's
 *   per-role scope; a future SD may version it too).
 * @returns {{ceo: object, executives: object[], crews: object[], budget_distribution: object}}
 */
export function resolveVentureRoles(baseRows, overlayRows, pins, ventureId, budgetDistribution) {
  // Adversarial review finding (deep-tier /ship review): the original version derived the
  // executive/crew role lists from ALL of baseRows, with no dedup. baseRows legitimately holds
  // MULTIPLE rows per role_key (an active row plus any superseded/draft/deprecated history --
  // org_role_base_versions' schema explicitly supports this), so an unfiltered read (e.g. a
  // future caller's `SELECT * FROM org_role_base_versions`) produced duplicate entries in
  // executives[]/crews[]. `pins` is the correct source for "which roles does this venture
  // actually have" -- it is UNIQUE(role_key, venture_id) by construction (FR-3), so deriving the
  // role SET from pins, not from baseRows, is dedup-safe by schema guarantee rather than by an
  // ad hoc filter here.
  const overlayByKey = new Map(overlayRows.map((o) => [`${o.role_key}::${o.version}`, o]));
  const baseByKey = new Map(baseRows.map((b) => [`${b.role_key}::${b.version}`, b]));

  function resolveOne(roleKey, pin) {
    const base = baseByKey.get(`${roleKey}::${pin.base_version}`);
    if (!base) throw new Error(`resolveVentureRoles: no base row for role_key="${roleKey}" version=${pin.base_version}`);
    let overlay = null;
    if (pin.overlay_version != null) {
      overlay = overlayByKey.get(`${roleKey}::${pin.overlay_version}`);
      // Adversarial review finding: a pin pointing at a missing overlay row previously fell
      // through silently (Map.get returns undefined, the `if (overlayRow)` check in
      // mergeRoleLayers just skips it) and resolved as base-only with no error -- indistinguishable
      // from a venture that genuinely has no overlay. A pin that NAMES an overlay_version must
      // find that row, or the data is inconsistent and resolution must fail loud, not silently
      // degrade.
      if (!overlay) {
        throw new Error(`resolveVentureRoles: pin for role_key="${roleKey}" names overlay_version=${pin.overlay_version} but no matching overlay row exists`);
      }
    }
    return mergeRoleLayers(base, overlay);
  }

  const ceoPin = pins.find((p) => p.role_key === 'venture_ceo');
  if (!ceoPin) throw new Error('resolveVentureRoles: no pin for role_key="venture_ceo"');
  const ceoBase = baseByKey.get(`venture_ceo::${ceoPin.base_version}`);
  if (!ceoBase) throw new Error(`resolveVentureRoles: no base row for role_key="venture_ceo" version=${ceoPin.base_version}`);

  // executives are distinguished from crews SOLELY by the absence of executive_parent (structure);
  // crews always carry it. This mirrors the source template's own shape exactly -- it is not a
  // heuristic invented here, it is the one distinguishing field the template itself uses.
  // Classification reads the role's OWN pinned base row (not an arbitrary baseRows entry), so it
  // is version-consistent with what resolveOne() will actually return for that role.
  const nonCeoPins = pins.filter((p) => p.role_key !== 'venture_ceo');
  const executivePins = [];
  const crewPins = [];
  for (const pin of nonCeoPins) {
    const base = baseByKey.get(`${pin.role_key}::${pin.base_version}`);
    if (!base) throw new Error(`resolveVentureRoles: no base row for role_key="${pin.role_key}" version=${pin.base_version}`);
    if ('executive_parent' in base.structure) crewPins.push(pin);
    else executivePins.push(pin);
  }

  return {
    ceo: resolveOne('venture_ceo', ceoPin),
    executives: executivePins.map((pin) => resolveOne(pin.role_key, pin)),
    crews: crewPins.map((pin) => resolveOne(pin.role_key, pin)),
    budget_distribution: budgetDistribution,
  };
}

export { ROLE_FIELD_KEYS };
