/**
 * Module Complexity Scorer — detects complexity hotspots via AST analysis
 * SD: SD-LEO-INFRA-COMPLEXITY-SCORER-001
 *
 * Analyzes JS/MJS/CJS files for cyclomatic complexity, file size,
 * and function count. Identifies complexity hotspots and flags modules
 * exceeding configurable thresholds.
 *
 * Detection strategies:
 * 1. Cyclomatic complexity via AST (decision points: if, &&, ||, ?:, case, catch, for, while, do)
 * 2. File size (lines of code)
 * 3. Function count and density
 * 4. Composite score with configurable weights
 */
import { readFile, readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { parse } from 'acorn';

// Directories to scan
const SCAN_DIRS = ['lib', 'scripts/modules', 'scripts/eva', 'scripts/hooks'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'coverage', '.claude', 'tests']);
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

// Scoring weights
const METRIC_WEIGHTS = {
  cyclomatic: 0.5,
  loc: 0.25,
  function_density: 0.25
};

// Thresholds for scoring (inverted — lower complexity = higher score)
const COMPLEXITY_CEILING = 50;  // Cyclomatic >= this = 0 score
const LOC_CEILING = 500;        // Lines >= this = 0 score
const DENSITY_CEILING = 0.15;   // Functions/LOC >= this = 0 score (too dense = complex)

/**
 * Scan codebase for module complexity and produce health dimension result
 * @param {string} rootDir - project root directory
 * @param {Object} [options] - scan options
 * @param {Object} [options.config] - dimension config from codebase_health_config
 * @returns {Promise<{ score: number, findings: Object[], metadata: Object, finding_count: number }>}
 */
export async function scan(rootDir, options = {}) {
  const config = options.config || {};
  const findings = [];
  const metadata = {
    strategies: {},
    scan_duration_ms: 0,
    modules_scanned: 0,
    parse_errors: 0
  };
  const start = Date.now();

  // Collect and analyze all JS files
  const jsFiles = [];
  for (const dir of SCAN_DIRS) {
    await collectJSFiles(rootDir, dir, jsFiles);
  }

  metadata.modules_scanned = jsFiles.length;

  if (jsFiles.length === 0) {
    metadata.scan_duration_ms = Date.now() - start;
    return { score: 100, findings, metadata, finding_count: 0 };
  }

  // Analyze each file
  const moduleMetrics = [];
  for (const relPath of jsFiles) {
    const fullPath = join(rootDir, relPath);
    const metrics = await analyzeFile(fullPath);
    if (metrics) {
      moduleMetrics.push({ path: relPath, ...metrics });
    } else {
      metadata.parse_errors++;
    }
  }

  // Compute composite scores
  const scoredModules = moduleMetrics.map(mod => ({
    ...mod,
    composite: computeCompositeScore(mod)
  }));

  // Sort by composite score ascending (worst first)
  scoredModules.sort((a, b) => a.composite - b.composite);

  // Overall dimension score = average of all module composites
  const overallScore = scoredModules.length > 0
    ? Math.round(scoredModules.reduce((sum, m) => sum + m.composite, 0) / scoredModules.length)
    : 100;

  // Detect threshold breaches
  const thresholdFloor = config.threshold_critical || 30;
  const warningFloor = config.threshold_warning || 50;

  const breached = scoredModules.filter(m => m.composite < thresholdFloor);
  for (const mod of breached) {
    findings.push({
      file: mod.path,
      strategy: 'threshold_breach',
      severity: mod.composite < thresholdFloor * 0.5 ? 'high' : 'medium',
      reason: `Module complexity score ${mod.composite}% below critical threshold ${thresholdFloor}% (cyclomatic: ${mod.cyclomatic}, LOC: ${mod.loc}, functions: ${mod.function_count})`,
      details: {
        module: mod.path,
        composite: mod.composite,
        cyclomatic: mod.cyclomatic,
        loc: mod.loc,
        function_count: mod.function_count,
        threshold: thresholdFloor,
        gap: thresholdFloor - mod.composite
      }
    });
  }
  metadata.strategies.threshold_breaches = breached.length;

  // Warning-level modules
  const warnings = scoredModules.filter(m => m.composite >= thresholdFloor && m.composite < warningFloor);
  for (const mod of warnings) {
    findings.push({
      file: mod.path,
      strategy: 'high_complexity',
      severity: 'info',
      reason: `Module complexity score ${mod.composite}% below warning threshold ${warningFloor}%`,
      details: {
        module: mod.path,
        composite: mod.composite,
        cyclomatic: mod.cyclomatic,
        loc: mod.loc,
        function_count: mod.function_count
      }
    });
  }
  metadata.strategies.high_complexity_warnings = warnings.length;

  // Top-N hotspots in metadata
  const topN = config.hotspot_count || 10;
  metadata.hotspots = scoredModules.slice(0, topN).map(m => ({
    path: m.path,
    composite: m.composite,
    cyclomatic: m.cyclomatic,
    loc: m.loc,
    function_count: m.function_count
  }));

  // Per-module breakdown
  metadata.modules = scoredModules.map(m => ({
    path: m.path,
    composite: m.composite,
    cyclomatic: m.cyclomatic,
    loc: m.loc,
    function_count: m.function_count
  }));

  metadata.scan_duration_ms = Date.now() - start;

  return {
    score: overallScore,
    findings,
    metadata,
    finding_count: findings.length
  };
}

/**
 * Analyze a single file for complexity metrics
 * @param {string} filePath - absolute path to file
 * @returns {Promise<{ cyclomatic: number, loc: number, function_count: number }|null>}
 */
async function analyzeFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n');
    const loc = lines.filter(l => l.trim().length > 0 && !l.trim().startsWith('//')).length;

    let ast;
    try {
      ast = parse(content, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowImportExportEverywhere: true,
        allowAwaitOutsideFunction: true,
        allowReturnOutsideFunction: true,
        allowHashBang: true
      });
    } catch {
      // Try as script (CJS)
      try {
        ast = parse(content, {
          ecmaVersion: 'latest',
          sourceType: 'script',
          allowReturnOutsideFunction: true,
          allowHashBang: true
        });
      } catch {
        return null;
      }
    }

    const cyclomatic = calculateCyclomaticComplexity(ast);
    const function_count = countFunctions(ast);

    return { cyclomatic, loc, function_count };
  } catch {
    return null;
  }
}

/**
 * Calculate cyclomatic complexity from AST
 * Counts decision points: if, &&, ||, ?:, case, catch, for, while, do
 * @param {Object} ast - parsed AST
 * @returns {number} cyclomatic complexity (starts at 1)
 */
function calculateCyclomaticComplexity(ast) {
  let complexity = 1; // Base path

  function walk(node) {
    if (!node || typeof node !== 'object') return;

    switch (node.type) {
      case 'IfStatement':
      case 'ConditionalExpression':
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
      case 'WhileStatement':
      case 'DoWhileStatement':
      case 'CatchClause':
        complexity++;
        break;
      case 'SwitchCase':
        if (node.test) complexity++; // Don't count default
        break;
      case 'LogicalExpression':
        if (node.operator === '&&' || node.operator === '||' || node.operator === '??') {
          complexity++;
        }
        break;
    }

    // Walk children
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(c => walk(c));
      } else if (child && typeof child === 'object' && child.type) {
        walk(child);
      }
    }
  }

  walk(ast);
  return complexity;
}

/**
 * Count function declarations and expressions in AST
 * @param {Object} ast
 * @returns {number}
 */
function countFunctions(ast) {
  let count = 0;

  function walk(node) {
    if (!node || typeof node !== 'object') return;

    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) {
      count++;
    }

    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(c => walk(c));
      } else if (child && typeof child === 'object' && child.type) {
        walk(child);
      }
    }
  }

  walk(ast);
  return count;
}

/**
 * Compute composite complexity score (0-100, higher = healthier/less complex)
 * @param {Object} metrics - { cyclomatic, loc, function_count }
 * @returns {number}
 */
function computeCompositeScore(metrics) {
  // Invert: lower complexity = higher score
  const cyclomaticScore = Math.max(0, Math.min(100,
    100 - (metrics.cyclomatic / COMPLEXITY_CEILING) * 100
  ));

  const locScore = Math.max(0, Math.min(100,
    100 - (metrics.loc / LOC_CEILING) * 100
  ));

  // Function density: functions per LOC
  const density = metrics.loc > 0 ? metrics.function_count / metrics.loc : 0;
  const densityScore = Math.max(0, Math.min(100,
    100 - (density / DENSITY_CEILING) * 100
  ));

  const score =
    cyclomaticScore * METRIC_WEIGHTS.cyclomatic +
    locScore * METRIC_WEIGHTS.loc +
    densityScore * METRIC_WEIGHTS.function_density;

  return Math.round(score * 10) / 10;
}

/**
 * Recursively collect JS files from a subdirectory
 */
async function collectJSFiles(rootDir, relDir, results) {
  const fullDir = join(rootDir, relDir);
  try {
    const entries = await readdir(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = `${relDir}/${entry.name}`;
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.isDirectory()) {
        await collectJSFiles(rootDir, relPath, results);
      } else if (JS_EXTENSIONS.has(extname(entry.name))) {
        results.push(relPath);
      }
    }
  } catch {
    // directory doesn't exist
  }
}

// Export for testing
export {
  analyzeFile,
  computeCompositeScore,
  calculateCyclomaticComplexity,
  countFunctions,
  METRIC_WEIGHTS,
  COMPLEXITY_CEILING,
  LOC_CEILING,
  DENSITY_CEILING
};
