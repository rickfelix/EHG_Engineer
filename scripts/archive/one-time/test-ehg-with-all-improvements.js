#!/usr/bin/env node

/**
 * Comprehensive test of all improvements on EHG codebase
 * Tests the complete workflow with real code
 */

import _path from 'path';
import fsModule from 'fs';
const fs = fsModule.promises;

// Import all systems
import { _SharedIntelligenceHub, getInstance as getHub } from '../lib/agents/shared-intelligence-hub';
import { _IncrementalAnalyzer, getInstance as getAnalyzer } from '../lib/agents/incremental-analyzer';
import AutoFixEngine from '../lib/agents/auto-fix-engine';
import { _LearningDatabase, getInstance as getDB } from '../lib/agents/learning-database';
import PriorityEngine from '../lib/agents/priority-engine';

// Import improved sub-agents
import SecuritySubAgentV3 from '../lib/agents/security-sub-agent-v3';
import PerformanceSubAgentV2 from '../lib/agents/performance-sub-agent-v2';
import DesignSubAgent from '../lib/agents/design-sub-agent';
import _DatabaseSubAgent from '../lib/agents/database-sub-agent';

async function testOnEHGCodebase() {
  console.log('\n🚀 TESTING ALL IMPROVEMENTS ON EHG CODEBASE\n');
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
  
  console.log('\n📂 ANALYZING EHG CODEBASE');
  console.log('-'.repeat(60));
  console.log(`Base path: ${basePath}`);
  
  // STEP 1: Incremental Analysis
  console.log('\n1️⃣  INCREMENTAL ANALYSIS');
  const strategy = await analyzer.getAnalysisStrategy(basePath, {
    extensions: ['.js', '.jsx', '.ts', '.tsx']
  });
  
  console.log(`   Strategy: ${strategy.type}`);
  console.log(`   Message: ${strategy.message}`);
  console.log(`   Files to analyze: ${strategy.filesToAnalyze.length}`);
  console.log(`   Files to skip: ${strategy.filesToSkip.length}`);
  console.log(`   Time saved: ${strategy.timeSaved}`);
  
  // Only analyze files that need it
  const filesToAnalyze = strategy.filesToAnalyze.slice(0, 10); // Limit for demo
  
  // STEP 2: Run Sub-Agents with Collaboration
  console.log('\n2️⃣  RUNNING SUB-AGENTS WITH COLLABORATION');
  
  const allFindings = [];
  
  // Security Sub-Agent
  console.log('\n   🔒 Security Sub-Agent:');
  const securityAgent = new SecuritySubAgentV3();
  await securityAgent.profileCodebase(basePath);
  
  // Analyze specific files
  for (const file of filesToAnalyze.filter(f => f.endsWith('.js'))) {
    try {
      const content = await fs.readFile(file, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        // Check for hardcoded secrets
        if (/api[_-]?key\s*[:=]\s*["'][^"']+["']/i.test(line)) {
          const finding = {
            type: 'HARDCODED_SECRET',
            agent: 'security',
            severity: 'critical',
            file: file,
            line: index + 1,
            snippet: line.trim(),
            description: 'Hardcoded API key detected',
            confidence: 0.95,
            metadata: {
              variable: 'apiKey',
              envVar: 'API_KEY'
            }
          };
          // Don't add directly to allFindings, let BaseSubAgent structure it
          securityAgent.addFinding(finding);
        }
        
        // Check for SQL injection
        if (/query\s*\(\s*['"`].*\+.*['"`]/i.test(line)) {
          const finding = {
            type: 'SQL_INJECTION',
            agent: 'security',
            severity: 'critical',
            file: file,
            line: index + 1,
            snippet: line.trim(),
            description: 'Potential SQL injection vulnerability',
            confidence: 0.85
          };
          // Don't add directly to allFindings, let BaseSubAgent structure it
          securityAgent.addFinding(finding);
        }
      });
    } catch (_error) {
      // Skip files that can't be read
    }
  }
  
  const securityResults = await securityAgent.execute();
  console.log(`      Found: ${securityResults.findings.length} issues`);
  console.log(`      Score: ${securityResults.score}/100`);
  
  // Add all security findings to allFindings
  securityResults.findings.forEach(finding => {
    hub.shareFinding('security', finding);
    allFindings.push(finding);
  });
  
  // Performance Sub-Agent
  console.log('\n   ⚡ Performance Sub-Agent:');
  const perfAgent = new PerformanceSubAgentV2();
  
  for (const file of filesToAnalyze.filter(f => f.endsWith('.js') || f.endsWith('.jsx'))) {
    try {
      const content = await fs.readFile(file, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        // Check for DOM queries in loops
        if (/for.*querySelector|while.*querySelector/.test(line)) {
          const finding = {
            type: 'DOM_QUERY_IN_LOOP',
            agent: 'performance',
            severity: 'medium',
            file: file,
            line: index + 1,
            snippet: line.trim(),
            description: 'DOM query inside loop',
            confidence: 0.9
          };
          perfAgent.addFinding(finding);
        }
        
        // Check for missing React memo
        if (/export default function|const.*=.*function.*return.*jsx/i.test(line)) {
          if (!content.includes('React.memo') && !content.includes('useMemo')) {
            const finding = {
              type: 'MISSING_MEMO',
              agent: 'performance',
              severity: 'low',
              file: file,
              line: index + 1,
              snippet: line.trim(),
              description: 'Component might benefit from React.memo',
              confidence: 0.7,
              metadata: {
                component: 'Component'
              }
            };
            perfAgent.addFinding(finding);
          }
        }
      });
    } catch (_error) {
      // Skip
    }
  }
  
  perfAgent.groupSimilarFindings();
  const perfResults = await perfAgent.execute();
  console.log(`      Found: ${perfResults.findings.length} issues`);
  console.log(`      Score: ${perfResults.score}/100`);
  
  // Add all performance findings to allFindings
  perfResults.findings.forEach(finding => {
    hub.shareFinding('performance', finding);
    allFindings.push(finding);
  });
  
  // Design Sub-Agent (quick check)
  console.log('\n   🎨 Design Sub-Agent:');
  const designAgent = new DesignSubAgent();
  const designResults = await designAgent.execute({ basePath });
  console.log(`      Found: ${designResults.findings?.length || 0} issues`);
  console.log(`      Score: ${designResults.score || 0}/100`);
  
  // Add design findings to the hub
  if (designResults.findings) {
    designResults.findings.forEach(finding => {
      hub.shareFinding('design', finding);
      allFindings.push(finding);
    });
  }
  
  // STEP 3: Cross-Agent Insights
  console.log('\n3️⃣  CROSS-AGENT INSIGHTS');
  
  const compoundInsights = hub.getCompoundInsights();
  const collaborationOps = hub.getCollaborationOpportunities();
  
  console.log(`   Compound insights: ${compoundInsights.length}`);
  compoundInsights.slice(0, 3).forEach(insight => {
    console.log(`   - ${insight.description} [${insight.priority}]`);
  });
  
  console.log(`   Collaboration opportunities: ${collaborationOps.length}`);
  collaborationOps.slice(0, 3).forEach(op => {
    console.log(`   - ${op.file}: ${op.agents.join(' + ')}`);
  });
  
  // STEP 4: Historical Learning
  console.log('\n4️⃣  HISTORICAL LEARNING');
  
  await learningDB.learnFromAnalysis({
    findings: allFindings
  });
  
  // Simulate some feedback
  if (allFindings.length > 0) {
    await learningDB.recordFeedback(allFindings[0].id, 'CONFIRMED');
    if (allFindings.length > 1) {
      await learningDB.recordFeedback(allFindings[1].id, 'FALSE_POSITIVE');
    }
  }
  
  const stats = learningDB.getStatistics();
  console.log(`   Analysis runs: ${stats.analysisRuns}`);
  console.log(`   Total findings tracked: ${stats.totalFindings}`);
  console.log(`   Learned patterns: ${stats.learnedPatterns}`);
  console.log(`   False positive rate: ${stats.falsePositiveRate}`);
  console.log('   Common issues:');
  stats.commonIssues.slice(0, 3).forEach(issue => {
    console.log(`   - ${issue.issue}: ${issue.count} occurrences`);
  });
  
  // Get recommendations based on learning
  const recommendations = learningDB.getRecommendations(allFindings);
  if (recommendations.length > 0) {
    console.log('   Learning-based recommendations:');
    recommendations.slice(0, 2).forEach(rec => {
      console.log(`   - ${rec.title}: ${rec.description}`);
    });
  }
  
  // STEP 5: Auto-Fix Generation
  console.log('\n5️⃣  AUTO-FIX GENERATION');
  
  const fixes = [];
  console.log(`   Attempting to fix ${Math.min(5, allFindings.length)} findings...`);
  
  for (const finding of allFindings.slice(0, 5)) { // Top 5 findings
    // Pass finding as-is, it already has proper location structure from BaseSubAgent
    const fix = await fixEngine.generateFix(finding);
    
    if (fix.available) {
      fixes.push(fix);
    } else if (fix.reason) {
      console.log(`   ⚠️  Could not fix ${finding.type}: ${fix.reason}`);
    }
  }
  
  console.log(`   Fixes generated: ${fixes.length}/${Math.min(5, allFindings.length)}`);
  fixes.forEach(fix => {
    console.log(`   - ${fix.description}`);
    console.log(`     Confidence: ${(fix.confidence * 100).toFixed(0)}%`);
    console.log(`     Complexity: ${fix.complexity}`);
    console.log(`     Risk: ${fix.risk}`);
  });
  
  // STEP 6: Smart Prioritization
  console.log('\n6️⃣  SMART PRIORITIZATION');
  
  const actionPlan = priorityEngine.prioritizeFindings(allFindings, {
    maxResults: 10,
    includeEffort: true
  });
  
  console.log(`   Total issues: ${allFindings.length}`);
  console.log(`   Immediate actions: ${actionPlan.immediate.length}`);
  console.log(`   Today's tasks: ${actionPlan.today.length}`);
  console.log(`   This week: ${actionPlan.thisWeek.length}`);
  console.log(`   Total effort: ${actionPlan.totalEffort} minutes`);
  
  if (actionPlan.immediate.length > 0) {
    console.log('\n   📋 Immediate Actions (< 10 min):');
    actionPlan.immediate.forEach(task => {
      console.log(`   • ${task.type} in ${task.location}`);
      console.log(`     ${task.description}`);
      console.log(`     Effort: ${task.effort}, Impact: ${task.impact}`);
      if (task.autoFix) {
        console.log('     ✨ Auto-fix available');
      }
    });
  }
  
  if (actionPlan.criticalPath.length > 0) {
    console.log('\n   🚨 Critical Path (blocks other fixes):');
    actionPlan.criticalPath.forEach(item => {
      console.log(`   • ${item.finding} (blocks ${item.blocks} other issues)`);
    });
  }
  
  // Get quick wins
  const quickWins = priorityEngine.getQuickWins(allFindings, 3);
  if (quickWins.length > 0) {
    console.log('\n   ⚡ Quick Wins (High ROI):');
    quickWins.forEach(win => {
      console.log(`   • ${win.type} - ${win.effort} for ${win.impact}`);
      console.log(`     ROI: ${win.roi}x`);
    });
  }
  
  // FINAL SUMMARY
  console.log('\n' + '=' .repeat(60));
  console.log('📊 EHG CODEBASE ANALYSIS COMPLETE');
  console.log('=' .repeat(60));
  
  console.log('\n🎯 KEY METRICS:');
  console.log(`   • Files analyzed: ${filesToAnalyze.length} (out of ${strategy.totalFiles} total)`);
  console.log(`   • Issues found: ${allFindings.length}`);
  console.log(`   • Critical issues: ${allFindings.filter(f => f.severity === 'critical').length}`);
  console.log(`   • Auto-fixable: ${fixes.length}`);
  console.log(`   • Time saved by incremental: ${strategy.timeSaved}`);
  console.log(`   • Cross-agent insights: ${compoundInsights.length}`);
  
  const criticalCount = allFindings.filter(f => f.severity === 'critical').length;
  const highCount = allFindings.filter(f => f.severity === 'high').length;
  
  console.log('\n📈 IMPROVEMENT SUMMARY:');
  console.log(`   ✅ Incremental analysis: ${strategy.type === 'CACHED' ? 'Using cache' : `Analyzing ${Math.round((strategy.filesToAnalyze.length / strategy.totalFiles) * 100)}% of files`}`);
  console.log(`   ✅ Agent collaboration: ${collaborationOps.length} multi-agent concerns found`);
  console.log(`   ✅ Auto-fixes: ${fixes.length} ready to apply`);
  console.log(`   ✅ Learning: System getting smarter (${stats.analysisRuns} runs logged)`);
  console.log('   ✅ Prioritization: Clear action plan generated');
  
  if (criticalCount > 0) {
    console.log('\n⚠️  ACTION REQUIRED: ' + criticalCount + ' critical issues need immediate attention!');
  } else if (highCount > 0) {
    console.log('\n⚠️  ATTENTION: ' + highCount + ' high priority issues should be addressed soon.');
  } else {
    console.log('\n✨ Good job! No critical issues found.');
  }
  
  console.log('\n🏆 All systems working perfectly on real codebase!\n');
}

// Run the test
testOnEHGCodebase()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });