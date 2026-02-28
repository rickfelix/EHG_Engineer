/**
 * Doc-Audit Reporter — Output formatting for doc health audit
 *
 * Matches existing box-border patterns used by docmon/reporter and sd-next display.
 * Supports console (pretty) and JSON output modes.
 *
 * Used by:
 *   scripts/eva/doc-health-audit.mjs  (entry point)
 */

import { letterGrade, GRADE_THRESHOLDS, THRESHOLD_ACTIONS } from './rubric.js';

// ─── Console Report (full dimension table) ──────────────────────────────────

/**
 * Print the full audit report to stdout.
 * @param {{ dimensions: DimensionScore[], totalScore: number, thresholdAction: string }} scoreResult
 * @param {{ fileCount: number, dirCount: number }} stats
 */
export function printReport(scoreResult, stats) {
  const { dimensions, totalScore, thresholdAction } = scoreResult;

  console.log('');
  console.log('\u2550'.repeat(59));
  console.log('  DOCUMENTATION HEALTH AUDIT');
  console.log('\u2550'.repeat(59));
  console.log('  Mode: SCORE');
  console.log(`  Files scanned: ${stats.fileCount}`);
  console.log(`  Directories: ${stats.dirCount}`);
  console.log('');

  // Table header — use template strings for readability
  const W = { id: 6, name: 31, score: 7, grade: 7, status: 10 };
  const hr = (l, m, r) =>
    l + '\u2500'.repeat(W.id) + m + '\u2500'.repeat(W.name) + m +
    '\u2500'.repeat(W.score) + m + '\u2500'.repeat(W.grade) + m +
    '\u2500'.repeat(W.status) + r;

  console.log(hr('\u250C', '\u252C', '\u2510'));
  console.log('\u2502 ID   \u2502 Dimension                     \u2502 Score \u2502 Grade \u2502 Status   \u2502');
  console.log(hr('\u251C', '\u253C', '\u2524'));

  for (const dim of dimensions) {
    const grade = letterGrade(dim.score);
    const status = formatStatus(dim.score);
    const id = dim.id.padEnd(4);
    const name = dim.name.padEnd(29);
    const scoreStr = String(dim.score).padStart(3);
    const gradeStr = grade.padStart(3);

    console.log(`\u2502 ${id} \u2502 ${name} \u2502 ${scoreStr}   \u2502 ${gradeStr}   \u2502 ${status} \u2502`);
  }

  console.log(hr('\u2514', '\u2534', '\u2518'));

  console.log('');
  console.log(`  OVERALL: ${totalScore}/100 (Grade ${letterGrade(totalScore)})`);
  console.log('');

  // Summary counts
  const failing = dimensions.filter(d => d.score < GRADE_THRESHOLDS.GAP_CLOSURE);
  const needsWork = dimensions.filter(d => d.score >= GRADE_THRESHOLDS.GAP_CLOSURE && d.score < GRADE_THRESHOLDS.ACCEPT);
  const passing = dimensions.filter(d => d.score >= GRADE_THRESHOLDS.ACCEPT);

  if (failing.length > 0)   console.log(`  \u274C ${failing.length} dimensions FAILING (< ${GRADE_THRESHOLDS.GAP_CLOSURE})`);
  if (needsWork.length > 0) console.log(`  \u26A0\uFE0F  ${needsWork.length} dimensions need improvement (${GRADE_THRESHOLDS.GAP_CLOSURE}-${GRADE_THRESHOLDS.ACCEPT - 1})`);
  if (passing.length > 0)   console.log(`  \u2705 ${passing.length} dimensions passing (\u2265 ${GRADE_THRESHOLDS.ACCEPT})`);

  console.log('');
  console.log('\u2500'.repeat(59));

  return { failing: failing.length, needsWork: needsWork.length, passing: passing.length };
}

/**
 * Print machine-readable signal lines for auto-proceed integration.
 */
export function printSignals(totalScore, scoreId) {
  const status = totalScore >= GRADE_THRESHOLDS.ACCEPT ? 'PASS' : 'NEEDS_CORRECTION';
  console.log(`  DOC_AUDIT_STATUS=${status}`);
  if (scoreId) console.log(`  DOC_AUDIT_SCORE_ID=${scoreId}`);
  if (status === 'NEEDS_CORRECTION') {
    console.log(`  DOC_AUDIT_NEXT_CMD=node scripts/eva/doc-health-audit.mjs generate ${scoreId || '<score-id>'}`);
  }
  console.log('\u2550'.repeat(59));
}

/**
 * Print compact status view (for status subcommand).
 */
export function printStatus(latestScore) {
  if (!latestScore) {
    console.log('\n  No doc-audit scores found. Run: node scripts/eva/doc-health-audit.mjs score\n');
    return;
  }

  const score = latestScore.total_score;
  const grade = letterGrade(score);
  const dims = latestScore.dimension_scores || {};
  const scoredAt = latestScore.scored_at ? new Date(latestScore.scored_at).toLocaleDateString() : 'unknown';

  console.log('');
  console.log('\u2550'.repeat(50));
  console.log('  DOC-AUDIT STATUS');
  console.log('\u2550'.repeat(50));
  console.log(`  Score: ${score}/100 (Grade ${grade})`);
  console.log(`  Action: ${latestScore.threshold_action}`);
  console.log(`  Scored: ${scoredAt}`);
  console.log(`  ID: ${latestScore.id}`);

  if (latestScore.generated_sd_ids && latestScore.generated_sd_ids.length > 0) {
    console.log(`  Corrective SDs: ${latestScore.generated_sd_ids.length}`);
  }

  // Quick dimension summary
  console.log('');
  const dimEntries = Object.entries(dims);
  if (dimEntries.length > 0) {
    for (const [id, d] of dimEntries) {
      const g = letterGrade(d.score);
      const icon = d.score >= GRADE_THRESHOLDS.ACCEPT ? '\u2705' : d.score >= GRADE_THRESHOLDS.GAP_CLOSURE ? '\u26A0\uFE0F' : '\u274C';
      console.log(`  ${icon} ${id} ${(d.name || '').padEnd(28)} ${d.score}/100 (${g})`);
    }
  }

  console.log('\u2550'.repeat(50));
  console.log('');
}

/**
 * Format score result as JSON for --json flag or persist input.
 */
export function toJSON(scoreResult, stats) {
  return {
    mode: 'doc-audit',
    scored_at: new Date().toISOString(),
    files_scanned: stats.fileCount,
    directories_scanned: stats.dirCount,
    total_score: scoreResult.totalScore,
    threshold_action: scoreResult.thresholdAction,
    grade: letterGrade(scoreResult.totalScore),
    dimensions: Object.fromEntries(
      scoreResult.dimensions.map(d => [
        d.id,
        {
          name: d.name,
          score: d.score,
          weight: d.weight,
          grade: letterGrade(d.score),
          findings: d.findings,
          gaps: d.gaps,
        },
      ])
    ),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatStatus(score) {
  if (score >= GRADE_THRESHOLDS.ACCEPT)      return '\u2705 PASS ';
  if (score >= GRADE_THRESHOLDS.MINOR)       return '\u26A0\uFE0F  MINOR';
  if (score >= GRADE_THRESHOLDS.GAP_CLOSURE) return '\u26A0\uFE0F  GAP  ';
  return '\u274C FAIL ';
}
