#!/usr/bin/env node

/**
 * Test Intelligent Multi-Agent Selection System
 * Demonstrates the new capability to select ALL necessary agents, not just top 3
 */

import 'dotenv/config';
import IntelligentMultiSelector from '../lib/agents/intelligent-multi-selector.js';
import IntelligentAutoSelector from '../lib/agents/auto-selector.js';

async function testMultiAgentSelection() {
  console.log('\n' + '═'.repeat(80));
  console.log('🚀 INTELLIGENT MULTI-AGENT SELECTION TEST');
  console.log('═'.repeat(80));
  
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const multiSelector = new IntelligentMultiSelector(openaiApiKey);
  const autoSelector = new IntelligentAutoSelector(openaiApiKey);
  
  // Test scenarios that require multiple agents
  const testScenarios = [
    {
      name: 'Full Implementation',
      prompt: 'Implement a secure user authentication system with database storage, API endpoints, and performance monitoring',
      expectedAgents: ['SECURITY', 'DATABASE', 'API', 'PERFORMANCE', 'TESTING']
    },
    {
      name: 'Bug Investigation',
      prompt: 'Debug why the application is slow, has memory leaks, and occasionally shows authentication errors',
      expectedAgents: ['DEBUG', 'PERFORMANCE', 'SECURITY', 'TESTING', 'DATABASE']
    },
    {
      name: 'Security Audit',
      prompt: 'Conduct a comprehensive security audit including database access, API endpoints, authentication, and dependency vulnerabilities',
      expectedAgents: ['SECURITY', 'DATABASE', 'API', 'DEPENDENCY', 'TESTING']
    },
    {
      name: 'Performance Optimization',
      prompt: 'Optimize application performance including database queries, API response times, and reduce infrastructure costs',
      expectedAgents: ['PERFORMANCE', 'DATABASE', 'API', 'COST']
    },
    {
      name: 'New Feature Development',
      prompt: 'Design and implement a new dashboard with real-time data updates, responsive UI, and accessibility compliance',
      expectedAgents: ['DESIGN', 'API', 'DATABASE', 'PERFORMANCE', 'TESTING']
    }
  ];
  
  console.log('\n📊 Testing Multi-Agent Selection Scenarios\n');
  
  for (const scenario of testScenarios) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📝 Scenario: ${scenario.name}`);
    console.log(`   Prompt: "${scenario.prompt}"`);
    console.log(`   Expected Agents: ${scenario.expectedAgents.join(', ')}`);
    console.log('');
    
    try {
      // Test with new multi-selector
      console.log('🔍 Using Intelligent Multi-Selector:');
      const multiResult = await multiSelector.selectAgents(scenario.prompt, {
        task_complexity: 1.5 // Indicate complex task
      });
      
      if (multiResult.selected_agents && multiResult.selected_agents.length > 0) {
        console.log(`   ✅ Selected ${multiResult.total_agents} agents:`);
        
        // Group by confidence tier
        const tiers = {
          critical: multiResult.selected_agents.filter(a => a.confidence >= 0.85),
          high: multiResult.selected_agents.filter(a => a.confidence >= 0.75 && a.confidence < 0.85),
          medium: multiResult.selected_agents.filter(a => a.confidence >= 0.60 && a.confidence < 0.75),
          low: multiResult.selected_agents.filter(a => a.confidence < 0.60)
        };
        
        if (tiers.critical.length > 0) {
          console.log('   🔴 Critical Confidence (≥85%):');
          tiers.critical.forEach(a => {
            const bar = '█'.repeat(Math.floor(a.confidence * 10)).padEnd(10, '░');
            console.log(`      ${a.agent_code}: ${bar} ${Math.round(a.confidence * 100)}%`);
          });
        }
        
        if (tiers.high.length > 0) {
          console.log('   🟠 High Confidence (≥75%):');
          tiers.high.forEach(a => {
            const bar = '█'.repeat(Math.floor(a.confidence * 10)).padEnd(10, '░');
            console.log(`      ${a.agent_code}: ${bar} ${Math.round(a.confidence * 100)}%`);
          });
        }
        
        if (tiers.medium.length > 0) {
          console.log('   🟡 Medium Confidence (≥60%):');
          tiers.medium.forEach(a => {
            const bar = '█'.repeat(Math.floor(a.confidence * 10)).padEnd(10, '░');
            console.log(`      ${a.agent_code}: ${bar} ${Math.round(a.confidence * 100)}%`);
          });
        }
        
        if (tiers.low.length > 0) {
          console.log('   ⚪ Low Confidence (<60%):');
          tiers.low.forEach(a => {
            const bar = '█'.repeat(Math.floor(a.confidence * 10)).padEnd(10, '░');
            console.log(`      ${a.agent_code}: ${bar} ${Math.round(a.confidence * 100)}%`);
          });
        }
        
        // Show task pattern and strategy
        console.log(`\n   📋 Task Pattern: ${multiResult.task_pattern || 'general'}`);
        console.log(`   🎯 Execution Strategy: ${multiResult.execution_strategy || 'parallel'}`);
        
        // Show synergy groups
        if (multiResult.synergy_groups && multiResult.synergy_groups.length > 0) {
          console.log('   🔗 Synergy Groups Detected:');
          multiResult.synergy_groups.forEach((group, idx) => {
            console.log(`      Group ${idx + 1}: ${group.agents.join(' + ')} (${Math.round(group.completeness * 100)}% complete)`);
            if (group.missing.length > 0) {
              console.log(`         Missing: ${group.missing.join(', ')}`);
            }
          });
        }
        
        // Check coverage
        const selectedCodes = multiResult.selected_agents.map(a => a.agent_code);
        const expectedCoverage = scenario.expectedAgents.filter(e => selectedCodes.includes(e));
        const coverage = expectedCoverage.length / scenario.expectedAgents.length;
        
        console.log(`\n   📈 Coverage: ${Math.round(coverage * 100)}% (${expectedCoverage.length}/${scenario.expectedAgents.length} expected agents)`);
        
      } else {
        console.log('   ⚠️ No agents selected');
      }
      
      // Compare with legacy selector (limited to top 2-3)
      console.log('\n🔍 Using Legacy Auto-Selector (max 2 agents):');
      
      // Temporarily set to use legacy mode
      autoSelector.config.use_multi_selector = false;
      autoSelector.config.max_auto_agents = 2; // Original limitation
      
      const legacyResult = await autoSelector.processUserInput(scenario.prompt);
      
      if (legacyResult.auto_triggered) {
        console.log(`   ⚠️ Limited to ${legacyResult.auto_triggered} agents (old system)`);
        console.log(`   Note: Would miss ${scenario.expectedAgents.length - legacyResult.auto_triggered} potentially needed agents`);
      }
      
    } catch (_error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  // Test configuration options
  console.log(`\n\n${'═'.repeat(80)}`);
  console.log('⚙️ CONFIGURATION OPTIONS TEST');
  console.log('═'.repeat(80));
  
  const configs = [
    {
      name: 'Intelligent Mode (Default)',
      config: { selection_mode: 'intelligent', max_agents: null }
    },
    {
      name: 'Threshold Mode (All ≥60%)',
      config: { selection_mode: 'threshold', medium_threshold: 0.60 }
    },
    {
      name: 'Legacy Top-N Mode (Max 3)',
      config: { selection_mode: 'top_n', max_agents: 3 }
    },
    {
      name: 'Select All Mode',
      config: { selection_mode: 'all' }
    }
  ];
  
  const testPrompt = 'Fix authentication issues and optimize database performance';
  
  for (const configTest of configs) {
    console.log(`\n📝 ${configTest.name}:`);
    
    // Update configuration
    multiSelector.updateConfig(configTest.config);
    
    const result = await multiSelector.selectAgents(testPrompt);
    console.log(`   Selected ${result.total_agents || 0} agents`);
    
    if (result.selected_agents) {
      const agentList = result.selected_agents.map(a => a.agent_code).join(', ');
      console.log(`   Agents: ${agentList || 'none'}`);
    }
  }
  
  // Show statistics
  console.log(`\n\n${'═'.repeat(80)}`);
  console.log('📊 STATISTICS');
  console.log('═'.repeat(80));
  
  const stats = multiSelector.getStatistics();
  console.log('\n📈 Selection Statistics:');
  console.log(`   Total Selections: ${stats.total_selections}`);
  console.log(`   Average Agents Selected: ${stats.avg_agents_selected.toFixed(1)}`);
  
  if (stats.most_common_agents.length > 0) {
    console.log('\n🏆 Most Common Agents:');
    stats.most_common_agents.forEach((agent, idx) => {
      console.log(`   ${idx + 1}. ${agent.code}: ${agent.count} times (${Math.round(agent.percentage * 100)}%)`);
    });
  }
  
  if (stats.synergy_utilization) {
    console.log('\n🔗 Synergy Utilization:');
    console.log(`   ${Math.round(stats.synergy_utilization.percentage * 100)}% of potential synergies utilized`);
  }
  
  console.log(`\n${'═'.repeat(80)}`);
  console.log('✅ Multi-Agent Selection Test Complete');
  console.log('═'.repeat(80) + '\n');
}

// Run the test
testMultiAgentSelection().catch(console.error);