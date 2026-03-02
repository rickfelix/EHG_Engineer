#!/usr/bin/env node

/**
 * LEO Protocol v4.1 - Agent Behavior Enhancement System
 * Integrates personas, tool patterns, and collaboration for maximum effectiveness
 */

import fsModule from 'fs';
const _fs = fsModule.promises;
import _path from 'path';
import AgentCollaborationEngine from './collaboration-engine';

class AgentBehaviorSystem {
  constructor() {
    this.collaborationEngine = new AgentCollaborationEngine();
    this.behaviorProfiles = new Map();
    this.toolOptimizations = new Map();
    this.performanceMetrics = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the behavior system
   */
  async initialize() {
    console.log('🚀 Initializing Agent Behavior Enhancement System...');
    
    try {
      // Initialize collaboration engine
      await this.collaborationEngine.initialize();
      
      // Load all behavior profiles
      await this.loadBehaviorProfiles();
      
      // Initialize tool optimization patterns
      await this.initializeToolPatterns();
      
      // Set up performance tracking
      this.setupPerformanceTracking();
      
      this.initialized = true;
      console.log('✅ Agent Behavior System ready for maximum effectiveness');
      
    } catch (error) {
      console.error('❌ Failed to initialize behavior system:', error);
      throw error;
    }
  }

  /**
   * Load behavior profiles for all agents
   */
  async loadBehaviorProfiles() {
    const profiles = {
      'LEAD': {
        workStyle: 'strategic-visionary',
        decisionSpeed: 'deliberate',
        communicationFrequency: 'periodic-updates',
        toolPreference: 'research-heavy',
        collaborationStyle: 'directive-supportive'
      },
      'PLAN': {
        workStyle: 'methodical-thorough',
        decisionSpeed: 'analytical',
        communicationFrequency: 'detailed-updates',
        toolPreference: 'analysis-heavy',
        collaborationStyle: 'consultative'
      },
      'EXEC': {
        workStyle: 'action-oriented',
        decisionSpeed: 'rapid',
        communicationFrequency: 'milestone-based',
        toolPreference: 'execution-heavy',
        collaborationStyle: 'independent-collaborative'
      },
      'TESTING': {
        workStyle: 'skeptical-thorough',
        decisionSpeed: 'evidence-based',
        communicationFrequency: 'continuous',
        toolPreference: 'automation-heavy',
        collaborationStyle: 'quality-guardian'
      },
      'SECURITY': {
        workStyle: 'paranoid-protective',
        decisionSpeed: 'cautious',
        communicationFrequency: 'alert-driven',
        toolPreference: 'scanning-heavy',
        collaborationStyle: 'advisory-blocking'
      },
      'PERFORMANCE': {
        workStyle: 'optimization-obsessed',
        decisionSpeed: 'data-driven',
        communicationFrequency: 'metric-updates',
        toolPreference: 'benchmark-heavy',
        collaborationStyle: 'improvement-focused'
      },
      'DESIGN': {
        workStyle: 'user-centric-creative',
        decisionSpeed: 'iterative',
        communicationFrequency: 'visual-heavy',
        toolPreference: 'prototype-heavy',
        collaborationStyle: 'empathetic-inclusive'
      },
      'DATABASE': {
        workStyle: 'integrity-focused',
        decisionSpeed: 'risk-averse',
        communicationFrequency: 'checkpoint-based',
        toolPreference: 'validation-heavy',
        collaborationStyle: 'cautious-thorough'
      }
    };
    
    for (const [agent, profile] of Object.entries(profiles)) {
      this.behaviorProfiles.set(agent, profile);
    }
  }

  /**
   * Initialize optimized tool usage patterns
   */
  async initializeToolPatterns() {
    // Define optimal tool sequences for common tasks
    this.toolOptimizations.set('research', {
      sequence: ['WebSearch', 'Read', 'Grep', 'TodoWrite'],
      parallelizable: ['WebSearch', 'Read'],
      timeEstimate: 300000 // 5 minutes
    });
    
    this.toolOptimizations.set('implementation', {
      sequence: ['Read', 'TodoWrite', 'MultiEdit', 'Bash', 'Bash'],
      parallelizable: ['Read', 'Grep'],
      timeEstimate: 600000 // 10 minutes
    });
    
    this.toolOptimizations.set('testing', {
      sequence: ['Write', 'Bash', 'Playwright', 'Write'],
      parallelizable: ['Bash', 'Playwright'],
      timeEstimate: 450000 // 7.5 minutes
    });
    
    this.toolOptimizations.set('security-scan', {
      sequence: ['Grep', 'Read', 'WebFetch', 'Write'],
      parallelizable: ['Grep', 'WebFetch'],
      timeEstimate: 240000 // 4 minutes
    });
    
    this.toolOptimizations.set('performance-audit', {
      sequence: ['Bash', 'WebFetch', 'Read', 'Write'],
      parallelizable: ['Bash', 'WebFetch'],
      timeEstimate: 360000 // 6 minutes
    });
  }

  /**
   * Set up performance tracking
   */
  setupPerformanceTracking() {
    // Initialize performance metrics for each agent type
    const agentTypes = ['LEAD', 'PLAN', 'EXEC', 'TESTING', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'DATABASE'];
    
    for (const type of agentTypes) {
      this.performanceMetrics.set(type, {
        tasksCompleted: 0,
        averageTime: 0,
        successRate: 100,
        toolEfficiency: 100,
        collaborationScore: 100
      });
    }
  }

  /**
   * Enhance agent with optimal behavior
   */
  async enhanceAgent(agentType, context = {}) {
    const profile = this.behaviorProfiles.get(agentType);
    if (!profile) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }
    
    // Create enhanced agent
    const agent = this.collaborationEngine.createAgent(agentType, context);

    // Apply behavior enhancements
    agent.behaviorProfile = profile;
    agent.toolPatterns = this.getOptimalToolPatterns(agentType, context.task);
    agent.communicationStyle = this.getCommunicationStyle(agentType);
    agent.decisionFramework = this.getDecisionFramework(agentType);

    // Set up adaptive learning
    agent.learn = (outcome) => this.adaptiveLearning(agent, outcome);

    // Anti-hallucination: Attach hypothesis tracker for complex tasks only
    this.attachHypothesisTrackerIfNeeded(agent, agentType, context);

    return agent;
  }

  /**
   * Get optimal tool patterns for agent and task
   */
  getOptimalToolPatterns(agentType, task) {
    const patterns = [];
    
    // Match task to optimization patterns
    if (task) {
      const taskLower = task.toLowerCase();
      
      for (const [patternName, pattern] of this.toolOptimizations.entries()) {
        if (taskLower.includes(patternName.replace('-', ' '))) {
          patterns.push({
            name: patternName,
            ...pattern,
            priority: 'high'
          });
        }
      }
    }
    
    // Add agent-specific patterns
    const agentPatterns = {
      'LEAD': ['research', 'planning'],
      'PLAN': ['analysis', 'documentation'],
      'EXEC': ['implementation', 'testing'],
      'TESTING': ['testing', 'validation'],
      'SECURITY': ['security-scan', 'validation'],
      'PERFORMANCE': ['performance-audit', 'optimization'],
      'DESIGN': ['prototype', 'validation'],
      'DATABASE': ['migration', 'validation']
    };
    
    const specificPatterns = agentPatterns[agentType] || [];
    for (const patternName of specificPatterns) {
      const pattern = this.toolOptimizations.get(patternName);
      if (pattern && !patterns.find(p => p.name === patternName)) {
        patterns.push({
          name: patternName,
          ...pattern,
          priority: 'medium'
        });
      }
    }
    
    return patterns;
  }

  /**
   * Get communication style for agent
   */
  getCommunicationStyle(agentType) {
    const styles = {
      'LEAD': {
        format: 'executive-brief',
        frequency: 'milestone',
        detail: 'summary',
        visuals: 'charts-and-metrics'
      },
      'PLAN': {
        format: 'technical-specification',
        frequency: 'regular',
        detail: 'comprehensive',
        visuals: 'diagrams-and-flows'
      },
      'EXEC': {
        format: 'progress-update',
        frequency: 'on-completion',
        detail: 'concise',
        visuals: 'code-snippets'
      },
      'TESTING': {
        format: 'test-report',
        frequency: 'continuous',
        detail: 'evidence-based',
        visuals: 'screenshots-and-logs'
      },
      'SECURITY': {
        format: 'security-advisory',
        frequency: 'alert-based',
        detail: 'risk-focused',
        visuals: 'threat-models'
      },
      'PERFORMANCE': {
        format: 'performance-report',
        frequency: 'benchmark-driven',
        detail: 'metric-heavy',
        visuals: 'graphs-and-charts'
      },
      'DESIGN': {
        format: 'design-rationale',
        frequency: 'iteration-based',
        detail: 'user-focused',
        visuals: 'mockups-and-prototypes'
      },
      'DATABASE': {
        format: 'migration-plan',
        frequency: 'checkpoint',
        detail: 'risk-aware',
        visuals: 'schema-diagrams'
      }
    };
    
    return styles[agentType] || styles['EXEC'];
  }

  /**
   * Get decision framework for agent
   */
  getDecisionFramework(agentType) {
    const frameworks = {
      'LEAD': {
        approach: 'strategic-value',
        criteria: ['ROI', 'strategic-fit', 'risk-reward', 'market-impact'],
        speed: 'deliberate',
        confidence_threshold: 70
      },
      'PLAN': {
        approach: 'technical-feasibility',
        criteria: ['scalability', 'maintainability', 'performance', 'security'],
        speed: 'analytical',
        confidence_threshold: 80
      },
      'EXEC': {
        approach: 'pragmatic-delivery',
        criteria: ['implementation-time', 'code-quality', 'test-coverage', 'performance'],
        speed: 'rapid',
        confidence_threshold: 60
      },
      'TESTING': {
        approach: 'risk-based',
        criteria: ['coverage', 'edge-cases', 'regression-risk', 'user-impact'],
        speed: 'thorough',
        confidence_threshold: 90
      },
      'SECURITY': {
        approach: 'threat-model',
        criteria: ['vulnerability-severity', 'exploit-likelihood', 'data-sensitivity', 'compliance'],
        speed: 'cautious',
        confidence_threshold: 95
      },
      'PERFORMANCE': {
        approach: 'data-driven',
        criteria: ['latency-impact', 'resource-usage', 'scalability', 'user-experience'],
        speed: 'measured',
        confidence_threshold: 75
      },
      'DESIGN': {
        approach: 'user-centric',
        criteria: ['usability', 'accessibility', 'aesthetics', 'consistency'],
        speed: 'iterative',
        confidence_threshold: 70
      },
      'DATABASE': {
        approach: 'integrity-first',
        criteria: ['data-integrity', 'performance', 'scalability', 'disaster-recovery'],
        speed: 'cautious',
        confidence_threshold: 90
      }
    };
    
    return frameworks[agentType] || frameworks['EXEC'];
  }

  /**
   * Adaptive learning from outcomes
   */
  adaptiveLearning(agent, outcome) {
    const metrics = this.performanceMetrics.get(agent.type);
    if (!metrics) return;
    
    // Update metrics based on outcome
    metrics.tasksCompleted++;
    
    // Update success rate with weighted average
    const weight = 0.1;
    metrics.successRate = metrics.successRate * (1 - weight) + (outcome.success ? 100 : 0) * weight;
    
    // Update average time
    if (outcome.duration) {
      metrics.averageTime = metrics.averageTime * (1 - weight) + outcome.duration * weight;
    }
    
    // Update tool efficiency
    if (outcome.toolsUsed && outcome.optimalTools) {
      const efficiency = (outcome.toolsUsed.length / outcome.optimalTools) * 100;
      metrics.toolEfficiency = metrics.toolEfficiency * (1 - weight) + efficiency * weight;
    }
    
    // Store learning in agent memory
    agent.memory = agent.memory || [];
    agent.memory.push({
      timestamp: Date.now(),
      task: outcome.task,
      success: outcome.success,
      learnings: outcome.learnings
    });
    
    // Limit memory size
    if (agent.memory.length > 50) {
      agent.memory = agent.memory.slice(-50);
    }
    
    // Adapt behavior based on learnings
    this.adaptBehavior(agent, metrics);
  }

  /**
   * Adapt agent behavior based on performance
   */
  adaptBehavior(agent, metrics) {
    // Adjust confidence threshold based on success rate
    if (metrics.successRate < 70) {
      agent.decisionFramework.confidence_threshold += 5;
      console.log(`📈 ${agent.type}: Increasing confidence threshold due to lower success rate`);
    } else if (metrics.successRate > 95) {
      agent.decisionFramework.confidence_threshold -= 2;
      console.log(`📉 ${agent.type}: Decreasing confidence threshold due to high success rate`);
    }
    
    // Adjust tool patterns based on efficiency
    if (metrics.toolEfficiency < 80) {
      console.log(`🔧 ${agent.type}: Optimizing tool usage patterns`);
      // Reorder tool patterns for better efficiency
      agent.toolPatterns = this.optimizeToolPatterns(agent.toolPatterns);
    }
  }

  /**
   * Optimize tool patterns based on performance
   */
  optimizeToolPatterns(patterns) {
    // Sort patterns by priority and success rate
    return patterns.sort((a, b) => {
      if (a.priority === b.priority) {
        return b.successRate - a.successRate;
      }
      return a.priority === 'high' ? -1 : 1;
    });
  }

  /**
   * Generate effectiveness report
   */
  generateEffectivenessReport() {
    const report = {
      timestamp: Date.now(),
      agents: [],
      overallEffectiveness: 0,
      recommendations: []
    };
    
    let totalScore = 0;
    let agentCount = 0;
    
    for (const [agentType, metrics] of this.performanceMetrics.entries()) {
      const effectiveness = (
        metrics.successRate * 0.4 +
        metrics.toolEfficiency * 0.3 +
        metrics.collaborationScore * 0.3
      );
      
      report.agents.push({
        type: agentType,
        effectiveness: effectiveness,
        metrics: metrics
      });
      
      totalScore += effectiveness;
      agentCount++;
      
      // Generate recommendations
      if (effectiveness < 80) {
        report.recommendations.push({
          agent: agentType,
          issue: 'Below optimal effectiveness',
          suggestion: 'Review behavior patterns and tool usage'
        });
      }
    }
    
    report.overallEffectiveness = totalScore / agentCount;

    return report;
  }

  /**
   * Attach hypothesis tracker for complex tasks
   * Anti-hallucination safeguard - tracks alternatives considered
   * Only applies to MEDIUM+ complexity agents
   */
  attachHypothesisTrackerIfNeeded(agent, agentType, context = {}) {
    // Import complexity map and tracker
    const complexityMap = require('../agent-complexity-map.cjs');
    const { HypothesisTracker } = require('../hypothesis-tracker.cjs');

    // Determine complexity
    const complexity = complexityMap.inferComplexity({ type: agentType }, context);

    // Only attach for MEDIUM+ complexity
    if (!complexityMap.meetsComplexityThreshold(complexity, 'MEDIUM')) {
      return;
    }

    // Check if already attached
    if (HypothesisTracker.hasTracker(agent)) {
      return;
    }

    // Apply tracker mixin
    HypothesisTracker.applyTo(agent);

    // Log attachment
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[AgentBehaviorSystem] Hypothesis tracker attached to ${agentType} (complexity: ${complexity})`);
    }
  }
}

// Export for use in other modules
export default AgentBehaviorSystem;

// Demo execution
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  async function demo() {
    console.log('🎯 LEO Protocol v4.1 - Agent Behavior Enhancement Demo\n');
    
    const system = new AgentBehaviorSystem();
    await system.initialize();
    
    // Create enhanced agents
    console.log('\n📋 Creating Enhanced Agents...\n');
    
    const _lead = await system.enhanceAgent('LEAD', {
      task: 'Strategic planning for Q1 2025'
    });
    
    const exec = await system.enhanceAgent('EXEC', {
      task: 'Implement dashboard features'
    });
    
    const testing = await system.enhanceAgent('TESTING', {
      task: 'Comprehensive test coverage'
    });
    
    // Simulate learning
    console.log('\n🧠 Simulating Adaptive Learning...\n');
    
    exec.learn({
      task: 'Feature implementation',
      success: true,
      duration: 300000,
      toolsUsed: ['Read', 'MultiEdit', 'Bash'],
      optimalTools: 3
    });
    
    testing.learn({
      task: 'Test automation',
      success: true,
      duration: 240000,
      toolsUsed: ['Playwright', 'Bash'],
      optimalTools: 2
    });
    
    // Generate report
    const report = system.generateEffectivenessReport();
    
    console.log('\n📊 Agent Effectiveness Report:');
    console.log('═'.repeat(50));
    console.log(`Overall Effectiveness: ${report.overallEffectiveness.toFixed(1)}%`);
    console.log('\nAgent Performance:');
    
    for (const agent of report.agents) {
      console.log(`  ${agent.type}: ${agent.effectiveness.toFixed(1)}% effective`);
    }
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      for (const rec of report.recommendations) {
        console.log(`  - ${rec.agent}: ${rec.suggestion}`);
      }
    }
    
    console.log('═'.repeat(50));
    console.log('\n✅ Agent Behavior System fully operational');
  }
  
  demo().catch(console.error);
}