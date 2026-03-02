#!/usr/bin/env node

/**
 * Database Sub-Agent - ACTIVE Database Validation Tool
 * Validates schema, migrations, queries, and data integrity
 *
 * Modularized: See lib/agents/modules/database-sub-agent/ for implementation.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Import from modularized modules
import {
  analyzeSchema,
  analyzeIndexes,
  checkRLSPolicies,
  validateRelationships
} from './modules/database-sub-agent/schema-analyzer.js';
import { validateMigrations } from './modules/database-sub-agent/migration-validator.js';
import { analyzeQueries } from './modules/database-sub-agent/query-analyzer.js';
import { checkDataIntegrity } from './modules/database-sub-agent/integrity-checker.js';
import { analyzePerformance } from './modules/database-sub-agent/performance-analyzer.js';
import {
  generateRecommendations,
  calculateScore,
  generateReport,
  generateOptimizationScripts
} from './modules/database-sub-agent/report-generator.js';

class DatabaseSubAgent {
  constructor() {
    this.issues = {
      schema: [],
      migrations: [],
      queries: [],
      integrity: [],
      performance: []
    };

    // Initialize Supabase if credentials available
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      this.supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
    }
  }

  /**
   * Main execution - validate all database aspects
   */
  async execute(options = {}) {
    console.log('Database Sub-Agent ACTIVATED\n');
    console.log('Validating ACTUAL database implementation, not just checking schema files.\n');

    const results = {
      timestamp: new Date().toISOString(),
      schema: {},
      migrations: {},
      queries: {},
      integrity: {},
      performance: {},
      recommendations: [],
      score: 100
    };

    // 1. Analyze schema
    console.log('Analyzing database schema...');
    results.schema = await analyzeSchema(this.supabase);

    // 2. Validate migrations
    console.log('Validating migrations...');
    results.migrations = await validateMigrations();

    // 3. Analyze queries
    console.log('Analyzing database queries...');
    results.queries = await analyzeQueries(options.path || './src');

    // 4. Check data integrity
    console.log('Checking data integrity...');
    results.integrity = await checkDataIntegrity(this.supabase);

    // 5. Performance analysis
    console.log('Analyzing database performance...');
    results.performance = await analyzePerformance();

    // 6. Check indexes
    console.log('Validating indexes...');
    results.schema.indexes = await analyzeIndexes();

    // 7. Check RLS policies
    console.log('Checking Row Level Security...');
    results.integrity.rls = await checkRLSPolicies(this.supabase);

    // 8. Validate relationships
    console.log('Validating relationships...');
    results.schema.relationships = await validateRelationships(this.supabase);

    // Generate recommendations
    results.recommendations = generateRecommendations(results);

    // Calculate database health score
    results.score = calculateScore(results);

    // Generate report
    generateReport(results);

    // Generate optimization scripts
    if (results.score < 80) {
      await generateOptimizationScripts(results);
    }

    return results;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const agent = new DatabaseSubAgent();

  agent.execute({
    path: process.argv[2] || './src'
  }).then(results => {
    if (results.score < 60) {
      console.log('\nDatabase health is poor!');
      console.log('   Address critical issues immediately.');
      process.exit(1);
    } else {
      console.log('\nDatabase validation complete.');
      process.exit(0);
    }
  }).catch(error => {
    console.error('Database validation failed:', error);
    process.exit(1);
  });
}

export default DatabaseSubAgent;
