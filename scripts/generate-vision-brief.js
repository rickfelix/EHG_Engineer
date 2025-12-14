#!/usr/bin/env node

/**
 * Vision Brief Generator for Persona-Driven PRD Pipeline
 *
 * Generates stakeholder personas from SD context using AI (GPT-5 Mini).
 * Stores draft in sd.metadata.vision_discovery for Chairman review.
 *
 * Part of: PR #5 - Vision Brief Generator
 * Related: persona-extractor.js, add-prd-to-database.js
 *
 * Usage:
 *   node scripts/generate-vision-brief.js SD-FEATURE-001
 *   node scripts/generate-vision-brief.js SD-FEATURE-001 --dry-run
 *   node scripts/generate-vision-brief.js SD-FEATURE-001 --force
 *
 * @module generate-vision-brief
 * @version 1.0.0
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from './lib/supabase-connection.js';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const MODEL = process.env.VISION_BRIEF_MODEL || 'gpt-5-mini';
const MAX_TOKENS = parseInt(process.env.VISION_BRIEF_MAX_TOKENS, 10) || 3000;

// Default personas (fallback when AI unavailable)
const DEFAULT_PERSONAS = {
  chairman: {
    persona_id: 'chairman',
    name: 'Chairman (Solo Entrepreneur)',
    needs: ['ROI visibility', 'Resource efficiency', 'Quick iteration', 'Strategic alignment'],
    pain_points: ['Too much detail', 'Missing financial KPIs', 'Slow feedback loops'],
    success_criteria: ['Clear ROI path', 'Minimal overhead', 'Measurable outcomes']
  },
  venture_end_user: {
    persona_id: 'venture_end_user',
    name: 'Venture End User',
    needs: ['Intuitive interface', 'Fast task completion', 'Clear feedback'],
    pain_points: ['Confusing workflows', 'Missing features', 'Slow performance'],
    success_criteria: ['Task completion rate > 90%', 'User satisfaction', 'Low error rate']
  },
  eva: {
    persona_id: 'eva',
    name: 'EVA (AI Chief of Staff)',
    needs: ['Clear orchestration APIs', 'Reliable automation', 'Observable state'],
    pain_points: ['Unclear agent boundaries', 'Missing context', 'Brittle integrations'],
    success_criteria: ['Autonomous execution', 'Predictable behavior', 'Graceful degradation']
  },
  devops_engineer: {
    persona_id: 'devops_engineer',
    name: 'DevOps Engineer',
    needs: ['Reliable deployments', 'Clear monitoring', 'Fast rollback'],
    pain_points: ['Flaky pipelines', 'Missing logs', 'Configuration drift'],
    success_criteria: ['Zero-downtime deploys', 'Full observability', 'Fast recovery']
  }
};

// Keywords that indicate EVA/automation involvement
const EVA_KEYWORDS = [
  'orchestration', 'automation', 'agent', 'eva', 'ai', 'autonomous',
  'workflow', 'crew', 'crewai', 'pipeline', 'scheduled', 'recurring'
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const sdId = args.find(arg => !arg.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const confirm = args.includes('--confirm');

  return { sdId, dryRun, force, confirm };
}

/**
 * Check if SD text mentions automation concepts
 */
function mentionsAutomation(sdData) {
  const textToSearch = [
    sdData.title || '',
    sdData.scope || '',
    sdData.description || '',
    JSON.stringify(sdData.strategic_objectives || '')
  ].join(' ').toLowerCase();

  return EVA_KEYWORDS.some(keyword => textToSearch.includes(keyword));
}

/**
 * Generate default personas based on SD type (fallback when AI unavailable)
 */
function generateDefaultPersonas(sdData) {
  const personas = [];
  const sdType = sdData.sd_type || 'feature';

  // Chairman is ALWAYS included (Solo Entrepreneur model)
  personas.push({ ...DEFAULT_PERSONAS.chairman });

  // Add type-specific personas
  switch (sdType) {
    case 'feature':
      personas.push({ ...DEFAULT_PERSONAS.venture_end_user });
      break;
    case 'infrastructure':
      personas.push({ ...DEFAULT_PERSONAS.devops_engineer });
      break;
    case 'database':
      personas.push({ ...DEFAULT_PERSONAS.devops_engineer });
      break;
    case 'security':
      personas.push({ ...DEFAULT_PERSONAS.venture_end_user });
      break;
    default:
      personas.push({ ...DEFAULT_PERSONAS.venture_end_user });
  }

  // Add EVA if automation/orchestration is mentioned
  if (mentionsAutomation(sdData)) {
    personas.push({ ...DEFAULT_PERSONAS.eva });
  }

  return personas;
}

/**
 * Generate chairman perspective from SD context
 */
function generateChairmanPerspective(sdData) {
  // Extract constraints from scope if available
  const constraints = [];
  const scopeLower = (sdData.scope || '').toLowerCase();

  if (scopeLower.includes('no new') || scopeLower.includes('must work with existing')) {
    constraints.push('Work within existing infrastructure');
  }
  if (scopeLower.includes('security') || scopeLower.includes('auth')) {
    constraints.push('Security compliance required');
  }

  return {
    primary_kpi: extractPrimaryKpi(sdData),
    success_definition: extractSuccessDefinition(sdData),
    constraints: constraints.length > 0 ? constraints : ['Standard quality gates apply']
  };
}

/**
 * Extract primary KPI from SD objectives or description
 */
function extractPrimaryKpi(sdData) {
  const objectives = sdData.strategic_objectives;
  if (Array.isArray(objectives) && objectives.length > 0) {
    const first = objectives[0];
    // Handle both string and object formats
    const text = typeof first === 'string' ? first : (first?.objective || first?.description || JSON.stringify(first));
    return text.substring(0, 100);
  }
  if (sdData.description) {
    return sdData.description.substring(0, 100);
  }
  return 'Successful implementation of SD requirements';
}

/**
 * Extract success definition from SD
 */
function extractSuccessDefinition(sdData) {
  if (sdData.success_criteria) {
    return sdData.success_criteria;
  }
  return `Complete ${sdData.title || 'the directive'} with all acceptance criteria met`;
}

// ============================================================================
// AI GENERATION
// ============================================================================

/**
 * Generate personas using OpenAI
 */
async function generatePersonasWithAI(sdData, openai) {
  const systemPrompt = `You are an expert at identifying stakeholder personas for software development projects.

Given a Strategic Directive (SD), identify 2-4 key stakeholder personas who will be affected by or benefit from this work.

For EACH persona, provide:
- persona_id: lowercase snake_case identifier (e.g., "venture_end_user", "devops_engineer")
- name: Human-readable name with role context
- needs: Array of 3-4 core needs this persona has
- pain_points: Array of 2-3 problems they face without this feature
- success_criteria: Array of 2-3 measurable outcomes they care about

IMPORTANT RULES:
1. ALWAYS include "Chairman (Solo Entrepreneur)" as the first persona - they care about ROI, efficiency, and strategic alignment
2. Check the TARGET APPLICATION to determine persona requirements:
   - If target_application = "EHG" (runtime app): ALWAYS include Chairman + Solo Entrepreneur as primary personas
   - If target_application = "EHG_Engineer" (governance): Include Chairman, add DevOps for infra work
   - Include EVA ONLY if automation/orchestration is directly involved in the SD scope
3. For "feature" type SDs targeting EHG, include end users who will interact with the UI
4. For "infrastructure" type SDs, include DevOps/engineering personas
5. Keep descriptions concise but specific to the SD context

Return ONLY valid JSON in this exact format:
{
  "stakeholder_personas": [
    {
      "persona_id": "string",
      "name": "string",
      "needs": ["string", "string", "string"],
      "pain_points": ["string", "string"],
      "success_criteria": ["string", "string"]
    }
  ],
  "chairman_perspective": {
    "primary_kpi": "The main metric the Chairman cares about",
    "success_definition": "What success looks like from Chairman's view",
    "constraints": ["constraint1", "constraint2"]
  }
}

NO additional text or markdown - ONLY the JSON object.`;

  const userPrompt = `Generate stakeholder personas for this Strategic Directive:

**SD ID:** ${sdData.id}
**Title:** ${sdData.title || 'N/A'}
**Type:** ${sdData.sd_type || 'feature'}
**Target Application:** ${sdData.target_application || 'unknown'}
**Scope:** ${sdData.scope || 'N/A'}
**Description:** ${sdData.description || 'N/A'}
**Strategic Objectives:** ${JSON.stringify(sdData.strategic_objectives || [])}

Analyze the SD and generate appropriate personas based on the target application and who will be affected by this work.`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: MAX_TOKENS
  });

  // Extract and trim content
  const rawContent = response.choices[0].message.content;
  const content = rawContent ? rawContent.trim() : '';
  const tokenUsage = response.usage?.total_tokens || 0;

  // Pre-parse sanity checks
  if (content.length < 100) {
    console.warn(`   ⚠️  Response too short (${content.length} chars) - likely truncated`);
    console.warn(`   Content: ${content.substring(0, 200)}`);
    throw new Error(`Response too short: ${content.length} chars (expected structured JSON)`);
  }

  if (!content.startsWith('{') && !content.startsWith('[')) {
    console.warn('   ⚠️  Response does not start with { or [ - invalid JSON structure');
    console.warn(`   First 100 chars: ${content.substring(0, 100)}`);
    throw new Error('Response is not valid JSON (does not start with { or [)');
  }

  // Parse JSON with detailed error logging
  let result;
  try {
    result = JSON.parse(content);
  } catch (parseError) {
    // Log diagnostic info (no secrets - just structure info)
    console.error('   ❌ JSON Parse Failure Diagnostics:');
    console.error(`      Model: ${MODEL}`);
    console.error(`      SD: ${sdData.id}`);
    console.error(`      Response length: ${content.length} chars`);
    console.error(`      Token usage: ${tokenUsage}`);
    console.error('      response_format: json_object (enabled)');
    console.error(`      First 500 chars: ${content.substring(0, 500)}`);
    console.error(`      Last 200 chars: ${content.substring(Math.max(0, content.length - 200))}`);
    throw new Error(`JSON parse failed: ${parseError.message}`);
  }

  // Validate response structure
  if (!Array.isArray(result.stakeholder_personas) || result.stakeholder_personas.length === 0) {
    throw new Error('AI response missing stakeholder_personas array');
  }

  return {
    personas: result.stakeholder_personas,
    chairmanPerspective: result.chairman_perspective || null,
    tokenUsage: tokenUsage
  };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  const { sdId, dryRun, force, confirm } = parseArgs();

  // Validate input
  if (!sdId) {
    console.log('Usage: node scripts/generate-vision-brief.js <SD-ID> [--dry-run] [--force] [--confirm]');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run  Preview output without writing to database');
    console.log('  --force    Regenerate even if already approved');
    console.log('  --confirm  Actually write to database (required for writes)');
    process.exit(1);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('VISION BRIEF GENERATOR');
  console.log('='.repeat(60));
  console.log('');
  console.log(`   SD: ${sdId}`);
  console.log(`   Mode: ${dryRun ? 'DRY-RUN (no writes)' : (confirm ? 'WRITE (confirmed)' : 'PREVIEW (use --confirm to write)')}`);
  console.log(`   Force: ${force ? 'YES' : 'NO'}`);
  console.log(`   Model: ${MODEL}`);
  console.log('');

  // Initialize Supabase client
  const supabase = await createSupabaseServiceClient('engineer');

  // Step 1: Fetch SD record
  console.log('Step 1: Fetching SD record...');
  const { data: sdData, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, scope, description, sd_type, strategic_objectives, metadata, target_application')
    .eq('id', sdId)
    .single();

  if (fetchError || !sdData) {
    console.error(`   ERROR: SD not found: ${sdId}`);
    console.error(`   ${fetchError?.message || 'No data returned'}`);
    process.exit(1);
  }

  console.log(`   Title: ${sdData.title}`);
  console.log(`   Type: ${sdData.sd_type || 'not set'}`);
  console.log('');

  // Step 2: Check existing state
  console.log('Step 2: Checking existing vision_discovery state...');
  const existing = sdData.metadata?.vision_discovery;
  const existingStatus = existing?.approval?.status;
  const existingVersion = existing?.approval?.version || 0;

  if (existingStatus) {
    console.log(`   Existing status: ${existingStatus}`);
    console.log(`   Existing version: ${existingVersion}`);

    if (existingStatus === 'approved' && !force) {
      console.log('');
      console.log('   BLOCKED: Vision brief already approved.');
      console.log('   Use --force to regenerate.');
      process.exit(1);
    }

    if (existingStatus === 'approved' && force) {
      console.log('   --force specified: Will regenerate despite approved status');
    }
  } else {
    console.log('   No existing vision_discovery found');
  }
  console.log('');

  // Step 3: Generate personas
  console.log('Step 3: Generating stakeholder personas...');

  let personas = [];
  let chairmanPerspective = null;
  let source = 'defaults';
  let tokenUsage = 0;

  // Try AI generation first
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const aiResult = await generatePersonasWithAI(sdData, openai);
      personas = aiResult.personas;
      chairmanPerspective = aiResult.chairmanPerspective;
      tokenUsage = aiResult.tokenUsage;
      source = 'ai';
      console.log(`   AI generated ${personas.length} personas`);
      console.log(`   Token usage: ${tokenUsage}`);
    } catch (aiError) {
      console.warn(`   AI generation failed: ${aiError.message}`);
      console.log('   Falling back to default personas...');
    }
  } else {
    console.log('   OPENAI_API_KEY not set, using defaults');
  }

  // Fallback to defaults if AI failed or unavailable
  if (personas.length === 0) {
    personas = generateDefaultPersonas(sdData);
    chairmanPerspective = generateChairmanPerspective(sdData);
    source = 'defaults';
    console.log(`   Generated ${personas.length} default personas`);
  }
  console.log('');

  // Step 4: Build vision_discovery payload
  console.log('Step 4: Building vision_discovery payload...');

  const newVersion = existingVersion + 1;
  const visionDiscovery = {
    stakeholder_personas: personas,
    chairman_perspective: chairmanPerspective,
    approval: {
      status: 'draft',
      generated_at: new Date().toISOString(),
      generated_by: 'generate-vision-brief.js',
      version: newVersion,
      approved_at: null,
      approved_by: null,
      reviewer_notes: null
    },
    _meta: {
      source: source,
      model: source === 'ai' ? MODEL : null,
      token_usage: tokenUsage,
      sd_type: sdData.sd_type
    }
  };

  console.log(`   Version: ${newVersion}`);
  console.log(`   Source: ${source}`);
  console.log(`   Personas: ${personas.length}`);
  console.log('');

  // Display generated personas
  console.log('Generated Personas:');
  console.log('-'.repeat(40));
  for (const persona of personas) {
    console.log(`   - ${persona.name} (${persona.persona_id})`);
    console.log(`     Needs: ${persona.needs.slice(0, 2).join(', ')}...`);
  }
  console.log('');

  // Step 5: Write to database (or show output)
  if (dryRun) {
    console.log('DRY-RUN: Would write the following to sd.metadata.vision_discovery:');
    console.log('-'.repeat(60));
    console.log(JSON.stringify(visionDiscovery, null, 2));
    console.log('-'.repeat(60));
    console.log('');
    console.log('DRY-RUN complete. No changes made.');
  } else if (!confirm) {
    // Safety latch: require --confirm for actual writes
    console.log('PREVIEW: Generated payload for sd.metadata.vision_discovery:');
    console.log('-'.repeat(60));
    console.log(JSON.stringify(visionDiscovery, null, 2));
    console.log('-'.repeat(60));
    console.log('');
    console.log('To write to DB, re-run with --confirm');
    process.exit(1);
  } else {
    console.log('Step 5: Writing to database...');

    // Merge with existing metadata
    const updatedMetadata = {
      ...(sdData.metadata || {}),
      vision_discovery: visionDiscovery
    };

    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: updatedMetadata })
      .eq('id', sdId);

    if (updateError) {
      console.error(`   ERROR: Failed to update SD: ${updateError.message}`);
      process.exit(1);
    }

    console.log('   SUCCESS: Vision brief saved to SD.metadata.vision_discovery');
    console.log('');
    console.log('='.repeat(60));
    console.log('NEXT STEPS');
    console.log('='.repeat(60));
    console.log('');
    console.log('1. Review the generated personas in Supabase Studio');
    console.log(`2. When ready, approve: node scripts/approve-vision-brief.js ${sdId}`);
    console.log('');
  }

  console.log('Done.');
}

// Execute
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
