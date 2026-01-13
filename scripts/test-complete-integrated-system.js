#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


/**
 * Complete Integrated System Test
 * Tests all 4 new sub-agents with full LEO Protocol QA improvements
 * Validates: BaseSubAgent, SharedIntelligenceHub, AutoFixEngine, PriorityEngine, TypeMapper
 */

import fs from 'fs';
import path from 'path';

// Import all components
// SD-FOUNDATION-V3-003: Updated to use existing V1 agents (V2 versions don't exist)
import SecuritySubAgent from '../lib/agents/security-sub-agent.js';  // Replaces DocumentationSubAgentV2
import TestingSubAgent from '../lib/agents/testing-sub-agent.js';   // Replaces TestingSubAgentV2
import APISubAgent from '../lib/agents/api-sub-agent.js';
import DependencySubAgent from '../lib/agents/dependency-sub-agent.js';
 
import { SharedIntelligenceHub as _SharedIntelligenceHub, getInstance as getHubInstance } from '../lib/agents/shared-intelligence-hub.js';
import PriorityEngine from '../lib/agents/priority-engine.js';
import AutoFixEngine from '../lib/agents/auto-fix-engine.js';
 
import { TypeMapper as _TypeMapper, getInstance as getTypeMapperInstance } from '../lib/agents/type-mapping.js';

console.log('🧪 LEO Protocol Complete Integrated System Test');
console.log('Testing all 4 new sub-agents with full improvements\n');

async function testCompleteSystem() {
  const results = {
    agents: {},
    integration: {},
    fixes: {},
    priorities: {},
    errors: []
  };

  try {
    // Initialize all systems
    console.log('🔧 Initializing system components...');
    const hub = getHubInstance();
    const priorityEngine = new PriorityEngine();
    const autoFixEngine = new AutoFixEngine();
    const typeMapper = getTypeMapperInstance();
    
    // Initialize agents
    // SD-FOUNDATION-V3-003: Using SecuritySubAgent instead of non-existent DocumentationSubAgentV2
    const securityAgent = new SecuritySubAgent();
    const testAgent = new TestingSubAgent();
    const apiAgent = new APISubAgent();
    const depAgent = new DependencySubAgent();
    
    console.log('✅ All components initialized\n');

    // Test each agent individually
    console.log('🔍 Testing individual agents...\n');
    
    // 1. Security Agent Test (SD-FOUNDATION-V3-003: Replaced non-existent DocumentationSubAgentV2)
    console.log('🔒 Testing Security Sub-Agent...');
    try {
      const securityResult = await securityAgent.execute('.');
      const securityFindings = securityResult.findings || [];
      results.agents.security = {
        findings: securityFindings.length,
        types: [...new Set(securityFindings.map(f => f.type))],
        confidence: securityFindings.length > 0 ? (securityFindings.reduce((sum, f) => sum + f.confidence, 0) / securityFindings.length).toFixed(2) : 0,
        score: securityResult.score,
        status: securityResult.status
      };
      console.log(`  Found ${securityFindings.length} security findings (Score: ${securityResult.score}, Status: ${securityResult.status})`);

      // Share findings with hub
      securityFindings.forEach(finding => hub.shareFinding('security', finding));

    } catch (_error) {
      results.errors.push(`Security Agent: ${error.message}`);
      console.log(`  ❌ Error: ${error.message}`);
    }

    // 2. Testing Agent Test (SD-FOUNDATION-V3-003: Using V1 TestingSubAgent)
    console.log('🧪 Testing Testing Sub-Agent...');
    try {
      const testResult = await testAgent.execute('.');
      const testFindings = testResult.findings || [];
      results.agents.testing = {
        findings: testFindings.length,
        types: [...new Set(testFindings.map(f => f.type))],
        confidence: testFindings.length > 0 ? (testFindings.reduce((sum, f) => sum + f.confidence, 0) / testFindings.length).toFixed(2) : 0,
        score: testResult.score,
        status: testResult.status
      };
      console.log(`  Found ${testFindings.length} testing findings (Score: ${testResult.score}, Status: ${testResult.status})`);

      // Share findings with hub (SD-FOUNDATION-V3-003: Fixed argument order - agentName first)
      testFindings.forEach(finding => hub.shareFinding('testing', finding));

    } catch (_error) {
      results.errors.push(`Testing Agent: ${error.message}`);
      console.log(`  ❌ Error: ${error.message}`);
    }

    // 3. API Agent Test
    console.log('🌐 Testing API Sub-Agent...');
    try {
      const apiResult = await apiAgent.execute('.');
      const apiFindings = apiResult.findings || [];
      results.agents.api = {
        findings: apiFindings.length,
        types: [...new Set(apiFindings.map(f => f.type))],
        confidence: apiFindings.length > 0 ? (apiFindings.reduce((sum, f) => sum + f.confidence, 0) / apiFindings.length).toFixed(2) : 0,
        score: apiResult.score,
        status: apiResult.status
      };
      console.log(`  Found ${apiFindings.length} API findings (Score: ${apiResult.score}, Status: ${apiResult.status})`);

      // Share findings with hub (SD-FOUNDATION-V3-003: Fixed argument order - agentName first)
      apiFindings.forEach(finding => hub.shareFinding('api', finding));

    } catch (_error) {
      results.errors.push(`API Agent: ${error.message}`);
      console.log(`  ❌ Error: ${error.message}`);
    }

    // 4. Dependency Agent Test
    console.log('📦 Testing Dependency Sub-Agent...');
    try {
      const depResult = await depAgent.execute('.');
      const depFindings = depResult.findings || [];
      results.agents.dependencies = {
        findings: depFindings.length,
        types: [...new Set(depFindings.map(f => f.type))],
        confidence: depFindings.length > 0 ? (depFindings.reduce((sum, f) => sum + f.confidence, 0) / depFindings.length).toFixed(2) : 0,
        score: depResult.score,
        status: depResult.status
      };
      console.log(`  Found ${depFindings.length} dependency findings (Score: ${depResult.score}, Status: ${depResult.status})`);

      // Share findings with hub (SD-FOUNDATION-V3-003: Fixed argument order - agentName first)
      depFindings.forEach(finding => hub.shareFinding('dependencies', finding));

    } catch (_error) {
      results.errors.push(`Dependency Agent: ${error.message}`);
      console.log(`  ❌ Error: ${error.message}`);
    }

    console.log('\n🔗 Testing system integration...\n');

    // Test SharedIntelligenceHub
    console.log('🧠 Testing SharedIntelligenceHub...');
    const allFindings = hub.getAllFindings();
    const correlations = hub.getCorrelations();
    const compoundInsights = hub.getCompoundInsights();
    
    results.integration.hub = {
      totalFindings: allFindings.length,
      correlations: correlations.length,
      compoundInsights: compoundInsights.length,
      agents: Object.keys(hub.agentFindings)
    };
    
    console.log(`  Total findings: ${allFindings.length}`);
    console.log(`  Correlations detected: ${correlations.length}`);
    console.log(`  Compound insights: ${compoundInsights.length}`);

    // Test PriorityEngine
    console.log('🎯 Testing PriorityEngine...');
    const prioritizedFindings = priorityEngine.prioritizeFindings(allFindings);
    const actionPlan = priorityEngine.generateActionPlan(prioritizedFindings);
    
    results.priorities = {
      totalFindings: prioritizedFindings.length,
      criticalFindings: prioritizedFindings.filter(f => f.priority === 'CRITICAL').length,
      highFindings: prioritizedFindings.filter(f => f.priority === 'HIGH').length,
      actionPlanSteps: actionPlan.phases ? actionPlan.phases.length : 0
    };
    
    console.log(`  Prioritized ${prioritizedFindings.length} findings`);
    console.log(`  Critical: ${results.priorities.criticalFindings}, High: ${results.priorities.highFindings}`);
    console.log(`  Action plan phases: ${results.priorities.actionPlanSteps}`);

    // Test AutoFixEngine and TypeMapper
    console.log('🔧 Testing AutoFixEngine and TypeMapper...');
    let successfulFixes = 0;
    let typeMapTests = 0;
    
    for (const finding of allFindings.slice(0, 10)) { // Test first 10 findings
      try {
        // Test type mapping
        const _mappedType = typeMapper.mapType(finding);
        const isFixable = typeMapper.isFixable(finding);
        const _confidence = typeMapper.getFixConfidence(finding);
        
        typeMapTests++;
        
        if (isFixable) {
          const prepared = typeMapper.prepareFindingForFix(finding);
          const fix = await autoFixEngine.generateFix(prepared);
          if (fix && fix.code) {
            successfulFixes++;
          }
        }
      } catch (_error) {
        // Continue testing other findings
      }
    }
    
    results.fixes = {
      typeMapTests,
      successfulFixes,
      successRate: typeMapTests > 0 ? ((successfulFixes / typeMapTests) * 100).toFixed(1) : 0
    };
    
    console.log(`  Type mapping tests: ${typeMapTests}`);
    console.log(`  Successful fixes: ${successfulFixes}`);
    console.log(`  Fix success rate: ${results.fixes.successRate}%`);

    // Test BaseSubAgent standardization
    console.log('📊 Testing BaseSubAgent standardization...');
    const standardization = {
      hasLocationObject: 0,
      hasConfidence: 0,
      hasSeverity: 0,
      hasMetadata: 0
    };
    
    allFindings.forEach(finding => {
      if (finding.location && typeof finding.location === 'object') standardization.hasLocationObject++;
      if (typeof finding.confidence === 'number') standardization.hasConfidence++;
      if (finding.severity) standardization.hasSeverity++;
      if (finding.metadata && typeof finding.metadata === 'object') standardization.hasMetadata++;
    });
    
    results.integration.standardization = {
      ...standardization,
      totalFindings: allFindings.length,
      standardizationScore: allFindings.length > 0 ? 
        ((standardization.hasLocationObject + standardization.hasConfidence + 
          standardization.hasSeverity + standardization.hasMetadata) / (4 * allFindings.length) * 100).toFixed(1) : 0
    };
    
    console.log(`  Standardization score: ${results.integration.standardization.standardizationScore}%`);

  } catch (_error) {
    results.errors.push(`System Error: ${error.message}`);
    console.error(`❌ System Error: ${error.message}`);
  }

  // Generate comprehensive report
  console.log('\n📋 COMPREHENSIVE TEST RESULTS\n');
  console.log('═'.repeat(50));
  
  console.log('\n🤖 AGENT PERFORMANCE:');
  Object.entries(results.agents).forEach(([agent, data]) => {
    console.log(`  ${agent.toUpperCase()}:`);
    console.log(`    Findings: ${data.findings}`);
    console.log(`    Types: ${data.types.join(', ')}`);
    console.log(`    Avg Confidence: ${data.confidence}`);
  });
  
  console.log('\n🔗 INTEGRATION PERFORMANCE:');
  if (results.integration.hub) {
    console.log(`  Total Findings: ${results.integration.hub.totalFindings}`);
    console.log(`  Cross-agent Correlations: ${results.integration.hub.correlations}`);
    console.log(`  Compound Insights: ${results.integration.hub.compoundInsights}`);
    console.log(`  Active Agents: ${results.integration.hub.agents.join(', ')}`);
  }
  
  console.log('\n📊 STANDARDIZATION:');
  if (results.integration.standardization) {
    const std = results.integration.standardization;
    console.log(`  Location Objects: ${std.hasLocationObject}/${std.totalFindings}`);
    console.log(`  Confidence Values: ${std.hasConfidence}/${std.totalFindings}`);
    console.log(`  Severity Ratings: ${std.hasSeverity}/${std.totalFindings}`);
    console.log(`  Metadata Objects: ${std.hasMetadata}/${std.totalFindings}`);
    console.log(`  Overall Score: ${std.standardizationScore}%`);
  }
  
  console.log('\n🎯 PRIORITIZATION:');
  console.log(`  Total Prioritized: ${results.priorities.totalFindings}`);
  console.log(`  Critical Priority: ${results.priorities.criticalFindings}`);
  console.log(`  High Priority: ${results.priorities.highFindings}`);
  console.log(`  Action Plan Phases: ${results.priorities.actionPlanSteps}`);
  
  console.log('\n🔧 AUTO-FIX CAPABILITY:');
  console.log(`  Type Mapping Tests: ${results.fixes.typeMapTests}`);
  console.log(`  Successful Fixes: ${results.fixes.successfulFixes}`);
  console.log(`  Success Rate: ${results.fixes.successRate}%`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ ERRORS ENCOUNTERED:');
    results.errors.forEach(error => console.log(`  - ${error}`));
  }
  
  console.log('\n🏆 OVERALL SYSTEM STATUS:');
  const agentCount = Object.keys(results.agents).length;
  const totalFindings = Object.values(results.agents).reduce((sum, agent) => sum + agent.findings, 0);
  const avgConfidence = Object.values(results.agents)
    .filter(agent => agent.findings > 0)
    .reduce((sum, agent) => sum + parseFloat(agent.confidence), 0) / agentCount;
  
  console.log(`  ✅ Agents Active: ${agentCount}/4`);
  console.log(`  ✅ Total Findings: ${totalFindings}`);
  console.log(`  ✅ Average Confidence: ${avgConfidence.toFixed(2)}`);
  console.log(`  ✅ Integration Score: ${results.integration.standardization ? results.integration.standardization.standardizationScore : 'N/A'}%`);
  console.log(`  ✅ Fix Success Rate: ${results.fixes.successRate}%`);
  console.log(`  ${results.errors.length === 0 ? '✅' : '⚠️'} Error Count: ${results.errors.length}`);
  
  const overallSuccess = agentCount === 4 && results.errors.length === 0 && totalFindings > 0;
  console.log(`\n🎯 TEST RESULT: ${overallSuccess ? '✅ SUCCESS' : '⚠️ ISSUES DETECTED'}`);
  
  // Save detailed results
  const reportPath = path.join(__dirname, '../docs/integration-test-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Detailed results saved to: ${reportPath}`);
  
  return overallSuccess;
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testCompleteSystem()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test failed:', error);
      process.exit(1);
    });
}

export {  testCompleteSystem  };
