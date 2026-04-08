/**
 * Brainstorm Tally Module — Structured scoring for board deliberations
 *
 * Provides deterministic Borda count tallying, Pareto concentration analysis,
 * and ASCII visual display for Step 7.9 brainstorm voting.
 *
 * SD-BRAINSTORM-TALLY-SCORING-ORCHESTRATOR-ORCH-001-A
 * @module lib/brainstorm/tally-module
 */

/**
 * Collect and normalize board votes into a structured vote matrix.
 *
 * @param {Array<{seat: string, rankings: number[]}>} boardVotes
 *   Each entry: { seat: 'CFO', rankings: [3, 1, 5] } where rankings[0] is 1st choice
 * @param {number} candidateCount - Total number of candidates
 * @returns {{votes: Array<{seat: string, rankings: number[]}>, voterCount: number, candidateCount: number}}
 */
export function collectVotes(boardVotes, candidateCount) {
  const votes = boardVotes
    .filter(v => v && v.seat && Array.isArray(v.rankings) && v.rankings.length > 0)
    .map(v => ({
      seat: v.seat,
      rankings: v.rankings.slice(0, candidateCount),
    }));

  return { votes, voterCount: votes.length, candidateCount };
}

/**
 * Apply Borda count scoring. 1st pick = (N-1) pts, 2nd = (N-2), ..., Nth = 0.
 *
 * @param {{votes: Array<{seat: string, rankings: number[]}>, voterCount: number, candidateCount: number}} voteMatrix
 * @returns {Array<{candidate: number, score: number, percentage: number, voters: string[]}>}
 *   Sorted descending by score, then by candidate number for stable tie-breaking.
 */
export function scoreBorda(voteMatrix) {
  const { votes, candidateCount } = voteMatrix;
  const maxPoints = votes[0]?.rankings.length || 0;
  const scores = new Map();

  // Initialize all candidates
  for (let i = 1; i <= candidateCount; i++) {
    scores.set(i, { candidate: i, score: 0, voters: [] });
  }

  // Tally points
  for (const vote of votes) {
    for (let rank = 0; rank < vote.rankings.length; rank++) {
      const candidateId = vote.rankings[rank];
      const points = maxPoints - 1 - rank;
      const entry = scores.get(candidateId);
      if (entry) {
        entry.score += points;
        entry.voters.push(vote.seat);
      }
    }
  }

  const totalPoints = Array.from(scores.values()).reduce((sum, e) => sum + e.score, 0) || 1;

  return Array.from(scores.values())
    .map(e => ({
      ...e,
      percentage: Math.round((e.score / totalPoints) * 100),
    }))
    .sort((a, b) => b.score - a.score || a.candidate - b.candidate);
}

/**
 * Detect Pareto concentration — whether top-2 candidates hold disproportionate share.
 *
 * @param {Array<{candidate: number, score: number, percentage: number}>} sortedScores
 * @param {number} [threshold=80] - Percentage threshold for "concentrated"
 * @returns {{concentrated: boolean, topTwoPercent: number, signal: 'concentrated'|'dispersed'}}
 */
export function paretoSignal(sortedScores, threshold = 80) {
  if (sortedScores.length < 2) {
    return { concentrated: true, topTwoPercent: 100, signal: 'concentrated' };
  }

  const topTwoPercent = sortedScores[0].percentage + sortedScores[1].percentage;
  const concentrated = topTwoPercent >= threshold;

  return {
    concentrated,
    topTwoPercent,
    signal: concentrated ? 'concentrated' : 'dispersed',
  };
}

/**
 * Generate ASCII bar chart of vote scores with Pareto annotation.
 *
 * @param {Array<{candidate: number, score: number, percentage: number, voters: string[]}>} scores
 * @param {{concentrated: boolean, topTwoPercent: number, signal: string}} pareto
 * @param {string[]} [candidateLabels] - Optional labels (index 0 = candidate 1)
 * @returns {string} Formatted ASCII display
 */
export function formatTallyDisplay(scores, pareto, candidateLabels) {
  const maxScore = scores[0]?.score || 1;
  const barWidth = 30;
  const lines = [];

  lines.push('BRAINSTORM TALLY RESULTS');
  lines.push('═'.repeat(50));

  for (const entry of scores) {
    const label = candidateLabels?.[entry.candidate - 1] || `#${entry.candidate}`;
    const filledWidth = Math.round((entry.score / maxScore) * barWidth);
    const bar = '█'.repeat(filledWidth) + '░'.repeat(barWidth - filledWidth);
    const voterList = entry.voters.length <= 4
      ? entry.voters.join(', ')
      : `${entry.voters.slice(0, 3).join(', ')} +${entry.voters.length - 3}`;
    lines.push(`  ${label.padEnd(20)} ${bar} ${entry.score} pts (${entry.percentage}%)`);
    lines.push(`  ${''.padEnd(20)} Voted by: ${voterList}`);
  }

  lines.push('─'.repeat(50));
  lines.push(`  Pareto: ${pareto.signal.toUpperCase()} (top 2 = ${pareto.topTwoPercent}%)`);
  if (pareto.concentrated) {
    lines.push('  → Strong consensus: top candidates dominate');
  } else {
    lines.push('  → Dispersed: no strong consensus, consider discussion');
  }
  lines.push('═'.repeat(50));

  return lines.join('\n');
}
