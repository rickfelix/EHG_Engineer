/**
 * requires_human_action must name a decider — QF-20260727-858.
 *
 * THE DEFECT. `metadata.requires_human_action=true` fences an SD out of dispatch
 * (lib/fleet/claim-eligibility.cjs returns 'human_action_required'), but nothing required the row
 * to say WHO decides. Such a row documents THAT a human must act and not WHO, so it enters no
 * queue and simply ages — unroutable by construction, and invisible because it looks correctly
 * fenced.
 *
 * MEASURED 2026-07-27: 12 live non-terminal SDs carry the flag; 3 name a decider, 9 do not —
 * including two `critical` operating-company children (SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-B
 * and -001-C). The coordinator had already caught ONE instance by hand
 * (SD-LEO-INFRA-DOOR-ROUTING-INERT-DECIDE-001, fenced with the verbatim reason "THIS SD ASKS FOR A
 * DECISION AND NAMES NOBODY TO MAKE IT") — a correct catch that was never generalised, which is
 * what makes this a class rather than an oversight.
 *
 * WHY A WRITE-PATH GUARD RATHER THAN A READ-TIME CHECK: a read-time warning leaves the
 * unroutable row created and merely reports it later, which is how the previous single instance
 * was caught — once, by a human, after the fact. Refusing the WRITE means the state cannot exist.
 *
 * TWO KEYS ARE CANONICAL, BOTH READ. Measured across the 3 correct rows: `human_decider` (2) and
 * `decider` (1). New writes should prefer `human_decider`; `decider` stays accepted so this guard
 * does not reject rows that already follow the older convention.
 */

/** Both spellings in live use. Order = preference for new writes. */
export const DECIDER_KEYS = ['human_decider', 'decider'];

/** Truthy flag values seen in live data (boolean true and the string 'true'). */
export function isHumanActionRequested(value) {
  return value === true || value === 'true';
}

/** Does this metadata object name someone? Empty string / whitespace does NOT count. */
export function namedDecider(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  for (const k of DECIDER_KEYS) {
    const v = metadata[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Is this metadata patch allowed?
 *
 * Only constrains a patch that TURNS THE FLAG ON. Clearing it, leaving it alone, or writing any
 * other key is unaffected — the guard must not make ordinary metadata writes harder, or callers
 * will route around it.
 *
 * A decider already present on the row satisfies the pairing: re-stamping the flag on a row that
 * is already correctly routed is not the defect.
 *
 * @param {object} patch            keys being written
 * @param {object} [existing]       the row's current metadata, if known
 * @returns {{ok: boolean, reason?: string, decider?: string}}
 */
export function checkDeciderPairing(patch, existing = null) {
  if (!patch || typeof patch !== 'object') return { ok: true };
  if (!('requires_human_action' in patch)) return { ok: true };
  if (!isHumanActionRequested(patch.requires_human_action)) return { ok: true };

  const decider = namedDecider(patch) || namedDecider(existing);
  if (decider) return { ok: true, decider };

  return {
    ok: false,
    reason:
      'requires_human_action=true without a decider: set metadata.human_decider (e.g. "chairman") '
      + 'in the same write, or clear the flag. A fence that names nobody is unroutable — it enters '
      + 'no queue and ages silently (QF-20260727-858).',
  };
}
