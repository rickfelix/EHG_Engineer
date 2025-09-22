/**
 * Response Integration System
 * Orchestrates the entire invisible sub-agent workflow
 * Provides the main interface for seamless integration with Claude Code
 */

import PromptEnhancer from './prompt-enhancer.js';
import LearningSystem from './learning-system.js';
import fs from 'fs/promises';
import path from 'path';

class ResponseIntegrator {
  constructor(config = {}) {
    // Initialize core systems
    this.promptEnhancer = new PromptEnhancer(config.openaiApiKey, config.projectRoot);
    this.learningSystem = new LearningSystem(
      config.supabaseUrl, 
      config.supabaseKey, 
      config.userId
    );
    
    // Integration configuration
    this.config = {
      enabled: true,
      async_processing: true,        // Process agents in background
      max_processing_time: 5000,     // Max time to wait for analysis
      fallback_on_error: true,       // Return original response on error
      learning_enabled: true,        // Enable learning from interactions
      cache_enabled: true,           // Cache responses for similar contexts
      debug_mode: false,             // Log detailed information
      
      // Response quality controls
      min_confidence_for_enhancement: 0.6,
      max_enhancement_ratio: 0.3,    // Enhancement should be max 30% of response
      priority_agent_threshold: 0.8, // When to prioritize agent insights
      
      // Performance controls
      parallel_agent_execution: true,
      max_concurrent_agents: 3,
      response_timeout: 3000,
      
      ...config
    };
    
    // State management
    this.activeRequests = new Map();
    this.responseCache = new Map();
    this.performanceMetrics = {
      total_requests: 0,
      successful_enhancements: 0,
      cache_hits: 0,
      avg_processing_time: 0,
      error_rate: 0
    };
    
    // Session management
    this.sessionId = this.generateSessionId();
    this.requestCounter = 0;
  }

  /**
   * Main integration point - enhance Claude response with sub-agent insights
   * @param {string} userPrompt - Original user prompt
   * @param {string} claudeResponse - Claude's original response
   * @param {object} context - Additional context (files, git, etc.)
   * @returns {Promise<object>} Enhanced response with metadata
   */
  async integrateResponse(userPrompt, claudeResponse, context = {}) {
    if (!this.config.enabled) {
      return {
        enhanced_response: claudeResponse,
        original_response: claudeResponse,
        enhancement_applied: false,
        reason: 'Integration disabled'
      };
    }

    const requestId = this.generateRequestId();
    const startTime = Date.now();

    try {
      // Track active request
      this.activeRequests.set(requestId, {
        user_prompt: userPrompt,
        start_time: startTime,
        status: 'processing'
      });

      // Check cache first
      const cacheKey = this.generateCacheKey(userPrompt, context);
      if (this.config.cache_enabled && this.responseCache.has(cacheKey)) {
        const cached = this.responseCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 300000) { // 5 minute cache
          this.performanceMetrics.cache_hits++;
          return this.formatResponse(claudeResponse, cached.enhancement, true, requestId);
        }
      }

      // Get optimal configuration for this context
      const optimalConfig = await this.learningSystem.getOptimalConfig(context);
      this.promptEnhancer.updateConfig(optimalConfig);

      // Process with timeout
      const enhancementPromise = this.config.async_processing ?
        this.processAsynchronously(userPrompt, claudeResponse, context, requestId) :
        this.processSynchronously(userPrompt, claudeResponse, context, requestId);

      const result = await Promise.race([
        enhancementPromise,
        this.createTimeoutPromise(this.config.max_processing_time)
      ]);

      // Handle timeout
      if (result.timeout) {
        console.warn('Response integration timed out');
        return this.handleTimeout(claudeResponse, requestId);
      }

      // Cache successful result
      if (this.config.cache_enabled && result.enhancement_applied) {
        this.responseCache.set(cacheKey, {
          enhancement: result.enhancement_data,
          timestamp: Date.now()
        });
      }

      // Record interaction for learning
      if (this.config.learning_enabled) {
        this.recordInteractionAsync(userPrompt, context, result, requestId, startTime);
      }

      // Update performance metrics
      this.updatePerformanceMetrics(startTime, true, result.enhancement_applied);

      return result;

    } catch (error) {
      console.error('Response integration failed:', error);
      
      // Update error metrics
      this.updatePerformanceMetrics(startTime, false, false);
      
      // Return original response on error (if configured)
      if (this.config.fallback_on_error) {
        return {
          enhanced_response: claudeResponse,
          original_response: claudeResponse,
          enhancement_applied: false,
          error: error.message,
          request_id: requestId
        };
      } else {
        throw error;
      }
    } finally {
      // Clean up active request
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Process enhancement synchronously
   */
  async processSynchronously(userPrompt, claudeResponse, context, requestId) {
    const enhancedResponse = await this.promptEnhancer.enhanceResponse(
      userPrompt,
      claudeResponse,
      context
    );

    const enhancementApplied = enhancedResponse !== claudeResponse;
    
    return {
      enhanced_response: enhancedResponse,
      original_response: claudeResponse,
      enhancement_applied: enhancementApplied,
      processing_type: 'synchronous',
      request_id: requestId,
      enhancement_data: enhancementApplied ? {
        agent_count: context.agent_insights?.length || 0,
        confidence_score: context.total_confidence || 0
      } : null
    };
  }

  /**
   * Process enhancement asynchronously (preferred method)
   */
  async processAsynchronously(userPrompt, claudeResponse, context, requestId) {
    // Start enhancement in background
    const enhancementPromise = this.promptEnhancer.enhanceResponse(
      userPrompt,
      claudeResponse,
      context
    );

    // If enhancement takes too long, return original with promise for later
    const quickResult = await Promise.race([
      enhancementPromise,
      this.createQuickTimeoutPromise(1000) // 1 second for quick response
    ]);

    if (quickResult.timeout) {
      // Return original immediately, continue processing in background
      this.continueBackgroundProcessing(enhancementPromise, requestId);
      
      return {
        enhanced_response: claudeResponse,
        original_response: claudeResponse,
        enhancement_applied: false,
        processing_type: 'async_timeout',
        background_processing: true,
        request_id: requestId
      };
    } else {
      // Enhancement completed quickly
      const enhancementApplied = quickResult !== claudeResponse;
      
      return {
        enhanced_response: quickResult,
        original_response: claudeResponse,
        enhancement_applied: enhancementApplied,
        processing_type: 'async_complete',
        request_id: requestId,
        enhancement_data: enhancementApplied ? await this.extractEnhancementData(quickResult, claudeResponse) : null
      };
    }
  }

  /**
   * Continue processing enhancement in background
   */
  async continueBackgroundProcessing(enhancementPromise, requestId) {
    try {
      const result = await enhancementPromise;
      
      // Update cache with background result
      if (this.config.cache_enabled && result !== this.activeRequests.get(requestId)?.original_response) {
        const cacheKey = this.activeRequests.get(requestId)?.cache_key;
        if (cacheKey) {
          this.responseCache.set(cacheKey, {
            enhancement: await this.extractEnhancementData(result, this.activeRequests.get(requestId)?.original_response),
            timestamp: Date.now(),
            background_processed: true
          });
        }
      }

      if (this.config.debug_mode) {
        console.log('Background processing completed for request:', requestId);
      }
    } catch (error) {
      console.error('Background processing failed:', error);
    }
  }

  /**
   * Adaptive enhancement based on context and learning
   */
  async adaptiveEnhancement(userPrompt, claudeResponse, context) {
    // Get similar patterns from learning system
    const similarPatterns = await this.learningSystem.getSimilarPatterns(context, 3);
    
    // Get agent recommendations based on patterns
    const agentRecommendations = await this.learningSystem.getAgentRecommendations(context);
    
    // Adjust enhancement parameters based on patterns
    const adaptiveContext = {
      ...context,
      similar_patterns: similarPatterns,
      agent_recommendations: agentRecommendations,
      confidence_boost: this.calculateConfidenceBoost(similarPatterns)
    };

    // Use adaptive enhancement
    return await this.promptEnhancer.adaptiveEnhance(userPrompt, claudeResponse, adaptiveContext);
  }

  /**
   * Smart context analysis for better integration
   */
  async analyzeContext(userPrompt, existingContext) {
    const enhancedContext = { ...existingContext };

    try {
      // Auto-detect file context if not provided
      if (!enhancedContext.file_context) {
        enhancedContext.file_context = await this.detectFileContext();
      }

      // Auto-detect git context if not provided
      if (!enhancedContext.git_context) {
        enhancedContext.git_context = await this.detectGitContext();
      }

      // Auto-detect project context if not provided
      if (!enhancedContext.project_context) {
        enhancedContext.project_context = await this.detectProjectContext();
      }

      // Analyze prompt characteristics
      enhancedContext.prompt_analysis = {
        length: userPrompt.length,
        complexity: this.calculatePromptComplexity(userPrompt),
        has_code: /```/.test(userPrompt),
        has_questions: /\?/.test(userPrompt),
        intent: await this.detectIntent(userPrompt)
      };

      return enhancedContext;
    } catch (error) {
      console.error('Context analysis failed:', error);
      return enhancedContext;
    }
  }

  /**
   * Record interaction for learning (async)
   */
  async recordInteractionAsync(userPrompt, context, result, requestId, startTime) {
    try {
      const processingTime = Date.now() - startTime;
      
      const interaction = {
        session_id: this.sessionId,
        prompt_text: this.config.debug_mode ? userPrompt : null, // Only store if debug mode
        file_context: context.file_context,
        git_context: context.git_context,
        error_context: context.error_context,
        project_context: context.project_context,
        analysis_method: 'integrated',
        selected_agents: result.enhancement_data?.selected_agents || [],
        total_agents_considered: result.enhancement_data?.agent_count || 0,
        selection_confidence: result.enhancement_data?.confidence_score || 0,
        agents_executed: result.enhancement_data?.agent_count || 0,
        execution_time_ms: processingTime,
        success_count: result.enhancement_applied ? 1 : 0,
        error_count: result.error ? 1 : 0,
        enhancement_applied: result.enhancement_applied,
        enhancement_style: result.enhancement_data?.style,
        enhancement_length: result.enhancement_data?.length,
        total_processing_time: processingTime,
        cache_hit: result.cache_hit || false
      };

      // Record in background (don't wait)
      this.learningSystem.recordInteraction(interaction).catch(error => {
        console.error('Failed to record interaction:', error);
      });
    } catch (error) {
      console.error('Error preparing interaction record:', error);
    }
  }

  /**
   * Provide user feedback interface
   */
  async recordUserFeedback(requestId, feedback) {
    try {
      const interaction = this.getInteractionByRequestId(requestId);
      if (!interaction) {
        console.warn('No interaction found for feedback:', requestId);
        return false;
      }

      return await this.learningSystem.recordFeedback(
        interaction.id,
        'explicit',
        feedback.rating,
        {
          source: 'user_explicit',
          category: feedback.category || 'overall',
          action: feedback.action || 'rating',
          comments: feedback.comments
        }
      );
    } catch (error) {
      console.error('Error recording user feedback:', error);
      return false;
    }
  }

  /**
   * Get system statistics and performance metrics
   */
  getSystemStatistics() {
    const learningStats = this.promptEnhancer.getStatistics();
    
    return {
      integration: {
        ...this.performanceMetrics,
        active_requests: this.activeRequests.size,
        cache_size: this.responseCache.size,
        session_id: this.sessionId
      },
      learning: learningStats,
      configuration: {
        enabled: this.config.enabled,
        async_processing: this.config.async_processing,
        learning_enabled: this.config.learning_enabled,
        cache_enabled: this.config.cache_enabled
      }
    };
  }

  /**
   * Health check for the integration system
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      checks: {},
      timestamp: new Date().toISOString()
    };

    try {
      // Check prompt enhancer
      health.checks.prompt_enhancer = await this.checkPromptEnhancerHealth();
      
      // Check learning system
      health.checks.learning_system = await this.checkLearningSystemHealth();
      
      // Check performance
      health.checks.performance = this.checkPerformanceHealth();
      
      // Overall status
      const allHealthy = Object.values(health.checks).every(check => check.status === 'healthy');
      health.status = allHealthy ? 'healthy' : 'degraded';
      
    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
    }

    return health;
  }

  /**
   * Configuration management
   */
  updateConfiguration(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.promptEnhancer.updateConfig(newConfig);
    
    if (this.config.debug_mode) {
      console.log('Configuration updated:', newConfig);
    }
  }

  getConfiguration() {
    return {
      integrator: { ...this.config },
      enhancer: this.promptEnhancer.getConfig(),
      learning: this.learningSystem.config
    };
  }

  /**
   * Utility methods
   */
  generateSessionId() {
    return 'session_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
  }

  generateRequestId() {
    return `${this.sessionId}_req_${++this.requestCounter}`;
  }

  generateCacheKey(userPrompt, context) {
    const keyData = {
      prompt_hash: this.hashString(userPrompt),
      file_context: context.file_context?.current_files || [],
      project: context.project_context?.framework || 'unknown'
    };
    return this.hashString(JSON.stringify(keyData));
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

  calculatePromptComplexity(prompt) {
    let complexity = 0;
    complexity += Math.min(prompt.length / 1000, 2);
    complexity += (prompt.match(/\n/g) || []).length * 0.1;
    complexity += (prompt.match(/```/g) || []).length * 0.5;
    return Math.min(complexity, 5);
  }

  calculateConfidenceBoost(similarPatterns) {
    if (!similarPatterns.length) return 0;
    
    const avgSuccess = similarPatterns.reduce((sum, p) => sum + p.success_rate, 0) / similarPatterns.length;
    const avgFreq = similarPatterns.reduce((sum, p) => sum + Math.log(p.frequency_count + 1), 0) / similarPatterns.length;
    
    return Math.min(0.2, avgSuccess * avgFreq * 0.1);
  }

  async detectIntent(prompt) {
    // Simple intent detection (could be enhanced with NLP)
    const intents = {
      question: /\?|how|what|why|when|where|explain|help/i,
      fix: /fix|bug|error|issue|problem|broken|not working/i,
      create: /create|make|build|generate|add|implement/i,
      optimize: /optimize|improve|better|faster|performance/i,
      review: /review|check|validate|analyze|assess/i
    };

    for (const [intent, pattern] of Object.entries(intents)) {
      if (pattern.test(prompt)) {
        return intent;
      }
    }
    return 'other';
  }

  createTimeoutPromise(timeout) {
    return new Promise(resolve => {
      setTimeout(() => resolve({ timeout: true }), timeout);
    });
  }

  createQuickTimeoutPromise(timeout) {
    return new Promise(resolve => {
      setTimeout(() => resolve({ timeout: true }), timeout);
    });
  }

  handleTimeout(originalResponse, requestId) {
    return {
      enhanced_response: originalResponse,
      original_response: originalResponse,
      enhancement_applied: false,
      timeout: true,
      request_id: requestId
    };
  }

  formatResponse(originalResponse, enhancementData, cacheHit, requestId) {
    return {
      enhanced_response: enhancementData?.enhanced_response || originalResponse,
      original_response: originalResponse,
      enhancement_applied: !!enhancementData,
      cache_hit: cacheHit,
      request_id: requestId,
      enhancement_data: enhancementData
    };
  }

  updatePerformanceMetrics(startTime, success, enhancementApplied) {
    const processingTime = Date.now() - startTime;
    
    this.performanceMetrics.total_requests++;
    if (success) {
      if (enhancementApplied) {
        this.performanceMetrics.successful_enhancements++;
      }
    } else {
      this.performanceMetrics.error_rate = 
        (this.performanceMetrics.error_rate * (this.performanceMetrics.total_requests - 1) + 1) / 
        this.performanceMetrics.total_requests;
    }
    
    this.performanceMetrics.avg_processing_time = 
      (this.performanceMetrics.avg_processing_time * (this.performanceMetrics.total_requests - 1) + processingTime) / 
      this.performanceMetrics.total_requests;
  }

  async extractEnhancementData(enhancedResponse, originalResponse) {
    // Extract metadata about the enhancement
    const lengthDifference = enhancedResponse.length - originalResponse.length;
    
    return {
      enhanced_response: enhancedResponse,
      length_difference: lengthDifference,
      enhancement_ratio: lengthDifference / originalResponse.length,
      style: 'adaptive',
      timestamp: new Date().toISOString()
    };
  }

  async checkPromptEnhancerHealth() {
    try {
      const testResult = await this.promptEnhancer.testEnhancement(
        'test prompt',
        'test response'
      );
      
      return {
        status: 'healthy',
        response_time: Date.now(),
        test_result: !!testResult
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkLearningSystemHealth() {
    try {
      // Simple health check - try to get config
      const config = await this.learningSystem.getOptimalConfig();
      
      return {
        status: config ? 'healthy' : 'degraded',
        has_config: !!config
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  checkPerformanceHealth() {
    const errorRate = this.performanceMetrics.error_rate;
    const avgTime = this.performanceMetrics.avg_processing_time;
    
    let status = 'healthy';
    if (errorRate > 0.1) status = 'degraded';
    if (errorRate > 0.25 || avgTime > 10000) status = 'unhealthy';
    
    return {
      status,
      error_rate: errorRate,
      avg_processing_time: avgTime,
      total_requests: this.performanceMetrics.total_requests
    };
  }

  getInteractionByRequestId(requestId) {
    // This would query the database for the interaction
    // For now, return mock data
    return { id: 'mock_interaction_id' };
  }

  async detectFileContext() {
    // Auto-detect current files (would integrate with IDE/editor)
    return { current_files: [], project_type: 'unknown' };
  }

  async detectGitContext() {
    // Auto-detect git status
    return { current_branch: 'unknown', recent_changes: [] };
  }

  async detectProjectContext() {
    // Auto-detect project type and framework
    return { framework: 'unknown', languages: [] };
  }
}

export default ResponseIntegrator;