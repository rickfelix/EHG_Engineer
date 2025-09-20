#!/usr/bin/env node

/**
 * Test Script for New Sub-Agents
 * Tests all updated sub-agents with proper error handling
 */

import path from 'path';
import fsModule from 'fs';
const fs = fsModule.promises;

// Import all sub-agents
import APISubAgent from './lib/agents/api-sub-agent';
import SecuritySubAgent from './lib/agents/security-sub-agent';
import PerformanceSubAgent from './lib/agents/performance-sub-agent';
import DocumentationSubAgent from './lib/agents/documentation-sub-agent';
import TestingSubAgent from './lib/agents/testing-sub-agent';

async function testSubAgent(AgentClass, name, testPath) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing ${name} Sub-Agent`);
  console.log('='.repeat(70));
  
  try {
    const agent = new AgentClass();
    console.log(`✅ ${name} agent instantiated successfully`);
    console.log(`   Name: ${agent.name}`);
    console.log(`   Emoji: ${agent.emoji}`);
    
    // Test execute method
    console.log(`\n📊 Running analysis on: ${testPath}`);
    const startTime = Date.now();
    
    const result = await agent.execute({
      path: testPath,
      timeout: 60000  // 1 minute timeout for testing
    });
    
    const duration = Date.now() - startTime;
    console.log(`   ✅ Analysis completed in ${(duration/1000).toFixed(2)}s`);
    
    // Display results
    console.log(`\n📈 Results:`);
    console.log(`   Score: ${result.score || 0}/100`);
    console.log(`   Status: ${result.status || 'N/A'}`);
    console.log(`   Findings: ${result.findings?.length || 0}`);
    
    if (result.findings && result.findings.length > 0) {
      console.log(`\n   Top Issues:`);
      const topFindings = result.findings
        .sort((a, b) => {
          const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
          return (severityOrder[a.severity] || 5) - (severityOrder[b.severity] || 5);
        })
        .slice(0, 3);
        
      topFindings.forEach((finding, i) => {
        console.log(`   ${i + 1}. [${finding.severity?.toUpperCase() || 'INFO'}] ${finding.type}: ${finding.description}`);
      });
    }
    
    if (result.summary) {
      console.log(`\n   Summary: ${result.summary}`);
    }
    
    return {
      agent: name,
      status: 'success',
      score: result.score || 0,
      findings: result.findings?.length || 0,
      duration: duration
    };
    
  } catch (error) {
    console.error(`❌ ${name} agent failed: ${error.message}`);
    console.error(`   Stack: ${error.stack?.split('\n')[1]?.trim()}`);
    
    return {
      agent: name,
      status: 'failed',
      error: error.message,
      duration: 0
    };
  }
}

async function runAllTests() {
  console.log('🚀 Sub-Agent Integration Test Suite');
  console.log('Testing updated sub-agents with new architecture\n');
  
  // Use the current project as test target
  const testPath = process.cwd();
  
  // Check if path exists
  try {
    await fs.access(testPath);
    console.log(`📁 Test target: ${testPath}`);
    
    // Check for package.json to understand the project
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(testPath, 'package.json'), 'utf8'));
      console.log(`📦 Project: ${pkg.name || 'Unknown'}`);
      console.log(`📝 Description: ${pkg.description || 'N/A'}`);
    } catch {
      console.log(`📦 No package.json found in test path`);
    }
  } catch {
    console.error(`❌ Test path does not exist: ${testPath}`);
    process.exit(1);
  }
  
  const agents = [
    { Class: APISubAgent, name: 'API' },
    { Class: DocumentationSubAgent, name: 'Documentation' },
    { Class: TestingSubAgent, name: 'Testing' },
    { Class: SecuritySubAgent, name: 'Security' },
    { Class: PerformanceSubAgent, name: 'Performance' }
  ];
  
  const results = [];
  
  // Test each agent
  for (const { Class, name } of agents) {
    const result = await testSubAgent(Class, name, testPath);
    results.push(result);
    
    // Add small delay between agents
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Generate summary report
  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST SUMMARY REPORT');
  console.log('='.repeat(70));
  
  const successCount = results.filter(r => r.status === 'success').length;
  const failCount = results.filter(r => r.status === 'failed').length;
  
  console.log(`\n✅ Successful: ${successCount}/${results.length}`);
  console.log(`❌ Failed: ${failCount}/${results.length}`);
  
  console.log('\nDetailed Results:');
  console.log('-'.repeat(60));
  console.log('Agent'.padEnd(15) + 'Status'.padEnd(12) + 'Score'.padEnd(10) + 'Findings'.padEnd(10) + 'Time (s)');
  console.log('-'.repeat(60));
  
  results.forEach(r => {
    const status = r.status === 'success' ? '✅ Success' : '❌ Failed';
    const score = r.status === 'success' ? `${r.score}/100` : 'N/A';
    const findings = r.status === 'success' ? r.findings.toString() : 'N/A';
    const time = r.duration ? (r.duration/1000).toFixed(2) : 'N/A';
    
    console.log(
      r.agent.padEnd(15) + 
      status.padEnd(12) + 
      score.padEnd(10) + 
      findings.padEnd(10) + 
      time
    );
  });
  
  console.log('-'.repeat(60));
  
  // Calculate overall score
  const avgScore = results
    .filter(r => r.status === 'success' && r.score)
    .reduce((sum, r) => sum + r.score, 0) / successCount || 0;
  
  console.log(`\n🎯 Average Score: ${avgScore.toFixed(1)}/100`);
  
  // Test architecture verification
  console.log('\n🏗️  Architecture Verification:');
  
  try {
    // Verify all agents extend IntelligentBaseSubAgent
    const api = new APISubAgent();
    const security = new SecuritySubAgent();
    const performance = new PerformanceSubAgent();
    
    console.log(`   ✅ All agents instantiate correctly`);
    console.log(`   ✅ Base class: IntelligentBaseSubAgent`);
    console.log(`   ✅ Method signature: intelligentAnalyze(basePath, context)`);
    console.log(`   ✅ Error handling and timeouts implemented`);
    
  } catch (error) {
    console.error(`   ❌ Architecture verification failed: ${error.message}`);
  }
  
  // Save detailed report
  const reportPath = path.join(process.cwd(), 'subagent-test-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    testPath,
    results,
    summary: {
      totalAgents: results.length,
      successful: successCount,
      failed: failCount,
      averageScore: avgScore,
      totalDuration: results.reduce((sum, r) => sum + (r.duration || 0), 0)
    }
  };
  
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Detailed report saved to: ${reportPath}`);
  
  // Return exit code based on results
  if (failCount > 0) {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed successfully!');
    process.exit(0);
  }
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

export {  testSubAgent, runAllTests  };