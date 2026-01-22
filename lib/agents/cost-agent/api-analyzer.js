/**
 * Cost Optimization Sub-Agent - API Analyzer
 * Analyze API usage patterns and identify costly patterns
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { getSourceFiles } from './utils.js';

/**
 * Find API calls in code
 * @param {string} basePath - Base path to search
 * @returns {Promise<Array>} Array of API calls found
 */
export async function findAPICalls(basePath) {
  const calls = [];
  const files = await getSourceFiles(basePath);

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8').catch(() => '');

    // Supabase operations
    const supabaseOps = content.match(/supabase\s*\.\s*from\(['"](.*?)['"]\)\s*\.\s*(\w+)/g) || [];
    for (const op of supabaseOps) {
      const match = op.match(/from\(['"](.*?)['"]\)\s*\.\s*(\w+)/);
      if (match) {
        calls.push({
          file: path.relative(process.cwd(), file),
          table: match[1],
          operation: match[2],
          type: 'supabase'
        });
      }
    }

    // Fetch operations
    const fetchOps = content.match(/fetch\(['"](.*?)['"]/g) || [];
    for (const op of fetchOps) {
      const match = op.match(/fetch\(['"](.*?)['"]/);
      if (match) {
        calls.push({
          file: path.relative(process.cwd(), file),
          endpoint: match[1],
          operation: 'fetch',
          type: 'http'
        });
      }
    }
  }

  return calls;
}

/**
 * Analyze API usage patterns
 * @param {string} basePath - Base path to search
 * @returns {Promise<Object>} API usage analysis
 */
export async function analyzeAPIUsage(basePath = './src') {
  const usage = {
    endpoints: [],
    totalCalls: 0,
    callsPerHour: 0,
    peakHour: 0,
    costlyEndpoints: [],
    patterns: []
  };

  // Analyze code for API calls
  const apiCalls = await findAPICalls(basePath);

  // Group by endpoint
  const endpointMap = new Map();

  for (const call of apiCalls) {
    const endpoint = call.endpoint || call.table || 'unknown';
    if (!endpointMap.has(endpoint)) {
      endpointMap.set(endpoint, {
        endpoint,
        count: 0,
        operations: [],
        files: []
      });
    }

    const entry = endpointMap.get(endpoint);
    entry.count++;
    entry.operations.push(call.operation);
    entry.files.push(call.file);
  }

  usage.endpoints = Array.from(endpointMap.values());
  usage.totalCalls = apiCalls.length;

  // Identify costly patterns
  for (const endpoint of usage.endpoints) {
    // Check for N+1 queries
    if (endpoint.files.some(f => f.includes('map') || f.includes('forEach'))) {
      usage.costlyEndpoints.push({
        endpoint: endpoint.endpoint,
        issue: 'Potential N+1 query pattern',
        recommendation: 'Use batch operations or joins'
      });
    }

    // Check for missing pagination
    if (endpoint.operations.includes('select') && !endpoint.operations.includes('limit')) {
      usage.costlyEndpoints.push({
        endpoint: endpoint.endpoint,
        issue: 'Unbounded query',
        recommendation: 'Add pagination with limit/offset'
      });
    }
  }

  // Analyze patterns
  if (apiCalls.some(c => c.operation === 'realtime')) {
    usage.patterns.push({
      type: 'REALTIME_SUBSCRIPTIONS',
      impact: 'Continuous bandwidth usage',
      recommendation: 'Ensure proper unsubscribe on cleanup'
    });
  }

  if (apiCalls.filter(c => c.operation === 'insert').length > 10) {
    usage.patterns.push({
      type: 'FREQUENT_INSERTS',
      impact: 'High write load',
      recommendation: 'Consider batching inserts'
    });
  }

  usage.status = usage.costlyEndpoints.length > 0 ? 'WARNING' : 'GOOD';

  return usage;
}
