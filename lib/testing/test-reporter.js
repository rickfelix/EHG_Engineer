#!/usr/bin/env node

/**
 * Test Reporter for Vision QA
 * Generates comprehensive narrative reports from test runs
 */

const fs = require('fs').promises;
const path = require('path');

class TestReporter {
  constructor(config = {}) {
    this.config = {
      outputFormat: config.outputFormat || 'markdown', // 'markdown', 'html', 'json'
      includeScreenshots: config.includeScreenshots !== false,
      verbosity: config.verbosity || 'normal', // 'minimal', 'normal', 'detailed'
      ...config
    };
  }

  /**
   * Generate comprehensive narrative report
   */
  async generateNarrativeReport(testData) {
    const report = {
      summary: this.generateSummary(testData),
      timeline: this.generateTimeline(testData),
      bugAnalysis: this.analyzeBugs(testData.bugs),
      actionSequence: this.formatActionSequence(testData.actions),
      costBreakdown: this.calculateCostBreakdown(testData),
      recommendations: this.generateRecommendations(testData),
      metadata: {
        generated: new Date().toISOString(),
        testId: testData.testId,
        appId: testData.appId,
        format: this.config.outputFormat
      }
    };

    // Format based on output type
    switch (this.config.outputFormat) {
      case 'markdown':
        return this.formatAsMarkdown(report, testData);
      case 'html':
        return this.formatAsHTML(report, testData);
      case 'json':
        return report;
      default:
        return this.formatAsMarkdown(report, testData);
    }
  }

  /**
   * Generate executive summary
   */
  generateSummary(testData) {
    const duration = this.calculateDuration(testData);
    const successRate = testData.goalAchieved ? 100 : this.calculatePartialSuccess(testData);
    
    return {
      status: testData.goalAchieved ? 'PASSED' : 'FAILED',
      goal: testData.testGoal,
      iterations: testData.iterations,
      duration: duration,
      successRate: successRate,
      bugsFound: testData.bugs.length,
      totalCost: testData.totalCost.toFixed(3),
      efficiency: this.calculateEfficiency(testData)
    };
  }

  /**
   * Generate chronological timeline
   */
  generateTimeline(testData) {
    const events = [];
    
    // Combine all events
    testData.actions.forEach(action => {
      events.push({
        type: 'action',
        timestamp: action.timestamp,
        description: action.description,
        success: action.result?.success
      });
    });
    
    testData.decisions.forEach(decision => {
      events.push({
        type: 'decision',
        timestamp: decision.timestamp,
        description: `Decided: ${decision.action.type}`,
        confidence: decision.confidence
      });
    });
    
    testData.bugs.forEach(bug => {
      events.push({
        type: 'bug',
        timestamp: bug.timestamp || new Date().toISOString(),
        description: bug.description || bug.type,
        severity: bug.severity
      });
    });
    
    // Sort chronologically
    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    return events;
  }

  /**
   * Analyze bugs found
   */
  analyzeBugs(bugs) {
    if (!bugs || bugs.length === 0) {
      return { count: 0, categories: {}, severity: {} };
    }
    
    const categories = {};
    const severity = {};
    
    bugs.forEach(bug => {
      // Categorize
      const category = bug.type || 'uncategorized';
      categories[category] = (categories[category] || 0) + 1;
      
      // Severity
      const sev = bug.severity || 'low';
      severity[sev] = (severity[sev] || 0) + 1;
    });
    
    return {
      count: bugs.length,
      categories,
      severity,
      critical: severity.high || 0,
      details: bugs
    };
  }

  /**
   * Format action sequence
   */
  formatActionSequence(actions) {
    return actions.map((action, index) => ({
      step: index + 1,
      type: action.type,
      selector: action.selector,
      value: action.value,
      description: action.description,
      duration: action.duration,
      success: action.result?.success,
      error: action.result?.error
    }));
  }

  /**
   * Calculate cost breakdown
   */
  calculateCostBreakdown(testData) {
    const breakdown = {
      total: testData.totalCost,
      perIteration: testData.totalCost / testData.iterations,
      perAction: testData.totalCost / testData.actions.length,
      byProvider: {}
    };
    
    // Group by provider if available
    testData.decisions.forEach(decision => {
      const provider = decision.provider || 'unknown';
      breakdown.byProvider[provider] = (breakdown.byProvider[provider] || 0) + (decision.cost || 0);
    });
    
    return breakdown;
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(testData) {
    const recommendations = [];
    
    // Performance recommendations
    if (testData.iterations > 30) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: 'Test required many iterations. Consider optimizing selectors or page load times.'
      });
    }
    
    // Cost recommendations
    if (testData.totalCost > 2.0) {
      recommendations.push({
        type: 'cost',
        priority: 'high',
        message: 'High API costs detected. Consider using local models for some operations.'
      });
    }
    
    // Bug recommendations
    if (testData.bugs.length > 5) {
      recommendations.push({
        type: 'quality',
        priority: 'high',
        message: 'Multiple bugs detected. Application needs stability improvements.'
      });
    }
    
    // Confidence recommendations
    const avgConfidence = this.calculateAverageConfidence(testData.decisions);
    if (avgConfidence < 0.7) {
      recommendations.push({
        type: 'reliability',
        priority: 'medium',
        message: 'Low average confidence in decisions. UI elements may be ambiguous.'
      });
    }
    
    return recommendations;
  }

  /**
   * Format report as Markdown
   */
  formatAsMarkdown(report, testData) {
    let markdown = `# Vision QA Test Report

## Executive Summary

- **Status**: ${report.summary.status}
- **Test Goal**: ${report.summary.goal || testData.testGoal}
- **Duration**: ${report.summary.duration}ms
- **Iterations**: ${report.summary.iterations}
- **Success Rate**: ${report.summary.successRate}%
- **Bugs Found**: ${report.summary.bugsFound}
- **Total Cost**: $${report.summary.totalCost}

## Timeline

\`\`\`
${this.formatTimelineAsText(report.timeline)}
\`\`\`

## Bug Analysis

### Summary
- Total Bugs: ${report.bugAnalysis.count}
- Critical Bugs: ${report.bugAnalysis.critical}

### Categories
${Object.entries(report.bugAnalysis.categories).map(([cat, count]) => 
  `- ${cat}: ${count}`).join('\n')}

### Severity Distribution
${Object.entries(report.bugAnalysis.severity).map(([sev, count]) => 
  `- ${sev}: ${count}`).join('\n')}

## Action Sequence

${report.actionSequence.map(action => 
  `${action.step}. **${action.type}** - ${action.description}
   - Duration: ${action.duration}ms
   - Success: ${action.success ? '✅' : '❌'}
   ${action.error ? `- Error: ${action.error}` : ''}`
).join('\n\n')}

## Cost Analysis

- **Total Cost**: $${report.costBreakdown.total.toFixed(3)}
- **Per Iteration**: $${report.costBreakdown.perIteration.toFixed(3)}
- **Per Action**: $${report.costBreakdown.perAction.toFixed(3)}

### By Provider
${Object.entries(report.costBreakdown.byProvider).map(([provider, cost]) => 
  `- ${provider}: $${cost.toFixed(3)}`).join('\n')}

## Recommendations

${report.recommendations.map(rec => 
  `### ${rec.priority.toUpperCase()}: ${rec.type}
${rec.message}`).join('\n\n')}

## Metadata

- **Test ID**: ${report.metadata.testId}
- **Application**: ${report.metadata.appId}
- **Generated**: ${report.metadata.generated}
- **Report Format**: ${report.metadata.format}

---
*Generated by Vision QA Agent - LEO Protocol v3.1.5*`;

    return markdown;
  }

  /**
   * Format report as HTML
   */
  formatAsHTML(report, testData) {
    return `<!DOCTYPE html>
<html>
<head>
  <title>Vision QA Report - ${testData.testId}</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .status-passed { color: #22c55e; }
    .status-failed { color: #ef4444; }
    .timeline { background: #1e293b; color: #e2e8f0; padding: 15px; border-radius: 4px; font-family: monospace; }
    .bug { background: #fef2f2; border-left: 4px solid #ef4444; padding: 10px; margin: 10px 0; }
    .recommendation { background: #fefce8; border-left: 4px solid #eab308; padding: 10px; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <h1>Vision QA Test Report</h1>
  
  <div class="summary">
    <h2 class="status-${report.summary.status.toLowerCase()}">${report.summary.status}</h2>
    <p><strong>Goal:</strong> ${report.summary.goal || testData.testGoal}</p>
    <p><strong>Duration:</strong> ${report.summary.duration}ms | <strong>Iterations:</strong> ${report.summary.iterations}</p>
    <p><strong>Success Rate:</strong> ${report.summary.successRate}% | <strong>Bugs:</strong> ${report.summary.bugsFound}</p>
    <p><strong>Total Cost:</strong> $${report.summary.totalCost}</p>
  </div>
  
  <h2>Timeline</h2>
  <div class="timeline">
    <pre>${this.formatTimelineAsText(report.timeline)}</pre>
  </div>
  
  <h2>Bug Analysis</h2>
  ${report.bugAnalysis.details.map(bug => 
    `<div class="bug">
      <strong>${bug.type}</strong>: ${bug.description}
      <br>Severity: ${bug.severity}
    </div>`
  ).join('')}
  
  <h2>Recommendations</h2>
  ${report.recommendations.map(rec => 
    `<div class="recommendation">
      <strong>${rec.priority.toUpperCase()}</strong>: ${rec.message}
    </div>`
  ).join('')}
  
  <footer>
    <p>Generated: ${report.metadata.generated}</p>
    <p>Test ID: ${report.metadata.testId} | App: ${report.metadata.appId}</p>
  </footer>
</body>
</html>`;
  }

  /**
   * Format timeline as text
   */
  formatTimelineAsText(timeline) {
    return timeline.map(event => {
      const time = new Date(event.timestamp).toLocaleTimeString();
      const icon = event.type === 'action' ? '🎯' : 
                   event.type === 'decision' ? '🤔' : 
                   event.type === 'bug' ? '🐛' : '📝';
      return `${time} ${icon} ${event.description}`;
    }).join('\n');
  }

  /**
   * Calculate test duration
   */
  calculateDuration(testData) {
    if (testData.actions.length === 0) return 0;
    
    const start = new Date(testData.actions[0].timestamp);
    const end = new Date(testData.actions[testData.actions.length - 1].timestamp);
    
    return end - start;
  }

  /**
   * Calculate partial success rate
   */
  calculatePartialSuccess(testData) {
    const successfulActions = testData.actions.filter(a => a.result?.success).length;
    const totalActions = testData.actions.length;
    
    return totalActions > 0 ? Math.round((successfulActions / totalActions) * 100) : 0;
  }

  /**
   * Calculate efficiency score
   */
  calculateEfficiency(testData) {
    // Lower iterations and cost = higher efficiency
    const iterationScore = Math.max(0, 100 - (testData.iterations * 2));
    const costScore = Math.max(0, 100 - (testData.totalCost * 20));
    
    return Math.round((iterationScore + costScore) / 2);
  }

  /**
   * Calculate average confidence
   */
  calculateAverageConfidence(decisions) {
    if (!decisions || decisions.length === 0) return 0;
    
    const totalConfidence = decisions.reduce((sum, d) => sum + (d.confidence || 0), 0);
    return totalConfidence / decisions.length;
  }

  /**
   * Save report to file
   */
  async saveReport(report, outputPath) {
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    
    const content = typeof report === 'string' ? report : JSON.stringify(report, null, 2);
    await fs.writeFile(outputPath, content, 'utf8');
    
    console.log(`📄 Report saved to: ${outputPath}`);
    return outputPath;
  }

  /**
   * Generate comparison report between multiple runs
   */
  async generateComparisonReport(runs) {
    const comparison = {
      runCount: runs.length,
      consistency: this.calculateConsistency(runs),
      averageIterations: this.average(runs.map(r => r.iterations)),
      averageCost: this.average(runs.map(r => r.totalCost)),
      averageDuration: this.average(runs.map(r => this.calculateDuration(r))),
      commonBugs: this.findCommonBugs(runs),
      successRate: runs.filter(r => r.goalAchieved).length / runs.length * 100
    };
    
    return comparison;
  }

  /**
   * Calculate consistency between runs
   */
  calculateConsistency(runs) {
    if (runs.length < 2) return 100;
    
    // Compare action sequences
    const sequences = runs.map(r => r.actions.map(a => a.type).join(','));
    const uniqueSequences = new Set(sequences).size;
    
    return Math.round((1 - (uniqueSequences - 1) / runs.length) * 100);
  }

  /**
   * Find bugs common across runs
   */
  findCommonBugs(runs) {
    const bugCounts = {};
    
    runs.forEach(run => {
      run.bugs.forEach(bug => {
        const key = `${bug.type}-${bug.description}`;
        bugCounts[key] = (bugCounts[key] || 0) + 1;
      });
    });
    
    // Find bugs present in majority of runs
    const threshold = runs.length / 2;
    return Object.entries(bugCounts)
      .filter(([_, count]) => count >= threshold)
      .map(([bug, count]) => ({ bug, frequency: count / runs.length }));
  }

  /**
   * Calculate average
   */
  average(numbers) {
    if (numbers.length === 0) return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }
}

module.exports = TestReporter;