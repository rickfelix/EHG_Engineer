#!/usr/bin/env node

/**
 * Vision Analyzer for QA Testing
 * Analyzes screenshots and determines test actions
 */

const MultimodalClient = require('../ai/multimodal-client');

class VisionAnalyzer {
  constructor(config = {}) {
    this.config = {
      bugDetectionSensitivity: config.bugDetectionSensitivity || 'medium',
      visualCheckThreshold: config.visualCheckThreshold || 0.8,
      consensusThreshold: config.consensusThreshold || 0.66,
      ...config
    };

    this.aiClient = new MultimodalClient(config);

    // Common UI bug patterns
    this.bugPatterns = {
      overlapping: 'Elements overlapping or covering each other',
      cutoff: 'Text or elements cut off or partially visible',
      alignment: 'Misaligned elements or inconsistent spacing',
      missing: 'Missing images, icons, or expected elements',
      responsive: 'Layout broken on current viewport',
      contrast: 'Poor color contrast or readability issues',
      loading: 'Loading indicators stuck or error states',
      accessibility: 'Missing alt text or ARIA labels'
    };
  }

  /**
   * Analyze screenshot for next action and bugs
   */
  async analyzeScreenshot(screenshot, context) {
    try {
      // Get AI analysis
      const analysis = await this.aiClient.analyzeScreenshot(screenshot, context);
      
      // Enhance with additional checks
      analysis.bugs = await this.detectVisualBugs(analysis, context);
      analysis.accessibility = await this.checkAccessibility(analysis);
      analysis.confidence = this.calculateConfidence(analysis);
      
      return analysis;
      
    } catch (error) {
      console.error('Vision analysis failed:', error);
      throw error;
    }
  }

  /**
   * Detect visual bugs in the page
   */
  async detectVisualBugs(analysis, _context) {
    const bugs = [...(analysis.bugs || [])];
    
    // Check for common patterns in AI description
    const description = analysis.pageDescription?.toLowerCase() || '';
    
    Object.entries(this.bugPatterns).forEach(([type, pattern]) => {
      if (this.shouldCheckPattern(type, description)) {
        // AI might have already detected this
        const alreadyDetected = bugs.some(bug => 
          bug.toLowerCase().includes(type)
        );
        
        if (!alreadyDetected && this.patternMatches(description, type)) {
          bugs.push({
            type,
            description: pattern,
            severity: this.getSeverity(type),
            timestamp: new Date().toISOString()
          });
        }
      }
    });
    
    return bugs;
  }

  /**
   * Check accessibility issues
   */
  async checkAccessibility(analysis) {
    const issues = [];
    
    // Check if AI mentioned accessibility concerns
    const description = (analysis.pageDescription + analysis.additionalObservations)?.toLowerCase() || '';
    
    const accessibilityKeywords = [
      'no alt text',
      'missing label',
      'no aria',
      'keyboard navigation',
      'screen reader',
      'contrast ratio',
      'focus indicator'
    ];
    
    accessibilityKeywords.forEach(keyword => {
      if (description.includes(keyword)) {
        issues.push({
          type: 'accessibility',
          keyword,
          description: `Potential accessibility issue: ${keyword}`
        });
      }
    });
    
    return {
      hasIssues: issues.length > 0,
      issues,
      score: issues.length === 0 ? 1.0 : Math.max(0, 1 - (issues.length * 0.2))
    };
  }

  /**
   * Calculate confidence score
   */
  calculateConfidence(analysis) {
    let confidence = analysis.confidence || 0.5;
    
    // Adjust based on various factors
    const factors = {
      hasReasoning: analysis.reasoning?.length > 10 ? 0.1 : -0.1,
      clearAction: analysis.nextAction?.type ? 0.1 : -0.2,
      noBugs: analysis.bugs?.length === 0 ? 0.05 : -0.05,
      previousSuccess: 0 // Could track success rate
    };
    
    Object.values(factors).forEach(factor => {
      confidence = Math.max(0, Math.min(1, confidence + factor));
    });
    
    return confidence;
  }

  /**
   * Get accessibility snapshot
   */
  async getAccessibilitySnapshot(page) {
    try {
      const snapshot = await page.accessibility.snapshot();
      
      // Extract key information
      return {
        hasSnapshot: true,
        roleCount: this.countRoles(snapshot),
        interactiveElements: this.findInteractiveElements(snapshot),
        labels: this.extractLabels(snapshot)
      };
      
    } catch (error) {
      console.warn('Could not get accessibility snapshot:', error);
      return { hasSnapshot: false };
    }
  }

  /**
   * Find consensus among multiple test runs
   */
  findConsensus(runs) {
    if (!runs || runs.length === 0) {
      return { agreement: 0, consensus: null };
    }
    
    // Group runs by outcome
    const outcomes = {};
    
    runs.forEach(run => {
      const key = `${run.goalAchieved}-${run.bugs?.length || 0}`;
      if (!outcomes[key]) {
        outcomes[key] = [];
      }
      outcomes[key].push(run);
    });
    
    // Find majority outcome
    let maxCount = 0;
    let consensusOutcome = null;
    
    Object.entries(outcomes).forEach(([_key, runsWithOutcome]) => {
      if (runsWithOutcome.length > maxCount) {
        maxCount = runsWithOutcome.length;
        consensusOutcome = runsWithOutcome[0];
      }
    });
    
    const agreement = maxCount / runs.length;
    
    return {
      agreement,
      consensus: consensusOutcome,
      isReliable: agreement >= this.config.consensusThreshold,
      totalRuns: runs.length,
      agreedRuns: maxCount
    };
  }

  /**
   * Pattern matching for bug detection
   */
  patternMatches(description, bugType) {
    const patterns = {
      overlapping: /overlap|cover|hidden|behind|on top/i,
      cutoff: /cut off|truncated|partial|cropped|clipped/i,
      alignment: /misaligned|uneven|inconsistent|offset/i,
      missing: /missing|not found|404|broken|failed to load/i,
      responsive: /overflow|scroll|too wide|mobile|responsive/i,
      contrast: /hard to read|unclear|faded|contrast/i,
      loading: /loading|spinner|pending|waiting/i
    };
    
    return patterns[bugType]?.test(description) || false;
  }

  /**
   * Determine if pattern should be checked
   */
  shouldCheckPattern(type, _description) {
    // Sensitivity levels
    const checkLevels = {
      high: ['overlapping', 'cutoff', 'missing', 'loading'],
      medium: ['overlapping', 'cutoff', 'missing', 'loading', 'alignment', 'responsive'],
      low: Object.keys(this.bugPatterns)
    };
    
    const level = this.config.bugDetectionSensitivity;
    return checkLevels[level]?.includes(type) || false;
  }

  /**
   * Get bug severity
   */
  getSeverity(bugType) {
    const severities = {
      overlapping: 'high',
      cutoff: 'high',
      missing: 'high',
      loading: 'medium',
      alignment: 'low',
      responsive: 'medium',
      contrast: 'medium',
      accessibility: 'medium'
    };
    
    return severities[bugType] || 'low';
  }

  /**
   * Count roles in accessibility tree
   */
  countRoles(snapshot) {
    const roles = {};
    
    const traverse = (node) => {
      if (node.role) {
        roles[node.role] = (roles[node.role] || 0) + 1;
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    
    if (snapshot) {
      traverse(snapshot);
    }
    
    return roles;
  }

  /**
   * Find interactive elements
   */
  findInteractiveElements(snapshot) {
    const interactive = [];
    const interactiveRoles = ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox'];
    
    const traverse = (node) => {
      if (interactiveRoles.includes(node.role)) {
        interactive.push({
          role: node.role,
          name: node.name,
          value: node.value
        });
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    
    if (snapshot) {
      traverse(snapshot);
    }
    
    return interactive;
  }

  /**
   * Extract labels from accessibility tree
   */
  extractLabels(snapshot) {
    const labels = [];
    
    const traverse = (node) => {
      if (node.name) {
        labels.push(node.name);
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    
    if (snapshot) {
      traverse(snapshot);
    }
    
    return [...new Set(labels)]; // Unique labels
  }

  /**
   * Compare screenshots for visual regression
   */
  async compareScreenshots(_screenshot1, _screenshot2) {
    // This would integrate with visual regression tools
    // For now, return mock comparison
    return {
      similar: true,
      difference: 0.05,
      threshold: this.config.visualCheckThreshold
    };
  }

  /**
   * Analyze test goal completion
   */
  analyzeGoalCompletion(context, currentState) {
    // Parse goal for success indicators
    const _goalLower = context.goal.toLowerCase();
    const pageDescription = currentState.pageDescription?.toLowerCase() || '';
    
    const successIndicators = [
      'success',
      'complete',
      'confirmed',
      'thank you',
      'done',
      'submitted'
    ];
    
    const hasSuccessIndicator = successIndicators.some(indicator => 
      pageDescription.includes(indicator)
    );
    
    // Check URL changes for common success patterns
    const urlPatterns = [
      /success/i,
      /complete/i,
      /thank/i,
      /confirm/i
    ];
    
    const urlIndicatesSuccess = urlPatterns.some(pattern => 
      pattern.test(context.currentUrl)
    );
    
    return {
      likelyComplete: hasSuccessIndicator || urlIndicatesSuccess,
      confidence: (hasSuccessIndicator ? 0.5 : 0) + (urlIndicatesSuccess ? 0.5 : 0),
      indicators: {
        pageContent: hasSuccessIndicator,
        url: urlIndicatesSuccess
      }
    };
  }
}

module.exports = VisionAnalyzer;