/**
 * Critic Personas for Multi-Model Debate System
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-B (FR-2, FR-3)
 *
 * Defines 3 distinct critic personas with:
 * - System prompts
 * - Scoring rubrics
 * - Assigned provider families
 */

/**
 * Persona definitions with system prompts and rubrics
 */
export const CRITIC_PERSONAS = {
  safety: {
    id: 'safety',
    name: 'Safety Guardian',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',

    systemPrompt: `You are the Safety Guardian critic in a governance debate about self-improvement proposals.

Your role is to evaluate proposals from a SAFETY perspective, focusing on:
- Risk of unintended consequences
- Potential for cascading failures
- Reversibility of changes
- Impact on system stability
- Data integrity and security implications

SCORING RUBRIC (0-100):
- 90-100: Exceptionally safe, minimal risk, easily reversible
- 70-89: Generally safe with minor concerns, manageable risks
- 50-69: Moderate risks requiring mitigation strategies
- 30-49: Significant safety concerns, needs substantial revision
- 0-29: Unacceptable safety risks, should be rejected

You MUST respond in JSON format:
{
  "verdict": "approve" | "revise" | "reject",
  "score": <number 0-100>,
  "rationale": "<detailed explanation of your safety assessment>",
  "change_requests": ["<specific change 1>", "<specific change 2>", ...]
}

Be thorough but fair. Consider both immediate and long-term safety implications.`,

    rubric: {
      criteria: [
        { name: 'reversibility', weight: 0.25, description: 'Can changes be rolled back?' },
        { name: 'stability_impact', weight: 0.25, description: 'Impact on system stability' },
        { name: 'cascading_risk', weight: 0.20, description: 'Risk of cascading failures' },
        { name: 'data_integrity', weight: 0.15, description: 'Data integrity preservation' },
        { name: 'security', weight: 0.15, description: 'Security implications' }
      ]
    }
  },

  value: {
    id: 'value',
    name: 'Value Assessor',
    provider: 'openai',
    model: 'gpt-4o',

    systemPrompt: `You are the Value Assessor critic in a governance debate about self-improvement proposals.

Your role is to evaluate proposals from a VALUE perspective, focusing on:
- Business value and ROI
- User impact and benefit
- Alignment with strategic objectives
- Opportunity cost of implementation
- Long-term value sustainability

SCORING RUBRIC (0-100):
- 90-100: Exceptional value, clear ROI, strong strategic alignment
- 70-89: Good value proposition with clear benefits
- 50-69: Moderate value, benefits present but not compelling
- 30-49: Limited value, questionable ROI
- 0-29: Negative value or misaligned with objectives

You MUST respond in JSON format:
{
  "verdict": "approve" | "revise" | "reject",
  "score": <number 0-100>,
  "rationale": "<detailed explanation of your value assessment>",
  "change_requests": ["<specific change 1>", "<specific change 2>", ...]
}

Be objective and quantitative where possible. Consider both immediate and long-term value.`,

    rubric: {
      criteria: [
        { name: 'business_value', weight: 0.30, description: 'Direct business benefit' },
        { name: 'user_impact', weight: 0.25, description: 'User experience improvement' },
        { name: 'strategic_alignment', weight: 0.20, description: 'Alignment with strategy' },
        { name: 'opportunity_cost', weight: 0.15, description: 'Cost vs alternatives' },
        { name: 'sustainability', weight: 0.10, description: 'Long-term maintainability' }
      ]
    }
  },

  risk: {
    id: 'risk',
    name: 'Risk Analyst',
    provider: 'google',
    model: 'gemini-1.5-pro',

    systemPrompt: `You are the Risk Analyst critic in a governance debate about self-improvement proposals.

Your role is to evaluate proposals from a RISK perspective, focusing on:
- Implementation complexity
- Technical debt implications
- Dependency risks
- Timeline and resource risks
- Compliance and governance risks

SCORING RUBRIC (0-100):
- 90-100: Very low risk, straightforward implementation
- 70-89: Manageable risks with clear mitigation paths
- 50-69: Moderate risks requiring careful management
- 30-49: High risks, needs significant risk mitigation
- 0-29: Unacceptable risk levels, should be rejected

You MUST respond in JSON format:
{
  "verdict": "approve" | "revise" | "reject",
  "score": <number 0-100>,
  "rationale": "<detailed explanation of your risk assessment>",
  "change_requests": ["<specific change 1>", "<specific change 2>", ...]
}

Be analytical and thorough. Identify both obvious and hidden risks.`,

    rubric: {
      criteria: [
        { name: 'implementation_complexity', weight: 0.25, description: 'How complex is the implementation?' },
        { name: 'technical_debt', weight: 0.20, description: 'Technical debt implications' },
        { name: 'dependencies', weight: 0.20, description: 'External dependency risks' },
        { name: 'resource_risk', weight: 0.20, description: 'Timeline and resource risks' },
        { name: 'compliance', weight: 0.15, description: 'Governance and compliance risks' }
      ]
    }
  }
};

/**
 * Get persona by ID
 * @param {string} personaId - Persona identifier (safety, value, risk)
 * @returns {Object} Persona definition
 */
export function getPersona(personaId) {
  const persona = CRITIC_PERSONAS[personaId];
  if (!persona) {
    throw new Error(`Unknown persona: ${personaId}. Valid personas: ${Object.keys(CRITIC_PERSONAS).join(', ')}`);
  }
  return persona;
}

/**
 * Get all personas
 * @returns {Object[]} Array of persona definitions
 */
export function getAllPersonas() {
  return Object.values(CRITIC_PERSONAS);
}

/**
 * Build user prompt for a persona evaluation
 * @param {Object} proposal - The proposal to evaluate
 * @param {string} orchestratorSummary - Summary from previous round (null for round 0)
 * @returns {string} Formatted user prompt
 */
export function buildEvaluationPrompt(proposal, orchestratorSummary = null) {
  let prompt = `## Proposal for Evaluation

**Title:** ${proposal.title || 'Untitled Proposal'}

**Summary:**
${proposal.summary || proposal.description || 'No summary provided'}

**Motivation:**
${proposal.motivation || 'Not specified'}

**Scope:**
${formatScope(proposal.scope)}

**Affected Components:**
${formatComponents(proposal.affected_components)}

**Risk Level (Initial Assessment):** ${proposal.risk_level || 'Unknown'}
`;

  if (orchestratorSummary) {
    prompt += `
---

## Previous Round Summary (from Orchestrator)

${orchestratorSummary}

---

Based on the orchestrator's summary of the previous round, provide your updated assessment.
`;
  }

  prompt += `
Please provide your assessment in the required JSON format.`;

  return prompt;
}

/**
 * Format scope items for prompt
 */
function formatScope(scope) {
  if (!scope || scope.length === 0) {
    return 'Not specified';
  }
  return scope.map(s => `- ${s.area}: ${s.description}`).join('\n');
}

/**
 * Format affected components for prompt
 */
function formatComponents(components) {
  if (!components || components.length === 0) {
    return 'Not specified';
  }
  return components.map(c => `- ${c.name} (${c.type}, impact: ${c.impact})`).join('\n');
}

/**
 * Parse persona response to extract structured data
 * @param {string} responseText - Raw response from LLM
 * @returns {Object} Parsed response with verdict, score, rationale, change_requests
 */
export function parsePersonaResponse(responseText) {
  try {
    // Try to extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!parsed.verdict || typeof parsed.score !== 'number' || !parsed.rationale) {
        throw new Error('Missing required fields in response');
      }

      // Normalize verdict
      const normalizedVerdict = parsed.verdict.toLowerCase();
      if (!['approve', 'revise', 'reject'].includes(normalizedVerdict)) {
        throw new Error(`Invalid verdict: ${parsed.verdict}`);
      }

      return {
        verdict: normalizedVerdict,
        score: Math.max(0, Math.min(100, parsed.score)),
        rationale: parsed.rationale,
        change_requests: Array.isArray(parsed.change_requests) ? parsed.change_requests : []
      };
    }

    throw new Error('No JSON found in response');
  } catch (error) {
    // Return a structured error response
    return {
      verdict: 'revise',
      score: 50,
      rationale: `Failed to parse response: ${error.message}. Raw response: ${responseText.substring(0, 200)}...`,
      change_requests: ['Response parsing failed - manual review required'],
      parse_error: true
    };
  }
}

/**
 * Validate that persona assignments follow CONST-002 family separation
 * @returns {{ valid: boolean, violations: string[] }}
 */
export function validatePersonaFamilySeparation() {
  const families = getAllPersonas().map(p => p.provider);
  const uniqueFamilies = new Set(families);

  const violations = [];

  // Check all 3 personas use different providers
  if (uniqueFamilies.size !== 3) {
    const duplicates = families.filter((f, i) => families.indexOf(f) !== i);
    violations.push(`CONST-002: Duplicate provider families detected: ${duplicates.join(', ')}`);
  }

  return {
    valid: violations.length === 0,
    violations,
    families: Array.from(uniqueFamilies)
  };
}

export default {
  CRITIC_PERSONAS,
  getPersona,
  getAllPersonas,
  buildEvaluationPrompt,
  parsePersonaResponse,
  validatePersonaFamilySeparation
};
