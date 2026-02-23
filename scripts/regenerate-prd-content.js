#!/usr/bin/env node

/**
 * Regenerate PRD Content for Existing PRD
 *
 * This script regenerates the PRD content using LLM (GPT 5.2) for an existing PRD.
 * Useful when PRD was created with template content and needs to be enriched.
 *
 * Usage: node scripts/regenerate-prd-content.js <SD-ID>
 *
 * Features:
 * - Fetches existing PRD and SD metadata
 * - Runs DESIGN, DATABASE, SECURITY (if needed), and RISK sub-agents
 * - Fetches existing user stories for consistency
 * - Generates PRD content using GPT 5.2
 * - Updates the PRD with the generated content
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getLLMClient } from '../lib/llm/client-factory.js';
import { executeSubAgent } from '../lib/sub-agent-executor.js';

// Configuration
const LLM_CONFIG = {
  model: 'gpt-5.2',
  temperature: 0.6,
  maxTokens: 32000,
  enabled: process.env.LLM_PRD_GENERATION !== 'false'
};

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// PRD Quality Rubric (embedded for LLM context)
const PRD_QUALITY_RUBRIC = `
## QUALITY CRITERIA (You will be judged on these dimensions)

### 1. Requirements Depth & Specificity (40% weight)
- 0-3: Mostly placeholders ("To be defined", "TBD") - WILL FAIL
- 7-8: Most requirements are specific, actionable, and complete
- 9-10: All detailed, specific, testable, with clear acceptance criteria

### 2. Architecture Explanation Quality (30% weight)
- 0-3: No architecture details or vague high-level statements
- 7-8: Clear architecture with components, data flow, integration points
- 9-10: Comprehensive with trade-offs and scalability considerations

### 3. Test Scenario Sophistication (20% weight)
- 0-3: No test scenarios or only trivial happy path - WILL FAIL
- 7-8: Happy path + common edge cases + error handling scenarios
- 9-10: Comprehensive with performance and security tests

### 4. Risk Analysis Completeness (10% weight)
- 0-3: No risks or without mitigation
- 7-8: Specific risks with concrete mitigation strategies
- 9-10: Comprehensive with rollback and monitoring
`;

/**
 * Format executeSubAgent result object as readable text.
 */
function formatSubAgentResult(result, agentName) {
  if (!result) return null;
  const parts = [`${agentName} Analysis Results:`];
  if (result.verdict) parts.push(`Verdict: ${result.verdict}`);
  if (result.confidence) parts.push(`Confidence: ${result.confidence}%`);
  if (result.message) parts.push(`Summary: ${result.message}`);
  if (result.recommendations?.length > 0) {
    parts.push('\nRecommendations:');
    result.recommendations.forEach((r, i) => parts.push(`  ${i + 1}. ${typeof r === 'string' ? r : r.recommendation || JSON.stringify(r)}`));
  }
  if (result.critical_issues?.length > 0) {
    parts.push('\nCritical Issues:');
    result.critical_issues.forEach((issue, i) => parts.push(`  ${i + 1}. ${typeof issue === 'string' ? issue : issue.issue || JSON.stringify(issue)}`));
  }
  const skipKeys = new Set(['verdict', 'confidence', 'message', 'recommendations', 'critical_issues', 'execution_time_ms', 'hallucination_check', 'stored_result_id']);
  for (const [key, value] of Object.entries(result)) {
    if (!skipKeys.has(key) && value != null) {
      parts.push(typeof value === 'object' ? `\n${key}: ${JSON.stringify(value, null, 2)}` : `${key}: ${value}`);
    }
  }
  return parts.join('\n');
}

async function main() {
  const sdId = process.argv[2];

  if (!sdId) {
    console.error('Usage: node scripts/regenerate-prd-content.js <SD-ID>');
    console.error('Example: node scripts/regenerate-prd-content.js SD-VISION-V2-001');
    process.exit(1);
  }

  console.log('🔄 Regenerating PRD Content');
  console.log('═══════════════════════════════════════════════════\n');
  console.log(`📋 SD ID: ${sdId}\n`);

  // Step 1: Find SD
  console.log('📄 Step 1: Finding Strategic Directive...');
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);
  const queryField = isUUID ? 'id' : 'sd_key';

  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq(queryField, sdId)
    .single();

  if (sdError || !sd) {
    console.error(`   ❌ SD not found: ${sdError?.message || 'No data'}`);
    process.exit(1);
  }

  console.log(`   ✅ Found: ${sd.title}`);
  console.log(`   Type: ${sd.sd_type || 'feature'}\n`);

  // Step 2: Find PRD
  console.log('📄 Step 2: Finding PRD...');
  let { data: prd, error: _prdError } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('sd_id', sd.id)
    .single();

  // Fallback to directive_id
  if (!prd) {
    const fallback = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('directive_id', sdId)
      .single();

    if (fallback.data) {
      prd = fallback.data;
      console.log('   ℹ️  PRD found via directive_id (legacy)');
    }
  }

  if (!prd) {
    console.error(`   ❌ PRD not found for SD ${sdId}`);
    console.error('   Run: node scripts/add-prd-to-database.js ' + sdId);
    process.exit(1);
  }

  console.log(`   ✅ Found: ${prd.id}`);
  console.log(`   Status: ${prd.status}\n`);

  // Step 3: Run sub-agents for context
  let designAnalysis = null;
  let databaseAnalysis = null;
  let securityAnalysis = null;
  let riskAnalysis = null;

  // DESIGN Analysis
  console.log('═══════════════════════════════════════════════════');
  console.log('🎨 Running DESIGN sub-agent...');
  console.log('═══════════════════════════════════════════════════');

  try {
    const designResult = await executeSubAgent('DESIGN', sd.sd_key || sd.id, { timeout: 120000 });
    designAnalysis = formatSubAgentResult(designResult, 'DESIGN');
    console.log('   ✅ Design analysis complete\n');
  } catch (err) {
    console.warn('   ⚠️  Design analysis failed:', err.message);
  }

  // DATABASE Analysis
  console.log('═══════════════════════════════════════════════════');
  console.log('📊 Running DATABASE sub-agent...');
  console.log('═══════════════════════════════════════════════════');

  try {
    const dbResult = await executeSubAgent('DATABASE', sd.sd_key || sd.id, { timeout: 120000 });
    databaseAnalysis = formatSubAgentResult(dbResult, 'DATABASE');
    console.log('   ✅ Database analysis complete\n');
  } catch (err) {
    console.warn('   ⚠️  Database analysis failed:', err.message);
  }

  // RISK Analysis (always)
  console.log('═══════════════════════════════════════════════════');
  console.log('⚠️  Running RISK sub-agent...');
  console.log('═══════════════════════════════════════════════════');

  try {
    const riskResult = await executeSubAgent('RISK', sd.sd_key || sd.id, { timeout: 120000 });
    riskAnalysis = formatSubAgentResult(riskResult, 'RISK');
    console.log('   ✅ Risk analysis complete\n');
  } catch (err) {
    console.warn('   ⚠️  Risk analysis failed:', err.message);
  }

  // SECURITY Analysis (conditional)
  const sdType = sd.sd_type || 'feature';
  const needsSecurity = sdType === 'security' ||
                       sd.scope?.toLowerCase().includes('auth') ||
                       sd.description?.toLowerCase().includes('permission');

  if (needsSecurity) {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔒 Running SECURITY sub-agent...');
    console.log('═══════════════════════════════════════════════════');

    try {
      const secResult = await executeSubAgent('SECURITY', sd.sd_key || sd.id, { timeout: 120000 });
      securityAnalysis = formatSubAgentResult(secResult, 'SECURITY');
      console.log('   ✅ Security analysis complete\n');
    } catch (err) {
      console.warn('   ⚠️  Security analysis failed:', err.message);
    }
  }

  // Step 4: Fetch existing user stories
  console.log('📚 Fetching existing user stories...');
  const { data: stories } = await supabase
    .from('user_stories')
    .select('story_key, title, user_role, user_want, user_benefit, acceptance_criteria')
    .eq('sd_id', sd.id)
    .order('story_key');

  console.log(`   Found ${stories?.length || 0} stories\n`);

  // Step 5: Generate PRD content with LLM
  console.log('═══════════════════════════════════════════════════');
  console.log('🧠 Generating PRD Content with GPT 5.2...');
  console.log('═══════════════════════════════════════════════════');

  if (!LLM_CONFIG.enabled) {
    console.log('   ℹ️  LLM generation disabled via LLM_PRD_GENERATION=false');
    process.exit(0);
  }

  const openai = getLLMClient({ purpose: 'generation' });

  const systemPrompt = buildSystemPrompt(sdType);
  const userPrompt = buildUserPrompt(sd, {
    designAnalysis,
    databaseAnalysis,
    securityAnalysis,
    riskAnalysis,
    existingStories: stories || []
  });

  try {
    const response = await openai.chat.completions.create({
      model: LLM_CONFIG.model,
      temperature: LLM_CONFIG.temperature,
      max_completion_tokens: LLM_CONFIG.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error('   ❌ LLM returned empty content');
      process.exit(1);
    }

    // Parse JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('   ❌ Could not extract JSON from response');
      console.log('   Preview:', content.substring(0, 500));
      process.exit(1);
    }

    const prdContent = JSON.parse(jsonMatch[0]);
    console.log('   ✅ PRD content generated');
    console.log(`   📋 Functional Requirements: ${prdContent.functional_requirements?.length || 0}`);
    console.log(`   🧪 Test Scenarios: ${prdContent.test_scenarios?.length || 0}`);
    console.log(`   ⚠️  Risks: ${prdContent.risks?.length || 0}\n`);

    // Step 6: Update PRD
    console.log('📝 Updating PRD in database...');

    const prdUpdate = {
      updated_at: new Date().toISOString()
    };

    if (prdContent.executive_summary) {
      prdUpdate.executive_summary = prdContent.executive_summary;
    }
    if (prdContent.functional_requirements?.length > 0) {
      prdUpdate.functional_requirements = prdContent.functional_requirements;
    }
    if (prdContent.technical_requirements?.length > 0) {
      prdUpdate.technical_requirements = prdContent.technical_requirements;
    }
    if (prdContent.system_architecture) {
      prdUpdate.system_architecture = prdContent.system_architecture;
    }
    if (prdContent.test_scenarios?.length > 0) {
      prdUpdate.test_scenarios = prdContent.test_scenarios;
    }
    if (prdContent.acceptance_criteria?.length > 0) {
      prdUpdate.acceptance_criteria = prdContent.acceptance_criteria;
    }
    if (prdContent.risks?.length > 0) {
      prdUpdate.risks = prdContent.risks;
    }
    if (prdContent.implementation_approach) {
      prdUpdate.implementation_approach = prdContent.implementation_approach;
    }

    // Update content field
    prdUpdate.content = formatPRDContent(sdId, sd, prdContent);

    const { error: updateError } = await supabase
      .from('product_requirements_v2')
      .update(prdUpdate)
      .eq('id', prd.id);

    if (updateError) {
      console.error('   ❌ Update failed:', updateError.message);
      process.exit(1);
    }

    console.log('   ✅ PRD updated successfully\n');

    // Step 7: Verify quality
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ PRD Regeneration Complete');
    console.log('═══════════════════════════════════════════════════');
    console.log('\n📝 Next steps:');
    console.log('1. Run handoff validation: node scripts/verify-handoff-plan-to-exec.js ' + sdId);
    console.log('2. Review PRD content in database');

  } catch (_err) {
    console.error('   ❌ LLM generation failed:', err.message);
    process.exit(1);
  }
}

// Helper functions

function _buildDesignPrompt(sd) {
  return `Analyze UI/UX design and user workflows for Strategic Directive: ${sd.id}

**Title**: ${sd.title}
**Scope**: ${sd.scope || 'N/A'}
**Description**: ${sd.description || 'N/A'}

**Strategic Objectives**:
${formatObjectives(sd.strategic_objectives)}

**Task**: Identify user workflows, UI components, and user journey.`;
}

function _buildDatabasePrompt(sd, designAnalysis) {
  return `Analyze database schema for Strategic Directive: ${sd.id}

**Title**: ${sd.title}
**Scope**: ${sd.scope || 'N/A'}
**Description**: ${sd.description || 'N/A'}

${designAnalysis ? `**Design Context**:\n${designAnalysis.substring(0, 2000)}` : ''}

**Task**: Analyze schema requirements and recommend database changes.`;
}

function _buildRiskPrompt(sd) {
  return `Analyze implementation risks for Strategic Directive: ${sd.id}

**Title**: ${sd.title}
**Scope**: ${sd.scope || 'N/A'}
**Description**: ${sd.description || 'N/A'}

**Task**: Identify technical risks, assess probability/impact, and propose mitigations.`;
}

function _buildSecurityPrompt(sd) {
  return `Analyze security requirements for Strategic Directive: ${sd.id}

**Title**: ${sd.title}
**Scope**: ${sd.scope || 'N/A'}
**Description**: ${sd.description || 'N/A'}

**Task**: Identify auth requirements, authorization model, and security risks.`;
}

function buildSystemPrompt(sdType) {
  return `You are a Technical Product Manager creating a Product Requirements Document (PRD).

${PRD_QUALITY_RUBRIC}

Return a JSON object with: executive_summary, functional_requirements[], technical_requirements[],
system_architecture{}, test_scenarios[], acceptance_criteria[], risks[], implementation_approach{}.

CRITICAL: No placeholders like "To be defined" or "TBD". Every requirement must be implementation-ready.

SD Type: ${sdType}`;
}

function buildUserPrompt(sd, context) {
  const sections = [];

  sections.push(`## STRATEGIC DIRECTIVE
**ID**: ${sd.id}
**Title**: ${sd.title}
**Type**: ${sd.sd_type || 'feature'}
**Scope**: ${sd.scope || 'N/A'}
**Description**: ${sd.description || 'N/A'}

**Strategic Objectives**:
${formatObjectives(sd.strategic_objectives)}`);

  if (context.designAnalysis) {
    sections.push(`## DESIGN ANALYSIS\n${context.designAnalysis.substring(0, 3000)}`);
  }
  if (context.databaseAnalysis) {
    sections.push(`## DATABASE ANALYSIS\n${context.databaseAnalysis.substring(0, 3000)}`);
  }
  if (context.securityAnalysis) {
    sections.push(`## SECURITY ANALYSIS\n${context.securityAnalysis.substring(0, 2000)}`);
  }
  if (context.riskAnalysis) {
    sections.push(`## RISK ANALYSIS\n${context.riskAnalysis.substring(0, 2000)}`);
  }

  if (context.existingStories?.length > 0) {
    sections.push(`## EXISTING USER STORIES (Ensure Consistency)
${context.existingStories.map(s => `- ${s.story_key}: ${s.title}`).join('\n')}`);
  }

  sections.push(`## TASK
Generate a complete PRD as JSON. Be specific and implementation-ready.`);

  return sections.join('\n\n');
}

function formatObjectives(objectives) {
  if (!objectives) return '- No objectives defined';
  if (Array.isArray(objectives)) {
    return objectives.map((obj, i) => {
      if (typeof obj === 'string') return `${i + 1}. ${obj}`;
      return `${i + 1}. ${obj.objective || JSON.stringify(obj)}`;
    }).join('\n');
  }
  return JSON.stringify(objectives);
}

function formatPRDContent(sdId, sd, llmContent) {
  return `# Product Requirements Document

## Strategic Directive
${sdId}

## Title
${sd.title || 'Untitled'}

## Status
Planning

## Executive Summary
${llmContent.executive_summary || 'See requirements below.'}

---
*Regenerated by LLM PRD Content Generation (GPT 5.2)*
*Date: ${new Date().toISOString()}*`;
}

main().catch(console.error);
