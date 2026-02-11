#!/usr/bin/env node

/**
 * Vision Model Selector
 * Helps users choose the right model for their QA testing needs
 */

import MultimodalClient from '../lib/ai/multimodal-client';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Model profiles with characteristics
const modelProfiles = {
  'gpt-5': {
    provider: 'openai',
    name: 'GPT-5 Flagship',
    strengths: ['Highest accuracy', 'Complex reasoning', 'Latest capabilities'],
    weaknesses: ['Higher cost', 'Slower response time'],
    bestFor: 'Critical test paths, complex UI flows, final validation',
    costRating: '$$$$',
    speedRating: '⚡⚡',
    accuracyRating: '⭐⭐⭐⭐⭐'
  },
  'gpt-5-mini': {
    provider: 'openai',
    name: 'GPT-5 Mini',
    strengths: ['Good balance', 'Fast responses', 'Cost-effective'],
    weaknesses: ['Less capable on complex tasks'],
    bestFor: 'Regular testing, CI/CD pipelines, most use cases',
    costRating: '$',
    speedRating: '⚡⚡⚡⚡',
    accuracyRating: '⭐⭐⭐⭐'
  },
  'gpt-5-nano': {
    provider: 'openai',
    name: 'GPT-5 Nano',
    strengths: ['Lowest cost', 'Very fast', 'High volume testing'],
    weaknesses: ['Basic reasoning only', 'May miss subtle bugs'],
    bestFor: 'Smoke tests, basic validation, high-volume screening',
    costRating: '¢',
    speedRating: '⚡⚡⚡⚡⚡',
    accuracyRating: '⭐⭐⭐'
  },
  'gpt-4.1': {
    provider: 'openai',
    name: 'GPT-4.1',
    strengths: ['Proven reliability', 'Good vision capabilities', 'Stable'],
    weaknesses: ['Not latest features', 'Medium cost'],
    bestFor: 'Production testing, stable environments',
    costRating: '$$$',
    speedRating: '⚡⚡⚡',
    accuracyRating: '⭐⭐⭐⭐'
  },
  'gpt-4o': {
    provider: 'openai',
    name: 'GPT-4 Omni',
    strengths: ['Multimodal optimized', 'Good for complex UIs'],
    weaknesses: ['Higher cost'],
    bestFor: 'Rich media apps, complex visual testing',
    costRating: '$$$$',
    speedRating: '⚡⚡⚡',
    accuracyRating: '⭐⭐⭐⭐'
  },
  'gpt-4o-mini': {
    provider: 'openai',
    name: 'GPT-4 Omni Mini',
    strengths: ['Affordable', 'Decent accuracy', 'Fast'],
    weaknesses: ['Limited on complex tasks'],
    bestFor: 'Quick checks, development testing',
    costRating: '$',
    speedRating: '⚡⚡⚡⚡',
    accuracyRating: '⭐⭐⭐'
  },
  'claude-sonnet-4': {
    provider: 'anthropic',
    name: 'Claude Sonnet 4',
    strengths: ['Excellent reasoning', 'Good at edge cases', 'Detailed analysis'],
    weaknesses: ['Higher cost', 'Requires Anthropic API'],
    bestFor: 'Complex debugging, accessibility testing, detailed reports',
    costRating: '$$$$',
    speedRating: '⚡⚡',
    accuracyRating: '⭐⭐⭐⭐⭐'
  },
  'claude-sonnet-3.7': {
    provider: 'anthropic',
    name: 'Claude Sonnet 3.7',
    strengths: ['Balanced performance', 'Good reasoning', 'Reliable'],
    weaknesses: ['Medium cost'],
    bestFor: 'General testing, good alternative to GPT',
    costRating: '$$',
    speedRating: '⚡⚡⚡',
    accuracyRating: '⭐⭐⭐⭐'
  },
  'claude-opus-4': {
    provider: 'anthropic',
    name: 'Claude Opus 4',
    strengths: ['Best reasoning', 'Handles ambiguity well', 'Thorough'],
    weaknesses: ['Highest cost', 'Slower'],
    bestFor: 'Complex analysis, critical systems, regulatory compliance',
    costRating: '$$$$$',
    speedRating: '⚡',
    accuracyRating: '⭐⭐⭐⭐⭐'
  },
  'claude-haiku-3': {
    provider: 'anthropic',
    name: 'Claude Haiku 3',
    strengths: ['Very affordable', 'Fast', 'Good for simple tasks'],
    weaknesses: ['Basic capabilities only'],
    bestFor: 'Simple validation, high-volume testing',
    costRating: '¢',
    speedRating: '⚡⚡⚡⚡⚡',
    accuracyRating: '⭐⭐⭐'
  }
};

// Test scenarios to model mapping
const scenarioRecommendations = {
  'smoke-test': ['gpt-5-nano', 'claude-haiku-3', 'gpt-4o-mini'],
  'regression': ['gpt-5-mini', 'claude-sonnet-3.7', 'gpt-4.1'],
  'critical-path': ['gpt-5', 'claude-opus-4', 'claude-sonnet-4'],
  'accessibility': ['claude-sonnet-4', 'claude-sonnet-3.7', 'gpt-5'],
  'performance': ['gpt-5-mini', 'gpt-4o-mini', 'gpt-5-nano'],
  'visual-bugs': ['gpt-5', 'gpt-4o', 'claude-sonnet-4'],
  'ci-cd': ['gpt-5-mini', 'gpt-5-nano', 'claude-haiku-3'],
  'development': ['gpt-5-mini', 'gpt-4o-mini', 'claude-sonnet-3.7']
};

/**
 * Interactive model selector
 */
async function selectModel() {
  console.log(`
╔════════════════════════════════════════════════╗
║        Vision Model Selector for QA Testing     ║
╚════════════════════════════════════════════════╝

What type of testing are you planning?

1. Smoke Testing (basic validation)
2. Regression Testing (comprehensive)
3. Critical Path Testing (high stakes)
4. Accessibility Testing
5. Performance Testing
6. Visual Bug Detection
7. CI/CD Pipeline Testing
8. Development Testing
9. Custom Requirements
`);

  return new Promise((resolve) => {
    rl.question('Select option (1-9): ', (answer) => {
      const scenarios = [
        'smoke-test', 'regression', 'critical-path', 
        'accessibility', 'performance', 'visual-bugs',
        'ci-cd', 'development', 'custom'
      ];
      
      const selected = scenarios[parseInt(answer) - 1] || 'custom';
      
      if (selected === 'custom') {
        customSelector(resolve);
      } else {
        const recommendations = scenarioRecommendations[selected];
        showRecommendations(recommendations, selected, resolve);
      }
    });
  });
}

/**
 * Show model recommendations
 */
function showRecommendations(modelIds, scenario, resolve) {
  console.log(`\n📊 Recommendations for ${scenario.replace('-', ' ').toUpperCase()}:\n`);
  
  modelIds.forEach((modelId, index) => {
    const profile = modelProfiles[modelId];
    console.log(`${index + 1}. ${profile.name} (${modelId})`);
    console.log(`   Cost: ${profile.costRating} | Speed: ${profile.speedRating} | Accuracy: ${profile.accuracyRating}`);
    console.log(`   Best for: ${profile.bestFor}`);
    console.log('');
  });
  
  rl.question('\nSelect model (1-3) or "details" for more info: ', (answer) => {
    if (answer === 'details') {
      showDetailedComparison(modelIds, resolve);
    } else {
      const selected = modelIds[parseInt(answer) - 1];
      if (selected) {
        showConfiguration(selected, resolve);
      } else {
        resolve();
      }
    }
  });
}

/**
 * Custom requirements selector
 */
function customSelector(resolve) {
  console.log('\nAnswer these questions to find the best model:\n');
  
  const questions = [
    { 
      prompt: 'Budget priority (1=lowest cost, 5=best quality): ',
      key: 'budget'
    },
    {
      prompt: 'Speed requirement (1=slowest OK, 5=must be fast): ',
      key: 'speed'
    },
    {
      prompt: 'Complexity of UI (1=simple forms, 5=complex SPA): ',
      key: 'complexity'
    },
    {
      prompt: 'Bug detection importance (1=basic, 5=critical): ',
      key: 'accuracy'
    }
  ];
  
  const answers = {};
  let currentQuestion = 0;
  
  const askQuestion = () => {
    if (currentQuestion >= questions.length) {
      const recommended = calculateBestModel(answers);
      showRecommendations(recommended, 'custom requirements', resolve);
      return;
    }
    
    rl.question(questions[currentQuestion].prompt, (answer) => {
      answers[questions[currentQuestion].key] = parseInt(answer) || 3;
      currentQuestion++;
      askQuestion();
    });
  };
  
  askQuestion();
}

/**
 * Calculate best model based on requirements
 */
function calculateBestModel(requirements) {
  const scores = {};
  
  Object.entries(modelProfiles).forEach(([modelId, profile]) => {
    let score = 0;
    
    // Budget score (inverse - lower cost = higher score for low budget priority)
    const costScore = (6 - profile.costRating.length) * (6 - requirements.budget);
    score += costScore;
    
    // Speed score
    const speedScore = profile.speedRating.length * requirements.speed;
    score += speedScore;
    
    // Accuracy score (for complexity and bug detection)
    const accuracyScore = profile.accuracyRating.length * 
      ((requirements.complexity + requirements.accuracy) / 2);
    score += accuracyScore;
    
    scores[modelId] = score;
  });
  
  // Sort by score and return top 3
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([modelId]) => modelId);
}

/**
 * Show detailed comparison
 */
function showDetailedComparison(modelIds, resolve) {
  console.log('\n📋 DETAILED COMPARISON:\n');
  
  const client = new MultimodalClient();
  
  modelIds.forEach(modelId => {
    const profile = modelProfiles[modelId];
    console.log(`${'='.repeat(50)}`);
    console.log(`${profile.name} (${modelId})`);
    console.log(`${'='.repeat(50)}`);
    console.log(`Provider: ${profile.provider}`);
    console.log(`Strengths: ${profile.strengths.join(', ')}`);
    console.log(`Weaknesses: ${profile.weaknesses.join(', ')}`);
    console.log(`Best For: ${profile.bestFor}`);
    
    // Cost estimation
    const costEstimate = client.estimateCost.call(
      { config: { model: modelId }, tokenPricing: client.tokenPricing },
      20  // 20 iterations
    );
    
    if (!costEstimate.error) {
      console.log(`\nEstimated cost for 20 iterations: $${costEstimate.estimatedTotal.toFixed(2)}`);
      console.log(`Cost per iteration: $${costEstimate.costPerIteration.toFixed(4)}`);
    }
    console.log('');
  });
  
  rl.question('\nSelect model by typing its ID (e.g., "gpt-5-mini"): ', (answer) => {
    const selected = answer.trim();
    if (modelProfiles[selected]) {
      showConfiguration(selected, resolve);
    } else {
      resolve();
    }
  });
}

/**
 * Show configuration for selected model
 */
function showConfiguration(modelId, resolve) {
  const profile = modelProfiles[modelId];
  
  console.log(`\n✅ Selected: ${profile.name}`);
  console.log('\n📝 Add to your test configuration:\n');
  
  console.log(`\`\`\`javascript
const agent = new VisionQAAgent({
  provider: '${profile.provider}',
  model: '${modelId}',
  maxIterations: 30,
  costLimit: 5.00,
  temperature: 0,  // Deterministic for testing
  imageDetail: '${modelId.includes('nano') || modelId.includes('haiku') ? 'low' : 'high'}'
});
\`\`\``);
  
  console.log('\n🔑 Required environment variables:\n');
  
  if (profile.provider === 'openai') {
    console.log('OPENAI_API_KEY=your-openai-api-key');
  }
  
  console.log('\n💡 Tips for this model:');
  if (modelId.includes('nano') || modelId.includes('haiku')) {
    console.log('- Use for high-volume testing to minimize costs');
    console.log('- Best for simple validation and smoke tests');
    console.log('- Consider using "low" image detail to reduce tokens');
  } else if (modelId.includes('mini')) {
    console.log('- Great balance for most testing needs');
    console.log('- Use as your default model');
    console.log('- Switch to flagship models only for complex cases');
  } else if (modelId === 'gpt-5' || modelId.includes('opus')) {
    console.log('- Reserve for critical test paths');
    console.log('- Use for final validation before releases');
    console.log('- Great for complex UI flows and edge cases');
  }
  
  resolve(modelId);
}

/**
 * Main execution
 */
async function main() {
  const selectedModel = await selectModel();
  
  if (selectedModel) {
    console.log(`\n🚀 Ready to test with ${selectedModel}!\n`);
  }
  
  rl.close();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { 
  modelProfiles,
  scenarioRecommendations,
  calculateBestModel
 };