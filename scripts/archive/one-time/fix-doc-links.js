#!/usr/bin/env node
/**
 * Intelligent Documentation Link Fixer
 *
 * Analyzes broken links and applies fixes using multiple strategies:
 * 1. Pattern detection (bulk reorganization moves)
 * 2. Git history analysis (renamed files)
 * 3. Fuzzy filename matching
 * 4. Content fingerprinting
 * 5. Anchor/heading similarity
 *
 * Usage:
 *   node scripts/fix-doc-links.js --analyze          # Generate fix manifest
 *   node scripts/fix-doc-links.js --apply            # Apply all fixes >80% confidence
 *   node scripts/fix-doc-links.js --apply --min-confidence=90  # Higher threshold
 *   node scripts/fix-doc-links.js --report           # Show what needs manual review
 *   node scripts/fix-doc-links.js --dry-run          # Preview changes without writing
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const MANIFEST_PATH = path.join(DOCS_DIR, 'fixes', 'link-fix-manifest.json');

// Configuration
const DEFAULT_MIN_CONFIDENCE = 80;
const PATTERN_MIN_OCCURRENCES = 3; // Minimum links to detect as pattern

// Link patterns to match
const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\(([^)]+)\)/g;

// External link patterns to skip
const EXTERNAL_PATTERNS = [
  /^https?:\/\//,
  /^mailto:/,
  /^data:/
];

// ============================================================================
// FILE DISCOVERY
// ============================================================================

function findAllMdFiles(dir = DOCS_DIR) {
  const results = [];
  findMdFilesRecursive(dir, results);
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

// ============================================================================
// LINK EXTRACTION AND VALIDATION
// ============================================================================

function extractAnchors(content) {
  const anchors = new Set();

  // Match markdown headings
  const headingPattern = /^#+\s+(.+)$/gm;
  let match;
  while ((match = headingPattern.exec(content)) !== null) {
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

function findBrokenLinks(files) {
  const brokenLinks = [];
  const fileIndex = new Map(); // filename -> [paths]

  // Build file index for quick lookup
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (!fileIndex.has(name)) {
      fileIndex.set(name, []);
    }
    fileIndex.get(name).push(file);
  }

  for (const file of files) {
    const content = fs.readFileSync(file.path, 'utf8');
    let match;

    // Reset regex
    MARKDOWN_LINK_PATTERN.lastIndex = 0;

    while ((match = MARKDOWN_LINK_PATTERN.exec(content)) !== null) {
      const text = match[1];
      const href = match[2];
      const position = match.index;

      if (isExternalLink(href)) continue;

      // Parse anchor from href
      let filePath = href;
      let anchor = null;

      if (href.includes('#')) {
        const parts = href.split('#');
        filePath = parts[0];
        anchor = parts[1];
      }

      // Pure anchor link - validate against current file
      if (!filePath && anchor) {
        const sourceAnchors = extractAnchors(content);
        if (!sourceAnchors.has(anchor)) {
          brokenLinks.push({
            sourceFile: file.relativePath,
            sourceDir: file.dir,
            linkText: text,
            href: href,
            type: 'anchor',
            anchor: anchor,
            position: position,
            availableAnchors: Array.from(sourceAnchors)
          });
        }
        continue;
      }

      // Resolve target path
      let targetPath;
      if (filePath.startsWith('/')) {
        targetPath = path.join(DOCS_DIR, filePath);
      } else {
        targetPath = path.resolve(file.dir, filePath);
      }
      targetPath = path.normalize(targetPath);

      // Check if file exists
      let targetExists = fs.existsSync(targetPath);

      // Try adding .md extension
      if (!targetExists && !targetPath.endsWith('.md')) {
        if (fs.existsSync(targetPath + '.md')) {
          targetPath = targetPath + '.md';
          targetExists = true;
        }
      }

      if (!targetExists) {
        brokenLinks.push({
          sourceFile: file.relativePath,
          sourceDir: file.dir,
          linkText: text,
          href: href,
          type: 'file',
          targetPath: path.relative(ROOT_DIR, targetPath),
          position: position
        });
        continue;
      }

      // Check if it's a directory
      if (fs.statSync(targetPath).isDirectory()) {
        const indexPath = path.join(targetPath, 'index.md');
        const readmePath = path.join(targetPath, 'README.md');
        if (!fs.existsSync(indexPath) && !fs.existsSync(readmePath)) {
          brokenLinks.push({
            sourceFile: file.relativePath,
            sourceDir: file.dir,
            linkText: text,
            href: href,
            type: 'directory',
            targetPath: path.relative(ROOT_DIR, targetPath),
            position: position
          });
        }
        continue;
      }

      // Validate anchor if present
      if (anchor) {
        const targetContent = fs.readFileSync(targetPath, 'utf8');
        const targetAnchors = extractAnchors(targetContent);
        if (!targetAnchors.has(anchor)) {
          brokenLinks.push({
            sourceFile: file.relativePath,
            sourceDir: file.dir,
            linkText: text,
            href: href,
            type: 'anchor',
            anchor: anchor,
            targetFile: path.relative(ROOT_DIR, targetPath),
            position: position,
            availableAnchors: Array.from(targetAnchors)
          });
        }
      }
    }
  }

  return brokenLinks;
}

// ============================================================================
// FIX STRATEGIES
// ============================================================================

/**
 * Strategy 1: Pattern Detection
 * Find bulk moves like /old-path/*.md -> /new-path/*.md
 */
function detectPatterns(brokenLinks, files) {
  const patterns = [];
  const pathTransforms = new Map(); // "old-dir -> new-dir" => count

  // Group broken links by their directory structure
  for (const link of brokenLinks) {
    if (link.type !== 'file') continue;

    const brokenDir = path.dirname(link.targetPath);
    const brokenName = path.basename(link.targetPath);

    // Find files with same name in different locations
    for (const file of files) {
      if (file.name.toLowerCase() === brokenName.toLowerCase()) {
        const newDir = path.dirname(file.relativePath);
        if (newDir !== brokenDir) {
          const key = `${brokenDir} -> ${newDir}`;
          pathTransforms.set(key, (pathTransforms.get(key) || 0) + 1);
        }
      }
    }
  }

  // Identify significant patterns
  for (const [transform, count] of pathTransforms.entries()) {
    if (count >= PATTERN_MIN_OCCURRENCES) {
      const [oldDir, newDir] = transform.split(' -> ');
      patterns.push({
        type: 'directory_move',
        oldPath: oldDir,
        newPath: newDir,
        affectedLinks: count,
        confidence: Math.min(95, 70 + count * 2) // Higher count = higher confidence
      });
    }
  }

  return patterns;
}

/**
 * Strategy 2: Git History Analysis
 * Find files that were renamed in git
 */
function analyzeGitHistory() {
  const renames = new Map();

  try {
    // Get file renames from git log (last 100 commits)
    const gitLog = execSync(
      'git log --diff-filter=R --name-status --pretty=format:"" -100',
      { cwd: ROOT_DIR, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    const lines = gitLog.split('\n').filter(l => l.startsWith('R'));
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const oldPath = parts[1];
        const newPath = parts[2];
        if (oldPath.endsWith('.md') && newPath.endsWith('.md')) {
          renames.set(oldPath, {
            newPath: newPath,
            confidence: 98 // Git renames are highly reliable
          });
        }
      }
    }
  } catch (_e) {
    // Git not available or error - skip this strategy
  }

  return renames;
}

/**
 * Strategy 3: Fuzzy Filename Matching
 */
function fuzzyMatchFilename(brokenPath, files) {
  const brokenName = path.basename(brokenPath, '.md').toLowerCase();
  const candidates = [];

  for (const file of files) {
    const fileName = path.basename(file.relativePath, '.md').toLowerCase();

    // Calculate similarity
    const similarity = calculateSimilarity(brokenName, fileName);

    if (similarity > 0.5) {
      candidates.push({
        path: file.relativePath,
        similarity: similarity,
        confidence: Math.round(similarity * 100)
      });
    }
  }

  // Sort by similarity descending
  candidates.sort((a, b) => b.similarity - a.similarity);

  return candidates.slice(0, 5); // Top 5 candidates
}

/**
 * Strategy 4: Anchor Fuzzy Matching
 */
function fuzzyMatchAnchor(brokenAnchor, availableAnchors) {
  const candidates = [];

  for (const anchor of availableAnchors) {
    const similarity = calculateSimilarity(brokenAnchor, anchor);

    if (similarity > 0.6) {
      candidates.push({
        anchor: anchor,
        similarity: similarity,
        confidence: Math.round(similarity * 100)
      });
    }
  }

  candidates.sort((a, b) => b.similarity - a.similarity);
  return candidates.slice(0, 3);
}

/**
 * Levenshtein-based similarity (0-1)
 */
function calculateSimilarity(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;

  const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));

  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;

  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }

  const distance = matrix[len2][len1];
  return 1 - (distance / Math.max(len1, len2));
}

// ============================================================================
// FIX GENERATION
// ============================================================================

function generateFixes(brokenLinks, files) {
  const fixes = [];
  const gitRenames = analyzeGitHistory();
  const patterns = detectPatterns(brokenLinks, files);

  console.log(`\n🔍 Analyzing ${brokenLinks.length} broken links...`);
  console.log(`📊 Found ${patterns.length} bulk patterns`);
  console.log(`📚 Found ${gitRenames.size} git renames`);

  for (const link of brokenLinks) {
    const fix = {
      sourceFile: link.sourceFile,
      linkText: link.linkText,
      originalHref: link.href,
      type: link.type,
      position: link.position,
      suggestedFix: null,
      confidence: 0,
      strategy: null,
      candidates: []
    };

    if (link.type === 'file') {
      // Check git renames first (highest confidence)
      const gitMatch = gitRenames.get(link.targetPath);
      if (gitMatch) {
        fix.suggestedFix = calculateRelativePath(link.sourceDir, gitMatch.newPath);
        fix.confidence = gitMatch.confidence;
        fix.strategy = 'git_rename';
      }

      // Check pattern matches
      if (!fix.suggestedFix) {
        for (const pattern of patterns) {
          if (link.targetPath.startsWith(pattern.oldPath)) {
            const newPath = link.targetPath.replace(pattern.oldPath, pattern.newPath);
            if (fs.existsSync(path.join(ROOT_DIR, newPath))) {
              fix.suggestedFix = calculateRelativePath(link.sourceDir, newPath);
              fix.confidence = pattern.confidence;
              fix.strategy = 'pattern_match';
              break;
            }
          }
        }
      }

      // Fuzzy filename match
      if (!fix.suggestedFix) {
        const candidates = fuzzyMatchFilename(link.targetPath, files);
        fix.candidates = candidates;

        if (candidates.length > 0 && candidates[0].confidence >= 70) {
          fix.suggestedFix = calculateRelativePath(link.sourceDir, candidates[0].path);
          fix.confidence = candidates[0].confidence;
          fix.strategy = 'fuzzy_filename';
        }
      }
    } else if (link.type === 'anchor') {
      if (link.availableAnchors && link.availableAnchors.length > 0) {
        const candidates = fuzzyMatchAnchor(link.anchor, link.availableAnchors);
        fix.candidates = candidates;

        if (candidates.length > 0 && candidates[0].confidence >= 70) {
          // Reconstruct href with new anchor
          const basePath = link.href.split('#')[0];
          fix.suggestedFix = basePath ? `${basePath}#${candidates[0].anchor}` : `#${candidates[0].anchor}`;
          fix.confidence = candidates[0].confidence;
          fix.strategy = 'fuzzy_anchor';
        }
      }
    } else if (link.type === 'directory') {
      // Check for README.md or suggest creating one
      const _readmePath = path.join(ROOT_DIR, link.targetPath, 'README.md');
      const _indexPath = path.join(ROOT_DIR, link.targetPath, 'index.md');

      // Look for any .md file in the directory
      const dirPath = path.join(ROOT_DIR, link.targetPath);
      if (fs.existsSync(dirPath)) {
        try {
          const dirFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
          if (dirFiles.length > 0) {
            const targetFile = path.join(link.targetPath, dirFiles[0]);
            fix.suggestedFix = calculateRelativePath(link.sourceDir, targetFile);
            fix.confidence = 75;
            fix.strategy = 'directory_first_file';
            fix.note = `Directory has ${dirFiles.length} .md files, linking to first one`;
          }
        } catch (_e) { /* skip */ }
      }
    }

    fixes.push(fix);
  }

  return { fixes, patterns };
}

function calculateRelativePath(sourceDir, targetPath) {
  const targetFullPath = path.join(ROOT_DIR, targetPath);
  const relativePath = path.relative(sourceDir, targetFullPath);
  return relativePath.replace(/\\/g, '/'); // Normalize to forward slashes
}

// ============================================================================
// FIX APPLICATION
// ============================================================================

function applyFixes(fixes, minConfidence = DEFAULT_MIN_CONFIDENCE, dryRun = false) {
  const applied = [];
  const skipped = [];
  const fileChanges = new Map(); // file -> [{original, replacement}]

  // Group fixes by source file
  for (const fix of fixes) {
    if (fix.confidence >= minConfidence && fix.suggestedFix) {
      if (!fileChanges.has(fix.sourceFile)) {
        fileChanges.set(fix.sourceFile, []);
      }
      fileChanges.get(fix.sourceFile).push({
        original: fix.originalHref,
        replacement: fix.suggestedFix,
        linkText: fix.linkText,
        confidence: fix.confidence,
        strategy: fix.strategy
      });
      applied.push(fix);
    } else {
      skipped.push(fix);
    }
  }

  if (dryRun) {
    console.log('\n🔍 DRY RUN - No changes will be made\n');
  }

  // Apply changes to each file
  let filesModified = 0;
  let linksFixed = 0;

  for (const [filePath, changes] of fileChanges.entries()) {
    const fullPath = path.join(ROOT_DIR, filePath);

    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  Source file not found: ${filePath}`);
      continue;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    let modified = false;

    for (const change of changes) {
      // Create regex to match the exact link
      const escapedOriginal = change.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const linkPattern = new RegExp(
        `\\[([^\\]]*)\\]\\(${escapedOriginal}\\)`,
        'g'
      );

      const newContent = content.replace(linkPattern, `[$1](${change.replacement})`);

      if (newContent !== content) {
        content = newContent;
        modified = true;
        linksFixed++;

        if (dryRun) {
          console.log(`  📝 ${filePath}`);
          console.log(`     [${change.linkText.substring(0, 30)}...](${change.original})`);
          console.log(`     → (${change.replacement}) [${change.confidence}% ${change.strategy}]`);
        }
      }
    }

    if (modified && !dryRun) {
      fs.writeFileSync(fullPath, content, 'utf8');
      filesModified++;
    }
  }

  return {
    applied: applied.length,
    skipped: skipped.length,
    filesModified,
    linksFixed,
    skippedDetails: skipped
  };
}

// ============================================================================
// MANIFEST MANAGEMENT
// ============================================================================

function saveManifest(data) {
  const manifestDir = path.dirname(MANIFEST_PATH);
  if (!fs.existsSync(manifestDir)) {
    fs.mkdirSync(manifestDir, { recursive: true });
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\n📝 Manifest saved: ${path.relative(ROOT_DIR, MANIFEST_PATH)}`);
}

function _loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

// ============================================================================
// REPORTING
// ============================================================================

function printSummary(fixes, patterns) {
  const byConfidence = {
    high: fixes.filter(f => f.confidence >= 90),
    medium: fixes.filter(f => f.confidence >= 70 && f.confidence < 90),
    low: fixes.filter(f => f.confidence >= 50 && f.confidence < 70),
    manual: fixes.filter(f => f.confidence < 50)
  };

  const byStrategy = {};
  for (const fix of fixes) {
    const strategy = fix.strategy || 'no_match';
    byStrategy[strategy] = (byStrategy[strategy] || 0) + 1;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 FIX ANALYSIS SUMMARY');
  console.log('='.repeat(60));

  console.log('\n🎯 By Confidence Level:');
  console.log(`   High (≥90%):    ${byConfidence.high.length} links - Auto-fix recommended`);
  console.log(`   Medium (70-89%): ${byConfidence.medium.length} links - Auto-fix with review`);
  console.log(`   Low (50-69%):   ${byConfidence.low.length} links - Manual review suggested`);
  console.log(`   No match (<50%): ${byConfidence.manual.length} links - Manual fix required`);

  console.log('\n🔧 By Strategy:');
  for (const [strategy, count] of Object.entries(byStrategy)) {
    const label = {
      'git_rename': 'Git rename history',
      'pattern_match': 'Bulk pattern detection',
      'fuzzy_filename': 'Fuzzy filename match',
      'fuzzy_anchor': 'Fuzzy anchor match',
      'directory_first_file': 'Directory redirect',
      'no_match': 'No match found'
    }[strategy] || strategy;
    console.log(`   ${label}: ${count}`);
  }

  if (patterns.length > 0) {
    console.log('\n🔄 Detected Patterns:');
    for (const pattern of patterns) {
      console.log(`   ${pattern.oldPath}/ → ${pattern.newPath}/`);
      console.log(`      Affects ${pattern.affectedLinks} links (${pattern.confidence}% confidence)`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
}

function printManualReviewList(fixes) {
  const needsReview = fixes.filter(f => f.confidence < 70);

  if (needsReview.length === 0) {
    console.log('\n✅ No links require manual review!');
    return;
  }

  console.log(`\n📋 MANUAL REVIEW REQUIRED (${needsReview.length} links)`);
  console.log('='.repeat(60));

  // Group by source file
  const byFile = {};
  for (const fix of needsReview) {
    if (!byFile[fix.sourceFile]) {
      byFile[fix.sourceFile] = [];
    }
    byFile[fix.sourceFile].push(fix);
  }

  for (const [file, fileFixes] of Object.entries(byFile)) {
    console.log(`\n📄 ${file}`);
    for (const fix of fileFixes.slice(0, 5)) {
      console.log(`   ❌ [${fix.linkText.substring(0, 30)}...](${fix.originalHref})`);
      if (fix.candidates && fix.candidates.length > 0) {
        console.log('      Possible matches:');
        for (const c of fix.candidates.slice(0, 2)) {
          console.log(`        - ${c.path || c.anchor} (${c.confidence}%)`);
        }
      } else {
        console.log('      No candidates found - may be deleted');
      }
    }
    if (fileFixes.length > 5) {
      console.log(`   ... and ${fileFixes.length - 5} more`);
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  const analyze = args.includes('--analyze');
  const apply = args.includes('--apply');
  const report = args.includes('--report');
  const dryRun = args.includes('--dry-run');
  const json = args.includes('--json');

  // Parse min-confidence
  let minConfidence = DEFAULT_MIN_CONFIDENCE;
  const confArg = args.find(a => a.startsWith('--min-confidence='));
  if (confArg) {
    minConfidence = parseInt(confArg.split('=')[1], 10);
  }

  console.log('🔗 Intelligent Documentation Link Fixer');
  console.log('='.repeat(50));

  // Find all markdown files
  const files = findAllMdFiles();
  console.log(`📂 Found ${files.length} markdown files`);

  // Find broken links
  const brokenLinks = findBrokenLinks(files);
  console.log(`❌ Found ${brokenLinks.length} broken links`);

  if (brokenLinks.length === 0) {
    console.log('\n✅ No broken links found!');
    process.exit(0);
  }

  // Generate fixes
  const { fixes, patterns } = generateFixes(brokenLinks, files);

  // Print summary
  printSummary(fixes, patterns);

  if (analyze || (!apply && !report)) {
    // Save manifest
    saveManifest({
      generated: new Date().toISOString(),
      totalBroken: brokenLinks.length,
      patterns: patterns,
      fixes: fixes
    });

    console.log('\n💡 Next steps:');
    console.log(`   node scripts/fix-doc-links.js --apply              # Apply fixes ≥${DEFAULT_MIN_CONFIDENCE}% confidence`);
    console.log('   node scripts/fix-doc-links.js --apply --min-confidence=90  # Higher threshold');
    console.log('   node scripts/fix-doc-links.js --dry-run --apply    # Preview changes');
    console.log('   node scripts/fix-doc-links.js --report             # See manual review list');
  }

  if (apply) {
    console.log(`\n🔧 Applying fixes with confidence ≥${minConfidence}%...`);
    const result = applyFixes(fixes, minConfidence, dryRun);

    if (!dryRun) {
      console.log(`\n✅ Applied ${result.linksFixed} fixes across ${result.filesModified} files`);
      console.log(`⏭️  Skipped ${result.skipped} links (below confidence threshold)`);
    } else {
      console.log(`\n📋 Would apply ${result.applied} fixes (${result.skipped} skipped)`);
    }
  }

  if (report) {
    printManualReviewList(fixes);
  }

  if (json) {
    console.log('\n--- JSON OUTPUT ---');
    console.log(JSON.stringify({
      totalBroken: brokenLinks.length,
      fixable: fixes.filter(f => f.confidence >= minConfidence).length,
      patterns: patterns,
      byConfidence: {
        high: fixes.filter(f => f.confidence >= 90).length,
        medium: fixes.filter(f => f.confidence >= 70 && f.confidence < 90).length,
        low: fixes.filter(f => f.confidence >= 50 && f.confidence < 70).length,
        manual: fixes.filter(f => f.confidence < 50).length
      }
    }, null, 2));
  }

  // Exit code based on remaining unfixable links
  const unfixable = fixes.filter(f => f.confidence < 50).length;
  process.exit(unfixable > 0 ? 1 : 0);
}

main();
