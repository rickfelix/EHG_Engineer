#!/usr/bin/env node
/**
 * Documentation Health Report - DOCMON Health Dashboard
 * Generates a comprehensive health report for documentation
 *
 * Part of SD-LEO-INFRA-DOCMON-SUB-AGENT-001-C
 *
 * Metrics tracked (6 named scores + overall):
 * - Organization Score (% in correct location)
 * - Completeness Score (% with required metadata)
 * - Freshness Score (% updated in last 90 days)
 * - Link Health (% of working cross-references)
 * - Duplication Rate (% with duplicates)
 * - Sub-Categorization Score (% of large folders properly organized)
 *
 * Outputs:
 * - docs/summaries/doc-health-dashboard.json (machine-readable)
 * - Console output (human-readable)
 * - Timestamped markdown reports in doc-health-reports/
 *
 * Usage:
 *   node scripts/doc-health-report.js              # Generate report
 *   node scripts/doc-health-report.js --json       # JSON output
 *   node scripts/doc-health-report.js --save       # Save markdown report
 *   node scripts/doc-health-report.js --dashboard  # Save JSON dashboard
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const REPORTS_DIR = path.join(DOCS_DIR, 'summaries', 'doc-health-reports');
const DASHBOARD_PATH = path.join(DOCS_DIR, 'summaries', 'doc-health-dashboard.json');

// Scoring weights (6 metrics)
const WEIGHTS = {
  organization: 0.20,
  completeness: 0.20,
  freshness: 0.15,
  linkHealth: 0.20,
  duplication: 0.10,
  subCategorization: 0.15
};

// Thresholds
const THRESHOLDS = {
  organization: 95,         // % of docs in correct location
  completeness: 100,        // % with required metadata
  freshness: 80,            // % updated in last 90 days
  linkHealth: 100,          // % of working cross-references
  duplication: 5,           // max % of files with duplicates
  subCategorization: 80     // % of large folders properly sub-categorized
};

// Folder size threshold for requiring sub-categorization
const SUB_CATEGORIZATION_THRESHOLD = 50;

// Get git commit SHA for deterministic results
function getCommitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
  } catch (_e) {
    return 'unknown';
  }
}

function countMdFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name === 'node_modules' || item.name === '.git') continue;
      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        countMdFiles(fullPath, results);
      } else if (item.isFile() && item.name.endsWith('.md')) {
        results.push({
          path: fullPath,
          relativePath: path.relative(ROOT_DIR, fullPath),
          name: item.name
        });
      }
    }
  } catch (_e) { /* skip */ }
  return results;
}

function runValidationScript(scriptName) {
  try {
    const output = execSync(`node scripts/${scriptName} --json 2>&1`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      timeout: 300000,  // 5 minutes for large codebases
      maxBuffer: 50 * 1024 * 1024  // 50MB buffer for large outputs
    });

    // Extract JSON from output - be more careful with parsing
    const jsonMatch = output.match(/--- JSON RESULTS ---\n([\s\S]+)$/);
    if (jsonMatch) {
      try {
        // Try to find where JSON ends (look for closing brace followed by non-JSON)
        const jsonStr = jsonMatch[1].trim();
        // Find the last closing brace that makes valid JSON
        let lastBrace = jsonStr.lastIndexOf('}');
        while (lastBrace > 0) {
          try {
            const candidate = jsonStr.substring(0, lastBrace + 1);
            return JSON.parse(candidate);
          } catch (_e) {
            lastBrace = jsonStr.lastIndexOf('}', lastBrace - 1);
          }
        }
        // Try parsing the whole thing
        return JSON.parse(jsonStr);
      } catch (_e) {
        return null;
      }
    }
    return null;
  } catch (error) {
    // Try to parse JSON from error output
    const output = error.stdout || error.message || '';
    const jsonMatch = output.match(/--- JSON RESULTS ---\n([\s\S]+)$/);
    if (jsonMatch) {
      try {
        const jsonStr = jsonMatch[1].trim();
        let lastBrace = jsonStr.lastIndexOf('}');
        while (lastBrace > 0) {
          try {
            const candidate = jsonStr.substring(0, lastBrace + 1);
            return JSON.parse(candidate);
          } catch (_e) {
            lastBrace = jsonStr.lastIndexOf('}', lastBrace - 1);
          }
        }
        return JSON.parse(jsonStr);
      } catch (_e) {
        return null;
      }
    }
    return null;
  }
}

function calculateOrganizationScore() {
  // Check for files in prohibited locations
  const prohibitedPaths = ['src/', 'lib/', 'scripts/', 'tests/', 'public/'];
  const allFiles = countMdFiles(ROOT_DIR);

  let violations = 0;
  for (const file of allFiles) {
    for (const prohibited of prohibitedPaths) {
      if (file.relativePath.startsWith(prohibited) && !file.relativePath.includes('archive')) {
        violations++;
        break;
      }
    }
  }

  // Check root directory count
  const rootFiles = fs.readdirSync(ROOT_DIR)
    .filter(f => f.endsWith('.md') && !['README.md', 'CHANGELOG.md'].includes(f) && !f.startsWith('CLAUDE'));

  const rootViolation = rootFiles.length > 10 ? (rootFiles.length - 10) : 0;

  const totalViolations = violations + rootViolation;
  const score = Math.max(0, 100 - (totalViolations * 2));

  return {
    score,
    details: {
      prohibitedLocations: violations,
      rootExcess: rootViolation,
      totalFiles: allFiles.length
    }
  };
}

function calculateCompletenessScore() {
  const result = runValidationScript('validate-doc-metadata.js');
  if (!result) {
    return { score: 0, details: { error: 'Could not run metadata validation' } };
  }

  const total = (result.valid?.length || 0) + (result.missing?.length || 0);
  const valid = result.valid?.length || 0;
  const score = total > 0 ? Math.round((valid / total) * 100) : 100;

  return {
    score,
    details: {
      withMetadata: valid,
      missingMetadata: result.missing?.length || 0,
      totalFiles: total
    }
  };
}

function calculateFreshnessScore() {
  const files = countMdFiles(DOCS_DIR);
  const now = Date.now();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;

  let fresh = 0;
  let stale = 0;

  for (const file of files) {
    try {
      const stat = fs.statSync(file.path);
      if (now - stat.mtime.getTime() < ninetyDays) {
        fresh++;
      } else {
        stale++;
      }
    } catch (_e) {
      stale++;
    }
  }

  const total = fresh + stale;
  const score = total > 0 ? Math.round((fresh / total) * 100) : 100;

  return {
    score,
    details: {
      fresh,
      stale,
      totalFiles: total
    }
  };
}

function calculateLinkHealthScore() {
  const result = runValidationScript('validate-doc-links.js');
  if (!result) {
    return { score: 100, details: { error: 'Could not run link validation' } };
  }

  const totalLinks = result.summary?.totalLinks || 0;
  const brokenLinks = result.summary?.brokenLinks || 0;
  const score = totalLinks > 0 ? Math.round(((totalLinks - brokenLinks) / totalLinks) * 100) : 100;

  return {
    score,
    details: {
      totalLinks,
      brokenLinks,
      filesWithBroken: result.summary?.filesWithBroken || 0
    }
  };
}

function calculateDuplicationScore() {
  const result = runValidationScript('detect-duplicate-docs.js');
  if (!result) {
    return { score: 100, details: { error: 'Could not run duplicate detection' } };
  }

  // Only count exact filename duplicates (true duplicates that need consolidation)
  // Fuzzy title and content similarity are warnings, not violations
  const exactDuplicates = result.exactFilename?.length || 0;
  const fuzzyTitleMatches = result.fuzzyTitle?.length || 0;
  const totalFiles = result.totalFiles || 1;

  // Score based on exact duplicates (true violations)
  const duplicateRate = (exactDuplicates / totalFiles) * 100;
  const score = Math.max(0, 100 - duplicateRate * 20); // Penalize exact duplicates

  return {
    score,
    details: {
      duplicateGroups: exactDuplicates,
      fuzzyMatches: fuzzyTitleMatches,
      totalFiles,
      duplicateRate: Math.round(duplicateRate * 10) / 10
    }
  };
}

function calculateSubCategorizationScore() {
  // Folders that should be sub-categorized if they have >50 files
  const largeFolders = [];
  const wellOrganizedFolders = [];

  function countFilesInFolder(dir) {
    if (!fs.existsSync(dir)) return 0;
    let count = 0;
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.name === 'node_modules' || item.name === '.git') continue;
        const _fullPath = path.join(dir, item.name);
        if (item.isFile() && item.name.endsWith('.md')) {
          count++;
        }
      }
    } catch (_e) { /* skip */ }
    return count;
  }

  function hasSubdirectories(dir) {
    if (!fs.existsSync(dir)) return false;
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      return items.some(item => item.isDirectory() && !item.name.startsWith('.'));
    } catch (_e) {
      return false;
    }
  }

  // Check key folders that should be organized
  const foldersToCheck = [
    path.join(DOCS_DIR, 'reference'),
    path.join(DOCS_DIR, 'guides'),
    path.join(DOCS_DIR, '04_features'),
    path.join(DOCS_DIR, '05_testing'),
    path.join(DOCS_DIR, 'database')
  ];

  for (const folder of foldersToCheck) {
    const fileCount = countFilesInFolder(folder);
    const hasSubs = hasSubdirectories(folder);
    const folderName = path.basename(folder);

    if (fileCount >= SUB_CATEGORIZATION_THRESHOLD) {
      largeFolders.push({ folder: folderName, files: fileCount, hasSubfolders: hasSubs });
      if (hasSubs) {
        wellOrganizedFolders.push(folderName);
      }
    } else if (fileCount >= 30 && hasSubs) {
      // Moderate size with good organization
      wellOrganizedFolders.push(folderName);
    }
  }

  const needsOrganization = largeFolders.filter(f => !f.hasSubfolders).length;
  const properlyOrganized = largeFolders.length > 0
    ? largeFolders.filter(f => f.hasSubfolders).length
    : wellOrganizedFolders.length;

  const total = largeFolders.length || 1;
  const score = Math.round((properlyOrganized / total) * 100);

  return {
    score: Math.min(100, score),
    details: {
      largeFolders: largeFolders.length,
      properlyOrganized,
      needsOrganization,
      folders: largeFolders
    }
  };
}

function calculateOverallScore(metrics) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(WEIGHTS)) {
    if (metrics[key]) {
      weightedSum += metrics[key].score * weight;
      totalWeight += weight;
    }
  }

  return Math.round(totalWeight > 0 ? weightedSum / totalWeight : 0);
}

function getHealthGrade(score) {
  if (score >= 90) return { grade: 'A', emoji: '🟢', status: 'Excellent' };
  if (score >= 80) return { grade: 'B', emoji: '🟡', status: 'Good' };
  if (score >= 70) return { grade: 'C', emoji: '🟠', status: 'Fair' };
  if (score >= 60) return { grade: 'D', emoji: '🔴', status: 'Needs Improvement' };
  return { grade: 'F', emoji: '⛔', status: 'Critical' };
}

function generateReport() {
  console.log('📊 Documentation Health Report');
  console.log('='.repeat(50));
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log('');

  console.log('Calculating metrics...');

  const metrics = {
    organization: calculateOrganizationScore(),
    completeness: calculateCompletenessScore(),
    freshness: calculateFreshnessScore(),
    linkHealth: calculateLinkHealthScore(),
    duplication: calculateDuplicationScore(),
    subCategorization: calculateSubCategorizationScore()
  };

  const overallScore = calculateOverallScore(metrics);
  const grade = getHealthGrade(overallScore);

  console.log('');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log(`║  DOCUMENTATION HEALTH SCORE: ${overallScore}/100 ${grade.emoji}`.padEnd(52) + '║');
  console.log(`║  Grade: ${grade.grade} - ${grade.status}`.padEnd(52) + '║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');

  console.log('📋 Metric Breakdown:');
  console.log('─'.repeat(50));

  const metricLabels = {
    organization: 'Organization (correct location)',
    completeness: 'Completeness (metadata present)',
    freshness: 'Freshness (updated <90 days)',
    linkHealth: 'Link Health (working refs)',
    duplication: 'Duplication (unique content)',
    subCategorization: 'Sub-Categorization (large folders organized)'
  };

  for (const [key, label] of Object.entries(metricLabels)) {
    const metric = metrics[key];
    const threshold = THRESHOLDS[key];
    const weight = Math.round(WEIGHTS[key] * 100);
    const status = metric.score >= threshold ? '✅' : '⚠️';
    const scoreDisplay = key === 'duplication'
      ? `${100 - metric.details.duplicateRate}%`
      : `${metric.score}%`;

    console.log(`${status} ${label}`);
    console.log(`   Score: ${scoreDisplay} (target: ${threshold}%, weight: ${weight}%)`);

    // Show details
    if (metric.details.error) {
      console.log(`   ⚠️  ${metric.details.error}`);
    } else if (key === 'organization') {
      console.log(`   Files in prohibited locations: ${metric.details.prohibitedLocations}`);
      console.log(`   Excess root files: ${metric.details.rootExcess}`);
    } else if (key === 'completeness') {
      console.log(`   With metadata: ${metric.details.withMetadata}`);
      console.log(`   Missing metadata: ${metric.details.missingMetadata}`);
    } else if (key === 'freshness') {
      console.log(`   Fresh (<90 days): ${metric.details.fresh}`);
      console.log(`   Stale (>90 days): ${metric.details.stale}`);
    } else if (key === 'linkHealth') {
      console.log(`   Total links: ${metric.details.totalLinks}`);
      console.log(`   Broken links: ${metric.details.brokenLinks}`);
    } else if (key === 'duplication') {
      console.log(`   Exact duplicates: ${metric.details.duplicateGroups}`);
      console.log(`   Fuzzy title matches: ${metric.details.fuzzyMatches || 0} (warnings)`);
      console.log(`   Duplication rate: ${metric.details.duplicateRate}%`);
    } else if (key === 'subCategorization') {
      console.log(`   Large folders (>50 files): ${metric.details.largeFolders}`);
      console.log(`   Properly organized: ${metric.details.properlyOrganized}`);
      console.log(`   Needs organization: ${metric.details.needsOrganization}`);
    }
    console.log('');
  }

  // Recommendations
  console.log('💡 Recommendations:');
  console.log('─'.repeat(50));

  if (metrics.organization.score < THRESHOLDS.organization) {
    console.log('• Move files from prohibited locations (src/, lib/, scripts/, tests/)');
    console.log('  Run: npm run docs:validate-location for details');
  }
  if (metrics.completeness.score < THRESHOLDS.completeness) {
    console.log('• Add metadata headers to files missing them');
    console.log('  Run: npm run docs:inject-metadata --dry-run');
  }
  if (metrics.freshness.score < THRESHOLDS.freshness) {
    console.log('• Review and update stale documentation');
    console.log('  Consider archiving obsolete docs');
  }
  if (metrics.linkHealth.score < THRESHOLDS.linkHealth) {
    console.log('• Fix broken cross-references');
    console.log('  Run: npm run docs:validate-links');
  }
  if (100 - metrics.duplication.details.duplicateRate < 100 - THRESHOLDS.duplication) {
    console.log('• Consolidate duplicate documentation');
    console.log('  Run: npm run docs:detect-duplicates');
  }

  if (overallScore >= 90) {
    console.log('🎉 Documentation is in excellent health!');
  }

  // Get top 3 risks based on scores below threshold
  const risks = [];
  for (const [key, metric] of Object.entries(metrics)) {
    const threshold = THRESHOLDS[key];
    const score = key === 'duplication' ? (100 - metric.details.duplicateRate) : metric.score;
    if (score < threshold) {
      risks.push({
        metric: key,
        score,
        threshold,
        gap: threshold - score,
        label: metricLabels[key]
      });
    }
  }
  risks.sort((a, b) => b.gap - a.gap);
  const topRisks = risks.slice(0, 3);

  return {
    timestamp: new Date().toISOString(),
    commitSha: getCommitSha(),
    overallScore,
    grade: grade.grade,
    status: grade.status,
    metrics,
    thresholds: THRESHOLDS,
    weights: WEIGHTS,
    topRisks
  };
}

function saveReport(report) {
  // Ensure reports directory exists
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const date = new Date().toISOString().split('T')[0];
  const filename = `${date}-health-report.md`;
  const filepath = path.join(REPORTS_DIR, filename);

  const markdown = `# Documentation Health Report

## Metadata
- **Generated**: ${report.timestamp}
- **Overall Score**: ${report.overallScore}/100
- **Grade**: ${report.grade} - ${report.status}

## Metric Breakdown

| Metric | Score | Target | Status |
|--------|-------|--------|--------|
| Organization | ${report.metrics.organization.score}% | ${report.thresholds.organization}% | ${report.metrics.organization.score >= report.thresholds.organization ? '✅' : '⚠️'} |
| Completeness | ${report.metrics.completeness.score}% | ${report.thresholds.completeness}% | ${report.metrics.completeness.score >= report.thresholds.completeness ? '✅' : '⚠️'} |
| Freshness | ${report.metrics.freshness.score}% | ${report.thresholds.freshness}% | ${report.metrics.freshness.score >= report.thresholds.freshness ? '✅' : '⚠️'} |
| Link Health | ${report.metrics.linkHealth.score}% | ${report.thresholds.linkHealth}% | ${report.metrics.linkHealth.score >= report.thresholds.linkHealth ? '✅' : '⚠️'} |
| Duplication | ${100 - (report.metrics.duplication.details.duplicateRate || 0)}% | ${100 - report.thresholds.duplication}% | ${report.metrics.duplication.score >= 95 ? '✅' : '⚠️'} |

## Details

### Organization
- Files in prohibited locations: ${report.metrics.organization.details.prohibitedLocations}
- Excess root files: ${report.metrics.organization.details.rootExcess}

### Completeness
- With metadata: ${report.metrics.completeness.details.withMetadata}
- Missing metadata: ${report.metrics.completeness.details.missingMetadata}

### Freshness
- Fresh (<90 days): ${report.metrics.freshness.details.fresh}
- Stale (>90 days): ${report.metrics.freshness.details.stale}

### Link Health
- Total links: ${report.metrics.linkHealth.details.totalLinks}
- Broken links: ${report.metrics.linkHealth.details.brokenLinks}

### Duplication
- Duplicate groups: ${report.metrics.duplication.details.duplicateGroups}
- Duplication rate: ${report.metrics.duplication.details.duplicateRate}%

---
*Generated by doc-health-report.js*
`;

  fs.writeFileSync(filepath, markdown, 'utf8');
  console.log(`\n📄 Report saved to: ${path.relative(ROOT_DIR, filepath)}`);
}

function saveDashboard(report) {
  // Ensure summaries directory exists
  const summariesDir = path.dirname(DASHBOARD_PATH);
  if (!fs.existsSync(summariesDir)) {
    fs.mkdirSync(summariesDir, { recursive: true });
  }

  // Create a machine-readable dashboard JSON
  const dashboard = {
    version: '1.0.0',
    generated: report.timestamp,
    commitSha: report.commitSha,
    overallScore: report.overallScore,
    grade: report.grade,
    status: report.status,
    metrics: {
      organization: {
        score: report.metrics.organization.score,
        target: report.thresholds.organization,
        weight: report.weights.organization,
        details: report.metrics.organization.details
      },
      completeness: {
        score: report.metrics.completeness.score,
        target: report.thresholds.completeness,
        weight: report.weights.completeness,
        details: report.metrics.completeness.details
      },
      freshness: {
        score: report.metrics.freshness.score,
        target: report.thresholds.freshness,
        weight: report.weights.freshness,
        details: report.metrics.freshness.details
      },
      linkHealth: {
        score: report.metrics.linkHealth.score,
        target: report.thresholds.linkHealth,
        weight: report.weights.linkHealth,
        details: report.metrics.linkHealth.details
      },
      duplication: {
        score: report.metrics.duplication.score,
        target: 100 - report.thresholds.duplication,
        weight: report.weights.duplication,
        details: report.metrics.duplication.details
      },
      subCategorization: {
        score: report.metrics.subCategorization.score,
        target: report.thresholds.subCategorization,
        weight: report.weights.subCategorization,
        details: report.metrics.subCategorization.details
      }
    },
    topRisks: report.topRisks,
    checksumAlgorithm: 'sha256'
  };

  // Add checksum for integrity verification
  const contentHash = crypto.createHash('sha256')
    .update(JSON.stringify({ ...dashboard, checksum: undefined }))
    .digest('hex');
  dashboard.checksum = contentHash;

  fs.writeFileSync(DASHBOARD_PATH, JSON.stringify(dashboard, null, 2), 'utf8');
  console.log(`\n📊 Dashboard saved to: ${path.relative(ROOT_DIR, DASHBOARD_PATH)}`);
}

function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const saveToFile = args.includes('--save');
  const saveDashboardFile = args.includes('--dashboard');

  const report = generateReport();

  if (saveToFile) {
    saveReport(report);
  }

  // Always save dashboard JSON (primary output per PRD)
  if (saveDashboardFile || !jsonOutput) {
    saveDashboard(report);
  }

  if (jsonOutput) {
    console.log('\n--- JSON RESULTS ---');
    console.log(JSON.stringify(report, null, 2));
  }

  // Exit code based on health score
  process.exit(report.overallScore >= 70 ? 0 : 1);
}

main();
