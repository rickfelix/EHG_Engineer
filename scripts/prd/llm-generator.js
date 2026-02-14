/**
 * LLM-Based PRD Content Generation
 * Uses Opus 4.6 to generate actual PRD content with codebase grounding
 *
 * Extracted from add-prd-to-database.js for modularity
 * SD-LEO-REFACTOR-PRD-DB-002
 * SD-LEO-INFRA-REPLACE-GPT-OPUS-001: Switched from GPT 5.2 to Opus 4.6
 * SD-LEO-FIX-REPLACE-EXTERNAL-API-001: Added inline mode for Claude Code execution
 */

import { getLLMClient } from '../../lib/llm/client-factory.js';
import { LLM_PRD_CONFIG, buildSystemPrompt } from './config.js';
import {
  formatObjectives,
  formatArrayField,
  formatRisks,
  formatMetadata,
  formatVisionSpecs,
  formatGovernance
} from './formatters.js';

/**
 * Check if inline PRD generation mode is enabled.
 * Inline mode outputs the prompt to stdout for Claude Code to process
 * instead of making an external API call.
 *
 * Default: true (inline mode on) since Claude Code IS already Opus 4.6.
 * Set LLM_PRD_INLINE=false to use the external API path.
 */
function isInlineModeEnabled() {
  return process.env.LLM_PRD_INLINE !== 'false';
}

/**
 * Generate PRD content using inline mode (Claude Code processes the prompt directly).
 *
 * Outputs system + user prompt to stdout with delimiters, then reads JSON response
 * from the calling process. This eliminates the external HTTP API call since
 * Claude Code IS already Opus 4.6.
 *
 * @param {Object} sd - Strategic Directive data
 * @param {Object} context - Additional context
 * @returns {Promise<Object|null>} Generated PRD content or null if failed
 */
async function generatePRDInline(sd, context = {}) {
  const sdType = sd.sd_type || 'feature';

  console.log('   🧠 INLINE MODE: Claude Code will generate PRD content directly');
  console.log(`   📋 SD Type: ${sdType}`);
  console.log('   ℹ️  No external API call needed — Claude Code IS Opus 4.6');

  const systemPrompt = buildSystemPrompt(sdType);
  const userPrompt = buildPRDGenerationContext(sd, context);

  // Output the prompt with clear delimiters for the calling process to capture
  console.log('\n===PRD_GENERATION_PROMPT_START===');
  console.log('SYSTEM_PROMPT:');
  console.log(systemPrompt);
  console.log('\nUSER_PROMPT:');
  console.log(userPrompt);
  console.log('===PRD_GENERATION_PROMPT_END===\n');

  console.log('   ℹ️  Prompt output complete. Claude Code should process this inline.');
  console.log('   ℹ️  If running outside Claude Code, set LLM_PRD_INLINE=false to use external API.');

  // In inline mode, we return null — the calling script (add-prd-to-database.js)
  // will detect inline mode and expect the caller (Claude Code) to generate
  // the PRD content and insert it directly into the database.
  return null;
}

/**
 * Generate PRD content using external LLM API (Opus 4.6 via effort-based routing)
 *
 * @param {Object} sd - Strategic Directive data
 * @param {Object} context - Additional context (design analysis, database analysis, personas)
 * @returns {Promise<Object|null>} Generated PRD content or null if failed
 */
async function generatePRDViaExternalAPI(sd, context = {}) {
  const llmClient = getLLMClient({
    purpose: 'generation',
    phase: 'PLAN'
  });

  const sdType = sd.sd_type || 'feature';

  console.log(`   🤖 Generating PRD content with ${llmClient.provider} ${llmClient.model}...`);
  console.log(`   📋 SD Type: ${sdType}`);

  try {
    const systemPrompt = buildSystemPrompt(sdType);
    const userPrompt = buildPRDGenerationContext(sd, context);

    // Use adapter interface .complete() with streaming flag for long operations
    const response = await llmClient.complete(systemPrompt, userPrompt, {
      temperature: LLM_PRD_CONFIG.temperature,
      max_tokens: LLM_PRD_CONFIG.maxTokens,
      stream: true // Required by Anthropic SDK for operations >10 minutes
    });

    const content = response.content;

    if (!content) {
      console.warn('   ⚠️  LLM returned empty content');
      return null;
    }

    return parsePRDResponse(content);

  } catch (error) {
    console.error('   ❌ LLM PRD generation failed:', error.message);
    if (error.response?.data) {
      console.error('   API Error:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

/**
 * Parse LLM response text into PRD JSON content
 * @param {string} content - Raw LLM response text
 * @returns {Object|null} Parsed PRD content or null
 */
export function parsePRDResponse(content) {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn('   ⚠️  Could not extract JSON from LLM response');
    console.log('   Response preview:', content.substring(0, 500));
    return null;
  }

  const prdContent = JSON.parse(jsonMatch[0]);

  console.log('   ✅ PRD content generated successfully');
  console.log(`   📊 Generated: ${prdContent.functional_requirements?.length || 0} functional requirements`);
  console.log(`   📊 Generated: ${prdContent.test_scenarios?.length || 0} test scenarios`);
  console.log(`   📊 Generated: ${prdContent.risks?.length || 0} risks identified`);

  return prdContent;
}

/**
 * Generate PRD content — routes between inline and external API modes.
 *
 * - Inline mode (default): Outputs prompt for Claude Code to process directly.
 *   No external API call. Claude Code IS Opus 4.6.
 * - External mode (LLM_PRD_INLINE=false): Uses AnthropicAdapter via LLM factory.
 *
 * @param {Object} sd - Strategic Directive data
 * @param {Object} context - Additional context (design analysis, database analysis, personas)
 * @returns {Promise<Object|null>} Generated PRD content or null if failed/inline mode
 */
export async function generatePRDContentWithLLM(sd, context = {}) {
  if (!LLM_PRD_CONFIG.enabled) {
    console.log('   ℹ️  LLM PRD generation disabled via LLM_PRD_GENERATION=false');
    return null;
  }

  if (isInlineModeEnabled()) {
    return generatePRDInline(sd, context);
  }

  return generatePRDViaExternalAPI(sd, context);
}

/**
 * Get implementation context constraints for PRD generation
 * Prevents LLM from hallucinating irrelevant requirements
 * SD-LEO-INFRA-PRD-GROUNDING-VALIDATION-001
 *
 * @param {string} context - Implementation context (cli, web, api, database, infrastructure, hybrid)
 * @returns {string|null} Context-specific constraints or null if no special constraints
 */
function getImplementationContextConstraints(context) {
  const constraints = {
    cli: `**DO NOT INCLUDE requirements related to**:
- WCAG 2.1 accessibility (color contrast, screen readers, keyboard navigation)
- Responsive design or mobile layouts
- Browser compatibility or CSS styling
- Theme support (light/dark mode)
- UI render performance (500ms SLA, etc.)
- Component architecture or UI frameworks

**FOCUS ON**:
- Command-line argument parsing and validation
- Exit codes and error messages
- Terminal output formatting
- Signal handling (SIGINT, SIGTERM)
- Piping and file I/O
- Environment variable handling`,

    api: `**DO NOT INCLUDE requirements related to**:
- UI/UX design or user interface components
- WCAG accessibility for visual elements
- Frontend performance metrics
- Browser-specific behavior

**FOCUS ON**:
- REST/GraphQL endpoint design
- Request/response schemas
- HTTP status codes and error handling
- Authentication and authorization
- Rate limiting and throttling
- API versioning
- Documentation (OpenAPI/Swagger)`,

    database: `**DO NOT INCLUDE requirements related to**:
- UI components or user interface
- Frontend frameworks or styling
- User interaction flows
- Browser compatibility

**FOCUS ON**:
- Schema design and migrations
- RLS policies and security
- Index optimization
- Data integrity constraints
- Transaction handling
- Backup and recovery
- Query performance`,

    infrastructure: `**DO NOT INCLUDE requirements related to**:
- End-user UI or visual design
- WCAG accessibility for user interfaces
- Customer-facing features
- User journey or experience

**FOCUS ON**:
- System configuration and setup
- Developer tooling and scripts
- CI/CD pipeline integration
- Monitoring and logging
- Internal process automation
- Documentation and runbooks`,

    hybrid: 'This SD involves multiple implementation contexts. Requirements should be tagged with their applicable context (CLI, Web, API, Database) to ensure traceability.',

    web: null // Default context, no special constraints
  };

  return constraints[context] || constraints.web;
}

/**
 * Build comprehensive context string for PRD generation
 * Includes ALL available SD metadata for thorough PRD generation
 * Also includes existing user stories for consistency
 *
 * @param {Object} sd - Strategic Directive data
 * @param {Object} context - Additional context
 * @returns {string} Complete context string for LLM
 */
export function buildPRDGenerationContext(sd, context = {}) {
  const sections = [];

  // 1. Strategic Directive Context - only include fields that have content
  const sdLines = [
    `## SD CONTEXT`,
    `**SD Key**: ${sd.sd_key || sd.id}`,
    `**Title**: ${sd.title || 'Untitled'}`,
    `**Type**: ${sd.sd_type || 'feature'}`,
    `**Implementation Context**: ${sd.implementation_context || 'web'}`
  ];
  if (sd.description) sdLines.push(`\n### Description\n${sd.description}`);
  if (sd.scope) sdLines.push(`\n### Scope\n${sd.scope}`);
  if (sd.rationale) sdLines.push(`\n### Rationale\n${sd.rationale}`);
  if (sd.strategic_objectives) sdLines.push(`\n### Objectives\n${formatObjectives(sd.strategic_objectives)}`);
  if (sd.success_criteria?.length) sdLines.push(`\n### Success Criteria\n${formatArrayField(sd.success_criteria, 'criterion')}`);
  if (sd.key_changes?.length) sdLines.push(`\n### Key Changes\n${formatArrayField(sd.key_changes, 'change')}`);
  if (sd.success_metrics?.length) sdLines.push(`\n### Success Metrics\n${formatArrayField(sd.success_metrics, 'metric')}`);
  if (sd.dependencies?.length) sdLines.push(`\n### Dependencies\n${formatArrayField(sd.dependencies, 'dependency')}`);
  if (sd.risks?.length) sdLines.push(`\n### Risks\n${formatRisks(sd.risks)}`);
  sections.push(sdLines.join('\n'));

  // 2. SD Metadata — only non-empty, truncated
  if (sd.metadata && Object.keys(sd.metadata).length > 0) {
    const meta = formatMetadata(sd.metadata);
    if (meta.trim()) sections.push(`## SD METADATA\n${meta.substring(0, 3000)}`);
  }

  // 3-4. Sub-agent analyses — cap at 3000 chars each (was 5000)
  const analyses = [
    { key: 'designAnalysis', label: 'DESIGN ANALYSIS' },
    { key: 'databaseAnalysis', label: 'DATABASE ANALYSIS' },
    { key: 'securityAnalysis', label: 'SECURITY ANALYSIS' },
    { key: 'riskAnalysis', label: 'RISK ANALYSIS' }
  ];
  for (const { key, label } of analyses) {
    if (context[key]) {
      const text = typeof context[key] === 'string'
        ? context[key] : JSON.stringify(context[key], null, 2);
      sections.push(`## ${label}\n${text.substring(0, 3000)}`);
    }
  }

  // 5. Personas — compact format
  if (context.personas?.length) {
    const personaLines = context.personas.map(p => {
      const parts = [`- **${p.name}**`];
      if (p.role) parts.push(`(${p.role})`);
      if (p.goals) parts.push(`Goals: ${Array.isArray(p.goals) ? p.goals.join(', ') : p.goals}`);
      return parts.join(' ');
    });
    sections.push(`## PERSONAS\n${personaLines.join('\n')}`);
  }

  // 6-7. Vision/Governance — only if present
  if (sd.metadata?.vision_spec_references) {
    sections.push(`## VISION REFS\n${formatVisionSpecs(sd.metadata.vision_spec_references)}`);
  }
  if (sd.metadata?.governance) {
    sections.push(`## GOVERNANCE\n${formatGovernance(sd.metadata.governance)}`);
  }

  // 8. Existing User Stories — compact
  if (context.existingStories?.length) {
    const storyLines = context.existingStories.map(s => {
      const parts = [`### ${s.story_key}: ${s.title}`];
      if (s.user_role) parts.push(`As a ${s.user_role}, I want ${s.user_want || '...'} so that ${s.user_benefit || '...'}`);
      if (s.acceptance_criteria?.length) {
        const acList = Array.isArray(s.acceptance_criteria)
          ? s.acceptance_criteria : s.acceptance_criteria.split('\n').filter(l => l.trim());
        acList.forEach(ac => parts.push(`- ${typeof ac === 'string' ? ac : ac.criterion}`));
      }
      return parts.join('\n');
    });
    sections.push(`## EXISTING STORIES (PRD must align)\n${storyLines.join('\n\n')}`);
  }

  // 9. Implementation Context Constraints
  const implCtx = sd.implementation_context || 'web';
  const constraints = getImplementationContextConstraints(implCtx);
  if (constraints) {
    sections.push(`## CONTEXT CONSTRAINTS (${implCtx.toUpperCase()})\n${constraints}`);
  }

  // 10. Generation Instructions — concise
  sections.push(`## TASK: GENERATE PRD (JSON)

Generate an implementation-ready PRD as valid JSON per the system prompt schema.

Requirements:
- 5+ functional requirements with acceptance criteria
- 3+ technical requirements
- 5+ test scenarios (happy path, edge cases, errors)
- 3+ risks with mitigations
- System architecture with components and data flow
- All requirements must trace to SD objectives
- All criteria must be testable`);

  return sections.join('\n\n');
}
