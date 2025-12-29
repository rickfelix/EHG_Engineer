/**
 * Intelligent Multi-Agent Selection System
 * Dynamically selects ALL necessary sub-agents based on context, not just top 3
 * Uses contextual clustering, dependency analysis, and synergy detection
 */

import ContextMonitor from './context-monitor.js';

class IntelligentMultiSelector {
  constructor(openaiApiKey, projectRoot = process.cwd()) {
    this.contextMonitor = new ContextMonitor(openaiApiKey, projectRoot);
    this.projectRoot = projectRoot;
    
    // Enhanced configuration for multi-selection
    this.config = {
      enabled: true,
      
      // Confidence thresholds
      critical_threshold: 0.85,    // Must include regardless of count
      high_threshold: 0.75,        // Should include unless resource constrained  
      medium_threshold: 0.60,       // Include if synergistic with others
      low_threshold: 0.40,          // Include only if dependencies require
      
      // Selection strategies
      selection_mode: 'intelligent', // 'intelligent', 'top_n', 'threshold', 'all'
      max_agents: null,              // null = no limit, dynamic based on need
      min_agents: 1,                 // Minimum agents to activate
      
      // Synergy and clustering
      enable_synergy: true,          // Detect agent combinations that work well
      enable_clustering: true,       // Group related agents
      enable_dependencies: true,     // Include dependent agents automatically
      
      // Resource management
      complexity_budget: 1.0,        // 1.0 = normal, 2.0 = complex tasks
      time_budget_ms: 10000,         // Max execution time
      parallel_execution: true,      // Execute agents in parallel where possible
      
      // Learning and adaptation
      use_historical_data: true,     // Use past selections to improve
      adaptation_rate: 0.15          // How quickly to adapt selection patterns
    };
    
    // Agent relationships and synergies
    this.agentRelationships = {
      dependencies: {
        'SECURITY': ['DATABASE', 'API'],      // Security often needs DB and API context
        'PERFORMANCE': ['DATABASE', 'API'],   // Performance needs to check DB and API
        'TESTING': ['SECURITY', 'PERFORMANCE'], // Testing should verify security and perf
        'DATABASE': [],                        // Database is foundational
        'API': ['DATABASE', 'SECURITY'],      // APIs need DB and security context
        'DESIGN': ['PERFORMANCE'],            // Design impacts performance
        'COST': ['DATABASE', 'PERFORMANCE'],  // Cost relates to DB and perf
        'DOCS': [],                           // Documentation is independent
        'DEBUG': ['TESTING']                  // Debug benefits from testing context
      },
      
      synergies: [
        ['SECURITY', 'DATABASE', 'API'],      // These work better together
        ['PERFORMANCE', 'DATABASE'],          // Performance+DB = optimization insights
        ['DESIGN', 'TESTING'],                // Design+Testing = UX validation
        ['DEBUG', 'TESTING', 'PERFORMANCE'],  // Debug trinity
        ['COST', 'PERFORMANCE', 'DATABASE']   // Cost optimization trio
      ],
      
      exclusions: [
        // Agents that might conflict or create noise together
        // Currently none, but structure is here for future use
      ]
    };
    
    // Task pattern recognition
    this.taskPatterns = {
      'full_implementation': ['DESIGN', 'DATABASE', 'API', 'SECURITY', 'TESTING', 'PERFORMANCE'],
      'bug_fix': ['DEBUG', 'TESTING', 'SECURITY'],
      'optimization': ['PERFORMANCE', 'DATABASE', 'COST'],
      'new_feature': ['DESIGN', 'API', 'DATABASE', 'TESTING'],
      'security_audit': ['SECURITY', 'DATABASE', 'API', 'TESTING'],
      'refactoring': ['PERFORMANCE', 'TESTING', 'DESIGN'],
      'documentation': ['DOCS', 'API'],
      'database_work': ['DATABASE', 'PERFORMANCE', 'SECURITY']
    };
    
    // Historical selection data
    this.selectionHistory = [];
    this.patternCache = new Map();
  }
  
  /**
   * Main entry point for intelligent multi-agent selection
   */
  async selectAgents(userPrompt, context = {}) {
    try {
      // Step 1: Get initial agent analysis from context monitor
      const analysis = await this.contextMonitor.analyzeContext(userPrompt, context);
      
      if (!analysis.selected_agents || analysis.selected_agents.length === 0) {
        return {
          selected_agents: [],
          selection_method: 'none',
          reason: 'No relevant agents identified'
        };
      }
      
      // Step 2: Detect task pattern
      const taskPattern = this.detectTaskPattern(userPrompt, analysis);
      
      // Step 3: Apply intelligent selection algorithm
      const selectedAgents = await this.applyIntelligentSelection(
        analysis.selected_agents,
        taskPattern,
        userPrompt,
        context
      );
      
      // Step 4: Apply dependency resolution
      const withDependencies = this.resolveDependencies(selectedAgents);
      
      // Step 5: Detect and enhance synergies
      const withSynergies = this.enhanceSynergies(withDependencies);
      
      // Step 6: Apply resource constraints if needed
      const finalSelection = this.applyResourceConstraints(withSynergies, context);
      
      // Step 7: Optimize execution order
      const optimizedSelection = this.optimizeExecutionOrder(finalSelection);
      
      // Step 8: Record for learning
      this.recordSelection(userPrompt, optimizedSelection, taskPattern);
      
      return {
        selected_agents: optimizedSelection,
        selection_method: this.config.selection_mode,
        task_pattern: taskPattern,
        total_agents: optimizedSelection.length,
        confidence_distribution: this.getConfidenceDistribution(optimizedSelection),
        execution_strategy: this.determineExecutionStrategy(optimizedSelection),
        estimated_time: this.estimateExecutionTime(optimizedSelection),
        synergy_groups: this.identifySynergyGroups(optimizedSelection)
      };
      
    } catch (error) {
      console.error('Multi-agent selection failed:', error);
      return {
        selected_agents: [],
        selection_method: 'error',
        error: error.message
      };
    }
  }
  
  /**
   * Detect task pattern from prompt and initial analysis
   */
  detectTaskPattern(prompt, analysis) {
    const promptLower = prompt.toLowerCase();
    
    // Check for explicit patterns
    for (const [pattern, _agents] of Object.entries(this.taskPatterns)) {
      const keywords = pattern.split('_');
      if (keywords.every(kw => promptLower.includes(kw))) {
        return pattern;
      }
    }
    
    // Infer from agent selection
    const agentCodes = analysis.selected_agents.map(a => a.agent_code);
    
    if (agentCodes.includes('DEBUG') && agentCodes.includes('TESTING')) {
      return 'bug_fix';
    }
    if (agentCodes.includes('PERFORMANCE') && agentCodes.includes('DATABASE')) {
      return 'optimization';
    }
    if (agentCodes.includes('SECURITY')) {
      return 'security_audit';
    }
    if (agentCodes.includes('DESIGN') && agentCodes.includes('API')) {
      return 'new_feature';
    }
    
    // Check historical patterns
    const historicalPattern = this.findHistoricalPattern(prompt);
    if (historicalPattern) {
      return historicalPattern;
    }
    
    return 'general';
  }
  
  /**
   * Apply intelligent selection algorithm
   */
  async applyIntelligentSelection(agents, taskPattern, _prompt, _context) {
    const selected = [];
    
    switch (this.config.selection_mode) {
      case 'intelligent':
        // Group agents by confidence tier
        const tiers = this.groupByConfidenceTier(agents);
        
        // Always include critical agents
        selected.push(...tiers.critical);
        
        // Include high confidence agents unless resource constrained
        if (this.hasResourceBudget(tiers.high.length)) {
          selected.push(...tiers.high);
        }
        
        // Include medium confidence if they're part of task pattern
        const patternAgents = this.taskPatterns[taskPattern] || [];
        const mediumInPattern = tiers.medium.filter(a => 
          patternAgents.includes(a.agent_code)
        );
        selected.push(...mediumInPattern);
        
        // Include remaining medium if synergistic
        const synergisticMedium = tiers.medium.filter(a => 
          !mediumInPattern.includes(a) &&
          this.isSynergistic(a, selected)
        );
        selected.push(...synergisticMedium);
        
        // Consider low confidence only if dependencies require
        const requiredLow = tiers.low.filter(a =>
          this.isRequiredDependency(a, selected)
        );
        selected.push(...requiredLow);
        break;
        
      case 'threshold':
        // Select all above medium threshold
        selected.push(...agents.filter(a => 
          a.confidence >= this.config.medium_threshold
        ));
        break;
        
      case 'top_n':
        // Legacy mode - select top N
        const n = this.config.max_agents || 3;
        selected.push(...agents.slice(0, n));
        break;
        
      case 'all':
        // Select all agents regardless of confidence
        selected.push(...agents);
        break;
        
      default:
        // Fallback to threshold mode
        selected.push(...agents.filter(a => 
          a.confidence >= this.config.medium_threshold
        ));
    }
    
    // Ensure minimum agents
    if (selected.length < this.config.min_agents && agents.length > 0) {
      const needed = this.config.min_agents - selected.length;
      const remaining = agents.filter(a => !selected.includes(a));
      selected.push(...remaining.slice(0, needed));
    }
    
    return selected;
  }
  
  /**
   * Group agents by confidence tier
   */
  groupByConfidenceTier(agents) {
    return {
      critical: agents.filter(a => a.confidence >= this.config.critical_threshold),
      high: agents.filter(a => 
        a.confidence >= this.config.high_threshold && 
        a.confidence < this.config.critical_threshold
      ),
      medium: agents.filter(a => 
        a.confidence >= this.config.medium_threshold && 
        a.confidence < this.config.high_threshold
      ),
      low: agents.filter(a => 
        a.confidence >= this.config.low_threshold && 
        a.confidence < this.config.medium_threshold
      )
    };
  }
  
  /**
   * Resolve agent dependencies
   */
  resolveDependencies(agents) {
    if (!this.config.enable_dependencies) {
      return agents;
    }
    
    const agentCodes = new Set(agents.map(a => a.agent_code));
    const additionalAgents = [];
    
    for (const agent of agents) {
      const deps = this.agentRelationships.dependencies[agent.agent_code] || [];
      for (const dep of deps) {
        if (!agentCodes.has(dep)) {
          // Add dependency with adjusted confidence
          additionalAgents.push({
            agent_code: dep,
            confidence: agent.confidence * 0.8, // Slightly lower confidence
            reasoning: `Required dependency for ${agent.agent_code}`,
            priority: 'dependency'
          });
          agentCodes.add(dep);
        }
      }
    }
    
    return [...agents, ...additionalAgents];
  }
  
  /**
   * Enhance agent selection based on synergies
   */
  enhanceSynergies(agents) {
    if (!this.config.enable_synergy) {
      return agents;
    }
    
    const agentCodes = new Set(agents.map(a => a.agent_code));
    const additionalAgents = [];
    
    // Check each synergy group
    for (const synergyGroup of this.agentRelationships.synergies) {
      const present = synergyGroup.filter(code => agentCodes.has(code));
      const missing = synergyGroup.filter(code => !agentCodes.has(code));
      
      // If most of the synergy group is present, add the missing ones
      if (present.length >= synergyGroup.length * 0.6 && missing.length > 0) {
        for (const missingCode of missing) {
          additionalAgents.push({
            agent_code: missingCode,
            confidence: 0.7, // Moderate confidence for synergistic agents
            reasoning: `Synergistic with ${present.join(', ')}`,
            priority: 'synergy'
          });
          agentCodes.add(missingCode);
        }
      }
    }
    
    return [...agents, ...additionalAgents];
  }
  
  /**
   * Apply resource constraints
   */
  applyResourceConstraints(agents, context) {
    const complexity = context.task_complexity || 1.0;
    const _adjustedBudget = this.config.complexity_budget * complexity;
    
    if (this.config.max_agents && agents.length > this.config.max_agents) {
      // Sort by confidence and priority
      const sorted = [...agents].sort((a, b) => {
        // Priority order: critical > high > dependency > synergy > normal
        const priorityScore = {
          'critical': 4,
          'high': 3,
          'dependency': 2,
          'synergy': 1,
          'normal': 0
        };
        
        const aPriority = priorityScore[a.priority] || 0;
        const bPriority = priorityScore[b.priority] || 0;
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        return b.confidence - a.confidence;
      });
      
      return sorted.slice(0, this.config.max_agents);
    }
    
    // Check time budget
    const estimatedTime = this.estimateExecutionTime(agents);
    if (estimatedTime > this.config.time_budget_ms) {
      // Remove lowest confidence agents until within budget
      const sorted = [...agents].sort((a, b) => b.confidence - a.confidence);
      while (sorted.length > this.config.min_agents) {
        const estimated = this.estimateExecutionTime(sorted);
        if (estimated <= this.config.time_budget_ms) {
          break;
        }
        sorted.pop();
      }
      return sorted;
    }
    
    return agents;
  }
  
  /**
   * Optimize execution order for parallel and sequential execution
   */
  optimizeExecutionOrder(agents) {
    if (!this.config.parallel_execution) {
      // Simple confidence-based ordering for sequential execution
      return [...agents].sort((a, b) => b.confidence - a.confidence);
    }
    
    // Group agents into execution batches
    const batches = [];
    const processed = new Set();
    
    // First batch: Independent agents (no dependencies)
    const independent = agents.filter(a => {
      const deps = this.agentRelationships.dependencies[a.agent_code] || [];
      return deps.length === 0 || deps.every(d => 
        !agents.some(ag => ag.agent_code === d)
      );
    });
    
    if (independent.length > 0) {
      batches.push(independent);
      independent.forEach(a => processed.add(a.agent_code));
    }
    
    // Subsequent batches: Agents whose dependencies are satisfied
    while (processed.size < agents.length) {
      const nextBatch = agents.filter(a => {
        if (processed.has(a.agent_code)) return false;
        
        const deps = this.agentRelationships.dependencies[a.agent_code] || [];
        return deps.every(d => processed.has(d));
      });
      
      if (nextBatch.length === 0) {
        // Circular dependency or missing dependency - add remaining
        const remaining = agents.filter(a => !processed.has(a.agent_code));
        batches.push(remaining);
        break;
      }
      
      batches.push(nextBatch);
      nextBatch.forEach(a => processed.add(a.agent_code));
    }
    
    // Flatten batches with execution metadata
    return batches.flatMap((batch, index) => 
      batch.map(agent => ({
        ...agent,
        execution_batch: index,
        can_parallel: batch.length > 1
      }))
    );
  }
  
  /**
   * Check if agent is synergistic with selected agents
   */
  isSynergistic(agent, selected) {
    const selectedCodes = selected.map(a => a.agent_code);
    
    for (const synergyGroup of this.agentRelationships.synergies) {
      if (synergyGroup.includes(agent.agent_code)) {
        const overlap = synergyGroup.filter(code => selectedCodes.includes(code));
        if (overlap.length > 0) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Check if agent is required dependency
   */
  isRequiredDependency(agent, selected) {
    const selectedCodes = selected.map(a => a.agent_code);
    
    for (const [code, deps] of Object.entries(this.agentRelationships.dependencies)) {
      if (selectedCodes.includes(code) && deps.includes(agent.agent_code)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check resource budget
   */
  hasResourceBudget(additionalAgents) {
    const currentLoad = this.estimateLoad();
    const additionalLoad = additionalAgents * 0.1; // Rough estimate
    return (currentLoad + additionalLoad) <= this.config.complexity_budget;
  }
  
  /**
   * Estimate current system load
   */
  estimateLoad() {
    // Simple estimation - could be enhanced with actual metrics
    return 0.5;
  }
  
  /**
   * Estimate execution time for agents
   */
  estimateExecutionTime(agents) {
    // Base time per agent (can be refined with historical data)
    const baseTime = {
      'SECURITY': 1500,
      'DATABASE': 1200,
      'PERFORMANCE': 1800,
      'TESTING': 2000,
      'API': 1000,
      'DESIGN': 800,
      'COST': 1000,
      'DOCS': 600,
      'DEBUG': 1500,
      'DEPENDENCY': 700
    };
    
    if (!this.config.parallel_execution) {
      // Sequential: sum of all times
      return agents.reduce((sum, agent) => 
        sum + (baseTime[agent.agent_code] || 1000), 0
      );
    }
    
    // Parallel: max time per batch
    const batches = this.groupIntoBatches(agents);
    return batches.reduce((sum, batch) => {
      const batchTime = Math.max(...batch.map(a => 
        baseTime[a.agent_code] || 1000
      ));
      return sum + batchTime;
    }, 0);
  }
  
  /**
   * Group agents into execution batches
   */
  groupIntoBatches(agents) {
    // Simplified batching - can be enhanced
    const batches = [];
    const batchSize = 3;
    
    for (let i = 0; i < agents.length; i += batchSize) {
      batches.push(agents.slice(i, i + batchSize));
    }
    
    return batches;
  }
  
  /**
   * Get confidence distribution
   */
  getConfidenceDistribution(agents) {
    const dist = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };
    
    for (const agent of agents) {
      if (agent.confidence >= this.config.critical_threshold) {
        dist.critical++;
      } else if (agent.confidence >= this.config.high_threshold) {
        dist.high++;
      } else if (agent.confidence >= this.config.medium_threshold) {
        dist.medium++;
      } else {
        dist.low++;
      }
    }
    
    return dist;
  }
  
  /**
   * Determine execution strategy
   */
  determineExecutionStrategy(agents) {
    const hasDepencies = agents.some(a => 
      (this.agentRelationships.dependencies[a.agent_code] || []).length > 0
    );
    
    const hasSynergies = this.identifySynergyGroups(agents).length > 0;
    
    if (hasDepencies) {
      return 'ordered_execution';
    } else if (hasSynergies) {
      return 'synergistic_parallel';
    } else {
      return 'full_parallel';
    }
  }
  
  /**
   * Identify synergy groups in selection
   */
  identifySynergyGroups(agents) {
    const agentCodes = agents.map(a => a.agent_code);
    const groups = [];
    
    for (const synergyGroup of this.agentRelationships.synergies) {
      const present = synergyGroup.filter(code => agentCodes.includes(code));
      if (present.length >= 2) {
        groups.push({
          agents: present,
          completeness: present.length / synergyGroup.length,
          missing: synergyGroup.filter(code => !agentCodes.includes(code))
        });
      }
    }
    
    return groups;
  }
  
  /**
   * Find historical pattern
   */
  findHistoricalPattern(prompt) {
    // Check pattern cache
    const promptKey = this.generatePromptKey(prompt);
    if (this.patternCache.has(promptKey)) {
      return this.patternCache.get(promptKey);
    }
    
    // Search in history
    for (const entry of this.selectionHistory.slice(-50)) {
      if (this.isSimilarPrompt(prompt, entry.prompt)) {
        return entry.pattern;
      }
    }
    
    return null;
  }
  
  /**
   * Record selection for learning
   */
  recordSelection(prompt, agents, pattern) {
    const entry = {
      timestamp: new Date().toISOString(),
      prompt: prompt,
      pattern: pattern,
      agents: agents.map(a => ({
        code: a.agent_code,
        confidence: a.confidence
      })),
      agent_count: agents.length
    };
    
    this.selectionHistory.push(entry);
    
    // Limit history size
    if (this.selectionHistory.length > 1000) {
      this.selectionHistory.shift();
    }
    
    // Update pattern cache
    const promptKey = this.generatePromptKey(prompt);
    this.patternCache.set(promptKey, pattern);
  }
  
  /**
   * Generate prompt key for caching
   */
  generatePromptKey(prompt) {
    // Simple hash for demonstration - could use better hashing
    return prompt.toLowerCase().substring(0, 50);
  }
  
  /**
   * Check if prompts are similar
   */
  isSimilarPrompt(prompt1, prompt2) {
    // Simple similarity check - could use NLP
    const words1 = new Set(prompt1.toLowerCase().split(/\s+/));
    const words2 = new Set(prompt2.toLowerCase().split(/\s+/));
    
    const intersection = [...words1].filter(w => words2.has(w));
    const union = new Set([...words1, ...words2]);
    
    return intersection.length / union.size > 0.6;
  }
  
  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
  
  /**
   * Get statistics
   */
  getStatistics() {
    const recent = this.selectionHistory.slice(-100);
    
    return {
      total_selections: this.selectionHistory.length,
      avg_agents_selected: recent.reduce((sum, e) => sum + e.agent_count, 0) / recent.length,
      pattern_distribution: this.getPatternDistribution(recent),
      most_common_agents: this.getMostCommonAgents(recent),
      synergy_utilization: this.getSynergyUtilization(recent)
    };
  }
  
  /**
   * Get pattern distribution
   */
  getPatternDistribution(entries) {
    const patterns = {};
    for (const entry of entries) {
      patterns[entry.pattern] = (patterns[entry.pattern] || 0) + 1;
    }
    return patterns;
  }
  
  /**
   * Get most common agents
   */
  getMostCommonAgents(entries) {
    const counts = {};
    for (const entry of entries) {
      for (const agent of entry.agents) {
        counts[agent.code] = (counts[agent.code] || 0) + 1;
      }
    }
    
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, count]) => ({ code, count, percentage: count / entries.length }));
  }
  
  /**
   * Get synergy utilization
   */
  getSynergyUtilization(entries) {
    let totalSynergies = 0;
    let utilizedSynergies = 0;
    
    for (const entry of entries) {
      const agentCodes = entry.agents.map(a => a.code);
      for (const synergyGroup of this.agentRelationships.synergies) {
        totalSynergies++;
        const present = synergyGroup.filter(code => agentCodes.includes(code));
        if (present.length >= synergyGroup.length * 0.6) {
          utilizedSynergies++;
        }
      }
    }
    
    return {
      total: totalSynergies,
      utilized: utilizedSynergies,
      percentage: totalSynergies > 0 ? utilizedSynergies / totalSynergies : 0
    };
  }
}

export default IntelligentMultiSelector;