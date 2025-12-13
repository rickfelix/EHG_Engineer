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
 * 1. Requirements (40%) - Balanced
 * 2. Architecture (30%) - Balanced
 * 3. Test Scenarios (20%) - Balanced
 * 4. Risk Analysis (10%) - Standard
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
 * @version 1.1.0-sd-type-aware
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
      requirements: 0.40,
      architecture: 0.30,
      test_scenarios: 0.20,
      risk_analysis: 0.10
    };

    if (!sd?.sd_type) return defaultWeights;

    // Type-specific weight adjustments
    const typeWeights = {
      documentation: {
        requirements: 0.60,      // Focus on completeness
        architecture: 0.05,      // Minimal relevance for docs-only
        test_scenarios: 0.25,    // Validation still important
        risk_analysis: 0.10      // Standard
      },
      infrastructure: {
        requirements: 0.35,      // Less emphasis on detailed specs
        architecture: 0.45,      // MORE weight on technical design
        test_scenarios: 0.10,    // Less emphasis on user scenarios
        risk_analysis: 0.10      // Standard
      },
      database: {
        requirements: 0.30,      // Less emphasis
        architecture: 0.35,      // Focus on schema design
        test_scenarios: 0.15,    // Migration testing
        risk_analysis: 0.20      // HIGHER weight (data loss risks)
      },
      security: {
        requirements: 0.30,      // Less emphasis
        architecture: 0.30,      // Security architecture
        test_scenarios: 0.15,    // Security testing
        risk_analysis: 0.25      // HIGHEST weight (threat modeling)
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
          const ac = req.acceptance_criteria && req.acceptance_criteria.length > 0
            ? `\n   Acceptance Criteria: ${req.acceptance_criteria.join('; ')}`
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
          const ac = req.acceptance_criteria && req.acceptance_criteria.length > 0
            ? `\n   Acceptance Criteria: ${req.acceptance_criteria.join('; ')}`
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
        sections.push(`Components:\n${architecture.components.map((c, i) =>
          `${i + 1}. ${typeof c === 'string' ? c : c.name || JSON.stringify(c)}`
        ).join('\n')}`);
      }

      if (architecture.data_flow) {
        sections.push(`Data Flow:\n${architecture.data_flow}`);
      }

      if (architecture.integration_points && architecture.integration_points.length > 0) {
        sections.push(`Integration Points:\n${architecture.integration_points.map((p, i) =>
          `${i + 1}. ${typeof p === 'string' ? p : JSON.stringify(p)}`
        ).join('\n')}`);
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
          const type = scenario.type ? ` [${scenario.type}]` : '';
          const steps = scenario.steps && scenario.steps.length > 0
            ? `\n   Steps: ${scenario.steps.join('; ')}`
            : '';
          const expected = scenario.expected_result
            ? `\n   Expected: ${scenario.expected_result}`
            : '';
          return `${idx + 1}. ${scenario.scenario}${type}${steps}${expected}`;
        }
        return `${idx + 1}. ${JSON.stringify(scenario)}`;
      }).join('\n\n');
    }

    return JSON.stringify(scenarios);
  }

  /**
   * Format acceptance criteria for evaluation
   */
  formatAcceptanceCriteria(criteria) {
    if (!criteria || criteria.length === 0) {
      return 'No acceptance criteria defined';
    }

    if (Array.isArray(criteria)) {
      return criteria.map((criterion, idx) => `${idx + 1}. ${criterion}`).join('\n');
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
          const mitigation = risk.mitigation ? `\n   Mitigation: ${risk.mitigation}` : '';
          const rollback = risk.rollback_plan ? `\n   Rollback: ${risk.rollback_plan}` : '';
          const probability = risk.probability ? ` (Probability: ${risk.probability})` : '';
          return `${idx + 1}. ${risk.risk}${probability}${mitigation}${rollback}`;
        }
        return `${idx + 1}. ${JSON.stringify(risk)}`;
      }).join('\n\n');
    }

    return JSON.stringify(risks);
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
