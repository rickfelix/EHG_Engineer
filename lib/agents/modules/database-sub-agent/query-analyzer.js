/**
 * Database Sub-Agent - Query Analyzer Module
 *
 * Analyzes database queries in code for best practices and security.
 *
 * @module lib/agents/modules/database-sub-agent/query-analyzer
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { getSourceFiles } from './helpers.js';

/**
 * Analyze database queries in code
 *
 * @param {string} basePath - Base path to search for source files
 * @returns {Promise<Object>} Query analysis results
 */
export async function analyzeQueries(basePath) {
  const analysis = {
    queries: [],
    issues: [],
    patterns: {}
  };

  const files = await getSourceFiles(basePath);

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const relPath = path.relative(process.cwd(), file);

    // Check for N+1 queries
    if (/for.*await.*(?:supabase|query|select)/gi.test(content)) {
      analysis.issues.push({
        type: 'N_PLUS_ONE_QUERY',
        file: relPath,
        severity: 'HIGH',
        fix: 'Use JOIN or batch loading instead of queries in loops'
      });
    }

    // Check for SELECT *
    if (/SELECT\s+\*/gi.test(content) || /select\(['"]?\*['"]?\)/gi.test(content)) {
      analysis.issues.push({
        type: 'SELECT_STAR',
        file: relPath,
        severity: 'MEDIUM',
        fix: 'Select only required columns'
      });
    }

    // Check for missing WHERE clause
    if (/DELETE\s+FROM\s+\w+(?!\s+WHERE)/gi.test(content)) {
      analysis.issues.push({
        type: 'UNSAFE_DELETE',
        file: relPath,
        severity: 'CRITICAL',
        fix: 'Always use WHERE clause with DELETE'
      });
    }

    // Check for SQL injection vulnerabilities
    if (/query.*\$\{.*\}/gi.test(content) || /query.*\+.*['"]$/gi.test(content)) {
      analysis.issues.push({
        type: 'SQL_INJECTION_RISK',
        file: relPath,
        severity: 'CRITICAL',
        fix: 'Use parameterized queries'
      });
    }

    // Check for transaction usage
    if (/BEGIN|START\s+TRANSACTION/gi.test(content)) {
      analysis.patterns.usesTransactions = true;
    }

    // Check for prepared statements
    if (/prepare|PREPARE/gi.test(content)) {
      analysis.patterns.usesPreparedStatements = true;
    }

    // Extract and analyze Supabase queries
    const supabaseQueries = content.match(/supabase\.from\(['"]\w+['"]\)\.[\s\S]*?(?=\n|\))/g) || [];

    for (const query of supabaseQueries) {
      const table = query.match(/from\(['"](.*?)['"]\)/)?.[1];
      const operation = query.match(/\.(select|insert|update|delete|upsert)/)?.[1];

      analysis.queries.push({
        table,
        operation,
        file: relPath
      });

      // Check for missing error handling
      if (!query.includes('.catch') && !content.includes('try')) {
        analysis.issues.push({
          type: 'MISSING_ERROR_HANDLING',
          file: relPath,
          table,
          severity: 'MEDIUM',
          fix: 'Add error handling for database operations'
        });
      }
    }
  }

  // Analyze query patterns
  const tableUsage = {};
  for (const query of analysis.queries) {
    if (query.table) {
      tableUsage[query.table] = (tableUsage[query.table] || 0) + 1;
    }
  }

  // Find heavily used tables that might need optimization
  for (const [table, count] of Object.entries(tableUsage)) {
    if (count > 20) {
      analysis.issues.push({
        type: 'HOT_TABLE',
        table,
        queryCount: count,
        severity: 'MEDIUM',
        fix: 'Consider caching or optimizing queries for this table'
      });
    }
  }

  analysis.status = analysis.issues.filter(i => i.severity === 'CRITICAL').length > 0 ? 'FAIL' :
                   analysis.issues.filter(i => i.severity === 'HIGH').length > 2 ? 'WARNING' : 'PASS';

  return analysis;
}
