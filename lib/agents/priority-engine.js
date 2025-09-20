/**
 * Smart Prioritization Engine
 * Calculates fix priorities based on multiple factors
 * Tells users exactly what to fix first
 */

class PriorityEngine {
  constructor() {
    // Scoring weights for different factors
    this.weights = {
      severity: 0.35,      // How bad is the issue?
      impact: 0.25,        // How many users/components affected?
      effort: 0.20,        // How hard to fix?
      confidence: 0.10,    // How sure are we?
      dependencies: 0.10   // Does it block other fixes?
    };
    
    // Severity scores
    this.severityScores = {
      critical: 100,
      high: 75,
      medium: 50,
      low: 25,
      info: 5
    };
    
    // Effort estimates (in minutes)
    this.effortEstimates = {
      HARDCODED_SECRET: 5,
      MISSING_ALT_TEXT: 2,
      XSS_VULNERABILITY: 15,
      SQL_INJECTION: 20,
      N_PLUS_ONE_QUERY: 30,
      MEMORY_LEAK: 45,
      MISSING_INDEX: 10,
      DOM_QUERY_IN_LOOP: 15,
      MISSING_TEST: 30,
      ACCESSIBILITY_ISSUE: 10
    };
  }

  /**
   * Prioritize findings from all agents
   */
  prioritizeFindings(findings, options = {}) {
    const { maxResults = 5, includeEffort = true, groupByFile = false } = options;
    
    // Calculate priority score for each finding
    const scoredFindings = findings.map(finding => ({
      ...finding,
      priorityScore: this.calculatePriorityScore(finding),
      estimatedEffort: this.estimateEffort(finding),
      impactScore: this.calculateImpact(finding),
      dependencies: this.findDependencies(finding, findings)
    }));
    
    // Sort by priority score
    scoredFindings.sort((a, b) => b.priorityScore - a.priorityScore);
    
    // Group by file if requested
    if (groupByFile) {
      return this.groupByFileWithPriority(scoredFindings, maxResults);
    }
    
    // Get top priorities
    const topPriorities = scoredFindings.slice(0, maxResults);
    
    // Generate action plan
    return this.generateActionPlan(topPriorities, includeEffort);
  }

  /**
   * Calculate priority score for a finding
   */
  calculatePriorityScore(finding) {
    let score = 0;
    
    // Severity component
    const severityScore = this.severityScores[finding.severity] || 50;
    score += severityScore * this.weights.severity;
    
    // Impact component
    const impactScore = this.calculateImpact(finding);
    score += impactScore * this.weights.impact;
    
    // Effort component (inverse - easier = higher priority)
    const effortScore = this.calculateEffortScore(finding);
    score += effortScore * this.weights.effort;
    
    // Confidence component
    const confidenceScore = (finding.confidence || 0.7) * 100;
    score += confidenceScore * this.weights.confidence;
    
    // Dependencies component
    const hasBlockers = finding.blocks?.length > 0;
    const dependencyScore = hasBlockers ? 100 : 50;
    score += dependencyScore * this.weights.dependencies;
    
    // Boost for security issues
    if (finding.agent === 'security') {
      score *= 1.2;
    }
    
    // Boost for user-facing issues
    if (finding.metadata?.userFacing) {
      score *= 1.15;
    }
    
    return Math.round(score);
  }

  /**
   * Calculate impact of a finding
   */
  calculateImpact(finding) {
    let impact = 50; // Base impact
    
    // File criticality
    if (finding.file) {
      if (finding.file.includes('auth') || finding.file.includes('payment')) {
        impact += 30;
      } else if (finding.file.includes('api') || finding.file.includes('route')) {
        impact += 20;
      } else if (finding.file.includes('component') || finding.file.includes('view')) {
        impact += 15;
      }
    }
    
    // Occurrence count
    if (finding.metadata?.occurrences > 1) {
      impact += Math.min(finding.metadata.occurrences * 5, 30);
    }
    
    // Cross-agent impact
    if (finding.correlations?.length > 0) {
      impact += finding.correlations.length * 10;
    }
    
    // Performance impact
    if (finding.type?.includes('PERFORMANCE') || finding.type?.includes('MEMORY')) {
      impact += 20;
    }
    
    // Security impact
    if (finding.type?.includes('SECURITY') || finding.type?.includes('VULNERABILITY')) {
      impact += 25;
    }
    
    return Math.min(impact, 100);
  }

  /**
   * Calculate effort score (inverse of effort)
   */
  calculateEffortScore(finding) {
    const effort = this.estimateEffort(finding);
    
    // Convert to score (lower effort = higher score)
    if (effort <= 5) return 100;
    if (effort <= 10) return 80;
    if (effort <= 20) return 60;
    if (effort <= 30) return 40;
    if (effort <= 60) return 20;
    return 10;
  }

  /**
   * Estimate effort to fix in minutes
   */
  estimateEffort(finding) {
    // Check predefined estimates
    if (this.effortEstimates[finding.type]) {
      return this.effortEstimates[finding.type];
    }
    
    // Estimate based on severity
    const baseEffort = {
      critical: 45,
      high: 30,
      medium: 20,
      low: 10,
      info: 5
    }[finding.severity] || 20;
    
    // Adjust for complexity
    if (finding.metadata?.complexity === 'high') {
      return baseEffort * 2;
    } else if (finding.metadata?.complexity === 'low') {
      return baseEffort * 0.5;
    }
    
    // Adjust for auto-fix availability
    if (finding.autoFix) {
      return Math.max(2, baseEffort * 0.2);
    }
    
    return baseEffort;
  }

  /**
   * Find dependencies between findings
   */
  findDependencies(finding, allFindings) {
    const dependencies = [];
    
    // Check if this finding blocks others
    const blocks = allFindings.filter(other => {
      if (other === finding) return false;
      
      // Same file dependency
      if (finding.file === other.file && finding.line < other.line) {
        if (finding.severity === 'critical' || finding.severity === 'high') {
          return true;
        }
      }
      
      // Database index blocks query optimization
      if (finding.type === 'MISSING_INDEX' && other.type === 'SLOW_QUERY') {
        return true;
      }
      
      // Authentication blocks other security fixes
      if (finding.type?.includes('AUTH') && other.agent === 'security') {
        return true;
      }
      
      // Build errors block everything
      if (finding.type === 'BUILD_ERROR') {
        return true;
      }
      
      return false;
    });
    
    if (blocks.length > 0) {
      dependencies.push({
        type: 'BLOCKS',
        count: blocks.length,
        findings: blocks.slice(0, 3).map(f => f.type)
      });
    }
    
    // Check what this finding depends on
    const dependsOn = allFindings.filter(other => {
      if (other === finding) return false;
      
      // Test depends on implementation
      if (finding.agent === 'testing' && other.agent === 'security') {
        return true;
      }
      
      // Performance optimization depends on bug fixes
      if (finding.agent === 'performance' && other.severity === 'critical') {
        return true;
      }
      
      return false;
    });
    
    if (dependsOn.length > 0) {
      dependencies.push({
        type: 'DEPENDS_ON',
        count: dependsOn.length,
        findings: dependsOn.slice(0, 3).map(f => f.type)
      });
    }
    
    return dependencies;
  }

  /**
   * Generate action plan for top priorities
   */
  generateActionPlan(priorities, includeEffort = true) {
    const plan = {
      immediate: [],      // Fix right now (< 10 min total)
      today: [],         // Fix today (< 2 hours total)
      thisWeek: [],      // Fix this week
      totalEffort: 0,
      criticalPath: []
    };
    
    let immediateTime = 0;
    let todayTime = 0;
    
    priorities.forEach(finding => {
      const effort = finding.estimatedEffort;
      
      // Categorize by effort
      if (immediateTime + effort <= 10) {
        plan.immediate.push(this.formatFinding(finding, includeEffort));
        immediateTime += effort;
      } else if (todayTime + effort <= 120) {
        plan.today.push(this.formatFinding(finding, includeEffort));
        todayTime += effort;
      } else {
        plan.thisWeek.push(this.formatFinding(finding, includeEffort));
      }
      
      plan.totalEffort += effort;
      
      // Add to critical path if it blocks others
      if (finding.dependencies?.some(d => d.type === 'BLOCKS')) {
        plan.criticalPath.push({
          finding: finding.type,
          blocks: finding.dependencies.find(d => d.type === 'BLOCKS').count
        });
      }
    });
    
    // Add summary
    plan.summary = this.generateSummary(plan, priorities);
    
    return plan;
  }

  /**
   * Format finding for action plan
   */
  formatFinding(finding, includeEffort) {
    const formatted = {
      type: finding.type,
      severity: finding.severity,
      location: finding.file ? `${finding.file}:${finding.line || '?'}` : 'Multiple locations',
      description: finding.description,
      score: finding.priorityScore
    };
    
    if (includeEffort) {
      formatted.effort = `${finding.estimatedEffort} min`;
      formatted.impact = this.describeImpact(finding.impactScore);
    }
    
    if (finding.autoFix) {
      formatted.autoFix = true;
      formatted.fixCommand = finding.autoFix.command || 'Available';
    }
    
    if (finding.recommendation) {
      formatted.fix = finding.recommendation;
    }
    
    return formatted;
  }

  /**
   * Group findings by file with priority
   */
  groupByFileWithPriority(findings, maxGroups) {
    const fileGroups = new Map();
    
    // Group by file
    findings.forEach(finding => {
      const file = finding.file || 'General';
      if (!fileGroups.has(file)) {
        fileGroups.set(file, {
          file,
          findings: [],
          maxPriority: 0,
          totalEffort: 0
        });
      }
      
      const group = fileGroups.get(file);
      group.findings.push(finding);
      group.maxPriority = Math.max(group.maxPriority, finding.priorityScore);
      group.totalEffort += finding.estimatedEffort;
    });
    
    // Sort groups by max priority
    const sortedGroups = Array.from(fileGroups.values())
      .sort((a, b) => b.maxPriority - a.maxPriority)
      .slice(0, maxGroups);
    
    // Format for output
    return sortedGroups.map(group => ({
      file: group.file,
      priority: group.maxPriority,
      effort: `${group.totalEffort} min`,
      issues: group.findings.length,
      topIssues: group.findings.slice(0, 3).map(f => ({
        type: f.type,
        severity: f.severity
      }))
    }));
  }

  /**
   * Generate summary for action plan
   */
  generateSummary(plan, priorities) {
    const summary = {
      totalIssues: priorities.length,
      estimatedTime: this.formatTime(plan.totalEffort),
      immediateActions: plan.immediate.length,
      criticalFindings: priorities.filter(f => f.severity === 'critical').length,
      autoFixAvailable: priorities.filter(f => f.autoFix).length
    };
    
    // Add motivational message
    if (plan.immediate.length > 0) {
      const immediateTime = plan.immediate.reduce((sum, f) => {
        const effort = parseInt(f.effort) || 0;
        return sum + effort;
      }, 0);
      summary.message = `Start with ${plan.immediate.length} quick fixes (${immediateTime} min) for immediate impact!`;
    } else if (summary.criticalFindings > 0) {
      summary.message = `Focus on ${summary.criticalFindings} critical issues first!`;
    } else {
      summary.message = `Steady progress: ${summary.totalIssues} improvements identified.`;
    }
    
    return summary;
  }

  /**
   * Describe impact level
   */
  describeImpact(score) {
    if (score >= 80) return 'Critical - Affects core functionality';
    if (score >= 60) return 'High - Affects many users/components';
    if (score >= 40) return 'Medium - Noticeable impact';
    if (score >= 20) return 'Low - Minor impact';
    return 'Minimal - Cosmetic or edge case';
  }

  /**
   * Format time in human-readable format
   */
  formatTime(minutes) {
    if (minutes < 60) {
      return `${minutes} minutes`;
    }
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (mins === 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    
    return `${hours} hour${hours > 1 ? 's' : ''} ${mins} min`;
  }

  /**
   * Get quick wins (low effort, high impact)
   */
  getQuickWins(findings, maxResults = 5) {
    const quickWins = findings
      .filter(f => this.estimateEffort(f) <= 10) // 10 minutes or less
      .map(f => ({
        ...f,
        roi: this.calculateImpact(f) / Math.max(1, this.estimateEffort(f))
      }))
      .sort((a, b) => b.roi - a.roi)
      .slice(0, maxResults);
    
    return quickWins.map(f => ({
      type: f.type,
      location: f.file ? `${f.file}:${f.line}` : 'Multiple',
      effort: `${this.estimateEffort(f)} min`,
      impact: this.describeImpact(this.calculateImpact(f)),
      roi: f.roi.toFixed(1)
    }));
  }
}

export default PriorityEngine;