/**
 * Diff Minimality Checker
 * SD-QUALITY-GATE-001: hasDiffMinimality (25%)
 *
 * Analyzes git diff to ensure minimal code changes.
 * Returns true if files <= 10 AND lines <= 400
 */

import { execSync } from 'node:child_process';

export interface DiffResult {
  passed: boolean;
  filesChanged: number;
  linesChanged: number;
  insertions: number;
  deletions: number;
  thresholds: {
    maxFiles: number;
    maxLines: number;
  };
  details: string[];
}

/**
 * Check diff minimality against thresholds
 */
export function checkDiffMinimality(
  baseBranch: string = 'main',
  maxFiles: number = 10,
  maxLines: number = 400
): DiffResult {
  const thresholds = { maxFiles, maxLines };
  const details: string[] = [];

  try {
    // Get diff stats against base branch
    const diffStat = execSync(`git diff --stat ${baseBranch}...HEAD`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000
    });

    // Parse diff output
    // Example: " 5 files changed, 120 insertions(+), 30 deletions(-)"
    const stats = parseDiffStats(diffStat);

    details.push(`Base branch: ${baseBranch}`);
    details.push(`Files changed: ${stats.filesChanged} (max: ${maxFiles})`);
    details.push(`Lines changed: ${stats.insertions + stats.deletions} (max: ${maxLines})`);
    details.push(`  Insertions: +${stats.insertions}`);
    details.push(`  Deletions: -${stats.deletions}`);

    const totalLines = stats.insertions + stats.deletions;
    const passed = stats.filesChanged <= maxFiles && totalLines <= maxLines;

    if (!passed) {
      if (stats.filesChanged > maxFiles) {
        details.push(`FAIL: Too many files changed (${stats.filesChanged} > ${maxFiles})`);
      }
      if (totalLines > maxLines) {
        details.push(`FAIL: Too many lines changed (${totalLines} > ${maxLines})`);
      }
    }

    return {
      passed,
      filesChanged: stats.filesChanged,
      linesChanged: totalLines,
      insertions: stats.insertions,
      deletions: stats.deletions,
      thresholds,
      details
    };
  } catch (error: unknown) {
    // Handle case where no commits exist on branch
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('unknown revision') ||
        errorMessage.includes('bad revision')) {
      details.push('No commits found on current branch compared to main');
      details.push('Treating as minimal diff (0 changes)');
      return {
        passed: true,
        filesChanged: 0,
        linesChanged: 0,
        insertions: 0,
        deletions: 0,
        thresholds,
        details
      };
    }

    details.push(`Error checking diff: ${errorMessage}`);
    return {
      passed: false,
      filesChanged: -1,
      linesChanged: -1,
      insertions: 0,
      deletions: 0,
      thresholds,
      details
    };
  }
}

/**
 * Parse git diff --stat output
 */
function parseDiffStats(output: string): {
  filesChanged: number;
  insertions: number;
  deletions: number;
} {
  const lines = output.trim().split('\n');

  // The summary line is the last line
  const summaryLine = lines[lines.length - 1];

  // Default values
  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;

  // Parse: " 5 files changed, 120 insertions(+), 30 deletions(-)"
  const fileMatch = summaryLine.match(/(\d+)\s+file/);
  const insertMatch = summaryLine.match(/(\d+)\s+insertion/);
  const deleteMatch = summaryLine.match(/(\d+)\s+deletion/);

  if (fileMatch) filesChanged = parseInt(fileMatch[1], 10);
  if (insertMatch) insertions = parseInt(insertMatch[1], 10);
  if (deleteMatch) deletions = parseInt(deleteMatch[1], 10);

  // If no summary line found, count the file lines
  if (filesChanged === 0 && lines.length > 0) {
    filesChanged = lines.filter(line =>
      line.includes('|') && !line.includes('file')
    ).length;
  }

  return { filesChanged, insertions, deletions };
}

// CLI execution
if (process.argv[1]?.includes('check-diff')) {
  const baseBranch = process.argv[2] || 'main';
  const maxFiles = parseInt(process.argv[3] || '10', 10);
  const maxLines = parseInt(process.argv[4] || '400', 10);

  console.log('Checking diff minimality...');
  const result = checkDiffMinimality(baseBranch, maxFiles, maxLines);

  console.log('\nResults:');
  result.details.forEach(d => console.log(`  ${d}`));
  console.log(`\nVerdict: ${result.passed ? 'PASS' : 'FAIL'}`);

  process.exit(result.passed ? 0 : 1);
}
