#!/usr/bin/env node

/**
 * Handoff System with Integrated Overflow Prevention
 *
 * Wraps the existing handoff system with smart overflow prevention.
 * Automatically monitors context usage and applies compression when needed.
 *
 * Usage:
 *   import { createSmartHandoff } from './lib/context/handoff-with-overflow-prevention.js';
 *
 *   const handoff = await createSmartHandoff('LEAD', 'PLAN', 'SD-2025-001', {
 *     executiveSummary: '...',
 *     completenessReport: { ... },
 *     ...
 *   });
 */

import ContextMonitor from './context-monitor.js';
import MemoryManager from './memory-manager.js';

class SmartHandoffManager {
  constructor() {
    this.monitor = new ContextMonitor();
    this.memory = new MemoryManager();
  }

  /**
   * Create handoff with automatic overflow prevention
   */
  async createSmartHandoff(fromAgent, toAgent, sdId, handoffData) {
    console.log(`\n🤝 Creating Smart Handoff: ${fromAgent} → ${toAgent}`);

    // Step 1: Pre-handoff context check
    const contextStatus = await this.monitor.preHandoffCheck(fromAgent);

    // Step 2: Prepare handoff based on context status
    const prepared = await this.monitor.prepareHandoff(handoffData, fromAgent, toAgent);

    console.log(`   Strategy: ${prepared.strategy}`);

    if (prepared.tokensSaved) {
      console.log(`   💾 Tokens saved: ${prepared.tokensSaved.toLocaleString()}`);
    }

    // Step 3: Update memory with phase completion
    await this.memory.completePhase(
      fromAgent,
      prepared.inContext.summary || 'Handoff completed'
    );

    // Step 4: Return handoff package
    return {
      from: fromAgent,
      to: toAgent,
      sdId,
      timestamp: new Date().toISOString(),
      contextStatus: contextStatus.status,
      strategy: prepared.strategy,
      handoffData: prepared.inContext,
      fullDetailsInMemory: prepared.strategy === 'memory-first',
      recommendation: prepared.recommendation
    };
  }

  /**
   * Validate handoff with context awareness
   */
  async validateHandoff(handoff) {
    const required = [
      'executiveSummary',
      'completenessReport',
      'deliverablesManifest',
      'keyDecisions',
      'knownIssues',
      'resourceUtilization',
      'actionItems'
    ];

    const missing = required.filter(field => !handoff[field]);

    if (missing.length > 0) {
      return {
        valid: false,
        errors: missing.map(f => `Missing required field: ${f}`),
        recommendation: 'Add missing fields before creating handoff'
      };
    }

    // Check if handoff is too large
    const tokens = this.monitor.estimateTokens(JSON.stringify(handoff));

    if (tokens > 10000) {
      return {
        valid: true,
        warnings: [`Handoff is large (${tokens} tokens). Consider summarization.`],
        recommendation: 'Handoff is valid but large. Automatic compression will apply if context is critical.'
      };
    }

    return {
      valid: true,
      warnings: [],
      recommendation: 'Handoff is valid and appropriately sized'
    };
  }

  /**
   * Process sub-agent reports with smart summarization
   */
  async processSubAgentReports(reports) {
    console.log(`\n🤖 Processing ${reports.length} sub-agent reports...`);

    // Check context status
    const contextStatus = await this.monitor.displayStatus();

    // If context is healthy, keep full reports
    if (contextStatus.status === 'HEALTHY') {
      console.log(`   ✅ Context healthy - keeping full reports`);
      return {
        strategy: 'full',
        reports: reports
      };
    }

    // Otherwise, summarize
    console.log(`   🗜️ Context ${contextStatus.status} - applying summarization`);
    const summarized = this.monitor.summarizeSubAgentReports(reports);

    // Save full reports to memory
    await this.memory.updateSection('Sub-Agent Full Reports',
      JSON.stringify(reports, null, 2));

    console.log(`   💾 Full reports saved to memory`);
    console.log(`   📊 Compression: ${summarized.compressionRatio}%`);

    return {
      strategy: 'summarized',
      summary: summarized.summary,
      reports: summarized.full,
      compressionRatio: summarized.compressionRatio,
      fullReportsInMemory: true
    };
  }
}

// Export convenience functions
export async function createSmartHandoff(fromAgent, toAgent, sdId, handoffData) {
  const manager = new SmartHandoffManager();
  return await manager.createSmartHandoff(fromAgent, toAgent, sdId, handoffData);
}

export async function validateHandoff(handoff) {
  const manager = new SmartHandoffManager();
  return await manager.validateHandoff(handoff);
}

export async function processSubAgentReports(reports) {
  const manager = new SmartHandoffManager();
  return await manager.processSubAgentReports(reports);
}

export default SmartHandoffManager;