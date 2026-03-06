/**
 * Performance Evidence Checker — Gap 3: Benchmark Evidence
 *
 * Checks whether an SD with performance-related success criteria has
 * actual benchmark evidence to back up claims. Looks for standard
 * benchmark result files and validates targets against measured values.
 *
 * Used by GATE_PERFORMANCE_CRITICAL to add benchmark evidence checking
 * alongside the existing barrel import / waterfall detection.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Keywords in success metrics that indicate performance criteria.
 */
const PERF_KEYWORDS = [
  /latency/i, /throughput/i, /response\s*time/i, /\bms\b/i, /\bp\d{2}\b/i,
  /bundle\s*size/i, /load\s*time/i, /\bttfb\b/i, /\bfcp\b/i, /\blcp\b/i,
  /render\s*time/i, /\brps\b/i, /requests?\s*per\s*sec/i, /\bqps\b/i,
  /memory\s*usage/i, /cpu\s*usage/i, /\bbytes?\b/i, /\bkb\b/i, /\bmb\b/i
];

/**
 * Standard locations to look for benchmark evidence.
 */
const BENCHMARK_PATHS = [
  'benchmark-results',
  '.perf-results',
  'perf-results',
  'benchmarks/results',
  'performance-report.json',
  'benchmark-report.json',
  '.benchmark-results.json',
  'lighthouse-results'
];

/**
 * Check if the given success metrics contain performance-related criteria.
 *
 * @param {Array} successMetrics - SD success_metrics array
 * @returns {{ hasPerformanceCriteria: boolean, performanceMetrics: Array }}
 */
export function detectPerformanceCriteria(successMetrics) {
  if (!successMetrics || !Array.isArray(successMetrics)) {
    return { hasPerformanceCriteria: false, performanceMetrics: [] };
  }

  const performanceMetrics = successMetrics.filter(m => {
    const name = (m.metric || m.name || '').toLowerCase();
    const target = String(m.target || '').toLowerCase();
    return PERF_KEYWORDS.some(kw => kw.test(name) || kw.test(target));
  });

  return {
    hasPerformanceCriteria: performanceMetrics.length > 0,
    performanceMetrics
  };
}

/**
 * Search for benchmark evidence files in the repository.
 *
 * @param {string} repoRoot - Repository root path
 * @returns {{ found: boolean, files: Array<{ path: string, type: string }> }}
 */
export function findBenchmarkEvidence(repoRoot) {
  const found = [];

  for (const relPath of BENCHMARK_PATHS) {
    const fullPath = join(repoRoot, relPath);
    if (!existsSync(fullPath)) continue;

    try {
      const stat = statSync(fullPath);
      if (stat.isFile()) {
        found.push({ path: relPath, type: 'file' });
      } else if (stat.isDirectory()) {
        // Look for JSON/CSV result files inside the directory
        const entries = readdirSync(fullPath).filter(f =>
          /\.(json|csv|xml|html)$/i.test(f)
        );
        for (const entry of entries) {
          found.push({ path: join(relPath, entry).replace(/\\/g, '/'), type: 'file' });
        }
      }
    } catch { /* skip inaccessible */ }
  }

  return { found: found.length > 0, files: found };
}

/**
 * Validate benchmark evidence against performance targets.
 * Currently parses JSON benchmark files looking for standard result shapes.
 *
 * @param {Array} benchmarkFiles - Files found by findBenchmarkEvidence
 * @param {Array} performanceMetrics - Performance metrics from success_metrics
 * @param {string} repoRoot - Repository root path
 * @returns {{ targetsChecked: number, targetsMet: number, targetsMissed: Array }}
 */
export function validateBenchmarkTargets(benchmarkFiles, performanceMetrics, repoRoot) {
  const targetsMissed = [];
  let targetsChecked = 0;
  let targetsMet = 0;

  // Try to extract numeric values from benchmark JSON files
  const benchmarkData = {};
  for (const bf of benchmarkFiles) {
    if (!bf.path.endsWith('.json')) continue;
    try {
      const content = readFileSync(join(repoRoot, bf.path), 'utf8');
      const data = JSON.parse(content);
      Object.assign(benchmarkData, flattenObject(data));
    } catch { /* skip unparseable */ }
  }

  // For each performance metric, try to find a matching benchmark value
  for (const metric of performanceMetrics) {
    const name = (metric.metric || metric.name || '').toLowerCase();
    const target = String(metric.target || '');
    const targetNum = extractNumber(target);

    if (targetNum === null) continue;
    targetsChecked++;

    // Try to find a matching key in benchmark data
    const matchingKey = Object.keys(benchmarkData).find(k =>
      name.split(/\s+/).some(word => k.toLowerCase().includes(word))
    );

    if (matchingKey && typeof benchmarkData[matchingKey] === 'number') {
      const measured = benchmarkData[matchingKey];
      // Determine comparison direction from target string
      const isLessThan = /<|less|under|below|max/i.test(target);
      const met = isLessThan ? measured <= targetNum : measured >= targetNum;

      if (met) {
        targetsMet++;
      } else {
        targetsMissed.push({
          metric: metric.metric || metric.name,
          target: target,
          measured: measured,
          benchmarkKey: matchingKey
        });
      }
    }
  }

  return { targetsChecked, targetsMet, targetsMissed };
}

// --- Helpers ---

function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

function extractNumber(str) {
  if (str == null) return null;
  const match = String(str).match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}
