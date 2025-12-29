/**
 * LEAD Agent Over-Engineering Evaluation Rubric
 * Standardized criteria for evaluating Strategic Directives
 * Prevents subjective/inconsistent LEAD decisions
 */

class OverEngineeringRubric {
  constructor() {
    // Aligned with LEAD persona decision_making.criteria from lead-agent.json
    this.criteria = {
      userNeedValidation: {
        name: 'Validated User Need & Problem Severity',
        description: 'Is the user problem validated and severity documented?',
        scale: {
          1: 'No user validation - building without user need confirmation',
          2: 'Weak validation - assumed need without data',
          3: 'Some validation - user feedback exists but limited',
          4: 'Well validated - clear user pain points documented',
          5: 'Fully validated - critical user need with severity data'
        }
      },
      userImpact: {
        name: 'Measurable User Impact & Adoption Potential',
        description: 'Can we measure user impact? What is adoption potential?',
        scale: {
          1: 'No measurable impact - unclear how users benefit',
          2: 'Limited impact - affects few users or edge cases',
          3: 'Moderate impact - benefits subset of users',
          4: 'High impact - benefits majority of users measurably',
          5: 'Critical impact - transformative for all users'
        }
      },
      businessValue: {
        name: 'Business Value & Strategic Alignment',
        description: 'Does this deliver clear business value aligned with strategy?',
        scale: {
          1: 'No business value - unclear strategic fit',
          2: 'Minimal business value - weak strategic alignment',
          3: 'Moderate business value - acceptable strategic fit',
          4: 'High business value - strong strategic alignment',
          5: 'Critical business value - essential to strategy'
        }
      },
      timeToValue: {
        name: 'Time to Value for Users',
        description: 'How quickly can users realize value?',
        scale: {
          1: 'Very delayed - value realized only after many iterations',
          2: 'Delayed - value requires significant user effort',
          3: 'Moderate - value realized within reasonable timeframe',
          4: 'Fast - value realized quickly with minimal friction',
          5: 'Immediate - value realized instantly on delivery'
        }
      },
      effortVsImpact: {
        name: 'Effort vs Impact (RICE/ICE Scoring)',
        description: 'Development effort compared to expected impact',
        scale: {
          1: 'Massive effort, minimal impact - poor RICE score',
          2: 'High effort, limited impact - questionable RICE score',
          3: 'Moderate effort, moderate impact - acceptable RICE score',
          4: 'Reasonable effort, high impact - good RICE score',
          5: 'Low effort, massive impact - excellent RICE score'
        }
      },
      technicalFeasibility: {
        name: 'Technical Feasibility & Risk',
        description: 'Is this technically feasible? What are the risks?',
        scale: {
          1: 'Very high technical risk - feasibility uncertain',
          2: 'High technical risk - significant unknowns',
          3: 'Moderate technical risk - manageable challenges',
          4: 'Low technical risk - proven technology',
          5: 'Minimal technical risk - straightforward implementation'
        }
      }
    };

    // Thresholds for over-engineering determination (aligned with LEAD persona)
    this.thresholds = {
      overEngineered: 15, // Total score ≤15/30 indicates over-engineering
      clarificationZone: 18, // Scores 15-18 trigger intent clarification
      lowUserNeed: 2, // User need validation ≤2 is problematic
      lowBusinessValue: 2, // Business value ≤2 is concerning
      poorRICE: 2, // Effort vs Impact ≤2 is poor RICE score
      highTechnicalRisk: 2 // Technical feasibility ≤2 is high risk
    };
  }

  /**
   * Evaluate a Strategic Directive for over-engineering
   */
  evaluateSD(sd, manualScores = null) {
    const scores = manualScores || this.autoScore(sd);
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);

    // Determine over-engineering status (returns object with clarification info)
    const engineeringStatus = this.determineOverEngineering(scores, totalScore);

    // Generate recommendation
    const recommendation = this.generateRecommendation(scores, totalScore, engineeringStatus.isOverEngineered);

    return {
      sdId: sd.id,
      title: sd.title,
      scores,
      totalScore,
      maxScore: 30,
      percentage: ((totalScore / 30) * 100).toFixed(1),
      isOverEngineered: engineeringStatus.isOverEngineered,
      needsClarification: engineeringStatus.needsClarification,
      clarificationReason: engineeringStatus.clarificationReason,
      clarifyingQuestions: engineeringStatus.needsClarification ? this.generateClarifyingQuestions(sd, scores) : [],
      rephrasesSuggestions: engineeringStatus.needsClarification ? this.suggestRephrases(sd, scores) : [],
      recommendation,
      reasoning: this.generateReasoning(scores, totalScore, engineeringStatus.isOverEngineered),
      requiresHumanReview: this.requiresHumanReview(scores, totalScore) || engineeringStatus.needsClarification
    };
  }

  /**
   * Auto-score based on SD content analysis
   */
  autoScore(sd) {
    const text = [sd.title, sd.description, sd.scope, sd.strategic_intent, sd.strategic_objectives]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    // Detect validation and user need indicators
    const validationIndicators = ['validated', 'research', 'data', 'feedback', 'survey', 'interview', 'analysis'];
    const validationMatches = validationIndicators.filter(i => text.includes(i)).length;

    // Detect user impact indicators
    const userImpactIndicators = ['user', 'customer', 'adoption', 'engagement', 'retention', 'satisfaction'];
    const userImpactMatches = userImpactIndicators.filter(i => text.includes(i)).length;

    // Detect business value indicators
    const businessValueIndicators = ['revenue', 'cost', 'efficiency', 'productivity', 'quality', 'risk', 'compliance'];
    const businessValueMatches = businessValueIndicators.filter(i => text.includes(i)).length;

    // Detect critical infrastructure needs (high severity)
    const criticalIndicators = ['critical', 'zero', 'crisis', 'security', 'reliability', 'testing', 'quality'];
    const criticalMatches = criticalIndicators.filter(i => text.includes(i)).length;

    // Detect effort indicators
    const highEffortIndicators = ['comprehensive', 'infrastructure', 'framework', 'architecture', 'migration'];
    const effortMatches = highEffortIndicators.filter(i => text.includes(i)).length;

    // Detect technical risk indicators
    const riskIndicators = ['new', 'experimental', 'prototype', 'poc', 'spike', 'unknown'];
    const riskMatches = riskIndicators.filter(i => text.includes(i)).length;

    // Generate scores based on LEAD persona criteria
    return {
      userNeedValidation: Math.min(5, Math.max(1, validationMatches > 0 ? 2 + validationMatches : (criticalMatches >= 2 ? 4 : 2))),
      userImpact: Math.min(5, Math.max(1, userImpactMatches > 0 ? 2 + userImpactMatches : (criticalMatches >= 2 ? 5 : 3))),
      businessValue: Math.min(5, Math.max(1, businessValueMatches > 0 ? 2 + businessValueMatches : (criticalMatches >= 2 ? 5 : 3))),
      timeToValue: effortMatches > 2 ? 2 : 3, // High effort = delayed time to value
      effortVsImpact: this.calculateRICEScore(effortMatches, userImpactMatches, criticalMatches),
      technicalFeasibility: Math.min(5, Math.max(1, riskMatches > 2 ? 2 : (riskMatches > 0 ? 3 : 4)))
    };
  }

  calculateRICEScore(effortMatches, impactMatches, criticalMatches) {
    // RICE = Reach × Impact × Confidence ÷ Effort
    // Simplified scoring based on detected indicators

    if (effortMatches > 3 && impactMatches === 0) return 1; // Massive effort, minimal impact
    if (effortMatches > 2 && impactMatches <= 1 && criticalMatches === 0) return 2; // High effort, limited impact
    if (criticalMatches >= 2) return 4; // Critical need = high RICE even with high effort
    if (effortMatches <= 1 && impactMatches >= 2) return 5; // Low effort, high impact
    if (effortMatches <= 2 && impactMatches >= 1) return 4; // Reasonable effort, good impact
    return 3; // Moderate balance
  }

  /**
   * Determine if SD is over-engineered based on scores
   */
  determineOverEngineering(scores, totalScore) {
    // Check if in clarification zone (needs intent review)
    const inClarificationZone = totalScore > this.thresholds.overEngineered &&
                                 totalScore <= this.thresholds.clarificationZone;

    // Multiple criteria for over-engineering detection (LEAD persona aligned)
    const conditions = [
      totalScore <= this.thresholds.overEngineered,
      scores.userNeedValidation <= this.thresholds.lowUserNeed && scores.businessValue <= this.thresholds.lowBusinessValue,
      scores.effortVsImpact <= this.thresholds.poorRICE && scores.userImpact <= 2,
      scores.technicalFeasibility <= this.thresholds.highTechnicalRisk && scores.businessValue <= 2
    ];

    return {
      isOverEngineered: conditions.some(condition => condition),
      needsClarification: inClarificationZone,
      clarificationReason: inClarificationZone ? this.getClarificationReason(scores, totalScore) : null
    };
  }

  /**
   * Generate recommendation based on evaluation
   */
  generateRecommendation(scores, totalScore, isOverEngineered) {
    if (isOverEngineered) {
      if (totalScore <= 12) return 'CANCEL - Severely over-engineered, no business justification';
      if (scores.strategicAlignment <= 1) return 'DEFER - Poor strategic alignment, reconsider timing';
      return 'DOWNGRADE - Over-engineered, reduce scope or defer';
    }

    if (totalScore >= 25) return 'UPGRADE - Excellent strategic value, consider higher priority';
    if (totalScore >= 20) return 'APPROVE - Good balance, proceed as planned';
    return 'REVIEW - Marginal case, requires human judgment';
  }

  /**
   * Generate detailed reasoning for the evaluation
   */
  generateReasoning(scores, _totalScore, _isOverEngineered) {
    const reasons = [];

    // Negative indicators
    if (scores.userNeedValidation <= 2) reasons.push('User need not validated - building without confirmation');
    if (scores.userImpact <= 2) reasons.push('Limited measurable user impact');
    if (scores.businessValue <= 2) reasons.push('Weak business value or strategic alignment');
    if (scores.effortVsImpact <= 2) reasons.push('Poor RICE score - high effort, limited impact');
    if (scores.technicalFeasibility <= 2) reasons.push('High technical risk or feasibility concerns');
    if (scores.timeToValue <= 2) reasons.push('Delayed time to value for users');

    // Positive indicators
    if (scores.userNeedValidation >= 4) reasons.push('Well-validated user need with documented severity');
    if (scores.userImpact >= 4) reasons.push('High measurable user impact and adoption potential');
    if (scores.businessValue >= 4) reasons.push('Strong business value and strategic alignment');
    if (scores.effortVsImpact >= 4) reasons.push('Excellent RICE score - good effort to impact ratio');
    if (totalScore >= 20) reasons.push('Overall strong business case with clear user value');

    return reasons.length > 0 ? reasons : ['Evaluation based on LEAD persona criteria'];
  }

  /**
   * Determine if human review is required
   */
  requiresHumanReview(scores, totalScore) {
    // Always require human review for (LEAD persona aligned):
    return (
      totalScore <= 18 || // Borderline cases
      scores.userNeedValidation <= 2 || // Unvalidated user need
      scores.businessValue <= 2 || // Weak business value
      scores.effortVsImpact <= 2 || // Poor RICE score
      Math.abs(totalScore - 18) <= 3 // Scores near the threshold
    );
  }

  /**
   * Format evaluation results for human review
   */
  formatForHumanReview(evaluation) {
    const { scores, totalScore, recommendation, reasoning } = evaluation;

    return {
      summary: `SD Evaluation: ${totalScore}/30 (${evaluation.percentage}%)`,
      recommendation,
      scores: Object.entries(scores).map(([key, score]) => ({
        criterion: this.criteria[key].name,
        score: `${score}/5`,
        description: this.criteria[key].scale[score]
      })),
      reasoning,
      requiresApproval: evaluation.requiresHumanReview,
      warningFlags: this.getWarningFlags(scores, totalScore)
    };
  }

  /**
   * Get warning flags for concerning scores
   */
  getWarningFlags(scores, totalScore) {
    const flags = [];

    if (totalScore <= 15) flags.push('🚨 TOTAL SCORE BELOW THRESHOLD - LIKELY OVER-ENGINEERED');
    if (scores.userNeedValidation <= 2) flags.push('⚠️ USER NEED NOT VALIDATED');
    if (scores.userImpact <= 2) flags.push('⚠️ LIMITED USER IMPACT');
    if (scores.businessValue <= 2) flags.push('⚠️ WEAK BUSINESS VALUE');
    if (scores.effortVsImpact <= 2) flags.push('⚠️ POOR RICE SCORE');
    if (scores.technicalFeasibility <= 2) flags.push('⚠️ HIGH TECHNICAL RISK');
    if (scores.timeToValue <= 2) flags.push('⚠️ DELAYED TIME TO VALUE');

    return flags;
  }

  /**
   * Get clarification reason for borderline scores
   */
  getClarificationReason(scores, _totalScore) {
    const reasons = [];

    if (scores.complexity <= 3) {
      reasons.push('Technical complexity may be higher than business value - need to clarify scope');
    }
    if (scores.strategicAlignment <= 3) {
      reasons.push('Strategic alignment unclear - wording may not reflect true intent');
    }
    if (scores.resourceIntensity <= 3) {
      reasons.push('Resource requirements uncertain - may need to rephrase objectives');
    }

    return reasons.length > 0
      ? reasons.join('; ')
      : 'Score in borderline range - intent clarification recommended';
  }

  /**
   * Generate clarifying questions to understand true intent
   */
  generateClarifyingQuestions(sd, scores) {
    const questions = [];
    const text = [sd.title, sd.description, sd.scope].filter(Boolean).join(' ').toLowerCase();

    // Questions based on low scores
    if (scores.complexity <= 3) {
      questions.push({
        question: 'Can you describe the core problem this directive aims to solve in simpler terms?',
        purpose: 'Clarify if complexity is necessary or if a simpler approach exists',
        adjacentTruth: 'Perhaps the directive is trying to address a simple need but is worded in complex technical terms'
      });
    }

    if (scores.strategicAlignment <= 3) {
      questions.push({
        question: 'How does this directive support our primary business objectives (Stage 1 Ideation, EVA Assistant, GTM)?',
        purpose: 'Understand strategic value that may not be apparent from wording',
        adjacentTruth: 'The strategic value may be implicit rather than explicit in the description'
      });
    }

    if (scores.roiProjection <= 3) {
      questions.push({
        question: 'What business outcomes or user benefits do you expect from this directive?',
        purpose: 'Identify ROI factors that may not be clearly stated',
        adjacentTruth: 'Business value might be assumed rather than documented'
      });
    }

    // Questions based on content analysis
    if (text.includes('improve') || text.includes('enhance') || text.includes('update')) {
      questions.push({
        question: 'What specific pain points or limitations will this improvement address?',
        purpose: 'Connect technical changes to user/business impact',
        adjacentTruth: 'Incremental improvements often have significant cumulative value'
      });
    }

    if (text.includes('add') || text.includes('new') || text.includes('create')) {
      questions.push({
        question: 'Is this new capability essential now, or could it be deferred until we have more user feedback?',
        purpose: 'Validate timing and priority',
        adjacentTruth: 'New features may be exploring opportunities rather than solving known problems'
      });
    }

    return questions;
  }

  /**
   * Suggest rephrased versions that might better capture intent
   */
  suggestRephrases(sd, scores) {
    const suggestions = [];

    // Suggest simplification if complexity is low-scored
    if (scores.complexity <= 3) {
      suggestions.push({
        type: 'SIMPLIFY',
        original: sd.title,
        rephrased: this.simplifyTitle(sd.title),
        rationale: 'Simpler wording may better reflect the core intent without technical jargon'
      });
    }

    // Suggest strategic framing if alignment is weak
    if (scores.strategicAlignment <= 3) {
      suggestions.push({
        type: 'STRATEGIC_FRAME',
        original: sd.description || sd.title,
        rephrased: this.addStrategicFraming(sd),
        rationale: 'Adding strategic context may reveal alignment that was implicit in the original'
      });
    }

    // Suggest value-focused framing if ROI is unclear
    if (scores.roiProjection <= 3) {
      suggestions.push({
        type: 'VALUE_FOCUS',
        original: sd.title,
        rephrased: this.addValueFraming(sd.title),
        rationale: 'Emphasizing user/business value may clarify the intended benefit'
      });
    }

    return suggestions;
  }

  /**
   * Helper: Simplify technical title to plain language
   */
  simplifyTitle(title) {
    const simplifications = {
      'implement': 'add',
      'enhance': 'improve',
      'refactor': 'reorganize',
      'optimize': 'speed up',
      'integrate': 'connect',
      'architecture': 'structure',
      'framework': 'system',
      'infrastructure': 'foundation'
    };

    let simplified = title.toLowerCase();
    Object.entries(simplifications).forEach(([complex, simple]) => {
      simplified = simplified.replace(new RegExp(complex, 'gi'), simple);
    });

    return simplified.charAt(0).toUpperCase() + simplified.slice(1);
  }

  /**
   * Helper: Add strategic framing to description
   */
  addStrategicFraming(sd) {
    const text = sd.description || sd.title;
    const strategicPhrases = [
      'To support our innovation pipeline, ',
      'To enhance our market position, ',
      'To improve customer experience, ',
      'To drive growth, '
    ];

    // Pick a strategic phrase based on content
    let prefix = strategicPhrases[0]; // default
    if (text.toLowerCase().includes('user') || text.toLowerCase().includes('customer')) {
      prefix = strategicPhrases[2];
    } else if (text.toLowerCase().includes('revenue') || text.toLowerCase().includes('sales')) {
      prefix = strategicPhrases[3];
    }

    return prefix + text.charAt(0).toLowerCase() + text.slice(1);
  }

  /**
   * Helper: Add value-focused framing to title
   */
  addValueFraming(title) {
    const valuePhrases = [
      'Enable users to',
      'Help customers',
      'Reduce friction for',
      'Increase efficiency by'
    ];

    // Convert action-oriented title to value-oriented
    let valueTitle = title;
    if (title.toLowerCase().startsWith('add') || title.toLowerCase().startsWith('create')) {
      valueTitle = `${valuePhrases[0]} ${title.replace(/^(add|create)\s+/i, '')}`;
    } else if (title.toLowerCase().includes('fix') || title.toLowerCase().includes('resolve')) {
      valueTitle = `${valuePhrases[2]} ${title}`;
    }

    return valueTitle;
  }
}

// Export for use in other modules
export default OverEngineeringRubric;

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  import('dotenv').then(dotenv => dotenv.default.config());
  import('@supabase/supabase-js').then(async ({ createClient }) => {
    const args = process.argv.slice(2);
    const sdIdArg = args.find(arg => arg.startsWith('--sd-id='));

    if (sdIdArg) {
      // Evaluate specific SD
      const sdId = sdIdArg.split('=')[1];

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );

      console.log(`\n🔍 Evaluating ${sdId}...\n`);

      const { data: sd, error } = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();

      if (error || !sd) {
        console.error(`❌ Error fetching ${sdId}:`, error?.message || 'Not found');
        process.exit(1);
      }

      const rubric = new OverEngineeringRubric();
      const evaluation = rubric.evaluateSD(sd);
      const formatted = rubric.formatForHumanReview(evaluation);

      // Display results
      console.log('📊 OVER-ENGINEERING EVALUATION RESULTS');
      console.log('═'.repeat(70));
      console.log(`\nSD: ${evaluation.title}`);
      console.log(`ID: ${evaluation.sdId}\n`);
      console.log(formatted.summary);
      console.log(`\n🎯 Recommendation: ${formatted.recommendation}\n`);

      if (formatted.warningFlags.length > 0) {
        console.log('⚠️  Warning Flags:');
        formatted.warningFlags.forEach(flag => console.log(`   ${flag}`));
        console.log('');
      }

      console.log('📋 Detailed Scores:');
      formatted.scores.forEach(score => {
        console.log(`   ${score.criterion}: ${score.score}`);
        console.log(`   → ${score.description}\n`);
      });

      console.log('💡 Reasoning:');
      formatted.reasoning.forEach(reason => console.log(`   • ${reason}`));
      console.log('');

      if (evaluation.needsClarification) {
        console.log('🤔 CLARIFICATION NEEDED');
        console.log(`   Reason: ${evaluation.clarificationReason}\n`);

        if (evaluation.clarifyingQuestions.length > 0) {
          console.log('   Questions to ask:');
          evaluation.clarifyingQuestions.forEach((q, i) => {
            console.log(`   ${i + 1}. ${q.question}`);
            console.log(`      Purpose: ${q.purpose}`);
            console.log(`      Note: ${q.adjacentTruth}\n`);
          });
        }

        if (evaluation.rephrasesSuggestions.length > 0) {
          console.log('   Suggested Rephrases:');
          evaluation.rephrasesSuggestions.forEach((s, i) => {
            console.log(`   ${i + 1}. [${s.type}]`);
            console.log(`      Original: ${s.original}`);
            console.log(`      Rephrased: ${s.rephrased}`);
            console.log(`      Rationale: ${s.rationale}\n`);
          });
        }
      }

      console.log(`${formatted.requiresApproval ? '⚠️' : '✅'} Human Review: ${formatted.requiresApproval ? 'REQUIRED' : 'Optional'}\n`);

      process.exit(evaluation.isOverEngineered ? 1 : 0);
    } else {
      // Show criteria only
      console.log('Over-Engineering Evaluation Rubric');
      console.log('==================================');
      console.log('');
      console.log('📋 Evaluation Criteria:');

      const rubric = new OverEngineeringRubric();
      Object.entries(rubric.criteria).forEach(([_key, criterion]) => {
        console.log(`• ${criterion.name}`);
        console.log(`  ${criterion.description}`);
      });

      console.log('');
      console.log('🎯 Over-Engineering Thresholds:');
      console.log(`• Total Score ≤ ${rubric.thresholds.overEngineered}/30`);
      console.log(`• Complexity ≤ ${rubric.thresholds.criticalComplexity}/5 + Strategic Alignment ≤ ${rubric.thresholds.lowStrategicAlignment}/5`);
      console.log(`• Risk Assessment ≤ ${rubric.thresholds.dangerousRisk}/5`);
      console.log('');
      console.log('Usage: node lead-over-engineering-rubric.js --sd-id=SD-XXX-XXX');
    }
  });
}