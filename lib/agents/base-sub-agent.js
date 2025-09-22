/**
 * Base Sub-Agent Class
 * Provides standardized interface and utilities for all sub-agents
 * LEO Protocol v4.1.2 - Sub-Agent Enhancement
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import crypto from 'crypto';

class BaseSubAgent {
  constructor(name, emoji = '🤖') {
    this.name = name;
    this.emoji = emoji;
    this.findings = [];
    this.metrics = {};
    this.metadata = {
      startTime: null,
      endTime: null,
      filesScanned: 0,
      version: '1.0.0'
    };
    
    // Confidence thresholds
    this.confidenceThresholds = {
      minimum: 0.6,     // Don't report below this
      high: 0.8,        // High confidence
      certain: 0.95     // Near certain
    };
    
    // Severity weights for scoring
    this.severityWeights = {
      critical: 20,
      high: 10,
      medium: 5,
      low: 1,
      info: 0
    };
  }

  /**
   * Standard execute method - must be implemented by subclasses
   */
  async execute(context = {}) {
    this.metadata.startTime = new Date().toISOString();
    
    try {
      // Run the actual analysis (implemented by subclass)
      await this.analyze(context);
      
      // Deduplicate findings
      this.findings = this.deduplicateFindings(this.findings);
      
      // Filter by confidence
      this.findings = this.filterByConfidence(this.findings);
      
      // Calculate score
      const score = this.calculateScore();
      
      // Generate standard output
      return this.generateStandardOutput(score);
      
    } catch (error) {
      return this.handleError(error);
    } finally {
      this.metadata.endTime = new Date().toISOString();
    }
  }

  /**
   * Must be implemented by subclasses
   */
  async analyze(context) {
    throw new Error(`${this.name} must implement analyze() method`);
  }

  /**
   * Add a finding with standard structure
   */
  addFinding(finding) {
    // Generate unique ID based on content
    const id = this.generateFindingId(finding);
    
    // Standard structure
    const standardFinding = {
      id,
      agent: this.name,
      type: finding.type || 'UNKNOWN',
      severity: this.normalizeSeverity(finding.severity),
      confidence: finding.confidence || 0.7,
      location: {
        file: finding.file || null,
        line: finding.line || null,
        column: finding.column || null,
        snippet: finding.snippet || null
      },
      description: finding.description || 'No description provided',
      recommendation: finding.recommendation || null,
      metadata: finding.metadata || {},
      timestamp: new Date().toISOString()
    };
    
    this.findings.push(standardFinding);
    return standardFinding;
  }

  /**
   * Generate unique ID for finding
   */
  generateFindingId(finding) {
    const content = `${finding.type}-${finding.file}-${finding.line}-${finding.description}`;
    return crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
  }

  /**
   * Deduplicate findings
   */
  deduplicateFindings(findings) {
    const seen = new Map();
    const deduplicated = [];
    
    for (const finding of findings) {
      // Create dedup key
      const key = `${finding.type}-${finding.location.file}-${finding.location.line}`;
      
      if (seen.has(key)) {
        // Merge with existing if higher severity or confidence
        const existing = seen.get(key);
        if (finding.confidence > existing.confidence || 
            this.severityWeights[finding.severity] > this.severityWeights[existing.severity]) {
          seen.set(key, finding);
        }
      } else {
        seen.set(key, finding);
      }
    }
    
    // Convert back to array and group similar issues
    for (const [key, finding] of seen) {
      // Count similar issues
      const similarCount = findings.filter(f => 
        f.type === finding.type && 
        f.location.file === finding.location.file
      ).length;
      
      if (similarCount > 1) {
        finding.metadata = finding.metadata || {};
        finding.metadata.occurrences = similarCount;
        finding.description = `${finding.description} (${similarCount} occurrences in file)`;
      }
      
      deduplicated.push(finding);
    }
    
    return deduplicated;
  }

  /**
   * Filter findings by confidence threshold
   */
  filterByConfidence(findings) {
    return findings.filter(f => f.confidence >= this.confidenceThresholds.minimum);
  }

  /**
   * Calculate score based on severity-weighted findings
   */
  calculateScore() {
    let score = 100;
    
    // Group findings by severity
    const bySeverity = {};
    for (const finding of this.findings) {
      bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
    }
    
    // Apply severity weights
    for (const [severity, count] of Object.entries(bySeverity)) {
      const weight = this.severityWeights[severity] || 0;
      score -= Math.min(count * weight, 100); // Cap at 100 points deduction
    }
    
    return Math.max(0, score);
  }

  /**
   * Generate standard output format
   */
  generateStandardOutput(score) {
    // Group findings by severity
    const bySeverity = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      info: []
    };
    
    for (const finding of this.findings) {
      if (bySeverity[finding.severity]) {
        bySeverity[finding.severity].push(finding);
      }
    }
    
    return {
      agent: this.name,
      score,
      status: this.getStatus(score),
      summary: this.generateSummary(),
      findings: this.findings,
      findingsBySeverity: bySeverity,
      metrics: this.metrics,
      metadata: this.metadata,
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Get status based on score
   */
  getStatus(score) {
    if (score >= 90) return 'EXCELLENT';
    if (score >= 75) return 'GOOD';
    if (score >= 60) return 'ACCEPTABLE';
    if (score >= 40) return 'POOR';
    return 'CRITICAL';
  }

  /**
   * Generate summary
   */
  generateSummary() {
    const total = this.findings.length;
    const critical = this.findings.filter(f => f.severity === 'critical').length;
    const high = this.findings.filter(f => f.severity === 'high').length;
    
    if (critical > 0) {
      return `${critical} critical issues require immediate attention`;
    } else if (high > 0) {
      return `${high} high priority issues found`;
    } else if (total > 0) {
      return `${total} issues found, all manageable`;
    }
    return 'No issues found';
  }

  /**
   * Generate recommendations based on findings
   */
  generateRecommendations() {
    const recommendations = [];
    
    // Group by type and generate recommendations
    const byType = {};
    for (const finding of this.findings) {
      if (!byType[finding.type]) {
        byType[finding.type] = [];
      }
      byType[finding.type].push(finding);
    }
    
    // Create recommendations for each type
    for (const [type, findings] of Object.entries(byType)) {
      if (findings.length >= 3) {
        // Pattern detected
        recommendations.push({
          title: `Fix ${type} pattern`,
          description: `Found ${findings.length} instances of ${type}`,
          impact: this.getImpact(findings[0].severity),
          effort: this.estimateEffort(findings.length)
        });
      }
    }
    
    return recommendations.slice(0, 5); // Top 5 recommendations
  }

  /**
   * Normalize severity levels
   */
  normalizeSeverity(severity) {
    const normalized = String(severity).toLowerCase();
    const mapping = {
      'critical': 'critical',
      'high': 'high',
      'medium': 'medium',
      'low': 'low',
      'info': 'info',
      'error': 'critical',
      'warning': 'medium',
      'notice': 'low'
    };
    return mapping[normalized] || 'medium';
  }

  /**
   * Get impact level
   */
  getImpact(severity) {
    const impacts = {
      critical: 'CRITICAL',
      high: 'HIGH',
      medium: 'MEDIUM',
      low: 'LOW'
    };
    return impacts[severity] || 'MEDIUM';
  }

  /**
   * Estimate effort
   */
  estimateEffort(count) {
    if (count <= 1) return 'TRIVIAL';
    if (count <= 5) return 'SMALL';
    if (count <= 20) return 'MEDIUM';
    return 'LARGE';
  }

  /**
   * Handle errors
   */
  handleError(error) {
    return {
      agent: this.name,
      score: 0,
      status: 'ERROR',
      error: error.message,
      findings: [],
      findingsBySeverity: {
        critical: [],
        high: [],
        medium: [],
        low: [],
        info: []
      },
      metrics: this.metrics,
      metadata: this.metadata
    };
  }

  /**
   * Utility: Get source files
   */
  async getSourceFiles(basePath, extensions = ['.js', '.jsx', '.ts', '.tsx']) {
    const files = [];
    
    async function scan(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // Skip node_modules and hidden directories
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    }
    
    await scan(basePath);
    return files;
  }
}

export default BaseSubAgent;