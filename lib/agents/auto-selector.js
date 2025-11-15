/**
 * Intelligent Auto-Selection System
 * Orchestrates automatic sub-agent selection and coordination
 * Integrates with Context Monitor to provide seamless sub-agent activation
 */

import ContextMonitor from './context-monitor.js';
import IntelligentMultiSelector from './intelligent-multi-selector.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class IntelligentAutoSelector {
  constructor(openaiApiKey, projectRoot = process.cwd()) {
    this.contextMonitor = new ContextMonitor(openaiApiKey, projectRoot);
    this.multiSelector = new IntelligentMultiSelector(openaiApiKey, projectRoot);
    this.projectRoot = projectRoot;
    this.userPatterns = new Map();
    this.feedbackHistory = [];
    
    // Auto-selection configuration
    this.config = {
      enabled: true,
      auto_threshold: 0.8,          // Auto-trigger above 80% confidence
      prompt_threshold: 0.6,        // Prompt user between 60-80%
      max_auto_agents: null,        // No limit by default - let multi-selector decide
      use_multi_selector: true,     // Use the new intelligent multi-selector
      learning_rate: 0.1,           // How quickly to adapt thresholds
      feedback_window: 50,          // Number of interactions to consider
      coordination_timeout: 5000    // Max time for agent coordination
    };

    // Agent execution modules (would be loaded dynamically)
    this.agentModules = new Map();
    this.loadAgentModules();
  }

  /**
   * Main auto-selection entry point
   * @param {string} userPrompt - User's input
   * @param {object} context - Additional context
   * @returns {Promise<object>} Enhanced response with sub-agent insights
   */
  async processUserInput(userPrompt, context = {}) {
    if (!this.config.enabled) {
      return { original_response: null, agent_insights: [] };
    }

    try {
      // Use the new multi-selector if enabled
      if (this.config.use_multi_selector) {
        const multiSelection = await this.multiSelector.selectAgents(userPrompt, context);
        
        if (!multiSelection.selected_agents || multiSelection.selected_agents.length === 0) {
          return {
            original_response: null,
            agent_insights: [],
            analysis_summary: 'No relevant sub-agents identified',
            selection_method: 'multi_selector'
          };
        }
        
        // Execute the selected agents
        const results = await this.executeAgents(
          multiSelection.selected_agents, 
          userPrompt, 
          context, 
          'multi_selected'
        );
        
        // Coordinate results
        const synthesis = await this.coordinateAgentResults(
          { auto_executed: results, prompted: [], background: [] }, 
          multiSelection
        );
        
        return {
          agent_insights: synthesis.insights,
          coordination_strategy: multiSelection.execution_strategy,
          execution_summary: synthesis.summary,
          selected_agents: multiSelection.selected_agents,
          total_agents: multiSelection.total_agents,
          task_pattern: multiSelection.task_pattern,
          synergy_groups: multiSelection.synergy_groups,
          confidence_distribution: multiSelection.confidence_distribution,
          selection_method: 'intelligent_multi_selector'
        };
      }
      
      // Fallback to original selection logic
      const analysis = await this.contextMonitor.analyzeContext(userPrompt, context);
      
      if (!analysis.selected_agents || analysis.selected_agents.length === 0) {
        return { 
          original_response: null, 
          agent_insights: [],
          analysis_summary: 'No relevant sub-agents identified'
        };
      }

      // Step 2: Categorize agents by confidence
      const categorized = this.categorizeAgentsByConfidence(analysis.selected_agents);
      
      // Step 3: Execute agents based on confidence levels
      const results = await this.executeAgentSelection(categorized, userPrompt, context);
      
      // Step 4: Coordinate and synthesize results
      const synthesis = await this.coordinateAgentResults(results, analysis);
      
      // Step 5: Learn from this interaction
      this.recordInteraction(userPrompt, analysis, results);
      
      return {
        agent_insights: synthesis.insights,
        coordination_strategy: analysis.coordination_strategy,
        execution_summary: synthesis.summary,
        auto_triggered: categorized.auto_execute.length,
        prompted: categorized.prompt_user.length,
        total_confidence: this.calculateTotalConfidence(analysis.selected_agents),
        selection_method: 'legacy_auto_selector'
      };
      
    } catch (error) {
      console.error('Auto-selection failed:', error);
      return { 
        error: error.message,
        agent_insights: [],
        fallback: true
      };
    }
  }

  /**
   * Categorize agents by confidence levels for different handling
   */
  categorizeAgentsByConfidence(selectedAgents) {
    const autoExecute = selectedAgents.filter(agent => 
      agent.confidence >= this.config.auto_threshold
    );
    
    // Apply max_auto_agents limit only if specified
    const limitedAutoExecute = this.config.max_auto_agents !== null
      ? autoExecute.slice(0, this.config.max_auto_agents)
      : autoExecute;
    
    return {
      auto_execute: limitedAutoExecute,
      
      prompt_user: selectedAgents.filter(agent => 
        agent.confidence >= this.config.prompt_threshold && 
        agent.confidence < this.config.auto_threshold
      ),
      
      background: selectedAgents.filter(agent => 
        agent.confidence < this.config.prompt_threshold
      )
    };
  }

  /**
   * Execute selected agents based on categorization
   */
  async executeAgentSelection(categorized, userPrompt, context) {
    const results = {
      auto_executed: [],
      prompted: [],
      background: []
    };

    // Execute high-confidence agents automatically
    if (categorized.auto_execute.length > 0) {
      results.auto_executed = await this.executeAgents(
        categorized.auto_execute, 
        userPrompt, 
        context, 
        'automatic'
      );
    }

    // For medium-confidence agents, we could implement user prompting
    // For now, we'll execute them automatically but mark as "prompted"
    if (categorized.prompt_user.length > 0) {
      results.prompted = await this.executeAgents(
        categorized.prompt_user, 
        userPrompt, 
        context, 
        'prompted'
      );
    }

    // Background agents might be executed with lower priority
    if (categorized.background.length > 0) {
      results.background = await this.executeAgents(
        categorized.background, 
        userPrompt, 
        context, 
        'background'
      );
    }

    return results;
  }

  /**
   * Execute a set of agents
   */
  async executeAgents(agents, userPrompt, context, executionType) {
    const results = [];
    
    for (const agent of agents) {
      try {
        const startTime = Date.now();
        const result = await this.executeAgent(agent, userPrompt, context);
        const endTime = Date.now();
        
        results.push({
          agent_code: agent.agent_code,
          confidence: agent.confidence,
          reasoning: agent.reasoning,
          execution_type: executionType,
          execution_time: endTime - startTime,
          result: result,
          status: 'success'
        });
      } catch (error) {
        results.push({
          agent_code: agent.agent_code,
          confidence: agent.confidence,
          execution_type: executionType,
          error: error.message,
          status: 'error'
        });
      }
    }
    
    return results;
  }

  /**
   * Execute individual agent
   */
  async executeAgent(agent, userPrompt, context) {
    const agentModule = this.agentModules.get(agent.agent_code);
    
    if (!agentModule) {
      // Fallback to generic analysis
      return this.generateGenericAnalysis(agent, userPrompt, context);
    }
    
    // Execute the specific agent module
    return await agentModule.analyze(userPrompt, context, {
      confidence: agent.confidence,
      reasoning: agent.reasoning,
      priority: agent.priority
    });
  }

  /**
   * Generate generic analysis when specific agent module unavailable
   */
  generateGenericAnalysis(agent, userPrompt, context) {
    const agentData = this.contextMonitor.subAgents[agent.agent_code];
    
    return {
      agent: agent.agent_code,
      analysis: `${agentData.name} analysis triggered with ${Math.round(agent.confidence * 100)}% confidence.`,
      recommendations: [
        `Consider ${agentData.name.toLowerCase()} implications of: ${userPrompt}`,
        `Review relevant ${agentData.name.toLowerCase()} best practices`,
        `Validate changes against ${agentData.name.toLowerCase()} requirements`
      ],
      reasoning: agent.reasoning,
      confidence: agent.confidence,
      type: 'generic'
    };
  }

  /**
   * Coordinate and synthesize results from multiple agents
   */
  async coordinateAgentResults(results, analysis) {
    const allResults = [
      ...results.auto_executed,
      ...results.prompted,
      ...results.background
    ].filter(r => r.status === 'success');

    if (allResults.length === 0) {
      return {
        insights: [],
        summary: 'No sub-agent analysis available'
      };
    }

    // Group insights by priority
    const insights = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };

    // Process each agent result
    for (const result of allResults) {
      const insight = this.formatAgentInsight(result);
      const priority = this.determinePriority(result);
      insights[priority].push(insight);
    }

    // Create coordination summary
    const summary = this.createCoordinationSummary(allResults, analysis);

    // Flatten insights in priority order
    const flattenedInsights = [
      ...insights.critical,
      ...insights.high,
      ...insights.medium,
      ...insights.low
    ];

    return {
      insights: flattenedInsights,
      summary: summary,
      agent_count: allResults.length,
      coordination_strategy: analysis.coordination_strategy
    };
  }

  /**
   * Format agent result into insight
   */
  formatAgentInsight(result) {
    const agentData = this.contextMonitor.subAgents[result.agent_code];
    
    return {
      agent: result.agent_code,
      agent_name: agentData.name,
      confidence: result.confidence,
      execution_type: result.execution_type,
      insight: result.result?.analysis || 'Analysis completed',
      recommendations: result.result?.recommendations || [],
      reasoning: result.reasoning,
      execution_time: result.execution_time,
      priority: this.determinePriority(result)
    };
  }

  /**
   * Determine insight priority based on confidence and agent type
   */
  determinePriority(result) {
    const agentData = this.contextMonitor.subAgents[result.agent_code];
    const basePriority = agentData.priority;
    const confidence = result.confidence;
    
    if (confidence >= 0.9 && basePriority >= 85) return 'critical';
    if (confidence >= 0.8 && basePriority >= 75) return 'high';
    if (confidence >= 0.7 || basePriority >= 65) return 'medium';
    return 'low';
  }

  /**
   * Create coordination summary
   */
  createCoordinationSummary(results, analysis) {
    const agentNames = results.map(r => 
      this.contextMonitor.subAgents[r.agent_code].name
    );
    
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    const totalTime = results.reduce((sum, r) => sum + (r.execution_time || 0), 0);
    
    return {
      agents_executed: agentNames,
      average_confidence: avgConfidence,
      total_execution_time: totalTime,
      coordination_strategy: analysis.coordination_strategy,
      method: analysis.method || 'ai_powered'
    };
  }

  /**
   * Calculate total confidence score
   */
  calculateTotalConfidence(agents) {
    if (!agents.length) return 0;
    return agents.reduce((sum, agent) => sum + agent.confidence, 0) / agents.length;
  }

  /**
   * Load agent modules dynamically
   */
  async loadAgentModules() {
    const agentPaths = {
      SECURITY: './security-sub-agent.js',
      PERFORMANCE: './performance-sub-agent.js',
      DESIGN: './design-sub-agent.js',
      TESTING: './testing-sub-agent.js',
      DATABASE: './database-sub-agent.js',
      API: './api-sub-agent.js',
      COST: './cost-sub-agent.js',
      DOCS: '../sub-agents/docmon.js',
      DEPENDENCY: './dependency-sub-agent.js',
      DEBUG: './intelligent-base-sub-agent.js' // Use base as fallback for debug
    };

    for (const [code, modulePath] of Object.entries(agentPaths)) {
      try {
        const fullPath = path.join(__dirname, modulePath);
        if (await this.fileExists(fullPath)) {
          const { default: AgentClass } = await import(fullPath);
          this.agentModules.set(code, new AgentClass());
        }
      } catch (error) {
        console.warn(`Failed to load agent module ${code}:`, error.message);
      }
    }
  }

  /**
   * Record interaction for learning
   */
  recordInteraction(userPrompt, analysis, results) {
    const interaction = {
      timestamp: new Date().toISOString(),
      prompt_hash: this.hashString(userPrompt),
      selected_agents: analysis.selected_agents.map(a => ({
        code: a.agent_code,
        confidence: a.confidence
      })),
      execution_results: {
        auto_count: results.auto_executed.length,
        prompted_count: results.prompted.length,
        success_count: [
          ...results.auto_executed,
          ...results.prompted,
          ...results.background
        ].filter(r => r.status === 'success').length
      }
    };
    
    this.feedbackHistory.push(interaction);
    
    // Keep only recent feedback
    if (this.feedbackHistory.length > this.config.feedback_window) {
      this.feedbackHistory.shift();
    }
    
    // Update patterns based on feedback
    this.updateUserPatterns(interaction);
  }

  /**
   * Update user patterns based on interaction history
   */
  updateUserPatterns(interaction) {
    const promptPattern = this.extractPromptPattern(interaction);
    
    if (this.userPatterns.has(promptPattern)) {
      const existing = this.userPatterns.get(promptPattern);
      existing.frequency += 1;
      existing.success_rate = this.calculateSuccessRate(existing, interaction);
    } else {
      this.userPatterns.set(promptPattern, {
        pattern: promptPattern,
        frequency: 1,
        agents: interaction.selected_agents,
        success_rate: 1.0,
        last_seen: interaction.timestamp
      });
    }
  }

  /**
   * Extract pattern from prompt for learning
   */
  extractPromptPattern(interaction) {
    // Simple pattern extraction (in production, could use NLP)
    const hash = interaction.prompt_hash.substring(0, 8);
    const agentCodes = interaction.selected_agents.map(a => a.code).join(',');
    return `${hash}:${agentCodes}`;
  }

  /**
   * Calculate success rate for pattern
   */
  calculateSuccessRate(pattern, newInteraction) {
    // Simple success rate based on execution results
    const newSuccessRate = newInteraction.execution_results.success_count > 0 ? 1.0 : 0.0;
    return (pattern.success_rate * (pattern.frequency - 1) + newSuccessRate) / pattern.frequency;
  }

  /**
   * Get user feedback on agent selections (for future enhancement)
   */
  recordFeedback(interactionId, feedback) {
    // This would be used to improve agent selection over time
    console.log('User feedback recorded:', { interactionId, feedback });
  }

  /**
   * Adaptive threshold adjustment based on feedback
   */
  adaptThresholds() {
    if (this.feedbackHistory.length < 10) return;
    
    // Analyze recent performance
    const recentInteractions = this.feedbackHistory.slice(-20);
    const avgSuccessRate = recentInteractions.reduce((sum, interaction) => {
      return sum + (interaction.execution_results.success_count > 0 ? 1 : 0);
    }, 0) / recentInteractions.length;
    
    // Adjust thresholds based on success rate
    if (avgSuccessRate < 0.7) {
      // Lower success rate - increase thresholds to be more selective
      this.config.auto_threshold = Math.min(0.95, this.config.auto_threshold + 0.05);
      this.config.prompt_threshold = Math.min(0.8, this.config.prompt_threshold + 0.05);
    } else if (avgSuccessRate > 0.9) {
      // High success rate - decrease thresholds to be more inclusive
      this.config.auto_threshold = Math.max(0.7, this.config.auto_threshold - 0.05);
      this.config.prompt_threshold = Math.max(0.5, this.config.prompt_threshold - 0.05);
    }
  }

  /**
   * Get current selection statistics
   */
  getStatistics() {
    const recentInteractions = this.feedbackHistory.slice(-20);
    
    return {
      total_interactions: this.feedbackHistory.length,
      recent_interactions: recentInteractions.length,
      avg_agents_selected: recentInteractions.reduce((sum, i) => 
        sum + i.selected_agents.length, 0
      ) / (recentInteractions.length || 1),
      success_rate: recentInteractions.reduce((sum, i) => 
        sum + (i.execution_results.success_count > 0 ? 1 : 0), 0
      ) / (recentInteractions.length || 1),
      current_thresholds: {
        auto: this.config.auto_threshold,
        prompt: this.config.prompt_threshold
      },
      top_patterns: Array.from(this.userPatterns.entries())
        .sort((a, b) => b[1].frequency - a[1].frequency)
        .slice(0, 5)
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.contextMonitor.updateConfig(newConfig);
  }

  /**
   * Utility methods
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}

export default IntelligentAutoSelector;