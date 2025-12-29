/**
 * Shared Intelligence Hub
 * Central knowledge sharing system for all sub-agents
 * Enables compound intelligence and cross-agent insights
 */

import EventEmitter from 'events';

class SharedIntelligenceHub extends EventEmitter {
  constructor() {
    super();
    
    // Shared knowledge base
    this.knowledge = {
      security: {
        vulnerabilities: new Map(),
        patterns: new Set(),
        libraries: new Set()
      },
      performance: {
        bottlenecks: new Map(),
        metrics: new Map(),
        antiPatterns: new Set()
      },
      design: {
        components: new Map(),
        accessibility: new Map(),
        inconsistencies: new Set()
      },
      database: {
        queries: new Map(),
        schemas: new Map(),
        indexes: new Set()
      },
      testing: {
        coverage: new Map(),
        missingTests: new Set(),
        testPatterns: new Set()
      }
    };
    
    // Insight correlations
    this.correlations = new Map();
    
    // Active findings across all agents
    this.activeFindings = new Map();
    
    // Cross-agent recommendations
    this.compoundInsights = [];
  }

  /**
   * Share a finding from an agent
   */
  shareFinding(agentName, finding) {
    const findingId = this.generateFindingId(finding);
    
    // Store the finding
    this.activeFindings.set(findingId, {
      agent: agentName,
      finding,
      timestamp: Date.now(),
      relatedFindings: []
    });
    
    // Store in agent-specific knowledge
    this.updateKnowledge(agentName, finding);
    
    // Find correlations with other agents' findings
    const correlations = this.findCorrelations(agentName, finding);
    
    if (correlations.length > 0) {
      this.correlations.set(findingId, correlations);
      
      // Generate compound insights
      this.generateCompoundInsights(finding, correlations);
      
      // Notify relevant agents
      this.notifyAgents(agentName, finding, correlations);
    }
    
    // Emit event for real-time collaboration
    this.emit('finding-shared', {
      agent: agentName,
      finding,
      correlations
    });
    
    return findingId;
  }

  /**
   * Update agent-specific knowledge
   */
  updateKnowledge(agentName, finding) {
    const agentKnowledge = this.knowledge[agentName.toLowerCase()];
    if (!agentKnowledge) return;
    
    switch (agentName.toLowerCase()) {
      case 'security':
        if (finding.type.includes('VULNERABILITY')) {
          agentKnowledge.vulnerabilities.set(finding.file, finding);
        }
        if (finding.pattern) {
          agentKnowledge.patterns.add(finding.pattern);
        }
        break;
        
      case 'performance':
        if (finding.type.includes('BOTTLENECK')) {
          agentKnowledge.bottlenecks.set(finding.location, finding);
        }
        if (finding.metric) {
          agentKnowledge.metrics.set(finding.metric.name, finding.metric.value);
        }
        break;
        
      case 'design':
        if (finding.type.includes('COMPONENT')) {
          agentKnowledge.components.set(finding.component, finding);
        }
        if (finding.type.includes('ACCESSIBILITY')) {
          agentKnowledge.accessibility.set(finding.wcag, finding);
        }
        break;
        
      case 'database':
        if (finding.type.includes('QUERY')) {
          agentKnowledge.queries.set(finding.queryId, finding);
        }
        if (finding.type.includes('INDEX')) {
          agentKnowledge.indexes.add(finding.suggestion);
        }
        break;
    }
  }

  /**
   * Find correlations with other agents' findings
   */
  findCorrelations(agentName, finding) {
    const correlations = [];
    
    // Check for file-based correlations
    for (const [_id, activeFinding] of this.activeFindings) {
      if (activeFinding.agent === agentName) continue;
      
      // Get file path from proper location (BaseSubAgent structure)
      const findingFile = finding.location?.file || finding.file;
      const activeFile = activeFinding.finding.location?.file || activeFinding.finding.file;
      
      // Same file correlation
      if (findingFile && activeFile === findingFile) {
        correlations.push({
          type: 'SAME_FILE',
          agent: activeFinding.agent,
          finding: activeFinding.finding,
          confidence: 0.9
        });
      }
      
      // Same component/function correlation
      const findingComponent = finding.metadata?.component || finding.component;
      const activeComponent = activeFinding.finding.metadata?.component || activeFinding.finding.component;
      
      if (findingComponent && activeComponent === findingComponent) {
        correlations.push({
          type: 'SAME_COMPONENT',
          agent: activeFinding.agent,
          finding: activeFinding.finding,
          confidence: 0.85
        });
      }
      
      // Pattern-based correlation
      if (this.isPatternRelated(finding, activeFinding.finding)) {
        correlations.push({
          type: 'RELATED_PATTERN',
          agent: activeFinding.agent,
          finding: activeFinding.finding,
          confidence: 0.7
        });
      }
    }
    
    // Check for semantic correlations
    correlations.push(...this.findSemanticCorrelations(agentName, finding));
    
    return correlations;
  }

  /**
   * Find semantic correlations (e.g., security issue → performance impact)
   */
  findSemanticCorrelations(agentName, finding) {
    const correlations = [];
    
    // Security → Performance correlations
    if (agentName === 'security' && finding.type.includes('ENCRYPTION')) {
      const perfData = this.knowledge.performance.metrics.get('crypto_operations');
      if (perfData) {
        correlations.push({
          type: 'SECURITY_PERFORMANCE_IMPACT',
          agent: 'performance',
          insight: 'Encryption may impact performance',
          confidence: 0.8
        });
      }
    }
    
    // Performance → Cost correlations
    if (agentName === 'performance' && finding.type.includes('MEMORY_LEAK')) {
      correlations.push({
        type: 'PERFORMANCE_COST_IMPACT',
        agent: 'cost',
        insight: 'Memory leaks increase infrastructure costs',
        confidence: 0.9
      });
    }
    
    // Database → Performance correlations
    if (agentName === 'database' && finding.type.includes('N_PLUS_ONE')) {
      correlations.push({
        type: 'DATABASE_PERFORMANCE_IMPACT',
        agent: 'performance',
        insight: 'N+1 queries severely impact performance',
        confidence: 0.95
      });
    }
    
    // Design → Testing correlations
    if (agentName === 'design' && finding.type.includes('ACCESSIBILITY')) {
      correlations.push({
        type: 'DESIGN_TESTING_REQUIREMENT',
        agent: 'testing',
        insight: 'Accessibility issue needs test coverage',
        confidence: 0.85
      });
    }
    
    return correlations;
  }

  /**
   * Generate compound insights from correlations
   */
  generateCompoundInsights(finding, correlations) {
    const insights = [];
    
    // Group correlations by type
    const correlationGroups = this.groupCorrelations(correlations);
    
    // Generate insights based on correlation patterns
    for (const [type, group] of correlationGroups) {
      if (type === 'SAME_FILE' && group.length >= 2) {
        insights.push({
          type: 'HOTSPOT',
          description: `File ${finding.file} has issues from ${group.length + 1} different agents`,
          agents: [finding.agent, ...group.map(c => c.agent)],
          priority: 'HIGH',
          recommendation: 'This file needs comprehensive refactoring'
        });
      }
      
      if (type === 'SECURITY_PERFORMANCE_IMPACT') {
        insights.push({
          type: 'TRADE_OFF',
          description: 'Security fix may impact performance',
          agents: ['security', 'performance'],
          priority: 'MEDIUM',
          recommendation: 'Consider performance when implementing security fix'
        });
      }
      
      if (type === 'DATABASE_PERFORMANCE_IMPACT') {
        insights.push({
          type: 'CASCADE_ISSUE',
          description: 'Database issue causing performance problems',
          agents: ['database', 'performance'],
          priority: 'CRITICAL',
          recommendation: 'Fix database issue first to resolve performance'
        });
      }
    }
    
    // Add to compound insights
    this.compoundInsights.push(...insights);
    
    return insights;
  }

  /**
   * Notify relevant agents about correlations
   */
  notifyAgents(sourceAgent, finding, correlations) {
    const relevantAgents = new Set(correlations.map(c => c.agent));
    
    for (const agent of relevantAgents) {
      this.emit(`notify-${agent}`, {
        source: sourceAgent,
        finding,
        correlations: correlations.filter(c => c.agent === agent)
      });
    }
  }

  /**
   * Get insights for a specific file
   */
  getFileInsights(filePath) {
    const insights = [];
    
    for (const [id, finding] of this.activeFindings) {
      // Check both possible locations for file path
      const file = finding.finding.location?.file || finding.finding.file;
      if (file === filePath) {
        insights.push({
          agent: finding.agent,
          finding: finding.finding,
          correlations: this.correlations.get(id) || []
        });
      }
    }
    
    return insights;
  }

  /**
   * Get compound insights across all agents
   */
  getCompoundInsights() {
    return this.compoundInsights.sort((a, b) => {
      const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Get agent collaboration opportunities
   */
  getCollaborationOpportunities() {
    const opportunities = [];
    
    // Find files with multiple agent findings
    const fileAgentMap = new Map();
    
    for (const [_id, finding] of this.activeFindings) {
      if (finding.finding.file) {
        if (!fileAgentMap.has(finding.finding.file)) {
          fileAgentMap.set(finding.finding.file, new Set());
        }
        fileAgentMap.get(finding.finding.file).add(finding.agent);
      }
    }
    
    // Identify collaboration opportunities
    for (const [file, agents] of fileAgentMap) {
      if (agents.size >= 2) {
        opportunities.push({
          file,
          agents: Array.from(agents),
          type: 'MULTI_AGENT_CONCERN',
          recommendation: `Run focused analysis with ${Array.from(agents).join(', ')} agents`
        });
      }
    }
    
    return opportunities;
  }

  /**
   * Get all findings as an array
   * SD-FOUNDATION-V3-003: Added to support integration test runner
   * @returns {Array} Array of finding objects
   */
  getAllFindings() {
    return Array.from(this.activeFindings.values())
      .map(entry => entry.finding);
  }

  /**
   * Get all correlations as a flattened array
   * SD-FOUNDATION-V3-003: Added to support integration test runner
   * @returns {Array} Flattened array of correlation objects
   */
  getCorrelations() {
    return Array.from(this.correlations.values()).flat();
  }

  /**
   * Get findings grouped by agent name
   * SD-FOUNDATION-V3-003: Added to support integration test runner
   * @returns {Object} Object with agent names as keys and arrays of findings as values
   */
  get agentFindings() {
    const grouped = {};
    for (const [_key, entry] of this.activeFindings) {
      const agent = entry.agent || 'unknown';
      if (!grouped[agent]) {
        grouped[agent] = [];
      }
      grouped[agent].push(entry.finding);
    }
    return grouped;
  }

  /**
   * Clear old findings (garbage collection)
   */
  clearOldFindings(maxAge = 3600000) { // 1 hour default
    const now = Date.now();
    const toDelete = [];
    
    for (const [id, finding] of this.activeFindings) {
      if (now - finding.timestamp > maxAge) {
        toDelete.push(id);
      }
    }
    
    toDelete.forEach(id => {
      this.activeFindings.delete(id);
      this.correlations.delete(id);
    });
    
    return toDelete.length;
  }

  // Helper methods
  
  generateFindingId(finding) {
    const content = `${finding.type}-${finding.file || ''}-${finding.line || ''}-${Date.now()}`;
    return require('crypto').createHash('md5').update(content).digest('hex').substring(0, 8);
  }
  
  isPatternRelated(finding1, finding2) {
    // Check if findings follow related patterns
    const patterns = {
      'SECURITY-PERFORMANCE': ['ENCRYPTION', 'HASHING', 'AUTH'],
      'DATABASE-PERFORMANCE': ['QUERY', 'N_PLUS_ONE', 'INDEX'],
      'DESIGN-TESTING': ['ACCESSIBILITY', 'COMPONENT', 'UI']
    };
    
    for (const [_relation, keywords] of Object.entries(patterns)) {
      const hasKeyword1 = keywords.some(k => finding1.type?.includes(k));
      const hasKeyword2 = keywords.some(k => finding2.type?.includes(k));
      if (hasKeyword1 && hasKeyword2) {
        return true;
      }
    }
    
    return false;
  }
  
  groupCorrelations(correlations) {
    const groups = new Map();
    
    correlations.forEach(correlation => {
      if (!groups.has(correlation.type)) {
        groups.set(correlation.type, []);
      }
      groups.get(correlation.type).push(correlation);
    });
    
    return groups;
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton instance of SharedIntelligenceHub
 */
function getInstance() {
  if (!instance) {
    instance = new SharedIntelligenceHub();
  }
  return instance;
}

export { SharedIntelligenceHub, getInstance };