/**
 * Application Impact Analyzer
 * Analyzes broader application impact and identifies potential inconsistencies
 * Integrates with Directive Lab workflow to prevent costly mistakes
 */

const fs = require('fs').promises;
const path = require('path');

class ImpactAnalyzer {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.analysisCache = new Map();
    
    // Define application components and their interdependencies
    this.componentMap = {
      'ui': {
        patterns: ['components/', 'ui/', 'styles/', '.jsx', '.tsx', '.css', '.scss'],
        dependencies: ['design-system', 'state', 'api'],
        riskLevel: 'medium'
      },
      'api': {
        patterns: ['api/', 'routes/', 'endpoints/', 'services/'],
        dependencies: ['database', 'auth', 'external-integrations'],
        riskLevel: 'high'
      },
      'database': {
        patterns: ['schema/', 'migrations/', 'models/', 'database/'],
        dependencies: ['data-integrity', 'performance'],
        riskLevel: 'critical'
      },
      'authentication': {
        patterns: ['auth/', 'login', 'session', 'security'],
        dependencies: ['database', 'api', 'ui'],
        riskLevel: 'critical'
      },
      'navigation': {
        patterns: ['navigation', 'routing', 'menu', 'breadcrumb'],
        dependencies: ['ui', 'state', 'permissions'],
        riskLevel: 'high'
      },
      'performance': {
        patterns: ['performance', 'optimization', 'caching', 'loading'],
        dependencies: ['api', 'database', 'ui'],
        riskLevel: 'high'
      },
      'design-system': {
        patterns: ['design-tokens', 'theme', 'variables', 'constants'],
        dependencies: ['ui'],
        riskLevel: 'medium'
      }
    };

    // Risk assessment criteria
    this.riskFactors = {
      'strategic_scope': {
        threshold: 50,
        multiplier: 1.5,
        description: 'High strategic scope increases complexity'
      },
      'multiple_components': {
        threshold: 2,
        multiplier: 1.3,
        description: 'Changes affecting multiple components have higher risk'
      },
      'critical_dependencies': {
        components: ['database', 'authentication', 'api'],
        multiplier: 2.0,
        description: 'Critical component changes have exponential risk'
      },
      'breaking_changes': {
        keywords: ['remove', 'delete', 'breaking', 'incompatible', 'deprecate'],
        multiplier: 2.5,
        description: 'Breaking changes require careful migration planning'
      }
    };
  }

  /**
   * Analyze comprehensive application impact
   * @param {object} submission - SDIP submission data
   * @returns {object} Complete impact analysis
   */
  async analyzeImpact(submission) {
    const analysis = {
      impact_score: 0,
      risk_level: 'low',
      affected_components: [],
      dependencies: [],
      breaking_changes: [],
      consistency_issues: [],
      recommendations: [],
      mitigation_strategies: [],
      rollback_complexity: 'simple',
      estimated_effort_multiplier: 1.0
    };

    try {
      // Extract key information from submission
      const input = submission.chairman_input || '';
      const intent = submission.intent_summary || '';
      const stratTac = submission.strat_tac_final || submission.strat_tac || {};
      
      // Analyze affected components
      analysis.affected_components = this.identifyAffectedComponents(input + ' ' + intent);
      
      // Calculate impact score
      analysis.impact_score = this.calculateImpactScore(input, intent, stratTac, analysis.affected_components);
      
      // Determine risk level
      analysis.risk_level = this.calculateRiskLevel(analysis.impact_score, analysis.affected_components);
      
      // Analyze dependencies
      analysis.dependencies = this.analyzeDependencies(analysis.affected_components);
      
      // Check for breaking changes
      analysis.breaking_changes = this.detectBreakingChanges(input + ' ' + intent);
      
      // Identify consistency issues
      analysis.consistency_issues = await this.identifyConsistencyIssues(input, intent, analysis.affected_components);
      
      // Generate recommendations
      analysis.recommendations = this.generateRecommendations(analysis);
      
      // Create mitigation strategies
      analysis.mitigation_strategies = this.createMitigationStrategies(analysis);
      
      // Assess rollback complexity
      analysis.rollback_complexity = this.assessRollbackComplexity(analysis);
      
      // Calculate effort multiplier
      analysis.estimated_effort_multiplier = this.calculateEffortMultiplier(analysis);
      
      // Add timestamp
      analysis.analyzed_at = new Date().toISOString();
      
      return analysis;
    } catch (error) {
      console.error('Impact analysis failed:', error);
      return {
        ...analysis,
        error: error.message,
        risk_level: 'unknown'
      };
    }
  }

  /**
   * Identify components affected by the proposed changes
   */
  identifyAffectedComponents(text) {
    const textLower = text.toLowerCase();
    const affectedComponents = [];

    for (const [componentName, config] of Object.entries(this.componentMap)) {
      const isAffected = config.patterns.some(pattern => 
        textLower.includes(pattern.toLowerCase().replace(/[\/\*]/g, ''))
      );
      
      if (isAffected) {
        affectedComponents.push({
          name: componentName,
          risk_level: config.riskLevel,
          dependencies: config.dependencies,
          confidence: this.calculateConfidence(textLower, config.patterns)
        });
      }
    }

    return affectedComponents;
  }

  /**
   * Calculate overall impact score (0-100)
   */
  calculateImpactScore(input, intent, stratTac, affectedComponents) {
    let score = 0;
    
    // Base score from strategic/tactical ratio
    const strategicPct = stratTac.strategic_pct || 0;
    score += strategicPct * 0.5; // Strategic changes have higher base impact
    
    // Component-based scoring
    affectedComponents.forEach(component => {
      switch (component.risk_level) {
        case 'critical':
          score += 30;
          break;
        case 'high':
          score += 20;
          break;
        case 'medium':
          score += 10;
          break;
        default:
          score += 5;
      }
    });
    
    // Multiple component penalty
    if (affectedComponents.length > 2) {
      score += (affectedComponents.length - 2) * 10;
    }
    
    // Text complexity factors
    const textComplexity = this.calculateTextComplexity(input + ' ' + intent);
    score += textComplexity * 20;
    
    return Math.min(100, Math.max(0, score));
  }

  /**
   * Calculate risk level based on score and components
   */
  calculateRiskLevel(impactScore, affectedComponents) {
    const hasCriticalComponent = affectedComponents.some(c => c.risk_level === 'critical');
    const hasMultipleHighRisk = affectedComponents.filter(c => c.risk_level === 'high').length > 1;
    
    if (hasCriticalComponent && impactScore > 60) {
      return 'critical';
    } else if (hasCriticalComponent || hasMultipleHighRisk || impactScore > 70) {
      return 'high';
    } else if (impactScore > 40 || affectedComponents.length > 2) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Analyze component dependencies
   */
  analyzeDependencies(affectedComponents) {
    const dependencies = new Set();
    const dependencyTree = [];

    affectedComponents.forEach(component => {
      component.dependencies.forEach(dep => {
        if (!dependencies.has(dep)) {
          dependencies.add(dep);
          dependencyTree.push({
            component: component.name,
            depends_on: dep,
            impact_type: 'direct'
          });
        }
      });
    });

    // Add indirect dependencies
    const indirectDeps = this.findIndirectDependencies(affectedComponents);
    indirectDeps.forEach(dep => dependencyTree.push(dep));

    return dependencyTree;
  }

  /**
   * Detect potential breaking changes
   */
  detectBreakingChanges(text) {
    const breakingChanges = [];
    const textLower = text.toLowerCase();
    
    this.riskFactors.breaking_changes.keywords.forEach(keyword => {
      if (textLower.includes(keyword)) {
        breakingChanges.push({
          type: 'potential_breaking_change',
          keyword,
          severity: 'high',
          description: `Text contains "${keyword}" which may indicate breaking changes`
        });
      }
    });

    // Check for API changes
    if (textLower.includes('api') && (textLower.includes('change') || textLower.includes('update'))) {
      breakingChanges.push({
        type: 'api_modification',
        severity: 'critical',
        description: 'API changes may break existing integrations'
      });
    }

    // Check for database schema changes
    if ((textLower.includes('database') || textLower.includes('schema')) && 
        (textLower.includes('change') || textLower.includes('modify'))) {
      breakingChanges.push({
        type: 'database_schema_change',
        severity: 'critical',
        description: 'Database changes require migration strategy'
      });
    }

    return breakingChanges;
  }

  /**
   * Identify consistency issues with existing application
   */
  async identifyConsistencyIssues(input, intent, affectedComponents) {
    const issues = [];
    
    try {
      // Check for design system consistency
      if (affectedComponents.some(c => c.name === 'ui' || c.name === 'design-system')) {
        const designIssues = await this.checkDesignSystemConsistency(input, intent);
        issues.push(...designIssues);
      }

      // Check for navigation consistency
      if (affectedComponents.some(c => c.name === 'navigation')) {
        const navIssues = this.checkNavigationConsistency(input, intent);
        issues.push(...navIssues);
      }

      // Check for data consistency
      if (affectedComponents.some(c => c.name === 'database' || c.name === 'api')) {
        const dataIssues = this.checkDataConsistency(input, intent);
        issues.push(...dataIssues);
      }

      // Check for user experience consistency
      const uxIssues = this.checkUserExperienceConsistency(input, intent, affectedComponents);
      issues.push(...uxIssues);
      
    } catch (error) {
      console.error('Consistency analysis failed:', error);
      issues.push({
        type: 'analysis_error',
        severity: 'medium',
        description: 'Could not complete consistency analysis'
      });
    }

    return issues;
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    // High impact recommendations
    if (analysis.impact_score > 70) {
      recommendations.push({
        priority: 'high',
        type: 'phased_approach',
        description: 'Consider implementing changes in phases to reduce risk',
        effort_reduction: '30%'
      });
    }

    // Breaking change recommendations
    if (analysis.breaking_changes.length > 0) {
      recommendations.push({
        priority: 'critical',
        type: 'migration_strategy',
        description: 'Develop comprehensive migration strategy with rollback plan',
        effort_increase: '50%'
      });
    }

    // Multiple component recommendations
    if (analysis.affected_components.length > 3) {
      recommendations.push({
        priority: 'medium',
        type: 'coordination',
        description: 'Coordinate changes across teams to ensure consistency',
        effort_increase: '20%'
      });
    }

    // Critical component recommendations
    const criticalComponents = analysis.affected_components.filter(c => c.risk_level === 'critical');
    if (criticalComponents.length > 0) {
      recommendations.push({
        priority: 'high',
        type: 'extensive_testing',
        description: 'Implement comprehensive testing strategy for critical components',
        effort_increase: '40%'
      });
    }

    return recommendations;
  }

  /**
   * Create mitigation strategies
   */
  createMitigationStrategies(analysis) {
    const strategies = [];

    // Risk-based strategies
    switch (analysis.risk_level) {
      case 'critical':
        strategies.push(
          'Implement feature flags for gradual rollout',
          'Create comprehensive rollback procedures',
          'Establish monitoring and alerting for critical metrics',
          'Conduct thorough security and performance testing'
        );
        break;
      case 'high':
        strategies.push(
          'Create staging environment testing protocol',
          'Implement automated testing coverage',
          'Establish rollback checkpoints',
          'Monitor key performance indicators'
        );
        break;
      case 'medium':
        strategies.push(
          'Increase code review requirements',
          'Add integration testing',
          'Monitor user feedback closely'
        );
        break;
    }

    // Component-specific strategies
    analysis.affected_components.forEach(component => {
      if (component.risk_level === 'critical') {
        strategies.push(`Dedicated ${component.name} testing and validation`);
      }
    });

    return strategies;
  }

  /**
   * Assess rollback complexity
   */
  assessRollbackComplexity(analysis) {
    let complexity = 'simple';
    
    if (analysis.breaking_changes.length > 0) {
      complexity = 'complex';
    } else if (analysis.affected_components.some(c => c.risk_level === 'critical')) {
      complexity = 'moderate';
    } else if (analysis.affected_components.length > 3) {
      complexity = 'moderate';
    }
    
    return complexity;
  }

  /**
   * Calculate effort multiplier based on analysis
   */
  calculateEffortMultiplier(analysis) {
    let multiplier = 1.0;
    
    // Risk level multipliers
    switch (analysis.risk_level) {
      case 'critical':
        multiplier += 1.5;
        break;
      case 'high':
        multiplier += 1.0;
        break;
      case 'medium':
        multiplier += 0.5;
        break;
    }
    
    // Breaking changes multiplier
    if (analysis.breaking_changes.length > 0) {
      multiplier += 0.5;
    }
    
    // Multiple components multiplier
    if (analysis.affected_components.length > 2) {
      multiplier += (analysis.affected_components.length - 2) * 0.2;
    }
    
    return Math.round(multiplier * 10) / 10; // Round to 1 decimal
  }

  /**
   * Helper methods
   */
  calculateConfidence(text, patterns) {
    const matches = patterns.filter(pattern => 
      text.includes(pattern.toLowerCase().replace(/[\/\*]/g, ''))
    );
    return matches.length / patterns.length;
  }

  calculateTextComplexity(text) {
    const complexity = {
      length: text.length > 500 ? 1 : 0,
      sentences: text.split(/[.!?]+/).length > 10 ? 1 : 0,
      keywords: ['all', 'everything', 'complete', 'entire'].some(kw => 
        text.toLowerCase().includes(kw)
      ) ? 1 : 0
    };
    
    return (complexity.length + complexity.sentences + complexity.keywords) / 3;
  }

  findIndirectDependencies(affectedComponents) {
    const indirect = [];
    
    affectedComponents.forEach(component => {
      // Find components that depend on this component
      for (const [name, config] of Object.entries(this.componentMap)) {
        if (config.dependencies.includes(component.name)) {
          indirect.push({
            component: name,
            depends_on: component.name,
            impact_type: 'indirect'
          });
        }
      }
    });
    
    return indirect;
  }

  async checkDesignSystemConsistency(input, intent) {
    const issues = [];
    const text = (input + ' ' + intent).toLowerCase();
    
    if (text.includes('color') || text.includes('theme')) {
      issues.push({
        type: 'design_system_colors',
        severity: 'medium',
        description: 'Color changes may affect design system consistency'
      });
    }
    
    if (text.includes('font') || text.includes('typography')) {
      issues.push({
        type: 'design_system_typography',
        severity: 'medium',
        description: 'Typography changes should align with design system'
      });
    }
    
    return issues;
  }

  checkNavigationConsistency(input, intent) {
    const issues = [];
    const text = (input + ' ' + intent).toLowerCase();
    
    if (text.includes('menu') || text.includes('navigation')) {
      issues.push({
        type: 'navigation_structure',
        severity: 'high',
        description: 'Navigation changes may confuse existing users'
      });
    }
    
    return issues;
  }

  checkDataConsistency(input, intent) {
    const issues = [];
    const text = (input + ' ' + intent).toLowerCase();
    
    if (text.includes('data') || text.includes('field') || text.includes('column')) {
      issues.push({
        type: 'data_structure',
        severity: 'high',
        description: 'Data structure changes require migration planning'
      });
    }
    
    return issues;
  }

  checkUserExperienceConsistency(input, intent, affectedComponents) {
    const issues = [];
    
    if (affectedComponents.length > 2) {
      issues.push({
        type: 'ux_consistency',
        severity: 'medium',
        description: 'Changes affecting multiple components may create UX inconsistencies'
      });
    }
    
    return issues;
  }

  /**
   * Get impact summary for UI display
   */
  getImpactSummary(analysis) {
    return {
      score: analysis.impact_score,
      risk_level: analysis.risk_level,
      affected_count: analysis.affected_components.length,
      breaking_changes: analysis.breaking_changes.length,
      effort_multiplier: analysis.estimated_effort_multiplier,
      rollback_complexity: analysis.rollback_complexity,
      top_recommendations: analysis.recommendations.slice(0, 3),
      critical_issues: analysis.consistency_issues.filter(i => i.severity === 'critical').length
    };
  }
}

module.exports = ImpactAnalyzer;