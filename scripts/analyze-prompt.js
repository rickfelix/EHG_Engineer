#!/usr/bin/env node

/**
 * Analyze Prompt with Sub-Agent System
 * Directly analyzes prompts and shows which sub-agents would be activated
 * Can be run before submitting to Claude Code to understand context
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import sub-agent system components
import ContextMonitor from '../lib/agents/context-monitor.js';
import IntelligentAutoSelector from '../lib/agents/auto-selector.js';

async function analyzePrompt(prompt) {
  console.log('\n' + '═'.repeat(60));
  console.log('🔍 SUB-AGENT ANALYSIS');
  console.log('═'.repeat(60));
  console.log('\n📝 Prompt:', prompt);
  console.log('\n⏳ Analyzing...\n');

  try {
    // Initialize components
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const contextMonitor = new ContextMonitor(openaiApiKey, process.cwd());
    const autoSelector = new IntelligentAutoSelector(openaiApiKey, process.cwd());
    
    // Get current context
    const context = {
      project_type: 'nodejs',
      current_files: [],
      timestamp: new Date().toISOString()
    };
    
    // Try to get current git branch
    try {
      const { execSync } = await import('child_process');
      const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
      context.git_branch = branch;
    } catch (e) {}
    
    // Analyze with context monitor
    const contextAnalysis = await contextMonitor.analyzeContext(prompt, context);
    
    // Get sub-agent selection
    const selection = await autoSelector.processUserInput(prompt, context);
    
    // Display results
    if (selection.selected_agents && selection.selected_agents.length > 0) {
      console.log('✅ **Sub-Agents Selected:**\n');
      
      selection.selected_agents.forEach((agent, index) => {
        const confidence = Math.round(agent.confidence * 100);
        const bar = '█'.repeat(Math.floor(confidence / 10)).padEnd(10, '░');
        
        console.log(`${index + 1}. ${agent.agent_name}`);
        console.log(`   Confidence: ${bar} ${confidence}%`);
        console.log(`   Priority: ${agent.priority || 'Normal'}`);
        
        if (agent.reasoning) {
          console.log(`   Reasoning: ${agent.reasoning}`);
        }
        
        if (agent.insights && agent.insights.length > 0) {
          console.log(`   Key Insights:`);
          agent.insights.slice(0, 3).forEach(insight => {
            console.log(`   • ${insight}`);
          });
        }
        console.log();
      });
      
      // Show coordination strategy
      if (selection.coordination_strategy) {
        console.log(`📋 **Coordination Strategy**: ${selection.coordination_strategy}`);
      }
      
      // Show what would be added to response
      console.log('\n💡 **Enhancement Preview**:');
      console.log('The following insights would be added to Claude\'s response:\n');
      
      selection.selected_agents.forEach(agent => {
        if (agent.agent_name.includes('Design') || agent.agent_name.includes('UI')) {
          console.log(`*${agent.agent_name}: Check dark mode CSS classes, verify Tailwind config, test theme toggle state persistence*`);
        } else if (agent.agent_name.includes('Testing')) {
          console.log(`*${agent.agent_name}: Test in different browsers, check localStorage for theme preference, verify class application on root element*`);
        } else {
          console.log(`*${agent.agent_name} insights would appear here*`);
        }
      });
      
    } else {
      console.log('ℹ️ No sub-agents selected for this prompt\n');
      console.log('This could mean:');
      console.log('• The prompt is too general');
      console.log('• No specific technical patterns were detected');
      console.log('• Confidence thresholds weren\'t met');
    }
    
    // Save analysis to file for reference
    const analysisPath = path.join(__dirname, '../.last-analysis.json');
    await fs.writeFile(analysisPath, JSON.stringify({
      prompt,
      context,
      selection,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    console.log('\n📄 Full analysis saved to: .last-analysis.json');
    
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    
    // Fallback to rule-based analysis
    console.log('\n🔄 Attempting rule-based analysis...\n');
    
    // Simple keyword matching
    const keywords = {
      'dark mode': ['Design', 'UI/UX', 'Testing'],
      'toggle': ['UI/UX', 'Testing'],
      'css': ['Design', 'Performance'],
      'tailwind': ['Design', 'UI/UX'],
      'database': ['Database', 'Performance'],
      'api': ['API', 'Security'],
      'auth': ['Security', 'Database'],
      'test': ['Testing', 'Performance'],
      'bug': ['Debug', 'Testing'],
      'slow': ['Performance', 'Database'],
      'error': ['Debug', 'Testing']
    };
    
    const promptLower = prompt.toLowerCase();
    const matchedAgents = new Set();
    
    Object.entries(keywords).forEach(([keyword, agents]) => {
      if (promptLower.includes(keyword)) {
        agents.forEach(agent => matchedAgents.add(agent));
      }
    });
    
    if (matchedAgents.size > 0) {
      console.log('✅ **Sub-Agents Selected (Rule-Based):**\n');
      Array.from(matchedAgents).forEach((agent, index) => {
        console.log(`${index + 1}. ${agent} Sub-Agent`);
      });
    } else {
      console.log('ℹ️ No patterns detected in prompt');
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('✨ Analysis Complete');
  console.log('═'.repeat(60) + '\n');
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: npm run analyze "Your prompt here"');
  console.log('Example: npm run analyze "Fix the dark mode toggle"');
  process.exit(1);
}

const prompt = args.join(' ');
analyzePrompt(prompt).catch(console.error);