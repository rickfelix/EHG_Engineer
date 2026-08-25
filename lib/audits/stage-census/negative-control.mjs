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
