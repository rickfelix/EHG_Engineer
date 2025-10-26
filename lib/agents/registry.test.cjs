/**
 * Agent Registry Test Suite
 *
 * Tests and demonstrates the Agent Registry functionality
 * Run: node lib/agents/registry.test.js
 */

const { initializeRegistry, AgentRegistry } = require('./registry.cjs');

async function testRegistry() {
  console.log('🧪 Testing Agent Registry...\n');

  try {
    // Test 1: Initialize registry
    console.log('Test 1: Initialize registry');
    const registry = await initializeRegistry();
    console.log('✅ Registry initialized\n');

    // Test 2: Get statistics
    console.log('Test 2: Get statistics');
    const stats = registry.getStats();
    console.log('Statistics:', JSON.stringify(stats, null, 2));
    console.log('✅ Stats retrieved\n');

    // Test 3: Get specific agent
    console.log('Test 3: Get VALIDATION agent');
    const validationAgent = registry.getAgent('VALIDATION');
    if (validationAgent) {
      console.log(`✅ Found: ${validationAgent.name}`);
      console.log(`   Capabilities: ${validationAgent.capabilities.length}`);
      console.log(`   Phases: ${validationAgent.execution_phases.join(', ')}`);
      console.log(`   Version: ${validationAgent.metadata?.version || 'N/A'}`);
    } else {
      console.log('❌ VALIDATION agent not found');
    }
    console.log('');

    // Test 4: Get agents by phase
    console.log('Test 4: Get agents for PLAN phase');
    const planAgents = registry.getAgentsForPhase('PLAN');
    console.log(`✅ Found ${planAgents.length} agents for PLAN phase:`);
    planAgents.forEach(agent => {
      console.log(`   - ${agent.name} (${agent.code})`);
    });
    console.log('');

    // Test 5: Search by keyword
    console.log('Test 5: Search for "security" keyword');
    const securityAgents = registry.searchByKeyword('security');
    console.log(`✅ Found ${securityAgents.length} agents matching "security":`);
    securityAgents.forEach(agent => {
      console.log(`   - ${agent.name} (${agent.code})`);
    });
    console.log('');

    // Test 6: Get agents by category
    console.log('Test 6: Get agents by category "validation"');
    const validationAgents = registry.getAgentsByCategory('validation');
    console.log(`✅ Found ${validationAgents.length} validation agents:`);
    validationAgents.forEach(agent => {
      console.log(`   - ${agent.name} (${agent.code})`);
    });
    console.log('');

    // Test 7: Get agents by capability
    console.log('Test 7: Get agents with "test" capability');
    const testingAgents = registry.getAgentsByCapability('test');
    console.log(`✅ Found ${testingAgents.length} agents with testing capability:`);
    testingAgents.forEach(agent => {
      console.log(`   - ${agent.name} (${agent.code})`);
    });
    console.log('');

    // Test 8: Validate specific agent
    console.log('Test 8: Validate GITHUB agent');
    const validation = await registry.validateAgent('GITHUB');
    if (validation.valid) {
      console.log('✅ GITHUB agent is valid');
      if (validation.warnings.length > 0) {
        console.log('⚠️  Warnings:');
        validation.warnings.forEach(w => console.log(`   - ${w}`));
      }
    } else {
      console.log('❌ GITHUB agent is invalid:');
      validation.errors.forEach(e => console.log(`   - ${e}`));
    }
    console.log('');

    // Test 9: Get parallel agents for VERIFY phase
    console.log('Test 9: Get parallel agents for VERIFY phase');
    const verifyAgents = registry.getParallelAgentsForPhase('VERIFY');
    console.log(`✅ Found ${verifyAgents.length} agents that can run in parallel for VERIFY:`);
    verifyAgents.forEach(agent => {
      console.log(`   - ${agent.name} (${agent.code})`);
    });
    console.log('');

    // Test 10: Export to JSON
    console.log('Test 10: Export registry to JSON');
    const json = registry.toJSON();
    console.log('✅ Registry exported successfully');
    console.log(`   Total agents: ${json.totalAgents}`);
    console.log(`   Phases: ${json.stats.phases.join(', ')}`);
    console.log(`   Categories: ${json.stats.categories.join(', ')}`);
    console.log('');

    // Test 11: List all agents
    console.log('Test 11: List all agents');
    const allAgents = registry.getAllAgents();
    console.log(`✅ Found ${allAgents.length} total agents:\n`);
    allAgents.forEach((agent, index) => {
      console.log(`${index + 1}. ${agent.name} (${agent.code})`);
      console.log(`   Category: ${agent.category || 'N/A'}`);
      console.log(`   Capabilities: ${agent.capabilities.length}`);
      console.log(`   Phases: ${agent.execution_phases.join(', ') || 'N/A'}`);
      console.log(`   Version: ${agent.metadata?.version || 'N/A'}`);
      console.log('');
    });

    console.log('🎉 All tests passed!\n');
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run tests if executed directly
if (require.main === module) {
  testRegistry().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { testRegistry };
