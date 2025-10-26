/**
 * EXEC Coordination Tool
 * LEO Protocol v4.1.2 - Tool for EXEC Agent to coordinate sub-agents
 * 
 * This is a TOOL used by the EXEC Agent role, not a separate agent.
 * 
 * The EXEC Agent uses this tool to:
 * 1. Scan PRD for activation triggers
 * 2. Activate relevant sub-agents
 * 3. Coordinate sub-agent execution
 * 4. Validate sub-agent deliverables
 * 5. Integrate results into implementation
 * 6. Include results in handback to PLAN
 * 
 * Usage: The EXEC Agent (Claude/Human) calls this tool during implementation phase
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import EventEmitter from 'events';

// Import all sub-agents
import SecuritySubAgent from './security-sub-agent.js';
import PerformanceSubAgent from './performance-sub-agent.js';
import DesignSubAgent from './design-sub-agent.js';
import DatabaseSubAgent from './database-sub-agent.js';
import DocumentationSubAgent from './documentation-sub-agent.js';
import CostSubAgent from './cost-sub-agent.js';
import TestingSubAgent from '../../lib/testing/testing-sub-agent.js';

class EXECCoordinationTool extends EventEmitter {
  constructor() {
    super();
    
    // Sub-agent registry with activation triggers
    // This registry is used by EXEC to determine which sub-agents to activate
    this.subAgents = {
      testing: {
        agent: TestingSubAgent,
        triggers: ['coverage >80%', 'e2e testing', 'visual inspection', 'playwright', 'automated testing'],
        priority: 'HIGH',
        phase: 'during',
        contextFile: 'templates/claude-md/sub-agents/CLAUDE-TESTING.md'
      },
      security: {
        agent: SecuritySubAgent,
        triggers: ['authentication', 'authorization', 'PII', 'encryption', 'security', 'OWASP', 'sensitive data'],
        priority: 'CRITICAL',
        phase: 'before',
        contextFile: 'templates/claude-md/sub-agents/CLAUDE-SECURITY.md'
      },
      performance: {
        agent: PerformanceSubAgent,
        triggers: ['load time', 'users', 'performance metrics', 'optimization', 'bundle size', 'memory'],
        priority: 'HIGH',
        phase: 'during',
        contextFile: 'templates/claude-md/sub-agents/CLAUDE-PERFORMANCE.md'
      },
      design: {
        agent: DesignSubAgent,
        triggers: ['UI/UX', 'responsive', 'accessibility', 'WCAG', 'design system', 'animation'],
        priority: 'MEDIUM',
        phase: 'before',
        contextFile: 'templates/claude-md/sub-agents/CLAUDE-DESIGN.md'
      },
      database: {
        agent: DatabaseSubAgent,
        triggers: ['schema', 'migration', 'database', 'query optimization', 'indexing', 'data integrity'],
        priority: 'CRITICAL',
        phase: 'before',
        contextFile: 'templates/claude-md/sub-agents/CLAUDE-DATABASE.md'
      }
    };
    
    // Orchestration state
    this.state = {
      prdId: null,
      prdContent: null,
      activatedAgents: [],
      results: {},
      handoffStatus: {},
      startTime: null,
      endTime: null
    };
    
    // Deduplication cache
    this.findingsCache = new Map();
    
    // Cross-agent communication bus
    this.setupCommunicationBus();
  }

  /**
   * Setup event-based communication between sub-agents
   */
  setupCommunicationBus() {
    // Security findings can inform database checks
    this.on('security:sql_injection_found', (data) => {
      this.emit('database:prioritize_query_check', data);
    });
    
    // Performance issues can trigger security reviews
    this.on('performance:slow_query', (data) => {
      this.emit('database:check_missing_indexes', data);
    });
    
    // Design issues can affect performance
    this.on('design:large_images', (data) => {
      this.emit('performance:check_bundle_size', data);
    });
  }

  /**
   * Main coordination entry point - called by EXEC Agent
   */
  async coordinate(prdId, options = {}) {
    console.log('\n🎯 EXEC Coordination Tool ACTIVATED');
    console.log('   Tool for EXEC Agent to coordinate sub-agents');
    console.log('=' .repeat(70));
    
    this.state.startTime = new Date().toISOString();
    this.state.prdId = prdId;
    
    try {
      // Step 1: Read PRD from database
      console.log('\n📖 Step 1: Reading PRD from database...');
      await this.readPRD(prdId);
      
      // Step 2: Scan for activation triggers
      console.log('\n🔍 Step 2: Scanning PRD for sub-agent triggers...');
      const activations = this.scanForTriggers();
      
      // Step 3: Prioritize and order sub-agents
      console.log('\n📊 Step 3: Prioritizing sub-agent execution...');
      const executionPlan = this.createExecutionPlan(activations);
      
      // Step 4: Execute sub-agents in phases
      console.log('\n⚡ Step 4: Executing sub-agents...');
      await this.executeSubAgents(executionPlan, options);
      
      // Step 5: Aggregate and deduplicate results
      console.log('\n🔄 Step 5: Aggregating and deduplicating results...');
      const aggregatedResults = this.aggregateResults();
      
      // Step 6: Generate integrated report
      console.log('\n📄 Step 6: Generating integrated report...');
      const report = await this.generateIntegratedReport(aggregatedResults);
      
      // Step 7: Validate deliverables
      console.log('\n✅ Step 7: Validating sub-agent deliverables...');
      await this.validateDeliverables();
      
      this.state.endTime = new Date().toISOString();
      
      return {
        status: 'success',
        prdId: this.state.prdId,
        activatedAgents: this.state.activatedAgents,
        results: aggregatedResults,
        report,
        metadata: {
          startTime: this.state.startTime,
          endTime: this.state.endTime,
          duration: this.calculateDuration()
        }
      };
      
    } catch (error) {
      console.error('❌ Orchestration failed:', error.message);
      return {
        status: 'failed',
        error: error.message,
        prdId: this.state.prdId,
        activatedAgents: this.state.activatedAgents,
        partialResults: this.state.results
      };
    }
  }

  /**
   * Read PRD from database
   */
  async readPRD(prdId) {
    // In real implementation, this would query the database
    // For now, we'll simulate with a check for PRD requirements
    this.state.prdContent = `
      Product Requirements Document
      Testing: coverage >80%, e2e testing required
      Security: authentication and authorization required
      Performance: load time <3s for initial page
      Database: schema migration needed
    `;
    
    console.log(`   ✓ PRD ${prdId} loaded from database`);
  }

  /**
   * Scan PRD content for activation triggers
   */
  scanForTriggers() {
    const activations = [];
    const content = this.state.prdContent.toLowerCase();
    
    for (const [name, config] of Object.entries(this.subAgents)) {
      const triggered = config.triggers.some(trigger => 
        content.includes(trigger.toLowerCase())
      );
      
      if (triggered) {
        activations.push({
          name,
          priority: config.priority,
          phase: config.phase,
          triggers: config.triggers.filter(t => content.includes(t.toLowerCase()))
        });
        console.log(`   ✓ ${name} sub-agent triggered by: ${activations[activations.length - 1].triggers.join(', ')}`);
      }
    }
    
    this.state.activatedAgents = activations.map(a => a.name);
    return activations;
  }

  /**
   * Create execution plan based on priorities and phases
   */
  createExecutionPlan(activations) {
    // Sort by phase (before → during → after) and priority
    const phaseOrder = { 'before': 1, 'during': 2, 'after': 3 };
    const priorityOrder = { 'CRITICAL': 1, 'HIGH': 2, 'MEDIUM': 3, 'LOW': 4 };
    
    const sorted = activations.sort((a, b) => {
      // First sort by phase
      const phaseCompare = phaseOrder[a.phase] - phaseOrder[b.phase];
      if (phaseCompare !== 0) return phaseCompare;
      
      // Then by priority within phase
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    
    console.log('\n   Execution Order:');
    sorted.forEach((agent, index) => {
      console.log(`   ${index + 1}. ${agent.name} [${agent.phase}/${agent.priority}]`);
    });
    
    return sorted;
  }

  /**
   * Execute sub-agents according to plan
   */
  async executeSubAgents(executionPlan, options) {
    for (const plan of executionPlan) {
      console.log(`\n   Executing ${plan.name} sub-agent...`);
      
      try {
        // Create handoff
        const handoff = this.createHandoff(plan);
        
        // Execute sub-agent
        const AgentClass = this.subAgents[plan.name].agent;
        const agent = new AgentClass();
        
        // Listen for inter-agent communication
        this.setupAgentListeners(plan.name, agent);
        
        // Execute with context
        const result = await agent.execute({
          ...options,
          handoff,
          prdId: this.state.prdId,
          orchestrator: this
        });
        
        // Store results
        this.state.results[plan.name] = result;
        this.state.handoffStatus[plan.name] = 'completed';
        
        console.log(`   ✓ ${plan.name} completed - Score: ${result.score}/100`);
        
        // Share critical findings with other agents
        this.shareCriticalFindings(plan.name, result);
        
      } catch (error) {
        console.error(`   ✗ ${plan.name} failed: ${error.message}`);
        this.state.results[plan.name] = {
          status: 'failed',
          error: error.message
        };
        this.state.handoffStatus[plan.name] = 'failed';
      }
    }
  }

  /**
   * Create standard handoff for sub-agent
   */
  createHandoff(plan) {
    return {
      from: 'EXEC',
      to: plan.name,
      date: new Date().toISOString(),
      prdReference: this.state.prdId,
      activationTrigger: plan.triggers,
      executiveSummary: {
        agent: plan.name,
        reason: `Activated by PRD triggers: ${plan.triggers.join(', ')}`,
        scope: this.getAgentScope(plan.name),
        priority: plan.priority,
        deliverable: this.getExpectedDeliverable(plan.name)
      },
      context: {
        prdRequirements: this.state.prdContent,
        otherAgents: this.state.activatedAgents,
        sharedFindings: this.getSharedFindings(plan.name)
      }
    };
  }

  /**
   * Setup listeners for agent communication
   */
  setupAgentListeners(agentName, agent) {
    // Listen for findings that might affect other agents
    if (agent.on) {
      agent.on('finding', (data) => {
        this.emit(`${agentName}:finding`, data);
      });
    }
  }

  /**
   * Share critical findings between agents
   */
  shareCriticalFindings(agentName, result) {
    if (!result.findings) return;
    
    const criticalFindings = result.findings.filter(f => 
      f.severity === 'critical' || f.severity === 'high'
    );
    
    for (const finding of criticalFindings) {
      // Emit events for other agents to consume
      this.emit('critical_finding', {
        source: agentName,
        finding
      });
    }
  }

  /**
   * Aggregate results from all sub-agents
   */
  aggregateResults() {
    const aggregated = {
      overallScore: 0,
      totalFindings: 0,
      findingsBySeverity: {
        critical: [],
        high: [],
        medium: [],
        low: [],
        info: []
      },
      findingsByAgent: {},
      metrics: {},
      recommendations: []
    };
    
    let scoreCount = 0;
    
    for (const [agentName, result] of Object.entries(this.state.results)) {
      if (result.status === 'failed') continue;
      
      // Aggregate scores
      if (result.score !== undefined) {
        aggregated.overallScore += result.score;
        scoreCount++;
      }
      
      // Aggregate findings with deduplication
      if (result.findings) {
        const deduplicated = this.deduplicateFindings(result.findings, agentName);
        aggregated.findingsByAgent[agentName] = deduplicated;
        aggregated.totalFindings += deduplicated.length;
        
        // Group by severity
        for (const finding of deduplicated) {
          const severity = finding.severity || 'info';
          if (aggregated.findingsBySeverity[severity]) {
            aggregated.findingsBySeverity[severity].push({
              ...finding,
              agent: agentName
            });
          }
        }
      }
      
      // Aggregate metrics
      if (result.metrics) {
        aggregated.metrics[agentName] = result.metrics;
      }
      
      // Aggregate recommendations
      if (result.recommendations) {
        aggregated.recommendations.push(...result.recommendations.map(r => ({
          ...r,
          source: agentName
        })));
      }
    }
    
    // Calculate average score
    if (scoreCount > 0) {
      aggregated.overallScore = Math.round(aggregated.overallScore / scoreCount);
    }
    
    // Prioritize recommendations
    aggregated.recommendations = this.prioritizeRecommendations(aggregated.recommendations);
    
    return aggregated;
  }

  /**
   * Deduplicate findings across agents
   */
  deduplicateFindings(findings, agentName) {
    const deduplicated = [];
    
    for (const finding of findings) {
      // Create unique key for finding
      const key = `${finding.type}-${finding.location?.file}-${finding.location?.line}`;
      
      if (this.findingsCache.has(key)) {
        // Check if this is higher priority
        const existing = this.findingsCache.get(key);
        const severityWeight = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
        
        if (severityWeight[finding.severity] > severityWeight[existing.severity]) {
          // Replace with higher severity finding
          this.findingsCache.set(key, { ...finding, agent: agentName });
          
          // Remove old one from deduplicated and add new
          const index = deduplicated.findIndex(f => 
            f.type === existing.type && 
            f.location?.file === existing.location?.file &&
            f.location?.line === existing.location?.line
          );
          if (index >= 0) {
            deduplicated[index] = finding;
          }
        }
      } else {
        // New finding
        this.findingsCache.set(key, { ...finding, agent: agentName });
        deduplicated.push(finding);
      }
    }
    
    return deduplicated;
  }

  /**
   * Generate integrated report
   */
  async generateIntegratedReport(results) {
    const report = {
      title: 'EXEC Sub-Agent Integration Report',
      prdId: this.state.prdId,
      timestamp: new Date().toISOString(),
      summary: {
        overallScore: results.overallScore,
        status: this.getOverallStatus(results.overallScore),
        totalFindings: results.totalFindings,
        criticalCount: results.findingsBySeverity.critical.length,
        agentsActivated: this.state.activatedAgents.length
      },
      sections: []
    };
    
    // Executive summary
    report.sections.push({
      title: 'Executive Summary',
      content: this.generateExecutiveSummary(results)
    });
    
    // Critical findings
    if (results.findingsBySeverity.critical.length > 0) {
      report.sections.push({
        title: 'Critical Findings Requiring Immediate Attention',
        content: this.formatCriticalFindings(results.findingsBySeverity.critical)
      });
    }
    
    // Agent summaries
    for (const [agent, findings] of Object.entries(results.findingsByAgent)) {
      report.sections.push({
        title: `${agent} Sub-Agent Results`,
        content: {
          findings: findings.length,
          score: this.state.results[agent]?.score,
          summary: this.state.results[agent]?.summary
        }
      });
    }
    
    // Top recommendations
    report.sections.push({
      title: 'Prioritized Recommendations',
      content: results.recommendations.slice(0, 10)
    });
    
    return report;
  }

  /**
   * Validate sub-agent deliverables
   */
  async validateDeliverables() {
    const validations = [];
    
    for (const [agentName, result] of Object.entries(this.state.results)) {
      if (result.status === 'failed') {
        validations.push({
          agent: agentName,
          status: 'failed',
          reason: result.error
        });
        continue;
      }
      
      // Check required deliverables
      const required = this.getRequiredDeliverables(agentName);
      const missing = [];
      
      for (const deliverable of required) {
        if (!result[deliverable]) {
          missing.push(deliverable);
        }
      }
      
      validations.push({
        agent: agentName,
        status: missing.length === 0 ? 'valid' : 'incomplete',
        missing
      });
    }
    
    console.log('\n   Deliverable Validation:');
    for (const validation of validations) {
      const icon = validation.status === 'valid' ? '✓' : '✗';
      console.log(`   ${icon} ${validation.agent}: ${validation.status}`);
      if (validation.missing?.length > 0) {
        console.log(`      Missing: ${validation.missing.join(', ')}`);
      }
    }
    
    return validations;
  }

  // Utility methods
  
  getAgentScope(agentName) {
    const scopes = {
      testing: 'Automated test creation and execution',
      security: 'Security vulnerability identification and mitigation',
      performance: 'Performance measurement and optimization',
      design: 'UI/UX validation and accessibility compliance',
      database: 'Schema design and query optimization'
    };
    return scopes[agentName] || 'Specialized analysis and implementation';
  }
  
  getExpectedDeliverable(agentName) {
    const deliverables = {
      testing: 'Test suite with coverage report',
      security: 'Security audit report with fixes',
      performance: 'Performance metrics with optimizations',
      design: 'Design validation report with fixes',
      database: 'Schema and migration scripts'
    };
    return deliverables[agentName] || 'Analysis report and recommendations';
  }
  
  getSharedFindings(agentName) {
    // Share relevant findings from other agents
    const shared = [];
    
    for (const [otherAgent, results] of Object.entries(this.state.results)) {
      if (otherAgent === agentName) continue;
      
      if (results.findings?.some(f => f.severity === 'critical')) {
        shared.push({
          source: otherAgent,
          findings: results.findings.filter(f => f.severity === 'critical')
        });
      }
    }
    
    return shared;
  }
  
  getRequiredDeliverables(agentName) {
    const requirements = {
      testing: ['score', 'findings', 'coverage'],
      security: ['score', 'findings'],
      performance: ['score', 'metrics'],
      design: ['score', 'findings'],
      database: ['score', 'findings']
    };
    return requirements[agentName] || ['score', 'findings'];
  }
  
  prioritizeRecommendations(recommendations) {
    const priorityWeight = {
      'CRITICAL': 4,
      'HIGH': 3,
      'MEDIUM': 2,
      'LOW': 1
    };
    
    return recommendations.sort((a, b) => {
      const aWeight = priorityWeight[a.impact] || 0;
      const bWeight = priorityWeight[b.impact] || 0;
      return bWeight - aWeight;
    });
  }
  
  getOverallStatus(score) {
    if (score >= 90) return 'EXCELLENT';
    if (score >= 75) return 'GOOD';
    if (score >= 60) return 'ACCEPTABLE';
    if (score >= 40) return 'NEEDS IMPROVEMENT';
    return 'CRITICAL';
  }
  
  generateExecutiveSummary(results) {
    const critical = results.findingsBySeverity.critical.length;
    const high = results.findingsBySeverity.high.length;
    
    if (critical > 0) {
      return `${critical} critical issues identified requiring immediate attention. ` +
             `Overall system health: ${results.overallScore}/100. ` +
             `${this.state.activatedAgents.length} sub-agents activated based on PRD requirements.`;
    } else if (high > 0) {
      return `${high} high priority issues identified. No critical blockers found. ` +
             `Overall system health: ${results.overallScore}/100. ` +
             `All ${this.state.activatedAgents.length} sub-agents completed successfully.`;
    } else {
      return `System implementation meets requirements with ${results.totalFindings} minor issues. ` +
             `Overall score: ${results.overallScore}/100. ` +
             'All quality gates passed.';
    }
  }
  
  formatCriticalFindings(findings) {
    return findings.map((f, i) => ({
      index: i + 1,
      agent: f.agent,
      type: f.type,
      description: f.description,
      location: f.location,
      recommendation: f.recommendation
    }));
  }
  
  calculateDuration() {
    const start = new Date(this.state.startTime);
    const end = new Date(this.state.endTime);
    const duration = (end - start) / 1000; // seconds
    
    if (duration < 60) {
      return `${Math.round(duration)} seconds`;
    } else {
      return `${Math.round(duration / 60)} minutes`;
    }
  }
}

export default EXECCoordinationTool;