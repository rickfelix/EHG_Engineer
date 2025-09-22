#!/usr/bin/env node

/**
 * Integration Test Script for All Sub-Agents
 * Tests all sub-agents on a target application and generates a comprehensive report
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { execSync } from 'child_process';

// Import all sub-agents (updated paths)
import SecuritySubAgent from '../lib/agents/security-sub-agent';
import PerformanceSubAgent from '../lib/agents/performance-sub-agent';
import DesignSubAgent from '../lib/agents/design-sub-agent';
import DatabaseSubAgent from '../lib/agents/database-sub-agent';
import DocumentationSubAgent from '../lib/agents/documentation-sub-agent';
import CostSubAgent from '../lib/agents/cost-sub-agent';
import TestingSubAgent from '../lib/agents/testing-sub-agent';
import APISubAgent from '../lib/agents/api-sub-agent';

class SubAgentIntegrationTester {
  constructor(basePath) {
    this.basePath = basePath || '/mnt/c/_EHG/EHG_Engineer/applications/APP001/codebase';
    this.results = {
      timestamp: new Date().toISOString(),
      basePath: this.basePath,
      agents: {},
      overallScore: 0,
      criticalIssues: [],
      recommendations: []
    };
  }

  /**
   * Run all sub-agents and collect results
   */
  async runAllTests() {
    console.log('🚀 LEO Protocol Sub-Agent Integration Test\n');
    console.log('=' .repeat(70));
    console.log(`📁 Testing Application: ${this.basePath}`);
    console.log('=' .repeat(70) + '\n');

    const agents = [
      { name: 'Security', Agent: SecuritySubAgent, emoji: '🛡️' },
      { name: 'Performance', Agent: PerformanceSubAgent, emoji: '⚡' },
      { name: 'Design', Agent: DesignSubAgent, emoji: '🎨' },
      { name: 'Database', Agent: DatabaseSubAgent, emoji: '🗄️' },
      { name: 'Documentation', Agent: DocumentationSubAgent, emoji: '📚' },
      { name: 'Cost', Agent: CostSubAgent, emoji: '💰' },
      { name: 'Testing', Agent: TestingSubAgent, emoji: '🧪' },
      { name: 'API', Agent: APISubAgent, emoji: '🚀' }
    ];

    let totalScore = 0;
    let agentCount = 0;

    for (const { name, Agent, emoji } of agents) {
      console.log(`\n${emoji} Running ${name} Sub-Agent...`);
      console.log('-'.repeat(50));
      
      try {
        const agent = new Agent();
        let result;
        
        // All agents now use standardized execute method with context
        if (name === 'Cost') {
          // Cost agent needs project ID
          result = await agent.execute({
            path: this.basePath,
            supabaseProjectId: 'liapbndqlqxdcgpwntbv'
          });
        } else {
          // All other agents use standard execute method
          result = await agent.execute({
            path: this.basePath
          });
        }
        
        this.results.agents[name] = {
          status: 'completed',
          score: result.score || 0,
          issues: this.extractIssues(result, name),
          summary: this.generateSummary(result, name)
        };
        
        totalScore += result.score || 0;
        agentCount++;
        
        console.log(`✅ ${name} Complete - Score: ${result.score || 0}/100`);
        
        // Collect critical issues
        if (name === 'Security' && result.critical?.length > 0) {
          this.results.criticalIssues.push(...result.critical.map(i => ({
            agent: 'Security',
            ...i
          })));
        }
        
      } catch (error) {
        console.error(`❌ ${name} Failed: ${error.message}`);
        this.results.agents[name] = {
          status: 'failed',
          error: error.message,
          score: 0
        };
      }
    }

    // Calculate overall score
    this.results.overallScore = Math.round(totalScore / agentCount);

    // Generate comprehensive recommendations
    this.generateRecommendations();
    
    // Display final report
    this.displayReport();
    
    // Save detailed report
    await this.saveReport();
  }

  /**
   * Extract issues from agent results
   */
  extractIssues(result, agentName) {
    const issues = [];
    
    // Different agents structure issues differently
    if (result.critical) issues.push(...result.critical.map(i => ({ severity: 'critical', ...i })));
    if (result.high) issues.push(...result.high.map(i => ({ severity: 'high', ...i })));
    if (result.medium) issues.push(...result.medium.map(i => ({ severity: 'medium', ...i })));
    if (result.low) issues.push(...result.low.map(i => ({ severity: 'low', ...i })));
    if (result.issues) issues.push(...result.issues);
    
    // For specific agents
    if (agentName === 'Performance' && result.measurements) {
      Object.entries(result.measurements).forEach(([key, value]) => {
        if (value.status === 'CRITICAL' || value.status === 'ERROR') {
          issues.push({
            type: key.toUpperCase(),
            severity: value.status.toLowerCase(),
            description: `${key} measurement failed`
          });
        }
      });
    }
    
    return issues;
  }

  /**
   * Generate summary for agent results
   */
  generateSummary(result, agentName) {
    const summaries = {
      Security: `Found ${(result.critical?.length || 0) + (result.high?.length || 0)} high-risk vulnerabilities`,
      Performance: `${result.issues?.length || 0} performance anti-patterns detected`,
      Design: `${result.accessibility?.issues?.length || 0} accessibility issues found`,
      Database: `${result.queries?.issues?.length || 0} query optimization opportunities`,
      Documentation: `${result.readme?.issues?.length || 0} documentation gaps identified`,
      Cost: `Projected monthly cost: $${result.projectedCost?.total || 0}`,
      Testing: `Test coverage: ${result.coverage?.percentage || 0}%`
    };
    
    return summaries[agentName] || 'Analysis complete';
  }

  /**
   * Generate comprehensive recommendations
   */
  generateRecommendations() {
    const recs = [];
    
    // Priority 1: Security Critical Issues
    if (this.results.agents.Security?.issues?.some(i => i.severity === 'critical')) {
      recs.push({
        priority: 'CRITICAL',
        title: 'Fix Security Vulnerabilities',
        description: 'Address critical security issues immediately',
        agents: ['Security']
      });
    }
    
    // Priority 2: Database Performance
    if (this.results.agents.Database?.score < 50) {
      recs.push({
        priority: 'HIGH',
        title: 'Optimize Database Queries',
        description: 'Fix N+1 queries and add missing indexes',
        agents: ['Database', 'Performance']
      });
    }
    
    // Priority 3: Accessibility
    if (this.results.agents.Design?.score < 60) {
      recs.push({
        priority: 'HIGH',
        title: 'Improve Accessibility',
        description: 'Fix WCAG compliance issues for better accessibility',
        agents: ['Design']
      });
    }
    
    // Priority 4: Performance
    if (this.results.agents.Performance?.score < 70) {
      recs.push({
        priority: 'MEDIUM',
        title: 'Optimize Performance',
        description: 'Reduce bundle size and fix memory leaks',
        agents: ['Performance', 'Cost']
      });
    }
    
    // Priority 5: Documentation
    if (this.results.agents.Documentation?.score < 80) {
      recs.push({
        priority: 'LOW',
        title: 'Update Documentation',
        description: 'Sync documentation with actual implementation',
        agents: ['Documentation']
      });
    }
    
    this.results.recommendations = recs;
  }

  /**
   * Display final report
   */
  displayReport() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 FINAL INTEGRATION TEST REPORT');
    console.log('='.repeat(70));
    
    console.log(`\n🎯 Overall Score: ${this.results.overallScore}/100\n`);
    
    // Individual agent scores
    console.log('Sub-Agent Scores:');
    Object.entries(this.results.agents).forEach(([name, result]) => {
      const status = result.status === 'completed' ? '✅' : '❌';
      console.log(`  ${status} ${name}: ${result.score}/100 - ${result.summary || result.error}`);
    });
    
    // Critical issues
    if (this.results.criticalIssues.length > 0) {
      console.log(`\n🚨 CRITICAL ISSUES (${this.results.criticalIssues.length}):`);
      this.results.criticalIssues.slice(0, 5).forEach((issue, i) => {
        console.log(`  ${i + 1}. [${issue.agent}] ${issue.type}: ${issue.description}`);
      });
    }
    
    // Top recommendations
    if (this.results.recommendations.length > 0) {
      console.log('\n📋 TOP RECOMMENDATIONS:');
      this.results.recommendations.slice(0, 5).forEach((rec, i) => {
        console.log(`  ${i + 1}. [${rec.priority}] ${rec.title}`);
        console.log(`     ${rec.description}`);
      });
    }
    
    console.log('\n' + '='.repeat(70));
  }

  /**
   * Save detailed report to file
   */
  async saveReport() {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const reportPath = path.join(process.cwd(), `integration-test-report-${timestamp}.json`);
    
    await fs.writeFile(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n💾 Detailed report saved to: ${reportPath}`);
    
    // Also save a summary markdown file
    const summaryPath = path.join(process.cwd(), `integration-test-summary-${timestamp}.md`);
    await this.saveSummaryMarkdown(summaryPath);
    console.log(`📝 Summary report saved to: ${summaryPath}`);
  }

  /**
   * Save markdown summary
   */
  async saveSummaryMarkdown(filepath) {
    let md = '# Sub-Agent Integration Test Report\n\n';
    md += `**Date:** ${this.results.timestamp}\n`;
    md += `**Application:** ${this.basePath}\n`;
    md += `**Overall Score:** ${this.results.overallScore}/100\n\n`;
    
    md += '## Sub-Agent Results\n\n';
    md += '| Agent | Score | Status | Summary |\n';
    md += '|-------|-------|--------|----------|\n';
    
    Object.entries(this.results.agents).forEach(([name, result]) => {
      md += `| ${name} | ${result.score}/100 | ${result.status} | ${result.summary || result.error} |\n`;
    });
    
    if (this.results.criticalIssues.length > 0) {
      md += '\n## Critical Issues\n\n';
      this.results.criticalIssues.forEach((issue, i) => {
        md += `${i + 1}. **[${issue.agent}]** ${issue.type}: ${issue.description}\n`;
      });
    }
    
    if (this.results.recommendations.length > 0) {
      md += '\n## Recommendations\n\n';
      this.results.recommendations.forEach((rec, i) => {
        md += `### ${i + 1}. ${rec.title} [${rec.priority}]\n\n`;
        md += `${rec.description}\n\n`;
        md += `**Relevant Agents:** ${rec.agents.join(', ')}\n\n`;
      });
    }
    
    await fs.writeFile(filepath, md);
  }
}

// Main execution
async function main() {
  const tester = new SubAgentIntegrationTester();
  
  try {
    await tester.runAllTests();
    process.exit(0);
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default SubAgentIntegrationTester;