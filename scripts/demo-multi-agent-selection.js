#!/usr/bin/env node

/**
 * Demonstration of Intelligent Multi-Agent Selection
 * Shows how the new system can select ALL necessary agents dynamically
 */

console.log('\n' + '═'.repeat(80));
console.log('🚀 INTELLIGENT MULTI-AGENT SELECTION DEMONSTRATION');
console.log('═'.repeat(80));

// Simulate agent selection with different confidence levels
function simulateAgentSelection(prompt) {
  const keywords = prompt.toLowerCase();
  const agents = [];
  
  // Security agent
  if (keywords.includes('security') || keywords.includes('auth') || keywords.includes('secure')) {
    agents.push({ code: 'SECURITY', confidence: 0.95, priority: 90 });
  }
  
  // Database agent
  if (keywords.includes('database') || keywords.includes('storage') || keywords.includes('query')) {
    agents.push({ code: 'DATABASE', confidence: 0.88, priority: 85 });
  }
  
  // API agent
  if (keywords.includes('api') || keywords.includes('endpoint') || keywords.includes('rest')) {
    agents.push({ code: 'API', confidence: 0.82, priority: 80 });
  }
  
  // Performance agent
  if (keywords.includes('performance') || keywords.includes('slow') || keywords.includes('optimize')) {
    agents.push({ code: 'PERFORMANCE', confidence: 0.79, priority: 80 });
  }
  
  // Testing agent
  if (keywords.includes('test') || keywords.includes('validation') || keywords.includes('verify')) {
    agents.push({ code: 'TESTING', confidence: 0.75, priority: 85 });
  }
  
  // Design agent
  if (keywords.includes('design') || keywords.includes('ui') || keywords.includes('dashboard')) {
    agents.push({ code: 'DESIGN', confidence: 0.70, priority: 70 });
  }
  
  // Debug agent
  if (keywords.includes('debug') || keywords.includes('fix') || keywords.includes('error')) {
    agents.push({ code: 'DEBUG', confidence: 0.85, priority: 95 });
  }
  
  // Cost agent
  if (keywords.includes('cost') || keywords.includes('budget') || keywords.includes('expensive')) {
    agents.push({ code: 'COST', confidence: 0.65, priority: 60 });
  }
  
  // Documentation agent
  if (keywords.includes('document') || keywords.includes('readme') || keywords.includes('guide')) {
    agents.push({ code: 'DOCS', confidence: 0.60, priority: 75 });
  }
  
  return agents;
}

// Old selection method (top 3 only)
function oldSelection(agents, maxAgents = 3) {
  return agents
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxAgents);
}

// New intelligent selection method
function intelligentSelection(agents) {
  const selected = [];
  const dependencies = {
    'SECURITY': ['DATABASE', 'API'],
    'PERFORMANCE': ['DATABASE'],
    'TESTING': ['DEBUG'],
    'API': ['DATABASE']
  };
  
  // Group by confidence tiers
  const critical = agents.filter(a => a.confidence >= 0.85);
  const high = agents.filter(a => a.confidence >= 0.75 && a.confidence < 0.85);
  const medium = agents.filter(a => a.confidence >= 0.60 && a.confidence < 0.75);
  
  // Always include critical agents
  selected.push(...critical);
  
  // Include high confidence agents
  selected.push(...high);
  
  // Include medium confidence if they're dependencies
  const selectedCodes = selected.map(a => a.code);
  const neededDeps = new Set();
  
  selectedCodes.forEach(code => {
    const deps = dependencies[code] || [];
    deps.forEach(dep => neededDeps.add(dep));
  });
  
  medium.forEach(agent => {
    if (neededDeps.has(agent.code) && !selectedCodes.includes(agent.code)) {
      selected.push({ ...agent, reason: 'dependency' });
    }
  });
  
  // Check for synergistic combinations
  const synergies = [
    ['SECURITY', 'DATABASE', 'API'],
    ['PERFORMANCE', 'DATABASE', 'COST'],
    ['DEBUG', 'TESTING', 'PERFORMANCE']
  ];
  
  synergies.forEach(group => {
    const present = group.filter(code => selectedCodes.includes(code));
    if (present.length >= 2) {
      // Add missing members of synergy group
      group.forEach(code => {
        if (!selectedCodes.includes(code)) {
          const agent = agents.find(a => a.code === code);
          if (agent && !selected.includes(agent)) {
            selected.push({ ...agent, reason: 'synergy' });
          }
        }
      });
    }
  });
  
  return selected;
}

// Test scenarios
const scenarios = [
  {
    name: 'Complex Security Implementation',
    prompt: 'Implement secure authentication with database storage, API endpoints, and comprehensive testing'
  },
  {
    name: 'Performance Optimization',
    prompt: 'Optimize database queries and API performance to reduce costs'
  },
  {
    name: 'Bug Investigation',
    prompt: 'Debug authentication errors and fix performance issues with proper testing'
  },
  {
    name: 'Full Feature Development',
    prompt: 'Design and implement a dashboard with API integration, database storage, security, and documentation'
  }
];

console.log('\n📊 Comparing Selection Methods\n');

scenarios.forEach(scenario => {
  console.log(`${'─'.repeat(70)}`);
  console.log(`📝 ${scenario.name}`);
  console.log(`   "${scenario.prompt}"`);
  console.log('');
  
  const agents = simulateAgentSelection(scenario.prompt);
  
  // Old method (top 3)
  const oldSelected = oldSelection(agents, 3);
  console.log(`   ⚠️ OLD METHOD (Top 3 only):`);
  console.log(`      Selected: ${oldSelected.map(a => a.code).join(', ')}`);
  oldSelected.forEach(a => {
    const bar = '█'.repeat(Math.floor(a.confidence * 10)).padEnd(10, '░');
    console.log(`      - ${a.code}: ${bar} ${Math.round(a.confidence * 100)}%`);
  });
  
  // New method (intelligent)
  const newSelected = intelligentSelection(agents);
  console.log(`\n   ✅ NEW METHOD (Intelligent Multi-Selection):`);
  console.log(`      Selected: ${newSelected.map(a => a.code).join(', ')} (${newSelected.length} agents)`);
  
  // Group by selection reason
  const byConfidence = newSelected.filter(a => !a.reason);
  const byDependency = newSelected.filter(a => a.reason === 'dependency');
  const bySynergy = newSelected.filter(a => a.reason === 'synergy');
  
  if (byConfidence.length > 0) {
    console.log(`      Primary (confidence-based):`);
    byConfidence.forEach(a => {
      const bar = '█'.repeat(Math.floor(a.confidence * 10)).padEnd(10, '░');
      console.log(`      - ${a.code}: ${bar} ${Math.round(a.confidence * 100)}%`);
    });
  }
  
  if (byDependency.length > 0) {
    console.log(`      Added as dependencies:`);
    byDependency.forEach(a => {
      console.log(`      - ${a.code} (required by other agents)`);
    });
  }
  
  if (bySynergy.length > 0) {
    console.log(`      Added for synergy:`);
    bySynergy.forEach(a => {
      console.log(`      - ${a.code} (works well with selected agents)`);
    });
  }
  
  // Show what old method missed
  const oldCodes = oldSelected.map(a => a.code);
  const missed = newSelected.filter(a => !oldCodes.includes(a.code));
  
  if (missed.length > 0) {
    console.log(`\n   ⚠️ Old method would have missed: ${missed.map(a => a.code).join(', ')}`);
  }
  
  console.log('');
});

// Summary comparison
console.log('═'.repeat(70));
console.log('📈 SUMMARY COMPARISON');
console.log('═'.repeat(70));

console.log('\n🔴 OLD METHOD LIMITATIONS:');
console.log('   • Hard limit of 3 agents maximum');
console.log('   • Only considers individual confidence scores');
console.log('   • Misses important dependencies');
console.log('   • No understanding of agent synergies');
console.log('   • Can\'t adapt to task complexity');

console.log('\n🟢 NEW METHOD ADVANTAGES:');
console.log('   • Dynamic selection based on task needs');
console.log('   • Includes ALL critical agents (≥85% confidence)');
console.log('   • Automatically resolves dependencies');
console.log('   • Identifies and leverages synergies');
console.log('   • Groups agents for parallel execution');
console.log('   • Adapts to task complexity');

console.log('\n💡 KEY IMPROVEMENTS:');
console.log('   1. No artificial limit on agent count');
console.log('   2. Confidence-based tiering (critical/high/medium/low)');
console.log('   3. Dependency resolution ensures completeness');
console.log('   4. Synergy detection improves effectiveness');
console.log('   5. Task pattern recognition for better selection');

console.log('\n' + '═'.repeat(70));
console.log('✨ With intelligent multi-selection, LEO Protocol can now activate');
console.log('   ALL necessary sub-agents for complex tasks, not just the top 3!');
console.log('═'.repeat(70) + '\n');