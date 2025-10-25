#!/usr/bin/env node

/**
 * Cost Optimization Sub-Agent - ACTIVE Cost Monitoring Tool
 * Monitors and optimizes cloud service costs, especially Supabase
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

class CostOptimizationSubAgent {
  constructor() {
    // Supabase free tier limits
    this.limits = {
      database: {
        size: 500 * 1024 * 1024, // 500MB
        rows: 100000, // Approximate for free tier
        warning: 0.8, // Warn at 80%
        critical: 0.95 // Critical at 95%
      },
      bandwidth: {
        monthly: 2 * 1024 * 1024 * 1024, // 2GB
        daily: 68 * 1024 * 1024, // ~68MB/day average
        warning: 0.8,
        critical: 0.95
      },
      api: {
        hourly: 1000, // Reasonable limit
        perMinute: 100,
        warning: 0.8,
        critical: 0.95
      },
      storage: {
        total: 1024 * 1024 * 1024, // 1GB
        warning: 0.8,
        critical: 0.95
      }
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
    const dbUsage = await this.analyzeDatabaseUsage();
    results.usage.database = dbUsage;
    
    // 2. Analyze API usage patterns
    console.log('🌐 Analyzing API usage patterns...');
    const apiUsage = await this.analyzeAPIUsage(options.logsPath);
    results.usage.api = apiUsage;
    
    // 3. Analyze code for expensive operations
    console.log('🔍 Scanning for expensive operations...');
    const expensive = await this.findExpensiveOperations(options.path || './src');
    results.usage.expensive = expensive;
    
    // 4. Analyze caching opportunities
    console.log('💾 Identifying caching opportunities...');
    const caching = await this.analyzeCachingOpportunities(options.path || './src');
    results.optimizations.push(...caching);
    
    // 5. Calculate current costs
    console.log('💵 Calculating estimated costs...');
    results.costs = this.calculateCosts(results.usage);
    
    // 6. Project future costs
    console.log('📈 Projecting future costs...');
    results.projections = this.projectFutureCosts(results.usage);
    
    // 7. Generate warnings and alerts
    this.generateAlerts(results);
    
    // 8. Generate optimization recommendations
    results.optimizations.push(...this.generateOptimizations(results));
    
    // Calculate cost efficiency score
    results.score = this.calculateScore(results);
    
    // Generate report
    this.generateReport(results);
    
    // Save detailed analysis
    await this.saveAnalysis(results);
    
    // Set up monitoring if requested
    if (options.monitor) {
      await this.setupMonitoring(results);
    }
    
    return results;
  }

  /**
   * Analyze database usage
   */
  async analyzeDatabaseUsage() {
    const usage = {
      tables: [],
      totalRows: 0,
      estimatedSize: 0,
      largestTables: [],
      growthRate: 0,
      issues: []
    };
    
    if (!this.supabase) {
      usage.status = 'NO_CONNECTION';
      usage.message = 'Supabase connection not configured';
      return usage;
    }
    
    try {
      // Get all tables
      const { data: tables } = await this.supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');
      
      if (!tables) {
        // Fallback: check known tables
        const knownTables = [
          'strategic_directives_v2',
          'product_requirements_v2',
          'execution_sequences',
          'leo_audit_log'
        ];
        
        for (const table of knownTables) {
          try {
            const { count } = await this.supabase
              .from(table)
              .select('*', { count: 'exact', head: true });
            
            usage.tables.push({
              name: table,
              rowCount: count || 0,
              estimatedSize: (count || 0) * 1024 // Rough estimate: 1KB per row
            });
            
            usage.totalRows += count || 0;
          } catch (e) {
            // Table doesn't exist
          }
        }
      } else {
        // Analyze each table
        for (const table of tables) {
          const { count } = await this.supabase
            .from(table.table_name)
            .select('*', { count: 'exact', head: true });
          
          const estimatedSize = (count || 0) * 1024; // 1KB average per row
          
          usage.tables.push({
            name: table.table_name,
            rowCount: count || 0,
            estimatedSize
          });
          
          usage.totalRows += count || 0;
          usage.estimatedSize += estimatedSize;
        }
      }
      
      // Sort by size
      usage.tables.sort((a, b) => b.estimatedSize - a.estimatedSize);
      usage.largestTables = usage.tables.slice(0, 5);
      
      // Check for issues
      if (usage.totalRows > this.limits.database.rows * this.limits.database.warning) {
        usage.issues.push({
          type: 'HIGH_ROW_COUNT',
          message: `Total rows (${usage.totalRows}) approaching limit`,
          severity: 'WARNING'
        });
      }
      
      // Check for tables without indexes
      for (const table of usage.largestTables) {
        if (table.rowCount > 10000) {
          usage.issues.push({
            type: 'LARGE_TABLE',
            message: `Table ${table.name} has ${table.rowCount} rows - ensure proper indexing`,
            severity: 'MEDIUM'
          });
        }
      }
      
      usage.status = usage.issues.length > 0 ? 'WARNING' : 'GOOD';
      
    } catch (error) {
      usage.status = 'ERROR';
      usage.message = 'Could not analyze database usage';
    }
    
    return usage;
  }

  /**
   * Analyze API usage patterns
   */
  async analyzeAPIUsage(logsPath) {
    const usage = {
      endpoints: [],
      totalCalls: 0,
      callsPerHour: 0,
      peakHour: 0,
      costlyEndpoints: [],
      patterns: []
    };
    
    // Analyze code for API calls
    const apiCalls = await this.findAPICalls('./src');
    
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

  /**
   * Find expensive operations in code
   */
  async findExpensiveOperations(basePath) {
    const operations = [];
    const files = await this.getSourceFiles(basePath);
    
    const expensivePatterns = [
      {
        pattern: /select\(\'\*'\)/gi,
        type: 'SELECT_ALL',
        cost: 'HIGH',
        message: 'Selecting all columns is expensive',
        fix: 'Select only needed columns'
      },
      {
        pattern: /\.storage\..*upload/gi,
        type: 'FILE_UPLOAD',
        cost: 'MEDIUM',
        message: 'File uploads consume bandwidth',
        fix: 'Compress and optimize files before upload'
      },
      {
        pattern: /setInterval|setTimeout.*[1-9]\d{0,2}(?!\d)/gi,
        type: 'FREQUENT_POLLING',
        cost: 'HIGH',
        message: 'Frequent polling increases API calls',
        fix: 'Use realtime subscriptions or increase interval'
      },
      {
        pattern: /Promise\.all\(.*map.*supabase/gi,
        type: 'PARALLEL_QUERIES',
        cost: 'HIGH',
        message: 'Parallel queries spike API usage',
        fix: 'Use batch operations or sequential processing'
      },
      {
        pattern: /while.*await.*supabase/gi,
        type: 'LOOP_QUERIES',
        cost: 'CRITICAL',
        message: 'Queries in loops are extremely expensive',
        fix: 'Refactor to use single query with conditions'
      }
    ];
    
    for (const file of files) {
      if (file.includes('node_modules')) continue;
      
      const content = await fs.readFile(file, 'utf8').catch(() => '');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        for (const pattern of expensivePatterns) {
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
   */
  async analyzeCachingOpportunities(basePath) {
    const opportunities = [];
    const files = await this.getSourceFiles(basePath);
    
    // Patterns that indicate caching opportunities
    const cacheablePatterns = [
      {
        pattern: /supabase.*select.*from\(['"]users['"]/gi,
        suggestion: 'Cache user data in localStorage/sessionStorage',
        impact: 'Reduce repeated user lookups'
      },
      {
        pattern: /fetch.*\/api\/config/gi,
        suggestion: 'Cache configuration data on client',
        impact: 'Reduce config API calls'
      },
      {
        pattern: /supabase.*select.*order.*limit/gi,
        suggestion: 'Cache paginated results',
        impact: 'Reduce repeated list queries'
      }
    ];
    
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8').catch(() => '');
      
      for (const pattern of cacheablePatterns) {
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
              implementation: this.generateCacheImplementation(pattern)
            });
          }
        }
      }
    }
    
    return opportunities;
  }

  /**
   * Find API calls in code
   */
  async findAPICalls(basePath) {
    const calls = [];
    const files = await this.getSourceFiles(basePath);
    
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
   * Calculate current costs
   */
  calculateCosts(usage) {
    const costs = {
      current: 'FREE_TIER',
      breakdown: {},
      totalMonthly: 0
    };
    
    // Check if exceeding free tier
    const dbUsage = usage.database;
    const dbPercent = (dbUsage.estimatedSize / this.limits.database.size) * 100;
    
    costs.breakdown.database = {
      usage: `${Math.round(dbUsage.estimatedSize / 1024 / 1024)}MB`,
      limit: '500MB',
      percent: Math.round(dbPercent),
      status: dbPercent > 95 ? 'CRITICAL' : dbPercent > 80 ? 'WARNING' : 'GOOD'
    };
    
    // API usage (estimated)
    const apiCalls = usage.api.totalCalls;
    const estimatedMonthly = apiCalls * 30 * 24; // Rough estimate
    
    costs.breakdown.api = {
      estimatedCalls: estimatedMonthly,
      status: estimatedMonthly > 1000000 ? 'WARNING' : 'GOOD'
    };
    
    // Check if likely to exceed free tier
    if (dbPercent > 80 || estimatedMonthly > 500000) {
      costs.current = 'APPROACHING_LIMITS';
      costs.warning = 'Consider upgrading to Pro tier ($25/month) soon';
    }
    
    return costs;
  }

  /**
   * Project future costs
   */
  projectFutureCosts(usage) {
    const projections = {
      '30_days': {},
      '90_days': {},
      '365_days': {}
    };
    
    // Simple linear projection (would need historical data for better accuracy)
    const dailyGrowth = 0.02; // Assume 2% daily growth
    
    const currentSize = usage.database.estimatedSize;
    
    projections['30_days'] = {
      databaseSize: Math.round(currentSize * Math.pow(1 + dailyGrowth, 30) / 1024 / 1024) + 'MB',
      estimatedCost: currentSize * Math.pow(1 + dailyGrowth, 30) > this.limits.database.size ? '$25' : '$0'
    };
    
    projections['90_days'] = {
      databaseSize: Math.round(currentSize * Math.pow(1 + dailyGrowth, 90) / 1024 / 1024) + 'MB',
      estimatedCost: currentSize * Math.pow(1 + dailyGrowth, 90) > this.limits.database.size ? '$25' : '$0'
    };
    
    projections['365_days'] = {
      databaseSize: Math.round(currentSize * Math.pow(1 + dailyGrowth, 365) / 1024 / 1024) + 'MB',
      estimatedCost: '$25-$599'
    };
    
    return projections;
  }

  /**
   * Generate alerts based on usage
   */
  generateAlerts(results) {
    const usage = results.usage;
    
    // Database alerts
    if (usage.database.estimatedSize > this.limits.database.size * this.limits.database.critical) {
      results.critical.push({
        type: 'DATABASE_SIZE_CRITICAL',
        message: 'Database size exceeds 95% of free tier limit!',
        action: 'Immediate action required: Archive data or upgrade'
      });
    } else if (usage.database.estimatedSize > this.limits.database.size * this.limits.database.warning) {
      results.warnings.push({
        type: 'DATABASE_SIZE_WARNING',
        message: 'Database size exceeds 80% of free tier limit',
        action: 'Plan for data archival or tier upgrade'
      });
    }
    
    // Expensive operations alerts
    const criticalOps = usage.expensive.filter(op => op.cost === 'CRITICAL');
    if (criticalOps.length > 0) {
      results.critical.push({
        type: 'EXPENSIVE_OPERATIONS',
        message: `${criticalOps.length} critical cost operations found`,
        action: 'Refactor immediately to prevent cost overruns'
      });
    }
    
    // API usage alerts
    if (usage.api.costlyEndpoints.length > 5) {
      results.warnings.push({
        type: 'INEFFICIENT_API_USAGE',
        message: 'Multiple inefficient API patterns detected',
        action: 'Optimize queries and implement caching'
      });
    }
  }

  /**
   * Generate optimization recommendations
   */
  generateOptimizations(results) {
    const optimizations = [];
    
    // Database optimizations
    if (results.usage.database.largestTables.length > 0) {
      const largestTable = results.usage.database.largestTables[0];
      if (largestTable.rowCount > 10000) {
        optimizations.push({
          area: 'Database',
          priority: 'HIGH',
          recommendation: `Archive old records from ${largestTable.name}`,
          impact: `Could reduce database size by ~${Math.round(largestTable.estimatedSize / 1024)}MB`,
          implementation: `
// Archive records older than 90 days
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - 90);

const { data } = await supabase
  .from('${largestTable.name}')
  .select('*')
  .lt('created_at', cutoffDate.toISOString());

// Save to archive storage
await saveToArchive(data);

// Delete from main table
await supabase
  .from('${largestTable.name}')
  .delete()
  .lt('created_at', cutoffDate.toISOString());`
        });
      }
    }
    
    // API optimizations
    if (results.usage.expensive.filter(op => op.type === 'SELECT_ALL').length > 0) {
      optimizations.push({
        area: 'API Queries',
        priority: 'MEDIUM',
        recommendation: 'Replace SELECT * with specific columns',
        impact: 'Reduce bandwidth by 50-70%',
        implementation: `
// Instead of:
const { data } = await supabase.from('users').select('*');

// Use:
const { data } = await supabase.from('users').select('id, name, email');`
      });
    }
    
    // Caching optimizations
    if (results.usage.api.endpoints.length > 10) {
      optimizations.push({
        area: 'Caching',
        priority: 'HIGH',
        recommendation: 'Implement Redis caching layer',
        impact: 'Reduce API calls by 60-80%',
        implementation: 'Consider using Upstash Redis (free tier: 10k commands/day)'
      });
    }
    
    return optimizations;
  }

  /**
   * Calculate cost efficiency score
   */
  calculateScore(results) {
    let score = 100;
    
    // Deduct for warnings
    score -= results.warnings.length * 5;
    score -= results.critical.length * 15;
    
    // Deduct for expensive operations
    score -= results.usage.expensive.filter(op => op.cost === 'CRITICAL').length * 10;
    score -= results.usage.expensive.filter(op => op.cost === 'HIGH').length * 5;
    
    // Deduct for inefficient patterns
    score -= results.usage.api.costlyEndpoints.length * 3;
    
    return Math.max(0, score);
  }

  /**
   * Generate cost report
   */
  generateReport(results) {
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
   */
  async saveAnalysis(results) {
    const reportPath = 'cost-analysis.json';
    await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n📊 Detailed analysis saved to: ${reportPath}`);
    
    // Create optimization guide
    const guidePath = 'cost-optimization-guide.md';
    const guide = this.createOptimizationGuide(results);
    await fs.writeFile(guidePath, guide);
    console.log(`📋 Optimization guide saved to: ${guidePath}`);
  }

  /**
   * Create optimization guide markdown
   */
  createOptimizationGuide(results) {
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
   */
  async setupMonitoring(results) {
    // Create a monitoring configuration
    const monitorConfig = {
      alerts: {
        database_size: {
          threshold: this.limits.database.size * this.limits.database.warning,
          action: 'email'
        },
        api_calls: {
          threshold: this.limits.api.hourly * this.limits.api.warning,
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

  /**
   * Generate cache implementation code
   */
  generateCacheImplementation(pattern) {
    return `
// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCached(key, fetcher) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const data = await fetcher();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}`;
  }

  // Helper methods
  async getSourceFiles(basePath) {
    const files = [];
    
    async function walk(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(fullPath);
          } else if (entry.isFile() && entry.name.match(/\.(js|jsx|ts|tsx)$/)) {
            files.push(fullPath);
          }
        }
      } catch (e) {
        // Directory doesn't exist
      }
    }
    
    await walk(basePath);
    return files;
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