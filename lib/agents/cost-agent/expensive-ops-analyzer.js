/**
 * Cost Optimization Sub-Agent - Expensive Operations Analyzer
 * Find expensive operations and caching opportunities
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { EXPENSIVE_PATTERNS, CACHEABLE_PATTERNS } from './config.js';
import { getSourceFiles, generateCacheImplementation } from './utils.js';

/**
 * Find expensive operations in code
 * @param {string} basePath - Base path to search
 * @returns {Promise<Array>} Array of expensive operations found
 */
export async function findExpensiveOperations(basePath) {
  const operations = [];
  const files = await getSourceFiles(basePath);

  for (const file of files) {
    if (file.includes('node_modules')) continue;

    const content = await fs.readFile(file, 'utf8').catch(() => '');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      for (const pattern of EXPENSIVE_PATTERNS) {
        if (pattern.pattern.test(line)) {
          operations.push({
            file: path.relative(process.cwd(), file),
            line: index + 1,
            type: pattern.type,
            cost: pattern.cost,
            message: pattern.message,
            fix: pattern.fix,
            code: line.trim().substring(0, 60) + '...'
          });
        }
      }
    });
  }

  return operations;
}

/**
 * Analyze caching opportunities
 * @param {string} basePath - Base path to search
 * @returns {Promise<Array>} Array of caching opportunities
 */
export async function analyzeCachingOpportunities(basePath) {
  const opportunities = [];
  const files = await getSourceFiles(basePath);

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8').catch(() => '');

    for (const pattern of CACHEABLE_PATTERNS) {
      if (pattern.pattern.test(content)) {
        // Check if caching is already implemented
        const hasCache = /cache|Cache|localStorage|sessionStorage/gi.test(content);

        if (!hasCache) {
          opportunities.push({
            area: 'Caching',
            priority: 'MEDIUM',
            file: path.relative(process.cwd(), file),
            recommendation: pattern.suggestion,
            impact: pattern.impact,
            implementation: generateCacheImplementation(pattern)
          });
        }
      }
    }
  }

  return opportunities;
}
