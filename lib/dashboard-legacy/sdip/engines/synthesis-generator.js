/**
 * Synthesis Generator with Change Policy Badges
 * Generates aligned/required/recommended items with policy classifications
 */

class SynthesisGenerator {
  constructor() {
    // Policy badge definitions
    this.policies = {
      UI: {
        HIGH: { label: 'UI:HIGH', color: '#FF4444', tooltip: 'Major UI redesign required' },
        MED: { label: 'UI:MED', color: '#FF8800', tooltip: 'Moderate UI changes' },
        LOW: { label: 'UI:LOW', color: '#44BB44', tooltip: 'Minor UI tweaks' }
      },
      DB: {
        HIGH: { label: 'DB:HIGH', color: '#FF4444', tooltip: 'Schema migration required' },
        MED: { label: 'DB:MED', color: '#FF8800', tooltip: 'Query optimization needed' },
        LOW: { label: 'DB:LOW', color: '#44BB44', tooltip: 'Data updates only' }
      },
      COMPLEX: {
        HIGH: { label: 'COMPLEX:HIGH', color: '#9B59B6', tooltip: 'Affects multiple systems' },
        MED: { label: 'COMPLEX:MED', color: '#3498DB', tooltip: 'Single system changes' },
        LOW: { label: 'COMPLEX:LOW', color: '#44BB44', tooltip: 'Isolated component' }
      },
      SECURITY: {
        HIGH: { label: 'SECURITY:HIGH', color: '#FF0000', tooltip: 'Security implications' },
        MED: { label: 'SECURITY:MED', color: '#FF8800', tooltip: 'Security review needed' },
        LOW: { label: 'SECURITY:LOW', color: '#44BB44', tooltip: 'Minimal security impact' }
      },
      PERFORMANCE: {
        HIGH: { label: 'PERF:HIGH', color: '#E74C3C', tooltip: 'Major performance impact' },
        MED: { label: 'PERF:MED', color: '#F39C12', tooltip: 'Moderate performance impact' },
        LOW: { label: 'PERF:LOW', color: '#44BB44', tooltip: 'Minimal performance impact' }
      },
      ACCESS: {
        HIGH: { label: 'ACCESS:HIGH', color: '#E74C3C', tooltip: 'Critical accessibility requirement' },
        MED: { label: 'ACCESS:MED', color: '#F39C12', tooltip: 'Important accessibility feature' },
        LOW: { label: 'ACCESS:LOW', color: '#44BB44', tooltip: 'Minor accessibility improvement' }
      },
      PROCESS: {
        HIGH: { label: 'PROCESS:HIGH', color: '#E67E22', tooltip: 'Major process changes required' },
        MED: { label: 'PROCESS:MED', color: '#F39C12', tooltip: 'Process adjustments needed' },
        LOW: { label: 'PROCESS:LOW', color: '#44BB44', tooltip: 'Minor process updates' }
      }
    };
  }

  /**
   * Generate complete synthesis with badges
   * @param {object} criticalAnalysis - Analysis from critical analyzer
   * @param {string} intent - Confirmed intent
   * @param {string} input - Original input
   * @returns {object} Synthesis with badges
   */
  async generate(criticalAnalysis, intent, input) {
    // Start with critical analysis synthesis if available
    let synthesis = criticalAnalysis || {
      aligned: [],
      required: [],
      recommended: []
    };

    // Enhance each item with policy badges
    synthesis.aligned = this.addPolicyBadges(synthesis.aligned, 'aligned', input);
    synthesis.required = this.addPolicyBadges(synthesis.required, 'required', input);
    synthesis.recommended = this.addPolicyBadges(synthesis.recommended, 'recommended', input);

    // Ensure minimum items
    synthesis = this.ensureMinimumItems(synthesis, input);

    // Add metadata
    synthesis.metadata = {
      generated_at: new Date().toISOString(),
      total_items: synthesis.aligned.length + synthesis.required.length + synthesis.recommended.length,
      complexity_assessment: this.assessOverallComplexity(synthesis)
    };

    return synthesis;
  }

  /**
   * Add policy badges to synthesis items
   */
  addPolicyBadges(items, category, input) {
    if (!Array.isArray(items)) {
      items = [];
    }

    return items.map(item => {
      // Ensure item has proper structure
      if (typeof item === 'string') {
        item = { text: item };
      }

      // Analyze item to determine badges
      const badges = this.determineBadges(item.text, category, input);
      
      return {
        ...item,
        badges,
        badge_details: this.getBadgeDetails(badges),
        complexity_score: this.calculateItemComplexity(badges)
      };
    });
  }

  /**
   * Determine which badges apply to an item
   */
  determineBadges(text, category, input) {
    const badges = [];
    const textLower = text.toLowerCase();
    const inputLower = input.toLowerCase();

    // UI Badge
    if (this.hasUIImpact(textLower, inputLower)) {
      const level = this.determineUILevel(textLower, category);
      badges.push(`UI:${level}`);
    }

    // Database Badge
    if (this.hasDBImpact(textLower, inputLower)) {
      const level = this.determineDBLevel(textLower, category);
      badges.push(`DB:${level}`);
    }

    // Complexity Badge
    const complexityLevel = this.determineComplexityLevel(textLower, category);
    badges.push(`COMPLEX:${complexityLevel}`);

    // Security Badge
    if (this.hasSecurityImpact(textLower, inputLower)) {
      const level = this.determineSecurityLevel(textLower, category);
      badges.push(`SECURITY:${level}`);
    }

    // Performance Badge
    if (this.hasPerformanceImpact(textLower, inputLower)) {
      const level = this.determinePerformanceLevel(textLower, category);
      badges.push(`PERF:${level}`);
    }

    // Accessibility Badge
    if (this.hasAccessibilityImpact(textLower, inputLower)) {
      const level = this.determineAccessibilityLevel(textLower, category);
      badges.push(`ACCESS:${level}`);
    }

    // Process Badge
    if (this.hasProcessImpact(textLower, inputLower)) {
      const level = this.determineProcessLevel(textLower, category);
      badges.push(`PROCESS:${level}`);
    }

    return badges;
  }

  /**
   * Check for UI impact
   */
  hasUIImpact(text, input) {
    const uiKeywords = [
      'ui', 'interface', 'design', 'layout', 'component', 'view',
      'page', 'screen', 'button', 'form', 'navigation', 'menu',
      'color', 'style', 'css', 'theme', 'responsive', 'mobile'
    ];
    
    return uiKeywords.some(keyword => 
      text.includes(keyword) || input.includes(keyword)
    );
  }

  determineUILevel(text, category) {
    if (category === 'required' || text.includes('redesign') || text.includes('overhaul')) {
      return 'HIGH';
    } else if (category === 'aligned' || text.includes('update') || text.includes('improve')) {
      return 'MED';
    } else {
      return 'LOW';
    }
  }

  /**
   * Check for database impact
   */
  hasDBImpact(text, input) {
    const dbKeywords = [
      'database', 'db', 'schema', 'table', 'query', 'migration',
      'data', 'storage', 'index', 'sql', 'postgres', 'supabase',
      'model', 'entity', 'relationship', 'foreign key'
    ];
    
    return dbKeywords.some(keyword => 
      text.includes(keyword) || input.includes(keyword)
    );
  }

  determineDBLevel(text, category) {
    if (text.includes('schema') || text.includes('migration') || text.includes('restructure')) {
      return 'HIGH';
    } else if (text.includes('query') || text.includes('index') || text.includes('optimize')) {
      return 'MED';
    } else {
      return 'LOW';
    }
  }

  /**
   * Determine complexity level
   */
  determineComplexityLevel(text, category) {
    if (category === 'required' && (text.includes('system') || text.includes('architecture'))) {
      return 'HIGH';
    } else if (category === 'aligned' || text.includes('multiple') || text.includes('integration')) {
      return 'MED';
    } else {
      return 'LOW';
    }
  }

  /**
   * Check for security impact
   */
  hasSecurityImpact(text, input) {
    const securityKeywords = [
      'security', 'auth', 'authentication', 'authorization', 'permission',
      'role', 'access', 'token', 'session', 'encrypt', 'password',
      'vulnerability', 'injection', 'xss', 'csrf', 'cors'
    ];
    
    return securityKeywords.some(keyword => 
      text.includes(keyword) || input.includes(keyword)
    );
  }

  determineSecurityLevel(text, category) {
    if (text.includes('auth') || text.includes('permission') || text.includes('vulnerability')) {
      return 'HIGH';
    } else if (text.includes('access') || text.includes('role')) {
      return 'MED';
    } else {
      return 'LOW';
    }
  }

  /**
   * Check for performance impact
   */
  hasPerformanceImpact(text, input) {
    const perfKeywords = [
      'performance', 'speed', 'slow', 'fast', 'optimize', 'cache',
      'load', 'latency', 'throughput', 'scalability', 'efficiency',
      'memory', 'cpu', 'resource', 'bottleneck'
    ];
    
    return perfKeywords.some(keyword => 
      text.includes(keyword) || input.includes(keyword)
    );
  }

  determinePerformanceLevel(text, category) {
    if (text.includes('architecture') || text.includes('scalability') || text.includes('bottleneck')) {
      return 'HIGH';
    } else if (text.includes('optimize') || text.includes('cache')) {
      return 'MED';
    } else {
      return 'LOW';
    }
  }

  /**
   * Check for accessibility impact
   */
  hasAccessibilityImpact(text, input) {
    const accessKeywords = [
      'accessibility', 'a11y', 'aria', 'screen reader', 'keyboard',
      'wcag', 'contrast', 'alt text', 'focus', 'tab order',
      'disability', 'accessible', 'navigation', 'announce'
    ];
    
    return accessKeywords.some(keyword => 
      text.includes(keyword) || input.includes(keyword)
    );
  }

  determineAccessibilityLevel(text, category) {
    if (text.includes('wcag') || text.includes('compliance') || text.includes('screen reader')) {
      return 'HIGH';
    } else if (text.includes('contrast') || text.includes('keyboard')) {
      return 'MED';
    } else {
      return 'LOW';
    }
  }

  /**
   * Check for process impact
   */
  hasProcessImpact(text, input) {
    const processKeywords = [
      'process', 'workflow', 'procedure', 'methodology', 'framework',
      'standard', 'guideline', 'review', 'approval', 'deployment',
      'release', 'testing', 'documentation', 'training'
    ];
    
    return processKeywords.some(keyword => 
      text.includes(keyword) || input.includes(keyword)
    );
  }

  determineProcessLevel(text, category) {
    if (text.includes('workflow') || text.includes('methodology') || text.includes('framework')) {
      return 'HIGH';
    } else if (text.includes('review') || text.includes('testing')) {
      return 'MED';
    } else {
      return 'LOW';
    }
  }

  /**
   * Get badge details for display
   */
  getBadgeDetails(badges) {
    return badges.map(badge => {
      const [category, level] = badge.split(':');
      const policy = this.policies[category];
      
      if (policy && policy[level]) {
        return policy[level];
      }
      
      return { label: badge, color: '#999999', tooltip: 'Unknown badge' };
    });
  }

  /**
   * Calculate item complexity based on badges
   */
  calculateItemComplexity(badges) {
    let score = 0;
    
    badges.forEach(badge => {
      if (badge.includes('HIGH')) {
        score += 3;
      } else if (badge.includes('MED')) {
        score += 2;
      } else {
        score += 1;
      }
    });
    
    return score;
  }

  /**
   * Ensure minimum items in synthesis
   */
  ensureMinimumItems(synthesis, input) {
    // Ensure at least one aligned item
    if (synthesis.aligned.length === 0) {
      synthesis.aligned.push({
        text: 'Address stated requirements',
        badges: ['COMPLEX:MED'],
        badge_details: this.getBadgeDetails(['COMPLEX:MED']),
        complexity_score: 2,
        generated: true
      });
    }

    // Ensure at least one required item
    if (synthesis.required.length === 0) {
      synthesis.required.push({
        text: 'Conduct impact analysis and planning',
        badges: ['PROCESS:HIGH'],
        badge_details: this.getBadgeDetails(['PROCESS:HIGH']),
        complexity_score: 3,
        generated: true
      });
    }

    // Always include testing recommendation
    const hasTestingRec = synthesis.recommended.some(item => 
      item.text && item.text.toLowerCase().includes('test')
    );
    
    if (!hasTestingRec) {
      synthesis.recommended.push({
        text: 'Implement comprehensive testing strategy',
        badges: ['PROCESS:MED', 'COMPLEX:MED'],
        badge_details: this.getBadgeDetails(['PROCESS:MED', 'COMPLEX:MED']),
        complexity_score: 4,
        generated: true
      });
    }

    return synthesis;
  }

  /**
   * Assess overall complexity
   */
  assessOverallComplexity(synthesis) {
    const allItems = [
      ...synthesis.aligned,
      ...synthesis.required,
      ...synthesis.recommended
    ];

    const totalScore = allItems.reduce((sum, item) => 
      sum + (item.complexity_score || 0), 0
    );

    const avgScore = totalScore / allItems.length;

    if (avgScore > 6) {
      return {
        level: 'HIGH',
        description: 'Complex implementation with significant risks',
        score: totalScore
      };
    } else if (avgScore > 3) {
      return {
        level: 'MEDIUM',
        description: 'Moderate complexity with manageable scope',
        score: totalScore
      };
    } else {
      return {
        level: 'LOW',
        description: 'Straightforward implementation',
        score: totalScore
      };
    }
  }

  /**
   * Generate client-ready summary
   * @param {object} synthesis - Complete synthesis
   * @param {object} answers - Question answers
   * @returns {string} Plain language summary
   */
  generateClientSummary(synthesis, answers = {}) {
    const summary = [];
    
    // Lead with aligned changes
    if (synthesis.aligned && synthesis.aligned.length > 0) {
      synthesis.aligned.slice(0, 2).forEach(item => {
        summary.push(`• ${this.simplifyText(item.text)}`);
      });
    }

    // Add critical dependencies
    if (synthesis.required && synthesis.required.length > 0) {
      summary.push(`• Requires: ${this.summarizeDependencies(synthesis.required)}`);
    }

    // Add timeline if provided
    if (answers.timeline) {
      summary.push(`• Timeline: ${answers.timeline}`);
    }

    // Add scope if provided
    if (answers.scope) {
      summary.push(`• Approach: ${answers.scope}`);
    }

    // Add complexity assessment
    if (synthesis.metadata && synthesis.metadata.complexity_assessment) {
      const complexity = synthesis.metadata.complexity_assessment;
      summary.push(`• Complexity: ${complexity.level} - ${complexity.description}`);
    }

    // Add budget if provided
    if (answers.budget) {
      summary.push(`• Budget: ${answers.budget}`);
    }

    // Keep to 5-8 bullets
    return summary.slice(0, 8);
  }

  /**
   * Simplify technical text for executives
   */
  simplifyText(text) {
    return text
      .replace(/API/g, 'system interface')
      .replace(/UI/g, 'user interface')
      .replace(/DB/g, 'database')
      .replace(/schema/g, 'data structure')
      .replace(/migration/g, 'update')
      .replace(/refactor/g, 'reorganize')
      .replace(/optimize/g, 'improve');
  }

  /**
   * Summarize dependencies in simple terms
   */
  summarizeDependencies(required) {
    if (required.length === 1) {
      return this.simplifyText(required[0].text);
    } else if (required.length === 2) {
      return `${this.simplifyText(required[0].text)} and ${this.simplifyText(required[1].text)}`;
    } else {
      return `${required.length} preparatory steps`;
    }
  }
}

module.exports = SynthesisGenerator;