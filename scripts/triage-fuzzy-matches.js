#!/usr/bin/env node
/**
 * Triage Fuzzy Title Matches
 *
 * Analyzes fuzzy title matches from duplicate detection and categorizes them:
 * - TRUE_DUPLICATE: Same content, should be merged/archived
 * - RELATED: Different but related docs, add cross-references
 * - FALSE_POSITIVE: Common naming pattern, not duplicates
 *
 * Child C of SD-LEO-ORCH-DOCUMENTATION-QUALITY-REMEDIATION-001
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

// Common patterns that cause false positives
const FALSE_POSITIVE_PATTERNS = [
  // Stage numbering patterns (stage-01 vs stage-02 are DIFFERENT stages)
  { pattern: /^stage[-_]?\d+/i, reason: 'Stage numbering - different stages' },
  { pattern: /^\d{2}[a-z]?_/, reason: 'Numeric prefix pattern - different numbered items' },

  // SD naming patterns (SD-XXX-001 vs SD-XXX-002 are DIFFERENT SDs)
  { pattern: /SD-[A-Z]+-\d+/i, reason: 'SD identifier - different directives' },

  // Version patterns (v1 vs v2 are intentionally different)
  { pattern: /_v\d+/i, reason: 'Version suffix - intentional versioning' },
  { pattern: /-v\d+\.\d+/i, reason: 'Semantic version - intentional versioning' },

  // Workflow patterns (LEAD vs PLAN vs EXEC are DIFFERENT workflows)
  { pattern: /^(lead|plan|exec)/i, reason: 'Workflow phase prefix - different phases' },

  // Enhancement patterns (a vs b variants are related but different)
  { pattern: /\d+[ab]_/i, reason: 'Variant suffix - related but distinct' },
];

// Patterns that indicate TRUE duplicates
const TRUE_DUPLICATE_PATTERNS = [
  { pattern: /README/i, reason: 'README files often duplicated' },
  { pattern: /schema[-_]?overview/i, reason: 'Schema docs often duplicated' },
  { pattern: /architecture/i, reason: 'Architecture docs often duplicated' },
];

function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  // Levenshtein distance
  const matrix = Array(shorter.length + 1).fill(null).map(() =>
    Array(longer.length + 1).fill(null)
  );

  for (let i = 0; i <= longer.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= shorter.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= shorter.length; j++) {
    for (let i = 1; i <= longer.length; i++) {
      const cost = longer[i - 1] === shorter[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }

  return (longer.length - matrix[shorter.length][longer.length]) / longer.length;
}

function getContentHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('md5').update(content).digest('hex');
}

function extractTitle(filePath) {
  if (!fs.existsSync(filePath)) return path.basename(filePath, '.md');

  const content = fs.readFileSync(filePath, 'utf8');
  const titleMatch = content.match(/^#\s+(.+?)$/m);
  return titleMatch ? titleMatch[1].trim() : path.basename(filePath, '.md');
}

function categorizeMatch(file1, file2, similarity) {
  const basename1 = path.basename(file1, '.md').toLowerCase();
  const basename2 = path.basename(file2, '.md').toLowerCase();

  // Check for false positive patterns
  for (const { pattern, reason } of FALSE_POSITIVE_PATTERNS) {
    if (pattern.test(basename1) && pattern.test(basename2)) {
      // Both files match the pattern - check if they're the SAME item
      const match1 = basename1.match(pattern);
      const match2 = basename2.match(pattern);

      if (match1 && match2 && match1[0] !== match2[0]) {
        return { category: 'FALSE_POSITIVE', reason };
      }
    }
  }

  // Check content hashes
  const hash1 = getContentHash(file1);
  const hash2 = getContentHash(file2);

  if (hash1 && hash2 && hash1 === hash2) {
    return { category: 'TRUE_DUPLICATE', reason: 'Identical content (same hash)' };
  }

  // Check for true duplicate patterns
  for (const { pattern, reason } of TRUE_DUPLICATE_PATTERNS) {
    if (pattern.test(basename1) || pattern.test(basename2)) {
      if (similarity >= 0.9) {
        return { category: 'TRUE_DUPLICATE', reason };
      }
    }
  }

  // High similarity suggests related docs
  if (similarity >= 0.95) {
    return { category: 'TRUE_DUPLICATE', reason: 'Very high title similarity (≥95%)' };
  } else if (similarity >= 0.85) {
    return { category: 'RELATED', reason: 'High similarity suggests related content' };
  }

  // Default to false positive for moderate similarity
  return { category: 'FALSE_POSITIVE', reason: 'Moderate similarity from common words' };
}

function findMdFiles(dir) {
  const results = [];

  if (!fs.existsSync(dir)) return results;

  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (item.name === 'node_modules' || item.name === '.git' || item.name === 'archive') continue;

    if (item.isDirectory()) {
      results.push(...findMdFiles(fullPath));
    } else if (item.isFile() && item.name.endsWith('.md')) {
      results.push({
        path: fullPath,
        relativePath: path.relative(ROOT_DIR, fullPath),
        name: item.name,
        title: extractTitle(fullPath)
      });
    }
  }

  return results;
}

function findFuzzyMatches(files, threshold = 0.8) {
  const matches = [];

  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const title1 = files[i].title.toLowerCase();
      const title2 = files[j].title.toLowerCase();

      const similarity = calculateSimilarity(title1, title2);

      if (similarity >= threshold) {
        const { category, reason } = categorizeMatch(
          files[i].path,
          files[j].path,
          similarity
        );

        matches.push({
          file1: files[i].relativePath,
          file2: files[j].relativePath,
          title1: files[i].title,
          title2: files[j].title,
          similarity: Math.round(similarity * 100),
          category,
          reason
        });
      }
    }
  }

  return matches;
}

function generateReport(matches) {
  const categories = {
    TRUE_DUPLICATE: matches.filter(m => m.category === 'TRUE_DUPLICATE'),
    RELATED: matches.filter(m => m.category === 'RELATED'),
    FALSE_POSITIVE: matches.filter(m => m.category === 'FALSE_POSITIVE')
  };

  const falsePositiveRate = (categories.FALSE_POSITIVE.length / matches.length * 100).toFixed(1);

  return {
    generated: new Date().toISOString(),
    summary: {
      totalMatches: matches.length,
      trueDuplicates: categories.TRUE_DUPLICATE.length,
      relatedDocs: categories.RELATED.length,
      falsePositives: categories.FALSE_POSITIVE.length,
      falsePositiveRate: `${falsePositiveRate}%`
    },
    thresholdRecommendation: falsePositiveRate > 50
      ? 'Consider raising threshold from 80% to 85% to reduce false positives'
      : 'Current threshold of 80% is producing acceptable results',
    categories
  };
}

function main() {
  const args = process.argv.slice(2);
  const showDetails = args.includes('--details');
  const outputJson = args.includes('--json');
  const threshold = parseFloat(args.find(a => a.startsWith('--threshold='))?.split('=')[1] || '0.8');

  console.log('📊 Fuzzy Title Match Triage');
  console.log('='.repeat(50));

  // Find all markdown files
  const files = findMdFiles(DOCS_DIR);
  console.log(`📂 Found ${files.length} markdown files`);

  // Find fuzzy matches
  const matches = findFuzzyMatches(files, threshold);
  console.log(`🔍 Found ${matches.length} fuzzy title matches (≥${threshold * 100}%)`);

  // Generate report
  const report = generateReport(matches);

  // Print summary
  console.log('\n📊 Triage Summary:');
  console.log('='.repeat(50));
  console.log(`   TRUE_DUPLICATE:  ${report.summary.trueDuplicates} (action: merge/archive)`);
  console.log(`   RELATED:         ${report.summary.relatedDocs} (action: add cross-references)`);
  console.log(`   FALSE_POSITIVE:  ${report.summary.falsePositives} (action: ignore)`);
  console.log(`   False Positive Rate: ${report.summary.falsePositiveRate}`);
  console.log(`\n💡 ${report.thresholdRecommendation}`);

  if (showDetails) {
    console.log('\n📋 TRUE DUPLICATES (need action):');
    console.log('-'.repeat(50));
    for (const m of report.categories.TRUE_DUPLICATE) {
      console.log(`   ${m.similarity}% - ${m.reason}`);
      console.log(`      ${m.file1}`);
      console.log(`      ${m.file2}`);
    }

    console.log('\n📋 RELATED DOCS (add cross-refs):');
    console.log('-'.repeat(50));
    for (const m of report.categories.RELATED) {
      console.log(`   ${m.similarity}% - ${m.reason}`);
      console.log(`      ${m.file1}`);
      console.log(`      ${m.file2}`);
    }

    if (args.includes('--show-false-positives')) {
      console.log('\n📋 FALSE POSITIVES (ignored):');
      console.log('-'.repeat(50));
      for (const m of report.categories.FALSE_POSITIVE) {
        console.log(`   ${m.similarity}% - ${m.reason}`);
        console.log(`      ${m.file1}`);
        console.log(`      ${m.file2}`);
      }
    }
  }

  // Save manifest
  const manifestPath = path.join(DOCS_DIR, 'fixes', 'fuzzy-match-triage-manifest.json');
  const manifestDir = path.dirname(manifestPath);

  if (!fs.existsSync(manifestDir)) {
    fs.mkdirSync(manifestDir, { recursive: true });
  }

  fs.writeFileSync(manifestPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n📝 Manifest saved: ${path.relative(ROOT_DIR, manifestPath)}`);

  if (outputJson) {
    console.log('\n--- JSON OUTPUT ---');
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(0);
}

main();
