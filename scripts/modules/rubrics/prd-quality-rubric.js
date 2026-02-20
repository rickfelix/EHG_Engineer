/**
 * PRD Quality Rubric - Product Requirements Document Quality Assessment
 *
 * Uses AI-powered Russian Judge multi-criterion weighted scoring (0-10 per criterion)
 * to evaluate PRD quality during PLAN phase.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║               SD TYPE-AWARE EVALUATION (v1.1.0)                      ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Criteria weights now adjust based on SD type:
 *
 * DOCUMENTATION SDs (documentation-only work):
 * 1. Requirements (60%) - Focus on completeness, not technical depth
 * 2. Architecture (5%) - Minimal relevance for docs-only
 * 3. Test Scenarios (25%) - Validation still important
 * 4. Risk Analysis (10%) - Standard
 *
 * INFRASTRUCTURE SDs (CI/CD, tooling):
 * 1. Requirements (35%) - Less emphasis on detailed specs
 * 2. Architecture (45%) - MORE weight on technical design
 * 3. Test Scenarios (10%) - Less emphasis on user scenarios
 * 4. Risk Analysis (10%) - Standard
 *
 * FEATURE SDs (customer-facing) - DEFAULT:
 * 1. Requirements (30%) - Balanced
 * 2. Architecture (25%) - Balanced
 * 3. Test Scenarios (15%) - Balanced
 * 4. Risk Analysis (10%) - Standard
 * 5. Acceptance Testability (10%) - US-001: Specification testability
 * 6. Quantitative Claims (10%) - US-006: Claim validation
 *
 * DATABASE SDs (schema migrations):
 * 1. Requirements (30%) - Less emphasis
 * 2. Architecture (35%) - Focus on schema design
 * 3. Test Scenarios (15%) - Migration testing
 * 4. Risk Analysis (20%) - HIGHER weight (data loss risks)
 *
 * SECURITY SDs (auth, RLS):
 * 1. Requirements (30%) - Less emphasis
 * 2. Architecture (30%) - Security architecture
 * 3. Test Scenarios (15%) - Security testing
 * 4. Risk Analysis (25%) - HIGHEST weight (threat modeling)
 *
 * @module rubrics/prd-quality-rubric
 * @version 1.2.0-scoring-bands
 */

import { AIQualityEvaluator } from '../ai-quality-evaluator.js';

export class PRDQualityRubric extends AIQualityEvaluator {
  /**
   * Get dynamic criterion weights based on SD type
   * Adjusts evaluation priorities to match the nature of the work
   *
   * @param {Object} sd - Strategic Directive with sd_type
   * @returns {Object} Criterion weights (must sum to 1.0)
   */
  static getWeights(sd = null) {
    const defaultWeights = {
      requirements: 0.25,
      architecture: 0.20,
      test_scenarios: 0.15,
      risk_analysis: 0.10,
      acceptance_testability: 0.10,  // US-001: Specification testability
      quantitative_claims: 0.10,     // US-006: Claim validation
      failure_modes: 0.10            // US-004: Failure mode documentation
    };

    if (!sd?.sd_type) return defaultWeights;

    // Type-specific weight adjustments (all must sum to 1.0)
    const typeWeights = {
      documentation: {
        requirements: 0.45,               // Focus on completeness
        architecture: 0.05,               // Minimal relevance for docs-only
        test_scenarios: 0.15,             // Validation still important
        risk_analysis: 0.10,              // Standard
        acceptance_testability: 0.10,     // US-001
        quantitative_claims: 0.05,        // US-006: Less relevant for docs
        failure_modes: 0.10               // US-004
      },
      infrastructure: {
        requirements: 0.20,               // Less emphasis on detailed specs
        architecture: 0.30,               // MORE weight on technical design
        test_scenarios: 0.10,             // Less emphasis on user scenarios
        risk_analysis: 0.10,              // Standard
        acceptance_testability: 0.10,     // US-001
        quantitative_claims: 0.10,        // US-006
        failure_modes: 0.10               // US-004
      },
      database: {
        requirements: 0.15,               // Less emphasis
        architecture: 0.25,               // Focus on schema design
        test_scenarios: 0.10,             // Migration testing
        risk_analysis: 0.15,              // HIGHER weight (data loss risks)
        acceptance_testability: 0.10,     // US-001
        quantitative_claims: 0.10,        // US-006
        failure_modes: 0.15               // US-004: HIGHER for databases (data loss)
      },
      security: {
        requirements: 0.15,               // Less emphasis
        architecture: 0.20,               // Security architecture
        test_scenarios: 0.10,             // Security testing
        risk_analysis: 0.20,              // HIGHEST weight (threat modeling)
        acceptance_testability: 0.10,     // US-001
        quantitative_claims: 0.10,        // US-006
        failure_modes: 0.15               // US-004: HIGHER for security
      }
    };

    return typeWeights[sd.sd_type] || defaultWeights;
  }

  constructor(sd = null) {
    // Get dynamic weights based on SD type
    const weights = PRDQualityRubric.getWeights(sd);

    const rubricConfig = {
      contentType: 'prd',
      criteria: [
        {
          name: 'requirements_depth_specificity',
          weight: weights.requirements,
          prompt: `Evaluate requirements depth and specificity:
- 0-3: Mostly placeholders ("To be defined", "TBD", generic statements)
- 4-6: Some specific requirements but many vague or incomplete
- 7-8: Most requirements are specific, actionable, and complete
- 9-10: All requirements are detailed, specific, testable, with clear acceptance criteria

Penalize heavily for placeholder text like "To be defined" or "Will be determined". Reserve 9-10 for truly implementation-ready requirements.`
        },
        {
          name: 'architecture_explanation_quality',
          weight: weights.architecture,
          prompt: `Evaluate architecture explanation quality:
- 0-3: No architecture details or vague high-level statements
- 4-6: Basic architecture mentioned but missing key details (data flow, integration points)
- 7-8: Clear architecture with components, data flow, and integration points explained
- 9-10: Comprehensive architecture: components + data flow + integration + trade-offs + scalability considerations

Look for technical depth that enables implementation, not just buzzwords.`
        },
        {
          name: 'test_scenario_sophistication',
          weight: weights.test_scenarios,
          prompt: `Evaluate test scenario sophistication:
- 0-3: No test scenarios or only trivial happy path
- 4-6: Happy path covered but missing edge cases and error conditions
- 7-8: Happy path + common edge cases + error handling scenarios
- 9-10: Comprehensive test coverage: happy path + edge cases + error conditions + performance tests + security tests

Score 9-10 only if test scenarios demonstrate deep understanding of potential failure modes.`
        },
        {
          name: 'risk_analysis_completeness',
          weight: weights.risk_analysis,
          prompt: `Evaluate risk analysis completeness:
- 0-3: No technical risks identified or listed without mitigation
- 4-6: Basic risks with generic mitigation ("test thoroughly")
- 7-8: Specific technical risks with concrete mitigation strategies
- 9-10: Comprehensive risk analysis: specific risks + mitigation + rollback plan + monitoring strategy

Look for proactive risk thinking specific to this implementation, not generic risk boilerplate.`
        },
        // US-001: Specification Testability Validator
        // LEO Protocol v4.3.4 Enhancement - Addresses Genesis PRD Review feedback
        {
          name: 'acceptance_criteria_testability',
          weight: weights.acceptance_testability,
          prompt: `Evaluate acceptance criteria testability (US-001 Enhancement):
- 0-3: Acceptance criteria are vague, unmeasurable, or contain placeholder text ("works correctly", "should be good", "TBD")
- 4-6: Some criteria are testable but many lack clear pass/fail conditions or measurable outcomes
- 7-8: Most acceptance criteria are specific, independently testable with clear pass/fail conditions
- 9-10: ALL acceptance criteria are concrete, testable, with clear pass/fail conditions AND automated test feasibility

CRITICAL CHECKS:
1. Does each criterion have a MEASURABLE outcome? (e.g., "response time <200ms" vs "fast response")
2. Are there SPECIFIC conditions? (e.g., "when user clicks X, Y happens" vs "user can do things")
3. Can an engineer write an automated test from this criterion? (No interpretation needed)
4. Are there NO vague words like: "appropriate", "suitable", "proper", "correct", "good", "works"

Penalize heavily for:
- Placeholder text ("To be defined", "TBD", "Will be determined")
- Boilerplate criteria ("All tests pass", "No regressions", "Meets requirements")
- Subjective language ("User-friendly", "Intuitive", "Clean code")`
        },
        // US-006: Quantitative Claim Validation
        // LEO Protocol v4.3.4 Enhancement - Addresses Genesis PRD Review feedback
        {
          name: 'quantitative_claims_validation',
          weight: weights.quantitative_claims,
          prompt: `Evaluate quantitative claims and metrics (US-006 Enhancement):
- 0-3: No quantitative metrics defined OR all claims lack justification/baselines
- 4-6: Some quantified claims exist but missing baselines, targets, or evidence
- 7-8: Claims have baselines AND targets, with reasonable assumptions documented
- 9-10: ALL quantitative claims have: baseline + target + evidence/justification + measurement method

CRITICAL CHECKS:
1. PERFORMANCE claims (e.g., "50% faster"): Does it state baseline? Current state? How measured?
2. COVERAGE claims (e.g., "90% test coverage"): Is current coverage stated? Is 90% justified?
3. CAPACITY claims (e.g., "handles 1000 users"): Is current capacity stated? Is target evidence-based?
4. IMPROVEMENT claims (e.g., "reduces errors by 30%"): What's the current error rate? Evidence?

Penalize heavily for:
- Claims without baselines ("Improve performance by 50%" - 50% from what?)
- Round-number targets without justification ("90%", "100%", "10x" - why these numbers?)
- Missing measurement methodology (HOW will this be measured/verified?)
- Aspirational claims stated as facts ("This will reduce costs" - evidence?)`
        },
        // US-004: Failure Mode Documentation
        // LEO Protocol v4.3.4 Enhancement - Addresses Genesis PRD Review feedback
        {
          name: 'failure_mode_documentation',
          weight: weights.failure_modes,
          prompt: `Evaluate failure mode documentation (US-004 Enhancement):
- 0-3: No failure modes documented OR only generic failures ("system might fail")
- 4-6: Some failure modes listed but missing recovery strategies or rollback plans
- 7-8: Specific failure modes with recovery strategies AND rollback procedures
- 9-10: Comprehensive failure analysis: failure modes + detection + recovery + rollback + post-mortem triggers

CRITICAL CHECKS:
1. FAILURE IDENTIFICATION: Are specific failure scenarios documented? (Not just "might fail")
2. DETECTION METHOD: How will failures be detected? Monitoring? Alerts? Health checks?
3. RECOVERY STRATEGY: What happens when failure occurs? Retry? Fallback? Graceful degradation?
4. ROLLBACK PLAN: Can the change be reverted? How quickly? What's the data impact?
5. POST-MORTEM TRIGGERS: What conditions trigger a post-mortem review?

Penalize heavily for:
- Generic failure statements ("Handle errors appropriately")
- Missing rollback procedures for database changes
- No detection/alerting strategy
- Optimistic assumptions ("This won't fail")
- Missing data recovery considerations`
        }
      ]
    };

    super(rubricConfig);
  }

  /**
   * Format PRD data for AI evaluation (with optional SD context)
   *
   * @param {Object} prd - Product Requirements Document from database
   * @param {Object} sd - Strategic Directive (parent context) - optional
   * @returns {string} Formatted content for evaluation
   */
  formatPRDForEvaluation(prd, sd = null) {
    let sdContext = '';

    if (sd) {
      sdContext = `## STRATEGIC DIRECTIVE CONTEXT

**SD ID:** ${sd.sd_id || sd.id}
**Title:** ${sd.title || 'Not set'}
**Description:** ${sd.description || 'Not provided'}

**Strategic Objectives:**
${this.formatStrategicObjectives(sd.strategic_objectives)}

**Success Metrics:**
${this.formatSuccessMetrics(sd.success_metrics)}

**Business Problem:**
${sd.problem_statement || sd.business_context || 'Not defined'}

---

`;
    }

    return `# Product Requirements Document: ${prd.id}

${sdContext}## PRD Overview
${prd.overview || 'No overview provided'}

## Functional Requirements
${this.formatFunctionalRequirements(prd.functional_requirements)}

## UI/UX Requirements
${this.formatUIUXRequirements(prd.ui_ux_requirements)}

## System Architecture
${this.formatTechnicalArchitecture(prd.system_architecture)}

## Test Scenarios
${this.formatTestScenarios(prd.test_scenarios)}

## Acceptance Criteria
${this.formatAcceptanceCriteria(prd.acceptance_criteria)}

## Dependencies
${this.formatDependencies(prd.dependencies)}

## Risks & Mitigations
${this.formatRisks(prd.risks)}

## Failure Modes
${this.formatFailureModes(prd.failure_modes || prd.metadata?.failure_modes?.modes)}

## Additional Context
Status: ${prd.status || 'Not set'}
SD UUID: ${prd.sd_uuid || 'Not linked'}`;
  }

  /**
   * Format Strategic Objectives from SD
   */
  formatStrategicObjectives(objectives) {
    if (!objectives || objectives.length === 0) {
      return 'No strategic objectives defined';
    }

    if (Array.isArray(objectives)) {
      return objectives.map((obj, idx) => {
        if (typeof obj === 'string') {
          return `${idx + 1}. ${obj}`;
        } else if (obj.objective) {
          return `${idx + 1}. ${obj.objective}`;
        }
        return `${idx + 1}. ${JSON.stringify(obj)}`;
      }).join('\n');
    }

    return JSON.stringify(objectives);
  }

  /**
   * Format Success Metrics from SD
   */
  formatSuccessMetrics(metrics) {
    if (!metrics || metrics.length === 0) {
      return 'No success metrics defined';
    }

    if (Array.isArray(metrics)) {
      return metrics.map((metric, idx) => {
        if (typeof metric === 'string') {
          return `${idx + 1}. ${metric}`;
        } else if (metric.metric) {
          const baseline = metric.baseline ? ` (Baseline: ${metric.baseline})` : '';
          const target = metric.target ? ` → Target: ${metric.target}` : '';
          return `${idx + 1}. ${metric.metric}${baseline}${target}`;
        }
        return `${idx + 1}. ${JSON.stringify(metric)}`;
      }).join('\n');
    }

    return JSON.stringify(metrics);
  }

  /**
   * Normalize an acceptance_criteria value to a displayable string.
   * Handles: string, array of strings, array of objects, or arbitrary objects.
   * @param {*} ac - acceptance_criteria value (string, array, or object)
   * @returns {string} Semicolon-separated criteria text
   */
  static normalizeAcceptanceCriteria(ac) {
    if (!ac) return '';
    if (typeof ac === 'string') return ac;
    if (Array.isArray(ac)) {
      return ac.map(item => {
        if (typeof item === 'string') return item;
        if (item.criterion) return item.criterion;
        if (item.description) return item.description;
        return JSON.stringify(item);
      }).join('; ');
    }
    // Object with nested structure
    if (typeof ac === 'object') {
      if (ac.criterion) return ac.criterion;
      if (ac.description) return ac.description;
      return JSON.stringify(ac);
    }
    return String(ac);
  }

  /**
   * Format functional requirements for evaluation
   */
  formatFunctionalRequirements(requirements) {
    if (!requirements || requirements.length === 0) {
      return 'No functional requirements defined';
    }

    if (Array.isArray(requirements)) {
      return requirements.map((req, idx) => {
        if (typeof req === 'string') {
          return `${idx + 1}. ${req}`;
        } else if (req.requirement) {
          const priority = req.priority ? ` [${req.priority}]` : '';
          const desc = req.description ? `\n   Description: ${req.description}` : '';
          const acText = PRDQualityRubric.normalizeAcceptanceCriteria(req.acceptance_criteria);
          const ac = acText
            ? `\n   Acceptance Criteria: ${acText}`
            : '';
          return `${idx + 1}. ${req.requirement}${priority}${desc}${ac}`;
        }
        return `${idx + 1}. ${JSON.stringify(req)}`;
      }).join('\n\n');
    }

    return JSON.stringify(requirements);
  }

  /**
   * Format UI/UX requirements for evaluation
   */
  formatUIUXRequirements(requirements) {
    if (!requirements || requirements.length === 0) {
      return 'No UI/UX requirements defined';
    }

    if (Array.isArray(requirements)) {
      return requirements.map((req, idx) => {
        if (typeof req === 'string') {
          return `${idx + 1}. ${req}`;
        } else if (req.component) {
          const desc = req.description ? `\n   ${req.description}` : '';
          const acText = PRDQualityRubric.normalizeAcceptanceCriteria(req.acceptance_criteria);
          const ac = acText
            ? `\n   Acceptance Criteria: ${acText}`
            : '';
          return `${idx + 1}. ${req.component}${desc}${ac}`;
        }
        return `${idx + 1}. ${JSON.stringify(req)}`;
      }).join('\n\n');
    }

    return JSON.stringify(requirements);
  }

  /**
   * Format technical architecture for evaluation
   * SYSTEMIC FIX: Support all LLM-generated fields including trade_offs
   */
  formatTechnicalArchitecture(architecture) {
    if (!architecture) {
      return 'No technical architecture defined';
    }

    if (typeof architecture === 'object') {
      const sections = [];

      if (architecture.overview) {
        sections.push(`Overview:\n${architecture.overview}`);
      }

      if (architecture.components && architecture.components.length > 0) {
        sections.push(`Components:\n${architecture.components.map((c, i) => {
          if (typeof c === 'string') {
            return `${i + 1}. ${c}`;
          } else if (c.name) {
            const responsibility = c.responsibility ? ` - ${c.responsibility}` : '';
            const tech = c.technology ? ` [${c.technology}]` : '';
            return `${i + 1}. ${c.name}${responsibility}${tech}`;
          }
          return `${i + 1}. ${JSON.stringify(c)}`;
        }).join('\n')}`);
      }

      if (architecture.data_flow) {
        sections.push(`Data Flow:\n${architecture.data_flow}`);
      }

      if (architecture.integration_points && architecture.integration_points.length > 0) {
        sections.push(`Integration Points:\n${architecture.integration_points.map((p, i) =>
          `${i + 1}. ${typeof p === 'string' ? p : JSON.stringify(p)}`
        ).join('\n')}`);
      }

      // SYSTEMIC FIX: Include trade_offs analysis
      if (architecture.trade_offs) {
        sections.push(`Trade-offs:\n${architecture.trade_offs}`);
      }

      return sections.join('\n\n') || JSON.stringify(architecture);
    }

    if (typeof architecture === 'string') {
      return architecture;
    }

    return JSON.stringify(architecture);
  }

  /**
   * Format test scenarios for evaluation
   * SYSTEMIC FIX: Support both legacy (type, steps, expected_result) and
   * new LLM-generated format (test_type, given, when, then)
   */
  formatTestScenarios(scenarios) {
    if (!scenarios || scenarios.length === 0) {
      return 'No test scenarios defined';
    }

    if (Array.isArray(scenarios)) {
      return scenarios.map((scenario, idx) => {
        if (typeof scenario === 'string') {
          return `${idx + 1}. ${scenario}`;
        } else if (scenario.scenario) {
          // Support both field naming conventions
          const type = scenario.test_type || scenario.type;
          const typeStr = type ? ` [${type}]` : '';

          // Build details array
          const details = [];

          // Given/When/Then format (new LLM-generated format)
          if (scenario.given) {
            details.push(`Given: ${scenario.given}`);
          }
          if (scenario.when) {
            details.push(`When: ${scenario.when}`);
          }
          if (scenario.then) {
            details.push(`Then: ${scenario.then}`);
          }

          // Legacy format (steps, expected_result)
          if (scenario.steps && scenario.steps.length > 0) {
            details.push(`Steps: ${scenario.steps.join('; ')}`);
          }
          if (scenario.expected_result) {
            details.push(`Expected: ${scenario.expected_result}`);
          }

          const detailsStr = details.length > 0
            ? '\n   ' + details.join('\n   ')
            : '';

          return `${idx + 1}. ${scenario.scenario}${typeStr}${detailsStr}`;
        }
        return `${idx + 1}. ${JSON.stringify(scenario)}`;
      }).join('\n\n');
    }

    return JSON.stringify(scenarios);
  }

  /**
   * Format acceptance criteria for evaluation
   * Handles: array of strings, array of objects ({id, criterion, verification_method}), or string
   */
  formatAcceptanceCriteria(criteria) {
    if (!criteria || criteria.length === 0) {
      return 'No acceptance criteria defined';
    }

    if (typeof criteria === 'string') {
      return criteria;
    }

    if (Array.isArray(criteria)) {
      return criteria.map((criterion, idx) => {
        if (typeof criterion === 'string') {
          return `${idx + 1}. ${criterion}`;
        } else if (criterion.criterion) {
          const verification = criterion.verification_method
            ? `\n   Verification: ${criterion.verification_method}`
            : '';
          return `${idx + 1}. ${criterion.criterion}${verification}`;
        } else if (criterion.description) {
          return `${idx + 1}. ${criterion.description}`;
        }
        return `${idx + 1}. ${JSON.stringify(criterion)}`;
      }).join('\n');
    }

    return JSON.stringify(criteria);
  }

  /**
   * Format dependencies for evaluation
   */
  formatDependencies(dependencies) {
    if (!dependencies || dependencies.length === 0) {
      return 'No dependencies identified';
    }

    if (Array.isArray(dependencies)) {
      return dependencies.map((dep, idx) => {
        if (typeof dep === 'string') {
          return `${idx + 1}. ${dep}`;
        } else if (dep.name) {
          const status = dep.status ? ` [${dep.status}]` : '';
          const blocker = dep.blocker ? ' [BLOCKER]' : '';
          return `${idx + 1}. ${dep.name}${status}${blocker}`;
        }
        return `${idx + 1}. ${JSON.stringify(dep)}`;
      }).join('\n');
    }

    return JSON.stringify(dependencies);
  }

  /**
   * Format risks for evaluation
   * SYSTEMIC FIX: Support all LLM-generated fields (risk, probability, impact, mitigation, rollback_plan, monitoring)
   */
  formatRisks(risks) {
    if (!risks || risks.length === 0) {
      return 'No risks identified';
    }

    if (Array.isArray(risks)) {
      return risks.map((risk, idx) => {
        if (typeof risk === 'string') {
          return `${idx + 1}. ${risk}`;
        } else if (risk.risk) {
          // Build details array for all fields
          const details = [];

          // Probability and Impact (inline with risk name)
          const probability = risk.probability ? `Probability: ${risk.probability}` : '';
          const impact = risk.impact ? `Impact: ${risk.impact}` : '';
          const riskMeta = [probability, impact].filter(Boolean).join(', ');
          const riskMetaStr = riskMeta ? ` (${riskMeta})` : '';

          // Detailed fields
          if (risk.mitigation) {
            details.push(`Mitigation: ${risk.mitigation}`);
          }
          if (risk.rollback_plan) {
            details.push(`Rollback: ${risk.rollback_plan}`);
          }
          if (risk.monitoring) {
            details.push(`Monitoring: ${risk.monitoring}`);
          }

          const detailsStr = details.length > 0
            ? '\n   ' + details.join('\n   ')
            : '';

          return `${idx + 1}. ${risk.risk}${riskMetaStr}${detailsStr}`;
        }
        return `${idx + 1}. ${JSON.stringify(risk)}`;
      }).join('\n\n');
    }

    return JSON.stringify(risks);
  }

  /**
   * Format failure modes for evaluation (US-004)
   * Supports structured format: { mode, detection, recovery, rollback, trigger }
   */
  formatFailureModes(failureModes) {
    if (!failureModes || failureModes.length === 0) {
      return 'No failure modes documented';
    }

    if (Array.isArray(failureModes)) {
      return failureModes.map((mode, idx) => {
        if (typeof mode === 'string') {
          return `${idx + 1}. ${mode}`;
        } else if (mode.mode || mode.failure) {
          const details = [];
          const modeName = mode.mode || mode.failure;

          // Detection method
          if (mode.detection) {
            details.push(`Detection: ${mode.detection}`);
          }
          // Recovery strategy
          if (mode.recovery) {
            details.push(`Recovery: ${mode.recovery}`);
          }
          // Rollback plan
          if (mode.rollback) {
            details.push(`Rollback: ${mode.rollback}`);
          }
          // Post-mortem trigger
          if (mode.trigger || mode.postmortem_trigger) {
            details.push(`Post-mortem Trigger: ${mode.trigger || mode.postmortem_trigger}`);
          }

          const detailsStr = details.length > 0
            ? '\n   ' + details.join('\n   ')
            : '';

          return `${idx + 1}. ${modeName}${detailsStr}`;
        }
        return `${idx + 1}. ${JSON.stringify(mode)}`;
      }).join('\n\n');
    }

    return JSON.stringify(failureModes);
  }

  /**
   * Validate PRD quality using Russian Judge AI scoring (with SD context)
   *
   * @param {Object} prd - Product Requirements Document from database
   * @param {Object} sd - Strategic Directive (optional - will fetch if not provided)
   * @returns {Promise<Object>} Validation result compatible with LEO Protocol
   */
  async validatePRDQuality(prd, sd = null) {
    try {
      // Fetch SD context if not provided but PRD has sd_id
      // SD ID Schema Cleanup (2025-12-12): Use sd_id which references SD.id
      if (!sd && (prd.sd_id || prd.directive_id)) {
        try {
          const sdIdValue = prd.sd_id || prd.directive_id;
          const { data: sdData } = await this.supabase
            .from('strategic_directives_v2')
            .select('sd_id, id, title, description, strategic_objectives, success_metrics, problem_statement, business_context')
            .eq('id', sdIdValue)
            .single();

          sd = sdData;
        } catch (sdError) {
          console.warn(`Could not fetch SD context for PRD ${prd.id}:`, sdError.message);
          // Continue without SD context
        }
      }

      // Format PRD for evaluation (with SD context if available)
      const formattedContent = this.formatPRDForEvaluation(prd, sd);

      // Get PRD ID
      const prdId = prd.id;

      // Run AI evaluation with sd_type awareness
      // Pass sd object for dynamic threshold and type-specific guidance
      const assessment = await this.evaluate(formattedContent, prdId, sd);

      // Convert to LEO Protocol format
      return {
        passed: assessment.passed,
        score: assessment.weightedScore,
        issues: assessment.feedback.required,
        warnings: assessment.feedback.recommended,
        details: {
          criterion_scores: assessment.scores,
          weighted_score: assessment.weightedScore,
          threshold: assessment.threshold, // Dynamic threshold based on sd_type
          // v1.2.0: Scoring bands for stable decisions
          band: assessment.band,
          confidence: assessment.confidence,
          confidence_reasoning: assessment.confidence_reasoning,
          sd_type: assessment.sd_type,
          cost_usd: assessment.cost,
          duration_ms: assessment.duration,
          sd_context_included: !!sd
        }
      };
    } catch (error) {
      console.error('PRD Quality Validation Error:', error);

      // Return failed validation on error
      return {
        passed: false,
        score: 0,
        issues: [`AI quality assessment failed: ${error.message}`],
        warnings: ['Manual review required'],
        details: {
          error: error.message
        }
      };
    }
  }
}
