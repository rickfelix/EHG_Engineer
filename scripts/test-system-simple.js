#!/usr/bin/env node

/**
 * Simple Test for Invisible Sub-Agent System
 * Tests core functionality with error handling
 */

import 'dotenv/config';

async function testSystemBasics() {
  console.log('🧪 Testing Invisible Sub-Agent System (Simple Mode)...\n');

  try {
    // Test 1: Basic imports and instantiation
    console.log('1️⃣ Testing imports...');
    
    const ContextMonitor = (await import('../lib/agents/context-monitor.js')).default;
    const IntelligentAutoSelector = (await import('../lib/agents/auto-selector.js')).default;
    const PromptEnhancer = (await import('../lib/agents/prompt-enhancer.js')).default;
    
    console.log('   ✅ All modules imported successfully');
    
    // Test 2: Basic instantiation without OpenAI (fallback mode)
    console.log('\n2️⃣ Testing instantiation...');
    
    const contextMonitor = new ContextMonitor(null, process.cwd()); // No OpenAI key
    const autoSelector = new IntelligentAutoSelector(null, process.cwd());
    const promptEnhancer = new PromptEnhancer(null, process.cwd());
    
    console.log('   ✅ All components instantiated successfully');
    
    // Test 3: Rule-based analysis (no AI)
    console.log('\n3️⃣ Testing rule-based analysis...');
    
    const testPrompt = 'I need to add authentication to my React application';
    const testContext = {
      current_files: ['src/Login.jsx'],
      recent_errors: [],
      project_type: 'react'
    };
    
    // Force rule-based analysis by not providing OpenAI
    const contextResult = await contextMonitor.analyzeWithRules(testPrompt, testContext);
    
    console.log('   ✅ Rule-based analysis completed');
    console.log('   🎯 Relevant agents:', contextResult.relevant_agents?.length || 0);
    console.log('   📊 Analysis method:', contextResult.analysis_method);
    
    if (contextResult.relevant_agents?.length > 0) {
      console.log('   🤖 Top agent:', contextResult.relevant_agents[0].agent_name);
      console.log('   💯 Confidence:', contextResult.relevant_agents[0].confidence);
    }
    
    // Test 4: Auto-selector with rule-based mode
    console.log('\n4️⃣ Testing auto-selector...');
    
    const selectionResult = await autoSelector.processUserInput(testPrompt, testContext);
    
    console.log('   ✅ Auto-selection completed');
    console.log('   🤖 Selected agents:', selectionResult.selected_agents?.length || 0);
    console.log('   📋 Strategy:', selectionResult.coordination_strategy || 'fallback');
    
    // Test 5: Enhancement (should work even without AI)
    console.log('\n5️⃣ Testing response enhancement...');
    
    const mockResponse = "To add authentication, you'll need to create a login component.";
    const enhanced = await promptEnhancer.enhanceResponse(testPrompt, mockResponse, testContext);
    
    console.log('   ✅ Enhancement completed');
    console.log('   📏 Original:', mockResponse.length, 'chars');
    console.log('   📏 Enhanced:', enhanced.length, 'chars');
    
    // Test 6: Configuration
    console.log('\n6️⃣ Testing configuration...');
    
    console.log('   📋 Context Monitor Config:');
    console.log('     - Enabled:', contextMonitor.config.enabled);
    console.log('     - Confidence threshold:', contextMonitor.config.confidence_threshold);
    console.log('     - Max agents:', contextMonitor.config.max_agents);
    
    console.log('   📋 Auto-Selector Config:');
    console.log('     - Auto threshold:', autoSelector.config.auto_threshold);
    console.log('     - Prompt threshold:', autoSelector.config.prompt_threshold);
    
    console.log('\n🎉 All basic tests passed!');
    console.log('\n📋 System Status:');
    console.log('   ✅ Context Monitor: Working (rule-based)');
    console.log('   ✅ Auto-Selector: Working (rule-based)');
    console.log('   ✅ Prompt Enhancer: Working');
    console.log('   ⚠️ AI Features: Disabled (no OpenAI key or fallback mode)');
    
    console.log('\n💡 Next Steps:');
    console.log('   • Add OPENAI_API_KEY to enable AI-powered analysis');
    console.log('   • Create learning tables in Supabase for full functionality');
    console.log('   • System is ready for basic rule-based operation!');
    
    return true;
    
  } catch (_error) {
    console.error('❌ Test failed:', error.message);
    console.error('📍 At:', error.stack?.split('\n')[1]);
    return false;
  }
}

// Simple diagnostics
async function simpleDiagnostics() {
  console.log('🔧 Simple Diagnostics...\n');
  
  // Check basic environment
  console.log('📋 Environment Check:');
  console.log('   🗂️ Working directory:', process.cwd());
  console.log('   📦 Node version:', process.version);
  
  // Check key files exist
  try {
    const fs = await import('fs/promises');
    const libPath = './lib/agents';
    await fs.access(libPath);
    console.log('   📁 Agent files: Found');
    
    const files = await fs.readdir(libPath);
    const agentFiles = files.filter(f => f.endsWith('.js'));
    console.log('   🤖 Agent modules:', agentFiles.length);
    
  } catch (_err) {
    console.log('   ❌ Agent files: Missing');
  }
  
  // Check environment variables
  console.log('   🔑 Environment variables:');
  console.log('     - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Present' : '❌ Missing');
  console.log('     - SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Present' : '❌ Missing');
  console.log('     - SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ Present' : '❌ Missing');
  
  console.log();
}

// Run tests
simpleDiagnostics()
  .then(() => testSystemBasics())
  .then(success => {
    if (success) {
      console.log('\n🎊 BASIC SYSTEM TESTS PASSED! 🎊');
      console.log('System is ready for basic operation.');
    } else {
      console.log('\n❌ Basic tests failed');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });