/**
 * AI-Powered Rubric Evaluator
 * Part of SD-LEO-ORCH-SELF-IMPROVING-LEO-001-A
 *
 * Replaces hardcoded _scoreCriterion() with LLM-based evaluation.
 * Uses a single structured JSON call per assessment.
 *
 * Architecture:
 *   getValidationClient() → Sonnet tier → single LLM call
 *   → JSON schema validation → retry with repair prompt (1x)
 *   → persist to leo_vetting_outcomes + audit_log
 */

import { getValidationClient } from '../../llm/client-factory.js';

// Default timeout for LLM evaluation (FR-4)
const DEFAULT_TIMEOUT_MS = 4500;

// Max retry on parse failure (FR-5)
const MAX_PARSE_RETRIES = 1;

// Rubric evaluator version for audit trail
const EVALUATOR_VERSION = '1.0.0';

/**
 * JSON schema for the expected LLM output (FR-5).
 * Exactly 6 criteria, each with score and reasoning fields.
 */
const EVALUATION_SCHEMA = {
  required: ['criteria', 'overall_score'],
  criteria_required: ['id', 'name', 'score', 'summary', 'reasoning', 'improvements'],
  score_range: { min: 0, max: 100 }
};

/**
 * Validate the parsed evaluation against the schema (FR-5).
 * @param {Object} parsed - Parsed JSON from LLM
 * @param {Array} expectedCriteria - Expected criterion IDs
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateEvaluationSchema(parsed, expectedCriteria) {
  const errors = [];

  if (!parsed || typeof parsed !== 'object') {
    errors.push('Response is not an object');
    return { valid: false, errors };
  }

  if (!Array.isArray(parsed.criteria)) {
    errors.push('Missing or non-array "criteria" field');
    return { valid: false, errors };
  }

  if (parsed.criteria.length !== expectedCriteria.length) {
    errors.push(`Expected ${expectedCriteria.length} criteria, got ${parsed.criteria.length}`);
  }

  if (typeof parsed.overall_score !== 'number' || parsed.overall_score < 0 || parsed.overall_score > 100) {
    errors.push(`overall_score must be 0-100 integer, got: ${parsed.overall_score}`);
  }

  const seenIds = new Set();
  for (const c of parsed.criteria) {
    if (!c.id) {
      errors.push('Criterion missing "id" field');
      continue;
    }

    if (seenIds.has(c.id)) {
      errors.push(`Duplicate criterion id: ${c.id}`);
    }
    seenIds.add(c.id);

    for (const field of EVALUATION_SCHEMA.criteria_required) {
      if (c[field] === undefined || c[field] === null) {
        errors.push(`Criterion "${c.id}" missing field: ${field}`);
      }
    }

    if (typeof c.score !== 'number' || c.score < 0 || c.score > 100) {
      errors.push(`Criterion "${c.id}" score must be 0-100, got: ${c.score}`);
    }

    if (typeof c.summary === 'string' && c.summary.length < 20) {
      errors.push(`Criterion "${c.id}" summary too short (${c.summary.length} chars, min 20)`);
    }

    if (Array.isArray(c.reasoning) && c.reasoning.length < 2) {
      errors.push(`Criterion "${c.id}" reasoning needs >=2 bullet points, got ${c.reasoning.length}`);
    }

    if (!Array.isArray(c.improvements) || c.improvements.length < 1) {
      errors.push(`Criterion "${c.id}" needs >=1 improvement suggestion`);
    }
  }

  // Check all expected criteria are present
  for (const expectedId of expectedCriteria) {
    if (!seenIds.has(expectedId)) {
      errors.push(`Missing expected criterion: ${expectedId}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build the system prompt for rubric evaluation.
 * @param {Object} rubric - Rubric with criteria array and scoringScale
 * @returns {string}
 */
function buildSystemPrompt(rubric) {
  const criteriaDesc = rubric.criteria.map(c =>
    `- ${c.id} (${c.name}, weight: ${c.weight}): ${c.description}`
  ).join('\n');

  return `You are an expert rubric evaluator for the LEO Protocol governance system.
Your task is to evaluate a proposal against a rubric with ${rubric.criteria.length} criteria.

RUBRIC CRITERIA:
${criteriaDesc}

SCORING SCALE: ${rubric.scoringScale.min}-${rubric.scoringScale.max} mapped to 0-100.
- 0-59:  F — Failing — Does not meet requirements
- 60-69: D — Poor — Significant gaps
- 70-79: C — Acceptable — Meets minimum requirements
- 80-89: B — Good — Solid implementation
- 90-100: A — Excellent — Exceeds expectations (A-: 90-92, A: 93-96, A+: 97-100)

RESPOND WITH ONLY valid JSON matching this exact structure:
{
  "criteria": [
    {
      "id": "<criterion_id>",
      "name": "<criterion_name>",
      "score": <0-100>,
      "summary": "<1-2 sentence summary, minimum 20 characters>",
      "reasoning": ["<bullet point 1>", "<bullet point 2>", ...],
      "evidence": ["<quote from proposal>"],
      "improvements": ["<suggestion 1>", ...]
    }
  ],
  "overall_score": <0-100>,
  "weighting": {${rubric.criteria.map(c => `"${c.id}": ${c.weight}`).join(', ')}}
}

You MUST include ALL ${rubric.criteria.length} criteria: ${rubric.criteria.map(c => c.id).join(', ')}.
Each criterion MUST have at least 2 reasoning bullets and 1 improvement suggestion.
Do NOT wrap in markdown code fences. Return ONLY the JSON object.`;
}

/**
 * Build the user prompt with proposal content.
 * @param {Object} proposal - Proposal to evaluate
 * @returns {string}
 */
function buildUserPrompt(proposal) {
  const parts = [];

  parts.push('PROPOSAL TO EVALUATE:');
  if (proposal.title) parts.push(`Title: ${proposal.title}`);
  if (proposal.summary) parts.push(`Summary: ${proposal.summary}`);
  if (proposal.motivation) parts.push(`Motivation: ${proposal.motivation}`);
  if (proposal.risk_level) parts.push(`Risk Level: ${proposal.risk_level}`);

  if (proposal.affected_components?.length > 0) {
    parts.push(`Affected Components: ${proposal.affected_components.map(c =>
      typeof c === 'string' ? c : `${c.name || c.type} (${c.type || 'unknown'})`
    ).join(', ')}`);
  }

  if (proposal.constitution_tags?.length > 0) {
    parts.push(`Constitution Tags: ${proposal.constitution_tags.join(', ')}`);
  }

  if (proposal.content) parts.push(`\nContent:\n${proposal.content}`);
  if (proposal.description) parts.push(`\nDescription:\n${proposal.description}`);

  parts.push('\nEvaluate this proposal against ALL rubric criteria. Return ONLY valid JSON.');

  return parts.join('\n');
}

/**
 * Build repair prompt when initial parse fails (FR-5).
 * @param {string} originalResponse - The malformed response
 * @param {string[]} validationErrors - Errors found
 * @returns {string}
 */
function buildRepairPrompt(originalResponse, validationErrors) {
  return `Your previous response had validation errors. Please fix and return ONLY valid JSON.

ERRORS FOUND:
${validationErrors.map(e => `- ${e}`).join('\n')}

YOUR PREVIOUS RESPONSE:
${originalResponse.substring(0, 2000)}

Fix the errors above and return ONLY the corrected JSON object. No markdown, no explanations.`;
}

/**
 * Parse LLM response text to JSON, handling common formatting issues.
 * @param {string} text - Raw LLM response
 * @returns {Object} Parsed JSON
 */
function parseResponse(text) {
  let cleaned = text.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  // Strip any leading/trailing whitespace after fence removal
  cleaned = cleaned.trim();

  return JSON.parse(cleaned);
}

/**
 * Evaluate a proposal against a rubric using AI.
 *
 * @param {Object} proposal - Proposal to evaluate
 * @param {Object} rubric - Rubric with criteria and scoringScale
 * @param {Object} [options] - Configuration options
 * @param {number} [options.timeoutMs] - Timeout for LLM call (default: 4500ms)
 * @param {Object} [options.supabase] - Supabase client for persistence
 * @param {Object} [options.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} Evaluation result
 */
export async function evaluateWithAI(proposal, rubric, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const correlationId = `eval-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const startTime = Date.now();

  const expectedCriteria = rubric.criteria.map(c => c.id);
  const systemPrompt = buildSystemPrompt(rubric);
  const userPrompt = buildUserPrompt(proposal);

  let llmClient;
  try {
    llmClient = options.llmClient || getValidationClient();
  } catch (err) {
    return createFailureResult('FAILED', `LLM client unavailable: ${err.message}`, {
      correlationId, startTime, proposal, rubric
    });
  }

  let rawResponse = null;
  let parsed = null;
  let model = 'unknown';
  let attempt = 0;

  // First attempt
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await llmClient.complete(systemPrompt, userPrompt, {
        maxTokens: 3000,
        signal: controller.signal
      });

      clearTimeout(timer);
      rawResponse = result.content;
      model = result.model || 'unknown';
      attempt = 1;

      parsed = parseResponse(rawResponse);
    } catch (err) {
      clearTimeout(timer);

      if (err.message === 'TIMEOUT' || err.name === 'AbortError') {
        const latencyMs = Date.now() - startTime;
        await writeAuditLog(options.supabase, {
          correlationId, proposalId: proposal.id, model,
          status: 'TIMEOUT', latencyMs, errorCode: 'LLM_TIMEOUT',
          rawResponse: null
        });
        return createFailureResult('TIMEOUT', `LLM call exceeded ${timeoutMs}ms timeout`, {
          correlationId, startTime, proposal, rubric, latencyMs
        });
      }

      // Provider error (4xx/5xx)
      const errorCode = mapProviderError(err);
      const latencyMs = Date.now() - startTime;
      await writeAuditLog(options.supabase, {
        correlationId, proposalId: proposal.id, model,
        status: 'FAILED', latencyMs, errorCode,
        rawResponse: null, providerRequestId: err.requestId
      });
      return createFailureResult('FAILED', err.message, {
        correlationId, startTime, proposal, rubric, latencyMs, errorCode
      });
    }
  } catch (outerErr) {
    return createFailureResult('FAILED', outerErr.message, {
      correlationId, startTime, proposal, rubric
    });
  }

  // Validate parsed response
  let validation = validateEvaluationSchema(parsed, expectedCriteria);

  // Retry with repair prompt if validation fails (FR-5)
  if (!validation.valid && attempt <= MAX_PARSE_RETRIES) {
    try {
      const repairPrompt = buildRepairPrompt(rawResponse, validation.errors);
      const retryResult = await llmClient.complete(systemPrompt, repairPrompt, {
        maxTokens: 3000
      });

      rawResponse = retryResult.content;
      attempt = 2;

      parsed = parseResponse(rawResponse);
      validation = validateEvaluationSchema(parsed, expectedCriteria);
    } catch (_retryErr) {
      // Retry failed - will fall through to PARSE_ERROR below
    }
  }

  const latencyMs = Date.now() - startTime;

  if (!validation.valid) {
    await writeAuditLog(options.supabase, {
      correlationId, proposalId: proposal.id, model,
      status: 'PARSE_ERROR', latencyMs,
      errorCode: 'SCHEMA_VALIDATION_FAILED',
      rawResponse, validationErrors: validation.errors
    });
    return createFailureResult('PARSE_ERROR', `Schema validation failed after ${attempt} attempt(s)`, {
      correlationId, startTime, proposal, rubric, latencyMs,
      validationErrors: validation.errors
    });
  }

  // Build successful result (FR-1, FR-2)
  const scores = {};
  for (const c of parsed.criteria) {
    const rubricCriterion = rubric.criteria.find(rc => rc.id === c.id);
    const weight = rubricCriterion?.weight || 0;

    scores[c.id] = {
      name: c.name,
      score: c.score,
      weight,
      weightedScore: (c.score / 100) * rubric.scoringScale.max * weight,
      summary: c.summary,
      reasoning: c.reasoning,
      evidence: c.evidence || [],
      improvements: c.improvements
    };
  }

  const result = {
    scores,
    totalScore: parsed.overall_score,
    rubricVersion: rubric.version || 'default-1.0',
    evaluatorVersion: EVALUATOR_VERSION,
    assessedAt: new Date().toISOString(),
    model,
    latencyMs,
    correlationId,
    attempt,
    weighting: parsed.weighting || null,
    status: 'SUCCESS',
    rawResponse
  };

  // Persist to audit_log (FR-3)
  await writeAuditLog(options.supabase, {
    correlationId, proposalId: proposal.id, model,
    status: 'SUCCESS', latencyMs,
    rawResponse
  });

  // Persist to leo_vetting_outcomes (FR-3)
  await writeVettingOutcome(options.supabase, {
    proposalId: proposal.id,
    feedbackId: proposal.feedback_id,
    rubricScore: parsed.overall_score,
    scores: result.scores,
    model,
    latencyMs,
    correlationId
  });

  return result;
}

/**
 * Create a failure result with consistent structure.
 */
function createFailureResult(status, message, ctx) {
  return {
    scores: {},
    totalScore: 0,
    rubricVersion: ctx.rubric?.version || 'default-1.0',
    evaluatorVersion: EVALUATOR_VERSION,
    assessedAt: new Date().toISOString(),
    model: 'none',
    latencyMs: Date.now() - ctx.startTime,
    correlationId: ctx.correlationId,
    status,
    error: message,
    errorCode: ctx.errorCode || status,
    validationErrors: ctx.validationErrors || null
  };
}

/**
 * Map provider errors to standard error codes (FR-5).
 */
function mapProviderError(err) {
  const msg = err.message || '';
  if (msg.includes('rate_limit') || err.status === 429) return 'RATE_LIMITED';
  if (err.status >= 500) return 'PROVIDER_SERVER_ERROR';
  if (err.status >= 400) return 'PROVIDER_CLIENT_ERROR';
  if (msg.includes('network') || msg.includes('ECONNREFUSED')) return 'NETWORK_ERROR';
  return 'UNKNOWN_ERROR';
}

/**
 * Write audit log entry (FR-3).
 */
async function writeAuditLog(supabase, data) {
  if (!supabase) return;

  try {
    await supabase.from('audit_log').insert({
      event_type: 'rubric_evaluation',
      severity: data.status === 'SUCCESS' ? 'info' : 'warning',
      source: 'rubric-evaluator',
      details: {
        correlation_id: data.correlationId,
        proposal_id: data.proposalId,
        evaluator_version: EVALUATOR_VERSION,
        model: data.model,
        latency_ms: data.latencyMs,
        status: data.status,
        error_code: data.errorCode || null,
        provider_request_id: data.providerRequestId || null,
        validation_errors: data.validationErrors || null,
        raw_response_length: data.rawResponse?.length || 0
      }
    });
  } catch (err) {
    console.warn(`[rubric-evaluator] Audit log write failed: ${err.message}`);
  }
}

/**
 * Write vetting outcome record (FR-3).
 */
async function writeVettingOutcome(supabase, data) {
  if (!supabase) return;

  try {
    await supabase.from('leo_vetting_outcomes').insert({
      proposal_id: data.proposalId || null,
      feedback_id: data.feedbackId || null,
      outcome: 'approved', // Will be overridden by caller based on threshold
      rubric_score: data.rubricScore,
      processing_time_ms: data.latencyMs,
      processed_by: 'rubric-evaluator-ai',
      metadata: {
        evaluator_version: EVALUATOR_VERSION,
        model: data.model,
        correlation_id: data.correlationId,
        per_criterion_scores: data.scores
      }
    });
  } catch (err) {
    console.warn(`[rubric-evaluator] Vetting outcome write failed: ${err.message}`);
  }
}

export { validateEvaluationSchema };
export default { evaluateWithAI, validateEvaluationSchema };
