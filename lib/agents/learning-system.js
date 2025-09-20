/**
 * Learning & Adaptation System
 * Implements machine learning capabilities for the invisible sub-agent system
 * Continuously improves agent selection based on user patterns and feedback
 */

import { createClient } from '@supabase/supabase-js';

class LearningSystem {
  constructor(supabaseUrl, supabaseKey, userId = null) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.userId = userId;
    
    // Learning configuration
    this.config = {
      learning_enabled: true,
      adaptation_window: 50,        // Number of interactions to consider
      min_interactions: 10,         // Minimum interactions before learning
      learning_rate: 0.1,          // How aggressively to adapt
      confidence_decay: 0.95,      // Decay factor for old patterns
      pattern_similarity_threshold: 0.8, // When to consider patterns similar
      feedback_weight: 2.0,        // How much to weight explicit feedback
      performance_target: 0.85     // Target success rate
    };
    
    // Cache for frequently accessed data
    this.patternCache = new Map();
    this.configCache = new Map();
    this.performanceCache = new Map();
    
    // Learning state
    this.adaptationQueue = [];
    this.lastLearningCycle = null;
  }

  /**
   * Record an interaction for learning
   * @param {object} interaction - Complete interaction data
   * @returns {Promise<string>} Interaction ID
   */
  async recordInteraction(interaction) {
    try {
      // Store interaction in history
      const { data: historyRecord, error: historyError } = await this.supabase
        .from('interaction_history')
        .insert({
          user_id: this.userId,
          session_id: interaction.session_id,
          prompt_hash: this.hashString(interaction.prompt_text || ''),
          prompt_length: (interaction.prompt_text || '').length,
          prompt_complexity: this.calculatePromptComplexity(interaction.prompt_text || ''),
          file_context: interaction.file_context || {},
          git_context: interaction.git_context || {},
          error_context: interaction.error_context || {},
          project_context: interaction.project_context || {},
          analysis_method: interaction.analysis_method || 'rule_based',
          selected_agents: interaction.selected_agents || [],
          total_agents_considered: interaction.total_agents_considered || 0,
          selection_confidence: interaction.selection_confidence || 0,
          selection_reasoning: interaction.selection_reasoning || '',
          agents_executed: interaction.agents_executed || 0,
          execution_time_ms: interaction.execution_time_ms || 0,
          success_count: interaction.success_count || 0,
          error_count: interaction.error_count || 0,
          enhancement_applied: interaction.enhancement_applied || false,
          enhancement_style: interaction.enhancement_style || null,
          enhancement_length: interaction.enhancement_length || 0,
          total_processing_time: interaction.total_processing_time || 0,
          cache_hit: interaction.cache_hit || false
        })
        .select('id')
        .single();

      if (historyError) {
        console.error('Failed to record interaction:', historyError);
        return null;
      }

      const interactionId = historyRecord.id;

      // Update or create context pattern
      await this.updateContextPattern(interaction, interactionId);
      
      // Update agent performance metrics
      await this.updateAgentMetrics(interaction);
      
      // Check if adaptation is needed
      if (this.shouldTriggerAdaptation()) {
        this.queueAdaptation(interactionId);
      }
      
      return interactionId;
      
    } catch (error) {
      console.error('Error recording interaction:', error);
      return null;
    }
  }

  /**
   * Update or create context pattern based on interaction
   */
  async updateContextPattern(interaction, interactionId) {
    try {
      const patternHash = this.generatePatternHash(interaction);
      
      // Check if pattern exists
      const { data: existingPattern } = await this.supabase
        .from('user_context_patterns')
        .select('*')
        .eq('pattern_hash', patternHash)
        .eq('user_id', this.userId)
        .single();

      const isSuccessful = (interaction.success_count || 0) > 0;
      
      if (existingPattern) {
        // Update existing pattern
        const newFrequency = existingPattern.frequency_count + 1;
        const newSuccessRate = (
          (existingPattern.success_rate * existingPattern.frequency_count) + 
          (isSuccessful ? 1 : 0)
        ) / newFrequency;
        
        await this.supabase
          .from('user_context_patterns')
          .update({
            frequency_count: newFrequency,
            success_rate: newSuccessRate,
            avg_confidence: this.updateAvgConfidence(
              existingPattern.avg_confidence, 
              interaction.selection_confidence || 0,
              newFrequency
            ),
            avg_execution_time: this.updateAvgTime(
              existingPattern.avg_execution_time,
              interaction.execution_time_ms || 0,
              newFrequency
            ),
            last_seen: new Date().toISOString(),
            last_successful: isSuccessful ? new Date().toISOString() : existingPattern.last_successful
          })
          .eq('id', existingPattern.id);
      } else {
        // Create new pattern
        await this.supabase
          .from('user_context_patterns')
          .insert({
            pattern_hash: patternHash,
            user_id: this.userId,
            prompt_keywords: this.extractKeywords(interaction.prompt_text || ''),
            file_patterns: this.extractFilePatterns(interaction.file_context || {}),
            git_patterns: this.extractGitPatterns(interaction.git_context || {}),
            project_patterns: this.extractProjectPatterns(interaction.project_context || {}),
            selected_agents: interaction.selected_agents || [],
            coordination_strategy: interaction.coordination_strategy || 'parallel',
            success_rate: isSuccessful ? 1.0 : 0.0,
            avg_confidence: interaction.selection_confidence || 0,
            avg_execution_time: interaction.execution_time_ms || 0,
            last_successful: isSuccessful ? new Date().toISOString() : null
          });
      }
      
      // Update interaction with pattern reference
      await this.supabase
        .from('interaction_history')
        .update({ pattern_matched: patternHash })
        .eq('id', interactionId);
        
    } catch (error) {
      console.error('Error updating context pattern:', error);
    }
  }

  /**
   * Update agent performance metrics
   */
  async updateAgentMetrics(interaction) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const selectedAgents = interaction.selected_agents || [];
      
      for (const agentInfo of selectedAgents) {
        const agentCode = agentInfo.agent_code;
        const isSuccessful = (interaction.success_count || 0) > 0;
        
        // Get or create daily metrics
        const { data: metrics } = await this.supabase
          .from('agent_performance_metrics')
          .select('*')
          .eq('agent_code', agentCode)
          .eq('measurement_date', today)
          .eq('measurement_window', 'daily')
          .single();

        if (metrics) {
          // Update existing metrics
          await this.supabase
            .from('agent_performance_metrics')
            .update({
              total_executions: metrics.total_executions + 1,
              successful_executions: metrics.successful_executions + (isSuccessful ? 1 : 0),
              failed_executions: metrics.failed_executions + (isSuccessful ? 0 : 1),
              times_selected: metrics.times_selected + 1,
              avg_selection_confidence: this.updateAvgConfidence(
                metrics.avg_selection_confidence,
                agentInfo.confidence || 0,
                metrics.times_selected + 1
              ),
              avg_execution_time: this.updateAvgTime(
                metrics.avg_execution_time,
                interaction.execution_time_ms || 0,
                metrics.total_executions + 1
              )
            })
            .eq('id', metrics.id);
        } else {
          // Create new metrics
          await this.supabase
            .from('agent_performance_metrics')
            .insert({
              agent_code: agentCode,
              measurement_date: today,
              total_executions: 1,
              successful_executions: isSuccessful ? 1 : 0,
              failed_executions: isSuccessful ? 0 : 1,
              times_selected: 1,
              avg_selection_confidence: agentInfo.confidence || 0,
              avg_execution_time: interaction.execution_time_ms || 0
            });
        }
      }
    } catch (error) {
      console.error('Error updating agent metrics:', error);
    }
  }

  /**
   * Record user feedback for learning
   */
  async recordFeedback(interactionId, feedbackType, feedbackValue, metadata = {}) {
    try {
      const { data, error } = await this.supabase
        .from('feedback_events')
        .insert({
          interaction_id: interactionId,
          user_id: this.userId,
          feedback_type: feedbackType,
          feedback_source: metadata.source || 'user_explicit',
          feedback_value: feedbackValue,
          feedback_category: metadata.category || 'agent_selection',
          specific_agent: metadata.agent || null,
          user_action: metadata.action || 'rating',
          time_to_action: metadata.time_to_action || null,
          feedback_metadata: metadata
        })
        .select('id')
        .single();

      if (!error) {
        // Trigger immediate learning from feedback
        await this.learnFromFeedback(data.id, feedbackType, feedbackValue);
      }
      
      return !error;
    } catch (error) {
      console.error('Error recording feedback:', error);
      return false;
    }
  }

  /**
   * Learn from explicit feedback
   */
  async learnFromFeedback(feedbackId, feedbackType, feedbackValue) {
    try {
      // Get feedback details
      const { data: feedback } = await this.supabase
        .from('feedback_events')
        .select(`
          *,
          interaction_history (
            pattern_matched,
            selected_agents,
            selection_confidence
          )
        `)
        .eq('id', feedbackId)
        .single();

      if (!feedback || !feedback.interaction_history) return;

      const patternHash = feedback.interaction_history.pattern_matched;
      const selectedAgents = feedback.interaction_history.selected_agents;
      
      // Adjust pattern confidence based on feedback
      if (patternHash && feedbackValue !== null) {
        await this.adjustPatternConfidence(patternHash, feedbackValue);
      }
      
      // Adjust agent weights based on feedback
      if (feedback.specific_agent && selectedAgents) {
        await this.adjustAgentWeights(feedback.specific_agent, feedbackValue);
      }
      
      // Mark feedback as triggering adaptation
      await this.supabase
        .from('feedback_events')
        .update({ triggered_adaptation: true })
        .eq('id', feedbackId);
        
    } catch (error) {
      console.error('Error learning from feedback:', error);
    }
  }

  /**
   * Get optimal configuration for user/context
   */
  async getOptimalConfig(context = {}) {
    try {
      // Get user-specific configuration
      let config = this.configCache.get(this.userId);
      
      if (!config) {
        const { data } = await this.supabase
          .from('learning_configurations')
          .select('*')
          .eq('config_scope', 'user')
          .eq('scope_id', this.userId)
          .single();
          
        config = data || await this.getGlobalConfig();
        this.configCache.set(this.userId, config);
      }
      
      // Apply context-specific adjustments
      return this.applyContextualAdjustments(config, context);
    } catch (error) {
      console.error('Error getting optimal config:', error);
      return this.getDefaultConfig();
    }
  }

  /**
   * Get similar patterns for context prediction
   */
  async getSimilarPatterns(currentContext, limit = 5) {
    try {
      const contextHash = this.generatePatternHash(currentContext);
      
      // First try exact match
      const { data: exactMatch } = await this.supabase
        .from('user_context_patterns')
        .select('*')
        .eq('pattern_hash', contextHash)
        .eq('user_id', this.userId)
        .single();
        
      if (exactMatch) {
        return [{ ...exactMatch, similarity: 1.0 }];
      }
      
      // Get patterns with similar characteristics
      const keywords = this.extractKeywords(currentContext.prompt_text || '');
      const filePatterns = this.extractFilePatterns(currentContext.file_context || {});
      
      const { data: similarPatterns } = await this.supabase
        .from('user_context_patterns')
        .select('*')
        .eq('user_id', this.userId)
        .order('success_rate', { ascending: false })
        .order('frequency_count', { ascending: false })
        .limit(limit * 3); // Get more to filter
        
      if (!similarPatterns) return [];
      
      // Calculate similarity scores
      const scoredPatterns = similarPatterns
        .map(pattern => ({
          ...pattern,
          similarity: this.calculatePatternSimilarity(
            { keywords, filePatterns },
            {
              keywords: pattern.prompt_keywords || [],
              filePatterns: pattern.file_patterns || []
            }
          )
        }))
        .filter(p => p.similarity >= this.config.pattern_similarity_threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
        
      return scoredPatterns;
    } catch (error) {
      console.error('Error getting similar patterns:', error);
      return [];
    }
  }

  /**
   * Adapt thresholds based on performance
   */
  async adaptThresholds() {
    try {
      const recentPerformance = await this.getRecentPerformance();
      
      if (recentPerformance.total_interactions < this.config.min_interactions) {
        return; // Not enough data
      }
      
      const currentConfig = await this.getOptimalConfig();
      const targetSuccessRate = this.config.performance_target;
      const actualSuccessRate = recentPerformance.success_rate;
      
      let newAutoThreshold = currentConfig.auto_threshold;
      let newPromptThreshold = currentConfig.prompt_threshold;
      
      // Adjust based on performance gap
      const performanceGap = actualSuccessRate - targetSuccessRate;
      const adjustment = performanceGap * this.config.learning_rate;
      
      if (performanceGap < -0.1) {
        // Performance below target - be more selective
        newAutoThreshold = Math.min(0.95, currentConfig.auto_threshold + Math.abs(adjustment));
        newPromptThreshold = Math.min(0.85, currentConfig.prompt_threshold + Math.abs(adjustment));
      } else if (performanceGap > 0.1) {
        // Performance above target - be more inclusive
        newAutoThreshold = Math.max(0.6, currentConfig.auto_threshold - adjustment);
        newPromptThreshold = Math.max(0.4, currentConfig.prompt_threshold - adjustment);
      }
      
      // Update configuration
      await this.updateLearningConfig({
        auto_threshold: newAutoThreshold,
        prompt_threshold: newPromptThreshold,
        current_success_rate: actualSuccessRate,
        total_adaptations: (currentConfig.total_adaptations || 0) + 1,
        last_adaptation: new Date().toISOString(),
        adaptation_direction: this.getAdaptationDirection(adjustment)
      });
      
      // Clear cache
      this.configCache.delete(this.userId);
      
      return {
        previous: {
          auto_threshold: currentConfig.auto_threshold,
          prompt_threshold: currentConfig.prompt_threshold
        },
        new: {
          auto_threshold: newAutoThreshold,
          prompt_threshold: newPromptThreshold
        },
        performance_gap: performanceGap,
        adjustment
      };
      
    } catch (error) {
      console.error('Error adapting thresholds:', error);
      return null;
    }
  }

  /**
   * Get agent effectiveness recommendations
   */
  async getAgentRecommendations(context) {
    try {
      const similarPatterns = await this.getSimilarPatterns(context, 10);
      
      if (similarPatterns.length === 0) {
        return this.getDefaultAgentWeights();
      }
      
      // Aggregate agent performance across similar patterns
      const agentScores = new Map();
      
      for (const pattern of similarPatterns) {
        const agents = pattern.selected_agents || [];
        const patternWeight = pattern.similarity * pattern.success_rate * Math.log(pattern.frequency_count + 1);
        
        for (const agent of agents) {
          const currentScore = agentScores.get(agent.agent_code) || 0;
          agentScores.set(
            agent.agent_code,
            currentScore + (agent.confidence * patternWeight)
          );
        }
      }
      
      // Convert to recommendations
      const recommendations = Array.from(agentScores.entries())
        .map(([agent_code, score]) => ({
          agent_code,
          recommended_confidence: Math.min(1.0, score / similarPatterns.length),
          pattern_support: similarPatterns.filter(p => 
            p.selected_agents.some(a => a.agent_code === agent_code)
          ).length,
          avg_pattern_success: this.calculateAvgPatternSuccess(similarPatterns, agent_code)
        }))
        .sort((a, b) => b.recommended_confidence - a.recommended_confidence);
        
      return recommendations;
    } catch (error) {
      console.error('Error getting agent recommendations:', error);
      return [];
    }
  }

  /**
   * Utility methods for calculations
   */
  updateAvgConfidence(currentAvg, newValue, newCount) {
    return ((currentAvg * (newCount - 1)) + newValue) / newCount;
  }

  updateAvgTime(currentAvg, newValue, newCount) {
    return ((currentAvg * (newCount - 1)) + newValue) / newCount;
  }

  calculatePromptComplexity(prompt) {
    let complexity = 0;
    complexity += Math.min(prompt.length / 1000, 2); // Length factor
    complexity += (prompt.match(/\n/g) || []).length * 0.1; // Line breaks
    complexity += (prompt.match(/[?!]/g) || []).length * 0.2; // Questions/exclamations
    return Math.min(complexity, 5);
  }

  extractKeywords(text) {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .filter(w => !['this', 'that', 'with', 'from', 'they', 'have', 'will', 'been', 'were'].includes(w));
    
    // Get frequency and return top keywords
    const freq = {};
    words.forEach(w => freq[w] = (freq[w] || 0) + 1);
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  extractFilePatterns(fileContext) {
    const files = fileContext.current_files || [];
    return files.map(file => {
      const ext = file.split('.').pop() || 'unknown';
      const dir = file.includes('/') ? file.split('/').slice(0, -1).join('/') : '';
      return { extension: ext, directory: dir };
    });
  }

  extractGitPatterns(gitContext) {
    return {
      branch: gitContext.current_branch || 'unknown',
      has_changes: (gitContext.recent_changes || []).length > 0,
      commit_count: (gitContext.recent_commits || []).length
    };
  }

  extractProjectPatterns(projectContext) {
    return {
      framework: projectContext.framework || 'unknown',
      languages: projectContext.languages || [],
      type: projectContext.project_type || 'unknown'
    };
  }

  generatePatternHash(interaction) {
    const hashData = {
      keywords: this.extractKeywords(interaction.prompt_text || '').slice(0, 5),
      files: (interaction.file_context?.current_files || []).slice(0, 3),
      framework: interaction.project_context?.framework || 'unknown'
    };
    return this.hashString(JSON.stringify(hashData));
  }

  calculatePatternSimilarity(pattern1, pattern2) {
    const keywordSim = this.calculateArraySimilarity(pattern1.keywords, pattern2.keywords);
    const fileSim = this.calculateFileSimilarity(pattern1.filePatterns, pattern2.filePatterns);
    return (keywordSim * 0.7) + (fileSim * 0.3);
  }

  calculateArraySimilarity(arr1, arr2) {
    if (!arr1.length && !arr2.length) return 1;
    if (!arr1.length || !arr2.length) return 0;
    
    const intersection = arr1.filter(x => arr2.includes(x));
    const union = [...new Set([...arr1, ...arr2])];
    return intersection.length / union.length;
  }

  calculateFileSimilarity(files1, files2) {
    if (!files1.length && !files2.length) return 1;
    if (!files1.length || !files2.length) return 0;
    
    const ext1 = files1.map(f => f.extension);
    const ext2 = files2.map(f => f.extension);
    return this.calculateArraySimilarity(ext1, ext2);
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

  shouldTriggerAdaptation() {
    const timeSinceLastLearning = this.lastLearningCycle ? 
      Date.now() - this.lastLearningCycle : Infinity;
    return timeSinceLastLearning > 300000; // 5 minutes
  }

  queueAdaptation(interactionId) {
    this.adaptationQueue.push({
      interaction_id: interactionId,
      timestamp: Date.now()
    });
  }

  getAdaptationDirection(adjustment) {
    if (Math.abs(adjustment) < 0.01) return 'stable';
    return adjustment > 0 ? 'increasing' : 'decreasing';
  }

  async getGlobalConfig() {
    const { data } = await this.supabase
      .from('learning_configurations')
      .select('*')
      .eq('config_scope', 'global')
      .is('scope_id', null)
      .single();
    return data || this.getDefaultConfig();
  }

  getDefaultConfig() {
    return {
      auto_threshold: 0.8,
      prompt_threshold: 0.6,
      max_agents: 3,
      agent_weights: {},
      context_multipliers: {}
    };
  }

  applyContextualAdjustments(config, context) {
    // Apply context-specific multipliers
    const adjustedConfig = { ...config };
    
    if (context.error_context && Object.keys(context.error_context).length > 0) {
      adjustedConfig.auto_threshold *= 0.9; // Be more aggressive with errors
    }
    
    if (context.project_context?.framework === 'unknown') {
      adjustedConfig.auto_threshold *= 1.1; // Be more conservative with unknown projects
    }
    
    return adjustedConfig;
  }

  async getRecentPerformance(days = 7) {
    const { data } = await this.supabase
      .from('interaction_history')
      .select('success_count, total_agents_considered')
      .eq('user_id', this.userId)
      .gte('interaction_timestamp', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
      
    if (!data || data.length === 0) {
      return { success_rate: 0, total_interactions: 0 };
    }
    
    const totalSuccess = data.reduce((sum, i) => sum + (i.success_count > 0 ? 1 : 0), 0);
    return {
      success_rate: totalSuccess / data.length,
      total_interactions: data.length
    };
  }

  async updateLearningConfig(updates) {
    await this.supabase
      .from('learning_configurations')
      .upsert({
        config_scope: 'user',
        scope_id: this.userId,
        ...updates
      });
  }

  getDefaultAgentWeights() {
    return {
      SECURITY: 0.9,
      PERFORMANCE: 0.8,
      TESTING: 0.85,
      DATABASE: 0.85,
      DESIGN: 0.7,
      API: 0.75,
      COST: 0.6,
      DOCS: 0.65,
      DEPENDENCY: 0.7,
      DEBUG: 0.8
    };
  }

  calculateAvgPatternSuccess(patterns, agentCode) {
    const relevantPatterns = patterns.filter(p => 
      p.selected_agents.some(a => a.agent_code === agentCode)
    );
    
    if (relevantPatterns.length === 0) return 0;
    
    return relevantPatterns.reduce((sum, p) => sum + p.success_rate, 0) / relevantPatterns.length;
  }

  async adjustPatternConfidence(patternHash, feedbackValue) {
    // Implement pattern confidence adjustment based on feedback
    console.log('Adjusting pattern confidence:', patternHash, feedbackValue);
  }

  async adjustAgentWeights(agentCode, feedbackValue) {
    // Implement agent weight adjustment based on feedback
    console.log('Adjusting agent weights:', agentCode, feedbackValue);
  }
}

export default LearningSystem;