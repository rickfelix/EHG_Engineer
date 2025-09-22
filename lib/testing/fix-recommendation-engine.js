#!/usr/bin/env node

/**
 * LEO Protocol v4.1.3 - Fix Recommendation Engine
 * Intelligent analysis and recommendation system for test failures
 * Provides actionable fix suggestions while maintaining human-in-the-loop approval
 */

class FixRecommendationEngine {
  constructor() {
    // Error patterns and their typical fixes
    this.errorPatterns = {
      ELEMENT_NOT_FOUND: {
        patterns: ['not found', 'no element', 'cannot find', 'unable to locate'],
        commonCauses: [
          'Element not rendered',
          'Incorrect selector',
          'Component not imported',
          'Conditional rendering issue'
        ],
        fixStrategies: [
          'Add missing element to component',
          'Verify selector syntax',
          'Check component imports',
          'Review conditional logic'
        ]
      },
      TIMEOUT: {
        patterns: ['timeout', 'timed out', 'exceeded time', 'took too long'],
        commonCauses: [
          'Slow API response',
          'Heavy computation',
          'Network latency',
          'Database query performance'
        ],
        fixStrategies: [
          'Optimize API endpoints',
          'Add loading states',
          'Implement caching',
          'Increase timeout threshold'
        ]
      },
      INTERACTION_FAILED: {
        patterns: ['cannot click', 'not clickable', 'interaction failed', 'element disabled'],
        commonCauses: [
          'Element disabled',
          'Element hidden',
          'Z-index issues',
          'Event handler missing'
        ],
        fixStrategies: [
          'Enable element',
          'Ensure visibility',
          'Fix z-index layering',
          'Attach event handlers'
        ]
      },
      NAVIGATION_ERROR: {
        patterns: ['navigation', 'route', 'redirect', 'page not found'],
        commonCauses: [
          'Route not defined',
          'Auth guard blocking',
          'Invalid URL',
          'Missing route handler'
        ],
        fixStrategies: [
          'Define route in router',
          'Check auth requirements',
          'Verify URL format',
          'Implement route handler'
        ]
      },
      API_ERROR: {
        patterns: ['fetch failed', 'api error', 'request failed', 'network error'],
        commonCauses: [
          'Endpoint not available',
          'CORS issue',
          'Invalid request format',
          'Authentication failure'
        ],
        fixStrategies: [
          'Verify endpoint URL',
          'Configure CORS',
          'Validate request payload',
          'Check auth tokens'
        ]
      },
      VALIDATION_ERROR: {
        patterns: ['validation failed', 'invalid input', 'form error', 'required field'],
        commonCauses: [
          'Missing validation rules',
          'Incorrect data format',
          'Required field empty',
          'Regex pattern mismatch'
        ],
        fixStrategies: [
          'Add validation rules',
          'Format data correctly',
          'Provide required fields',
          'Update validation patterns'
        ]
      }
    };
    
    // Component-specific fix templates
    this.componentTemplates = {
      react: {
        addElement: (selector, type = 'div') => ({
          description: `Add missing ${type} element with selector ${selector}`,
          code: `// Add to your component's render method
<${type} className="${selector.replace('.', '')}" data-testid="${selector.replace('.', '')}">
  {/* Content here */}
</${type}>`
        }),
        enableButton: () => ({
          description: 'Enable button for interaction',
          code: `// Change button disabled state
<button 
  disabled={false}  // Changed from true
  onClick={handleClick}
>
  Click Me
</button>`
        }),
        addRoute: (path) => ({
          description: `Add route for ${path}`,
          code: `// Add to your router configuration
<Route path="${path}" component={YourComponent} />`
        })
      },
      vue: {
        addElement: (selector, type = 'div') => ({
          description: `Add missing ${type} element with selector ${selector}`,
          code: `<!-- Add to your template -->
<${type} class="${selector.replace('.', '')}" data-testid="${selector.replace('.', '')}">
  <!-- Content here -->
</${type}>`
        }),
        enableButton: () => ({
          description: 'Enable button for interaction',
          code: `<!-- Change button disabled state -->
<button 
  :disabled="false"
  @click="handleClick"
>
  Click Me
</button>`
        })
      }
    };
  }
  
  /**
   * Analyze failure and generate comprehensive recommendation
   */
  async analyzeAndRecommend(failureData, context = {}) {
    console.log('🔍 Analyzing failure for recommendations...');
    
    const { error, target, analysis } = failureData;
    const errorType = this.classifyError(error);
    const pattern = this.errorPatterns[errorType];
    
    const recommendation = {
      errorType,
      severity: this.assessSeverity(errorType, analysis),
      rootCause: this.identifyRootCause(error, analysis, pattern),
      primaryFix: this.generatePrimaryFix(errorType, analysis, target),
      alternativeFixes: this.generateAlternatives(errorType, analysis),
      preventionTips: this.getPreventionTips(errorType),
      codeExamples: this.generateCodeExamples(errorType, analysis, context),
      testCommand: this.generateTestCommand(target),
      estimatedTime: this.estimateFixTime(errorType),
      confidence: this.calculateConfidence(analysis, errorType)
    };
    
    return recommendation;
  }
  
  /**
   * Classify error into categories
   */
  classifyError(error) {
    const errorMessage = error.message?.toLowerCase() || error.toString().toLowerCase();
    
    for (const [type, config] of Object.entries(this.errorPatterns)) {
      for (const pattern of config.patterns) {
        if (errorMessage.includes(pattern)) {
          return type;
        }
      }
    }
    
    return 'UNKNOWN_ERROR';
  }
  
  /**
   * Assess severity of the failure
   */
  assessSeverity(errorType, analysis) {
    // Critical errors that block functionality
    if (['ELEMENT_NOT_FOUND', 'NAVIGATION_ERROR', 'API_ERROR'].includes(errorType)) {
      return 'HIGH';
    }
    
    // Errors that affect user experience
    if (['INTERACTION_FAILED', 'VALIDATION_ERROR'].includes(errorType)) {
      return 'MEDIUM';
    }
    
    // Performance or minor issues
    if (['TIMEOUT'].includes(errorType)) {
      return 'LOW';
    }
    
    return 'UNKNOWN';
  }
  
  /**
   * Identify most likely root cause
   */
  identifyRootCause(error, analysis, pattern) {
    if (analysis?.rootCause) {
      return analysis.rootCause;
    }
    
    if (pattern?.commonCauses?.length > 0) {
      // Return most likely cause based on error details
      return pattern.commonCauses[0];
    }
    
    return 'Unable to determine root cause - manual investigation required';
  }
  
  /**
   * Generate primary fix recommendation
   */
  generatePrimaryFix(errorType, analysis, target) {
    const pattern = this.errorPatterns[errorType];
    
    if (!pattern) {
      return {
        action: 'Manual investigation required',
        details: 'Error type not recognized, please review manually'
      };
    }
    
    const fix = {
      action: pattern.fixStrategies[0],
      details: '',
      location: analysis?.codeLocation || 'Unknown',
      steps: []
    };
    
    // Generate specific steps based on error type
    switch (errorType) {
      case 'ELEMENT_NOT_FOUND':
        fix.steps = [
          `Navigate to ${fix.location}`,
          `Add element with selector: ${analysis?.domState?.missingElements?.[0] || 'unknown'}`,
          'Ensure element is rendered conditionally if needed',
          'Verify parent component includes this element'
        ];
        break;
        
      case 'TIMEOUT':
        fix.steps = [
          'Check network tab for slow API calls',
          'Profile component for performance bottlenecks',
          'Consider implementing loading states',
          'Optional: Increase timeout in test config'
        ];
        break;
        
      case 'INTERACTION_FAILED':
        fix.steps = [
          `Check element state in ${fix.location}`,
          'Verify element is not disabled',
          'Ensure element is visible (not display:none)',
          'Confirm event handlers are attached'
        ];
        break;
        
      default:
        fix.steps = pattern.fixStrategies.map((strategy, i) => `${i + 1}. ${strategy}`);
    }
    
    return fix;
  }
  
  /**
   * Generate alternative fix approaches
   */
  generateAlternatives(errorType, analysis) {
    const pattern = this.errorPatterns[errorType];
    
    if (!pattern || pattern.fixStrategies.length <= 1) {
      return [];
    }
    
    // Return all strategies except the primary one
    return pattern.fixStrategies.slice(1).map(strategy => ({
      action: strategy,
      when: 'If primary fix does not resolve the issue'
    }));
  }
  
  /**
   * Get prevention tips for future
   */
  getPreventionTips(errorType) {
    const tips = {
      ELEMENT_NOT_FOUND: [
        'Always add data-testid attributes to testable elements',
        'Keep selectors consistent across codebase',
        'Document component structure for testers'
      ],
      TIMEOUT: [
        'Implement proper loading states',
        'Optimize API responses',
        'Use pagination for large datasets'
      ],
      INTERACTION_FAILED: [
        'Test interactive elements during development',
        'Use proper ARIA attributes',
        'Ensure keyboard accessibility'
      ],
      NAVIGATION_ERROR: [
        'Keep router configuration centralized',
        'Test all routes after changes',
        'Implement 404 handling'
      ],
      API_ERROR: [
        'Use API mocking for tests',
        'Implement proper error handling',
        'Document API requirements'
      ],
      VALIDATION_ERROR: [
        'Define validation rules clearly',
        'Test edge cases',
        'Provide helpful error messages'
      ]
    };
    
    return tips[errorType] || ['Follow best practices', 'Add comprehensive tests'];
  }
  
  /**
   * Generate code examples for fixes
   */
  generateCodeExamples(errorType, analysis, context) {
    const framework = context.framework || 'react';
    const templates = this.componentTemplates[framework];
    
    if (!templates) {
      return null;
    }
    
    switch (errorType) {
      case 'ELEMENT_NOT_FOUND':
        const selector = analysis?.domState?.missingElements?.[0] || '.unknown';
        return templates.addElement(selector);
        
      case 'INTERACTION_FAILED':
        return templates.enableButton();
        
      case 'NAVIGATION_ERROR':
        const path = context.path || '/unknown';
        return templates.addRoute ? templates.addRoute(path) : null;
        
      default:
        return null;
    }
  }
  
  /**
   * Generate test command for validation
   */
  generateTestCommand(target) {
    return {
      command: `node lib/testing/testing-sub-agent.js --validate-fix "${target.name}"`,
      description: 'Run this command after applying the fix to verify it resolves the issue'
    };
  }
  
  /**
   * Estimate time to implement fix
   */
  estimateFixTime(errorType) {
    const estimates = {
      ELEMENT_NOT_FOUND: '5-10 minutes',
      TIMEOUT: '15-30 minutes',
      INTERACTION_FAILED: '5-15 minutes',
      NAVIGATION_ERROR: '10-20 minutes',
      API_ERROR: '20-40 minutes',
      VALIDATION_ERROR: '10-20 minutes',
      UNKNOWN_ERROR: '30+ minutes'
    };
    
    return estimates[errorType] || '30+ minutes';
  }
  
  /**
   * Calculate confidence in recommendation
   */
  calculateConfidence(analysis, errorType) {
    let confidence = 50; // Base confidence
    
    // Increase confidence based on available information
    if (analysis?.rootCause) confidence += 20;
    if (analysis?.codeLocation) confidence += 15;
    if (analysis?.domState?.missingElements?.length > 0) confidence += 15;
    if (errorType !== 'UNKNOWN_ERROR') confidence += 10;
    
    // Decrease confidence for complex errors
    if (errorType === 'TIMEOUT') confidence -= 10;
    if (errorType === 'API_ERROR') confidence -= 5;
    
    return Math.min(Math.max(confidence, 10), 95);
  }
  
  /**
   * Format recommendation for output
   */
  formatRecommendation(recommendation) {
    const output = [];
    
    output.push('═'.repeat(60));
    output.push('🔧 FIX RECOMMENDATION REPORT');
    output.push('═'.repeat(60));
    
    output.push(`\n📊 Error Type: ${recommendation.errorType}`);
    output.push(`⚠️  Severity: ${recommendation.severity}`);
    output.push(`🎯 Confidence: ${recommendation.confidence}%`);
    output.push(`⏱️  Estimated Time: ${recommendation.estimatedTime}`);
    
    output.push('\n🔍 Root Cause:');
    output.push(`   ${recommendation.rootCause}`);
    
    output.push('\n✅ Primary Fix:');
    output.push(`   ${recommendation.primaryFix.action}`);
    output.push(`   Location: ${recommendation.primaryFix.location}`);
    output.push('\n   Steps:');
    recommendation.primaryFix.steps.forEach(step => {
      output.push(`   • ${step}`);
    });
    
    if (recommendation.alternativeFixes.length > 0) {
      output.push('\n🔄 Alternative Approaches:');
      recommendation.alternativeFixes.forEach(alt => {
        output.push(`   • ${alt.action}`);
        output.push(`     ${alt.when}`);
      });
    }
    
    if (recommendation.codeExamples) {
      output.push('\n💻 Code Example:');
      output.push(`   ${recommendation.codeExamples.description}`);
      output.push('```javascript');
      output.push(recommendation.codeExamples.code);
      output.push('```');
    }
    
    output.push('\n🛡️ Prevention Tips:');
    recommendation.preventionTips.forEach(tip => {
      output.push(`   • ${tip}`);
    });
    
    output.push('\n🧪 Validation:');
    output.push(`   ${recommendation.testCommand.command}`);
    output.push(`   ${recommendation.testCommand.description}`);
    
    output.push('\n' + '═'.repeat(60));
    
    return output.join('\n');
  }
}

export default FixRecommendationEngine;