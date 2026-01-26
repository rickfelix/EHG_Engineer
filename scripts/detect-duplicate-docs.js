#!/usr/bin/env node
/**
 * DOCMON Duplicate Detection Suite
 * Multi-method duplicate document detection for documentation management
 *
 * Exit codes:
 *   0 - No actionable duplicates found
 *   1 - Runtime error
 *   2 - Actionable duplicates found
 *
 * Part of SD-LEO-INFRA-DOCMON-SUB-AGENT-001-B
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  normalizeForComparison,
  normalizeFilename,
  extractKeywords,
  jaccardSimilarity,
  keywordOverlap,
  fuzzySimilarity,
  isFalsePositive
} from './modules/docmon/pattern-library.js';
import {
  findMdFiles
} from './modules/docmon/file-scanner.js';
import {
  findRepoRoot
} from './modules/docmon/config-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default configuration - tuned for high precision (minimize false positives)
const DEFAULT_CONFIG = {
  fuzzy_threshold: 0.85,       // Title similarity threshold
  cosine_threshold: 0.85,      // Content vector similarity
  jaccard_threshold: 0.60,     // Keyword set similarity
  keyword_overlap_threshold: 25, // Minimum shared keywords
  min_content_length: 100,     // Skip files below this length
  max_files: 5000,             // Safety limit
  skip_sibling_schema_docs: true // Skip comparing files in same schema dir
};

// Directories where files commonly share template structure (not true duplicates)
const TEMPLATE_DIRS = [
  /schema[\/\\].*[\/\\]tables[\/\\]/i,
  /schema[\/\\].*[\/\\]views[\/\\]/i,
  /schema[\/\\].*[\/\\]functions[\/\\]/i,
  /reference[\/\\]schema[\/\\]/i
];

// Filenames that are expected to exist in multiple directories (not duplicates)
const COMMON_FILENAMES = new Set([
  'readme', 'index', 'changelog', 'summary', 'overview'
]);

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    paths: args.filter(a => !a.startsWith('--')),
    out: args.find(a => a.startsWith('--out='))?.split('=')[1],
    failOnDuplicates: args.includes('--fail-on-duplicates'),
    config: args.find(a => a.startsWith('--config='))?.split('=')[1],
    format: args.find(a => a.startsWith('--format='))?.split('=')[1] || 'json',
    verbose: args.includes('--verbose'),
    json: args.includes('--json'), // Legacy support
    topic: args.find(a => a.startsWith('--topic='))?.split('=')[1], // Legacy support
    help: args.includes('--help') || args.includes('-h')
  };
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
DOCMON Duplicate Detection Suite

Usage: node detect-duplicate-docs.js [paths...] [options]

Options:
  --out=<path>           Write output to file (default: stdout)
  --fail-on-duplicates   Exit with code 2 if duplicates found
  --config=<path>        Path to config file with thresholds
  --format=<format>      Output format: json (default), text
  --verbose              Show progress messages
  --json                 Legacy: equivalent to --format=json
  --topic=<keywords>     Filter to files matching keywords
  --help, -h             Show this help message

Exit codes:
  0 - No actionable duplicates found
  1 - Runtime error
  2 - Actionable duplicates found (with --fail-on-duplicates)

Examples:
  node detect-duplicate-docs.js docs/
  node detect-duplicate-docs.js docs/ --out=duplicates.json
  node detect-duplicate-docs.js docs/ --fail-on-duplicates
  node detect-duplicate-docs.js docs/ --config=.docmon/duplicates.json
`);
}

/**
 * Load configuration from file
 */
function loadConfig(configPath) {
  if (!configPath) return DEFAULT_CONFIG;

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);
    return { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    console.error(`Warning: Could not load config from ${configPath}, using defaults`);
    return DEFAULT_CONFIG;
  }
}

/**
 * Extract title from markdown content
 */
function extractTitle(content, filename) {
  // Try to find H1 heading
  const h1Match = content.match(/^#\s+(.+?)(?:\n|$)/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // Try YAML frontmatter title
  const yamlMatch = content.match(/^---\n[\s\S]*?title:\s*["']?(.+?)["']?\n[\s\S]*?---/);
  if (yamlMatch) {
    return yamlMatch[1].trim();
  }

  // Fallback to filename without extension
  return path.basename(filename, path.extname(filename));
}

/**
 * Compute MD5 hash of content
 */
function computeHash(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Compute TF-IDF vectors and cosine similarity
 */
function computeCosineSimilarity(content1, content2) {
  const words1 = extractKeywords(content1, { minLength: 3 });
  const words2 = extractKeywords(content2, { minLength: 3 });

  // Build vocabulary
  const vocab = new Set([...words1, ...words2]);
  if (vocab.size === 0) return 0;

  // Build frequency vectors
  const freq1 = {};
  const freq2 = {};
  words1.forEach(w => freq1[w] = (freq1[w] || 0) + 1);
  words2.forEach(w => freq2[w] = (freq2[w] || 0) + 1);

  // Compute cosine similarity
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (const word of vocab) {
    const v1 = freq1[word] || 0;
    const v2 = freq2[word] || 0;
    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  }

  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Generate stable pair ID
 */
function generatePairId(path1, path2) {
  const sorted = [path1, path2].sort();
  return computeHash(sorted.join('|')).substring(0, 8);
}

/**
 * Check if two files are siblings in a template directory
 * (e.g., both in schema/tables/ - these share template structure)
 */
function areSiblingTemplateFiles(path1, path2) {
  for (const pattern of TEMPLATE_DIRS) {
    const match1 = pattern.test(path1);
    const match2 = pattern.test(path2);
    if (match1 && match2) {
      const dir1 = path.dirname(path1);
      const dir2 = path.dirname(path2);
      if (dir1 === dir2) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Run all detection methods on file pairs
 */
function detectDuplicates(files, config, verbose) {
  const startTime = Date.now();
  const duplicates = [];
  const seenPairs = new Set();

  // Pre-compute file data
  if (verbose) console.error('Pre-processing files...');
  const fileData = files.map(f => {
    const content = fs.readFileSync(f.path, 'utf8');
    const normalizedContent = normalizeForComparison(content);
    return {
      path: f.relativePath || f.path,
      name: f.name,
      content,
      normalizedContent,
      title: extractTitle(content, f.name),
      hash: computeHash(normalizedContent),
      keywords: extractKeywords(content),
      normalizedFilename: normalizeFilename(f.name)
    };
  });

  const methodTiming = {
    filename: 0,
    title: 0,
    content_hash: 0,
    content_similarity: 0,
    keyword: 0
  };

  let comparisonsCount = 0;

  // Compare all pairs
  let skippedSiblings = 0;
  for (let i = 0; i < fileData.length; i++) {
    for (let j = i + 1; j < fileData.length; j++) {
      comparisonsCount++;
      const file1 = fileData[i];
      const file2 = fileData[j];
      const pairId = generatePairId(file1.path, file2.path);

      if (seenPairs.has(pairId)) continue;

      // Skip sibling files in template directories (schema docs, etc.)
      if (config.skip_sibling_schema_docs && areSiblingTemplateFiles(file1.path, file2.path)) {
        skippedSiblings++;
        continue;
      }

      // Method 1: Filename match (skip empty and common filenames)
      let methodStart = Date.now();
      if (file1.normalizedFilename &&
          file1.normalizedFilename === file2.normalizedFilename &&
          file1.normalizedFilename.length >= 3 &&
          !COMMON_FILENAMES.has(file1.normalizedFilename.toLowerCase())) {
        if (!isFalsePositive(file1, file2, 'filename')) {
          duplicates.push({
            pair_id: pairId,
            method: 'filename',
            confidence: 1.0,
            file1: file1.path,
            file2: file2.path,
            details: {
              normalized_name: file1.normalizedFilename
            }
          });
          seenPairs.add(pairId);
        }
      }
      methodTiming.filename += Date.now() - methodStart;

      // Method 2: Title similarity
      methodStart = Date.now();
      const titleSim = fuzzySimilarity(
        normalizeForComparison(file1.title),
        normalizeForComparison(file2.title)
      );
      if (titleSim >= config.fuzzy_threshold && !seenPairs.has(pairId)) {
        if (!isFalsePositive({ name: file1.title }, { name: file2.title }, 'title')) {
          duplicates.push({
            pair_id: pairId,
            method: 'title',
            confidence: titleSim,
            file1: file1.path,
            file2: file2.path,
            details: {
              title1: file1.title,
              title2: file2.title,
              similarity: titleSim
            }
          });
          seenPairs.add(pairId);
        }
      }
      methodTiming.title += Date.now() - methodStart;

      // Method 3: Content hash (exact match)
      methodStart = Date.now();
      if (file1.hash === file2.hash && !seenPairs.has(pairId)) {
        duplicates.push({
          pair_id: pairId,
          method: 'content_hash',
          confidence: 1.0,
          file1: file1.path,
          file2: file2.path,
          details: {
            hash: file1.hash
          }
        });
        seenPairs.add(pairId);
      }
      methodTiming.content_hash += Date.now() - methodStart;

      // Method 4: Content similarity (cosine)
      methodStart = Date.now();
      if (file1.content.length >= config.min_content_length &&
          file2.content.length >= config.min_content_length &&
          !seenPairs.has(pairId)) {
        const cosineSim = computeCosineSimilarity(file1.normalizedContent, file2.normalizedContent);
        if (cosineSim >= config.cosine_threshold) {
          duplicates.push({
            pair_id: pairId,
            method: 'content_similarity',
            confidence: cosineSim,
            file1: file1.path,
            file2: file2.path,
            details: {
              cosine_similarity: cosineSim
            }
          });
          seenPairs.add(pairId);
        }
      }
      methodTiming.content_similarity += Date.now() - methodStart;

      // Method 5: Keyword overlap
      // Requires BOTH high Jaccard similarity AND high overlap count
      // to reduce false positives from files that share common domain terminology
      methodStart = Date.now();
      if (!seenPairs.has(pairId)) {
        const overlap = keywordOverlap(file1.keywords, file2.keywords);
        const jaccard = jaccardSimilarity(file1.keywords, file2.keywords);

        // Both conditions must be met (AND, not OR) to reduce false positives
        if (jaccard >= config.jaccard_threshold && overlap >= config.keyword_overlap_threshold) {
          duplicates.push({
            pair_id: pairId,
            method: 'keyword',
            confidence: (jaccard + overlap / 50) / 2, // Average of Jaccard and normalized overlap
            file1: file1.path,
            file2: file2.path,
            details: {
              jaccard_similarity: jaccard,
              keyword_overlap: overlap
            }
          });
          seenPairs.add(pairId);
        }
      }
      methodTiming.keyword += Date.now() - methodStart;
    }
  }

  // Sort by confidence (descending)
  duplicates.sort((a, b) => b.confidence - a.confidence);

  return {
    duplicates,
    stats: {
      files_scanned: files.length,
      comparisons: comparisonsCount,
      duplicates_found: duplicates.length,
      execution_time_ms: Date.now() - startTime,
      method_timing: methodTiming
    }
  };
}

/**
 * Format text output
 */
function formatTextOutput(result) {
  const lines = [];

  lines.push('\n' + '='.repeat(60));
  lines.push('  DOCMON DUPLICATE DETECTION');
  lines.push('='.repeat(60) + '\n');

  lines.push(`  Files scanned: ${result.stats.files_scanned}`);
  lines.push(`  Comparisons: ${result.stats.comparisons}`);
  lines.push(`  Duplicates found: ${result.stats.duplicates_found}`);
  lines.push(`  Execution time: ${result.stats.execution_time_ms}ms`);
  lines.push('');

  if (result.duplicates.length > 0) {
    lines.push('  POTENTIAL DUPLICATES:');
    for (const d of result.duplicates.slice(0, 20)) {
      lines.push(`\n    [${d.method}] Confidence: ${Math.round(d.confidence * 100)}%`);
      lines.push(`      - ${d.files[0]}`);
      lines.push(`      - ${d.files[1]}`);
    }
    if (result.duplicates.length > 20) {
      lines.push(`\n    ... and ${result.duplicates.length - 20} more`);
    }
    lines.push('');
  }

  const status = result.duplicates.length === 0 ? 'PASS' : 'DUPLICATES FOUND';
  const icon = status === 'PASS' ? '\u2705' : '\u26a0\ufe0f';
  lines.push(`  ${icon} RESULT: ${status}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Main entry point
 */
async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  let repoRoot;
  try {
    repoRoot = findRepoRoot();
  } catch {
    repoRoot = path.resolve(__dirname, '..');
  }
  const config = loadConfig(args.config);

  // Determine paths to scan
  let paths = args.paths;
  if (paths.length === 0) {
    paths = [path.join(repoRoot, 'docs')];
  }

  // Collect all files
  if (args.verbose) console.error('Scanning for markdown files...');
  let allFiles = [];
  for (const p of paths) {
    const fullPath = path.isAbsolute(p) ? p : path.join(repoRoot, p);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        allFiles.push(...findMdFiles(fullPath, { relativeTo: repoRoot }));
      } else if (fullPath.endsWith('.md')) {
        allFiles.push({
          path: fullPath,
          relativePath: path.relative(repoRoot, fullPath),
          name: path.basename(fullPath)
        });
      }
    } else {
      console.error(`Warning: Path not found: ${p}`);
    }
  }

  // Topic filter (legacy support)
  if (args.topic) {
    const keywords = args.topic.toLowerCase().split(/[,\s]+/);
    allFiles = allFiles.filter(f => {
      const content = fs.readFileSync(f.path, 'utf8').toLowerCase();
      return keywords.some(k => content.includes(k) || f.name.toLowerCase().includes(k));
    });
    if (args.verbose) {
      console.error(`Filtered to ${allFiles.length} files matching topic: "${args.topic}"`);
    }
  }

  if (allFiles.length === 0) {
    const result = {
      docmon_version: '1.0.0',
      timestamp: new Date().toISOString(),
      duplicates: [],
      stats: {
        files_scanned: 0,
        comparisons: 0,
        duplicates_found: 0,
        skipped_files: 0,
        execution_time_ms: 0
      }
    };
    if (args.format === 'text' && !args.json) {
      console.log(formatTextOutput(result));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    process.exit(0);
  }

  if (allFiles.length > config.max_files) {
    console.error(`Warning: Found ${allFiles.length} files, limiting to ${config.max_files}`);
    allFiles = allFiles.slice(0, config.max_files);
  }

  if (args.verbose) {
    console.error(`Found ${allFiles.length} files to analyze`);
  }

  // Run detection
  const { duplicates, stats } = detectDuplicates(allFiles, config, args.verbose);

  // Build output
  const result = {
    docmon_version: '1.0.0',
    timestamp: new Date().toISOString(),
    config: {
      fuzzy_threshold: config.fuzzy_threshold,
      cosine_threshold: config.cosine_threshold,
      jaccard_threshold: config.jaccard_threshold,
      keyword_overlap_threshold: config.keyword_overlap_threshold
    },
    stats: {
      files_scanned: stats.files_scanned,
      comparisons: stats.comparisons,
      duplicates_found: stats.duplicates_found,
      skipped_files: 0,
      execution_time_ms: stats.execution_time_ms,
      method_timing: stats.method_timing
    },
    duplicates: duplicates.map(d => ({
      pair_id: d.pair_id,
      method: d.method,
      confidence: Math.round(d.confidence * 100) / 100,
      files: [d.file1, d.file2],
      details: d.details
    }))
  };

  // Output
  if (args.format === 'text' && !args.json) {
    console.log(formatTextOutput(result));
  } else {
    const output = JSON.stringify(result, null, 2);
    if (args.out) {
      const outDir = path.dirname(args.out);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      fs.writeFileSync(args.out, output, 'utf8');
      if (args.verbose) {
        console.error(`Report written to: ${args.out}`);
      }
    } else {
      console.log(output);
    }
  }

  // Exit code
  if (args.failOnDuplicates && duplicates.length > 0) {
    process.exit(2);
  }

  process.exit(0);
}

main().catch(error => {
  console.error(`Runtime error: ${error.message}`);
  process.exit(1);
});
