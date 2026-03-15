/**
 * Report Generator — creates summary of proving run results.
 * For chairman review after full or partial run.
 */

import { getJournalEntries } from './journal-capture.js';

/**
 * Generate a proving run report
 * @param {string} ventureId
 * @returns {string} formatted report
 */
export async function generateReport(ventureId) {
  const entries = await getJournalEntries(ventureId);

  if (entries.length === 0) {
    return 'No journal entries found for this venture. Run "venture:prove assess" first.';
  }

  const lines = [];
  lines.push('='.repeat(60));
  lines.push('VENTURE PROVING RUN REPORT');
  lines.push('='.repeat(60));
  lines.push(`Venture: ${ventureId}`);
  lines.push(`Stages assessed: ${entries.length}/26`);
  lines.push(`Stage completion rate: ${Math.round((entries.length / 26) * 100)}%`);
  lines.push('');

  // Summary stats
  let totalGaps = 0;
  let totalEnhancements = 0;
  const decisions = { proceed: 0, fix_first: 0, skip: 0, defer: 0, pending: 0 };
  const severityCounts = { blocker: 0, major: 0, minor: 0, cosmetic: 0 };

  for (const entry of entries) {
    const gaps = entry.gaps || [];
    totalGaps += gaps.length;
    totalEnhancements += (entry.enhancements || []).length;

    if (entry.chairman_decision) {
      decisions[entry.chairman_decision] = (decisions[entry.chairman_decision] || 0) + 1;
    } else {
      decisions.pending++;
    }

    for (const gap of gaps) {
      severityCounts[gap.severity] = (severityCounts[gap.severity] || 0) + 1;
    }
  }

  lines.push('SUMMARY');
  lines.push('-'.repeat(40));
  lines.push(`Total gaps: ${totalGaps}`);
  lines.push(`  Blocker: ${severityCounts.blocker} | Major: ${severityCounts.major} | Minor: ${severityCounts.minor} | Cosmetic: ${severityCounts.cosmetic}`);
  lines.push(`Total enhancements: ${totalEnhancements}`);
  lines.push(`Chairman decisions: proceed=${decisions.proceed} fix_first=${decisions.fix_first} skip=${decisions.skip} defer=${decisions.defer} pending=${decisions.pending}`);
  lines.push('');

  // Per-stage detail
  lines.push('STAGE DETAILS');
  lines.push('-'.repeat(40));
  for (const entry of entries) {
    const status = entry.actual?.implementation_status || 'unknown';
    const gapCount = (entry.gaps || []).length;
    const decision = entry.chairman_decision || 'pending';
    lines.push(`Stage ${String(entry.stage_number).padStart(2)}: ${status.padEnd(10)} | ${gapCount} gaps | ${decision}`);
  }

  lines.push('');
  lines.push('='.repeat(60));
  return lines.join('\n');
}
