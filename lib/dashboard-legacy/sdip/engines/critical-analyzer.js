/**
 * Critical Mode Analyzer
 * Implements "cold war judge" pattern for brutally honest feedback
 * No supportive mode in MVP+ - Critical only
 */

const OpenAI = require('openai');

class CriticalAnalyzer {
  constructor(openaiApiKey) {
    this.mode = 'CRITICAL'; // Only mode available in MVP+
    this.openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;
    
    // Critical mode configuration - skeptical, direct, no sugar-coating
    this.config = {
      tone: 'analytical',
      assumptions: 'skeptical',
      focus: 'challenges_first',
      language: 'direct',
      pattern: 'cold_war_judge',
      emphasis: 'risks_and_issues'
    };
  }

  /**
   * Extract intent with critical analysis
   * @param {string} input - Chairman's feedback
   * @returns {object} Intent analysis
   */
  async extractIntent(input) {
    if (!input) {
      throw new Error('Input required for intent extraction');
    }

    // Use AI if available, otherwise use rule-based extraction
    if (this.openai) {
      return await this.extractIntentWithAI(input);
    } else {
      return this.extractIntentRuleBased(input);
    }
  }

  /**
   * AI-powered intent extraction (Critical mode)
   */
  async extractIntentWithAI(input) {
    try {
      const prompt = `You are a brutally honest technical reviewer (think cold war era Olympic judge - exacting, critical, no praise).
      
      Analyze this feedback and extract the CORE INTENT. Be skeptical of vague language. Surface what they REALLY want, not what they say they want.
      
      Feedback: "${input}"
      
      Provide:
      1. Core intent (one sentence, no fluff)
      2. What's actually being asked for (vs what they think they want)
      3. Hidden complexity they haven't considered
      
      Format as JSON: {
        "intent": "single sentence intent",
        "actual_need": "what they really need",
        "hidden_complexity": "what they're missing"
      }`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a critical analyzer. Be direct, skeptical, and highlight issues. No sugar-coating.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3, // Low temperature for consistency
        response_format: { type: 'json_object' }
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      
      return {
        summary: analysis.intent,
        actual_need: analysis.actual_need,
        hidden_complexity: analysis.hidden_complexity,
        confidence: this.assessConfidence(input, analysis.intent)
      };
    } catch (error) {
      console.error('AI intent extraction failed:', error);
      return this.extractIntentRuleBased(input);
    }
  }

  /**
   * Rule-based intent extraction (fallback)
   */
  extractIntentRuleBased(input) {
    const sentences = input.split(/[.!?]+/).filter(s => s.trim());
    const firstSentence = sentences[0] || input.substring(0, 100);
    
    // Look for action verbs
    const actionVerbs = ['need', 'want', 'should', 'must', 'require', 'fix', 'change', 'update', 'improve', 'redesign'];
    const foundVerbs = actionVerbs.filter(verb => 
      input.toLowerCase().includes(verb)
    );

    // Extract core intent
    let intent = firstSentence.trim();
    if (intent.length > 100) {
      intent = intent.substring(0, 97) + '...';
    }

    // Critical assessment
    const vagueness = this.assessVagueness(input);
    const complexity = this.assessComplexity(input);

    return {
      summary: intent,
      actual_need: vagueness.high ? 'Unclear - requires clarification' : intent,
      hidden_complexity: complexity.issues.join('; ') || 'No obvious hidden complexity detected',
      confidence: vagueness.high ? 'low' : 'moderate'
    };
  }

  /**
   * Generate synthesis with critical analysis
   * @param {string} input - Chairman's feedback
   * @param {string} intent - Confirmed intent
   * @returns {object} Synthesis with aligned/required/recommended
   */
  async generateSynthesis(input, intent) {
    if (this.openai) {
      return await this.generateSynthesisWithAI(input, intent);
    } else {
      return this.generateSynthesisRuleBased(input, intent);
    }
  }

  /**
   * AI-powered synthesis generation
   */
  async generateSynthesisWithAI(input, intent) {
    try {
      const prompt = `You are a critical technical analyst (cold war judge pattern - no mercy, no praise).
      
      Intent: "${intent}"
      Feedback: "${input}"
      
      Provide a CRITICAL synthesis:
      1. Aligned changes - what directly addresses the intent (be skeptical)
      2. Required dependencies - what MUST happen first (don't skip the hard parts)
      3. Recommended enhancements - what they SHOULD do but probably won't
      
      For each item, note the REAL difficulty and risk.
      
      Format as JSON: {
        "aligned": [{"text": "change", "difficulty": "high/med/low", "risk": "description"}],
        "required": [{"text": "dependency", "difficulty": "high/med/low", "risk": "description"}],
        "recommended": [{"text": "enhancement", "difficulty": "high/med/low", "risk": "description"}]
      }`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Be critically honest. Highlight risks and difficulties. No sugar-coating.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('AI synthesis generation failed:', error);
      return this.generateSynthesisRuleBased(input, intent);
    }
  }

  /**
   * Rule-based synthesis generation
   */
  generateSynthesisRuleBased(input, intent) {
    const inputLower = input.toLowerCase();
    
    const synthesis = {
      aligned: [],
      required: [],
      recommended: []
    };

    // Detect UI changes
    if (inputLower.includes('ui') || inputLower.includes('interface') || inputLower.includes('design')) {
      synthesis.aligned.push({
        text: 'Update user interface components',
        difficulty: 'high',
        risk: 'May break existing user workflows'
      });
      synthesis.required.push({
        text: 'Design system compatibility check',
        difficulty: 'medium',
        risk: 'Incompatible with current design system'
      });
    }

    // Detect navigation changes
    if (inputLower.includes('navigation') || inputLower.includes('menu')) {
      synthesis.aligned.push({
        text: 'Restructure navigation system',
        difficulty: 'high',
        risk: 'Users will get lost during transition'
      });
      synthesis.required.push({
        text: 'User journey mapping',
        difficulty: 'medium',
        risk: 'Current assumptions may be wrong'
      });
    }

    // Detect performance issues
    if (inputLower.includes('slow') || inputLower.includes('performance') || inputLower.includes('speed')) {
      synthesis.aligned.push({
        text: 'Optimize performance bottlenecks',
        difficulty: 'high',
        risk: 'May require architecture changes'
      });
      synthesis.required.push({
        text: 'Performance profiling and benchmarking',
        difficulty: 'medium',
        risk: 'Real issue may be different than assumed'
      });
    }

    // Add generic items if nothing specific detected
    if (synthesis.aligned.length === 0) {
      synthesis.aligned.push({
        text: 'Address stated requirements',
        difficulty: 'medium',
        risk: 'Requirements are unclear and may change'
      });
    }

    if (synthesis.required.length === 0) {
      synthesis.required.push({
        text: 'Conduct impact analysis',
        difficulty: 'low',
        risk: 'May uncover significant blockers'
      });
    }

    // Always recommend testing
    synthesis.recommended.push({
      text: 'Comprehensive testing strategy',
      difficulty: 'medium',
      risk: 'Skipping this will cause production issues'
    });

    return synthesis;
  }

  /**
   * Generate clarifying questions (critical/probing)
   * @param {string} input - Chairman's feedback
   * @param {object} analysis - Current analysis
   * @returns {array} Clarifying questions
   */
  async generateQuestions(input, analysis) {
    const questions = [];
    
    // Always ask about timeline if not mentioned
    if (!input.toLowerCase().includes('deadline') && 
        !input.toLowerCase().includes('timeline') && 
        !input.toLowerCase().includes('when')) {
      questions.push({
        id: 'timeline',
        question: 'What is the actual deadline? (Not the wished-for date)',
        type: 'text',
        critical: true
      });
    }

    // Ask about scope if strategic
    if (analysis.strat_tac && analysis.strat_tac.strategic_pct > 50) {
      questions.push({
        id: 'scope',
        question: 'Full rollout or pilot? (Pilots usually become permanent)',
        type: 'choice',
        options: ['Pilot (but really permanent)', 'Phased (will take 3x longer)', 'Full (risky)'],
        critical: true
      });
    }

    // Ask about budget/resources
    if (!input.toLowerCase().includes('budget') && 
        !input.toLowerCase().includes('cost') && 
        !input.toLowerCase().includes('resource')) {
      questions.push({
        id: 'budget',
        question: 'What is the real budget? (Not the optimistic one)',
        type: 'text',
        critical: true
      });
    }

    // Ask about failure conditions
    questions.push({
      id: 'failure',
      question: 'What happens if this fails? (It might)',
      type: 'text',
      critical: true
    });

    // Limit to 3 most important questions
    return questions.slice(0, 3);
  }

  /**
   * Generate strategic/tactical classification
   * @param {string} input - Chairman's feedback
   * @returns {object} Classification with percentages
   */
  async classifyStrategicTactical(input) {
    const analysis = {
      strategic_indicators: [],
      tactical_indicators: [],
      strategic_pct: 0,
      tactical_pct: 0
    };

    const inputLower = input.toLowerCase();

    // Strategic indicators
    const strategicKeywords = [
      'strategy', 'vision', 'long-term', 'transform', 'overhaul',
      'redesign', 'architecture', 'framework', 'paradigm', 'approach',
      'entire', 'complete', 'comprehensive', 'fundamental', 'core'
    ];

    // Tactical indicators
    const tacticalKeywords = [
      'fix', 'bug', 'update', 'tweak', 'adjust', 'modify',
      'change', 'edit', 'correct', 'improve', 'enhance',
      'specific', 'particular', 'single', 'component', 'feature'
    ];

    // Count indicators
    strategicKeywords.forEach(keyword => {
      if (inputLower.includes(keyword)) {
        analysis.strategic_indicators.push(keyword);
      }
    });

    tacticalKeywords.forEach(keyword => {
      if (inputLower.includes(keyword)) {
        analysis.tactical_indicators.push(keyword);
      }
    });

    // Calculate percentages
    const strategicCount = analysis.strategic_indicators.length;
    const tacticalCount = analysis.tactical_indicators.length;
    const total = strategicCount + tacticalCount || 1;

    analysis.strategic_pct = Math.round((strategicCount / total) * 100);
    analysis.tactical_pct = 100 - analysis.strategic_pct;

    // Adjust based on scope
    if (inputLower.includes('all') || inputLower.includes('every') || inputLower.includes('entire')) {
      analysis.strategic_pct = Math.min(100, analysis.strategic_pct + 20);
      analysis.tactical_pct = 100 - analysis.strategic_pct;
    }

    // Critical assessment
    analysis.assessment = this.getCriticalAssessment(analysis.strategic_pct);

    return analysis;
  }

  /**
   * Get critical assessment of strategic/tactical balance
   */
  getCriticalAssessment(strategicPct) {
    if (strategicPct > 70) {
      return 'Highly strategic - expect 3x timeline and budget overruns';
    } else if (strategicPct > 40) {
      return 'Mixed scope - likely to experience scope creep';
    } else {
      return 'Mostly tactical - but watch for hidden dependencies';
    }
  }

  /**
   * Assess vagueness of input
   */
  assessVagueness(input) {
    const vagueTerms = ['maybe', 'possibly', 'might', 'could', 'should', 'probably', 'somewhat', 'kind of', 'sort of'];
    const foundVague = vagueTerms.filter(term => 
      input.toLowerCase().includes(term)
    );

    return {
      high: foundVague.length > 2,
      terms: foundVague,
      score: foundVague.length
    };
  }

  /**
   * Assess complexity
   */
  assessComplexity(input) {
    const issues = [];
    
    if (input.length > 500) {
      issues.push('Long description suggests unclear requirements');
    }
    
    if (input.split(',').length > 5) {
      issues.push('Multiple requirements bundled together');
    }
    
    if (input.includes('everything') || input.includes('all')) {
      issues.push('Scope too broad - "everything" is never everything');
    }

    return {
      high: issues.length > 0,
      issues
    };
  }

  /**
   * Assess confidence in intent
   */
  assessConfidence(input, intent) {
    const vagueness = this.assessVagueness(input);
    const complexity = this.assessComplexity(input);
    
    if (vagueness.high || complexity.high) {
      return 'low';
    } else if (vagueness.score > 0 || complexity.issues.length > 0) {
      return 'moderate';
    } else {
      return 'high';
    }
  }
}

module.exports = CriticalAnalyzer;