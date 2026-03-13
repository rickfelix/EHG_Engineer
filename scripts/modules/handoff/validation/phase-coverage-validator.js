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

  const sdList = sds || [];
  const sdKeys = new Set(sdList.map(sd => sd.sd_key));
  const covered = [];
  const uncovered = [];

  for (const phase of phases) {
    const assignedSd = phase.covered_by_sd_key;
    if (assignedSd && sdKeys.has(assignedSd)) {
      const sd = sdList.find(s => s.sd_key === assignedSd);
      covered.push({ phase, sd_key: assignedSd, sd_title: sd?.title || assignedSd });
    } else if (assignedSd) {
      // covered_by_sd_key is set but the SD doesn't exist in the linked SDs list
      // Still count as covered if the key is populated (SD may exist outside this arch plan)
      covered.push({ phase, sd_key: assignedSd, sd_title: assignedSd });
    } else {
      // No explicit covered_by_sd_key — try auto-matching to a child SD
      const match = autoMatchPhaseToSd(phase, sdList);
      if (match) {
        covered.push({ phase, sd_key: match.sd_key, sd_title: match.title || match.sd_key, auto_matched: true });
      } else {
        uncovered.push({ phase });
      }
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
 * Auto-match a phase to an SD when covered_by_sd_key is not set.
 * Uses child designation suffix matching (e.g., phase.child_designation or phase number → "-A", "-B")
 * and title similarity as fallback.
 * @param {Object} phase - Architecture plan phase
 * @param {Object[]} sds - Available SDs
 * @returns {Object|null} Matched SD or null
 */
function autoMatchPhaseToSd(phase, sds) {
  if (!sds || sds.length === 0) return null;

  // Strategy 1: Match by child_designation field on the phase
  // e.g., phase.child_designation = "A" matches SD key ending in "-A" or "-001-A"
  if (phase.child_designation) {
    const suffix = `-${phase.child_designation.toUpperCase()}`;
    const match = sds.find(sd => sd.sd_key && sd.sd_key.toUpperCase().endsWith(suffix));
    if (match) return match;
  }

  // Strategy 2: Match by phase number → child letter (Phase 1 → A, Phase 2 → B, etc.)
  if (phase.number && typeof phase.number === 'number' && phase.number >= 1 && phase.number <= 26) {
    const letter = String.fromCharCode(64 + phase.number); // 1→A, 2→B, etc.
    const suffix = `-${letter}`;
    const match = sds.find(sd => sd.sd_key && sd.sd_key.toUpperCase().endsWith(suffix));
    if (match) return match;
  }

  // Strategy 3: Fuzzy title matching — normalize and check overlap
  if (phase.title) {
    const phaseWords = normalizeForMatch(phase.title);
    let bestMatch = null;
    let bestScore = 0;

    for (const sd of sds) {
      if (!sd.title) continue;
      const sdWords = normalizeForMatch(sd.title);
      const score = wordOverlapScore(phaseWords, sdWords);
      if (score > bestScore && score >= 0.4) { // 40% word overlap threshold
        bestScore = score;
        bestMatch = sd;
      }
    }

    if (bestMatch) return bestMatch;
  }

  return null;
}

/**
 * Normalize a string for fuzzy matching: lowercase, split into significant words.
 */
function normalizeForMatch(text) {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'of', 'to', 'in', 'with', 'on', 'at', 'by', 'sd', 'phase']);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Calculate word overlap score between two word arrays.
 * Returns 0.0-1.0 based on Jaccard-like similarity.
 */
function wordOverlapScore(wordsA, wordsB) {
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  let overlap = 0;
  for (const w of setA) {
    if (setB.has(w)) overlap++;
  }
  const minSize = Math.min(setA.size, setB.size);
  return minSize > 0 ? overlap / minSize : 0;
}

/**
 * Backward reconciliation: detect child SDs that claim to implement a phase
 * not present in the architecture plan. These are "orphan" children created
 * from phantom phases (e.g., phases that were removed after plan amendment).
 *
 * SD-LEO-INFRA-ORCHESTRATOR-SCOPE-GOVERNANCE-001 (FR-003)
 *
 * @param {Object[]} phases - From eva_architecture_plans.sections.implementation_phases
 * @param {Object[]} childSds - Child SDs of the orchestrator
 * @returns {Object} Reconciliation report with orphans array
 */
export function detectOrphanChildren(phases, childSds) {
  if (!childSds || childSds.length === 0) {
    return { orphans: [], checkedCount: 0 };
  }

  const phaseNumbers = new Set((phases || []).map(p => p.number));
  const phaseTitles = new Set((phases || []).map(p => normalizeForMatch(p.title).join(' ')));
  const orphans = [];

  for (const sd of childSds) {
    // Extract phase reference from SD title or metadata
    const phaseMatch = sd.title?.match(/Phase\s+(\d+)/i);
    if (phaseMatch) {
      const refNum = parseInt(phaseMatch[1], 10);
      if (!phaseNumbers.has(refNum)) {
        orphans.push({
          sd_key: sd.sd_key,
          title: sd.title,
          status: sd.status,
          referenced_phase: refNum,
          reason: `References Phase ${refNum} which does not exist in the architecture plan`
        });
        continue;
      }
    }

    // Check letter-suffix children (e.g., SD-XXX-001-C for Phase 3)
    const letterMatch = sd.sd_key?.match(/-([A-Z])$/);
    if (letterMatch) {
      const letterIndex = letterMatch[1].charCodeAt(0) - 64; // A=1, B=2, etc.
      if (letterIndex > 0 && !phaseNumbers.has(letterIndex) && phases && phases.length > 0) {
        orphans.push({
          sd_key: sd.sd_key,
          title: sd.title,
          status: sd.status,
          referenced_phase: letterIndex,
          reason: `Suffix -${letterMatch[1]} implies Phase ${letterIndex} which does not exist in the architecture plan`
        });
      }
    }
  }

  return { orphans, checkedCount: childSds.length };
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

  for (const { phase, sd_key, sd_title, auto_matched } of report.covered) {
    const designation = phase.child_designation === 'separate_orchestrator' ? ' (separate orchestrator)' : '';
    const matchType = auto_matched ? ' (auto-matched)' : '';
    lines.push(`   ✅ Phase ${phase.number}: ${phase.title} → ${sd_key}${designation}${matchType}`);
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
