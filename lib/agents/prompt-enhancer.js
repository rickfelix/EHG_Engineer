/**
 * Prompt Enhancement Pipeline
 * Seamlessly integrates sub-agent insights into Claude Code responses
 * Creates invisible, context-aware enhancement of user interactions
 */

import IntelligentAutoSelector from './auto-selector.js';
import _fs from 'fs/promises';
import _path from 'path';

class PromptEnhancer {
  constructor(openaiApiKey, projectRoot = process.cwd()) {
    this.autoSelector = new IntelligentAutoSelector(openaiApiKey, projectRoot);
    this.projectRoot = projectRoot;
    
    // Enhancement configuration
    this.config = {
      enabled: true,
      enhancement_style: 'seamless',     // seamless, sectioned, minimal
      max_enhancement_length: 500,       // Max characters per enhancement
      confidence_display: false,         // Show confidence scores
      reasoning_display: false,          // Show agent selection reasoning  
      timing_display: false,             // Show execution timing
      priority_filter: ['critical', 'high', 'medium'], // Which insights to include
      integration_method: 'inline'       // inline, appendix, sidebar
    };

    // Response templates for different enhancement styles
    this.templates = {
      seamless: {
        prefix: '',
        agent_intro: '',
        separator: '\n\n*',
        suffix: '*\n\n',
        priority_markers: {
          critical: '🚨 **Critical**: ',
          high: '⚠️ **Important**: ', 
          medium: '💡 **Note**: ',
          low: '📝 '
        }
      },
      sectioned: {
        prefix: '\n\n---\n\n## Additional Analysis\n\n',
        agent_intro: '### {agent_name} Analysis\n\n',
        separator: '\n\n',
        suffix: '\n\n---\n\n',
        priority_markers: {
          critical: '🚨 **Critical**: ',
          high: '⚠️ **High Priority**: ',
          medium: '📋 **Medium Priority**: ', 
          low: '📝 **Low Priority**: '
        }
      },
      minimal: {
        prefix: '\n\n*Additional considerations: ',
        agent_intro: '',
        separator: ' • ',
        suffix: '*\n\n',
        priority_markers: {
          critical: '⚠️ ',
          high: '• ',
          medium: '• ',
          low: '• '
        }
      }
    };
  }

  /**
   * Main enhancement entry point
   * @param {string} userPrompt - Original user prompt
   * @param {string} claudeResponse - Claude's original response  
   * @param {object} context - Additional context
   * @returns {Promise<string>} Enhanced response with sub-agent insights
   */
  async enhanceResponse(userPrompt, claudeResponse, context = {}) {
    if (!this.config.enabled) {
      return claudeResponse;
    }

    try {
      // Get sub-agent analysis
      const analysis = await this.autoSelector.processUserInput(userPrompt, context);
      
      // If no insights available, return original response
      if (!analysis.agent_insights || analysis.agent_insights.length === 0) {
        return claudeResponse;
      }

      // Filter insights by priority
      const filteredInsights = this.filterInsightsByPriority(analysis.agent_insights);
      
      if (filteredInsights.length === 0) {
        return claudeResponse;
      }

      // Generate enhancement based on style
      const enhancement = this.generateEnhancement(filteredInsights, analysis);
      
      // Integrate enhancement with original response
      const enhancedResponse = this.integrateEnhancement(
        claudeResponse, 
        enhancement, 
        analysis
      );

      return enhancedResponse;
      
    } catch (error) {
      console.error('Response enhancement failed:', error);
      return claudeResponse; // Return original on failure
    }
  }

  /**
   * Filter insights based on priority configuration
   */
  filterInsightsByPriority(insights) {
    return insights
      .filter(insight => this.config.priority_filter.includes(insight.priority))
      .sort(this.sortInsightsByImportance.bind(this));
  }

  /**
   * Sort insights by importance (priority + confidence)
   */
  sortInsightsByImportance(a, b) {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const aPriority = priorityOrder[a.priority] || 0;
    const bPriority = priorityOrder[b.priority] || 0;
    
    // First sort by priority
    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }
    
    // Then by confidence
    return b.confidence - a.confidence;
  }

  /**
   * Generate enhancement text from insights
   */
  generateEnhancement(insights, analysis) {
    const template = this.templates[this.config.enhancement_style];
    const enhancements = [];

    for (const insight of insights) {
      const enhancement = this.formatSingleInsight(insight, template);
      if (enhancement && enhancement.length <= this.config.max_enhancement_length) {
        enhancements.push(enhancement);
      }
    }

    if (enhancements.length === 0) {
      return '';
    }

    return {
      content: enhancements,
      template: template,
      metadata: {
        agent_count: analysis.agent_count,
        coordination_strategy: analysis.coordination_strategy,
        total_confidence: analysis.total_confidence
      }
    };
  }

  /**
   * Format single insight based on template
   */
  formatSingleInsight(insight, template) {
    const priorityMarker = template.priority_markers[insight.priority] || '';
    const agentIntro = template.agent_intro.replace('{agent_name}', insight.agent_name);
    
    // Build insight text
    let insightText = '';
    
    // Add priority marker and main insight
    insightText += priorityMarker + insight.insight;
    
    // Add recommendations if available
    if (insight.recommendations && insight.recommendations.length > 0) {
      const topRecommendations = insight.recommendations.slice(0, 2); // Limit to top 2
      if (topRecommendations.length > 0) {
        if (this.config.enhancement_style === 'seamless') {
          insightText += ' ' + topRecommendations.join(' ');
        } else {
          insightText += '\n\n**Recommendations:**\n• ' + topRecommendations.join('\n• ');
        }
      }
    }

    // Add confidence and timing if configured
    const metadata = this.buildInsightMetadata(insight);
    if (metadata) {
      insightText += metadata;
    }

    return agentIntro + insightText;
  }

  /**
   * Build metadata text for insight
   */
  buildInsightMetadata(insight) {
    const parts = [];
    
    if (this.config.confidence_display && insight.confidence) {
      parts.push(`${Math.round(insight.confidence * 100)}% confidence`);
    }
    
    if (this.config.timing_display && insight.execution_time) {
      parts.push(`${insight.execution_time}ms`);
    }
    
    if (this.config.reasoning_display && insight.reasoning) {
      parts.push(`Triggered: ${insight.reasoning}`);
    }
    
    return parts.length > 0 ? ` *(${parts.join(', ')})*` : '';
  }

  /**
   * Integrate enhancement with original response
   */
  integrateEnhancement(originalResponse, enhancement, _analysis) {
    if (!enhancement || !enhancement.content || enhancement.content.length === 0) {
      return originalResponse;
    }

    const template = enhancement.template;
    
    switch (this.config.integration_method) {
      case 'inline':
        return this.integrateInline(originalResponse, enhancement, template);
      case 'appendix':
        return this.integrateAsAppendix(originalResponse, enhancement, template);
      case 'sidebar':
        return this.integrateAsSidebar(originalResponse, enhancement, template);
      default:
        return this.integrateInline(originalResponse, enhancement, template);
    }
  }

  /**
   * Integrate insights inline with the response
   */
  integrateInline(originalResponse, enhancement, template) {
    // For seamless integration, weave insights into the response naturally
    if (this.config.enhancement_style === 'seamless') {
      return this.integrateSeamlessly(originalResponse, enhancement);
    }
    
    // For other styles, append at the end
    const enhancementText = template.prefix + 
      enhancement.content.join(template.separator) + 
      template.suffix;
    
    return originalResponse + enhancementText;
  }

  /**
   * Seamlessly integrate insights into response
   */
  integrateSeamlessly(originalResponse, enhancement) {
    const insights = enhancement.content;
    if (insights.length === 0) return originalResponse;
    
    // Find natural integration points in the response
    const integrationPoints = this.findIntegrationPoints(originalResponse);
    
    if (integrationPoints.length === 0) {
      // No good integration points found, append at end
      return originalResponse + '\n\n*' + insights.join(' ') + '*';
    }
    
    // Integrate insights at natural points
    let enhancedResponse = originalResponse;
    let insertedCount = 0;
    
    for (let i = 0; i < integrationPoints.length && insertedCount < insights.length; i++) {
      const point = integrationPoints[i];
      const insight = insights[insertedCount];
      
      // Insert insight at this point
      const before = enhancedResponse.substring(0, point.position);
      const after = enhancedResponse.substring(point.position);
      
      enhancedResponse = before + `\n\n*${insight}*\n\n` + after;
      insertedCount++;
    }
    
    // Add any remaining insights at the end
    if (insertedCount < insights.length) {
      const remainingInsights = insights.slice(insertedCount);
      enhancedResponse += '\n\n*' + remainingInsights.join(' ') + '*';
    }
    
    return enhancedResponse;
  }

  /**
   * Find natural points in response for insight integration
   */
  findIntegrationPoints(response) {
    const points = [];
    
    // Look for natural breaks (double newlines, section headers, etc.)
    const patterns = [
      /\n\n(?=[A-Z])/g,           // Before sentences starting with capital
      /\n\n(?=##)/g,             // Before markdown headers
      /\.\s+(?=[A-Z])/g,         // After sentences
      /:\n\n/g,                  // After colons with double newline
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(response)) !== null) {
        points.push({
          position: match.index + match[0].length,
          type: 'natural_break',
          context: response.substring(
            Math.max(0, match.index - 20), 
            Math.min(response.length, match.index + 20)
          )
        });
      }
    }
    
    // Sort by position
    return points.sort((a, b) => a.position - b.position);
  }

  /**
   * Integrate as appendix section
   */
  integrateAsAppendix(originalResponse, enhancement, template) {
    const enhancementText = template.prefix + 
      enhancement.content.join(template.separator) + 
      template.suffix;
    
    return originalResponse + enhancementText;
  }

  /**
   * Integrate as sidebar (for interfaces that support it)
   */
  integrateAsSidebar(originalResponse, enhancement, template) {
    // For now, same as appendix (would need UI support for true sidebar)
    return this.integrateAsAppendix(originalResponse, enhancement, template);
  }

  /**
   * Analyze response context to determine best enhancement approach
   */
  analyzeResponseContext(response) {
    return {
      length: response.length,
      has_code: /```/.test(response),
      has_sections: /#{1,6}\s/.test(response),
      has_lists: /^\s*[-*]\s/m.test(response),
      complexity: this.calculateResponseComplexity(response)
    };
  }

  /**
   * Calculate response complexity for enhancement decisions
   */
  calculateResponseComplexity(response) {
    let complexity = 0;
    
    // Length factor
    complexity += Math.min(response.length / 1000, 3);
    
    // Code blocks
    const codeBlocks = (response.match(/```/g) || []).length / 2;
    complexity += codeBlocks * 0.5;
    
    // Headers
    const headers = (response.match(/#{1,6}\s/g) || []).length;
    complexity += headers * 0.3;
    
    // Lists
    const lists = (response.match(/^\s*[-*]\s/gm) || []).length;
    complexity += lists * 0.1;
    
    return Math.min(complexity, 5); // Cap at 5
  }

  /**
   * Adaptive enhancement based on response characteristics
   */
  async adaptiveEnhance(userPrompt, claudeResponse, context = {}) {
    const responseContext = this.analyzeResponseContext(claudeResponse);
    
    // Adapt enhancement style based on response characteristics
    const originalStyle = this.config.enhancement_style;
    
    if (responseContext.complexity > 3) {
      this.config.enhancement_style = 'sectioned'; // More structured for complex responses
    } else if (responseContext.length < 200) {
      this.config.enhancement_style = 'minimal'; // Minimal for short responses
    } else {
      this.config.enhancement_style = 'seamless'; // Seamless for medium responses
    }
    
    const result = await this.enhanceResponse(userPrompt, claudeResponse, context);
    
    // Restore original style
    this.config.enhancement_style = originalStyle;
    
    return result;
  }

  /**
   * Get enhancement statistics
   */
  getStatistics() {
    return this.autoSelector.getStatistics();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.autoSelector.updateConfig(newConfig);
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { 
      enhancer: { ...this.config },
      selector: this.autoSelector.config
    };
  }

  /**
   * Test enhancement with mock data
   */
  async testEnhancement(userPrompt, mockResponse) {
    const mockContext = {
      file_context: { current_files: ['test.js'], project_type: 'nodejs' },
      git_context: { current_branch: 'main' }
    };
    
    return await this.enhanceResponse(userPrompt, mockResponse, mockContext);
  }
}

export default PromptEnhancer;