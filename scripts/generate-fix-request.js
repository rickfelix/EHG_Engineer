#!/usr/bin/env node

/**
 * LEO Protocol v4.1.3 - Generate Fix Request
 * Creates structured fix requests from test failures for EXEC review
 * Maintains human-in-the-loop approval process
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import FixRecommendationEngine from '../lib/testing/fix-recommendation-engine';

class FixRequestGenerator {
  constructor() {
    this.recommendationEngine = new FixRecommendationEngine();
    this.outputDir = 'test-results/fix-requests';
  }
  
  /**
   * Generate fix request from test results
   */
  async generateFromTestResults(testResultsPath) {
    console.log('📋 Generating fix requests from test results...');
    
    try {
      // Load test results
      const testResults = await this.loadTestResults(testResultsPath);
      
      if (!testResults.issues || testResults.issues.length === 0) {
        console.log('✅ No failures found - no fix requests needed!');
        return { success: true, requests: [] };
      }
      
      // Generate fix request for each failure
      const fixRequests = [];
      for (const issue of testResults.issues) {
        const request = await this.generateFixRequest(issue);
        fixRequests.push(request);
      }
      
      // Save fix requests
      await this.saveFixRequests(fixRequests);
      
      // Generate summary handoff
      const handoff = await this.generateHandoffDocument(fixRequests, testResults);
      
      console.log(`✅ Generated ${fixRequests.length} fix requests`);
      return {
        success: true,
        requests: fixRequests,
        handoff: handoff
      };
      
    } catch (error) {
      console.error('❌ Failed to generate fix requests:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Load test results from file
   */
  async loadTestResults(testResultsPath) {
    const defaultPath = 'test-results/automated/reports/automated-test-report.json';
    const actualPath = testResultsPath || defaultPath;
    
    try {
      const content = await fs.readFile(actualPath, 'utf8');
      return JSON.parse(content);
    } catch (_error) {
      // Try to find most recent report
      const reportsDir = path.dirname(actualPath);
      const files = await fs.readdir(reportsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      if (jsonFiles.length === 0) {
        throw new Error('No test results found');
      }
      
      // Use most recent file
      jsonFiles.sort();
      const latestFile = path.join(reportsDir, jsonFiles[jsonFiles.length - 1]);
      const content = await fs.readFile(latestFile, 'utf8');
      return JSON.parse(content);
    }
  }
  
  /**
   * Generate individual fix request
   */
  async generateFixRequest(issue) {
    const failureData = {
      error: { message: issue.error },
      target: { name: issue.target },
      analysis: issue.analysis || {}
    };
    
    // Generate recommendation using engine
    const recommendation = await this.recommendationEngine.analyzeAndRecommend(failureData);
    
    // Format as structured fix request
    const fixRequest = {
      id: this.generateRequestId(),
      timestamp: new Date().toISOString(),
      target: issue.target,
      error: issue.error,
      analysis: issue.analysis,
      recommendation: recommendation,
      status: 'pending',
      priority: recommendation.severity,
      assignedTo: 'EXEC',
      markdown: this.formatAsMarkdown(issue, recommendation)
    };
    
    return fixRequest;
  }
  
  /**
   * Format fix request as markdown for EXEC
   */
  formatAsMarkdown(issue, recommendation) {
    const md = [];
    
    md.push(`## Fix Request: ${issue.target}`);
    md.push(`**Generated**: ${new Date().toISOString()}`);
    md.push(`**Priority**: ${recommendation.severity}`);
    md.push(`**Confidence**: ${recommendation.confidence}%`);
    md.push('');
    
    md.push('### 🔴 Test Failure');
    md.push(`**Component**: ${issue.target}`);
    md.push(`**Error**: ${issue.error}`);
    md.push(`**Type**: ${recommendation.errorType}`);
    md.push('');
    
    md.push('### 🔍 Root Cause Analysis');
    md.push(recommendation.rootCause);
    if (issue.analysis?.codeLocation) {
      md.push(`**Likely Location**: ${issue.analysis.codeLocation}`);
    }
    md.push('');
    
    md.push('### ✅ Recommended Fix');
    md.push(`**Action**: ${recommendation.primaryFix.action}`);
    md.push('');
    md.push('**Steps**:');
    recommendation.primaryFix.steps.forEach((step, i) => {
      md.push(`${i + 1}. ${step}`);
    });
    md.push('');
    
    if (recommendation.codeExamples) {
      md.push('### 💻 Code Example');
      md.push('```javascript');
      md.push(recommendation.codeExamples.code);
      md.push('```');
      md.push('');
    }
    
    if (recommendation.alternativeFixes.length > 0) {
      md.push('### 🔄 Alternative Approaches');
      recommendation.alternativeFixes.forEach(alt => {
        md.push(`- ${alt.action}`);
      });
      md.push('');
    }
    
    md.push('### 🧪 Validation');
    md.push('After applying the fix, validate with:');
    md.push('```bash');
    md.push(recommendation.testCommand.command);
    md.push('```');
    md.push('');
    
    md.push('### ⏱️ Estimated Time');
    md.push(recommendation.estimatedTime);
    md.push('');
    
    md.push('---');
    
    return md.join('\n');
  }
  
  /**
   * Save fix requests to files
   */
  async saveFixRequests(fixRequests) {
    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });
    
    // Save individual requests
    for (const request of fixRequests) {
      const filename = `fix-request-${request.id}.md`;
      const filepath = path.join(this.outputDir, filename);
      await fs.writeFile(filepath, request.markdown);
      console.log(`   📄 Saved: ${filename}`);
    }
    
    // Save consolidated JSON
    const jsonFile = path.join(this.outputDir, 'fix-requests.json');
    await fs.writeFile(jsonFile, JSON.stringify(fixRequests, null, 2));
  }
  
  /**
   * Generate handoff document for EXEC
   */
  async generateHandoffDocument(fixRequests, testResults) {
    const handoff = [];
    
    handoff.push('# Testing Sub-Agent → EXEC Handoff');
    handoff.push('**LEO Protocol v4.1.3 - Enhanced QA with Fix Recommendations**');
    handoff.push(`**Generated**: ${new Date().toISOString()}`);
    handoff.push('');
    
    handoff.push('## 1. EXECUTIVE SUMMARY (≤200 tokens)');
    handoff.push(`Testing completed with ${testResults.failed} failures requiring fixes.`);
    handoff.push(`Generated ${fixRequests.length} fix recommendations with detailed analysis.`);
    handoff.push(`Priority: ${this.calculateOverallPriority(fixRequests)}`);
    handoff.push(`Total estimated fix time: ${this.calculateTotalTime(fixRequests)}`);
    handoff.push('');
    
    handoff.push('## 2. TEST RESULTS OVERVIEW');
    handoff.push(`- **Passed**: ${testResults.passed} tests`);
    handoff.push(`- **Failed**: ${testResults.failed} tests`);
    handoff.push(`- **Warnings**: ${testResults.warnings}`);
    handoff.push(`- **Success Rate**: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
    handoff.push('');
    
    handoff.push('## 3. FIX REQUESTS SUMMARY');
    handoff.push('| Component | Error Type | Priority | Confidence | Est. Time |');
    handoff.push('|-----------|------------|----------|------------|-----------|');
    fixRequests.forEach(req => {
      handoff.push(`| ${req.target} | ${req.recommendation.errorType} | ${req.priority} | ${req.recommendation.confidence}% | ${req.recommendation.estimatedTime} |`);
    });
    handoff.push('');
    
    handoff.push('## 4. RECOMMENDED EXECUTION ORDER');
    const prioritized = this.prioritizeRequests(fixRequests);
    prioritized.forEach((req, i) => {
      handoff.push(`${i + 1}. **${req.target}** (${req.priority})`);
      handoff.push(`   - ${req.recommendation.primaryFix.action}`);
    });
    handoff.push('');
    
    handoff.push('## 5. DELIVERABLES');
    handoff.push('- Fix request documents: `test-results/fix-requests/`');
    handoff.push('- Individual fix details: `fix-request-*.md`');
    handoff.push('- Consolidated data: `fix-requests.json`');
    handoff.push('- Validation commands included in each request');
    handoff.push('');
    
    handoff.push('## 6. VALIDATION PROCESS');
    handoff.push('After implementing each fix:');
    handoff.push('1. Apply recommended changes');
    handoff.push('2. Run validation command from fix request');
    handoff.push('3. Confirm test passes');
    handoff.push('4. Move to next fix');
    handoff.push('');
    
    handoff.push('## 7. ACTION ITEMS FOR EXEC');
    handoff.push('**Immediate Actions Required**:');
    handoff.push('1. Review fix requests in priority order');
    handoff.push('2. Implement fixes following recommendations');
    handoff.push('3. Validate each fix using provided commands');
    handoff.push('4. Report completion status');
    handoff.push('');
    
    handoff.push('**HANDOFF STATUS**: Fix Recommendations Ready - EXEC may proceed');
    handoff.push('');
    handoff.push('---');
    handoff.push('*Generated by LEO Protocol v4.1.3 Enhanced Testing Sub-Agent*');
    
    const handoffContent = handoff.join('\n');
    
    // Save handoff document
    const handoffFile = path.join(this.outputDir, 'EXEC-handoff.md');
    await fs.writeFile(handoffFile, handoffContent);
    console.log(`📋 Handoff document saved: ${handoffFile}`);
    
    return handoffContent;
  }
  
  /**
   * Generate unique request ID
   */
  generateRequestId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 5);
    return `${timestamp}-${random}`;
  }
  
  /**
   * Calculate overall priority
   */
  calculateOverallPriority(fixRequests) {
    const priorities = fixRequests.map(r => r.priority);
    if (priorities.includes('HIGH')) return 'HIGH';
    if (priorities.includes('MEDIUM')) return 'MEDIUM';
    return 'LOW';
  }
  
  /**
   * Calculate total estimated time
   */
  calculateTotalTime(fixRequests) {
    let totalMinutes = 0;
    
    fixRequests.forEach(req => {
      const time = req.recommendation.estimatedTime;
      const match = time.match(/(\d+)-?(\d+)?/);
      if (match) {
        const min = parseInt(match[1]);
        const max = match[2] ? parseInt(match[2]) : min;
        totalMinutes += (min + max) / 2;
      }
    });
    
    if (totalMinutes < 60) {
      return `${totalMinutes} minutes`;
    } else {
      const hours = Math.round(totalMinutes / 60 * 10) / 10;
      return `${hours} hours`;
    }
  }
  
  /**
   * Prioritize fix requests
   */
  prioritizeRequests(fixRequests) {
    return fixRequests.sort((a, b) => {
      const priorityOrder = { 'HIGH': 0, 'MEDIUM': 1, 'LOW': 2, 'UNKNOWN': 3 };
      const aPriority = priorityOrder[a.priority] || 3;
      const bPriority = priorityOrder[b.priority] || 3;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // Secondary sort by confidence
      return b.recommendation.confidence - a.recommendation.confidence;
    });
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    console.log('LEO Protocol v4.1.3 - Fix Request Generator');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/generate-fix-request.js [test-results.json]');
    console.log('');
    console.log('If no file specified, uses default: test-results/automated/reports/automated-test-report.json');
    console.log('');
    console.log('Output:');
    console.log('  - Fix requests in test-results/fix-requests/');
    console.log('  - EXEC handoff document');
    console.log('  - Individual fix request markdowns');
    process.exit(0);
  }
  
  const generator = new FixRequestGenerator();
  
  generator.generateFromTestResults(args[0])
    .then(result => {
      if (result.success) {
        console.log('✅ Fix request generation complete!');
        console.log(`📋 ${result.requests.length} fix requests generated`);
        console.log('📁 Output: test-results/fix-requests/');
        process.exit(0);
      } else {
        console.error('❌ Generation failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 Unexpected error:', error);
      process.exit(1);
    });
}

export default FixRequestGenerator;