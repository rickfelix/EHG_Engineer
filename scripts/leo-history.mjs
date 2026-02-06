#!/usr/bin/env node

/**
 * LEO History - AI-Generated Project Evolution Summary
 *
 * Fetches merged PRs from GitHub, computes stats, and generates
 * an AI narrative summary of how the project evolved over time.
 *
 * Usage:
 *   node scripts/leo-history.mjs --repos "rickfelix/EHG_Engineer" --since "2026-01-01" --until "2026-02-06" --granularity "month"
 *   node scripts/leo-history.mjs --repos "rickfelix/EHG_Engineer,rickfelix/ehg" --since "2026-01-06" --until "2026-02-06" --granularity "week"
 *
 * @module scripts/leo-history
 * @created 2026-02-06
 */

import { execSync } from 'child_process';
import { getLLMClient } from '../lib/llm/index.js';
import dotenv from 'dotenv';

dotenv.config();

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    repos: [],
    since: null,
    until: null,
    granularity: 'week'
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--repos':
        parsed.repos = (args[++i] || '').split(',').map(r => r.trim()).filter(Boolean);
        break;
      case '--since':
        parsed.since = args[++i];
        break;
      case '--until':
        parsed.until = args[++i];
        break;
      case '--granularity':
        parsed.granularity = args[++i];
        break;
    }
  }

  if (parsed.repos.length === 0) {
    console.error('Error: --repos is required (e.g., --repos "rickfelix/EHG_Engineer")');
    process.exit(1);
  }
  if (!parsed.since || !parsed.until) {
    console.error('Error: --since and --until are required (e.g., --since "2026-01-01" --until "2026-02-06")');
    process.exit(1);
  }

  return parsed;
}

// =============================================================================
// PR FETCHING
// =============================================================================

function fetchMergedPRs(repo, since, until) {
  try {
    const cmd = `gh pr list --repo ${repo} --state merged --limit 1000 --json number,title,mergedAt,labels,additions,deletions,changedFiles --search "merged:>=${since} merged:<=${until}"`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 60000 });
    const prs = JSON.parse(output || '[]');

    // Client-side date filter (GitHub search can be imprecise)
    const sinceDate = new Date(since + 'T00:00:00Z');
    const untilDate = new Date(until + 'T23:59:59Z');
    const filtered = prs.filter(pr => {
      const merged = new Date(pr.mergedAt);
      return merged >= sinceDate && merged <= untilDate;
    });

    return filtered.map(pr => ({ ...pr, repo }));
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('auth') || msg.includes('login')) {
      throw new Error(`GitHub CLI not authenticated. Run \`gh auth login\` first.`);
    }
    throw new Error(`Failed to fetch PRs from ${repo}: ${msg.split('\n')[0]}`);
  }
}

// =============================================================================
// PR CATEGORIZATION
// =============================================================================

const CATEGORY_MAP = {
  feat: 'Feature',
  fix: 'Bug Fix',
  chore: 'Chore',
  docs: 'Documentation',
  refactor: 'Refactor',
  perf: 'Performance',
  test: 'Testing',
  ci: 'CI/CD',
  style: 'Style',
  build: 'Build'
};

function categorizePR(pr) {
  const title = pr.title || '';

  // Check conventional commit prefix
  const match = title.match(/^(\w+)(?:\(.+?\))?[!:]?\s*/);
  if (match && CATEGORY_MAP[match[1].toLowerCase()]) {
    return CATEGORY_MAP[match[1].toLowerCase()];
  }

  // Check labels
  const labelNames = (pr.labels || []).map(l => (l.name || l).toLowerCase());
  if (labelNames.some(l => l.includes('bug') || l.includes('fix'))) return 'Bug Fix';
  if (labelNames.some(l => l.includes('feature') || l.includes('enhancement'))) return 'Feature';
  if (labelNames.some(l => l.includes('doc'))) return 'Documentation';
  if (labelNames.some(l => l.includes('infra') || l.includes('ci'))) return 'CI/CD';

  // Fallback heuristics on title
  const lower = title.toLowerCase();
  if (lower.includes('fix') || lower.includes('bug')) return 'Bug Fix';
  if (lower.includes('feat') || lower.includes('add') || lower.includes('implement')) return 'Feature';
  if (lower.includes('refactor') || lower.includes('cleanup')) return 'Refactor';
  if (lower.includes('doc')) return 'Documentation';
  if (lower.includes('test')) return 'Testing';

  return 'Other';
}

function categorizePRs(prs) {
  const groups = {};
  for (const pr of prs) {
    const category = categorizePR(pr);
    if (!groups[category]) groups[category] = [];
    groups[category].push(pr);
  }
  return groups;
}

// =============================================================================
// STATS COMPUTATION
// =============================================================================

function computeStats(prs) {
  let totalAdditions = 0;
  let totalDeletions = 0;
  let totalChangedFiles = 0;
  const notable = [];
  const milestones = [];

  for (const pr of prs) {
    totalAdditions += pr.additions || 0;
    totalDeletions += pr.deletions || 0;
    totalChangedFiles += pr.changedFiles || 0;

    const loc = (pr.additions || 0) + (pr.deletions || 0);
    if (loc > 1000) {
      milestones.push(pr);
    } else if (loc > 500) {
      notable.push(pr);
    }
  }

  const categories = categorizePRs(prs);
  const categoryStats = Object.entries(categories)
    .map(([name, catPrs]) => ({ name, count: catPrs.length, pct: ((catPrs.length / prs.length) * 100).toFixed(1) }))
    .sort((a, b) => b.count - a.count);

  return {
    totalPRs: prs.length,
    totalAdditions,
    totalDeletions,
    totalChangedFiles,
    categoryStats,
    notable,
    milestones
  };
}

// =============================================================================
// PERIOD GROUPING
// =============================================================================

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday start
  d.setUTCDate(diff);
  return d.toISOString().split('T')[0];
}

function getMonthKey(date) {
  return date.slice(0, 7); // YYYY-MM
}

function getQuarterKey(date) {
  const month = parseInt(date.slice(5, 7));
  const quarter = Math.ceil(month / 3);
  return `${date.slice(0, 4)}-Q${quarter}`;
}

function getPeriodKey(mergedAt, granularity) {
  const date = mergedAt.split('T')[0];
  switch (granularity) {
    case 'day': return date;
    case 'week': return getWeekStart(date);
    case 'month': return getMonthKey(date);
    case 'quarter': return getQuarterKey(date);
    default: return getMonthKey(date);
  }
}

function formatPeriodLabel(key, granularity) {
  switch (granularity) {
    case 'day': return key;
    case 'week': {
      const start = new Date(key + 'T00:00:00Z');
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      return `Week of ${fmt(start)} - ${fmt(end)}`;
    }
    case 'month': {
      const d = new Date(key + '-01T00:00:00Z');
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    }
    case 'quarter': return key;
    default: return key;
  }
}

function groupByPeriod(prs, granularity) {
  const groups = {};
  for (const pr of prs) {
    const key = getPeriodKey(pr.mergedAt, granularity);
    if (!groups[key]) groups[key] = [];
    groups[key].push(pr);
  }

  // Sort by period key ascending
  const sorted = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  return sorted.map(([key, periodPrs]) => ({
    key,
    label: formatPeriodLabel(key, granularity),
    prs: periodPrs,
    categories: categorizePRs(periodPrs)
  }));
}

// =============================================================================
// LLM NARRATIVE GENERATION
// =============================================================================

const SYSTEM_PROMPT = `You are a technical project historian. Generate a narrative summary of a software project's evolution based on merged pull requests. For each time period:
1. Lead with the main theme or focus area
2. Highlight the most significant changes
3. Note shifts in focus between periods
4. Mention notable PRs by number when they represent milestones
End with a brief "Looking Ahead" observation based on recent trends.
Use markdown headers (###) for each period. Keep the narrative concise but insightful.`;

function buildPeriodsPrompt(periods) {
  let prompt = 'Here are the merged pull requests grouped by time period:\n\n';

  for (const period of periods) {
    prompt += `## ${period.label}\n`;

    const catEntries = Object.entries(period.categories);
    for (const [category, prs] of catEntries) {
      prompt += `**${category}** (${prs.length} PRs):\n`;
      // If too many PRs, only show top 5 by size
      const sorted = [...prs].sort((a, b) => ((b.additions || 0) + (b.deletions || 0)) - ((a.additions || 0) + (a.deletions || 0)));
      const shown = sorted.slice(0, 5);
      for (const pr of shown) {
        prompt += `  - #${pr.number}: ${pr.title} (+${pr.additions || 0}/-${pr.deletions || 0})${pr.repo ? ` [${pr.repo.split('/')[1]}]` : ''}\n`;
      }
      if (sorted.length > 5) {
        prompt += `  - ... and ${sorted.length - 5} more\n`;
      }
    }
    prompt += '\n';
  }

  return prompt;
}

async function generateNarrative(periods, repoNames) {
  try {
    const client = getLLMClient({ purpose: 'generation' });
    const userPrompt = `Generate a narrative summary for the following project evolution (repos: ${repoNames.join(', ')}):\n\n${buildPeriodsPrompt(periods)}`;

    const result = await client.complete(SYSTEM_PROMPT, userPrompt);
    return typeof result === 'string' ? result : result?.content || result?.text || String(result);
  } catch (err) {
    return null; // Fallback handled by caller
  }
}

// =============================================================================
// OUTPUT FORMATTING
// =============================================================================

function formatNumber(n) {
  return n.toLocaleString('en-US');
}

function formatOutput(stats, periods, narrative, repoNames, since, until, granularity) {
  const lines = [];
  const repoDisplay = repoNames.map(r => r.split('/')[1]).join(' + ');
  const sinceDate = new Date(since + 'T00:00:00Z');
  const untilDate = new Date(until + 'T00:00:00Z');
  const fmtDate = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const granLabel = granularity.charAt(0).toUpperCase() + granularity.slice(1);

  lines.push('');
  lines.push('=' .repeat(60));
  lines.push(`  PROJECT HISTORY: ${repoDisplay}`);
  lines.push(`  Period: ${fmtDate(sinceDate)} - ${fmtDate(untilDate)} (By ${granLabel})`);
  lines.push('='.repeat(60));
  lines.push('');

  // Stats section
  lines.push('  STATS');
  lines.push('  ' + '\u2500'.repeat(16));
  lines.push(`  Total PRs Merged:     ${formatNumber(stats.totalPRs)}`);
  lines.push(`  Lines Added:          +${formatNumber(stats.totalAdditions)}`);
  lines.push(`  Lines Removed:        -${formatNumber(stats.totalDeletions)}`);
  lines.push(`  Files Changed:        ${formatNumber(stats.totalChangedFiles)}`);
  lines.push('');

  // Category breakdown
  lines.push('  TOP CATEGORIES');
  lines.push('  ' + '\u2500'.repeat(16));
  for (const cat of stats.categoryStats) {
    const label = (cat.name + ':').padEnd(16);
    lines.push(`  ${label}${String(cat.count).padStart(3)} PRs (${cat.pct}%)`);
  }
  lines.push('');

  // Notable PRs
  const allNotable = [...stats.milestones, ...stats.notable];
  if (allNotable.length > 0) {
    lines.push('  NOTABLE PRs');
    lines.push('  ' + '\u2500'.repeat(16));
    for (const pr of allNotable.slice(0, 10)) {
      const repoTag = pr.repo ? ` [${pr.repo.split('/')[1]}]` : '';
      lines.push(`  #${pr.number}: ${pr.title} (+${pr.additions || 0}/-${pr.deletions || 0})${repoTag}`);
    }
    lines.push('');
  }

  // AI Narrative
  lines.push('='.repeat(60));
  lines.push('  AI NARRATIVE SUMMARY');
  lines.push('='.repeat(60));
  lines.push('');

  if (narrative) {
    lines.push(narrative);
  } else {
    // Fallback: plain period-by-period listing
    lines.push('  (LLM unavailable - showing plain period summary)\n');
    for (const period of periods) {
      lines.push(`### ${period.label}`);
      lines.push(`${period.prs.length} PRs merged.`);
      const catSummary = Object.entries(period.categories)
        .map(([cat, prs]) => `${cat}: ${prs.length}`)
        .join(', ');
      lines.push(`Categories: ${catSummary}`);
      lines.push('');
    }
  }

  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('TIP: Run /leo history again with a different date range to compare periods.');
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const { repos, since, until, granularity } = parseArgs();

  // Fetch PRs from all repos
  let allPRs = [];
  const errors = [];

  for (const repo of repos) {
    try {
      const prs = fetchMergedPRs(repo, since, until);
      allPRs = allPRs.concat(prs);
    } catch (err) {
      errors.push({ repo, error: err.message });
      // In multi-repo mode, continue with the other repo
      if (repos.length === 1) {
        console.error(err.message);
        process.exit(1);
      }
    }
  }

  // Report partial failures in multi-repo mode
  for (const err of errors) {
    console.error(`Warning: ${err.error}`);
  }

  if (allPRs.length === 0) {
    const repoDisplay = repos.map(r => r.split('/')[1]).join(', ');
    console.log(`\nNo merged PRs found for ${repoDisplay} in ${since} to ${until}\n`);
    process.exit(0);
  }

  // Sort all PRs by mergedAt
  allPRs.sort((a, b) => new Date(a.mergedAt) - new Date(b.mergedAt));

  // Compute stats
  const stats = computeStats(allPRs);

  // Group by period
  const periods = groupByPeriod(allPRs, granularity);

  // Generate AI narrative
  const narrative = await generateNarrative(periods, repos);

  // Format and output
  const output = formatOutput(stats, periods, narrative, repos, since, until, granularity);
  console.log(output);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
