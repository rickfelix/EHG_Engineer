/**
 * Module Complexity Scorer — detects complexity hotspots via heuristic analysis
 * SD: SD-LEO-INFRA-COMPLEXITY-SCORER-001
 *
 * Strategies:
 * 1. Function count per file (proxy for complexity)
 * 2. Cyclomatic complexity estimation via control flow keywords
 * 3. File size / line count analysis
 *
 * Uses regex-based heuristics (no AST dependency) for speed and reliability
 * across CJS, ESM, and mixed codebases.
 */
import { readFile, readdir } from 'fs/promises';
import { join, extname } from 'path';
import { loadConfig } from './health-config.mjs';

const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

// Directories to scan for complexity analysis
const SCAN_DIRS = ['lib', 'scripts/modules', 'scripts/eva', 'scripts/hooks'];

// Skip these directories
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'coverage', '.claude', 'test', 'tests', '__tests__']);

// Control flow keywords that contribute to cyclomatic complexity
const COMPLEXITY_KEYWORDS = /\b(if|else\s+if|for|while|do|switch|case|catch|\?\?|&&|\|\||[?]:)/g;

// Function declaration/expression patterns
const FUNCTION_PATTERNS = /\b(function\s+\w+|function\s*\(|=>\s*[{(]|\basync\s+function)/g;

/**
 * Scan for module complexity hotspots
 * @param {string} rootDir - project root directory
 * @param {Object} [options] - scan options
 * @returns {Promise<{ score: number, findings: Object[], metadata: Object }>}
 */
export async function scan(rootDir, options = {}) {
  const config = options.config || await loadConfig('complexity');
  const allowlist = new Set(config?.allowlist || []);
  const start = Date.now();

  const findings = [];
  const moduleMetrics = [];

  // Collect and analyze files from targeted directories
  const jsFiles = [];
  for (const dir of SCAN_DIRS) {
    await collectJSFiles(rootDir, dir, jsFiles);
  }

  // Analyze each file
  for (const relPath of jsFiles) {
    if (allowlist.has(relPath)) continue;

    try {
      const content = await readFile(join(rootDir, relPath), 'utf8');
      const metrics = analyzeFile(content, relPath);
      moduleMetrics.push(metrics);

      // Classify severity based on thresholds
      const complexityThreshold = config?.metadata?.complexity_threshold || 50;
      const warningThreshold = config?.threshold_warning || 70;
      const criticalThreshold = config?.threshold_critical || 50;

      if (metrics.cyclomaticComplexity > complexityThreshold) {
        const severity = metrics.cyclomaticComplexity > complexityThreshold * 2 ? 'critical' : 'warning';
        findings.push({
          file: relPath,
          strategy: 'high_cyclomatic',
          severity,
          reason: `Cyclomatic complexity ${metrics.cyclomaticComplexity} exceeds threshold (${complexityThreshold})`,
          complexity: metrics.cyclomaticComplexity,
          functions: metrics.functionCount,
          lines: metrics.lineCount
        });
      }

      if (metrics.functionCount > 30) {
        findings.push({
          file: relPath,
          strategy: 'high_function_count',
          severity: metrics.functionCount > 60 ? 'critical' : 'warning',
          reason: `File has ${metrics.functionCount} functions (threshold: 30)`,
          complexity: metrics.cyclomaticComplexity,
          functions: metrics.functionCount,
          lines: metrics.lineCount
        });
      }

      if (metrics.lineCount > 500) {
        findings.push({
          file: relPath,
          strategy: 'large_file',
          severity: metrics.lineCount > 1000 ? 'warning' : 'info',
          reason: `File has ${metrics.lineCount} lines (threshold: 500)`,
          complexity: metrics.cyclomaticComplexity,
          functions: metrics.functionCount,
          lines: metrics.lineCount
        });
      }
    } catch {
      // Skip unreadable files
    }
  }

  const scanDuration = Date.now() - start;

  // Score: based on proportion of files with issues
  const totalFiles = moduleMetrics.length || 1;
  const filesWithIssues = new Set(findings.map(f => f.file)).size;
  const issueRatio = filesWithIssues / totalFiles;
  const score = Math.max(0, Math.round((1 - issueRatio) * 100));

  // Calculate aggregate stats
  const avgComplexity = moduleMetrics.length > 0
    ? moduleMetrics.reduce((sum, m) => sum + m.cyclomaticComplexity, 0) / moduleMetrics.length
    : 0;

  return {
    score,
    findings,
    metadata: {
      strategies: {
        high_cyclomatic: findings.filter(f => f.strategy === 'high_cyclomatic').length,
        high_function_count: findings.filter(f => f.strategy === 'high_function_count').length,
        large_file: findings.filter(f => f.strategy === 'large_file').length
      },
      scanned_files: moduleMetrics.length,
      avg_complexity: Math.round(avgComplexity * 10) / 10,
      scan_duration_ms: scanDuration
    },
    finding_count: findings.length
  };
}

/**
 * Analyze a single file for complexity metrics
 */
function analyzeFile(content, filePath) {
  const lines = content.split('\n');
  const lineCount = lines.length;

  // Count control flow keywords (cyclomatic complexity estimate)
  // Reset lastIndex for global regex
  COMPLEXITY_KEYWORDS.lastIndex = 0;
  const complexityMatches = content.match(COMPLEXITY_KEYWORDS);
  const cyclomaticComplexity = (complexityMatches ? complexityMatches.length : 0) + 1; // +1 for base path

  // Count functions
  FUNCTION_PATTERNS.lastIndex = 0;
  const functionMatches = content.match(FUNCTION_PATTERNS);
  const functionCount = functionMatches ? functionMatches.length : 0;

  return {
    file: filePath,
    lineCount,
    cyclomaticComplexity,
    functionCount
  };
}

/**
 * Recursively collect JS files from a directory
 */
async function collectJSFiles(rootDir, relDir, results) {
  const fullDir = join(rootDir, relDir);
  try {
    const entries = await readdir(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const relPath = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        await collectJSFiles(rootDir, relPath, results);
      } else if (JS_EXTENSIONS.has(extname(entry.name))) {
        results.push(relPath);
      }
    }
  } catch {
    // Directory doesn't exist
  }
}
