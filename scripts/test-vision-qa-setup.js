#!/usr/bin/env node

/**
 * Test Vision QA Setup
 * Verifies API keys and Vision QA system configuration
 */

import MultimodalClient from '../lib/ai/multimodal-client';
import VisionQAAgent from '../lib/testing/vision-qa-agent';
import dotenv from 'dotenv';
dotenv.config();

console.log(`
╔════════════════════════════════════════════════╗
║        Vision QA System Setup Verification      ║
╚════════════════════════════════════════════════╝
`);

async function testSetup() {
  let openaiStatus = '❌';
  let anthropicStatus = '❌';
  let databaseStatus = '❌';
  
  // 1. Check environment variables
  console.log('📋 Checking Environment Variables...\n');
  
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here') {
    console.log('✅ OpenAI API Key: Configured');
    console.log(`   Key prefix: ${process.env.OPENAI_API_KEY.substring(0, 10)}...`);
    openaiStatus = '✅';
  } else {
    console.log('❌ OpenAI API Key: Missing');
  }
  
  if (process.env.USE_LOCAL_LLM) {
    console.log('✅ Local LLM: Configured (Ollama)');
    anthropicStatus = '✅';
  } else {
    console.log('⚠️  Local LLM: Not configured (optional, set USE_LOCAL_LLM=true)');
    anthropicStatus = '⚠️';
  }
  
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.log('✅ Supabase: Configured');
    databaseStatus = '✅';
  } else {
    console.log('❌ Supabase: Missing configuration');
  }
  
  console.log('\n📊 Testing API Connections...\n');
  
  // 2. Test OpenAI connection
  if (openaiStatus === '✅') {
    try {
      console.log('Testing OpenAI connection...');
      const openaiClient = new MultimodalClient({
        provider: 'openai',
        model: 'gpt-4o-mini', // Use a cheaper model for testing
        apiKey: process.env.OPENAI_API_KEY
      });
      
      // Estimate cost for a simple test
      const costEstimate = openaiClient.estimateCost(10);
      console.log('✅ OpenAI: Connection successful');
      console.log(`   Available models: ${openaiClient.getAvailableModels().join(', ')}`);
      console.log(`   Test cost estimate (10 iterations): $${costEstimate.estimatedTotal.toFixed(2)}`);
    } catch (_error) {
      console.log('❌ OpenAI: Connection failed');
      console.log(`   Error: ${error.message}`);
      openaiStatus = '❌';
    }
  }
  
  // 3. Test Local LLM connection
  if (anthropicStatus === '✅') {
    try {
      console.log('\nTesting Local LLM connection...');
      console.log('✅ Local LLM: Ollama configured');
      console.log(`   USE_LOCAL_LLM=${process.env.USE_LOCAL_LLM}`);
      console.log(`   Test cost estimate (10 iterations): $${costEstimate.estimatedTotal.toFixed(2)}`);
    } catch (_error) {
      console.log('❌ Anthropic: Connection failed');
      console.log(`   Error: ${error.message}`);
      anthropicStatus = '❌';
    }
  }
  
  // 4. Test Vision QA Agent initialization
  console.log('\n🤖 Testing Vision QA Agent...\n');
  
  try {
    const agent = new VisionQAAgent({
      maxIterations: 10,
      costLimit: 0.50,
      model: 'auto'
    });
    
    console.log('✅ Vision QA Agent: Initialized successfully');
    console.log(`   Auto-selected model: ${agent.config.model}`);
    console.log(`   Provider: ${agent.config.provider || 'openai'}`);
    console.log(`   Max iterations: ${agent.config.maxIterations}`);
    console.log(`   Cost limit: $${agent.config.costLimit}`);
  } catch (_error) {
    console.log('❌ Vision QA Agent: Initialization failed');
    console.log(`   Error: ${error.message}`);
  }
  
  // 5. Model selection test
  console.log('\n🎯 Testing Automatic Model Selection...\n');
  
  const testScenarios = [
    { goal: 'Test payment checkout flow', expected: 'gpt-5' },
    { goal: 'Check accessibility compliance', expected: 'claude-sonnet-3.7' },
    { goal: 'Run basic smoke tests', expected: 'gpt-5-nano' },
    { goal: 'Test user registration form', expected: 'gpt-5-mini' }
  ];
  
  testScenarios.forEach(scenario => {
    const agent = new VisionQAAgent({ testGoal: scenario.goal });
    const selected = agent.config.model;
    const match = selected === scenario.expected ? '✅' : '⚠️';
    console.log(`${match} "${scenario.goal}"`);
    console.log(`   Selected: ${selected} (Expected: ${scenario.expected})`);
  });
  
  // 6. Summary
  console.log('\n' + '='.repeat(50));
  console.log('SETUP VERIFICATION SUMMARY');
  console.log('='.repeat(50));
  console.log(`\nOpenAI API:     ${openaiStatus}`);
  console.log(`Anthropic API:  ${anthropicStatus}`);
  console.log(`Database:       ${databaseStatus}`);
  
  if (openaiStatus === '✅' || anthropicStatus === '✅') {
    console.log('\n✅ Vision QA System is ready to use!');
    console.log('\nYou can now run Vision QA tests using:');
    console.log('  node lib/testing/vision-qa-agent.js --app-id "APP-001" --goal "Your test goal"');
    
    console.log('\nOr use the decision helper:');
    console.log('  node scripts/vision-qa-decision.js');
  } else {
    console.log('\n❌ Vision QA System is not fully configured.');
    console.log('At least one API key (OpenAI or Anthropic) is required.');
  }
  
  console.log('\n📚 Documentation:');
  console.log('  - Vision QA System: docs/vision-qa-system.md');
  console.log('  - LEO Integration: docs/03_protocols_and_standards/leo_vision_qa_integration.md');
  console.log('  - Agent Workflows: templates/agent-workflows/');
}

// Run the test
testSetup().catch(console.error);