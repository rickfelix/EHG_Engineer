/**
 * Child SD LLM Service
 * AI-powered strategic field generation for child Strategic Directives
 *
 * PURPOSE: Generate context-appropriate strategic_objectives, key_principles,
 * and success_criteria for child SDs using LLM inference instead of generic templates.
 *
 * ROOT CAUSE FIX: Child SDs were created with empty/generic strategic fields,
 * causing LEAD-TO-PLAN validation failures. This module uses AI to generate
 * appropriate fields based on the child's specific context.
 *
 * CONTEXT SOURCES (v2.0):
 * 1. Child SD full record (title, description, scope, rationale)
 * 2. Parent SD context (title, objectives, overall goal)
 * 3. Sibling SDs (other children in the orchestrator for sequence understanding)
 * 4. Similar completed SDs (pattern reference from successful implementations)
 *
 * Pattern follows: scripts/modules/prd-llm-service.mjs
 *
 * @module child-sd-llm-service
 * @version 2.0.0
 */

import { getLLMClient } from '../../lib/llm/client-factory.js';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// LLM CONFIGURATION
// =============================================================================

export const CHILD_SD_LLM_CONFIG = {
  model: 'gpt-4o',           // Production model for quality
  temperature: 0.5,          // Lower for structured, consistent output
  maxTokens: 4000,           // Sufficient for strategic fields JSON
  enabled: process.env.CHILD_SD_LLM_GENERATION !== 'false'
};

// =============================================================================
// QUALITY RUBRIC (Embedded in LLM prompts)
// =============================================================================

export const STRATEGIC_FIELDS_RUBRIC = `
## QUALITY CRITERIA FOR STRATEGIC FIELDS

### Strategic Objectives (CRITICAL - minimum 2 required)
- Must be SPECIFIC to this child SD's scope, NOT generic
- Must be MEASURABLE with concrete metrics
- Format: { "objective": "...", "metric": "..." }
- BAD: "Complete the work" - too vague
- GOOD: "Implement orchestrator completion hook with <5ms latency overhead"

### Key Principles (CRITICAL - minimum 2 required)
- Must provide ACTIONABLE constraints for implementation
- Should guide technical decisions
- Format: { "principle": "...", "description": "..." }
- BAD: "Write good code" - not actionable
- GOOD: "Fail-open design: Hook failures must not block SD completion"

### Success Criteria (minimum 3 required)
- Must be TESTABLE - yes/no verification possible
- Should cover different aspects: functionality, quality, integration
- Format: { "criterion": "...", "measure": "..." }
- BAD: "Works correctly" - not testable
- GOOD: "Hook fires exactly once per orchestrator completion (idempotent)"

### Success Metrics (minimum 3 required)
- Must have QUANTIFIABLE targets
- Should include unit of measurement
- Format: { "metric": "...", "target": <number>, "unit": "..." }
- BAD: "Good performance" - not quantifiable
- GOOD: { "metric": "Hook execution time", "target": 50, "unit": "milliseconds" }

### Smoke Test Steps (minimum 3 required)
- Must be USER-OBSERVABLE steps that prove value was delivered
- Answer: "What is the 30-second demo that proves this SD works?"
- Format: { "step_number": N, "instruction": "...", "expected_outcome": "..." }
- For database/infrastructure SDs, describe verification commands/queries
- BAD: "Check that it works" - not actionable
- GOOD: { "step_number": 1, "instruction": "Query the table", "expected_outcome": "Returns expected schema" }
`;

// =============================================================================
// LLM CLIENT (Factory-based)
// =============================================================================

/**
 * Check if LLM generation is available
 * Note: Factory handles client availability internally
 */
export function isLLMAvailable() {
  return CHILD_SD_LLM_CONFIG.enabled;
}

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

let supabaseClient = null;

/**
 * Get or create Supabase client for context fetching
 */
export function getSupabaseClient() {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      supabaseClient = createClient(url, key);
    }
  }
  return supabaseClient;
}

// =============================================================================
// ENHANCED CONTEXT FETCHING
// =============================================================================

/**
 * Fetch sibling SDs (other children of the same parent)
 * Provides orchestrator-level understanding of how this child fits in
 *
 * @param {string} parentSdId - Parent SD ID
 * @param {string} currentChildId - Current child's ID (to exclude)
 * @returns {Promise<Array>} Array of sibling SD summaries
 */
export async function fetchSiblingContext(parentSdId, currentChildId = null) {
  const supabase = getSupabaseClient();
  if (!supabase || !parentSdId) return [];

  try {
    let query = supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, description, scope, sd_type, status, metadata')
      .eq('parent_sd_id', parentSdId)
      .order('sd_key', { ascending: true });

    if (currentChildId) {
      query = query.neq('id', currentChildId);
    }

    const { data, error } = await query;

    if (error) {
      console.warn(`⚠️ Could not fetch siblings: ${error.message}`);
      return [];
    }

    return (data || []).map(sd => ({
      sd_key: sd.sd_key,
      title: sd.title,
      description: sd.description?.substring(0, 200) || '',
      scope: sd.scope?.substring(0, 200) || '',
      sd_type: sd.sd_type,
      status: sd.status,
      phase_number: sd.metadata?.phase_number
    }));
  } catch (err) {
    console.warn(`⚠️ Sibling fetch error: ${err.message}`);
    return [];
  }
}

/**
 * Fetch similar completed SDs for pattern reference
 * Finds SDs with similar sd_type that were successfully completed
 *
 * @param {string} sdType - SD type to match
 * @param {string} titleKeywords - Keywords from title to match
 * @param {number} limit - Max results
 * @returns {Promise<Array>} Array of similar completed SD patterns
 */
export async function fetchSimilarCompletedSDs(sdType, titleKeywords = '', limit = 3) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    // First try to find completed SDs of the same type
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, sd_type, strategic_objectives, key_principles, success_criteria, success_metrics, smoke_test_steps')
      .eq('status', 'completed')
      .eq('sd_type', sdType)
      .not('strategic_objectives', 'is', null)
      .order('completion_date', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn(`⚠️ Could not fetch similar SDs: ${error.message}`);
      return [];
    }

    // Filter to only include SDs with meaningful strategic fields
    const validSDs = (data || []).filter(sd =>
      sd.strategic_objectives?.length >= 2 &&
      sd.key_principles?.length >= 2
    );

    return validSDs.map(sd => ({
      sd_key: sd.sd_key,
      title: sd.title,
      sd_type: sd.sd_type,
      // Include actual field examples for pattern reference
      strategic_objectives_example: sd.strategic_objectives?.slice(0, 2),
      key_principles_example: sd.key_principles?.slice(0, 2),
      success_criteria_count: sd.success_criteria?.length || 0,
      success_metrics_count: sd.success_metrics?.length || 0,
      has_smoke_tests: (sd.smoke_test_steps?.length || 0) > 0
    }));
  } catch (err) {
    console.warn(`⚠️ Similar SD fetch error: ${err.message}`);
    return [];
  }
}

/**
 * Infer likely implementation scope from title/description
 * Uses keyword analysis to guess what files/modules might be involved
 *
 * @param {string} title - SD title
 * @param {string} description - SD description
 * @param {string} scope - SD scope
 * @returns {Object} Inferred implementation hints
 */
export function inferImplementationScope(title, description = '', scope = '') {
  const text = `${title} ${description} ${scope}`.toLowerCase();

  const hints = {
    likely_areas: [],
    technical_keywords: [],
    complexity_indicators: []
  };

  // Database-related
  if (text.match(/table|schema|migration|rls|postgres|supabase|column|index/)) {
    hints.likely_areas.push('database/migrations');
    hints.technical_keywords.push('SQL', 'schema design', 'data integrity');
  }

  // API-related
  if (text.match(/api|endpoint|route|rest|graphql|controller/)) {
    hints.likely_areas.push('API endpoints');
    hints.technical_keywords.push('request handling', 'validation', 'response format');
  }

  // UI-related
  if (text.match(/ui|component|form|page|dashboard|button|modal|display|show/)) {
    hints.likely_areas.push('frontend components');
    hints.technical_keywords.push('React', 'user interaction', 'state management');
  }

  // CLI/Script-related
  if (text.match(/command|cli|script|tool|handoff|leo|automation/)) {
    hints.likely_areas.push('scripts/modules');
    hints.technical_keywords.push('Node.js', 'CLI design', 'error handling');
  }

  // Testing-related
  if (text.match(/test|e2e|playwright|jest|coverage|qa/)) {
    hints.likely_areas.push('tests');
    hints.technical_keywords.push('test scenarios', 'assertions', 'coverage');
  }

  // Complexity indicators
  if (text.match(/refactor|migrate|restructure/)) hints.complexity_indicators.push('refactoring');
  if (text.match(/integrat|connect|sync/)) hints.complexity_indicators.push('integration');
  if (text.match(/multi|batch|bulk/)) hints.complexity_indicators.push('batch processing');
  if (text.match(/real-?time|live|stream/)) hints.complexity_indicators.push('real-time');

  return hints;
}

// =============================================================================
// STRATEGIC FIELDS GENERATION
// =============================================================================

/**
 * Generate strategic fields for a child SD using LLM
 * Enhanced with sibling context and similar SD patterns
 *
 * @param {Object} childContext - Child SD context
 * @param {string} childContext.id - Child SD ID
 * @param {string} childContext.title - Child SD title
 * @param {string} childContext.description - Child SD description
 * @param {string} childContext.scope - Child SD scope
 * @param {string} childContext.sd_type - SD type (feature, infrastructure, etc.)
 * @param {string} childContext.rationale - Child SD rationale
 * @param {Object} parentContext - Parent SD context (optional)
 * @param {string} parentContext.id - Parent SD ID
 * @param {string} parentContext.title - Parent SD title
 * @param {string} parentContext.description - Parent SD description
 * @param {Array} parentContext.strategic_objectives - Parent objectives (if any)
 * @param {Object} options - Generation options
 * @param {boolean} options.fetchEnhancedContext - Whether to fetch sibling/similar SDs (default: true)
 * @returns {Promise<Object|null>} Generated strategic fields or null on failure
 */
export async function generateStrategicFieldsWithLLM(childContext, parentContext = {}, options = {}) {
  const { fetchEnhancedContext = true } = options;

  if (!isLLMAvailable()) {
    console.log('⚠️ Child SD LLM generation disabled');
    return null;
  }

  // Get LLM client from factory (handles authentication and model selection)
  const llmClient = await getLLMClient({
    purpose: 'child-sd-strategic-fields',
    phase: 'LEAD'
  });

  if (!llmClient) {
    console.log('⚠️ LLM client not available');
    return null;
  }

  // Fetch enhanced context if enabled
  let siblings = [];
  let similarSDs = [];

  if (fetchEnhancedContext) {
    // Fetch sibling SDs for orchestrator context
    if (parentContext.id) {
      siblings = await fetchSiblingContext(parentContext.id, childContext.id);
    }

    // Fetch similar completed SDs for pattern reference
    if (childContext.sd_type) {
      similarSDs = await fetchSimilarCompletedSDs(childContext.sd_type, childContext.title, 3);
    }
  }

  // Infer implementation scope from title/description
  const implementationHints = inferImplementationScope(
    childContext.title,
    childContext.description,
    childContext.scope
  );

  const contextStr = buildChildSDContext(childContext, parentContext, {
    siblings,
    similarSDs,
    implementationHints
  });

  // Get type-specific guidance
  const sdType = childContext.sd_type || 'implementation';
  const typeGuidance = getSDTypeGuidance(sdType);

  const systemPrompt = `You are a strategic planning expert creating Strategic Directive (SD) fields for a software development workflow.

${STRATEGIC_FIELDS_RUBRIC}

CRITICAL INSTRUCTIONS:
1. Generate fields SPECIFIC to this child SD's scope - NOT generic templates
2. All objectives must be MEASURABLE with concrete metrics
3. All criteria must be TESTABLE
4. All metrics must have QUANTIFIABLE targets
5. Output valid JSON format only
6. SD TYPE IS "${sdType.toUpperCase()}" - tailor ALL fields to this type

## SD TYPE-SPECIFIC GUIDANCE FOR "${sdType.toUpperCase()}"
${typeGuidance}

## SMOKE TEST REQUIREMENTS BY SD TYPE
- database: SQL queries that verify tables/columns exist, constraints work
- api: curl/HTTP requests that verify endpoints respond correctly
- feature: User actions in the UI that verify functionality works
- infrastructure: Commands that verify services are running, configs applied
- security: Tests that verify unauthorized access is blocked
- testing: Meta-tests that verify test suite runs and passes
- refactor: Before/after comparisons that verify behavior unchanged`;

  const userPrompt = `Generate strategic fields for this child Strategic Directive:

${contextStr}

Return a JSON object with these exact fields:
{
  "strategic_objectives": [
    { "objective": "Specific objective for this SD", "metric": "How to measure completion" },
    { "objective": "Second objective", "metric": "Measurement method" }
  ],
  "key_principles": [
    { "principle": "Principle name", "description": "Why this matters for implementation" },
    { "principle": "Second principle", "description": "Implementation guidance" }
  ],
  "success_criteria": [
    { "criterion": "Testable criterion", "measure": "Pass/fail method" },
    { "criterion": "Second criterion", "measure": "Verification method" },
    { "criterion": "Third criterion", "measure": "How to verify" }
  ],
  "success_metrics": [
    { "metric": "Quantifiable metric name", "target": 95, "unit": "percent" },
    { "metric": "Second metric", "target": 0, "unit": "count" },
    { "metric": "Third metric", "target": 100, "unit": "milliseconds" }
  ],
  "smoke_test_steps": [
    { "step_number": 1, "instruction": "Action to perform", "expected_outcome": "What should happen" },
    { "step_number": 2, "instruction": "Second action", "expected_outcome": "Expected result" },
    { "step_number": 3, "instruction": "Third action", "expected_outcome": "Verification of value" }
  ],
  "risks": [
    { "risk": "Potential risk description", "severity": "HIGH|MEDIUM|LOW", "mitigation": "How to mitigate" }
  ]
}

CRITICAL: This is a "${sdType.toUpperCase()}" SD. Generate content SPECIFIC to "${childContext.title}".
- Smoke tests MUST be appropriate for ${sdType} type (e.g., SQL queries for database, curl for API)
- Avoid generic placeholders - be concrete and actionable.`;

  try {
    console.log(`🤖 Generating strategic fields for: ${childContext.title}...`);

    const response = await llmClient.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: CHILD_SD_LLM_CONFIG.temperature,
      max_completion_tokens: CHILD_SD_LLM_CONFIG.maxTokens,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log('⚠️ No content in LLM response');
      return null;
    }

    const parsed = JSON.parse(content);

    // Validate required fields are present and non-empty
    const validation = validateGeneratedFields(parsed);
    if (!validation.valid) {
      console.log(`⚠️ Generated fields validation failed: ${validation.errors.join(', ')}`);
      return null;
    }

    console.log(`✅ Strategic fields generated for: ${childContext.title}`);
    return parsed;
  } catch (error) {
    console.error(`❌ LLM strategic fields generation failed: ${error.message}`);
    return null;
  }
}

/**
 * Build context string for child SD generation
 */
/**
 * Build comprehensive context string for child SD generation
 *
 * @param {Object} childContext - Child SD data
 * @param {Object} parentContext - Parent SD data
 * @param {Object} enhancedContext - Additional context from database queries
 * @param {Array} enhancedContext.siblings - Other child SDs in the orchestrator
 * @param {Array} enhancedContext.similarSDs - Completed SDs of same type for patterns
 * @param {Object} enhancedContext.implementationHints - Inferred implementation scope
 */
export function buildChildSDContext(childContext, parentContext = {}, enhancedContext = {}) {
  const { siblings = [], similarSDs = [], implementationHints = {} } = enhancedContext;
  const sections = [];

  // 1. Child SD context (primary)
  sections.push(`## CHILD SD CONTEXT (Generate fields for THIS SD)

**Title**: ${childContext.title || 'Untitled'}
**Description**: ${childContext.description || 'No description'}
**Scope**: ${childContext.scope || 'No scope defined'}
**Rationale**: ${childContext.rationale || 'Part of parent orchestrator'}
**SD Type**: ${childContext.sd_type || 'implementation'}
**Phase Number**: ${childContext.phaseNumber || 'N/A'}`);

  // 2. Parent context (for alignment)
  if (parentContext.title) {
    sections.push(`## PARENT ORCHESTRATOR CONTEXT

**Parent Title**: ${parentContext.title}
**Parent Description**: ${parentContext.description || 'No description'}
**Parent Goal**: ${parentContext.strategic_objectives?.[0]?.objective || parentContext.rationale || 'Complete parent SD objectives'}

This child SD contributes to the parent's overall objective. Fields should SUPPORT the parent goal while being SPECIFIC to this child's scope.`);
  }

  // 3. Sibling context (orchestrator-level understanding)
  if (siblings.length > 0) {
    const siblingList = siblings.map(s => {
      const status = s.status === 'completed' ? '✅' : s.status === 'in_progress' ? '🔄' : '⏳';
      return `- ${status} ${s.sd_key}: ${s.title} (${s.sd_type || 'implementation'})`;
    }).join('\n');

    sections.push(`## SIBLING SDs IN THIS ORCHESTRATOR (${siblings.length} others)

These are the other child SDs in the same orchestrator. Understanding the sequence helps generate appropriate fields.

${siblingList}

NOTE: This child should have DISTINCT objectives from siblings while contributing to the shared parent goal.`);
  }

  // 4. Similar completed SDs (pattern reference)
  if (similarSDs.length > 0) {
    const patternExamples = similarSDs.map(sd => {
      const objExample = sd.strategic_objectives_example?.[0];
      const prinExample = sd.key_principles_example?.[0];
      return `### ${sd.sd_key}: ${sd.title}
- Example objective: "${objExample?.objective || 'N/A'}" (metric: ${objExample?.metric || 'N/A'})
- Example principle: "${prinExample?.principle || 'N/A'}"
- Had ${sd.success_criteria_count} success criteria, ${sd.success_metrics_count} metrics
- ${sd.has_smoke_tests ? 'Had smoke tests defined' : 'No smoke tests'}`;
    }).join('\n\n');

    sections.push(`## SIMILAR COMPLETED SDs FOR PATTERN REFERENCE

These are successfully completed SDs of the same type (${childContext.sd_type}). Use as quality reference.

${patternExamples}

Learn from these patterns but generate UNIQUE content for THIS SD.`);
  }

  // 5. Implementation hints (inferred scope)
  if (implementationHints.likely_areas?.length > 0 || implementationHints.technical_keywords?.length > 0) {
    sections.push(`## INFERRED IMPLEMENTATION SCOPE

Based on the title and description, this SD likely involves:
- **Areas**: ${implementationHints.likely_areas?.join(', ') || 'General'}
- **Technical aspects**: ${implementationHints.technical_keywords?.join(', ') || 'Standard implementation'}
${implementationHints.complexity_indicators?.length > 0 ? `- **Complexity factors**: ${implementationHints.complexity_indicators.join(', ')}` : ''}

Use this to generate relevant smoke tests and success criteria.`);
  }

  // 6. SD type guidance
  const typeGuidance = getSDTypeGuidance(childContext.sd_type);
  if (typeGuidance) {
    sections.push(`## SD TYPE GUIDANCE (${(childContext.sd_type || 'implementation').toUpperCase()})

${typeGuidance}`);
  }

  return sections.join('\n\n');
}

/**
 * Get guidance specific to SD type
 */
function getSDTypeGuidance(sdType) {
  const guidance = {
    feature: `This is a FEATURE SD. Focus on:
- User-facing functionality delivery
- UI/UX considerations if applicable
- Integration with existing features
- Quality metrics (test coverage, code review)`,

    infrastructure: `This is an INFRASTRUCTURE SD. Focus on:
- Reliability and uptime requirements
- Performance benchmarks
- Backward compatibility (no breaking changes)
- Deployment and rollback procedures`,

    database: `This is a DATABASE SD. Focus on:
- Schema correctness and data integrity
- Migration safety (up AND down migrations)
- RLS policies if user data is involved
- Index design for query performance
- Backward compatibility with existing queries
- Smoke tests: SQL queries that verify the schema exists and works`,

    api: `This is an API SD. Focus on:
- Endpoint design and RESTful conventions
- Request/response validation
- Authentication and authorization
- Error handling and status codes
- API documentation (OpenAPI/Swagger)
- Smoke tests: curl/fetch commands that verify endpoints respond`,

    security: `This is a SECURITY SD. Focus on:
- Threat model and attack vectors addressed
- Authentication/authorization correctness
- Input validation and sanitization
- Audit logging for security events
- Principle of least privilege
- Smoke tests: verify unauthorized access is blocked`,

    documentation: `This is a DOCUMENTATION SD. Focus on:
- Coverage completeness
- Accuracy verification
- Accessibility and findability
- Maintenance sustainability`,

    testing: `This is a TESTING SD. Focus on:
- Test coverage targets
- Test reliability (flakiness)
- Regression prevention
- CI/CD integration`,

    refactor: `This is a REFACTOR SD. Focus on:
- NO BEHAVIOR CHANGES (critical)
- Code quality improvements
- Technical debt reduction
- Baseline capture and comparison`,

    bugfix: `This is a BUGFIX SD. Focus on:
- Root cause addressed (not just symptoms)
- Regression test added
- Related areas checked
- Quick resolution`,

    orchestrator: `This is an ORCHESTRATOR SD (parent of child SDs). Focus on:
- Overall goal coordination across children
- Phase transition dependencies
- Child SD sequencing and blocking
- Aggregated success criteria from children`,

    implementation: `This is an IMPLEMENTATION SD (general). Focus on:
- Clear deliverables and acceptance criteria
- Code quality and maintainability
- Test coverage for new code
- Integration with existing systems`
  };

  return guidance[sdType] || guidance.implementation;
}

/**
 * Validate generated strategic fields meet requirements
 */
export function validateGeneratedFields(fields) {
  const errors = [];

  // Check strategic_objectives (min 2)
  if (!fields.strategic_objectives || !Array.isArray(fields.strategic_objectives)) {
    errors.push('Missing strategic_objectives array');
  } else if (fields.strategic_objectives.length < 2) {
    errors.push(`Insufficient strategic_objectives: ${fields.strategic_objectives.length}/2 minimum`);
  } else {
    fields.strategic_objectives.forEach((obj, i) => {
      if (!obj.objective || obj.objective.length < 10) {
        errors.push(`strategic_objectives[${i}].objective too short or missing`);
      }
    });
  }

  // Check key_principles (min 2)
  if (!fields.key_principles || !Array.isArray(fields.key_principles)) {
    errors.push('Missing key_principles array');
  } else if (fields.key_principles.length < 2) {
    errors.push(`Insufficient key_principles: ${fields.key_principles.length}/2 minimum`);
  }

  // Check success_criteria (min 3)
  if (!fields.success_criteria || !Array.isArray(fields.success_criteria)) {
    errors.push('Missing success_criteria array');
  } else if (fields.success_criteria.length < 3) {
    errors.push(`Insufficient success_criteria: ${fields.success_criteria.length}/3 minimum`);
  }

  // Check success_metrics (min 3)
  if (!fields.success_metrics || !Array.isArray(fields.success_metrics)) {
    errors.push('Missing success_metrics array');
  } else if (fields.success_metrics.length < 3) {
    errors.push(`Insufficient success_metrics: ${fields.success_metrics.length}/3 minimum`);
  } else {
    fields.success_metrics.forEach((m, i) => {
      if (m.target === undefined || m.target === null) {
        errors.push(`success_metrics[${i}].target is missing`);
      }
    });
  }

  // Check smoke_test_steps (min 3)
  if (!fields.smoke_test_steps || !Array.isArray(fields.smoke_test_steps)) {
    errors.push('Missing smoke_test_steps array');
  } else if (fields.smoke_test_steps.length < 3) {
    errors.push(`Insufficient smoke_test_steps: ${fields.smoke_test_steps.length}/3 minimum`);
  } else {
    fields.smoke_test_steps.forEach((step, i) => {
      if (!step.instruction || step.instruction.length < 5) {
        errors.push(`smoke_test_steps[${i}].instruction too short or missing`);
      }
      if (!step.expected_outcome || step.expected_outcome.length < 5) {
        errors.push(`smoke_test_steps[${i}].expected_outcome too short or missing`);
      }
    });
  }

  // risks can be empty array (valid for low-risk SDs)
  if (!fields.risks) {
    fields.risks = [];
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Enrich an existing child SD with LLM-generated strategic fields
 * Use this to fix existing child SDs that have empty/generic fields
 *
 * @param {Object} childSD - Existing child SD from database
 * @param {Object} parentSD - Parent SD from database (optional)
 * @returns {Promise<Object>} Updated strategic fields to merge
 */
export async function enrichChildSDWithLLM(childSD, parentSD = null) {
  const childContext = {
    id: childSD.id,
    title: childSD.title,
    description: childSD.description,
    scope: childSD.scope,
    rationale: childSD.rationale,
    sd_type: childSD.sd_type,
    phaseNumber: childSD.metadata?.phase_number
  };

  const parentContext = parentSD ? {
    id: parentSD.id,
    title: parentSD.title,
    description: parentSD.description,
    strategic_objectives: parentSD.strategic_objectives,
    rationale: parentSD.rationale
  } : {};

  const generated = await generateStrategicFieldsWithLLM(childContext, parentContext);

  if (!generated) {
    console.log(`⚠️ Could not generate fields for ${childSD.sd_key || childSD.id}`);
    return null;
  }

  return {
    strategic_objectives: generated.strategic_objectives,
    key_principles: generated.key_principles,
    success_criteria: generated.success_criteria,
    success_metrics: generated.success_metrics,
    smoke_test_steps: generated.smoke_test_steps || [],
    risks: generated.risks || []
  };
}

/**
 * Batch enrich multiple child SDs
 * Useful for fixing existing incomplete children
 *
 * @param {Array} childSDs - Array of child SDs to enrich
 * @param {Object} parentSD - Parent SD
 * @returns {Promise<Array>} Array of { sd_id, fields, error } results
 */
export async function batchEnrichChildSDs(childSDs, parentSD) {
  const results = [];

  for (const childSD of childSDs) {
    try {
      const fields = await enrichChildSDWithLLM(childSD, parentSD);
      results.push({
        sd_id: childSD.id,
        sd_key: childSD.sd_key,
        fields,
        success: fields !== null,
        error: fields ? null : 'LLM generation failed'
      });
    } catch (error) {
      results.push({
        sd_id: childSD.id,
        sd_key: childSD.sd_key,
        fields: null,
        success: false,
        error: error.message
      });
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return results;
}

export default {
  CHILD_SD_LLM_CONFIG,
  STRATEGIC_FIELDS_RUBRIC,
  isLLMAvailable,
  generateStrategicFieldsWithLLM,
  buildChildSDContext,
  validateGeneratedFields,
  enrichChildSDWithLLM,
  batchEnrichChildSDs
};
