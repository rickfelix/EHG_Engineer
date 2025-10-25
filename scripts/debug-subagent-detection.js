#!/usr/bin/env node

/**
 * Debug sub-agent detection for SD-2025-001
 */

import SubAgentEnforcementSystem from './subagent-enforcement-system';
import fs from 'fs';

async function debugDetection() {
  const enforcer = new SubAgentEnforcementSystem();
  
  console.log('🔍 Debugging Sub-Agent Detection for SD-2025-001\n');
  
  // Get the context analysis
  const analysis = await enforcer.analyzeContext('SD-2025-001', 'EXEC_IMPLEMENTATION');
  
  console.log('📁 Files Found:');
  analysis.context.files.forEach(file => console.log(`  ${file}`));
  
  console.log('\n🎯 Features Detected:');
  Array.from(analysis.context.features).forEach(feature => console.log(`  ${feature}`));
  
  console.log('\n📋 Required Sub-Agents:');
  analysis.requiredSubAgents.forEach(agent => console.log(`  ${agent}`));
  
  console.log('\n🔍 Content Sample:');
  console.log(analysis.context.content.substring(0, 200) + '...');
  
  // Specifically check for UI components
  console.log('\n🎨 UI Component Check:');
  const componentFiles = analysis.context.files.filter(f => f.includes('component'));
  console.log(`  Component files found: ${componentFiles.length}`);
  componentFiles.forEach(file => console.log(`    ${file}`));
  
  // Check if hasUIComponents feature was set
  console.log(`  hasUIComponents feature: ${analysis.context.features.has('hasUIComponents')}`);
  
  // Manual check for our specific files
  const ourComponents = [
    'src/client/src/components/voice/EVAVoiceAssistant.tsx',
    'src/client/src/components/SmartRefreshButton.jsx',
    'src/client/src/components/voice/RealtimeClient.ts'
  ];
  
  console.log('\n🎯 Expected Component Files:');
  for (const file of ourComponents) {
    const exists = fs.existsSync(file);
    console.log(`  ${exists ? '✅' : '❌'} ${file}`);
  }
}

debugDetection().catch(console.error);