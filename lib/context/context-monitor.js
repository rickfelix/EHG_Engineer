#!/usr/bin/env node

/**
 * Context Monitor for Overflow Prevention
 *
 * Monitors content size and provides smart triggers for summarization
 * before context overflow. Works with Claude 4.5 Sonnet's built-in
 * context awareness to prevent overflow proactively.
 *
 * Key Principles:
 * - Claude 4.5 tracks its own token budget (built-in)
 * - We estimate content size and provide warnings
 * - Trigger Memory Tool writes BEFORE hitting limits
 * - Smart summarization for repetitive/verbose content
 *
 * Thresholds:
 * - 150K tokens: WARNING - Consider summarization
 * - 170K tokens: CRITICAL - Summarize immediately
 * - 190K tokens: EMERGENCY - Aggressive compression
 */

import MemoryManager from './memory-manager.js';
import { get_encoding } from 'tiktoken';

class ContextMonitor {
  constructor() {
    this.memory = new MemoryManager();

    // Initialize tiktoken encoder (cl100k_base matches Claude)
    try {
      this.encoder = get_encoding('cl100k_base');
      this.useAccurateCount = true;
    } catch (error) {
      console.warn('⚠️  tiktoken not available, falling back to estimation');
      this.useAccurateCount = false;
      this.CHARS_PER_TOKEN = 4;
    }

    // Thresholds (tokens)
    this.WARNING_THRESHOLD = 150000;    // 75% of 200K
    this.CRITICAL_THRESHOLD = 170000;   // 85% of 200K
    this.EMERGENCY_THRESHOLD = 190000;  // 95% of 200K

    // Base context (from CLAUDE.md imports)
    this.BASE_CONTEXT_TOKENS = 56000;

    // Auto-compaction tracking
    this.toolCallCount = 0;
    this.AUTO_COMPACT_INTERVAL = 5; // Check every 5 tool calls
  }

  /**
   * Count tokens accurately using tiktoken, or estimate if unavailable
   */
  estimateTokens(text) {
    if (!text) return 0;

    if (this.useAccurateCount) {
      try {
        const tokens = this.encoder.encode(text);
        return tokens.length;
      } catch (error) {
        console.warn('⚠️  tiktoken encoding failed, using estimation');
        return Math.ceil(text.length / this.CHARS_PER_TOKEN);
      }
    }

    // Fallback to estimation
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }

  /**
   * Free tiktoken encoder resources
   */
  cleanup() {
    if (this.encoder) {
      this.encoder.free();
    }
  }

  /**
   * Check if content should trigger memory save
   */
  shouldSaveToMemory(content) {
    const tokens = this.estimateTokens(content);

    return {
      shouldSave: tokens > 1000, // Save if content > 1K tokens
      tokens,
      reason: tokens > 1000 ? 'Content exceeds 1K tokens, save to memory' : 'Content is small enough for context'
    };
  }

  /**
   * Track tool call and check if auto-compaction needed
   */
  async onToolCall(toolName, result) {
    this.toolCallCount++;

    // Check every N tool calls
    if (this.toolCallCount % this.AUTO_COMPACT_INTERVAL === 0) {
      const state = await this.memory.readSessionState();
      const analysis = this.analyzeContextUsage(state.raw);

      if (analysis.status === 'CRITICAL' || analysis.status === 'EMERGENCY') {
        console.log(`\n🤖 Auto-Compaction Triggered (${this.toolCallCount} tool calls, ${analysis.status})`);
        await this.autoSummarize('auto-compact');
        return { autoCompacted: true, analysis };
      } else if (analysis.status === 'WARNING') {
        console.log(`\n⚠️  Context Warning (${this.toolCallCount} tool calls, ${analysis.percentUsed}% used)`);
        console.log('   💡 Consider running: npm run context:compact');
        return { autoCompacted: false, analysis, warning: true };
      }
    }

    return { autoCompacted: false };
  }

  /**
   * Analyze current context usage and provide recommendations
   */
  analyzeContextUsage(conversationContent) {
    const conversationTokens = this.estimateTokens(conversationContent);
    const totalEstimated = this.BASE_CONTEXT_TOKENS + conversationTokens;

    const percentUsed = (totalEstimated / 200000) * 100;

    let status, recommendation;

    if (totalEstimated < this.WARNING_THRESHOLD) {
      status = 'HEALTHY';
      recommendation = 'Continue normally. Context usage is healthy.';
    } else if (totalEstimated < this.CRITICAL_THRESHOLD) {
      status = 'WARNING';
      recommendation = 'Consider summarizing verbose content or moving details to memory. (Auto-compact at CRITICAL)';
    } else if (totalEstimated < this.EMERGENCY_THRESHOLD) {
      status = 'CRITICAL';
      recommendation = 'AUTO-COMPACTING: Summarizing immediately. Moving non-essential details to memory.';
    } else {
      status = 'EMERGENCY';
      recommendation = 'EMERGENCY: Aggressive compression in progress. Complete current phase and handoff immediately.';
    }

    return {
      status,
      totalEstimated,
      conversationTokens,
      baseContextTokens: this.BASE_CONTEXT_TOKENS,
      percentUsed: percentUsed.toFixed(1),
      tokensRemaining: 200000 - totalEstimated,
      recommendation,
      method: this.useAccurateCount ? 'tiktoken' : 'estimated'
    };
  }

  /**
   * Smart summarization: Compress sub-agent reports
   * Keeps last 2 reports in full, compresses older ones to 1-line summaries
   */
  summarizeSubAgentReports(reports) {
    if (!Array.isArray(reports) || reports.length === 0) {
      return { summary: 'No reports to summarize', full: [], compressed: [], metadata: {} };
    }

    // Priority order for sub-agents
    const priorityOrder = {
      'Security': 1,
      'Chief Security Architect': 1,
      'Database': 2,
      'Principal Database Architect': 2,
      'Testing': 3,
      'QA Engineering Director': 3
    };

    // Sort by priority (keep high priority reports in full even if older)
    const sortedReports = [...reports].sort((a, b) => {
      const aPriority = priorityOrder[a.agent] || 99;
      const bPriority = priorityOrder[b.agent] || 99;
      return aPriority - bPriority;
    });

    // Keep last 2 reports in full + all high-priority reports
    const recentCount = 2;
    const recentReports = sortedReports.slice(-recentCount);
    const olderReports = sortedReports.slice(0, -recentCount);

    // Separate high-priority older reports
    const highPriorityOlder = olderReports.filter(r => (priorityOrder[r.agent] || 99) <= 3);
    const lowPriorityOlder = olderReports.filter(r => (priorityOrder[r.agent] || 99) > 3);

    // Keep high-priority reports in full
    const fullReports = [...highPriorityOlder, ...recentReports].map(report => ({
      agent: report.agent || 'Unknown',
      status: report.status || 'unknown',
      confidence: report.confidence || 0,
      criticalIssues: (report.critical_issues || []).slice(0, 3), // Top 3 only
      topRecommendation: (report.recommendations || [])[0] || 'None'
    }));

    // Compress low-priority older reports to 1-line summaries
    const compressed = lowPriorityOlder.map(report => ({
      agent: report.agent || 'Unknown',
      status: report.status || 'unknown',
      summary: `${report.agent}: ${report.status}${report.critical_issues?.length ? ' ('+report.critical_issues.length+' critical)' : ''}`,
      timestamp: new Date().toISOString(),
      compressed: true
    }));

    // Generate natural language summary
    const summary = this.generateReportSummary([...fullReports, ...compressed]);

    // Calculate metadata
    const metadata = {
      totalReports: reports.length,
      fullReports: fullReports.length,
      compressedReports: compressed.length,
      tokensSaved: this.estimateTokens(JSON.stringify(reports)) -
                   this.estimateTokens(JSON.stringify([...fullReports, ...compressed])),
      timestamp: new Date().toISOString()
    };

    return {
      summary,
      full: fullReports,
      compressed,
      metadata,
      tokensEstimate: this.estimateTokens(JSON.stringify([...fullReports, ...compressed])),
      compressionRatio: this.calculateCompressionRatio(reports, [...fullReports, ...compressed])
    };
  }

  /**
   * Generate natural language summary from structured data
   */
  generateReportSummary(reports) {
    const passed = reports.filter(r => r.status === 'passed' || r.status === 'pass').length;
    const failed = reports.filter(r => r.status === 'failed' || r.status === 'fail').length;
    const warned = reports.filter(r => r.status === 'warning' || r.status === 'warn').length;

    const criticalAgents = reports
      .filter(r => (r.criticalIssues || []).length > 0)
      .map(r => r.agent);

    let summary = `Sub-Agent Verification: ${passed} passed, ${failed} failed, ${warned} warnings. `;

    if (criticalAgents.length > 0) {
      summary += `Critical issues from: ${criticalAgents.join(', ')}. `;
    } else {
      summary += 'No critical issues detected. ';
    }

    return summary;
  }

  /**
   * Calculate compression ratio
   */
  calculateCompressionRatio(original, compressed) {
    const originalSize = this.estimateTokens(JSON.stringify(original));
    const compressedSize = this.estimateTokens(JSON.stringify(compressed));

    if (originalSize === 0) return 0;

    return ((1 - (compressedSize / originalSize)) * 100).toFixed(1);
  }

  /**
   * Smart handoff preparation: Decide what to keep in context vs memory
   */
  async prepareHandoff(handoffData, currentPhase, nextPhase) {
    const analysis = this.analyzeContextUsage(JSON.stringify(handoffData));

    // If context is healthy, keep everything in handoff
    if (analysis.status === 'HEALTHY') {
      return {
        strategy: 'full-context',
        inContext: handoffData,
        inMemory: null,
        recommendation: 'Context usage is healthy, full handoff can remain in context'
      };
    }

    // If critical/emergency, summarize aggressively
    if (analysis.status === 'CRITICAL' || analysis.status === 'EMERGENCY') {
      // Save full details to memory
      await this.memory.updateSection(`${currentPhase} Full Handoff Details`,
        JSON.stringify(handoffData, null, 2));

      // Create summary for context
      const summary = {
        from: currentPhase,
        to: nextPhase,
        timestamp: new Date().toISOString(),
        summary: this.summarizeHandoff(handoffData),
        fullDetailsLocation: 'Memory: .claude/session-state.md'
      };

      return {
        strategy: 'memory-first',
        inContext: summary,
        inMemory: handoffData,
        recommendation: `Context ${analysis.status}: Full details saved to memory, summary in context`,
        tokensSaved: this.estimateTokens(JSON.stringify(handoffData)) - this.estimateTokens(JSON.stringify(summary))
      };
    }

    // WARNING status: selective compression
    return {
      strategy: 'selective',
      inContext: this.selectiveCompress(handoffData),
      inMemory: null,
      recommendation: 'Context at WARNING level: Compressed verbose sections, keeping critical data'
    };
  }

  /**
   * Summarize handoff data
   */
  summarizeHandoff(handoffData) {
    return {
      completedItems: handoffData.completenessReport?.completed || 0,
      totalItems: handoffData.completenessReport?.total || 0,
      keyDecisions: (handoffData.keyDecisions || []).slice(0, 3),
      criticalIssues: (handoffData.knownIssues || []).filter(i => i.severity === 'critical'),
      nextActions: (handoffData.actionItems || []).slice(0, 5)
    };
  }

  /**
   * Selective compression: Remove verbose sections
   */
  selectiveCompress(data) {
    const compressed = { ...data };

    // Compress arrays to top 5 items
    if (Array.isArray(compressed.recommendations)) {
      compressed.recommendations = compressed.recommendations.slice(0, 5);
    }

    if (Array.isArray(compressed.knownIssues)) {
      // Keep only critical/high severity
      compressed.knownIssues = compressed.knownIssues.filter(
        i => i.severity === 'critical' || i.severity === 'high'
      );
    }

    // Truncate long descriptions
    if (compressed.description && compressed.description.length > 500) {
      compressed.description = compressed.description.substring(0, 500) + '... (see memory for full)';
    }

    return compressed;
  }

  /**
   * Pre-handoff check: Ensure context is ready for handoff
   */
  async preHandoffCheck(currentPhase) {
    console.log(`\n🔍 Pre-Handoff Context Check (${currentPhase})...`);

    // Read current session state
    const state = await this.memory.readSessionState();
    const stateSize = this.estimateTokens(state.raw);

    // Analyze overall context
    const analysis = this.analyzeContextUsage(state.raw);

    console.log(`   Context Status: ${analysis.status}`);
    console.log(`   Estimated Total: ${analysis.totalEstimated.toLocaleString()} tokens`);
    console.log(`   Usage: ${analysis.percentUsed}%`);
    console.log(`   Remaining: ${analysis.tokensRemaining.toLocaleString()} tokens`);

    if (analysis.status === 'CRITICAL' || analysis.status === 'EMERGENCY') {
      console.log(`   ⚠️  ${analysis.recommendation}`);

      // Trigger automatic summarization
      await this.autoSummarize(currentPhase);
    } else if (analysis.status === 'WARNING') {
      console.log(`   💡 ${analysis.recommendation}`);
    } else {
      console.log(`   ✅ ${analysis.recommendation}`);
    }

    return analysis;
  }

  /**
   * Auto-summarize: Triggered on critical/emergency
   */
  async autoSummarize(phase) {
    console.log(`\n🤖 Auto-Summarization Triggered for ${phase} phase...`);

    const state = await this.memory.readSessionState();

    // Create compact summary
    const summary = {
      phase,
      status: 'Completed',
      keyOutcomes: 'See full details in memory',
      timestamp: new Date().toISOString()
    };

    // Update memory with compact version
    await this.memory.updateSection(`${phase} Phase Summary`, JSON.stringify(summary, null, 2));

    console.log('   ✅ Summary saved to memory');
    console.log('   📊 Context compression applied');
  }

  /**
   * CLI display of current context status
   */
  async displayStatus() {
    const state = await this.memory.readSessionState();
    const analysis = this.analyzeContextUsage(state.raw);

    console.log('\n📊 Context Monitor Status\n');
    console.log('='.repeat(50));
    console.log(`Status:           ${this.getStatusEmoji(analysis.status)} ${analysis.status}`);
    console.log(`Total Estimated:  ${analysis.totalEstimated.toLocaleString()} tokens`);
    console.log(`Base Context:     ${analysis.baseContextTokens.toLocaleString()} tokens`);
    console.log(`Conversation:     ${analysis.conversationTokens.toLocaleString()} tokens`);
    console.log(`Usage:            ${analysis.percentUsed}%`);
    console.log(`Remaining:        ${analysis.tokensRemaining.toLocaleString()} tokens`);
    console.log('='.repeat(50));
    console.log(`\n💡 Recommendation:\n   ${analysis.recommendation}\n`);

    return analysis;
  }

  getStatusEmoji(status) {
    const emojis = {
      'HEALTHY': '✅',
      'WARNING': '⚠️',
      'CRITICAL': '🔴',
      'EMERGENCY': '🚨'
    };
    return emojis[status] || '❓';
  }
}

export default ContextMonitor;

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new ContextMonitor();
  monitor.displayStatus();
}