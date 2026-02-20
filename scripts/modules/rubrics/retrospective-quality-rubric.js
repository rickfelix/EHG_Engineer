/**
 * Retrospective Quality Rubric - Retrospective Quality Assessment
 *
 * Uses AI-powered Russian Judge multi-criterion weighted scoring (0-10 per criterion)
 * to evaluate Retrospective quality during PLAN→LEAD handoff.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║          SD TYPE-AWARE EVALUATION (v1.1.0)                           ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Retrospectives now receive sd_type context for intelligent evaluation:
 * - Documentation SDs: Focus on documentation process lessons
 * - Infrastructure SDs: Focus on technical/operational lessons
 * - Feature SDs: Balance user value + technical lessons
 * - Database SDs: Focus on data safety and migration lessons
 * - Security SDs: Focus on security process and threat modeling lessons
 *
 * Criteria weights (unchanged):
 * 1. Learning Specificity (40%) - SD-specific vs boilerplate
 * 2. Action Item Actionability (30%) - SMART actions with clear ownership
 * 3. Improvement Area Depth (20%) - Root cause analysis depth
 * 4. Lesson Applicability (10%) - Reusable patterns for future SDs
 *
 * @module rubrics/retrospective-quality-rubric
 * @version 1.2.0-scoring-bands
 */

import { AIQualityEvaluator } from '../ai-quality-evaluator.js';

export class RetrospectiveQualityRubric extends AIQualityEvaluator {
  constructor() {
    const rubricConfig = {
      contentType: 'retrospective',
      criteria: [
        {
          name: 'learning_specificity',
          weight: 0.40,
          prompt: `Evaluate learning specificity (avoid generic boilerplate):
- 0-3: Generic boilerplate ("follow LEO protocol", "communicate better") with no SD-specific insights
- 4-6: Some specific learnings but mixed with generic statements
- 7-8: Most learnings are specific to this SD with concrete examples
- 9-10: All learnings are SD-specific with clear context, examples, and unique insights

Penalize heavily for generic lessons that could apply to any project. Reserve 9-10 for truly unique insights.`
        },
        {
          name: 'action_item_actionability',
          weight: 0.30,
          prompt: `Evaluate whether action items are actionable and follow SMART criteria:
- 0-3: Vague action items ("improve quality", "be more careful") with no ownership
- 4-6: Some specific actions but missing ownership, timeline, or success criteria
- 7-8: Most action items are SMART (Specific, Measurable, Achievable, Relevant, Time-bound) with ownership
- 9-10: All action items are SMART with clear ownership, timeline, and measurable success criteria

Look for concrete next steps, not aspirational goals.`
        },
        {
          name: 'improvement_area_depth',
          weight: 0.20,
          prompt: `Evaluate depth of improvement area analysis:
- 0-3: Surface-level observations ("tests failed") without root cause analysis
- 4-6: Some root cause exploration but missing deeper "why" investigation
- 7-8: Clear root cause analysis with contributing factors identified
- 9-10: Comprehensive root cause analysis with contributing factors, systemic issues, and preventive measures

Score 9-10 only if retrospective demonstrates 5 Whys depth or equivalent root cause investigation.`
        },
        {
          name: 'lesson_applicability',
          weight: 0.10,
          prompt: `Evaluate whether lessons learned are reusable for future SDs:
- 0-3: Lessons are so specific they only apply to this exact SD scenario
- 4-6: Some lessons could transfer to similar SDs but not broadly applicable
- 7-8: Most lessons identify reusable patterns applicable to future work
- 9-10: All lessons capture generalizable patterns, anti-patterns, or protocol improvements

Look for "meta-lessons" about process, architecture, or methodology - not just project details.`
        }
      ]
    };

    super(rubricConfig);
  }

  /**
   * Required retrospective fields that must be present for valid evaluation.
   * These MUST match the actual database column names from the retrospectives table.
   *
   * PREVENTATIVE MEASURE: If database schema changes, update this mapping.
   * Last verified against schema: 2025-12-10
   */
  static REQUIRED_FIELDS = {
    what_went_well: 'Array of positive outcomes',
    what_needs_improvement: 'Array of areas needing improvement (NOT what_went_wrong)',
    key_learnings: 'Array of lessons learned (NOT lessons_learned)',
    action_items: 'Array of SMART action items',
    improvement_areas: 'Array of improvement areas with root cause analysis'
  };

  /**
   * SD-LEO-HARDEN-VALIDATION-001: Boilerplate detection patterns
   * SD-LEO-INFRA-ENHANCE-RETRO-SUB-001: Expanded with domain-specific patterns
   * Evidence: 87.5% of retrospectives contained generic boilerplate content
   * These patterns identify common non-specific filler text
   */
  static BOILERPLATE_PATTERNS = [
    // Original generic patterns (14)
    /continue monitoring.*for improvement/i,
    /follow.*protocol/i,
    /communicate.*better/i,
    /improve.*communication/i,
    /maintain.*quality/i,
    /continue.*best practices/i,
    /keep up.*good work/i,
    /stay.*aligned/i,
    /ensure.*proper.*process/i,
    /adhere to.*guidelines/i,
    /be more careful/i,
    /pay.*attention/i,
    /double.?check/i,
    /review.*thoroughly/i,

    // Infrastructure-specific boilerplate (SD-LEO-INFRA-ENHANCE-RETRO-SUB-001)
    /improve.*infrastructure/i,
    /enhance.*tooling/i,
    /better.*automation/i,
    /streamline.*processes/i,
    /optimize.*pipelines?/i,

    // Security-specific boilerplate
    /strengthen.*security/i,
    /improve.*authentication/i,
    /enhance.*authorization/i,
    /better.*access control/i,
    /review.*permissions/i,

    // Database-specific boilerplate
    /improve.*data.*integrity/i,
    /enhance.*queries/i,
    /optimize.*database/i,
    /better.*schema.*design/i,
    /review.*migrations/i,

    // Testing-specific boilerplate
    /increase.*test.*coverage/i,
    /add.*more.*tests/i,
    /improve.*test.*quality/i,
    /write.*better.*tests/i,

    // Generic process boilerplate
    /continue.*current.*approach/i,
    /maintain.*momentum/i,
    /stay.*course/i,
    /keep.*doing.*what/i
  ];

  /**
   * Detect boilerplate content in retrospective fields
   *
   * @param {Object} retrospective - Retrospective from database
   * @returns {Object} Detection result with matches and score penalty
   */
  static detectBoilerplate(retrospective) {
    const matches = [];
    const fieldsToCheck = [
      'what_went_well',
      'what_needs_improvement',
      'key_learnings',
      'action_items',
      'improvement_areas'
    ];

    for (const field of fieldsToCheck) {
      const content = retrospective[field];
      if (!content) continue;

      // Handle both string and array content
      const textItems = Array.isArray(content)
        ? content.map(item => typeof item === 'string' ? item : JSON.stringify(item))
        : [String(content)];

      for (const text of textItems) {
        for (const pattern of this.BOILERPLATE_PATTERNS) {
          if (pattern.test(text)) {
            matches.push({
              field,
              pattern: pattern.source,
              text: text.substring(0, 100)
            });
          }
        }
      }
    }

    const hasBoilerplate = matches.length > 0;
    // Calculate penalty: -5 points per boilerplate match, max -25
    const scorePenalty = Math.min(matches.length * 5, 25);

    return {
      hasBoilerplate,
      matchCount: matches.length,
      matches,
      scorePenalty,
      message: hasBoilerplate
        ? `Found ${matches.length} boilerplate pattern(s) - consider more specific, SD-relevant content`
        : null
    };
  }

  /**
   * Validate that retrospective has all required fields with correct column names.
   * This prevents silent failures from schema/code mismatches.
   *
   * @param {Object} retrospective - Retrospective from database
   * @returns {Object} Validation result with warnings for missing/empty fields
   */
  validateRetrospectiveFields(retrospective) {
    const warnings = [];
    const missingFields = [];

    for (const [field, description] of Object.entries(RetrospectiveQualityRubric.REQUIRED_FIELDS)) {
      if (retrospective[field] === undefined) {
        missingFields.push(`Field '${field}' is undefined - check if column name matches database schema`);
      } else if (Array.isArray(retrospective[field]) && retrospective[field].length === 0) {
        warnings.push(`Field '${field}' is empty array - ${description}`);
      }
    }

    if (missingFields.length > 0) {
      console.warn('⚠️  RETROSPECTIVE SCHEMA MISMATCH DETECTED:');
      missingFields.forEach(m => console.warn(`   - ${m}`));
      console.warn('   → Verify database column names match code field references');
    }

    return {
      valid: missingFields.length === 0,
      missingFields,
      warnings
    };
  }

  /**
   * Format Retrospective data for AI evaluation (with optional SD context)
   *
   * @param {Object} retrospective - Retrospective from database
   * @param {Object} sd - Strategic Directive (parent context) - optional
   * @returns {string} Formatted content for evaluation
   */
  formatRetrospectiveForEvaluation(retrospective, sd = null) {
    // PREVENTATIVE: Validate field names before formatting
    const validation = this.validateRetrospectiveFields(retrospective);
    if (!validation.valid) {
      console.error('❌ RETROSPECTIVE FIELD VALIDATION FAILED - AI evaluation will receive incomplete data');
    }
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

**Original Scope:**
${sd.scope || 'Not defined'}

---

`;
    }

    return `# Retrospective for SD: ${retrospective.sd_id}

${sdContext}## What Went Well
${this.formatList(retrospective.what_went_well)}

## What Didn't Go Well / Needs Improvement
${this.formatList(retrospective.what_needs_improvement)}

## Lessons Learned / Key Learnings
${this.formatLessons(retrospective.key_learnings)}

## Action Items
${this.formatActionItems(retrospective.action_items)}

## Improvement Areas
${this.formatImprovementAreas(retrospective.improvement_areas)}

## Additional Context
Quality Score: ${retrospective.quality_score || 'Not scored'}
Completion Date: ${retrospective.completed_at || 'Not set'}
Duration: ${retrospective.duration_days || 'Unknown'} days`;
  }

  /**
   * Format Strategic Objectives from SD
   */
  formatStrategicObjectives(objectives) {
    if (!objectives || objectives.length === 0) {
      return 'No strategic objectives defined';
    }

    if (Array.isArray(objectives)) {
      // Show first 3 objectives to avoid token bloat
      const topObjectives = objectives.slice(0, 3);
      return topObjectives.map((obj, idx) => {
        if (typeof obj === 'string') {
          return `${idx + 1}. ${obj}`;
        } else if (obj.objective) {
          return `${idx + 1}. ${obj.objective}`;
        }
        return `${idx + 1}. ${JSON.stringify(obj)}`;
      }).join('\n') + (objectives.length > 3 ? `\n... and ${objectives.length - 3} more` : '');
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
      // Show first 3 metrics to avoid token bloat
      const topMetrics = metrics.slice(0, 3);
      return topMetrics.map((metric, idx) => {
        if (typeof metric === 'string') {
          return `${idx + 1}. ${metric}`;
        } else if (metric.metric) {
          const baseline = metric.baseline ? ` (Baseline: ${metric.baseline})` : '';
          const target = metric.target ? ` → Target: ${metric.target}` : '';
          return `${idx + 1}. ${metric.metric}${baseline}${target}`;
        }
        return `${idx + 1}. ${JSON.stringify(metric)}`;
      }).join('\n') + (metrics.length > 3 ? `\n... and ${metrics.length - 3} more` : '');
    }

    return JSON.stringify(metrics);
  }

  /**
   * Format generic list for evaluation
   */
  formatList(items) {
    if (!items || items.length === 0) {
      return 'None listed';
    }

    if (Array.isArray(items)) {
      return items.map((item, idx) => {
        if (typeof item === 'string') {
          return `${idx + 1}. ${item}`;
        }
        return `${idx + 1}. ${JSON.stringify(item)}`;
      }).join('\n');
    }

    return JSON.stringify(items);
  }

  /**
   * Format lessons learned for evaluation
   */
  formatLessons(lessons) {
    if (!lessons || lessons.length === 0) {
      return 'No lessons learned documented';
    }

    if (Array.isArray(lessons)) {
      return lessons.map((lesson, idx) => {
        if (typeof lesson === 'string') {
          return `${idx + 1}. ${lesson}`;
        } else if (lesson.lesson) {
          const category = lesson.category ? ` [${lesson.category}]` : '';
          const applicability = lesson.applicability ? `\n   Applicability: ${lesson.applicability}` : '';
          return `${idx + 1}. ${lesson.lesson}${category}${applicability}`;
        }
        return `${idx + 1}. ${JSON.stringify(lesson)}`;
      }).join('\n\n');
    }

    return JSON.stringify(lessons);
  }

  /**
   * Format action items for evaluation
   */
  formatActionItems(actions) {
    if (!actions || actions.length === 0) {
      return 'No action items defined';
    }

    if (Array.isArray(actions)) {
      return actions.map((action, idx) => {
        if (typeof action === 'string') {
          return `${idx + 1}. ${action}`;
        } else if (action.action) {
          const owner = action.owner ? ` [Owner: ${action.owner}]` : '';
          const deadline = action.deadline ? ` [Deadline: ${action.deadline}]` : '';
          const status = action.status ? ` [Status: ${action.status}]` : '';
          return `${idx + 1}. ${action.action}${owner}${deadline}${status}`;
        }
        return `${idx + 1}. ${JSON.stringify(action)}`;
      }).join('\n');
    }

    return JSON.stringify(actions);
  }

  /**
   * Format improvement areas for evaluation
   */
  formatImprovementAreas(areas) {
    if (!areas || areas.length === 0) {
      return 'No improvement areas identified';
    }

    if (Array.isArray(areas)) {
      return areas.map((area, idx) => {
        if (typeof area === 'string') {
          return `${idx + 1}. ${area}`;
        } else if (area.area) {
          const rootCause = (area.analysis || area.root_cause) ? `\n   Root Cause: ${area.analysis || area.root_cause}` : '';
          const prevention = area.prevention ? `\n   Prevention: ${area.prevention}` : '';
          return `${idx + 1}. ${area.area}${rootCause}${prevention}`;
        }
        return `${idx + 1}. ${JSON.stringify(area)}`;
      }).join('\n\n');
    }

    return JSON.stringify(areas);
  }

  /**
   * Validate Retrospective quality using Russian Judge AI scoring (with SD context)
   *
   * @param {Object} retrospective - Retrospective from database
   * @param {Object} sd - Strategic Directive (optional - will fetch if not provided)
   * @returns {Promise<Object>} Validation result compatible with LEO Protocol
   */
  async validateRetrospectiveQuality(retrospective, sd = null) {
    try {
      // Fetch SD context if not provided but retrospective has sd_id
      if (!sd && retrospective.sd_id) {
        try {
          const { data: sdData } = await this.supabase
            .from('strategic_directives_v2')
            .select('sd_id, id, title, description, strategic_objectives, success_metrics, scope')
            .eq('sd_id', retrospective.sd_id)
            .single();

          sd = sdData;
        } catch (sdError) {
          console.warn(`Could not fetch SD context for Retrospective ${retrospective.sd_id}:`, sdError.message);
          // Continue without SD context
        }
      }

      // Format retrospective for evaluation (with SD context if available)
      const formattedContent = this.formatRetrospectiveForEvaluation(retrospective, sd);

      // Get Retrospective ID
      const retroId = retrospective.id || retrospective.sd_id;

      // Run AI evaluation with sd_type awareness
      // Pass sd object for dynamic threshold and type-specific guidance
      const assessment = await this.evaluate(formattedContent, retroId, sd);

      // SD-LEO-HARDEN-VALIDATION-001: Detect boilerplate content
      const boilerplateResult = RetrospectiveQualityRubric.detectBoilerplate(retrospective);
      let adjustedScore = assessment.weightedScore;
      const additionalWarnings = [...assessment.feedback.recommended];

      if (boilerplateResult.hasBoilerplate) {
        adjustedScore = Math.max(0, adjustedScore - boilerplateResult.scorePenalty);
        additionalWarnings.push(boilerplateResult.message);
        console.warn(`⚠️  Boilerplate detected: ${boilerplateResult.matchCount} pattern(s) found, -${boilerplateResult.scorePenalty} points`);
      }

      // Convert to LEO Protocol format
      // NEW: Include improvements array from AI feedback
      return {
        passed: assessment.passed && adjustedScore >= assessment.threshold,
        score: adjustedScore,
        issues: assessment.feedback.required,
        warnings: additionalWarnings,
        details: {
          criterion_scores: assessment.scores,
          weighted_score: assessment.weightedScore,
          boilerplate_penalty: boilerplateResult.scorePenalty,
          adjusted_score: adjustedScore,
          threshold: assessment.threshold, // Dynamic threshold based on sd_type
          // v1.2.0: Scoring bands for stable decisions
          band: assessment.band,
          confidence: assessment.confidence,
          confidence_reasoning: assessment.confidence_reasoning,
          sd_type: assessment.sd_type,
          is_orchestrator: assessment.is_orchestrator, // Orchestrator awareness
          child_count: assessment.child_count, // Number of child SDs
          cost_usd: assessment.cost,
          duration_ms: assessment.duration,
          sd_context_included: !!sd,
          improvements: assessment.feedback.improvements || [] // NEW: Actionable improvements
        }
      };
    } catch (error) {
      console.error('Retrospective Quality Validation Error:', error);

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
