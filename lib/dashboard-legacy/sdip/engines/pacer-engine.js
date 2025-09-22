/**
 * PACER Engine - Backend-only analysis
 * Categorizes information using the PACER learning method
 * Results are stored in database but NOT displayed in UI for MVP+
 */

class PACEREngine {
  constructor() {
    this.version = 'v1.0';
    this.categories = {
      PROCEDURAL: 'procedural',
      ANALOGOUS: 'analogous',
      CONCEPTUAL: 'conceptual',
      EVIDENCE: 'evidence',
      REFERENCE: 'reference'
    };
  }

  /**
   * Main analysis function - runs PACER categorization
   * @param {string} input - Chairman's feedback text
   * @returns {object} PACER analysis (backend storage only)
   */
  async analyze(input) {
    if (!input || typeof input !== 'string') {
      throw new Error('Valid input text required for PACER analysis');
    }

    const analysis = {
      version: this.version,
      timestamp: new Date().toISOString(),
      categories: {
        procedural: this.extractProcedural(input),
        analogous: this.extractAnalogous(input),
        conceptual: this.extractConceptual(input),
        evidence: this.extractEvidence(input),
        reference: this.extractReference(input)
      },
      statistics: this.calculateStatistics(input)
    };

    // Calculate dominant category
    analysis.dominant_category = this.findDominantCategory(analysis.categories);
    
    return analysis;
  }

  /**
   * Extract procedural information (how-to, steps, implementation)
   */
  extractProcedural(input) {
    const patterns = {
      keywords: [
        'implement', 'create', 'build', 'develop', 'deploy',
        'install', 'configure', 'setup', 'update', 'fix',
        'step', 'process', 'workflow', 'procedure', 'method'
      ],
      phrases: [
        /how to \w+/gi,
        /need to \w+/gi,
        /should \w+/gi,
        /must \w+/gi,
        /first.+then/gi,
        /step \d+/gi
      ]
    };

    const matches = [];
    
    // Check keywords
    patterns.keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const found = input.match(regex);
      if (found) {
        matches.push({
          type: 'keyword',
          value: keyword,
          count: found.length
        });
      }
    });

    // Check phrases
    patterns.phrases.forEach(pattern => {
      const found = input.match(pattern);
      if (found) {
        matches.push({
          type: 'phrase',
          value: found[0],
          count: found.length
        });
      }
    });

    return {
      matches,
      score: this.calculateScore(matches),
      examples: matches.slice(0, 3).map(m => m.value)
    };
  }

  /**
   * Extract analogous information (comparisons, similarities)
   */
  extractAnalogous(input) {
    const patterns = {
      keywords: [
        'like', 'similar', 'same as', 'comparable', 'equivalent',
        'resembles', 'mirrors', 'parallels', 'analogous', 'akin'
      ],
      phrases: [
        /similar to \w+/gi,
        /like the \w+/gi,
        /same as \w+/gi,
        /just like \w+/gi,
        /comparable to \w+/gi
      ]
    };

    const matches = [];
    
    patterns.keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const found = input.match(regex);
      if (found) {
        matches.push({
          type: 'comparison',
          value: keyword,
          count: found.length
        });
      }
    });

    patterns.phrases.forEach(pattern => {
      const found = input.match(pattern);
      if (found) {
        matches.push({
          type: 'analogy',
          value: found[0],
          count: found.length
        });
      }
    });

    return {
      matches,
      score: this.calculateScore(matches),
      examples: matches.slice(0, 3).map(m => m.value)
    };
  }

  /**
   * Extract conceptual information (big picture, theories, relationships)
   */
  extractConceptual(input) {
    const patterns = {
      keywords: [
        'concept', 'theory', 'principle', 'framework', 'architecture',
        'strategy', 'approach', 'philosophy', 'paradigm', 'model',
        'system', 'structure', 'design', 'pattern', 'abstraction'
      ],
      phrases: [
        /overall \w+/gi,
        /big picture/gi,
        /high level/gi,
        /entire \w+/gi,
        /whole \w+/gi,
        /general \w+/gi
      ]
    };

    const matches = [];
    
    patterns.keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const found = input.match(regex);
      if (found) {
        matches.push({
          type: 'concept',
          value: keyword,
          count: found.length
        });
      }
    });

    patterns.phrases.forEach(pattern => {
      const found = input.match(pattern);
      if (found) {
        matches.push({
          type: 'abstraction',
          value: found[0],
          count: found.length
        });
      }
    });

    return {
      matches,
      score: this.calculateScore(matches),
      examples: matches.slice(0, 3).map(m => m.value)
    };
  }

  /**
   * Extract evidence information (facts, data, examples, statistics)
   */
  extractEvidence(input) {
    const patterns = {
      keywords: [
        'data', 'metric', 'statistic', 'number', 'percentage',
        'example', 'instance', 'case', 'proof', 'evidence',
        'fact', 'result', 'finding', 'observation', 'measurement'
      ],
      phrases: [
        /\d+%/g,
        /\$[\d,]+/g,
        /\d+ (users|items|pages|times|days|hours|minutes)/gi,
        /for example/gi,
        /such as/gi,
        /specifically/gi
      ]
    };

    const matches = [];
    
    patterns.keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const found = input.match(regex);
      if (found) {
        matches.push({
          type: 'evidence_keyword',
          value: keyword,
          count: found.length
        });
      }
    });

    patterns.phrases.forEach(pattern => {
      const found = input.match(pattern);
      if (found) {
        matches.push({
          type: 'evidence_data',
          value: found[0],
          count: found.length
        });
      }
    });

    return {
      matches,
      score: this.calculateScore(matches),
      examples: matches.slice(0, 3).map(m => m.value)
    };
  }

  /**
   * Extract reference information (links, citations, documentation)
   */
  extractReference(input) {
    const patterns = {
      keywords: [
        'documentation', 'reference', 'link', 'url', 'source',
        'citation', 'guide', 'manual', 'specification', 'standard',
        'article', 'paper', 'book', 'resource', 'material'
      ],
      phrases: [
        /https?:\/\/[^\s]+/gi,
        /see \w+/gi,
        /refer to \w+/gi,
        /according to \w+/gi,
        /based on \w+/gi,
        /per \w+/gi
      ]
    };

    const matches = [];
    
    patterns.keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const found = input.match(regex);
      if (found) {
        matches.push({
          type: 'reference_keyword',
          value: keyword,
          count: found.length
        });
      }
    });

    patterns.phrases.forEach(pattern => {
      const found = input.match(pattern);
      if (found) {
        matches.push({
          type: 'reference_pointer',
          value: found[0],
          count: found.length
        });
      }
    });

    return {
      matches,
      score: this.calculateScore(matches),
      examples: matches.slice(0, 3).map(m => m.value)
    };
  }

  /**
   * Calculate score based on matches
   */
  calculateScore(matches) {
    if (!matches || matches.length === 0) return 0;
    
    let score = 0;
    matches.forEach(match => {
      score += match.count * (match.type === 'keyword' ? 1 : 2);
    });
    
    return Math.min(score, 100); // Cap at 100
  }

  /**
   * Calculate statistics about the input
   */
  calculateStatistics(input) {
    const words = input.split(/\s+/);
    const sentences = input.split(/[.!?]+/).filter(s => s.trim());
    
    return {
      word_count: words.length,
      sentence_count: sentences.length,
      avg_sentence_length: Math.round(words.length / sentences.length),
      complexity_score: this.calculateComplexity(input)
    };
  }

  /**
   * Calculate text complexity
   */
  calculateComplexity(input) {
    const complexWords = input.match(/\b\w{10,}\b/g) || [];
    const technicalTerms = input.match(/\b(api|ui|ux|db|sql|css|html|javascript|backend|frontend|server|client)\b/gi) || [];
    
    return {
      complex_word_count: complexWords.length,
      technical_term_count: technicalTerms.length,
      overall: complexWords.length > 5 || technicalTerms.length > 3 ? 'high' : 'moderate'
    };
  }

  /**
   * Find the dominant PACER category
   */
  findDominantCategory(categories) {
    let maxScore = 0;
    let dominant = 'balanced';
    
    Object.entries(categories).forEach(([category, data]) => {
      if (data.score > maxScore) {
        maxScore = data.score;
        dominant = category;
      }
    });
    
    return dominant;
  }
}

module.exports = PACEREngine;