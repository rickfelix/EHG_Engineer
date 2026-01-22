#!/usr/bin/env node

/**
 * Cost Optimization Sub-Agent - ACTIVE Cost Monitoring Tool
 * Monitors and optimizes cloud service costs, especially Supabase
 *
 * REFACTORED: Modularized from 897 LOC to ~100 LOC (SD-LEO-REFAC-TESTING-INFRA-001)
 * Modules: config, database-analyzer, api-analyzer, expensive-ops-analyzer,
 *          cost-calculator, alerts-generator, report-generator, utils
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Import from decomposed modules
import {
  LIMITS,
  analyzeDatabaseUsage,
  analyzeAPIUsage,
  findExpensiveOperations,
  analyzeCachingOpportunities,
  calculateCosts,
  projectFutureCosts,
  generateAlerts,
  generateOptimizations,
  calculateScore,
  generateReport,
  saveAnalysis,
  setupMonitoring
} from './cost-agent/index.js';

class CostOptimizationSubAgent {
  constructor() {
    this.limits = LIMITS;

    // Initialize Supabase if credentials available
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      this.supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
    }
  }

  /**
   * Main execution - analyze all cost factors
   */
  async execute(options = {}) {
    console.log('💰 Cost Optimization Sub-Agent ACTIVATED\n');
    console.log('Analyzing REAL usage patterns and costs, not theoretical limits.\n');

    const results = {
      timestamp: new Date().toISOString(),
      usage: {},
      costs: {},
      warnings: [],
      critical: [],
      optimizations: [],
      projections: {},
      score: 100
    };

    // 1. Analyze database usage
    console.log('🗄️ Analyzing database usage...');
    results.usage.database = await analyzeDatabaseUsage(this.supabase);

    // 2. Analyze API usage patterns
    console.log('🌐 Analyzing API usage patterns...');
    results.usage.api = await analyzeAPIUsage(options.path || './src');

    // 3. Analyze code for expensive operations
    console.log('🔍 Scanning for expensive operations...');
    results.usage.expensive = await findExpensiveOperations(options.path || './src');

    // 4. Analyze caching opportunities
    console.log('💾 Identifying caching opportunities...');
    const caching = await analyzeCachingOpportunities(options.path || './src');
    results.optimizations.push(...caching);

    // 5. Calculate current costs
    console.log('💵 Calculating estimated costs...');
    results.costs = calculateCosts(results.usage);

    // 6. Project future costs
    console.log('📈 Projecting future costs...');
    results.projections = projectFutureCosts(results.usage);

    // 7. Generate warnings and alerts
    generateAlerts(results);

    // 8. Generate optimization recommendations
    results.optimizations.push(...generateOptimizations(results));

    // Calculate cost efficiency score
    results.score = calculateScore(results);

    // Generate report
    generateReport(results);

    // Save detailed analysis
    await saveAnalysis(results);

    // Set up monitoring if requested
    if (options.monitor) {
      await setupMonitoring(results);
    }

    return results;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new CostOptimizationSubAgent();

  const args = process.argv.slice(2);
  const options = {
    path: args[0] || './src',
    monitor: args.includes('--monitor')
  };

  agent.execute(options).then(results => {
    if (results.score < 60 || results.critical.length > 0) {
      console.log('\n⚠️  Cost optimization needed!');
      console.log('   Review recommendations immediately.');
      process.exit(1);
    } else {
      console.log('\n✅ Cost analysis complete.');
      process.exit(0);
    }
  }).catch(error => {
    console.error('Cost analysis failed:', error);
    process.exit(1);
  });
}

export default CostOptimizationSubAgent;
