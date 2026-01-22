/**
 * AI Quality Evaluator - Prompt Generation
 * System and user prompts with SD-type-specific guidance
 */

/**
 * Get type-specific evaluation guidance for different SD types
 * Helps the AI understand when to be lenient vs strict
 * @param {string} sdType - SD type
 * @param {Object} sd - Strategic Directive object
 * @returns {string} Guidance text
 */
export function getTypeSpecificGuidance(sdType, sd = null) {
  const guidance = {
    documentation: `- Relax technical architecture requirements (focus on clarity, not code design)
- Don't penalize for missing code-related details (UI components, API endpoints)
- Prioritize documentation coverage, organization, and completeness
- Accept simplified acceptance criteria for documentation tasks
- "As a developer, I need organized docs" is a valid user story`,

    infrastructure: `- De-emphasize user benefits (internal tooling, not customer-facing)
- "User" may be "developer" or "system" (this is acceptable)
- Focus on technical robustness, reliability, and operational excellence
- Prioritize system architecture over user stories
- Benefits can be technical (reduced deploy time, better monitoring, etc.)`,

    feature: `- Full evaluation across all criteria (customer-facing work)
- Balance user value with technical quality
- Require clear end-user benefit (not generic "improve system")
- Strict on UI/UX requirements and acceptance criteria
- Apply standard LEO Protocol quality standards

**LEO v4.4.0 - Human-Verifiable Outcome Requirement:**
- Feature SDs MUST include criteria that a non-technical person could verify
- Look for "smoke test" style outcomes: Navigate to X, click Y, see Z
- Penalize if ALL criteria are technical-only (API returns 200, data in database)
- Good: "User sees success toast within 2 seconds of clicking Save"
- Bad: "Data is correctly persisted to venture_artifacts table"
- If SD lacks human-verifiable outcomes, cap score at 70% for this criterion`,

    database: `- Prioritize schema design quality and data integrity
- Emphasize migration safety, rollback plans, and RLS policies
- Focus on risk analysis (data loss scenarios, downtime, corruption)
- Benefits can be technical (performance, data consistency, scalability)
- Strict on database-specific risks and mitigation strategies`,

    security: `- Extra weight on risk analysis and threat modeling
- Require specific security threat identification (not generic "security")
- Strict on authentication/authorization logic and OWASP compliance
- Emphasize security best practices and vulnerability prevention
- No assumptions about "secure by default" - require explicit security measures`
  };

  let baseGuidance = guidance[sdType] || guidance.feature;

  // Add orchestrator-specific guidance if applicable
  if (sd?._isOrchestrator) {
    const orchestratorGuidance = `

**ORCHESTRATOR SD CONTEXT (${sd._childCount} child SDs, ${sd._completedChildCount} completed):**
- This is a PARENT/ORCHESTRATOR SD that coordinates multiple child SDs
- It does NOT directly produce code, tests, or deliverables itself
- Children handle the actual implementation work
- Evaluate based on COORDINATION quality, not direct deliverable quality
- For 'improvement_area_depth': Focus on coordination patterns, dependency management, and child SD orchestration lessons - NOT missing test evidence (children handle testing)
- For 'learning_specificity': Lessons should be about orchestration patterns, parallel execution, child SD management
- For 'action_item_actionability': Actions should relate to improving future orchestration, not fixing code
- Do NOT penalize for "missing test evidence" - orchestrators delegate testing to children
- Score 7-8 for retrospectives that capture coordination insights even without deep root-cause analysis
- The value of an orchestrator retrospective is in meta-lessons about multi-SD coordination`;

    baseGuidance += orchestratorGuidance;
  }

  return baseGuidance;
}

/**
 * Get system prompt (defines evaluation rules + LEO Protocol context)
 * @param {Object} rubricConfig - Rubric configuration
 * @param {Object} sd - Strategic Directive object
 * @returns {string} System prompt
 */
export function getSystemPrompt(rubricConfig, sd = null) {
  // Add SD type context if available
  let sdTypeContext = '';
  if (sd?.sd_type) {
    const typeLabel = sd._isOrchestrator
      ? `${sd.sd_type} (ORCHESTRATOR - ${sd._childCount} children)`
      : sd.sd_type;

    sdTypeContext = `\n\n**SD Type**: ${typeLabel}

**Evaluation Adjustments for ${sd.sd_type.toUpperCase()} SDs:**
${getTypeSpecificGuidance(sd.sd_type, sd)}`;
  }

  return `You are a quality evaluator for LEO Protocol deliverables.

**LEO Protocol Context:**
LEO Protocol is a database-first software development lifecycle with 3 phases:
- LEAD: Strategic approval (validates Strategic Directives)
- PLAN: Requirements & architecture (validates PRDs and User Stories)
- EXEC: Implementation (validates code and Retrospectives)

**Quality Philosophy:**
- Database-first: All requirements stored in database, not markdown files
- Anti-boilerplate: Reject generic text like "To be defined", "improve system"
- Specific & testable: Every requirement must have clear pass/fail criteria
- Russian Judge scoring: Multi-criterion weighted evaluation (like Olympic judging)

**Common LEO Anti-Patterns to Penalize Heavily:**
- Placeholder text: "To be defined", "TBD", "during planning"
- Generic benefits: "improve UX", "better system", "enhance functionality"
- Boilerplate acceptance criteria: "all tests passing", "code review completed"
- Missing architecture details: No data flow, no integration points
${sdTypeContext}

Your task is to score content across multiple criteria using a 0-10 scale:

**Scoring Scale:**
- 0-3: Completely inadequate (missing, boilerplate, or unusable)
- 4-6: Present but needs significant improvement
- 7-8: Good quality with minor issues
- 9-10: Excellent, exemplary quality (reserve for truly exceptional work)

**Important Rules:**
1. Be **strict but fair** - reserve 9-10 for truly exceptional work
2. Provide **specific reasoning** - explain why you gave each score in 1-2 sentences
3. Focus on **actionable feedback** - what needs improvement?
4. Avoid **grade inflation** - if something is mediocre, score it 4-6
5. **Penalize placeholders heavily** - "To be defined" should score 0-3
6. **Adjust strictness based on SD type** - apply the guidance above appropriately
7. **ALWAYS provide improvement suggestions** for scores below 8 - be specific about WHAT to change

Return ONLY valid JSON in this exact format:
{
  "criterion_name": {
    "score": <number 0-10>,
    "reasoning": "<1-2 sentence explanation of why this score>",
    "improvement": "<REQUIRED for scores <8: specific, actionable suggestion to improve this criterion. Example: 'Add baselines and targets to success metrics like: Baseline: 0% → Target: 80% coverage'. Leave empty string if score >= 8>"
  },
  "_meta": {
    "confidence": "<HIGH | MEDIUM | LOW - your confidence in this assessment>",
    "confidence_reasoning": "<1 sentence explaining confidence level>"
  }
}

**Confidence Guidelines:**
- HIGH: Clear evidence supports scores, no ambiguity in content quality
- MEDIUM: Reasonable assessment but some interpretation required
- LOW: Content is ambiguous, incomplete, or difficult to evaluate fairly

NO additional text, explanations, or markdown - ONLY the JSON object.`;
}

/**
 * Get user prompt (content + rubric criteria)
 * @param {string} content - Content to evaluate
 * @param {Object} rubricConfig - Rubric configuration
 * @returns {string} User prompt
 */
export function getUserPrompt(content, rubricConfig) {
  const criteriaPrompts = rubricConfig.criteria.map((criterion, idx) =>
    `${idx + 1}. **${criterion.name}** (${Math.round(criterion.weight * 100)}% weight):
${criterion.prompt}
`
  ).join('\n');

  return `Evaluate this ${rubricConfig.contentType} content:

${content}

---

**Evaluation Criteria:**

${criteriaPrompts}

Return JSON scores for ALL ${rubricConfig.criteria.length} criteria.`;
}

/**
 * Build OpenAI API prompt with rubric criteria and sd_type context
 * @param {string} content - Content to evaluate
 * @param {Object} rubricConfig - Rubric configuration
 * @param {Object} sd - Strategic Directive object
 * @returns {Array} Array of message objects
 */
export function buildPrompt(content, rubricConfig, sd = null) {
  const systemPrompt = getSystemPrompt(rubricConfig, sd);
  const userPrompt = getUserPrompt(content, rubricConfig);

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
}
