#!/usr/bin/env node

/**
 * Test All Sub-Agents with Dynamic Path Support
 * No more hardcoded paths - all agents can analyze any project
 */

import { DynamicSubAgentWrapper } from '../lib/agents/dynamic-sub-agent-wrapper';
import path from 'path';
import fs from 'fs';

// Parse command-line arguments
const targetPath = process.argv[2] || process.cwd();
const specificAgent = process.argv[3]; // Optional: test specific agent only

console.log('🚀 Dynamic Sub-Agent Test Suite');
console.log(`📁 Target Path: ${targetPath}`);
console.log(`🔧 Testing: ${specificAgent || 'All agents'}\n`);

// Check if path exists
if (!fs.existsSync(targetPath)) {
  console.error(`❌ Path does not exist: ${targetPath}`);
  process.exit(1);
}

// Define all sub-agents
const subAgents = {
  Security: '../lib/agents/security-sub-agent',
  Performance: '../lib/agents/performance-sub-agent',
  Documentation: '../lib/agents/documentation-sub-agent',
  Design: '../lib/agents/design-sub-agent',
  Database: '../lib/agents/database-sub-agent',
  Cost: '../lib/agents/cost-sub-agent'
};

// Results collection
const allResults = {};

async function testAgent(name, modulePath) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing ${name} Sub-Agent`);
  console.log('='.repeat(60));
  
  try {
    // Load the agent module
    const AgentClass = require(modulePath);
    
    // Create dynamic wrapper
    const dynamicAgent = new DynamicSubAgentWrapper(AgentClass, name);
    
    // Get agent info
    const info = dynamicAgent.getInfo();
    console.log(`✅ Loaded ${info.class}`);
    console.log(`   Available methods: ${info.methods.slice(0, 5).join(', ')}...`);
    
    // Execute analysis
    console.log(`\n📊 Running ${name} analysis...`);
    const startTime = Date.now();
    
    const results = await dynamicAgent.execute({ 
      path: targetPath,
      // Add any agent-specific options here
      verbose: false,
      detailed: true
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Store results
    allResults[name] = {
      ...results,
      duration,
      success: results.success !== false
    };
    
    // Display summary
    if (results.success !== false) {
      console.log(`✅ ${name} analysis completed in ${duration}s`);
      console.log(`   Score: ${results.score || 'N/A'}/100`);
      console.log(`   Issues: ${results.issues?.length || 0}`);
      
      // Show top issues if any
      if (results.issues && results.issues.length > 0) {
        console.log('   Top issues:');
        results.issues.slice(0, 3).forEach(issue => {
          console.log(`   - ${issue.type || issue.description || issue}`);
        });
      }
    } else {
      console.log(`❌ ${name} analysis failed: ${results.error}`);
    }
    
    // Save individual report
    const reportName = `${name.toLowerCase()}-report-dynamic.json`;
    const reportPath = path.join(process.cwd(), reportName);
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`   💾 Report saved: ${reportName}`);
    
  } catch (error) {
    console.error(`❌ Failed to test ${name} Sub-Agent:`, error.message);
    allResults[name] = {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

async function runTests() {
  // Filter agents if specific one requested
  const agentsToTest = specificAgent ? 
    { [specificAgent]: subAgents[specificAgent] } : 
    subAgents;
    
  if (specificAgent && !subAgents[specificAgent]) {
    console.error(`❌ Unknown agent: ${specificAgent}`);
    console.log(`Available agents: ${Object.keys(subAgents).join(', ')}`);
    process.exit(1);
  }
  
  // Test each agent
  for (const [name, modulePath] of Object.entries(agentsToTest)) {
    await testAgent(name, modulePath);
  }
  
  // Generate summary report
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY REPORT');
  console.log('='.repeat(60));
  
  let totalScore = 0;
  let scoreCount = 0;
  let successCount = 0;
  let totalIssues = 0;
  
  for (const [name, results] of Object.entries(allResults)) {
    const status = results.success ? '✅' : '❌';
    const score = results.score || 'N/A';
    const issues = results.issues?.length || 0;
    
    console.log(`${status} ${name.padEnd(15)} Score: ${String(score).padEnd(5)} Issues: ${issues}`);
    
    if (results.success) {
      successCount++;
      if (typeof results.score === 'number') {
        totalScore += results.score;
        scoreCount++;
      }
      totalIssues += issues;
    }
  }
  
  console.log('\n📊 Overall Statistics:');
  console.log(`   Successful: ${successCount}/${Object.keys(allResults).length}`);
  console.log(`   Average Score: ${scoreCount > 0 ? Math.round(totalScore / scoreCount) : 'N/A'}/100`);
  console.log(`   Total Issues: ${totalIssues}`);
  
  // Save combined report
  const combinedReport = {
    timestamp: new Date().toISOString(),
    targetPath,
    summary: {
      agentsTested: Object.keys(allResults).length,
      successful: successCount,
      failed: Object.keys(allResults).length - successCount,
      averageScore: scoreCount > 0 ? Math.round(totalScore / scoreCount) : null,
      totalIssues
    },
    results: allResults
  };
  
  const combinedReportPath = path.join(process.cwd(), 'all-subagents-dynamic-report.json');
  fs.writeFileSync(combinedReportPath, JSON.stringify(combinedReport, null, 2));
  console.log(`\n💾 Combined report saved: ${combinedReportPath}`);
  
  // Show usage help
  console.log('\n📖 Usage:');
  console.log('   node test-all-dynamic-subagents.js                    # Test on current directory');
  console.log('   node test-all-dynamic-subagents.js /path/to/project   # Test specific path');
  console.log('   node test-all-dynamic-subagents.js /path Security     # Test specific agent only');
}

// Run the tests
runTests().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});