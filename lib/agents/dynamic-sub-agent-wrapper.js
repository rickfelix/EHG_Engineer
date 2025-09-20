#!/usr/bin/env node

/**
 * Dynamic Sub-Agent Wrapper
 * Makes any sub-agent work with dynamic paths instead of hardcoded locations
 */

import path from 'path';
import fs from 'fs';

class DynamicSubAgentWrapper {
  constructor(SubAgentClass, agentName = 'Sub-Agent') {
    this.SubAgentClass = SubAgentClass;
    this.agentName = agentName;
    this.agent = new SubAgentClass();
  }

  /**
   * Execute the sub-agent with dynamic path support
   */
  async execute(options = {}) {
    // Determine the path to analyze
    const targetPath = this.resolvePath(options);
    
    console.log(`🔧 Dynamic ${this.agentName}`);
    console.log(`📁 Analyzing: ${targetPath}`);
    
    // Verify path exists
    if (!fs.existsSync(targetPath)) {
      console.error(`❌ Path does not exist: ${targetPath}`);
      return {
        success: false,
        error: `Path not found: ${targetPath}`,
        path: targetPath,
        score: 0,
        issues: []
      };
    }

    // Override the execute method to use our dynamic path
    const originalExecute = this.agent.execute;
    
    // If the agent's execute method expects a path in options
    if (originalExecute) {
      try {
        // Call with our dynamic path
        const results = await originalExecute.call(this.agent, {
          ...options,
          path: targetPath,
          basePath: targetPath,
          projectPath: targetPath
        });
        
        // Add metadata about dynamic execution
        return {
          ...results,
          dynamicExecution: true,
          analyzedPath: targetPath,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error(`❌ Error executing ${this.agentName}:`, error.message);
        return {
          success: false,
          error: error.message,
          path: targetPath,
          score: 0,
          issues: []
        };
      }
    }
    
    // Fallback for agents without execute method
    return this.fallbackAnalysis(targetPath, options);
  }

  /**
   * Resolve the path to analyze from various sources
   */
  resolvePath(options) {
    // Priority order:
    // 1. Explicit path in options
    // 2. Command line argument
    // 3. Environment variables
    // 4. Current working directory
    
    return options.path || 
           options.basePath ||
           options.projectPath ||
           process.argv[2] ||
           process.env.ANALYSIS_PATH ||
           process.env.PROJECT_PATH ||
           process.env.TARGET_PATH ||
           process.cwd();
  }

  /**
   * Fallback analysis for agents without standard execute method
   */
  async fallbackAnalysis(targetPath, options) {
    console.log(`⚠️ Using fallback analysis for ${this.agentName}`);
    
    const results = {
      success: true,
      path: targetPath,
      timestamp: new Date().toISOString(),
      score: 0,
      issues: [],
      recommendations: []
    };

    // Try to call various methods the agent might have
    const methodsToTry = [
      'analyze', 'scan', 'check', 'validate', 'assess', 'evaluate',
      'scanForIssues', 'performAnalysis', 'runChecks'
    ];

    for (const method of methodsToTry) {
      if (typeof this.agent[method] === 'function') {
        console.log(`   Trying method: ${method}`);
        try {
          const methodResult = await this.agent[method](targetPath, options);
          if (methodResult) {
            results.methodUsed = method;
            results.analysisResults = methodResult;
            break;
          }
        } catch (error) {
          console.log(`   Method ${method} failed: ${error.message}`);
        }
      }
    }

    return results;
  }

  /**
   * Get information about the agent
   */
  getInfo() {
    return {
      name: this.agentName,
      class: this.SubAgentClass.name,
      supportsDynamicPaths: true,
      methods: Object.getOwnPropertyNames(Object.getPrototypeOf(this.agent))
        .filter(name => typeof this.agent[name] === 'function' && name !== 'constructor')
    };
  }
}

/**
 * Factory function to create dynamic versions of all sub-agents
 */
function makeDynamic(SubAgentClass, name) {
  return class extends DynamicSubAgentWrapper {
    constructor() {
      super(SubAgentClass, name);
    }
  };
}

/**
 * Batch convert multiple sub-agents to dynamic versions
 */
function makeDynamicAgents(agentMap) {
  const dynamicAgents = {};
  
  for (const [name, AgentClass] of Object.entries(agentMap)) {
    dynamicAgents[name] = makeDynamic(AgentClass, name);
  }
  
  return dynamicAgents;
}

export { 
  DynamicSubAgentWrapper,
  makeDynamic,
  makeDynamicAgents
 };

// If run directly, show usage
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🔧 Dynamic Sub-Agent Wrapper');
  console.log('\nUsage:');
  console.log('  import { DynamicSubAgentWrapper } from './dynamic-sub-agent-wrapper';');
  console.log('  import SecuritySubAgent from './security-sub-agent';');
  console.log('  ');
  console.log('  const dynamicAgent = new DynamicSubAgentWrapper(SecuritySubAgent, "Security");');
  console.log('  const results = await dynamicAgent.execute({ path: "/path/to/analyze" });');
  console.log('\nOr use the factory function:');
  console.log('  import { makeDynamicAgents } from './dynamic-sub-agent-wrapper';');
  console.log('  const agents = makeDynamicAgents({');
  console.log('    Security: require("./security-sub-agent"),');
  console.log('    Performance: require("./performance-sub-agent"),');
  console.log('    Documentation: require("./documentation-sub-agent")');
  console.log('  });');
}