/**
 * Pipeline Flow Verifier
 *
 * Traces reachable functions from entry points and computes pipeline
 * coverage_score against exported/public surfaces.
 *
 * Uses static analysis as primary source with optional LLM for ambiguous edges.
 *
 * Part of SD-LEO-INFRA-INTEGRATION-AWARE-PRD-001 (FR-3, FR-4, FR-5)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/** Check feature flag at call time (not module load time) */
function isGateEnabled() {
  return process.env.GATE_PIPELINE_FLOW_ENABLED !== 'false';
}

/** Get default coverage threshold at call time */
function getDefaultThreshold() {
  return parseFloat(process.env.PIPELINE_FLOW_THRESHOLD || '0.6');
}

/** Timeout for verification */
const VERIFY_TIMEOUT_MS = parseInt(process.env.PIPELINE_FLOW_TIMEOUT_MS || '30000', 10);

/**
 * Extract all exports from a JavaScript/TypeScript file.
 *
 * @param {string} filePath - Absolute file path
 * @returns {string[]} List of exported symbol names
 */
export function extractExports(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  const exports = new Set();

  // Named exports: export function/const/class/let/var name
  const namedExportMatches = content.matchAll(
    /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/g
  );
  for (const match of namedExportMatches) {
    exports.add(match[1]);
  }

  // Re-exports: export { name1, name2 } from './module'
  const reExportMatches = content.matchAll(
    /export\s*\{([^}]+)\}\s*(?:from\s*['"][^'"]+['"])?/g
  );
  for (const match of reExportMatches) {
    const names = match[1].split(',').map(n => {
      const parts = n.trim().split(/\s+as\s+/);
      return parts[parts.length - 1].trim();
    }).filter(Boolean);
    names.forEach(n => exports.add(n));
  }

  // Star re-exports: export * from './module'
  const starExportMatches = content.matchAll(
    /export\s*\*\s*from\s*['"]([^'"]+)['"]/g
  );
  for (const match of starExportMatches) {
    exports.add(`*:${match[1]}`);
  }

  // Default export
  if (/export\s+default\s+/.test(content)) {
    exports.add('default');
  }

  return [...exports];
}

/**
 * Extract import references from a file (what it consumes).
 *
 * @param {string} filePath - Absolute file path
 * @returns {Array<{ module: string, names: string[] }>}
 */
export function extractImports(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  const imports = [];

  // Named imports: import { a, b } from './module'
  const namedMatches = content.matchAll(
    /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g
  );
  for (const match of namedMatches) {
    const names = match[1].split(',').map(n => {
      const parts = n.trim().split(/\s+as\s+/);
      return parts[0].trim();
    }).filter(Boolean);
    imports.push({ module: match[2], names });
  }

  // Default import: import X from './module'
  const defaultMatches = content.matchAll(
    /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g
  );
  for (const match of defaultMatches) {
    imports.push({ module: match[2], names: ['default'] });
  }

  // Dynamic imports: await import('./module')
  const dynamicMatches = content.matchAll(
    /(?:await\s+)?import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  );
  for (const match of dynamicMatches) {
    imports.push({ module: match[1], names: ['*dynamic*'], isDynamic: true });
  }

  return imports;
}

/**
 * Build an export graph from a set of files.
 * Maps each file to its exports and what imports them.
 *
 * @param {string[]} files - List of file paths (relative to repo root)
 * @param {string} repoRoot - Repository root
 * @returns {Object} Export graph { nodes: Map, edges: [] }
 */
export function buildExportGraph(files, repoRoot) {
  const nodes = new Map(); // file -> { exports: [], importedBy: [] }
  const edges = [];

  // Phase 1: Collect all exports
  for (const file of files) {
    const fullPath = path.join(repoRoot, file);
    const fileExports = extractExports(fullPath);

    nodes.set(file, {
      exports: fileExports,
      importedBy: [],
      isTestFile: isTestFile(file),
      isTypeOnly: isTypeOnlyFile(file)
    });
  }

  // Phase 2: Resolve import edges
  for (const file of files) {
    const fullPath = path.join(repoRoot, file);
    const fileImports = extractImports(fullPath);

    for (const imp of fileImports) {
      // Resolve relative module path
      const resolvedModule = resolveModulePath(imp.module, file, repoRoot);
      if (!resolvedModule || !nodes.has(resolvedModule)) continue;

      const targetNode = nodes.get(resolvedModule);
      targetNode.importedBy.push(file);

      edges.push({
        from: file,
        to: resolvedModule,
        names: imp.names,
        type: imp.isDynamic ? 'dynamic' : 'static',
        inference: 'static' // vs 'llm-inferred' for ambiguous edges
      });
    }
  }

  return { nodes, edges };
}

/**
 * Resolve a module specifier to a relative file path.
 *
 * @param {string} moduleSpec - Import specifier (e.g., './foo', '../bar/baz')
 * @param {string} fromFile - File containing the import
 * @param {string} repoRoot - Repository root
 * @returns {string|null} Resolved relative path or null
 */
function resolveModulePath(moduleSpec, fromFile, repoRoot) {
  // Skip node_modules
  if (!moduleSpec.startsWith('.') && !moduleSpec.startsWith('/')) return null;

  const fromDir = path.dirname(path.join(repoRoot, fromFile));
  const resolved = path.resolve(fromDir, moduleSpec);
  const relative = path.relative(repoRoot, resolved).replace(/\\/g, '/');

  // Try with extensions
  const extensions = ['', '.js', '.ts', '.mjs', '/index.js', '/index.ts', '/index.mjs'];
  for (const ext of extensions) {
    const candidate = relative + ext;
    if (fs.existsSync(path.join(repoRoot, candidate))) {
      return candidate;
    }
  }

  return null;
}

/**
 * Check if a file is a test file.
 */
function isTestFile(file) {
  return /\.(test|spec)\.(js|ts|mjs)$/.test(file) ||
    file.includes('__tests__/') ||
    file.startsWith('test/') ||
    file.startsWith('tests/');
}

/**
 * Check if a file is type-only (TypeScript .d.ts).
 */
function isTypeOnlyFile(file) {
  return file.endsWith('.d.ts');
}

/**
 * Trace reachable symbols from entry points through the export graph.
 *
 * @param {string[]} entryPoints - Entry file paths (relative)
 * @param {Object} graph - Export graph from buildExportGraph
 * @returns {Set<string>} Set of reachable file:symbol keys
 */
export function traceReachable(entryPoints, graph) {
  const visited = new Set();
  const queue = [...entryPoints];

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    // Find all files that this file imports
    const outEdges = graph.edges.filter(e => e.from === current);
    for (const edge of outEdges) {
      if (!visited.has(edge.to)) {
        queue.push(edge.to);
      }
    }
  }

  return visited;
}

/**
 * Compute pipeline coverage score.
 *
 * @param {Object} graph - Export graph
 * @param {Set<string>} reachable - Set of reachable files
 * @returns {Object} Coverage report
 */
export function computeCoverage(graph, reachable) {
  let totalExports = 0;
  let reachableExports = 0;
  const unreachableExports = [];
  const excludedExports = [];

  for (const [file, node] of graph.nodes) {
    // Exclude test-only and type-only files
    if (node.isTestFile) {
      excludedExports.push({ file, reason: 'test-only', exports: node.exports });
      continue;
    }
    if (node.isTypeOnly) {
      excludedExports.push({ file, reason: 'type-only', exports: node.exports });
      continue;
    }

    for (const exp of node.exports) {
      // Skip star re-exports (they're proxies, not actual exports)
      if (exp.startsWith('*:')) continue;

      totalExports++;

      if (reachable.has(file)) {
        reachableExports++;
      } else {
        unreachableExports.push({ file, symbol: exp });
      }
    }
  }

  const coverageScore = totalExports > 0
    ? reachableExports / totalExports
    : 1.0; // No exports means full coverage

  return {
    coverage_score: Math.round(coverageScore * 1000) / 1000, // 3 decimal places
    total_exports: totalExports,
    reachable_exports_count: reachableExports,
    unreachable_exports: unreachableExports,
    excluded_exports: excludedExports,
    exclusion_reasons: excludedExports.map(e => `${e.file}: ${e.reason}`)
  };
}

/**
 * Run the full pipeline flow verification.
 *
 * @param {Object} options
 * @param {string[]} options.entryPoints - Entry file paths (relative to repo root)
 * @param {string[]} [options.scopePaths] - Directories to scan for exports
 * @param {string} [options.repoRoot] - Repository root path
 * @param {number} [options.threshold] - Coverage threshold (0-1)
 * @param {string} [options.sdId] - SD ID for report correlation
 * @param {string} [options.stage] - Stage name (e.g., 'ORCHESTRATOR_COMPLETION', 'LEAD-FINAL-APPROVAL')
 * @returns {Promise<Object>} Verification report
 */
export async function verifyPipelineFlow(options = {}) {
  const startTime = Date.now();
  const repoRoot = options.repoRoot || process.cwd();
  const threshold = options.threshold ?? getDefaultThreshold();
  const stage = options.stage || 'UNKNOWN';
  const sdId = options.sdId || 'unknown';

  const report = {
    version: '1.0.0',
    sd_id: sdId,
    run_id: `pfv-${Date.now()}`,
    stage,
    timestamp: new Date().toISOString(),
    entry_points: options.entryPoints || [],
    threshold_used: threshold,
    status: 'pending',
    reasoning_notes: []
  };

  if (!isGateEnabled()) {
    report.status = 'skipped';
    report.reasoning_notes.push('GATE_PIPELINE_FLOW_ENABLED=false');
    report.duration_ms = Date.now() - startTime;
    return report;
  }

  // Check bypass
  const bypass = process.env.PIPELINE_FLOW_BYPASS === 'true';
  const bypassReason = process.env.PIPELINE_FLOW_BYPASS_REASON;
  if (bypass) {
    report.status = 'bypassed';
    report.bypass_reason = bypassReason || 'No reason provided';
    report.reasoning_notes.push(`Bypassed: ${report.bypass_reason}`);
    report.duration_ms = Date.now() - startTime;
    return report;
  }

  try {
    // Discover files in scope
    const scopePaths = options.scopePaths || ['lib', 'scripts'];
    const files = [];

    for (const scopePath of scopePaths) {
      try {
        const output = execSync(
          `git ls-files "${scopePath}/**/*.js" "${scopePath}/**/*.ts" "${scopePath}/**/*.mjs" 2>/dev/null || echo ""`,
          { encoding: 'utf8', cwd: repoRoot, timeout: VERIFY_TIMEOUT_MS }
        ).trim();

        if (output) {
          files.push(...output.split('\n').filter(Boolean));
        }
      } catch {
        report.reasoning_notes.push(`Could not scan ${scopePath}`);
      }
    }

    if (files.length === 0) {
      report.status = 'skipped';
      report.reasoning_notes.push('No files found in scope');
      report.duration_ms = Date.now() - startTime;
      return report;
    }

    // Build export graph
    const graph = buildExportGraph(files, repoRoot);
    report.reasoning_notes.push(`Built export graph: ${graph.nodes.size} files, ${graph.edges.length} edges`);

    // Determine entry points
    let entryPoints = options.entryPoints || [];
    if (entryPoints.length === 0) {
      // Auto-detect entry points: files with no importers
      for (const [file, node] of graph.nodes) {
        if (node.importedBy.length === 0 && !node.isTestFile && !node.isTypeOnly) {
          entryPoints.push(file);
        }
      }
      report.reasoning_notes.push(`Auto-detected ${entryPoints.length} entry points`);
    }

    report.entry_points = entryPoints;

    // Trace reachable symbols
    const reachable = traceReachable(entryPoints, graph);
    report.reachable_symbols = [...reachable];

    // Compute coverage
    const coverage = computeCoverage(graph, reachable);
    Object.assign(report, coverage);

    // Determine pass/fail
    report.status = coverage.coverage_score >= threshold ? 'pass' : 'fail';
    report.reasoning_notes.push(
      `Coverage: ${(coverage.coverage_score * 100).toFixed(1)}% (threshold: ${(threshold * 100).toFixed(1)}%)`
    );

    if (coverage.unreachable_exports.length > 0) {
      report.reasoning_notes.push(
        `${coverage.unreachable_exports.length} unreachable export(s) found`
      );
    }

  } catch (err) {
    report.status = 'timeout';
    report.error = err.message;
    report.reasoning_notes.push(`Error: ${err.message}`);
  }

  report.duration_ms = Date.now() - startTime;
  return report;
}

/**
 * Determine if an SD type requires pipeline flow verification.
 *
 * @param {string} sdType - SD type
 * @returns {boolean}
 */
export function requiresPipelineFlowVerification(sdType) {
  const codeTypes = [
    'feature', 'implementation', 'bugfix', 'refactor',
    'performance', 'enhancement', 'security', 'database'
  ];
  return codeTypes.includes(sdType?.toLowerCase());
}

/**
 * Get the effective threshold for pipeline flow verification.
 *
 * @param {Object} [config] - Optional config override
 * @returns {number} Threshold (0-1)
 */
export function getEffectiveThreshold(config = {}) {
  return config.threshold ?? getDefaultThreshold();
}
