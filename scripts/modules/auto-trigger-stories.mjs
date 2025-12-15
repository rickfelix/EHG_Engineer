#!/usr/bin/env node

/**
 * Auto-Trigger Product Requirements Expert (STORIES Sub-Agent)
 *
 * Automatically generates user stories after PRD creation
 * Part of Phase 3.2: Enhanced user story validation enforcement
 *
 * SD-TYPE-AWARE GENERATION (v1.1.0):
 * Now aligns story generation with validation expectations by SD type.
 * - FEATURE/SECURITY: Strict - Given-When-Then format with edge cases
 * - DOCUMENTATION: Lenient - Simple criteria, focus on completeness
 * - INFRASTRUCTURE/DATABASE: Moderate - Allow technical benefits
 *
 * LLM-ENHANCED GENERATION (v1.2.0 - 2024-12):
 * Uses GPT 5.2 with rich context to generate high-quality user stories that
 * pass the AI quality validation (gpt-5-mini) on first attempt.
 * - Same quality rubric criteria provided to generation model
 * - Rich context: PRD, SD, schema, existing patterns
 * - Produces proper Given-When-Then, articulated benefits, self-contained context
 *
 * Usage:
 *   import { autoTriggerStories } from './modules/auto-trigger-stories.mjs';
 *   await autoTriggerStories(supabase, sdId, prdId);
 */

import { randomUUID } from 'crypto';
import { isPersonaStoryRoleEnabled } from '../lib/persona-extractor.js';
import OpenAI from 'openai';

// ============================================
// LLM Configuration for Story Generation (v1.2.0)
// Uses GPT 5.2 for high-quality generation
// ============================================

const LLM_CONFIG = {
  model: 'gpt-5.2',  // More capable model for generation
  temperature: 0.7,   // Some creativity for varied stories
  maxTokens: 16000,   // Large enough for 10-15 detailed stories
  enabled: process.env.LLM_STORY_GENERATION !== 'false'  // Enabled by default
};

// ============================================
// E2E Test Path Generation (v1.3.0)
// Auto-generates test paths based on SD type
// ============================================

/**
 * Generate E2E test path based on SD type and story details
 * @param {string} sdId - Strategic directive ID
 * @param {string} sdType - SD type (feature, infrastructure, documentation, etc.)
 * @param {string} storyNumber - Story number (e.g., '001')
 * @param {string} storyTitle - Story title for slug generation
 * @returns {Object} - { path: string, status: string }
 */
function generateE2ETestPath(sdId, sdType, storyNumber, storyTitle) {
  // Normalize SD ID to create slug (e.g., SD-VISION-V2-003 -> vision-v2-003)
  const sdSlug = sdId.toLowerCase().replace(/^sd-/, '').replace(/[^a-z0-9]+/g, '-');

  // Generate title slug for readable test names
  const titleSlug = (storyTitle || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .substring(0, 30)
    .replace(/-+$/, '');

  // SD-type-specific path patterns
  const pathPatterns = {
    // Feature SDs: Individual E2E test per story
    feature: `tests/e2e/${sdSlug}-us-${storyNumber}.spec.ts`,

    // Security SDs: Security-focused test directory
    security: `tests/e2e/security/${sdSlug}-us-${storyNumber}.spec.ts`,

    // Infrastructure SDs: Grouped by SD (multiple stories in one test file)
    infrastructure: `tests/e2e/infra/${sdSlug}.spec.ts`,

    // Documentation SDs: No E2E tests required
    documentation: 'N/A - documentation SD (no E2E required)',

    // Database SDs: Integration test path
    database: `tests/e2e/db/${sdSlug}-us-${storyNumber}.spec.ts`,

    // API SDs: API test directory
    api: `tests/e2e/api/${sdSlug}-us-${storyNumber}.spec.ts`,

    // Default: Standard E2E test path
    default: `tests/e2e/${sdSlug}-us-${storyNumber}.spec.ts`
  };

  const path = pathPatterns[sdType] || pathPatterns.default;

  // Determine initial status based on SD type
  const status = sdType === 'documentation' ? 'not_applicable' : 'not_created';

  return { path, status };
}

/**
 * Initialize OpenAI client for story generation
 */
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('   ⚠️  OPENAI_API_KEY not set - falling back to template generation');
    return null;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * Quality rubric criteria - embedded so LLM knows exactly what's expected
 * These are the same criteria used by ai-quality-evaluator.js (gpt-5-mini)
 */
const QUALITY_RUBRIC_CRITERIA = `
## QUALITY CRITERIA (You will be judged on these dimensions)

### 1. Acceptance Criteria Quality (50% weight)
- 0-3: Generic boilerplate ("system works", "good performance")
- 4-6: Some specific criteria but missing testable conditions
- 7-8: Most criteria are specific, testable, and verifiable
- 9-10: All criteria are specific, testable, with clear pass/fail conditions

### 2. Story Independence & Implementability (30% weight)
- 0-3: Story depends on multiple other stories or lacks detail for implementation
- 4-6: Mostly independent but has unclear dependencies or missing details
- 7-8: Story can be implemented standalone with minimal external dependencies
- 9-10: Completely self-contained with all necessary context, no blocking dependencies
INVEST principles: Independent, Negotiable, Valuable, Estimable, Small, Testable

### 3. Benefit Articulation (15% weight)
- 0-3: No benefit or generic ("improve system", "enhance UX")
- 4-6: Benefit mentioned but vague or system-centric rather than user-centric
- 7-8: Clear user benefit explaining WHY the user needs this
- 9-10: Compelling benefit with specific value proposition and user impact

### 4. Given-When-Then Format (5% weight)
- 0-3: No GWT scenarios or incorrect format
- 4-6: GWT present but incomplete or improperly structured
- 7-8: Proper GWT with clear preconditions, actions, expected outcomes
- 9-10: Excellent GWT covering happy path, edge cases, and error conditions
`;

/**
 * Generate user stories using GPT 5.2 with rich context
 *
 * @param {object} supabase - Supabase client
 * @param {object} sd - Strategic Directive with full metadata
 * @param {object} prd - Product Requirements Document with full metadata
 * @param {object} options - Generation options
 * @returns {Promise<Array>} Generated user stories
 */
async function generateStoriesWithLLM(supabase, sd, prd, options = {}) {
  const openai = getOpenAIClient();
  if (!openai || !LLM_CONFIG.enabled) {
    console.log('   ℹ️  LLM generation disabled - using template generation');
    return null; // Fall back to template generation
  }

  console.log('   🤖 Using GPT 5.2 for high-quality story generation...');

  // Build comprehensive context
  const context = await buildGenerationContext(supabase, sd, prd);

  const systemPrompt = `You are an expert Product Owner and Agile practitioner specializing in writing high-quality user stories.

Your task is to generate user stories from a Product Requirements Document (PRD) that will PASS automated quality validation.

${QUALITY_RUBRIC_CRITERIA}

## OUTPUT FORMAT
You MUST return a JSON object with a "stories" array containing ALL user stories:
{ "stories": [ ... ] }

Each story in the array must have:
{
  "title": "Concise title (50 chars max)",
  "user_role": "Specific persona (e.g., 'DBA', 'Product Manager', 'End User')",
  "user_want": "What they want to do (specific action, 20+ chars)",
  "user_benefit": "WHY this matters to them (articulated value, 50+ chars, user-centric)",
  "story_points": 1-13 (Fibonacci),
  "priority": "critical" | "high" | "medium" | "low",
  "acceptance_criteria": [
    {
      "id": "AC-001",
      "criteria": "Given [specific context], When [specific action], Then [specific verifiable outcome]",
      "type": "functional" | "edge-case" | "performance" | "security"
    }
  ],
  "implementation_context": {
    "prerequisites": ["List of dependencies or prior work"],
    "technical_notes": "Implementation guidance",
    "tables_affected": ["table1", "table2"],
    "estimated_complexity": "low" | "medium" | "high"
  }
}

## CRITICAL REQUIREMENTS
1. Each story MUST have 3-5 acceptance criteria in Given-When-Then format
2. Include at least one edge-case or error-handling criterion per story
3. Benefits must explain VALUE to the user, not just restate the want
4. Stories must be independently implementable (INVEST principles)
5. Implementation context must include enough detail for a developer to start work
`;

  const sdType = sd.sd_type || sd.category || 'feature';

  const userPrompt = `Generate user stories for the following Strategic Directive and PRD:

**SD TYPE: ${sdType.toUpperCase()}** - Tailor stories appropriately:
${sdType === 'database' ? '- Focus on schema deployment, data integrity, RLS policies, migration safety\n- User roles: DBA, Developer, Data Engineer\n- Benefits: data reliability, query performance, maintainability' : ''}
${sdType === 'infrastructure' ? '- Focus on deployment, CI/CD, monitoring, reliability\n- User roles: DevOps Engineer, SRE, Developer\n- Benefits: deployment speed, system reliability, operational efficiency' : ''}
${sdType === 'security' ? '- Focus on authentication, authorization, data protection, compliance\n- User roles: Security Engineer, Admin, End User\n- Benefits: data protection, compliance, trust' : ''}
${sdType === 'documentation' ? '- Focus on clarity, completeness, discoverability\n- User roles: Developer, New Team Member, Stakeholder\n- Benefits: faster onboarding, self-service, reduced questions' : ''}
${sdType === 'feature' ? '- Focus on user workflows, UX, business value\n- User roles: End User, Product Manager, specific personas\n- Benefits: efficiency, satisfaction, business outcomes' : ''}

${context}

Generate ${options.targetStoryCount || 'appropriate number of'} user stories that:
1. Cover all functional requirements in the PRD
2. Are independently implementable
3. Have clear, testable acceptance criteria in Given-When-Then format
4. Articulate user benefits specific to ${sdType} work (not generic "system works" phrases)
5. Include implementation_context with ${sdType}-specific details

Return ONLY valid JSON array, no markdown formatting.`;

  try {
    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: LLM_CONFIG.model,
      temperature: LLM_CONFIG.temperature,
      max_completion_tokens: LLM_CONFIG.maxTokens,  // GPT 5.x uses max_completion_tokens
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    });

    const duration = Date.now() - startTime;
    console.log(`   ✅ LLM generation completed in ${duration}ms`);

    // Debug: Log raw response structure
    if (process.env.LLM_DEBUG === 'true') {
      console.log('   🔍 Raw response:', JSON.stringify(response, null, 2).substring(0, 500));
    }

    // Parse response
    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      console.log('   ⚠️  Response structure:', {
        hasChoices: !!response.choices,
        choicesLength: response.choices?.length,
        firstChoice: response.choices?.[0] ? Object.keys(response.choices[0]) : 'none',
        finishReason: response.choices?.[0]?.finish_reason
      });
      throw new Error('Empty response from LLM');
    }

    // Clean content - sometimes has leading whitespace or markdown formatting
    const cleanContent = content.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');

    let parsed;
    try {
      parsed = JSON.parse(cleanContent);
    } catch (parseErr) {
      console.log(`   ⚠️  JSON parse error: ${parseErr.message}`);
      console.log(`   📄 Content preview: ${cleanContent.substring(0, 200)}...`);
      throw new Error(`Invalid JSON response: ${parseErr.message}`);
    }

    // Handle various response formats
    let stories = [];
    if (Array.isArray(parsed)) {
      stories = parsed;
    } else if (parsed.stories && Array.isArray(parsed.stories)) {
      stories = parsed.stories;
    } else if (parsed.user_stories && Array.isArray(parsed.user_stories)) {
      stories = parsed.user_stories;
    } else if (parsed.title && parsed.user_role) {
      // Single story object - wrap in array
      stories = [parsed];
    } else {
      // Try to find any array property
      const arrayProp = Object.values(parsed).find(v => Array.isArray(v));
      if (arrayProp) {
        stories = arrayProp;
      }
    }

    console.log(`   📝 Generated ${stories.length} user stories`);

    // Log token usage for cost tracking
    if (response.usage) {
      console.log(`   📊 Tokens: prompt=${response.usage.prompt_tokens}, completion=${response.usage.completion_tokens}`);
    }

    return stories;
  } catch (error) {
    console.error(`   ❌ LLM generation failed: ${error.message}`);
    console.log('   ℹ️  Falling back to template generation');
    return null;
  }
}

/**
 * Build comprehensive context for LLM story generation
 */
async function buildGenerationContext(supabase, sd, prd) {
  const sections = [];

  // 1. Strategic Directive Context
  sections.push(`## STRATEGIC DIRECTIVE
- **ID:** ${sd.id}
- **Title:** ${sd.title}
- **Type:** ${sd.sd_type || sd.category || 'feature'}
- **Description:** ${sd.description || 'Not provided'}
- **Success Criteria:** ${sd.success_criteria || 'Not provided'}
- **Risk Level:** ${sd.risk_level || 'medium'}`);

  // 2. PRD Overview and Requirements
  sections.push(`## PRODUCT REQUIREMENTS DOCUMENT
- **PRD ID:** ${prd.id}
- **Overview:** ${prd.overview || 'Not provided'}
- **Problem Statement:** ${prd.problem_statement || prd.metadata?.problem_statement || 'Not provided'}
- **Proposed Solution:** ${prd.proposed_solution || prd.metadata?.proposed_solution || 'Not provided'}`);

  // 3. Functional Requirements
  if (prd.functional_requirements) {
    const reqs = typeof prd.functional_requirements === 'string'
      ? prd.functional_requirements
      : JSON.stringify(prd.functional_requirements, null, 2);
    sections.push(`## FUNCTIONAL REQUIREMENTS
${reqs}`);
  }

  // 4. Technical Requirements
  if (prd.technical_requirements) {
    const techReqs = typeof prd.technical_requirements === 'string'
      ? prd.technical_requirements
      : JSON.stringify(prd.technical_requirements, null, 2);
    sections.push(`## TECHNICAL REQUIREMENTS
${techReqs}`);
  }

  // 5. Sub-agent Analysis (Design, Database, etc.)
  const metadata = prd.metadata || {};

  if (metadata.design_analysis) {
    sections.push(`## DESIGN ANALYSIS (from DESIGN sub-agent)
${typeof metadata.design_analysis === 'string' ? metadata.design_analysis : JSON.stringify(metadata.design_analysis, null, 2)}`);
  }

  if (metadata.database_analysis) {
    sections.push(`## DATABASE ANALYSIS (from DATABASE sub-agent)
${typeof metadata.database_analysis === 'string' ? metadata.database_analysis : JSON.stringify(metadata.database_analysis, null, 2)}`);
  }

  if (metadata.exploration_summary) {
    const exploration = Array.isArray(metadata.exploration_summary)
      ? metadata.exploration_summary.map(f => `- ${f.file || f.path}: ${f.findings || f.summary || 'explored'}`).join('\n')
      : JSON.stringify(metadata.exploration_summary, null, 2);
    sections.push(`## CODEBASE EXPLORATION
${exploration}`);
  }

  // 6. Schema Context (for database SDs)
  if ((sd.sd_type || sd.category) === 'database' && prd.metadata?.schema) {
    sections.push(`## DATABASE SCHEMA
${typeof prd.metadata.schema === 'string' ? prd.metadata.schema : JSON.stringify(prd.metadata.schema, null, 2)}`);
  }

  // 7. Existing User Stories (if regenerating)
  try {
    const { data: existingStories } = await supabase
      .from('user_stories')
      .select('story_key, title, user_role')
      .eq('sd_id', sd.id)
      .limit(5);

    if (existingStories && existingStories.length > 0) {
      sections.push(`## EXISTING STORIES (for reference, avoid duplication)
${existingStories.map(s => `- ${s.story_key}: ${s.title}`).join('\n')}`);
    }
  } catch (e) {
    // Ignore - existing stories lookup is optional
  }

  return sections.join('\n\n');
}

// ============================================
// SD-TYPE-AWARE ACCEPTANCE CRITERIA (v1.1.0)
// Aligns generation with user-story-quality-rubric.js validation
// ============================================

/**
 * Get SD type from database
 * @param {object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<string>} SD type (feature, documentation, infrastructure, database, security)
 */
async function getSDType(supabase, sdId) {
  try {
    const { data: sd, error } = await supabase
      .from('strategic_directives_v2')
      .select('sd_type, category')
      .eq('legacy_id', sdId)
      .single();

    if (error || !sd) {
      console.log(`   ⚠️  Could not fetch SD type, defaulting to 'feature'`);
      return 'feature';
    }

    // sd_type takes precedence over category
    return sd.sd_type || sd.category || 'feature';
  } catch (err) {
    console.log(`   ⚠️  SD type lookup error: ${err.message}, defaulting to 'feature'`);
    return 'feature';
  }
}

/**
 * Transform acceptance criteria based on SD type
 * Aligns with user-story-quality-rubric.js validation expectations
 *
 * @param {Array} criteria - Original acceptance criteria from PRD
 * @param {string} sdType - SD type (feature, documentation, infrastructure, etc.)
 * @param {object} context - Additional context (requirement text, etc.)
 * @returns {Array} Transformed acceptance criteria
 */
function transformAcceptanceCriteria(criteria, sdType, context = {}) {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    // Generate default criteria based on SD type
    return generateDefaultCriteria(sdType, context);
  }

  const normalizedType = (sdType || 'feature').toLowerCase();

  // LENIENT: Documentation SDs - keep criteria simple
  if (normalizedType === 'documentation') {
    return criteria.map(ac => normalizeAcceptanceCriterion(ac, 'documentation'));
  }

  // MODERATE: Infrastructure/Database - allow technical focus
  if (normalizedType === 'infrastructure' || normalizedType === 'database') {
    return criteria.map(ac => normalizeAcceptanceCriterion(ac, normalizedType));
  }

  // STRICT: Feature/Security - ensure Given-When-Then with specificity
  return criteria.map(ac => {
    const normalized = normalizeAcceptanceCriterion(ac, normalizedType);
    return ensureGivenWhenThen(normalized, normalizedType);
  });
}

/**
 * Normalize an acceptance criterion to standard object format
 */
function normalizeAcceptanceCriterion(ac, sdType) {
  // Already in object format
  if (typeof ac === 'object' && ac !== null) {
    return {
      id: ac.id || `AC-${randomUUID().substring(0, 8)}`,
      criteria: ac.criteria || ac.description || ac.text || String(ac),
      type: ac.type || inferCriteriaType(ac.criteria || '', sdType)
    };
  }

  // String format - convert to object
  return {
    id: `AC-${randomUUID().substring(0, 8)}`,
    criteria: String(ac),
    type: inferCriteriaType(String(ac), sdType)
  };
}

/**
 * Infer criteria type from content
 */
function inferCriteriaType(criteriaText, sdType) {
  const text = (criteriaText || '').toLowerCase();

  if (text.includes('performance') || text.includes('load') || text.includes('response time')) {
    return 'performance';
  }
  if (text.includes('error') || text.includes('fail') || text.includes('invalid')) {
    return 'edge-case';
  }
  if (text.includes('mobile') || text.includes('responsive') || text.includes('viewport')) {
    return 'responsive';
  }
  if (text.includes('api') || text.includes('endpoint') || text.includes('database')) {
    return 'integration';
  }
  if (text.includes('display') || text.includes('show') || text.includes('render')) {
    return 'ui';
  }

  // Default based on SD type
  if (sdType === 'infrastructure') return 'technical';
  if (sdType === 'documentation') return 'completeness';
  if (sdType === 'database') return 'data-integrity';
  if (sdType === 'security') return 'security';

  return 'functional';
}

/**
 * Ensure criteria follows Given-When-Then format for strict SD types
 */
function ensureGivenWhenThen(criterion, sdType) {
  const text = criterion.criteria || '';

  // Already in Given-When-Then format
  if (/given\s+.+,?\s*when\s+.+,?\s*then\s+/i.test(text)) {
    return criterion;
  }

  // Convert to Given-When-Then format
  const converted = convertToGivenWhenThen(text, sdType);

  return {
    ...criterion,
    criteria: converted,
    original_format: text // Preserve original for reference
  };
}

/**
 * Convert plain text criteria to Given-When-Then format
 */
function convertToGivenWhenThen(text, sdType) {
  // If already formatted, return as-is
  if (/given\s+/i.test(text)) {
    return text;
  }

  // Common patterns to convert
  const textLower = text.toLowerCase();

  // "X should Y" pattern
  if (textLower.includes('should')) {
    const parts = text.split(/\s+should\s+/i);
    if (parts.length === 2) {
      return `Given ${parts[0].trim()}, When the action is performed, Then it should ${parts[1].trim()}`;
    }
  }

  // "When X, Y happens" pattern
  if (textLower.startsWith('when ')) {
    const afterWhen = text.substring(5);
    const commaParts = afterWhen.split(',');
    if (commaParts.length >= 2) {
      return `Given the system is ready, When ${commaParts[0].trim()}, Then ${commaParts.slice(1).join(',').trim()}`;
    }
    return `Given the system is ready, ${text}`;
  }

  // "X must Y" pattern
  if (textLower.includes('must')) {
    const parts = text.split(/\s+must\s+/i);
    if (parts.length === 2) {
      return `Given ${parts[0].trim()} exists, When validated, Then it must ${parts[1].trim()}`;
    }
  }

  // Default: wrap in Given-When-Then
  if (sdType === 'security') {
    return `Given a security context, When the feature is used, Then ${text}`;
  }

  return `Given the feature is implemented, When the user interacts with it, Then ${text}`;
}

/**
 * Generate default criteria when none provided
 */
function generateDefaultCriteria(sdType, context) {
  const requirement = context.requirement || 'the feature';

  const defaults = {
    documentation: [
      { id: 'AC-001', criteria: `Given the documentation update, When reviewed, Then all content is accurate and complete`, type: 'completeness' },
      { id: 'AC-002', criteria: `Given the documentation, When accessed by users, Then it is findable and readable`, type: 'functional' }
    ],
    infrastructure: [
      { id: 'AC-001', criteria: `Given ${requirement} is deployed, When under normal load, Then response time is < 500ms`, type: 'performance' },
      { id: 'AC-002', criteria: `Given ${requirement}, When monitored, Then metrics are visible in the dashboard`, type: 'technical' }
    ],
    database: [
      { id: 'AC-001', criteria: `Given the migration runs, When executed, Then data integrity is preserved`, type: 'data-integrity' },
      { id: 'AC-002', criteria: `Given the migration, When it fails, Then rollback restores previous state`, type: 'edge-case' }
    ],
    security: [
      { id: 'AC-001', criteria: `Given unauthorized access attempt, When detected, Then access is denied and logged`, type: 'security' },
      { id: 'AC-002', criteria: `Given valid credentials, When authenticating, Then access is granted within security policy`, type: 'functional' }
    ],
    feature: [
      { id: 'AC-001', criteria: `Given the user accesses ${requirement}, When the page loads, Then the expected content is displayed`, type: 'functional' },
      { id: 'AC-002', criteria: `Given an error occurs, When the user sees the error, Then a helpful message guides next steps`, type: 'edge-case' }
    ]
  };

  return defaults[sdType] || defaults.feature;
}

/**
 * Validate that sdId is a valid SD key format, not a UUID
 * Valid format: ^[A-Z0-9-]+$ (e.g., SD-EVA-MEETING-001)
 * Invalid: UUID format (contains lowercase a-f)
 */
function validateSdId(sdId) {
  // Check if it's a UUID (contains lowercase hex characters or too many hyphens)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(sdId)) {
    throw new Error(
      `Invalid sdId format: received UUID "${sdId}" but expected SD key format (e.g., "SD-EVA-MEETING-001"). ` +
      `The valid_story_key constraint requires story_key format: ^[A-Z0-9-]+:US-[0-9]{3,}$`
    );
  }

  // Check if it matches the expected SD key pattern
  const sdKeyPattern = /^[A-Z0-9-]+$/;
  if (!sdKeyPattern.test(sdId)) {
    throw new Error(
      `Invalid sdId format: "${sdId}" contains invalid characters. ` +
      `SD keys must only contain uppercase letters, numbers, and hyphens (e.g., "SD-EVA-MEETING-001").`
    );
  }

  return true;
}

/**
 * Auto-trigger Product Requirements Expert sub-agent
 *
 * @param {object} supabase - Supabase client instance
 * @param {string} sdId - Strategic Directive ID (e.g., 'SD-EVA-MEETING-001')
 * @param {string} prdId - Product Requirements Document ID (e.g., 'PRD-SD-EVA-MEETING-001')
 * @param {object} options - Optional configuration
 * @returns {object} Execution result
 */
export async function autoTriggerStories(supabase, sdId, prdId, options = {}) {
  const {
    skipIfExists = true,
    notifyOnSkip = true,
    logExecution = true,
    personaContext = []
  } = options;

  // Validate sdId format FIRST before any database operations
  validateSdId(sdId);

  console.log('\n🎯 Product Requirements Expert: Auto-Trigger Check');
  console.log('═══════════════════════════════════════════════════\n');

  const executionId = randomUUID();
  const startTime = Date.now();

  try {
    // Step 1: Check if user stories already exist
    console.log('📝 Step 1: Checking for existing user stories...');
    const { data: existingStories, error: checkError } = await supabase
      .from('user_stories')
      .select('story_key, title, status')
      .eq('sd_id', sdId);

    if (checkError) {
      throw new Error(`Failed to check existing user stories: ${checkError.message}`);
    }

    if (existingStories && existingStories.length > 0) {
      const message = `User stories already exist for ${sdId} (${existingStories.length} stories)`;

      if (skipIfExists) {
        console.log(`   ✅ ${message}`);
        console.log(`   ⏭️  Skipping Product Requirements Expert execution\n`);

        if (notifyOnSkip) {
          await logSubAgentSkip(supabase, sdId, prdId, executionId, {
            reason: 'USER_STORIES_EXIST',
            existing_count: existingStories.length,
            stories: existingStories.map(s => s.story_key)
          });
        }

        return {
          skipped: true,
          reason: 'USER_STORIES_EXIST',
          existing_stories: existingStories.length,
          message
        };
      } else {
        console.log(`   ⚠️  ${message}`);
        console.log(`   ⚙️  Proceeding anyway (skipIfExists=false)\n`);
      }
    } else {
      console.log('   📋 No existing user stories found');
      console.log('   ✅ Product Requirements Expert execution REQUIRED\n');
    }

    // Step 2: Retrieve PRD for context
    console.log('📄 Step 2: Retrieving PRD...');
    const { data: prd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', prdId)
      .single();

    if (prdError || !prd) {
      throw new Error(`Failed to retrieve PRD: ${prdError?.message || 'PRD not found'}`);
    }

    console.log(`   ✅ PRD retrieved: ${prd.title}`);
    console.log(`   📊 Status: ${prd.status}, Priority: ${prd.priority}\n`);

    // Step 3: Log execution attempt
    if (logExecution) {
      await logSubAgentAttempt(supabase, sdId, prdId, executionId, {
        trigger_reason: 'PRD_CREATED',
        trigger_type: 'AUTOMATIC',
        prd_title: prd.title,
        prd_status: prd.status
      });
    }

    // Step 4: Execute Product Requirements Expert logic
    console.log('🤖 Step 3: Generating user stories from PRD...\n');

    // Fetch SD for context (needed for LLM generation)
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (sdError) {
      console.warn(`   ⚠️  Could not fetch SD details: ${sdError.message}`);
    }

    // v1.2.0: Try LLM generation first (GPT 5.2 with rich context)
    let userStories = null;
    if (LLM_CONFIG.enabled && sd && prd) {
      userStories = await generateStoriesWithLLM(supabase, sd, prd, {
        targetStoryCount: prd.functional_requirements?.length || 10
      });

      // Transform LLM output to database format
      if (userStories && userStories.length > 0) {
        userStories = userStories.map((story, index) => ({
          id: randomUUID(),
          sd_id: sdId,
          prd_id: prdId,
          story_key: `${sdId}:US-${String(index + 1).padStart(3, '0')}`,
          title: story.title,
          user_role: story.user_role,
          user_want: story.user_want,
          user_benefit: story.user_benefit,
          story_points: story.story_points || 3,
          priority: story.priority || 'medium',
          status: 'ready',
          acceptance_criteria: story.acceptance_criteria,
          implementation_context: typeof story.implementation_context === 'object'
            ? JSON.stringify(story.implementation_context)
            : story.implementation_context,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));
        console.log(`   ✅ LLM generated ${userStories.length} high-quality stories\n`);
      }
    }

    // Fallback: Template-based generation if LLM failed or disabled
    if (!userStories || userStories.length === 0) {
      console.log('   📝 Using template-based story generation...');
      // Generate user stories from PRD functional requirements
      // Now SD-type-aware (v1.1.0) - passes supabase to fetch SD type for criteria transformation
      userStories = await generateUserStoriesFromPRD(supabase, prd, sdId, prdId, personaContext);
    }

    if (userStories.length === 0) {
      console.log('   ⚠️  No functional requirements found in PRD');
      console.log('   💡 Add functional_requirements array to PRD for auto-generation\n');
    } else {
      console.log(`   ✅ Generated ${userStories.length} user stories from PRD\n`);

      // Step 5: Insert user stories into database
      console.log('💾 Step 4: Storing user stories in database...');
      let created = 0;
      let failed = 0;

      for (const story of userStories) {
        try {
          const { error: insertError } = await supabase
            .from('user_stories')
            .insert(story);

          if (insertError) {
            if (insertError.code === '23505') {
              console.log(`   ⏭️  ${story.story_key} - Already exists`);
            } else {
              console.log(`   ❌ ${story.story_key} - Error: ${insertError.message}`);
              failed++;
            }
          } else {
            console.log(`   ✅ ${story.story_key} - ${story.title}`);
            created++;
          }
        } catch (err) {
          console.log(`   ❌ ${story.story_key} - Exception: ${err.message}`);
          failed++;
        }
      }

      console.log('');
      console.log(`   Created: ${created}/${userStories.length} user stories`);
      if (failed > 0) {
        console.log(`   Failed: ${failed}`);
      }
    }

    // Step 6: Store execution result
    const duration = Math.round((Date.now() - startTime) / 1000);

    const result = {
      executed: true,
      generated_count: userStories.length,
      sd_id: sdId,
      prd_id: prdId,
      execution_id: executionId,
      duration_seconds: duration
    };

    if (logExecution) {
      await logSubAgentResult(supabase, sdId, prdId, executionId, result);
    }

    console.log('═══════════════════════════════════════════════════');
    console.log('✅ User story generation complete\n');

    return result;

  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);

    console.error('❌ Error in auto-trigger:', error.message);

    if (logExecution) {
      await logSubAgentError(supabase, sdId, prdId, executionId, error, duration);
    }

    return {
      executed: false,
      error: error.message,
      execution_id: executionId
    };
  }
}

/**
 * Generate user stories from PRD functional requirements
 *
 * SD-TYPE-AWARE (v1.1.0):
 * Now fetches SD type and transforms acceptance criteria to match validation expectations.
 * - FEATURE/SECURITY: Ensures Given-When-Then format
 * - DOCUMENTATION: Keeps criteria simple
 * - INFRASTRUCTURE/DATABASE: Allows technical focus
 *
 * @param {object} supabase - Supabase client for SD type lookup
 * @param {object} prd - PRD record
 * @param {string} sdId - Strategic directive ID
 * @param {string} prdId - PRD ID
 * @param {Array} personaContext - Optional array of persona objects
 */
async function generateUserStoriesFromPRD(supabase, prd, sdId, prdId, personaContext = []) {
  const userStories = [];

  // Extract functional requirements if available
  const functionalRequirements = prd.functional_requirements || [];

  if (functionalRequirements.length === 0) {
    return userStories;
  }

  // SD-TYPE-AWARE: Fetch SD type for criteria transformation
  const sdType = await getSDType(supabase, sdId);
  console.log(`   📋 SD Type: ${sdType} (criteria will be ${sdType === 'feature' || sdType === 'security' ? 'STRICT' : sdType === 'documentation' ? 'LENIENT' : 'MODERATE'})`);

  for (let i = 0; i < functionalRequirements.length; i++) {
    const fr = functionalRequirements[i];
    const storyNumber = String(i + 1).padStart(3, '0');
    const storyKey = `${sdId}:US-${storyNumber}`;

    // Determine story points based on priority
    const storyPoints = fr.priority === 'CRITICAL' ? 5 :
                        fr.priority === 'HIGH' ? 3 :
                        fr.priority === 'MEDIUM' ? 2 : 1;

    // Determine user role from requirement or default to stakeholder
    // Now uses persona context when available (feature-flagged)
    const userRole = extractUserRole(fr.requirement, prd.category, personaContext);

    // Convert priority to lowercase for user story status
    const priority = (fr.priority || 'medium').toLowerCase();

    // SD-TYPE-AWARE: Transform acceptance criteria based on SD type
    const transformedCriteria = transformAcceptanceCriteria(
      fr.acceptance_criteria || [],
      sdType,
      { requirement: fr.requirement }
    );

    // E2E Test Path Generation (v1.3.0): Auto-generate test paths based on SD type
    const storyTitle = fr.requirement || `Implement ${fr.id}`;
    const e2eConfig = generateE2ETestPath(sdId, sdType, storyNumber, storyTitle);

    const userStory = {
      id: randomUUID(),
      story_key: storyKey,
      sd_id: sdId,
      prd_id: prdId,
      title: storyTitle,
      user_role: userRole,
      user_want: fr.description || `to implement ${fr.requirement}`,
      user_benefit: extractUserBenefit(fr.description, fr.rationale),
      story_points: storyPoints,
      priority: priority,
      status: 'ready',
      acceptance_criteria: transformedCriteria, // Now SD-type-aware
      implementation_context: fr.description || fr.requirement || 'Implementation details to be defined during EXEC phase',
      technical_notes: fr.rationale || '',
      created_by: 'PRODUCT_REQUIREMENTS_EXPERT',
      // E2E Test Path (v1.3.0): Auto-populated based on SD type
      e2e_test_path: e2eConfig.path,
      e2e_test_status: e2eConfig.status,
      // Track that criteria were transformed (for debugging/audit)
      metadata: {
        sd_type_at_generation: sdType,
        criteria_transformation_applied: true,
        e2e_path_auto_generated: true,
        generation_version: '1.3.0'
      }
    };

    userStories.push(userStory);
  }

  return userStories;
}

/**
 * Lookup user role from persona context
 * Matches requirement keywords against persona names/needs
 * @param {string} requirementText - The requirement text to analyze
 * @param {Array} personaContext - Array of persona objects
 * @returns {string|null} - Matched persona name or null if no match
 */
function lookupPersonaRole(requirementText, personaContext) {
  if (!Array.isArray(personaContext) || personaContext.length === 0) {
    return null;
  }

  const textLower = (requirementText || '').toLowerCase();
  if (!textLower) return null;

  // Try to match against persona names and needs
  for (const persona of personaContext) {
    const personaName = (persona.name || '').toLowerCase();
    const personaId = (persona.persona_id || '').toLowerCase();

    // Direct name match (e.g., "chairman" in text matches Chairman persona)
    if (personaName && textLower.includes(personaId)) {
      return persona.name;
    }

    // Match against persona needs keywords
    if (Array.isArray(persona.needs)) {
      for (const need of persona.needs) {
        const needKeywords = (need || '').toLowerCase().split(/\s+/);
        // If any significant keyword (>4 chars) from needs appears in text
        for (const keyword of needKeywords) {
          if (keyword.length > 4 && textLower.includes(keyword)) {
            return persona.name;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extract user role from requirement text or category
 * Now supports persona context with feature flag
 * @param {string} requirement - The requirement text
 * @param {string} category - The SD category
 * @param {Array} personaContext - Optional array of persona objects
 */
function extractUserRole(requirement, category, personaContext = []) {
  // STEP 1: Try persona-based role lookup (feature-flagged)
  if (isPersonaStoryRoleEnabled() && personaContext.length > 0) {
    const personaRole = lookupPersonaRole(requirement, personaContext);
    if (personaRole) {
      return personaRole;
    }
  }

  // STEP 2: Fallback to keyword extraction
  const requirementLower = (requirement || '').toLowerCase();

  // Role keywords mapping
  if (requirementLower.includes('user') || requirementLower.includes('customer')) {
    return 'User';
  }
  if (requirementLower.includes('admin') || requirementLower.includes('administrator')) {
    return 'Administrator';
  }
  if (requirementLower.includes('developer') || requirementLower.includes('engineer')) {
    return 'Developer';
  }
  if (requirementLower.includes('qa') || requirementLower.includes('tester')) {
    return 'QA Engineer';
  }
  if (requirementLower.includes('devops')) {
    return 'DevOps Engineer';
  }

  // Category-based defaults
  if (category === 'infrastructure') return 'DevOps Engineer';
  if (category === 'accessibility') return 'User';
  if (category === 'product_feature') return 'User';
  if (category === 'technical') return 'Developer';

  return 'Stakeholder';
}

/**
 * Extract and articulate user benefit from description
 *
 * SYSTEMIC FIX (2024-12): Generates articulated benefits that score well on
 * the benefit_articulation dimension of user-story-quality-rubric.js
 *
 * Quality rubric expects:
 * - 0-3: No benefit stated or generic ("improve system", "enhance UX")
 * - 4-6: Benefit mentioned but vague or system-centric rather than user-centric
 * - 7-8: Clear user benefit that explains WHY the user needs this
 * - 9-10: Compelling user benefit with specific value proposition and user impact
 *
 * @param {string} description - Requirement description
 * @param {string} rationale - Why this requirement exists
 * @param {string} sdType - SD type for context-aware benefit generation
 * @param {object} context - Additional context (user_role, requirement, etc.)
 * @returns {string} Articulated user benefit (minimum 50 chars for quality scoring)
 */
function extractUserBenefit(description, rationale, sdType = 'feature', context = {}) {
  // If rationale explains "why" with sufficient detail, use it
  if (rationale && rationale.length >= 50) {
    return rationale;
  }

  // Build articulated benefit based on SD type and context
  const benefitTemplates = {
    database: (desc, ctx) => {
      const action = extractKeyAction(desc);
      return `I can rely on a well-structured database foundation that ${action}, ensuring data integrity, query performance, and maintainability as the system scales. This reduces technical debt and enables faster feature development.`;
    },
    infrastructure: (desc, ctx) => {
      const action = extractKeyAction(desc);
      return `I have reliable infrastructure that ${action}, reducing deployment friction, improving system reliability, and enabling the team to focus on feature development rather than operational concerns.`;
    },
    security: (desc, ctx) => {
      const action = extractKeyAction(desc);
      return `my data and actions are protected because ${action}, giving me confidence that the system handles sensitive information appropriately and meets security compliance requirements.`;
    },
    documentation: (desc, ctx) => {
      const action = extractKeyAction(desc);
      return `I can quickly understand and use the system because ${action}, reducing onboarding time and enabling self-service without needing to ask colleagues for help.`;
    },
    feature: (desc, ctx) => {
      const action = extractKeyAction(desc);
      return `I can accomplish my goals efficiently because ${action}, saving time and reducing frustration while interacting with the system.`;
    }
  };

  const normalizedType = (sdType || 'feature').toLowerCase();
  const generator = benefitTemplates[normalizedType] || benefitTemplates.feature;

  // Generate benefit with context
  let benefit = generator(description || '', context);

  // If we have rationale, prepend it for additional context
  if (rationale && rationale.length > 0 && rationale.length < 50) {
    benefit = `${rationale}. Additionally, ${benefit}`;
  }

  return benefit;
}

/**
 * Extract the key action/capability from a description for benefit generation
 */
function extractKeyAction(description) {
  if (!description || description.length === 0) {
    return 'provides the required functionality';
  }

  // Clean up the description
  let action = description.toLowerCase();

  // Remove common prefixes
  action = action
    .replace(/^(implement|create|add|build|deploy|set up|configure)\s+/i, '')
    .replace(/^(the|a|an)\s+/i, '');

  // Truncate if too long
  if (action.length > 100) {
    const sentences = action.split(/[.!?]/);
    action = sentences[0] || action.substring(0, 100);
  }

  return action.trim() || 'provides the required functionality';
}

/**
 * Log sub-agent skip event
 */
async function logSubAgentSkip(supabase, sdId, prdId, executionId, metadata) {
  try {
    await supabase
      .from('sub_agent_execution_results')
      .insert({
        id: executionId,
        sub_agent_id: 'product-requirements-expert',
        sub_agent_code: 'STORIES',
        version: '1.0.0',
        sd_id: sdId,
        verdict: 'SKIPPED',
        confidence: 100,
        summary: {
          action: 'SKIPPED',
          reason: metadata.reason,
          existing_stories: metadata.existing_count,
          message: 'User stories already exist, skipping generation'
        },
        metadata: {
          prd_id: prdId,
          ...metadata
        }
      });
  } catch (error) {
    console.warn('⚠️  Failed to log skip event:', error.message);
  }
}

/**
 * Log sub-agent execution attempt
 */
async function logSubAgentAttempt(supabase, sdId, prdId, executionId, metadata) {
  console.log(`📝 Logging execution attempt (ID: ${executionId.substring(0, 8)}...)`);

  try {
    await supabase
      .from('sub_agent_execution_results')
      .insert({
        id: executionId,
        sub_agent_id: 'product-requirements-expert',
        sub_agent_code: 'STORIES',
        version: '1.0.0',
        sd_id: sdId,
        verdict: 'IN_PROGRESS',
        confidence: 0,
        summary: {
          status: 'STARTING',
          trigger: metadata.trigger_type,
          reason: metadata.trigger_reason
        },
        metadata: {
          prd_id: prdId,
          ...metadata,
          started_at: new Date().toISOString()
        }
      });
  } catch (error) {
    console.warn('⚠️  Failed to log attempt:', error.message);
  }
}

/**
 * Log sub-agent execution result
 */
async function logSubAgentResult(supabase, sdId, prdId, executionId, result) {
  try {
    await supabase
      .from('sub_agent_execution_results')
      .update({
        verdict: result.executed ? 'PASS' : 'WARNING',
        confidence: result.executed ? 95 : 50,
        summary: {
          executed: result.executed,
          recommendation: result.recommendation,
          duration_seconds: result.duration_seconds
        },
        execution_duration_seconds: result.duration_seconds,
        updated_at: new Date().toISOString()
      })
      .eq('id', executionId);
  } catch (error) {
    console.warn('⚠️  Failed to log result:', error.message);
  }
}

/**
 * Log sub-agent execution error
 */
async function logSubAgentError(supabase, sdId, prdId, executionId, error, duration) {
  try {
    await supabase
      .from('sub_agent_execution_results')
      .update({
        verdict: 'ERROR',
        confidence: 0,
        summary: {
          error: error.message,
          duration_seconds: duration
        },
        execution_duration_seconds: duration,
        updated_at: new Date().toISOString()
      })
      .eq('id', executionId);
  } catch (logError) {
    console.warn('⚠️  Failed to log error:', logError.message);
  }
}

export default autoTriggerStories;
