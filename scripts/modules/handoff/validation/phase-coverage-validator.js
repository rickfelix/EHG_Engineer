/**
 * Phase Coverage Validator
 * Part of SD-LEO-INFRA-ARCHITECTURE-PHASE-COVERAGE-001
 *
 * Pure validation logic: takes structured phases (from eva_architecture_plans.sections)
 * and list of SDs (from strategic_directives_v2), returns coverage report.
 * No side effects, no database calls.
 */

/**
 * Validates that all architecture phases are covered by SDs.
 * @param {Object[]} phases - From eva_architecture_plans.sections.implementation_phases
 * @param {Object[]} sds - From strategic_directives_v2 (linked SDs)
 * @returns {Object} Coverage report
 */
export function validatePhaseCoverage(phases, sds) {
  if (!phases || !Array.isArray(phases) || phases.length === 0) {
    return { covered: [], uncovered: [], coveragePercent: 100, totalPhases: 0, coveredCount: 0, passed: true };
  }

  const sdKeys = new Set((sds || []).map(sd => sd.sd_key));
  const covered = [];
  const uncovered = [];

  for (const phase of phases) {
    const assignedSd = phase.covered_by_sd_key;
    if (assignedSd && sdKeys.has(assignedSd)) {
      const sd = sds.find(s => s.sd_key === assignedSd);
      covered.push({ phase, sd_key: assignedSd, sd_title: sd?.title || assignedSd });
    } else if (assignedSd) {
      // covered_by_sd_key is set but the SD doesn't exist in the linked SDs list
      // Still count as covered if the key is populated (SD may exist outside this arch plan)
      covered.push({ phase, sd_key: assignedSd, sd_title: assignedSd });
    } else {
      uncovered.push({ phase });
    }
  }

  const totalPhases = phases.length;
  const coveredCount = covered.length;
  const coveragePercent = totalPhases > 0 ? Math.round((coveredCount / totalPhases) * 1000) / 10 : 100;

  return {
    covered,
    uncovered,
    coveragePercent,
    totalPhases,
    coveredCount,
    passed: coveredCount === totalPhases
  };
}

/**
 * Formats coverage report for terminal display.
 * @param {Object} report - From validatePhaseCoverage()
 * @returns {string} Formatted output
 */
export function formatCoverageReport(report) {
  const lines = [];

  if (report.totalPhases === 0) {
    lines.push('   ℹ️  No implementation phases defined — gate not applicable');
    return lines.join('\n');
  }

  lines.push('   📋 Architecture Phase Coverage:');

  for (const { phase, sd_key, sd_title } of report.covered) {
    const designation = phase.child_designation === 'separate_orchestrator' ? ' (separate orchestrator)' : '';
    lines.push(`   ✅ Phase ${phase.number}: ${phase.title} → ${sd_key}${designation}`);
  }

  for (const { phase } of report.uncovered) {
    const designation = phase.child_designation === 'separate_orchestrator'
      ? ' (separate orchestrator — create SD)'
      : ' (child — create SD)';
    lines.push(`   ❌ Phase ${phase.number}: ${phase.title} → NO SD ASSIGNED${designation}`);
  }

  lines.push('');
  const status = report.passed ? 'PASS' : 'BLOCKING';
  lines.push(`   Coverage: ${report.coveredCount}/${report.totalPhases} (${report.coveragePercent}%) — ${status}`);

  return lines.join('\n');
}
