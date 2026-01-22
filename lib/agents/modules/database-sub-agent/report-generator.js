/**
 * Database Sub-Agent - Report Generator Module
 *
 * Generates reports and optimization scripts from analysis results.
 *
 * @module lib/agents/modules/database-sub-agent/report-generator
 */

import fsModule from 'fs';
const fs = fsModule.promises;

/**
 * Generate recommendations from analysis results
 *
 * @param {Object} results - Analysis results
 * @returns {Array<Object>} Recommendations
 */
export function generateRecommendations(results) {
  const recommendations = [];

  // Schema recommendations
  if (results.schema.issues) {
    for (const issue of results.schema.issues.filter(i => i.severity === 'HIGH')) {
      recommendations.push({
        area: 'Schema',
        priority: 'HIGH',
        issue: issue.type,
        fix: issue.fix
      });
    }
  }

  // Query recommendations
  if (results.queries.issues) {
    const criticalQueries = results.queries.issues.filter(i =>
      i.severity === 'CRITICAL' || i.severity === 'HIGH'
    );

    for (const issue of criticalQueries) {
      recommendations.push({
        area: 'Queries',
        priority: 'CRITICAL',
        issue: issue.type,
        fix: issue.fix
      });
    }
  }

  // Performance recommendations
  if (results.performance.missingIndexes && results.performance.missingIndexes.length > 0) {
    recommendations.push({
      area: 'Performance',
      priority: 'HIGH',
      issue: 'Missing indexes',
      fix: 'Create indexes on frequently queried columns'
    });
  }

  // Integrity recommendations
  if (results.integrity.orphanedRecords && results.integrity.orphanedRecords.length > 0) {
    recommendations.push({
      area: 'Integrity',
      priority: 'HIGH',
      issue: 'Orphaned records found',
      fix: 'Add foreign key constraints or clean up orphaned data'
    });
  }

  return recommendations;
}

/**
 * Calculate database health score
 *
 * @param {Object} results - Analysis results
 * @returns {number} Health score (0-100)
 */
export function calculateScore(results) {
  let score = 100;

  // Schema issues
  if (results.schema.issues) {
    score -= results.schema.issues.filter(i => i.severity === 'HIGH').length * 10;
    score -= results.schema.issues.filter(i => i.severity === 'MEDIUM').length * 5;
  }

  // Query issues
  if (results.queries.issues) {
    score -= results.queries.issues.filter(i => i.severity === 'CRITICAL').length * 15;
    score -= results.queries.issues.filter(i => i.severity === 'HIGH').length * 10;
  }

  // Performance issues
  if (results.performance.missingIndexes) {
    score -= results.performance.missingIndexes.length * 3;
  }

  // Integrity issues
  if (results.integrity.orphanedRecords) {
    score -= results.integrity.orphanedRecords.length * 5;
  }

  return Math.max(0, score);
}

/**
 * Generate database report
 *
 * @param {Object} results - Analysis results
 */
export function generateReport(results) {
  console.log('\n' + '='.repeat(70));
  console.log('DATABASE VALIDATION REPORT');
  console.log('='.repeat(70));

  console.log(`\nDatabase Health Score: ${results.score}/100`);

  // Schema summary
  if (results.schema.tables) {
    console.log(`\nSchema: ${results.schema.status || 'ANALYZED'}`);
    console.log(`   Tables: ${results.schema.tables.length}`);

    if (results.schema.issues && results.schema.issues.length > 0) {
      console.log(`   Issues: ${results.schema.issues.length}`);
      results.schema.issues.slice(0, 3).forEach(issue => {
        console.log(`   - ${issue.type}: ${issue.table || ''}`);
      });
    }
  }

  // Migration summary
  if (results.migrations.migrations) {
    console.log(`\nMigrations: ${results.migrations.status}`);
    console.log(`   Total: ${results.migrations.migrations.length}`);

    if (results.migrations.issues && results.migrations.issues.length > 0) {
      console.log(`   Issues: ${results.migrations.issues.length}`);
    }
  }

  // Query analysis
  if (results.queries.queries) {
    console.log(`\nQuery Analysis: ${results.queries.status}`);
    console.log(`   Analyzed: ${results.queries.queries.length} queries`);

    const critical = results.queries.issues ?
      results.queries.issues.filter(i => i.severity === 'CRITICAL').length : 0;

    if (critical > 0) {
      console.log(`   CRITICAL: ${critical} issues require immediate attention`);
    }
  }

  // Performance summary
  if (results.performance.missingIndexes && results.performance.missingIndexes.length > 0) {
    console.log('\nPerformance: WARNING');
    console.log(`   Missing indexes: ${results.performance.missingIndexes.length}`);
    results.performance.missingIndexes.slice(0, 3).forEach(idx => {
      console.log(`   - ${idx.column} (${idx.usage})`);
    });
  }

  // Top recommendations
  if (results.recommendations && results.recommendations.length > 0) {
    console.log('\nTOP RECOMMENDATIONS:');
    results.recommendations.slice(0, 5).forEach((rec, i) => {
      console.log(`\n${i + 1}. [${rec.priority}] ${rec.area}: ${rec.issue}`);
      console.log(`   Fix: ${rec.fix}`);
    });
  }

  console.log('\n' + '='.repeat(70));
}

/**
 * Generate optimization scripts
 *
 * @param {Object} results - Analysis results
 * @returns {Promise<void>}
 */
export async function generateOptimizationScripts(results) {
  let sql = '-- Database Optimization Script\n';
  sql += `-- Generated: ${new Date().toISOString()}\n`;
  sql += `-- Score: ${results.score}/100\n\n`;

  // Add index creation scripts
  if (results.performance.missingIndexes) {
    sql += '-- Missing Indexes\n';
    for (const idx of results.performance.missingIndexes) {
      sql += `${idx.recommendation}\n`;
    }
    sql += '\n';
  }

  // Add schema fixes
  if (results.schema.issues) {
    sql += '-- Schema Fixes\n';
    for (const issue of results.schema.issues.filter(i => i.fix)) {
      sql += `${issue.fix}\n`;
    }
    sql += '\n';
  }

  // Add RLS policies
  if (results.integrity.rls && results.integrity.rls.issues) {
    sql += '-- Row Level Security\n';
    for (const issue of results.integrity.rls.issues) {
      sql += `${issue.fix}\n`;
    }
    sql += '\n';
  }

  const scriptPath = 'database-optimization.sql';
  await fs.writeFile(scriptPath, sql);
  console.log(`\nOptimization script saved to: ${scriptPath}`);

  // Create migration file
  const migrationPath = `migrations/${Date.now()}_optimize_database.sql`;
  await fs.mkdir('migrations', { recursive: true });
  await fs.writeFile(migrationPath, sql);
  console.log(`Migration file created: ${migrationPath}`);
}
