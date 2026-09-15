/**
 * MAST FM-2.4 (FC2 Inter-Agent Misalignment): information withholding. Direct representation,
 * CROSS-ENTITY (sender + receiver, per FR-2 AC-4) -- a handoff's payload must include every field
 * the receiver declared it needs (receiver_declared_needs); a payload missing a declared-needed
 * field is the sender withholding information from the receiver.
 *
 * checkEach() exposes a per-handoff verdict (not just the aggregate) so a discrimination test can
 * prove the check correctly distinguishes a broken handoff from a well-formed one in the SAME
 * fixture, per this session's single-candidate mutation-testing gotcha.
 */
export const id = 'fm-2-4';
export const mastCode = 'FM-2.4';
export const category = 'FC2';
export const label = 'information withholding';
export const proxy = false;

export function checkEach(organization) {
  const handoffs = organization?.handoffs ?? [];
  return handoffs.map((handoff) => {
    const needs = handoff?.receiver_declared_needs ?? [];
    const payload = handoff?.payload ?? {};
    const missing = needs.filter((field) => !(field in payload));
    if (missing.length > 0) {
      return { handoff_id: handoff.id, passed: false, reason: `handoff "${handoff.id}" withholds fields [${missing.join(', ')}] the receiver "${handoff.receiver_role}" declared it needs` };
    }
    return { handoff_id: handoff.id, passed: true };
  });
}

export function check(organization) {
  const perHandoff = checkEach(organization);
  const failed = perHandoff.find((r) => !r.passed);
  if (failed) return { passed: false, reason: failed.reason };
  return { passed: true };
}
