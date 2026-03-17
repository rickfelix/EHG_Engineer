#!/usr/bin/env node

/**
 * Skill Audit CLI
 *
 * Usage:
 *   npm run skill:audit              — Run audit, display report, persist to DB
 *   npm run skill:audit -- --baseline — Mark scores as baseline for future comparison
 *   npm run skill:audit -- --json     — Output JSON to stdout
 *
 * @module scripts/skill-audit
 */

import { auditAllSkills, persistAuditResults, getBaselineScores } from './modules/skill-assessment/skill-auditor.js';

function parseArgs(args) {
  return {
    baseline: args.includes('--baseline'),
    json: args.includes('--json'),
    help: args.includes('--help'),
  };
}

function renderBar(score, max = 10, width = 20) {
  const filled = Math.round((score / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function healthEmoji(status) {
  switch (status) {
    case 'excellent': return '🟢';
    case 'good': return '🔵';
    case 'needs_work': return '🟡';
    case 'poor': return '🔴';
    case 'missing': return '⚫';
    default: return '❓';
  }
}

function formatReport(results, baselineMap) {
  const lines = [];
  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════════════╗');
  lines.push('║              SKILL DESCRIPTION QUALITY AUDIT                    ║');
  lines.push('╚══════════════════════════════════════════════════════════════════╝');
  lines.push('');

  // Summary stats
  const withDesc = results.filter(r => r.hasDescription).length;
  const total = results.length;
  const avgScore = results.reduce((s, r) => s + r.totalScore, 0) / total;

  lines.push(`  Skills Scanned:    ${total}`);
  lines.push(`  With Description:  ${withDesc}/${total} (${((withDesc / total) * 100).toFixed(0)}%)`);
  lines.push(`  Average Score:     ${avgScore.toFixed(1)}/10`);
  lines.push('');
  lines.push('─'.repeat(68));

  // Per-skill detail
  for (const r of results.sort((a, b) => b.totalScore - a.totalScore)) {
    const baselineScore = baselineMap.get(r.skillName);
    let delta = '';
    if (baselineScore !== undefined) {
      const diff = r.totalScore - baselineScore;
      if (diff > 0) delta = ` (+${diff.toFixed(1)})`;
      else if (diff < 0) delta = ` (${diff.toFixed(1)})`;
      else delta = ' (=)';
    }

    lines.push('');
    lines.push(`  ${healthEmoji(r.healthStatus)} ${r.skillName}`);
    lines.push(`    Score: ${r.totalScore.toFixed(1)}/10 ${renderBar(r.totalScore)}${delta}`);
    lines.push(`    Health: ${r.healthStatus.toUpperCase()}`);

    if (r.hasDescription) {
      lines.push(`    Desc: "${r.description.substring(0, 60)}${r.description.length > 60 ? '...' : ''}"`);
    } else {
      lines.push('    Desc: (none)');
    }
  }

  lines.push('');
  lines.push('─'.repeat(68));

  // Health distribution
  const dist = {};
  for (const r of results) {
    dist[r.healthStatus] = (dist[r.healthStatus] || 0) + 1;
  }
  lines.push('');
  lines.push('  HEALTH DISTRIBUTION:');
  for (const [status, count] of Object.entries(dist).sort()) {
    lines.push(`    ${healthEmoji(status)} ${status.padEnd(12)} ${count}`);
  }

  lines.push('');
  return lines.join('\n');
}

async function main() {
  const { baseline, json, help } = parseArgs(process.argv.slice(2));

  if (help) {
    console.log(`
Skill Description Quality Audit

Usage:
  npm run skill:audit              — Run audit and display report
  npm run skill:audit -- --baseline — Mark current scores as baseline
  npm run skill:audit -- --json     — Output JSON
  npm run skill:audit -- --help     — Show this help
`);
    process.exit(0);
  }

  // Run the audit
  const results = auditAllSkills();

  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Fetch baseline for comparison
  const baselineMap = await getBaselineScores();

  // Display report
  console.log(formatReport(results, baselineMap));

  // Persist to DB
  const runId = `audit-${Date.now()}`;
  const { inserted, errors } = await persistAuditResults(results, { isBaseline: baseline, runId });

  if (errors.length) {
    console.log(`  ⚠️  Persistence errors: ${errors.join('; ')}`);
  } else {
    console.log(`  ✅ ${inserted} scores persisted to skill_assessment_scores`);
    if (baseline) {
      console.log('  📌 Marked as BASELINE for future comparison');
    }
  }
  console.log('');
}

// ESM entry point detection (Windows-compatible)
const isMain = process.argv[1] && (
  import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\\\/g, '/')}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`);

if (isMain) {
  main().catch(err => {
    console.error('Skill audit error:', err.message);
    process.exit(1);
  });
}
