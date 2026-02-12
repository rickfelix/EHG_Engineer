#!/usr/bin/env node
/**
 * Validate Documentation Links - DOCMON Link Validator
 * Checks all markdown files for broken internal cross-references
 *
 * Part of SD-LEO-INFRA-DOCMON-SUB-AGENT-001-C
 *
 * Validates:
 * - Relative links [text](./path/to/file.md)
 * - Absolute links from docs root [text](/path/to/file.md)
 * - Anchor links [text](#section-name)
 * - Combined links [text](./file.md#section)
 *
 * Outputs:
 * - docs/summaries/doc-link-report.json (machine-readable)
 * - Console output (human-readable)
 *
 * Usage:
 *   node scripts/validate-doc-links.js --dry-run    # Preview files to check
 *   node scripts/validate-doc-links.js              # Full validation
 *   node scripts/validate-doc-links.js --fix        # Attempt auto-fixes (dry-run)
 *   node scripts/validate-doc-links.js --apply      # Apply auto-fixes
 *   node scripts/validate-doc-links.js --threshold 90  # Custom threshold (default: 95%)
 *   node scripts/validate-doc-links.js --ci         # CI mode: exit 1 if threshold not met
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const REPORT_PATH = path.join(DOCS_DIR, 'summaries', 'doc-link-report.json');

// Default threshold for pass/fail (can be overridden via --threshold)
const DEFAULT_THRESHOLD = 95;

// Get git commit SHA for deterministic results
function getCommitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
  } catch (_e) {
    return 'unknown';
  }
}

// Link patterns to match
const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\(([^)]+)\)/g;

// External link patterns to skip
const EXTERNAL_PATTERNS = [
  /^https?:\/\//,
  /^mailto:/,
  /^#/,  // Pure anchor links validated separately
  /^data:/
];

function findAllMdFiles() {
  const results = [];
  findMdFilesRecursive(DOCS_DIR, results);
  return results;
}

function findMdFilesRecursive(dir, results) {
  if (!fs.existsSync(dir)) return;

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name === 'node_modules' || item.name === '.git') continue;
      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        findMdFilesRecursive(fullPath, results);
      } else if (item.isFile() && item.name.endsWith('.md')) {
        results.push({
          name: item.name,
          path: fullPath,
          relativePath: path.relative(ROOT_DIR, fullPath),
          dir: dir
        });
      }
    }
  } catch (_e) { /* skip */ }
}

function isExternalLink(href) {
  return EXTERNAL_PATTERNS.some(pattern => pattern.test(href));
}

function extractAnchors(content) {
  const anchors = new Set();

  // Match markdown headings
  const headingPattern = /^#+\s+(.+)$/gm;
  let match;
  while ((match = headingPattern.exec(content)) !== null) {
    // Convert heading to anchor format
    const anchor = match[1]
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .trim();
    anchors.add(anchor);
  }

  // Match explicit anchor tags
  const anchorTagPattern = /<a\s+(?:name|id)=["']([^"']+)["']/gi;
  while ((match = anchorTagPattern.exec(content)) !== null) {
    anchors.add(match[1]);
  }

  return anchors;
}

function validateLink(sourceFile, href, _fileAnchors) {
  // Skip external links
  if (isExternalLink(href)) {
    return { valid: true, type: 'external' };
  }

  // Parse anchor from href
  let filePath = href;
  let anchor = null;

  if (href.includes('#')) {
    const parts = href.split('#');
    filePath = parts[0];
    anchor = parts[1];
  }

  // Pure anchor link
  if (!filePath && anchor) {
    const sourceContent = fs.readFileSync(sourceFile.path, 'utf8');
    const sourceAnchors = extractAnchors(sourceContent);
    if (sourceAnchors.has(anchor)) {
      return { valid: true, type: 'anchor' };
    }
    return { valid: false, type: 'anchor', error: `Anchor #${anchor} not found in file` };
  }

  // Resolve the target file path
  let targetPath;
  if (filePath.startsWith('/')) {
    // Absolute from docs root
    targetPath = path.join(DOCS_DIR, filePath);
  } else {
    // Relative to source file
    targetPath = path.resolve(sourceFile.dir, filePath);
  }

  // Normalize path
  targetPath = path.normalize(targetPath);

  // Check if file exists
  if (!fs.existsSync(targetPath)) {
    // Try adding .md extension
    if (!targetPath.endsWith('.md') && fs.existsSync(targetPath + '.md')) {
      targetPath = targetPath + '.md';
    } else {
      return { valid: false, type: 'file', error: `File not found: ${filePath}`, targetPath };
    }
  }

  // Check if it's a directory
  if (fs.statSync(targetPath).isDirectory()) {
    // Check for index.md or README.md
    const indexPath = path.join(targetPath, 'index.md');
    const readmePath = path.join(targetPath, 'README.md');
    if (fs.existsSync(indexPath) || fs.existsSync(readmePath)) {
      return { valid: true, type: 'directory' };
    }
    return { valid: false, type: 'directory', error: `Directory without index: ${filePath}` };
  }

  // Validate anchor if present
  if (anchor) {
    const targetContent = fs.readFileSync(targetPath, 'utf8');
    const targetAnchors = extractAnchors(targetContent);
    if (!targetAnchors.has(anchor)) {
      return { valid: false, type: 'anchor', error: `Anchor #${anchor} not found in ${filePath}` };
    }
  }

  return { valid: true, type: 'file' };
}

function validateFile(file) {
  const content = fs.readFileSync(file.path, 'utf8');
  const links = [];
  const broken = [];

  let match;
  while ((match = MARKDOWN_LINK_PATTERN.exec(content)) !== null) {
    const text = match[1];
    const href = match[2];

    links.push({ text, href, position: match.index });

    const result = validateLink(file, href);
    if (!result.valid) {
      broken.push({
        text,
        href,
        error: result.error,
        type: result.type,
        targetPath: result.targetPath
      });
    }
  }

  return {
    file: file.relativePath,
    totalLinks: links.length,
    brokenLinks: broken
  };
}

function suggestFix(brokenLink, sourceFile, allFiles) {
  // Try to find a file with similar name
  const hrefPath = brokenLink.href.split('#')[0] || '';
  const targetName = path.basename(hrefPath);
  const anchor = brokenLink.href.includes('#') ? brokenLink.href.split('#')[1] : null;

  if (!targetName) return null;

  // Scoring-based candidate selection
  const candidates = allFiles.map(f => {
    let score = 0;
    const fNameLower = f.name.toLowerCase().replace('.md', '');
    const targetLower = targetName.toLowerCase().replace('.md', '');

    // Exact name match
    if (fNameLower === targetLower) score += 100;
    // Partial match
    else if (fNameLower.includes(targetLower) || targetLower.includes(fNameLower)) score += 50;

    // Path component match
    const hrefParts = hrefPath.toLowerCase().split(/[/\\]/).filter(Boolean);
    const fileParts = f.relativePath.toLowerCase().split(/[/\\]/).filter(Boolean);
    const commonParts = hrefParts.filter(p => fileParts.includes(p));
    score += commonParts.length * 10;

    return { file: f, score };
  }).filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);

  if (candidates.length > 0 && candidates[0].score >= 50) {
    let newPath = path.relative(path.dirname(sourceFile.path), candidates[0].file.path);
    newPath = newPath.replace(/\\/g, '/');
    if (anchor) newPath += '#' + anchor;
    return {
      newHref: newPath,
      confidence: Math.min(100, candidates[0].score),
      matchedFile: candidates[0].file.relativePath
    };
  }

  return null;
}

function generateRepairPlan(results, allFiles) {
  const repairs = [];

  for (const result of results) {
    if (result.brokenLinks.length === 0) continue;

    const sourceFile = allFiles.find(f => f.relativePath === result.file);
    if (!sourceFile) continue;

    for (const broken of result.brokenLinks) {
      const fix = suggestFix(broken, sourceFile, allFiles);
      if (fix && fix.confidence >= 50) {
        repairs.push({
          file: result.file,
          originalHref: broken.href,
          suggestedHref: fix.newHref,
          confidence: fix.confidence,
          matchedFile: fix.matchedFile,
          linkText: broken.text,
          errorType: broken.type
        });
      }
    }
  }

  return repairs;
}

function applyRepairs(repairs) {
  const applied = [];
  const failed = [];

  for (const repair of repairs) {
    const filePath = path.join(ROOT_DIR, repair.file);
    try {
      let content = fs.readFileSync(filePath, 'utf8');

      // Escape special regex characters in the original href
      const escapedHref = repair.originalHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\]\\(${escapedHref}\\)`, 'g');

      const newContent = content.replace(pattern, `](${repair.suggestedHref})`);

      if (newContent !== content) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        applied.push({
          ...repair,
          status: 'applied',
          timestamp: new Date().toISOString()
        });
      } else {
        failed.push({
          ...repair,
          status: 'not_found',
          reason: 'Link pattern not found in file'
        });
      }
    } catch (e) {
      failed.push({
        ...repair,
        status: 'error',
        reason: e.message
      });
    }
  }

  return { applied, failed };
}

function saveReport(summary, results, repairs = null, repairResults = null) {
  // Ensure summaries directory exists
  const summariesDir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(summariesDir)) {
    fs.mkdirSync(summariesDir, { recursive: true });
  }

  const report = {
    version: '1.0.0',
    generated: new Date().toISOString(),
    commitSha: getCommitSha(),
    summary: {
      totalFiles: summary.totalFiles,
      totalLinks: summary.totalLinks,
      brokenLinks: summary.brokenLinks,
      filesWithBroken: summary.filesWithBroken,
      passRate: summary.totalLinks > 0
        ? Math.round(((summary.totalLinks - summary.brokenLinks) / summary.totalLinks) * 1000) / 10
        : 100,
      byType: summary.byType
    },
    brokenLinkDetails: results
      .filter(r => r.brokenLinks.length > 0)
      .map(r => ({
        file: r.file,
        broken: r.brokenLinks.map(b => ({
          text: b.text,
          href: b.href,
          error: b.error,
          type: b.type
        }))
      }))
  };

  if (repairs) {
    report.repairPlan = {
      totalRepairs: repairs.length,
      highConfidence: repairs.filter(r => r.confidence >= 80).length,
      mediumConfidence: repairs.filter(r => r.confidence >= 50 && r.confidence < 80).length,
      repairs: repairs
    };
  }

  if (repairResults) {
    report.repairResults = {
      applied: repairResults.applied.length,
      failed: repairResults.failed.length,
      details: repairResults
    };
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n📊 Report saved to: ${path.relative(ROOT_DIR, REPORT_PATH)}`);
}

function generateReport(results) {
  const summary = {
    totalFiles: results.length,
    totalLinks: 0,
    brokenLinks: 0,
    filesWithBroken: 0,
    byType: { file: 0, anchor: 0, directory: 0 }
  };

  for (const r of results) {
    summary.totalLinks += r.totalLinks;
    summary.brokenLinks += r.brokenLinks.length;
    if (r.brokenLinks.length > 0) {
      summary.filesWithBroken++;
    }
    for (const b of r.brokenLinks) {
      summary.byType[b.type] = (summary.byType[b.type] || 0) + 1;
    }
  }

  return summary;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const _verbose = args.includes('--verbose');
  const fix = args.includes('--fix');
  const apply = args.includes('--apply');
  const ciMode = args.includes('--ci');
  const jsonOutput = args.includes('--json');

  // Parse threshold argument
  const thresholdIdx = args.findIndex(a => a === '--threshold');
  const threshold = thresholdIdx >= 0 && args[thresholdIdx + 1]
    ? parseInt(args[thresholdIdx + 1], 10)
    : DEFAULT_THRESHOLD;

  console.log('🔗 Documentation Link Validation');
  console.log('='.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : apply ? 'APPLY REPAIRS' : fix ? 'REPAIR PLAN' : 'VALIDATE'}`);
  console.log(`Threshold: ${threshold}%`);
  console.log('');

  // Find all markdown files
  const files = findAllMdFiles();
  console.log(`Found ${files.length} markdown files`);

  if (dryRun) {
    console.log('\n📊 Sample (first 10 files):');
    for (const file of files.slice(0, 10)) {
      console.log(`   ${file.relativePath}`);
    }
    if (files.length > 10) {
      console.log(`   ... and ${files.length - 10} more`);
    }
    console.log('\n💡 Run without --dry-run for full validation.');
    process.exit(0);
  }

  // Validate all files
  console.log('\n🔍 Validating links...');
  const results = files.map(f => validateFile(f));

  // Generate summary
  const summary = generateReport(results);

  console.log('\n📊 Summary:');
  console.log(`   Total files: ${summary.totalFiles}`);
  console.log(`   Total links: ${summary.totalLinks}`);
  console.log(`   Broken links: ${summary.brokenLinks}`);
  console.log(`   Files with broken links: ${summary.filesWithBroken}`);

  if (summary.brokenLinks > 0) {
    console.log('\n📋 Broken Links by Type:');
    for (const [type, count] of Object.entries(summary.byType)) {
      if (count > 0) {
        console.log(`   ${type}: ${count}`);
      }
    }
  }

  // Show broken links
  const filesWithBroken = results.filter(r => r.brokenLinks.length > 0);
  if (filesWithBroken.length > 0) {
    console.log('\n❌ Files with broken links:');
    for (const r of filesWithBroken.slice(0, 10)) {
      console.log(`\n   ${r.file} (${r.brokenLinks.length} broken):`);
      for (const b of r.brokenLinks.slice(0, 5)) {
        console.log(`      → [${b.text.substring(0, 30)}${b.text.length > 30 ? '...' : ''}](${b.href})`);
        console.log(`         ${b.error}`);
      }
      if (r.brokenLinks.length > 5) {
        console.log(`      ... and ${r.brokenLinks.length - 5} more`);
      }
    }
    if (filesWithBroken.length > 10) {
      console.log(`\n   ... and ${filesWithBroken.length - 10} more files`);
    }
  }

  // Generate repair plan if --fix or --apply
  let repairs = null;
  let repairResults = null;

  if ((fix || apply) && summary.brokenLinks > 0) {
    console.log('\n🔧 Generating repair plan...');
    repairs = generateRepairPlan(results, files);

    console.log(`\n📋 Repair Plan (${repairs.length} repairs):`);
    console.log(`   High confidence (≥80%): ${repairs.filter(r => r.confidence >= 80).length}`);
    console.log(`   Medium confidence (50-79%): ${repairs.filter(r => r.confidence >= 50 && r.confidence < 80).length}`);

    if (repairs.length > 0) {
      console.log('\n   Top repairs:');
      for (const repair of repairs.slice(0, 5)) {
        console.log(`   ${repair.file}`);
        console.log(`      [${repair.linkText.substring(0, 20)}${repair.linkText.length > 20 ? '...' : ''}]`);
        console.log(`      ${repair.originalHref} → ${repair.suggestedHref} (${repair.confidence}%)`);
      }
      if (repairs.length > 5) {
        console.log(`\n   ... and ${repairs.length - 5} more repairs`);
      }
    }

    // Apply repairs if --apply flag
    if (apply && repairs.length > 0) {
      console.log('\n🔨 Applying repairs...');
      // Only apply high-confidence repairs by default
      const safeRepairs = repairs.filter(r => r.confidence >= 80);
      console.log(`   Applying ${safeRepairs.length} high-confidence repairs...`);

      repairResults = applyRepairs(safeRepairs);

      console.log(`\n✅ Applied: ${repairResults.applied.length}`);
      if (repairResults.failed.length > 0) {
        console.log(`⚠️  Failed: ${repairResults.failed.length}`);
        for (const f of repairResults.failed.slice(0, 3)) {
          console.log(`      ${f.file}: ${f.reason}`);
        }
      }
    }
  }

  // Save report
  saveReport(summary, results, repairs, repairResults);

  // JSON output
  if (jsonOutput) {
    const jsonReport = {
      summary,
      broken: filesWithBroken.map(r => ({
        file: r.file,
        links: r.brokenLinks
      })),
      repairs: repairs,
      repairResults: repairResults
    };
    console.log('\n--- JSON RESULTS ---');
    console.log(JSON.stringify(jsonReport, null, 2));
  }

  // Exit code
  const passRate = summary.totalLinks > 0
    ? (summary.totalLinks - summary.brokenLinks) / summary.totalLinks * 100
    : 100;

  const passed = passRate >= threshold;
  console.log(`\n${passed ? '✅' : '⚠️'} Link validation ${passed ? 'PASSED' : 'FAILED'} (${Math.round(passRate * 10) / 10}% valid, threshold: ${threshold}%)`);

  // In CI mode, exit with error if threshold not met
  if (ciMode && !passed) {
    process.exit(1);
  }

  process.exit(passed ? 0 : (summary.brokenLinks > 0 ? 2 : 0));
}

main();
