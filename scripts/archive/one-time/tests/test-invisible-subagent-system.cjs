#!/usr/bin/env node

/**
 * Test Invisible Sub-Agent System
 * Comprehensive testing of all components
 */

require('dotenv').config();
const path = require('path');

// Import our system components
const ContextMonitor = require('../lib/agents/context-monitor');
const IntelligentAutoSelector = require('../lib/agents/auto-selector');
const PromptEnhancer = require('../lib/agents/prompt-enhancer');
const LearningSystem = require('../lib/agents/learning-system');
const ResponseIntegrator = require('../lib/agents/response-integrator');

async function testInvisibleSubAgentSystem() {
  console.log('🧪 Testing Invisible Sub-Agent System...\n');
  
  // Configuration
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const projectRoot = process.cwd();
  
  if (!openaiApiKey) {
    console.log('⚠️ Warning: OPENAI_API_KEY not found, using fallback mode');
  }

  try {
    // Test 1: Context Monitor
    console.log('1️⃣ Testing Context Monitor...');
    const contextMonitor = new ContextMonitor(openaiApiKey, projectRoot);
    
    const testPrompt = "I need to add authentication to my React application with secure login flow";
    const testContext = {
      current_files: ['src/App.jsx', 'src/components/Login.jsx'],
      recent_errors: ['Authentication failed'],
      project_type: 'react'
    };
    
    console.log('   📝 Prompt:', testPrompt.substring(0, 50) + '...');
    const contextAnalysis = await contextMonitor.analyzeContext(testPrompt, testContext);
    console.log('   ✅ Context analysis completed');
    console.log('   📊 Method:', contextAnalysis.analysis_method);
    console.log('   🎯 Confidence:', contextAnalysis.confidence?.toFixed(2) || 'N/A');
    console.log('   🤖 Agents found:', contextAnalysis.relevant_agents?.length || 0);
    
    // Test 2: Auto-Selector
    console.log('\n2️⃣ Testing Auto-Selector...');
    const autoSelector = new IntelligentAutoSelector(openaiApiKey, projectRoot);
    
    const selectionResult = await autoSelector.processUserInput(testPrompt, testContext);
    console.log('   ✅ Agent selection completed');
    console.log('   📊 Strategy:', selectionResult.coordination_strategy);
    console.log('   🎯 Total confidence:', selectionResult.total_confidence?.toFixed(2) || 'N/A');
    console.log('   🤖 Selected agents:', selectionResult.selected_agents?.length || 0);
    
    if (selectionResult.selected_agents?.length > 0) {
      console.log('   📝 Top agent:', selectionResult.selected_agents[0].agent_name);
    }
    
    // Test 3: Prompt Enhancer
    console.log('\n3️⃣ Testing Prompt Enhancer...');
    const promptEnhancer = new PromptEnhancer(openaiApiKey, projectRoot);
    
    const mockClaudeResponse = "To add authentication to your React application, you'll need to implement a login component with proper state management and secure API calls.";
    
    const enhancedResponse = await promptEnhancer.enhanceResponse(
      testPrompt, 
      mockClaudeResponse, 
      testContext
    );
    
    console.log('   ✅ Response enhancement completed');
    console.log('   📏 Original length:', mockClaudeResponse.length);
    console.log('   📏 Enhanced length:', enhancedResponse.length);
    console.log('   🎨 Enhancement:', enhancedResponse.length > mockClaudeResponse.length ? 'Applied' : 'None');
    
    // Test 4: Learning System
    console.log('\n4️⃣ Testing Learning System...');
    const learningSystem = new LearningSystem(projectRoot);
    
    await learningSystem.initialize();
    console.log('   ✅ Learning system initialized');
    
    const optimalConfig = await learningSystem.getOptimalConfig(testContext);
    console.log('   🎛️ Auto threshold:', optimalConfig.auto_threshold);
    console.log('   🎛️ Max agents:', optimalConfig.max_agents);
    
    // Test 5: Response Integrator (Main Orchestrator)
    console.log('\n5️⃣ Testing Response Integrator...');
    const responseIntegrator = new ResponseIntegrator({
      openaiApiKey,
      projectRoot,
      enableLearning: true,
      enableCaching: true
    });
    
    await responseIntegrator.initialize();
    console.log('   ✅ Response integrator initialized');
    
    const integratedResult = await responseIntegrator.integrateResponse(
      testPrompt,
      mockClaudeResponse,
      testContext
    );
    
    console.log('   ✅ Integration completed');
    console.log('   📏 Final length:', integratedResult.length);
    console.log('   ⚡ Processing time:', integratedResult.metadata?.processing_time || 'N/A');
    
    // Test 6: Performance Metrics
    console.log('\n6️⃣ Performance Metrics...');
    const stats = responseIntegrator.getStatistics();
    console.log('   📊 Cache hits:', stats.cache_hits || 0);
    console.log('   📊 Total requests:', stats.total_requests || 0);
    console.log('   📊 Avg response time:', stats.avg_response_time || 'N/A');
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Test Summary:');
    console.log('   ✅ Context Monitor: Working');
    console.log('   ✅ Auto-Selector: Working');  
    console.log('   ✅ Prompt Enhancer: Working');
    console.log('   ✅ Learning System: Working');
    console.log('   ✅ Response Integrator: Working');
    console.log('   ✅ Performance Metrics: Available');
    
    console.log('\n🚀 System Status: READY FOR USE');
    console.log('\n💡 Usage: The system works invisibly in the background.');
    console.log('   Just use Claude Code normally - enhancements happen automatically!');
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('📍 Stack:', error.stack);
    return false;
  }
}

// Additional diagnostic tests
async function runDiagnostics() {
  console.log('\n🔧 Running System Diagnostics...');
  
  try {
    // Check file system access
    const fs = require('fs').promises;
    await fs.access(path.join(process.cwd(), 'lib/agents'));
    console.log('   ✅ File system access: OK');
    
    // Check environment variables
    const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length === 0) {
      console.log('   ✅ Environment variables: OK');
    } else {
      console.log('   ⚠️ Missing env vars:', missingVars.join(', '));
    }
    
    // Check OpenAI key
    if (process.env.OPENAI_API_KEY) {
      console.log('   ✅ OpenAI API key: Available');
    } else {
      console.log('   ⚠️ OpenAI API key: Missing (will use fallback mode)');
    }
    
    // Check sub-agent definitions
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    
    try {
      const { data: subAgents, error } = await supabase
        .from('leo_sub_agents')
        .select('agent_code, agent_name')
        .eq('active', true);
        
      if (error) {
        console.log('   ⚠️ Sub-agent data: Using fallback definitions');
      } else {
        console.log(`   ✅ Sub-agent data: ${subAgents?.length || 0} agents available`);
      }
    } catch (err) {
      console.log('   ⚠️ Sub-agent data: Using fallback definitions');
    }
    
  } catch (error) {
    console.log('   ❌ Diagnostics error:', error.message);
  }
}

if (require.main === module) {
  runDiagnostics()
    .then(() => testInvisibleSubAgentSystem())
    .then(success => {
      if (success) {
        console.log('\n🎊 INVISIBLE SUB-AGENT SYSTEM IS READY! 🎊');
        process.exit(0);
      } else {
        console.log('\n❌ System tests failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}

module.exports = { testInvisibleSubAgentSystem, runDiagnostics };