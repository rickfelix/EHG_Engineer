#!/usr/bin/env node

/**
 * Direct test of sub-agent analysis
 * Tests the system components directly to diagnose issues
 */

import 'dotenv/config';
import OpenAI from 'openai';

async function testDirectAnalysis() {
  console.log('🧪 Testing Direct OpenAI Analysis...\n');
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  const prompt = "Fix the dark mode toggle in the dashboard that shows dark but displays light";
  
  const systemPrompt = `You are an AI assistant that analyzes user prompts and selects relevant sub-agents.
Available sub-agents:
- DESIGN: UI/UX, CSS, styling, themes, dark mode
- TESTING: Testing, debugging, quality assurance
- PERFORMANCE: Optimization, speed, caching
- SECURITY: Authentication, authorization, security
- DATABASE: Database, queries, schema
- API: REST, GraphQL, endpoints
- DEBUG: Error analysis, troubleshooting

Analyze the prompt and select relevant sub-agents with confidence scores.`;

  const userPrompt = `Analyze this prompt and select relevant sub-agents:
"${prompt}"

Consider:
- The prompt mentions "dark mode toggle" which is a UI/design issue
- It mentions "dashboard" which is a frontend component
- The issue is "shows dark but displays light" which indicates a CSS/styling problem`;

  try {
    console.log('📤 Sending to OpenAI...\n');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // Using 3.5 for faster response
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      functions: [{
        name: 'select_subagents',
        description: 'Select relevant sub-agents',
        parameters: {
          type: 'object',
          properties: {
            selected_agents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  agent_code: {
                    type: 'string',
                    enum: ['DESIGN', 'TESTING', 'PERFORMANCE', 'SECURITY', 'DATABASE', 'API', 'DEBUG']
                  },
                  confidence: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1
                  },
                  reasoning: {
                    type: 'string'
                  }
                }
              }
            }
          }
        }
      }],
      function_call: { name: 'select_subagents' },
      temperature: 0.3
    });
    
    console.log('📥 Response received:\n');
    
    if (response.choices[0].function_call) {
      const result = JSON.parse(response.choices[0].function_call.arguments);
      console.log('✅ Sub-agents selected:\n');
      console.log(JSON.stringify(result, null, 2));
    } else if (response.choices[0].message) {
      console.log('📝 Message response:', response.choices[0].message.content);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

// Alternative test without function calling
async function testSimpleAnalysis() {
  console.log('\n🧪 Testing Simple Analysis (no function calling)...\n');
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  const prompt = "Fix the dark mode toggle in the dashboard that shows dark but displays light";
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{
        role: 'user',
        content: `Which sub-agents would be relevant for this task: "${prompt}"
        
Available sub-agents: DESIGN (UI/CSS), TESTING, DEBUG, PERFORMANCE
        
Reply with a JSON array of agent codes and confidence scores.`
      }],
      temperature: 0.3
    });
    
    console.log('📝 Response:', response.choices[0].message.content);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Rule-based fallback
function testRuleBasedAnalysis() {
  console.log('\n🧪 Testing Rule-Based Analysis...\n');
  
  const prompt = "Fix the dark mode toggle in the dashboard that shows dark but displays light";
  const promptLower = prompt.toLowerCase();
  
  const rules = {
    'dark mode': ['DESIGN', 'TESTING'],
    'toggle': ['DESIGN', 'DEBUG'],
    'dashboard': ['DESIGN', 'PERFORMANCE'],
    'css': ['DESIGN'],
    'shows.*displays': ['DEBUG', 'TESTING'],
    'fix': ['DEBUG']
  };
  
  const selected = new Set();
  
  for (const [pattern, agents] of Object.entries(rules)) {
    if (new RegExp(pattern).test(promptLower)) {
      agents.forEach(agent => selected.add(agent));
      console.log(`✓ Pattern "${pattern}" matched → ${agents.join(', ')}`);
    }
  }
  
  console.log('\n✅ Selected agents:', Array.from(selected));
  
  const result = Array.from(selected).map(agent => ({
    agent_code: agent,
    confidence: 0.8,
    reasoning: 'Pattern matching'
  }));
  
  console.log('\n📊 Final result:');
  console.log(JSON.stringify({ selected_agents: result }, null, 2));
}

// Run all tests
async function runAllTests() {
  console.log('═'.repeat(60));
  console.log('SUB-AGENT SYSTEM DIAGNOSTIC');
  console.log('═'.repeat(60) + '\n');
  
  if (process.env.OPENAI_API_KEY) {
    await testDirectAnalysis();
    await testSimpleAnalysis();
  } else {
    console.log('⚠️ No OpenAI API key, skipping AI tests\n');
  }
  
  testRuleBasedAnalysis();
  
  console.log('\n' + '═'.repeat(60));
  console.log('Diagnostic complete');
  console.log('═'.repeat(60));
}

runAllTests().catch(console.error);