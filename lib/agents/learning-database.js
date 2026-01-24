/**
 * Historical Learning Database
 * Tracks patterns, learns from past analyses, gets smarter over time
 * Uses machine learning concepts for continuous improvement
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import EventEmitter from 'events';

class LearningDatabase extends EventEmitter {
  constructor() {
    super();

    // SD-SEC-ERROR-HANDLING-001: Track interval references for cleanup
    this._intervals = [];

    // Pattern recognition data
    this.patterns = {
      falsePositives: new Map(),    // Patterns that are usually false positives
      truePositives: new Map(),     // Patterns that are usually real issues
      fixPatterns: new Map(),       // Successful fix patterns
      correlations: new Map()       // Issue correlations
    };
    
    // Historical metrics
    this.metrics = {
      analysisRuns: 0,
      totalFindings: 0,
      confirmedIssues: 0,
      falsePositiveRate: 0,
      averageFixTime: 0,
      commonIssues: new Map()
    };
    
    // Learning models
    this.models = {
      severity: new SeverityModel(),
      confidence: new ConfidenceModel(),
      priority: new PriorityModel(),
      autoFix: new AutoFixModel()
    };
    
    // Feedback tracking
    this.feedback = {
      userConfirmed: new Set(),
      userRejected: new Set(),
      autoFixed: new Set(),
      manuallyFixed: new Set()
    };
    
    // Persistence
    this.dbFile = path.join(process.cwd(), '.leo-learning-db.json');
  }

  /**
   * Initialize learning database
   */
  async initialize() {
    await this.loadDatabase();
    this.startLearningCycle();
  }

  /**
   * Learn from analysis results
   */
  async learnFromAnalysis(results) {
    this.metrics.analysisRuns++;
    
    for (const finding of results.findings || []) {
      await this.processFinding(finding);
    }
    
    // Update models with new data
    await this.updateModels(results);
    
    // Save learnings
    await this.saveDatabase();
    
    // Emit learning event
    this.emit('learning-complete', {
      patterns: this.patterns.truePositives.size,
      confidence: this.calculateAverageConfidence()
    });
  }

  /**
   * Process individual finding for learning
   */
  async processFinding(finding) {
    const pattern = this.extractPattern(finding);
    
    // Track common issues
    const issueKey = `${finding.type}-${finding.agent}`;
    this.metrics.commonIssues.set(
      issueKey,
      (this.metrics.commonIssues.get(issueKey) || 0) + 1
    );
    
    // Learn from confidence scores
    if (finding.confidence) {
      this.models.confidence.addDataPoint(pattern, finding.confidence);
    }
    
    // Learn from severity patterns
    if (finding.severity) {
      this.models.severity.addDataPoint(pattern, finding.severity);
    }
    
    // Track correlations
    await this.learnCorrelations(finding);
    
    this.metrics.totalFindings++;
  }

  /**
   * Extract pattern from finding
   */
  extractPattern(finding) {
    return {
      type: finding.type,
      agent: finding.agent,
      filePattern: this.getFilePattern(finding.location?.file),
      codePattern: this.getCodePattern(finding.location?.snippet),
      context: {
        hasTest: finding.location?.file?.includes('test'),
        isConfig: finding.location?.file?.includes('config'),
        isVendor: finding.location?.file?.includes('vendor')
      }
    };
  }

  /**
   * Get file pattern (extension, directory structure)
   */
  getFilePattern(filePath) {
    if (!filePath) return null;
    
    const ext = path.extname(filePath);
    const dirs = path.dirname(filePath).split(path.sep);
    
    return {
      extension: ext,
      depth: dirs.length,
      isTest: filePath.includes('test') || filePath.includes('spec'),
      isSource: filePath.includes('src') || filePath.includes('lib'),
      isConfig: filePath.includes('config') || ext === '.json'
    };
  }

  /**
   * Get code pattern from snippet
   */
  getCodePattern(snippet) {
    if (!snippet) return null;
    
    return {
      hasAsync: /async|await|Promise/.test(snippet),
      hasLoop: /for|while|forEach|map/.test(snippet),
      hasCondition: /if|switch|ternary|\?/.test(snippet),
      hasAPI: /fetch|axios|request|http/.test(snippet),
      hasDOM: /document|querySelector|getElementById/.test(snippet),
      hasSQL: /SELECT|INSERT|UPDATE|DELETE|JOIN/.test(snippet)
    };
  }

  /**
   * Learn correlations between findings
   */
  async learnCorrelations(finding) {
    const key = `${finding.type}-${finding.agent}`;
    
    if (!this.patterns.correlations.has(key)) {
      this.patterns.correlations.set(key, {
        coOccurrences: new Map(),
        frequency: 0
      });
    }
    
    const correlation = this.patterns.correlations.get(key);
    correlation.frequency++;
    
    // Track what other issues occur with this one
    // (This would be populated from batch analysis)
  }

  /**
   * Record user feedback
   */
  async recordFeedback(findingId, feedback) {
    switch (feedback) {
      case 'CONFIRMED':
        this.feedback.userConfirmed.add(findingId);
        this.metrics.confirmedIssues++;
        await this.learnFromConfirmation(findingId);
        break;
        
      case 'FALSE_POSITIVE':
        this.feedback.userRejected.add(findingId);
        await this.learnFromRejection(findingId);
        break;
        
      case 'AUTO_FIXED':
        this.feedback.autoFixed.add(findingId);
        await this.learnFromAutoFix(findingId);
        break;
        
      case 'MANUALLY_FIXED':
        this.feedback.manuallyFixed.add(findingId);
        await this.learnFromManualFix(findingId);
        break;
    }
    
    // Update false positive rate
    this.updateFalsePositiveRate();
    
    await this.saveDatabase();
  }

  /**
   * Learn from confirmed issues
   */
  async learnFromConfirmation(findingId) {
    // Increase confidence for similar patterns
    this.models.confidence.boost(findingId, 0.1);
    
    // Mark pattern as true positive
    this.patterns.truePositives.set(findingId, {
      timestamp: Date.now(),
      boostFactor: 1.2
    });
  }

  /**
   * Learn from rejected findings
   */
  async learnFromRejection(findingId) {
    // Decrease confidence for similar patterns
    this.models.confidence.penalize(findingId, 0.2);
    
    // Mark pattern as false positive
    this.patterns.falsePositives.set(findingId, {
      timestamp: Date.now(),
      penaltyFactor: 0.5
    });
  }

  /**
   * Learn from successful auto-fixes
   */
  async learnFromAutoFix(findingId) {
    // Track successful fix pattern
    this.patterns.fixPatterns.set(findingId, {
      timestamp: Date.now(),
      success: true
    });
    
    // Boost auto-fix confidence
    this.models.autoFix.addSuccessfulFix(findingId);
  }

  /**
   * Learn from manual fixes
   */
  async learnFromManualFix(findingId) {
    // Note that auto-fix wasn't sufficient
    this.models.autoFix.addManualFix(findingId);
  }

  /**
   * Get adjusted confidence based on learning
   */
  getAdjustedConfidence(finding) {
    const pattern = this.extractPattern(finding);
    const baseConfidence = finding.confidence || 0.7;
    
    // Check if pattern is known false positive
    const patternKey = JSON.stringify(pattern);
    if (this.patterns.falsePositives.has(patternKey)) {
      const penalty = this.patterns.falsePositives.get(patternKey);
      return baseConfidence * penalty.penaltyFactor;
    }
    
    // Check if pattern is known true positive
    if (this.patterns.truePositives.has(patternKey)) {
      const boost = this.patterns.truePositives.get(patternKey);
      return Math.min(1.0, baseConfidence * boost.boostFactor);
    }
    
    // Use model prediction
    return this.models.confidence.predict(pattern, baseConfidence);
  }

  /**
   * Get adjusted severity based on learning
   */
  getAdjustedSeverity(finding) {
    const pattern = this.extractPattern(finding);
    return this.models.severity.predict(pattern, finding.severity);
  }

  /**
   * Get intelligent recommendations
   */
  getRecommendations(findings) {
    const recommendations = [];
    
    // Group findings by type
    const byType = new Map();
    for (const finding of findings) {
      const key = finding.type;
      if (!byType.has(key)) {
        byType.set(key, []);
      }
      byType.get(key).push(finding);
    }
    
    // Generate recommendations based on patterns
    for (const [type, group] of byType) {
      const history = this.metrics.commonIssues.get(type) || 0;
      
      if (history > 10 && group.length > 5) {
        recommendations.push({
          type: 'RECURRING_ISSUE',
          title: `Recurring ${type} issues`,
          description: `This issue has appeared ${history} times historically and ${group.length} times in current scan`,
          suggestion: 'Consider creating a linting rule or automated fix'
        });
      }
    }
    
    // Check for correlated issues
    const correlations = this.findStrongCorrelations(findings);
    for (const correlation of correlations) {
      recommendations.push({
        type: 'CORRELATED_ISSUES',
        title: `Related issues: ${correlation.type1} and ${correlation.type2}`,
        description: `These issues appear together ${correlation.frequency}% of the time`,
        suggestion: 'Fix these issues together for better results'
      });
    }
    
    return recommendations;
  }

  /**
   * Find strong correlations in findings
   */
  findStrongCorrelations(_findings) {
    const correlations = [];
    const threshold = 0.7; // 70% correlation
    
    for (const [key, data] of this.patterns.correlations) {
      // Check if coOccurrences is a Map (it should be)
      if (data.coOccurrences && data.coOccurrences instanceof Map) {
        for (const [coKey, coData] of data.coOccurrences) {
          const correlation = coData / data.frequency;
          if (correlation >= threshold) {
            correlations.push({
              type1: key,
              type2: coKey,
              frequency: Math.round(correlation * 100)
            });
          }
        }
      }
    }
    
    return correlations;
  }

  /**
   * Update learning models
   */
  async updateModels(results) {
    // Update all models with new data
    await this.models.severity.update(results);
    await this.models.confidence.update(results);
    await this.models.priority.update(results);
    await this.models.autoFix.update(results);
  }

  /**
   * Start continuous learning cycle
   * SD-SEC-ERROR-HANDLING-001: Store interval references for proper cleanup
   */
  startLearningCycle() {
    // Periodic model optimization
    const optimizeInterval = setInterval(() => {
      this.optimizeModels();
    }, 60 * 60 * 1000); // Every hour
    this._intervals.push(optimizeInterval);

    // Periodic cache cleanup
    const cleanupInterval = setInterval(() => {
      this.cleanupOldData();
    }, 24 * 60 * 60 * 1000); // Daily
    this._intervals.push(cleanupInterval);
  }

  /**
   * Stop all learning cycles and cleanup
   * SD-SEC-ERROR-HANDLING-001: Prevent memory leaks on shutdown
   */
  stopLearningCycle() {
    for (const interval of this._intervals) {
      clearInterval(interval);
    }
    this._intervals = [];
    console.log('[LearningDatabase] Learning cycles stopped');
  }

  /**
   * Optimize learning models
   */
  optimizeModels() {
    for (const model of Object.values(this.models)) {
      model.optimize();
    }
    
    console.log('Learning models optimized');
  }

  /**
   * Clean up old learning data
   */
  cleanupOldData() {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    const now = Date.now();
    
    // Clean up old patterns
    for (const [key, data] of this.patterns.falsePositives) {
      if (now - data.timestamp > maxAge) {
        this.patterns.falsePositives.delete(key);
      }
    }
    
    console.log('Old learning data cleaned up');
  }

  /**
   * Update false positive rate
   */
  updateFalsePositiveRate() {
    const total = this.feedback.userConfirmed.size + this.feedback.userRejected.size;
    if (total > 0) {
      this.metrics.falsePositiveRate = this.feedback.userRejected.size / total;
    }
  }

  /**
   * Calculate average confidence
   */
  calculateAverageConfidence() {
    return this.models.confidence.getAverageConfidence();
  }

  /**
   * Get learning statistics
   */
  getStatistics() {
    return {
      analysisRuns: this.metrics.analysisRuns,
      totalFindings: this.metrics.totalFindings,
      confirmedIssues: this.metrics.confirmedIssues,
      falsePositiveRate: Math.round(this.metrics.falsePositiveRate * 100) + '%',
      learnedPatterns: this.patterns.truePositives.size,
      knownFalsePositives: this.patterns.falsePositives.size,
      successfulAutoFixes: this.feedback.autoFixed.size,
      commonIssues: Array.from(this.metrics.commonIssues.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([issue, count]) => ({ issue, count }))
    };
  }

  /**
   * Load database from disk
   */
  async loadDatabase() {
    try {
      const data = await fs.readFile(this.dbFile, 'utf8');
      const parsed = JSON.parse(data);
      
      // Restore patterns
      this.patterns.falsePositives = new Map(parsed.patterns?.falsePositives || []);
      this.patterns.truePositives = new Map(parsed.patterns?.truePositives || []);
      this.patterns.fixPatterns = new Map(parsed.patterns?.fixPatterns || []);
      this.patterns.correlations = new Map(parsed.patterns?.correlations || []);
      
      // Restore metrics
      Object.assign(this.metrics, parsed.metrics || {});
      this.metrics.commonIssues = new Map(parsed.metrics?.commonIssues || []);
      
      // Restore feedback
      this.feedback.userConfirmed = new Set(parsed.feedback?.userConfirmed || []);
      this.feedback.userRejected = new Set(parsed.feedback?.userRejected || []);
      this.feedback.autoFixed = new Set(parsed.feedback?.autoFixed || []);
      this.feedback.manuallyFixed = new Set(parsed.feedback?.manuallyFixed || []);
      
      console.log(`Loaded learning database: ${this.metrics.analysisRuns} analysis runs`);
    } catch {
      console.log('Starting with fresh learning database');
    }
  }

  /**
   * Save database to disk
   */
  async saveDatabase() {
    const data = {
      version: '1.0.0',
      timestamp: Date.now(),
      patterns: {
        falsePositives: Array.from(this.patterns.falsePositives.entries()),
        truePositives: Array.from(this.patterns.truePositives.entries()),
        fixPatterns: Array.from(this.patterns.fixPatterns.entries()),
        correlations: Array.from(this.patterns.correlations.entries())
      },
      metrics: {
        ...this.metrics,
        commonIssues: Array.from(this.metrics.commonIssues.entries())
      },
      feedback: {
        userConfirmed: Array.from(this.feedback.userConfirmed),
        userRejected: Array.from(this.feedback.userRejected),
        autoFixed: Array.from(this.feedback.autoFixed),
        manuallyFixed: Array.from(this.feedback.manuallyFixed)
      }
    };
    
    await fs.writeFile(this.dbFile, JSON.stringify(data, null, 2), 'utf8');
  }
}

/**
 * Base Learning Model
 */
class BaseLearningModel {
  constructor(name) {
    this.name = name;
    this.dataPoints = [];
    this.weights = new Map();
  }
  
  addDataPoint(pattern, value) {
    this.dataPoints.push({ pattern, value, timestamp: Date.now() });
    
    // Keep last 1000 data points
    if (this.dataPoints.length > 1000) {
      this.dataPoints.shift();
    }
  }
  
  predict(pattern, defaultValue) {
    // Simple weighted average for now
    // In production, could use more sophisticated ML
    const key = JSON.stringify(pattern);
    return this.weights.get(key) || defaultValue;
  }
  
  update(_results) {
    // Update weights based on results
    // This is where real ML algorithms would go
  }
  
  optimize() {
    // Optimize model weights
    // Remove old/irrelevant patterns
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    this.dataPoints = this.dataPoints.filter(
      point => now - point.timestamp < maxAge
    );
  }
}

/**
 * Severity Learning Model
 */
class SeverityModel extends BaseLearningModel {
  constructor() {
    super('severity');
  }
  
  predict(pattern, defaultSeverity) {
    // Adjust severity based on context
    if (pattern.context?.isTest) {
      // Lower severity for test files
      return this.lowerSeverity(defaultSeverity);
    }
    
    if (pattern.context?.isVendor) {
      // Much lower severity for vendor files
      return 'info';
    }
    
    if (pattern.filePattern?.isConfig && defaultSeverity === 'critical') {
      // Config issues are often critical
      return 'critical';
    }
    
    return defaultSeverity;
  }
  
  lowerSeverity(severity) {
    const levels = ['info', 'low', 'medium', 'high', 'critical'];
    const index = levels.indexOf(severity);
    return levels[Math.max(0, index - 1)];
  }
}

/**
 * Confidence Learning Model
 */
class ConfidenceModel extends BaseLearningModel {
  constructor() {
    super('confidence');
    this.boosts = new Map();
    this.penalties = new Map();
  }
  
  boost(patternId, amount) {
    this.boosts.set(patternId, (this.boosts.get(patternId) || 0) + amount);
  }
  
  penalize(patternId, amount) {
    this.penalties.set(patternId, (this.penalties.get(patternId) || 0) + amount);
  }
  
  predict(pattern, baseConfidence) {
    const key = JSON.stringify(pattern);
    const boost = this.boosts.get(key) || 0;
    const penalty = this.penalties.get(key) || 0;
    
    const adjusted = baseConfidence + boost - penalty;
    return Math.max(0, Math.min(1, adjusted));
  }
  
  getAverageConfidence() {
    if (this.dataPoints.length === 0) return 0.7;
    
    const sum = this.dataPoints.reduce((acc, point) => acc + point.value, 0);
    return sum / this.dataPoints.length;
  }
}

/**
 * Priority Learning Model
 */
class PriorityModel extends BaseLearningModel {
  constructor() {
    super('priority');
    this.userPriorities = new Map();
  }
  
  predict(pattern, defaultPriority) {
    // Learn from user fix order
    const key = JSON.stringify(pattern);
    return this.userPriorities.get(key) || defaultPriority;
  }
  
  learnFromFixOrder(patterns) {
    // Track which issues users fix first
    patterns.forEach((pattern, index) => {
      const key = JSON.stringify(pattern);
      const priority = 100 - index; // Higher = fixed earlier
      this.userPriorities.set(key, priority);
    });
  }
}

/**
 * Auto-Fix Learning Model
 */
class AutoFixModel extends BaseLearningModel {
  constructor() {
    super('autoFix');
    this.successRates = new Map();
  }
  
  addSuccessfulFix(patternId) {
    const current = this.successRates.get(patternId) || { success: 0, total: 0 };
    current.success++;
    current.total++;
    this.successRates.set(patternId, current);
  }
  
  addManualFix(patternId) {
    const current = this.successRates.get(patternId) || { success: 0, total: 0 };
    current.total++;
    this.successRates.set(patternId, current);
  }
  
  getSuccessRate(patternId) {
    const stats = this.successRates.get(patternId);
    if (!stats || stats.total === 0) return 0.5; // Default 50%
    
    return stats.success / stats.total;
  }
  
  shouldAutoFix(patternId) {
    return this.getSuccessRate(patternId) > 0.8; // 80% success threshold
  }
}

// Export singleton instance
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new LearningDatabase();
  }
  return instance;
}

export {
  LearningDatabase,
  getInstance
};