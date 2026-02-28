/**
 * Doc-Audit Reporter — Output formatting for doc health audit
 *
 * Matches existing box-border patterns used by docmon/reporter and sd-next display.
 * Supports console (pretty) and JSON output modes.
 *
 * Used by:
 *   scripts/eva/doc-health-audit.mjs  (entry point)
 */

import { letterGrade, GRADE_THRESHOLDS } from './rubric.js';

// ─── Console Report (full dimension table) ──────────────────────────────────

/**
 * Print the full audit report to stdout.
 * @param {{ dimensions: DimensionScore[], totalScore: number, thresholdAction: string }} scoreResult
 * @param {{ fileCount: number, dirCount: number }} stats
 */
export function printReport(scoreResult, stats) {
  const { dimensions, totalScore } = scoreResult;

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

  let printedSeparator = false;
  for (const dim of dimensions) {
    // Visual separator before coverage dimensions (D11+)
    if (!printedSeparator && dim.category === 'coverage') {
      console.log(hr('\u251C', '\u253C', '\u2524'));
      const label = ' Coverage Dimensions';
      console.log(`\u2502 ${label.padEnd(W.id + W.name + 1)} \u2502${''.padEnd(W.score)}\u2502${''.padEnd(W.grade)}\u2502${''.padEnd(W.status)}\u2502`);
      console.log(hr('\u251C', '\u253C', '\u2524'));
      printedSeparator = true;
    }

    const grade = dim.score === -1 ? 'N/A' : letterGrade(dim.score);
    const status = dim.score === -1 ? '  N/A    ' : formatStatus(dim.score);
    const id = dim.id.padEnd(4);
    const name = dim.name.padEnd(29);
    const scoreStr = dim.score === -1 ? 'N/A' : String(dim.score).padStart(3);
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

// ─── Trend Display ──────────────────────────────────────────────────────────

/**
 * Print score trend comparing current to previous run.
 * @param {{ totalScore: number, dimensions: object[] }} current
 * @param {{ total_score: number, dimension_scores: object, scored_at: string }|null} previous
 * @param {number} roundNumber - Which round of the heal loop (1-based)
 */
export function printTrend(current, previous, roundNumber) {
  console.log('');
  console.log('─'.repeat(59));

  if (!previous) {
    console.log('  TREND: First run (no previous data)');
    console.log('─'.repeat(59));
    return;
  }

  console.log(`  TREND (Round ${roundNumber} of heal loop):`);
  console.log('');

  const prevTotal = previous.total_score;
  const curTotal = current.totalScore;
  const delta = curTotal - prevTotal;
  const arrow = delta > 0 ? `+${delta}` : delta === 0 ? '±0' : String(delta);
  console.log(`  Total: ${prevTotal} → ${curTotal} (${arrow})`);
  console.log('');

  // Per-dimension deltas for dimensions that changed
  const prevDims = previous.dimension_scores || {};
  for (const dim of current.dimensions) {
    const prev = prevDims[dim.id];
    if (!prev) continue;

    const prevScore = prev.score;
    const curScore = dim.score;
    if (prevScore === curScore) continue;

    const d = curScore - prevScore;
    const sign = d > 0 ? `+${d}` : String(d);
    const label = `${dim.id} ${dim.name}:`;
    console.log(`  ${label.padEnd(38)} ${String(prevScore).padStart(3)} → ${String(curScore).padStart(3)} (${sign})`);
  }

  const scoredAt = previous.scored_at
    ? new Date(previous.scored_at).toLocaleDateString()
    : 'unknown';
  console.log('');
  console.log(`  Previous scored: ${scoredAt}`);
  console.log('─'.repeat(59));
}

// ─── Auto-Fix Summary ──────────────────────────────────────────────────────

/**
 * Print summary of auto-fix results.
 * @param {{ fixed: Array<{dimension: string, file: string, action: string}>, skipped: string[] }} fixResult
 */
export function printAutoFixSummary(fixResult) {
  const { fixed, skipped } = fixResult;

  if (fixed.length === 0) {
    console.log('  No auto-fixable issues found.');
    return;
  }

  // Count by dimension
  const counts = {};
  for (const f of fixed) {
    counts[f.dimension] = (counts[f.dimension] || 0) + 1;
  }

  const parts = Object.entries(counts).map(([dim, n]) => `${dim}: ${n}`);
  console.log(`  Auto-fixed ${fixed.length} issues (${parts.join(', ')})`);

  for (const f of fixed) {
    console.log(`    ✓ [${f.dimension}] ${f.file} — ${f.action}`);
  }

  if (skipped.length > 0) {
    console.log(`  Skipped ${skipped.length} (safety checks or parse errors)`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatStatus(score) {
  if (score >= GRADE_THRESHOLDS.ACCEPT)      return '\u2705 PASS ';
  if (score >= GRADE_THRESHOLDS.MINOR)       return '\u26A0\uFE0F  MINOR';
  if (score >= GRADE_THRESHOLDS.GAP_CLOSURE) return '\u26A0\uFE0F  GAP  ';
  return '\u274C FAIL ';
}
