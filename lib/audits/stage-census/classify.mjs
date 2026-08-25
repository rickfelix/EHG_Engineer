/**
 * Generated-vs-handwritten classification for stage-census findings (FR-4).
 *
 * Two stage-number surfaces are regenerable from a source-of-truth script:
 * venture_stages.stage_number and lifecycle_stage_config.stage_number are both rebuilt by
 * scripts/generate-stage-config.cjs. A finding on either is generated-from-SSOT; everything
 * else (application code literals, migration files, protocol docs, etc.) is hand-written and
 * needs manual follow-up during the actual renumber.
 */
export const SSOT_GENERATED_SURFACES = Object.freeze([
  { table: 'venture_stages', column: 'stage_number', regen_script: 'scripts/generate-stage-config.cjs' },
  { table: 'lifecycle_stage_config', column: 'stage_number', regen_script: 'scripts/generate-stage-config.cjs' },
]);

/**
 * @param {{table?: string, column?: string, file?: string}} finding
 * @returns {{label: 'generated-from-ssot'|'hand-written', rationale: string}}
 */
export function classifyFinding(finding) {
  const match = SSOT_GENERATED_SURFACES.find(
    (s) => s.table === finding?.table && s.column === finding?.column
  );
  if (match) {
    return {
      label: 'generated-from-ssot',
      rationale: `${match.table}.${match.column} is rebuilt by ${match.regen_script}; a stage-number drift here is auto-fixable by re-running the regen script, not a manual edit.`,
    };
  }
  return {
    label: 'hand-written',
    rationale: finding?.file
      ? `${finding.file} is not covered by any known SSOT regen script -- a real renumber risk requiring manual follow-up.`
      : 'No known SSOT regen script covers this surface -- a real renumber risk requiring manual follow-up.',
  };
}
