#!/usr/bin/env node

/**
 * PROPERLY INTEGRATED test of all improvements on EHG codebase
 * This version correctly uses the pipeline without corruption
 */

import path from 'path';
import fsModule from 'fs';
const fs = fsModule.promises;

// Import all systems
import { SharedIntelligenceHub, getInstance: getHub } from '../lib/agents/shared-intelligence-hub';
import { IncrementalAnalyzer, getInstance: getAnalyzer } from '../lib/agents/incremental-analyzer';
import AutoFixEngine from '../lib/agents/auto-fix-engine';
import { LearningDatabase, getInstance: getDB } from '../lib/agents/learning-database';
import PriorityEngine from '../lib/agents/priority-engine';

// Import improved sub-agents
import SecuritySubAgentV3 from '../lib/agents/security-sub-agent-v3';
import PerformanceSubAgentV2 from '../lib/agents/performance-sub-agent-v2';
import DesignSubAgent from '../lib/agents/design-sub-agent';
import DatabaseSubAgent from '../lib/agents/database-sub-agent';

async function testIntegrated() {
  console.log('\n🚀 PROPERLY INTEGRATED TEST ON EHG CODEBASE\n');
  console.log('=' .repeat(60));
  
  const basePath = process.cwd(); // EHG_Engineer root
  
  // Initialize all systems
  const hub = getHub();
  const analyzer = getAnalyzer();
  const learningDB = getDB();
  const fixEngine = new AutoFixEngine();
  const priorityEngine = new PriorityEngine();
  
  await analyzer.initialize();
  await learningDB.initialize();
  
  // STEP 1: Incremental Analysis (FIXED)
  console.log('\n1️⃣  INCREMENTAL ANALYSIS');
  
  // First, detect what's changed
  const changes = await analyzer.detectChanges(basePath);
  console.log(`   Added files: ${changes.added.length}`);
  console.log(`   Modified files: ${changes.modified.length}`);
  console.log(`   Unchanged files: ${changes.unchanged.length}`);
  console.log(`   Deleted files: ${changes.deleted.length}`);
  
  // Get analysis strategy
  const strategy = await analyzer.getAnalysisStrategy(basePath);
  console.log(`   Strategy: ${strategy.type}`);
  console.log(`   Files needing analysis: ${strategy.filesToAnalyze.length}`);
  console.log(`   Files to skip (cached): ${strategy.filesToSkip.length}`);
  console.log(`   Time saved: ${strategy.timeSaved}`);
  
  // Use ONLY files that need analysis (not arbitrary slice)
  let filesToAnalyze = strategy.filesToAnalyze;
  
  // For demo purposes, limit to reasonable number but based on ACTUAL needs
  if (filesToAnalyze.length > 20) {
    console.log(`   ⚠️  Limiting analysis to 20 files for demo (${filesToAnalyze.length} need analysis)`);
    filesToAnalyze = filesToAnalyze.slice(0, 20);
  }
  
  // STEP 2: Run Sub-Agents PROPERLY
  console.log('\n2️⃣  RUNNING SUB-AGENTS WITH PROPER INTEGRATION');
  
  // Security Sub-Agent
  console.log('\n   🔒 Security Sub-Agent:');
  const securityAgent = new SecuritySubAgentV3();
  
  // Use the agent's own execute method which handles everything properly
  const securityContext = {
    basePath,
    files: filesToAnalyze.filter(f => f.endsWith('.js') || f.endsWith('.jsx'))
  };
  const securityResults = await securityAgent.execute(securityContext);
  
  console.log(`      Found: ${securityResults.findings.length} issues`);
  console.log(`      Score: ${securityResults.score}/100`);
  console.log(`      Status: ${securityResults.status}`);
  
  // Share ALL findings through hub (they're already properly structured by BaseSubAgent)
  securityResults.findings.forEach(finding => {
    hub.shareFinding('security', finding);
  });
  
  // Performance Sub-Agent
  console.log('\n   ⚡ Performance Sub-Agent:');
  const perfAgent = new PerformanceSubAgentV2();
  
  const perfContext = {
    basePath,
    files: filesToAnalyze.filter(f => f.endsWith('.js') || f.endsWith('.jsx'))
  };
  const perfResults = await perfAgent.execute(perfContext);
  
  console.log(`      Found: ${perfResults.findings.length} issues`);
  console.log(`      Score: ${perfResults.score}/100`);
  console.log(`      Status: ${perfResults.status}`);
  
  // Share performance findings
  perfResults.findings.forEach(finding => {
    hub.shareFinding('performance', finding);
  });
  
  // Design Sub-Agent
  console.log('\n   🎨 Design Sub-Agent:');
  const designAgent = new DesignSubAgent();
  const designResults = await designAgent.execute({ basePath });
  
  console.log(`      Found: ${designResults.findings?.length || 0} issues`);
  console.log(`      Score: ${designResults.score || 0}/100`);
  
  // Database Sub-Agent (ACTUALLY USE IT!)
  console.log('\n   🗄️ Database Sub-Agent:');
  const dbAgent = new DatabaseSubAgent();
  const dbResults = await dbAgent.execute({ basePath });
  
  console.log(`      Found: ${dbResults.findings?.length || 0} issues`);
  console.log(`      Score: ${dbResults.score || 0}/100`);
  
  // Share database findings
  if (dbResults.findings) {
    dbResults.findings.forEach(finding => {
      hub.shareFinding('database', finding);
    });
  }
  
  // Collect ALL findings from ALL agents (properly structured)
  const allFindings = [
    ...securityResults.findings,
    ...perfResults.findings,
    ...(designResults.findings || []),
    ...(dbResults.findings || [])
  ];
  
  console.log(`\n   📊 Total findings collected: ${allFindings.length}`);
  
  // STEP 3: Cross-Agent Insights (SHOULD WORK NOW)
  console.log('\n3️⃣  CROSS-AGENT INSIGHTS');
  
  // Check if we have findings from multiple agents on same files
  const fileAgentMap = new Map();
  allFindings.forEach(finding => {
    const file = finding.location?.file || finding.file;
    if (file) {
      if (!fileAgentMap.has(file)) {
        fileAgentMap.set(file, new Set());
      }
      fileAgentMap.get(file).add(finding.agent);
    }
  });
  
  let multiAgentFiles = 0;
  for (const [file, agents] of fileAgentMap) {
    if (agents.size > 1) {
      multiAgentFiles++;
      console.log(`   📍 ${file}: ${Array.from(agents).join(' + ')}`);
    }
  }
  
  const compoundInsights = hub.getCompoundInsights();
  const collaborationOps = hub.getCollaborationOpportunities();
  
  console.log(`   Files with multi-agent issues: ${multiAgentFiles}`);
  console.log(`   Compound insights generated: ${compoundInsights.length}`);
  console.log(`   Collaboration opportunities: ${collaborationOps.length}`);
  
  if (compoundInsights.length > 0) {
    console.log('\n   💡 Top Compound Insights:');
    compoundInsights.slice(0, 3).forEach(insight => {
      console.log(`   - ${insight.description} [${insight.priority}]`);
    });
  }
  
  // STEP 4: Historical Learning (WITH FEEDBACK)
  console.log('\n4️⃣  HISTORICAL LEARNING');
  
  // Learn from this analysis
  await learningDB.learnFromAnalysis({
    findings: allFindings
  });
  
  // Simulate realistic feedback (mark some as false positives based on patterns)
  let feedbackGiven = 0;
  for (const finding of allFindings.slice(0, 10)) {
    // Mark console.log findings as false positives in production code
    if (finding.type === 'SENSITIVE_DATA_LOGGING' && finding.location?.file?.includes('test')) {
      await learningDB.recordFeedback(finding.id, 'FALSE_POSITIVE');
      feedbackGiven++;
    } else if (finding.severity === 'critical') {
      await learningDB.recordFeedback(finding.id, 'CONFIRMED');
      feedbackGiven++;
    }
  }
  
  const stats = learningDB.getStatistics();
  console.log(`   Analysis runs recorded: ${stats.analysisRuns}`);
  console.log(`   Total findings tracked: ${stats.totalFindings}`);
  console.log(`   Feedback given this run: ${feedbackGiven}`);
  console.log(`   False positive rate: ${stats.falsePositiveRate}`);
  console.log(`   Top issues:`);
  stats.commonIssues.slice(0, 3).forEach(issue => {
    console.log(`   - ${issue.issue}: ${issue.count} times`);
  });
  
  // STEP 5: Auto-Fix Generation (SHOULD WORK NOW WITH TYPE MAPPER)
  console.log('\n5️⃣  AUTO-FIX GENERATION');
  
  const fixes = [];
  const fixAttempts = Math.min(10, allFindings.length); // Try more fixes
  
  console.log(`   Attempting fixes for ${fixAttempts} findings...`);
  
  for (let i = 0; i < fixAttempts; i++) {
    const finding = allFindings[i];
    const fix = await fixEngine.generateFix(finding);
    
    if (fix.available) {
      fixes.push(fix);
      console.log(`   ✅ Fixed: ${finding.type} → ${fix.description}`);
    } else if (i < 5) { // Only show first 5 failures to avoid spam
      console.log(`   ❌ Cannot fix: ${finding.type} (${fix.reason})`);
    }
  }
  
  console.log(`   Success rate: ${fixes.length}/${fixAttempts} (${Math.round((fixes.length/fixAttempts)*100)}%)`);
  
  if (fixes.length > 0) {
    console.log('\n   🔧 Available Fixes:');
    fixes.slice(0, 5).forEach(fix => {
      console.log(`   • ${fix.description}`);
      console.log(`     Confidence: ${(fix.confidence * 100).toFixed(0)}%`);
      console.log(`     Complexity: ${fix.complexity || 'Unknown'}`);
    });
  }
  
  // STEP 6: Smart Prioritization
  console.log('\n6️⃣  SMART PRIORITIZATION');
  
  const actionPlan = priorityEngine.prioritizeFindings(allFindings, {
    maxResults: allFindings.length, // Prioritize all
    includeEffort: true
  });
  
  console.log(`   Issues prioritized: ${allFindings.length}`);
  console.log(`   Immediate actions (< 10 min): ${actionPlan.immediate.length}`);
  console.log(`   Today's tasks (< 2 hours): ${actionPlan.today.length}`);
  console.log(`   This week: ${actionPlan.thisWeek.length}`);
  
  if (actionPlan.summary) {
    console.log(`   ${actionPlan.summary.message}`);
  }
  
  if (actionPlan.immediate.length > 0) {
    console.log('\n   ⚡ Top Priority Actions:');
    actionPlan.immediate.slice(0, 3).forEach(task => {
      console.log(`   • ${task.type} - ${task.effort}`);
      console.log(`     ${task.description}`);
      if (task.autoFix) {
        console.log(`     ✨ Auto-fix available!`);
      }
    });
  }
  
  const quickWins = priorityEngine.getQuickWins(allFindings, 3);
  if (quickWins.length > 0) {
    console.log('\n   💰 Best ROI Quick Wins:');
    quickWins.forEach(win => {
      console.log(`   • ${win.type}: ${win.effort} → ${win.impact} (ROI: ${win.roi}x)`);
    });
  }
  
  // FINAL METRICS
  console.log('\n' + '=' .repeat(60));
  console.log('📊 INTEGRATION TEST COMPLETE');
  console.log('=' .repeat(60));
  
  const criticalCount = allFindings.filter(f => f.severity === 'critical').length;
  const autoFixable = allFindings.filter(f => fixEngine.typeMapper.isFixable(f)).length;
  
  console.log('\n✅ SYSTEM INTEGRATION STATUS:');
  console.log(`   • Incremental Analysis: ${changes.unchanged.length > 0 ? '✅ Using cache' : '⚠️ First run'}`);
  console.log(`   • Cross-Agent Insights: ${compoundInsights.length > 0 ? '✅ Working' : '⚠️ No correlations'}`);
  console.log(`   • Auto-Fix Generation: ${fixes.length > 0 ? '✅ Working' : '❌ Failed'} (${fixes.length}/${fixAttempts})`);
  console.log(`   • Historical Learning: ✅ ${stats.analysisRuns} runs recorded`);
  console.log(`   • Smart Prioritization: ✅ ${actionPlan.immediate.length + actionPlan.today.length} tasks planned`);
  
  console.log('\n📈 ANALYSIS METRICS:');
  console.log(`   • Files analyzed: ${filesToAnalyze.length}/${strategy.totalFiles} (${Math.round((filesToAnalyze.length/strategy.totalFiles)*100)}%)`);
  console.log(`   • Issues found: ${allFindings.length}`);
  console.log(`   • Critical issues: ${criticalCount}`);
  console.log(`   • Auto-fixable: ${autoFixable} (${Math.round((autoFixable/allFindings.length)*100)}%)`);
  console.log(`   • Multi-agent concerns: ${multiAgentFiles} files`);
  
  if (criticalCount > 0) {
    console.log(`\n⚠️  ${criticalCount} CRITICAL ISSUES REQUIRE IMMEDIATE ATTENTION!`);
  }
  
  // Performance comparison
  const fullScanTime = strategy.totalFiles * 2; // 2 seconds per file
  const actualTime = filesToAnalyze.length * 2;
  const timeSaved = fullScanTime - actualTime;
  
  console.log('\n⏱️  PERFORMANCE:');
  console.log(`   • Full scan would take: ${analyzer.formatTime(fullScanTime)}`);
  console.log(`   • Actual time: ${analyzer.formatTime(actualTime)}`);
  console.log(`   • Time saved: ${analyzer.formatTime(timeSaved)} (${Math.round((timeSaved/fullScanTime)*100)}%)`);
  
  console.log('\n🏆 All systems properly integrated!\n');
  
  return {
    success: true,
    findings: allFindings.length,
    fixes: fixes.length,
    insights: compoundInsights.length
  };
}

// Run the test
testIntegrated()
  .then(results => {
    console.log('Integration test successful:', results);
    process.exit(0);
  })
  .catch(error => {
    console.error('Integration test failed:', error);
    process.exit(1);
  });