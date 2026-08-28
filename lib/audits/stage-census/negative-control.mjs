/**
 * Negative-control assertion for the stage 21-26 census (SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A, FR-2).
 *
 * The two rows below are the ALREADY-LIVE, deliberate stage 21/22 component_path swap from
 * database/migrations/20260607_swap_stage_21_22_full_content.sql:126,139 (verified by Explore,
 * see strategic_directives_v2.metadata.mechanism_verifications on this SD). If a census run does
 * not surface both, the instrument itself is unproven -- a naive-regex census could otherwise
 * report a clean, zero-finding sweep while being blind (VALIDATION reproduced exactly this live).
 */
export const KNOWN_NEGATIVE_CONTROL_ROWS = Object.freeze([
  Object.freeze({ stage_number: 21, component_path: 'Stage22DistributionSetup.tsx' }),
  Object.freeze({ stage_number: 22, component_path: 'Stage21VisualAssets.tsx' }),
]);

/**
 * @param {Array<{stage_number:number, component_path:string}>} findings
 * @returns {{ok: true, matched: Array}}
 * @throws {Error} if either known-live row is absent from findings
 */
export function assertNegativeControl(findings) {
  const list = Array.isArray(findings) ? findings : [];
  const missing = KNOWN_NEGATIVE_CONTROL_ROWS.filter(
    (expected) => !list.some(
      (f) => Number(f?.stage_number) === expected.stage_number && f?.component_path === expected.component_path
    )
  );
  if (missing.length > 0) {
    throw new Error(
      `NEGATIVE_CONTROL_FAILED: ${missing.length} known-live mismatch row(s) not found in census findings: ` +
      missing.map((m) => `stage_number=${m.stage_number}->${m.component_path}`).join('; ')
    );
  }
  return { ok: true, matched: KNOWN_NEGATIVE_CONTROL_ROWS };
}

/**
 * Negative-control floor for the CHECK-constraint sweep (SD-LEO-INFRA-STAGE-KEYED-DATA-001, FR-2).
 *
 * A different failure shape than the component_path swap above: that control proves the sweep can
 * find a KNOWN MISMATCH; this one proves the CHECK-constraint sweep can find a KNOWN VOLUME. RISK
 * sub-agent evidence (c210515c-450d-4512-a078-482e07e71cab) and DATABASE sub-agent evidence
 * (a8d682bd-7681-4ea4-8851-19ce8bcddb3d) both independently measured >=18 live CHECK constraints
 * whose definition contains the literal '26' on 2026-08-25/26. A sweepCheckConstraintsContainingLiteral
 * run that returns fewer than this floor did not silently fail closed (0 rows, no error) -- it is
 * caught here, the same false-pass shape VALIDATION reproduced for the \\d/\\m regex degradation,
 * but for a LIKE-predicate instrument instead of a regex one.
 */
export const CHECK_CONSTRAINT_LITERAL_26_FLOOR = 18;

/**
 * @param {Array<{table_name:string, constraint_name:string, definition:string}>} findings
 * @param {number} [floor=CHECK_CONSTRAINT_LITERAL_26_FLOOR]
 * @returns {{ok: true, count: number}}
 * @throws {Error} if findings.length < floor
 */
export function assertCheckConstraintFloor(findings, floor = CHECK_CONSTRAINT_LITERAL_26_FLOOR) {
  const list = Array.isArray(findings) ? findings : [];
  if (list.length < floor) {
    throw new Error(
      `NEGATIVE_CONTROL_FAILED: CHECK-constraint sweep for literal '26' returned ${list.length} row(s), ` +
      `below the ${floor}-row floor measured live on 2026-08-25/26 by RISK+DATABASE sub-agent evidence. ` +
      `The sweep likely regressed to a silent zero-match state.`
    );
  }
  return { ok: true, count: list.length };
}
