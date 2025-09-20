/**
 * Consistency Validation Enforcer
 * Ensures changes maintain application consistency and don't introduce conflicts
 * Works with Impact Analyzer to provide comprehensive change validation
 */

const fs = require('fs').promises;
const path = require('path');

class ConsistencyEnforcer {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.validationRules = this.initializeValidationRules();
    this.consistencyCache = new Map();
  }

  /**
   * Initialize comprehensive validation rules
   */
  initializeValidationRules() {
    return {
      // Design System Consistency Rules
      design_system: {
        rules: [
          {
            id: 'color_palette_consistency',
            description: 'Colors must align with established design tokens',
            patterns: ['color', 'background', 'theme', 'palette'],
            severity: 'high',
            validator: this.validateColorConsistency.bind(this)
          },
          {
            id: 'typography_consistency',
            description: 'Typography changes must follow design system hierarchy',
            patterns: ['font', 'text', 'typography', 'heading'],
            severity: 'high',
            validator: this.validateTypographyConsistency.bind(this)
          },
          {
            id: 'spacing_consistency',
            description: 'Spacing must use design system tokens',
            patterns: ['spacing', 'margin', 'padding', 'gap'],
            severity: 'medium',
            validator: this.validateSpacingConsistency.bind(this)
          }
        ]
      },

      // User Experience Consistency Rules
      user_experience: {
        rules: [
          {
            id: 'navigation_consistency',
            description: 'Navigation patterns must remain consistent',
            patterns: ['navigation', 'menu', 'breadcrumb', 'routing'],
            severity: 'critical',
            validator: this.validateNavigationConsistency.bind(this)
          },
          {
            id: 'interaction_consistency',
            description: 'User interactions must follow established patterns',
            patterns: ['click', 'hover', 'interaction', 'behavior'],
            severity: 'high',
            validator: this.validateInteractionConsistency.bind(this)
          },
          {
            id: 'feedback_consistency',
            description: 'User feedback mechanisms must be consistent',
            patterns: ['feedback', 'message', 'notification', 'alert'],
            severity: 'medium',
            validator: this.validateFeedbackConsistency.bind(this)
          }
        ]
      },

      // Technical Consistency Rules
      technical: {
        rules: [
          {
            id: 'api_consistency',
            description: 'API changes must maintain backward compatibility',
            patterns: ['api', 'endpoint', 'service', 'integration'],
            severity: 'critical',
            validator: this.validateApiConsistency.bind(this)
          },
          {
            id: 'data_consistency',
            description: 'Data structures must maintain referential integrity',
            patterns: ['database', 'schema', 'data', 'model'],
            severity: 'critical',
            validator: this.validateDataConsistency.bind(this)
          },
          {
            id: 'performance_consistency',
            description: 'Changes must not degrade performance standards',
            patterns: ['performance', 'speed', 'loading', 'optimization'],
            severity: 'high',
            validator: this.validatePerformanceConsistency.bind(this)
          }
        ]
      },

      // Business Logic Consistency Rules
      business_logic: {
        rules: [
          {
            id: 'workflow_consistency',
            description: 'Business workflows must remain logical and complete',
            patterns: ['workflow', 'process', 'business', 'logic'],
            severity: 'critical',
            validator: this.validateWorkflowConsistency.bind(this)
          },
          {
            id: 'permissions_consistency',
            description: 'Permission changes must maintain security model',
            patterns: ['permission', 'access', 'role', 'security'],
            severity: 'critical',
            validator: this.validatePermissionsConsistency.bind(this)
          },
          {
            id: 'validation_consistency',
            description: 'Validation rules must be consistently applied',
            patterns: ['validation', 'rules', 'constraints', 'requirements'],
            severity: 'high',
            validator: this.validateValidationConsistency.bind(this)
          }
        ]
      }
    };
  }

  /**
   * Perform comprehensive consistency validation
   * @param {object} submission - SDIP submission data
   * @param {object} impactAnalysis - Results from Impact Analyzer
   * @returns {object} Consistency validation results
   */
  async validateConsistency(submission, impactAnalysis) {
    const validation = {
      passed: true,
      score: 100,
      violations: [],
      warnings: [],
      recommendations: [],
      category_scores: {},
      overall_risk: 'low',
      blocking_issues: []
    };

    try {
      const input = submission.chairman_input || '';
      const intent = submission.intent_summary || '';
      const combinedText = input + ' ' + intent;

      // Run validation for each category
      for (const [category, config] of Object.entries(this.validationRules)) {
        const categoryResult = await this.validateCategory(
          category,
          config,
          combinedText,
          submission,
          impactAnalysis
        );
        
        validation.category_scores[category] = categoryResult.score;
        validation.violations.push(...categoryResult.violations);
        validation.warnings.push(...categoryResult.warnings);
        validation.recommendations.push(...categoryResult.recommendations);
        
        if (categoryResult.blocking_issues.length > 0) {
          validation.blocking_issues.push(...categoryResult.blocking_issues);
          validation.passed = false;
        }
      }

      // Calculate overall scores
      validation.score = this.calculateOverallScore(validation.category_scores);
      validation.overall_risk = this.calculateOverallRisk(validation);
      
      // Determine if validation passes
      validation.passed = validation.blocking_issues.length === 0 && validation.score >= 70;
      
      validation.validated_at = new Date().toISOString();
      
      return validation;
    } catch (error) {
      console.error('Consistency validation failed:', error);
      return {
        ...validation,
        passed: false,
        error: error.message,
        overall_risk: 'unknown'
      };
    }
  }

  /**
   * Validate specific category
   */
  async validateCategory(categoryName, config, text, submission, impactAnalysis) {
    const result = {
      score: 100,
      violations: [],
      warnings: [],
      recommendations: [],
      blocking_issues: []
    };

    const textLower = text.toLowerCase();

    for (const rule of config.rules) {
      const isRelevant = rule.patterns.some(pattern => 
        textLower.includes(pattern.toLowerCase())
      );

      if (isRelevant) {
        try {
          const ruleResult = await rule.validator(text, submission, impactAnalysis, rule);
          
          if (ruleResult.violations.length > 0) {
            result.violations.push(...ruleResult.violations.map(v => ({
              ...v,
              category: categoryName,
              rule_id: rule.id,
              severity: rule.severity
            })));
            
            // Apply score penalty
            const penalty = this.calculateScorePenalty(rule.severity, ruleResult.violations.length);
            result.score = Math.max(0, result.score - penalty);
            
            // Check if blocking
            if (rule.severity === 'critical' && ruleResult.violations.some(v => v.blocking)) {
              result.blocking_issues.push(...ruleResult.violations.filter(v => v.blocking));
            }
          }
          
          if (ruleResult.warnings.length > 0) {
            result.warnings.push(...ruleResult.warnings.map(w => ({
              ...w,
              category: categoryName,
              rule_id: rule.id
            })));
          }
          
          if (ruleResult.recommendations.length > 0) {
            result.recommendations.push(...ruleResult.recommendations.map(r => ({
              ...r,
              category: categoryName,
              rule_id: rule.id
            })));
          }
        } catch (error) {
          console.error(`Rule validation failed for ${rule.id}:`, error);
          result.warnings.push({
            type: 'validation_error',
            message: `Could not validate ${rule.description}`,
            category: categoryName,
            rule_id: rule.id
          });
        }
      }
    }

    return result;
  }

  /**
   * Validation rule implementations
   */

  async validateColorConsistency(text, submission, impactAnalysis, rule) {
    const result = { violations: [], warnings: [], recommendations: [] };
    const textLower = text.toLowerCase();

    // Check for color-related changes
    if (textLower.includes('color') || textLower.includes('theme')) {
      // Check if design system is affected
      const affectsDesignSystem = impactAnalysis.affected_components?.some(
        c => c.name === 'design-system' || c.name === 'ui'
      );

      if (affectsDesignSystem) {
        result.warnings.push({
          type: 'design_system_impact',
          message: 'Color changes may affect design system consistency',
          suggestion: 'Review design token usage and update systematically'
        });
      }

      // Check for custom color mentions (potential inconsistency)
      const customColorPatterns = ['#', 'rgb', 'hsl', 'custom color'];
      const hasCustomColors = customColorPatterns.some(pattern => textLower.includes(pattern));
      
      if (hasCustomColors) {
        result.violations.push({
          type: 'custom_color_usage',
          message: 'Custom colors detected - should use design system tokens',
          blocking: false
        });
      }
    }

    return result;
  }

  async validateTypographyConsistency(text, submission, impactAnalysis, rule) {
    const result = { violations: [], warnings: [], recommendations: [] };
    const textLower = text.toLowerCase();

    if (textLower.includes('font') || textLower.includes('typography')) {
      result.recommendations.push({
        type: 'typography_review',
        message: 'Ensure typography changes follow design system hierarchy',
        priority: 'medium'
      });

      // Check for font family changes
      if (textLower.includes('font-family') || textLower.includes('typeface')) {
        result.warnings.push({
          type: 'font_family_change',
          message: 'Font family changes should be approved by design team'
        });
      }
    }

    return result;
  }

  async validateSpacingConsistency(text, submission, impactAnalysis, rule) {
    const result = { violations: [], warnings: [], recommendations: [] };
    const textLower = text.toLowerCase();

    if (textLower.includes('spacing') || textLower.includes('margin') || textLower.includes('padding')) {
      result.recommendations.push({
        type: 'spacing_tokens',
        message: 'Use design system spacing tokens instead of hardcoded values',
        priority: 'low'
      });
    }

    return result;
  }

  async validateNavigationConsistency(text, submission, impactAnalysis, rule) {
    const result = { violations: [], warnings: [], recommendations: [] };
    const textLower = text.toLowerCase();

    if (textLower.includes('navigation') || textLower.includes('menu')) {
      const affectsNavigation = impactAnalysis.affected_components?.some(
        c => c.name === 'navigation'
      );

      if (affectsNavigation && impactAnalysis.risk_level === 'high') {
        result.violations.push({
          type: 'navigation_disruption',
          message: 'High-impact navigation changes may confuse users',
          blocking: true,
          suggestion: 'Consider phased rollout with user testing'
        });
      }

      result.recommendations.push({
        type: 'navigation_testing',
        message: 'Conduct user testing for navigation changes',
        priority: 'high'
      });
    }

    return result;
  }

  async validateInteractionConsistency(text, submission, impactAnalysis, rule) {
    const result = { violations: [], warnings: [], recommendations: [] };
    const textLower = text.toLowerCase();

    if (textLower.includes('interaction') || textLower.includes('click') || textLower.includes('hover')) {
      result.warnings.push({
        type: 'interaction_patterns',
        message: 'Ensure new interactions follow established UX patterns'
      });
    }

    return result;
  }

  async validateFeedbackConsistency(text, submission, impactAnalysis, rule) {
    const result = { violations: [], warnings: [], recommendations: [] };
    const textLower = text.toLowerCase();

    if (textLower.includes('feedback') || textLower.includes('message') || textLower.includes('notification')) {
      result.recommendations.push({
        type: 'feedback_consistency',
        message: 'Maintain consistent feedback messaging and timing',
        priority: 'medium'
      });
    }

    return result;
  }

  async validateApiConsistency(text, submission, impactAnalysis, rule) {
    const result = { violations: [], warnings: [], recommendations: [] };
    const textLower = text.toLowerCase();

    if (textLower.includes('api') || textLower.includes('endpoint')) {
      const hasBreakingChanges = impactAnalysis.breaking_changes?.some(
        change => change.type === 'api_modification'
      );

      if (hasBreakingChanges) {
        result.violations.push({
          type: 'api_breaking_change',
          message: 'API changes may break existing integrations',
          blocking: true,
          suggestion: 'Implement versioning and deprecation strategy'
        });
      }

      result.recommendations.push({
        type: 'api_documentation',
        message: 'Update API documentation and notify integration partners',
        priority: 'high'
      });
    }

    return result;
  }

  async validateDataConsistency(text, submission, impactAnalysis, rule) {
    const result = { violations: [], warnings: [], recommendations: [] };
    const textLower = text.toLowerCase();

    if (textLower.includes('database') || textLower.includes('schema') || textLower.includes('data')) {
      const hasDataChanges = impactAnalysis.breaking_changes?.some(
        change => change.type === 'database_schema_change'
      );

      if (hasDataChanges) {
        result.violations.push({
          type: 'database_migration_required',
          message: 'Database changes require migration strategy',
          blocking: true,
          suggestion: 'Create migration plan with rollback procedures'
        });
      }

      result.recommendations.push({
        type: 'data_backup',
        message: 'Ensure data backup before implementing database changes',
        priority: 'critical'
      });
    }

    return result;
  }

  async validatePerformanceConsistency(text, submission, impactAnalysis, rule) {
    const result = { violations: [], warnings: [], recommendations: [] };
    const textLower = text.toLowerCase();

    if (textLower.includes('performance') || textLower.includes('speed') || textLower.includes('loading')) {
      const affectsPerformance = impactAnalysis.affected_components?.some(
        c => c.name === 'performance'
      );

      if (affectsPerformance) {
        result.warnings.push({
          type: 'performance_impact',
          message: 'Changes may affect application performance'
        });

        result.recommendations.push({
          type: 'performance_testing',
          message: 'Conduct performance testing before deployment',
          priority: 'high'
        });
      }
    }

    return result;
  }

  async validateWorkflowConsistency(text, submission, impactAnalysis, rule) {
    const result = { violations: [], warnings: [], recommendations: [] };
    const textLower = text.toLowerCase();

    if (textLower.includes('workflow') || textLower.includes('process')) {
      result.recommendations.push({
        type: 'workflow_documentation',
        message: 'Update workflow documentation to reflect changes',
        priority: 'medium'
      });

      // Check if multiple components are affected (workflow disruption)
      if (impactAnalysis.affected_components?.length > 3) {
        result.warnings.push({
          type: 'workflow_disruption',
          message: 'Complex changes may disrupt existing workflows'
        });
      }
    }

    return result;
  }

  async validatePermissionsConsistency(text, submission, impactAnalysis, rule) {
    const result = { violations: [], warnings: [], recommendations: [] };
    const textLower = text.toLowerCase();

    if (textLower.includes('permission') || textLower.includes('access') || textLower.includes('security')) {
      const affectsAuth = impactAnalysis.affected_components?.some(
        c => c.name === 'authentication'
      );

      if (affectsAuth) {
        result.violations.push({
          type: 'security_review_required',
          message: 'Security changes require thorough review',
          blocking: true,
          suggestion: 'Conduct security audit before implementation'
        });
      }

      result.recommendations.push({
        type: 'permission_audit',
        message: 'Audit permission changes for security implications',
        priority: 'critical'
      });
    }

    return result;
  }

  async validateValidationConsistency(text, submission, impactAnalysis, rule) {
    const result = { violations: [], warnings: [], recommendations: [] };
    const textLower = text.toLowerCase();

    if (textLower.includes('validation') || textLower.includes('rules')) {
      result.recommendations.push({
        type: 'validation_consistency',
        message: 'Ensure validation rules are consistently applied across the application',
        priority: 'medium'
      });
    }

    return result;
  }

  /**
   * Helper methods
   */
  calculateScorePenalty(severity, violationCount) {
    const basePenalties = {
      critical: 30,
      high: 20,
      medium: 10,
      low: 5
    };
    
    return (basePenalties[severity] || 5) * violationCount;
  }

  calculateOverallScore(categoryScores) {
    const scores = Object.values(categoryScores);
    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b) / scores.length) : 100;
  }

  calculateOverallRisk(validation) {
    if (validation.blocking_issues.length > 0) {
      return 'critical';
    } else if (validation.score < 50) {
      return 'high';
    } else if (validation.score < 70) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Generate consistency report for UI
   */
  generateConsistencyReport(validation) {
    return {
      passed: validation.passed,
      score: validation.score,
      risk_level: validation.overall_risk,
      blocking_issues_count: validation.blocking_issues.length,
      violations_count: validation.violations.length,
      warnings_count: validation.warnings.length,
      recommendations_count: validation.recommendations.length,
      category_breakdown: validation.category_scores,
      top_issues: [
        ...validation.blocking_issues.slice(0, 3),
        ...validation.violations.slice(0, 3)
      ],
      key_recommendations: validation.recommendations
        .sort((a, b) => {
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          return (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
        })
        .slice(0, 5)
    };
  }

  /**
   * Check if changes can proceed
   */
  canProceed(validation) {
    return {
      can_proceed: validation.passed,
      blocking_issues: validation.blocking_issues,
      required_actions: validation.blocking_issues.map(issue => ({
        action: 'resolve_issue',
        description: issue.message,
        suggestion: issue.suggestion
      }))
    };
  }
}

module.exports = ConsistencyEnforcer;