/**
 * User Story Quality Rubric - User Story Quality Assessment
 *
 * Uses AI-powered Russian Judge multi-criterion weighted scoring (0-10 per criterion)
 * to evaluate User Story quality during PLAN phase.
 *
 * Criteria:
 * 1. Acceptance Criteria Clarity & Testability (50%) - Specific, testable, not boilerplate
 * 2. Story Independence & Implementability (30%) - Can be implemented standalone
 * 3. Benefit Articulation (15%) - Clear user benefit, not "improve system"
 * 4. Given-When-Then Format (5%) - Proper GWT usage
 *
 * @module rubrics/user-story-quality-rubric
 * @version 1.0.0
 */

import { AIQualityEvaluator } from '../ai-quality-evaluator.js';

export class UserStoryQualityRubric extends AIQualityEvaluator {
  constructor() {
    const rubricConfig = {
      contentType: 'user_story',
      criteria: [
        {
          name: 'acceptance_criteria_clarity_testability',
          weight: 0.50,
          prompt: `Evaluate acceptance criteria clarity and testability:
- 0-3: No acceptance criteria, boilerplate ("works correctly"), or untestable ("good UX")
- 4-6: Some specific criteria but many vague or not independently testable
- 7-8: Most criteria are specific, testable, and verifiable
- 9-10: All acceptance criteria are specific, testable, verifiable, with clear pass/fail conditions

Penalize heavily for generic boilerplate like "system works", "good performance", "user-friendly". Reserve 9-10 for truly testable criteria.`
        },
        {
          name: 'story_independence_implementability',
          weight: 0.30,
          prompt: `Evaluate whether the story can be implemented independently:
- 0-3: Story depends on multiple other stories or lacks sufficient detail for implementation
- 4-6: Mostly independent but has some unclear dependencies or missing details
- 7-8: Story can be implemented standalone with minimal external dependencies
- 9-10: Completely self-contained story with all necessary context and no blocking dependencies

Look for INVEST principles: Independent, Negotiable, Valuable, Estimable, Small, Testable.`
        },
        {
          name: 'benefit_articulation',
          weight: 0.15,
          prompt: `Evaluate how clearly the user benefit is articulated:
- 0-3: No benefit stated or generic ("improve system", "enhance UX")
- 4-6: Benefit mentioned but vague or system-centric rather than user-centric
- 7-8: Clear user benefit that explains WHY the user needs this
- 9-10: Compelling user benefit with specific value proposition and user impact

Score 9-10 only if the benefit clearly articulates user value, not just technical improvements.`
        },
        {
          name: 'given_when_then_format',
          weight: 0.05,
          prompt: `Evaluate Given-When-Then (GWT) scenario format quality:
- 0-3: No GWT scenarios or incorrect format
- 4-6: GWT format present but incomplete or improperly structured
- 7-8: Proper GWT format with clear preconditions, actions, and expected outcomes
- 9-10: Excellent GWT scenarios covering happy path, edge cases, and error conditions

Given-When-Then should clearly define: GIVEN (precondition), WHEN (action), THEN (expected outcome).`
        }
      ]
    };

    super(rubricConfig);
  }

  /**
   * Format User Story data for AI evaluation (with optional PRD context)
   *
   * @param {Object} userStory - User Story from database
   * @param {Object} prd - Product Requirements Document (parent context) - optional
   * @returns {string} Formatted content for evaluation
   */
  formatUserStoryForEvaluation(userStory, prd = null) {
    let prdContext = '';

    if (prd) {
      prdContext = `## PRD CONTEXT

**PRD ID:** ${prd.id}
**Overview:** ${prd.overview || 'Not provided'}

**Key Functional Requirements:**
${this.formatPRDRequirements(prd.functional_requirements)}

**Technical Architecture Summary:**
${this.formatArchitectureSummary(prd.technical_architecture)}

---

`;
    }

    return `# User Story: ${userStory.title || userStory.id}

${prdContext}## Story
${this.formatStoryText(userStory)}

## Acceptance Criteria
${this.formatAcceptanceCriteria(userStory.acceptance_criteria)}

## Given-When-Then Scenarios
${this.formatGivenWhenThen(userStory.scenarios)}

## Additional Context
Priority: ${userStory.priority || 'Not set'}
Status: ${userStory.status || 'Not set'}
Estimated Points: ${userStory.story_points || 'Not estimated'}
SD Link: ${userStory.sd_id || 'Not linked'}`;
  }

  /**
   * Format PRD Functional Requirements (summary)
   */
  formatPRDRequirements(requirements) {
    if (!requirements || requirements.length === 0) {
      return 'No functional requirements defined in PRD';
    }

    if (Array.isArray(requirements)) {
      // Show first 5 requirements to avoid token bloat
      const topRequirements = requirements.slice(0, 5);
      return topRequirements.map((req, idx) => {
        if (typeof req === 'string') {
          return `${idx + 1}. ${req}`;
        } else if (req.requirement) {
          return `${idx + 1}. ${req.requirement}`;
        }
        return `${idx + 1}. ${JSON.stringify(req)}`;
      }).join('\n') + (requirements.length > 5 ? `\n... and ${requirements.length - 5} more` : '');
    }

    return 'Requirements not in expected format';
  }

  /**
   * Format Technical Architecture (summary)
   */
  formatArchitectureSummary(architecture) {
    if (!architecture) {
      return 'No technical architecture defined in PRD';
    }

    if (typeof architecture === 'string') {
      // Truncate to first 200 chars
      return architecture.length > 200 ? architecture.substring(0, 200) + '...' : architecture;
    }

    if (typeof architecture === 'object') {
      const overview = architecture.overview || '';
      const components = architecture.components ? `\nComponents: ${architecture.components.length} defined` : '';
      return (overview.substring(0, 150) + (overview.length > 150 ? '...' : '')) + components;
    }

    return 'Architecture details available in PRD';
  }

  /**
   * Format story text (As a... I want... So that...)
   */
  formatStoryText(userStory) {
    if (userStory.user_story) {
      return userStory.user_story;
    }

    // Construct from components if available
    const asA = userStory.as_a || userStory.persona || '';
    const iWant = userStory.i_want || userStory.action || '';
    const soThat = userStory.so_that || userStory.benefit || '';

    if (asA && iWant && soThat) {
      return `As a ${asA}\nI want ${iWant}\nSo that ${soThat}`;
    }

    if (userStory.description) {
      return userStory.description;
    }

    return 'No story text provided';
  }

  /**
   * Format acceptance criteria for evaluation
   */
  formatAcceptanceCriteria(criteria) {
    if (!criteria || criteria.length === 0) {
      return 'No acceptance criteria defined';
    }

    if (Array.isArray(criteria)) {
      return criteria.map((criterion, idx) => {
        if (typeof criterion === 'string') {
          return `${idx + 1}. ${criterion}`;
        } else if (criterion.criterion) {
          const testable = criterion.testable ? ' [TESTABLE]' : '';
          return `${idx + 1}. ${criterion.criterion}${testable}`;
        }
        return `${idx + 1}. ${JSON.stringify(criterion)}`;
      }).join('\n');
    }

    return JSON.stringify(criteria);
  }

  /**
   * Format Given-When-Then scenarios for evaluation
   */
  formatGivenWhenThen(scenarios) {
    if (!scenarios || scenarios.length === 0) {
      return 'No Given-When-Then scenarios defined';
    }

    if (Array.isArray(scenarios)) {
      return scenarios.map((scenario, idx) => {
        if (typeof scenario === 'string') {
          return `Scenario ${idx + 1}:\n${scenario}`;
        } else if (scenario.given || scenario.when || scenario.then) {
          const given = scenario.given ? `GIVEN ${scenario.given}` : '';
          const when = scenario.when ? `WHEN ${scenario.when}` : '';
          const then = scenario.then ? `THEN ${scenario.then}` : '';
          return `Scenario ${idx + 1}:\n${given}\n${when}\n${then}`;
        } else if (scenario.scenario) {
          return `Scenario ${idx + 1}:\n${scenario.scenario}`;
        }
        return `Scenario ${idx + 1}:\n${JSON.stringify(scenario)}`;
      }).join('\n\n');
    }

    return JSON.stringify(scenarios);
  }

  /**
   * Validate User Story quality using Russian Judge AI scoring (with PRD context)
   *
   * @param {Object} userStory - User Story from database
   * @param {Object} prd - Product Requirements Document (optional - will fetch if not provided)
   * @returns {Promise<Object>} Validation result compatible with LEO Protocol
   */
  async validateUserStoryQuality(userStory, prd = null) {
    try {
      // Fetch PRD context if not provided but user story has SD link
      if (!prd && userStory.sd_id) {
        try {
          const { data: prdData } = await this.supabase
            .from('product_requirements_v2')
            .select('id, overview, functional_requirements, technical_architecture')
            .eq('directive_id', userStory.sd_id)
            .single();

          prd = prdData;
        } catch (prdError) {
          console.warn(`Could not fetch PRD context for User Story ${userStory.id}:`, prdError.message);
          // Continue without PRD context
        }
      }

      // Format user story for evaluation (with PRD context if available)
      const formattedContent = this.formatUserStoryForEvaluation(userStory, prd);

      // Get User Story ID
      const storyId = userStory.id || userStory.story_id;

      // Run AI evaluation
      const assessment = await this.evaluate(formattedContent, storyId);

      // Convert to LEO Protocol format
      return {
        passed: assessment.passed,
        score: assessment.weightedScore,
        issues: assessment.feedback.required,
        warnings: assessment.feedback.recommended,
        details: {
          criterion_scores: assessment.scores,
          weighted_score: assessment.weightedScore,
          threshold: 70,
          cost_usd: assessment.cost,
          duration_ms: assessment.duration
        }
      };
    } catch (error) {
      console.error('User Story Quality Validation Error:', error);

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
