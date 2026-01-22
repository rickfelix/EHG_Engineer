/**
 * Cost Optimization Sub-Agent - Report Generator
 * Generate reports and save analysis
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import { LIMITS } from './config.js';

/**
 * Generate cost report
 * @param {Object} results - Analysis results
 */
export function generateReport(results) {
  console.log('\n' + '='.repeat(70));
  console.log('COST OPTIMIZATION REPORT');
  console.log('='.repeat(70));

  console.log(`\n💰 Cost Efficiency Score: ${results.score}/100`);
  console.log(`   Current Tier: ${results.costs.current}`);

  // Critical alerts
  if (results.critical.length > 0) {
    console.log(`\n🔴 CRITICAL ALERTS (${results.critical.length}):`);
    results.critical.forEach(alert => {
      console.log(`   ⚠️  ${alert.message}`);
      console.log(`      Action: ${alert.action}`);
    });
  }

  // Database usage
  const db = results.usage.database;
  console.log('\n🗄️  Database Usage:');
  console.log(`   Size: ${results.costs.breakdown.database.usage} / ${results.costs.breakdown.database.limit}`);
  console.log(`   Tables: ${db.tables.length}`);
  console.log(`   Total Rows: ${db.totalRows.toLocaleString()}`);

  // API usage
  console.log('\n🌐 API Usage:');
  console.log(`   Endpoints: ${results.usage.api.endpoints.length}`);
  console.log(`   Costly Patterns: ${results.usage.api.costlyEndpoints.length}`);

  // Expensive operations
  if (results.usage.expensive.length > 0) {
    console.log(`\n💸 Expensive Operations: ${results.usage.expensive.length}`);
    const critical = results.usage.expensive.filter(op => op.cost === 'CRITICAL');
    if (critical.length > 0) {
      console.log(`   Critical: ${critical.length}`);
      critical.slice(0, 3).forEach(op => {
        console.log(`     - ${op.type} at ${op.file}:${op.line}`);
      });
    }
  }

  // Projections
  console.log('\n📈 Cost Projections:');
  console.log(`   30 days: ${results.projections['30_days'].estimatedCost}`);
  console.log(`   90 days: ${results.projections['90_days'].estimatedCost}`);

  // Top optimizations
  if (results.optimizations.length > 0) {
    console.log('\n💡 TOP COST OPTIMIZATIONS:');
    results.optimizations.slice(0, 3).forEach((opt, i) => {
      console.log(`\n${i + 1}. ${opt.recommendation}`);
      console.log(`   Impact: ${opt.impact}`);
    });
  }

  console.log('\n' + '='.repeat(70));
}

/**
 * Save detailed analysis
 * @param {Object} results - Analysis results
 */
export async function saveAnalysis(results) {
  const reportPath = 'cost-analysis.json';
  await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📊 Detailed analysis saved to: ${reportPath}`);

  // Create optimization guide
  const guidePath = 'cost-optimization-guide.md';
  const guide = createOptimizationGuide(results);
  await fs.writeFile(guidePath, guide);
  console.log(`📋 Optimization guide saved to: ${guidePath}`);
}

/**
 * Create optimization guide markdown
 * @param {Object} results - Analysis results
 * @returns {string} Markdown content
 */
export function createOptimizationGuide(results) {
  let md = '# Cost Optimization Guide\n\n';
  md += `**Generated**: ${new Date().toISOString()}\n`;
  md += `**Cost Efficiency Score**: ${results.score}/100\n`;
  md += `**Current Status**: ${results.costs.current}\n\n`;

  if (results.critical.length > 0) {
    md += '## ⚠️  Critical Issues\n\n';
    results.critical.forEach(alert => {
      md += `### ${alert.type}\n`;
      md += `${alert.message}\n\n`;
      md += `**Required Action**: ${alert.action}\n\n`;
    });
  }

  md += '## Current Usage\n\n';
  md += '| Resource | Usage | Limit | Status |\n';
  md += '|----------|-------|-------|--------|\n';
  md += `| Database | ${results.costs.breakdown.database.usage} | ${results.costs.breakdown.database.limit} | ${results.costs.breakdown.database.status} |\n`;
  md += `| API Calls | ${results.usage.api.totalCalls}/hour | 1000/hour | ${results.costs.breakdown.api.status} |\n\n`;

  md += '## Optimization Recommendations\n\n';
  results.optimizations.forEach((opt, i) => {
    md += `### ${i + 1}. ${opt.recommendation}\n\n`;
    md += `**Priority**: ${opt.priority}\n`;
    md += `**Impact**: ${opt.impact}\n\n`;
    if (opt.implementation) {
      md += '**Implementation**:\n';
      md += '```javascript\n' + opt.implementation + '\n```\n\n';
    }
  });

  md += '## Cost-Saving Checklist\n\n';
  md += '- [ ] Implement caching for frequent queries\n';
  md += '- [ ] Archive old data (>90 days)\n';
  md += '- [ ] Optimize image sizes before upload\n';
  md += '- [ ] Replace SELECT * with specific columns\n';
  md += '- [ ] Batch database operations\n';
  md += '- [ ] Use connection pooling\n';
  md += '- [ ] Enable gzip compression\n';
  md += '- [ ] Implement rate limiting\n';
  md += '- [ ] Monitor usage weekly\n';

  return md;
}

/**
 * Setup monitoring
 * @param {Object} _results - Analysis results
 */
export async function setupMonitoring(_results) {
  const monitorConfig = {
    alerts: {
      database_size: {
        threshold: LIMITS.database.size * LIMITS.database.warning,
        action: 'email'
      },
      api_calls: {
        threshold: LIMITS.api.hourly * LIMITS.api.warning,
        action: 'log'
      }
    },
    schedule: 'daily',
    reports: 'weekly'
  };

  await fs.writeFile('cost-monitoring-config.json', JSON.stringify(monitorConfig, null, 2));
  console.log('\n📊 Monitoring configuration saved to: cost-monitoring-config.json');
  console.log('   Set up a cron job to run: node lib/agents/cost-sub-agent.js --monitor');
}
