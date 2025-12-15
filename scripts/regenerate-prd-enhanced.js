#!/usr/bin/env node

/**
 * Enhanced PRD Regeneration - Aggressive Scoring Focus
 *
 * This script regenerates PRD content with a more aggressive prompt
 * that specifically targets the 4 quality dimensions scored by the Russian Judge.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SD_ID = process.argv[2] || 'SD-VISION-V2-001';

// ENHANCED SYSTEM PROMPT - Aggressive on all 4 scoring dimensions
const SYSTEM_PROMPT = `You are a Technical Product Manager creating an IMPLEMENTATION-READY PRD.

## CRITICAL SCORING CRITERIA - YOU MUST EXCEL IN ALL 4 DIMENSIONS

### 1. REQUIREMENTS DEPTH (40% weight) - TARGET: 8+/10
REQUIRED for high score:
- Each requirement MUST have 3-5 specific acceptance criteria
- NO vague language like "should work", "handles correctly"
- Include exact field names, API endpoints, error codes
- Specify data types, validation rules, constraints
- Example of GOOD: "FR-1: Create vision_specs table with columns: id (UUID, PK), spec_number (VARCHAR(20), NOT NULL, UNIQUE), title (TEXT, NOT NULL), content (JSONB), created_at (TIMESTAMPTZ, DEFAULT NOW())"
- Example of BAD: "Create a table to store vision specs"

### 2. ARCHITECTURE QUALITY (30% weight) - TARGET: 8+/10
REQUIRED for high score:
- Specific component names with technology stack
- Data flow diagram description (what calls what, in what order)
- Integration points with EXACT API routes or function names
- Trade-off analysis (why this approach vs alternatives)
- Scalability considerations with specific metrics
- Example: "VisionSpecService (TypeScript) → calls Supabase RPC get_vision_specs() → returns VisionSpec[] with RLS filtering by user_id"

### 3. TEST SCENARIOS (20% weight) - TARGET: 8+/10
REQUIRED for high score:
- Given/When/Then format for EVERY scenario
- Include: happy path, edge cases, error conditions, boundary tests
- Specific test data values (not "valid input" but "spec_number='VS-001'")
- Expected error messages and HTTP status codes
- Performance test with specific thresholds (e.g., "<200ms p95")
- Security test scenarios (unauthorized access, injection attempts)

### 4. RISK ANALYSIS (10% weight) - TARGET: 8+/10
REQUIRED for high score:
- Technical risks specific to THIS implementation
- Probability AND impact ratings with justification
- Concrete mitigation with specific actions (not "test thoroughly")
- Rollback plan with exact steps
- Monitoring strategy with specific metrics/alerts

## OUTPUT FORMAT
Return valid JSON with these exact fields:
{
  "executive_summary": "200-400 chars, specific to this SD",
  "functional_requirements": [
    {
      "id": "FR-1",
      "requirement": "Specific, implementable statement",
      "description": "Detailed technical description",
      "priority": "CRITICAL|HIGH|MEDIUM",
      "acceptance_criteria": ["Specific criterion 1", "Specific criterion 2", "Specific criterion 3"]
    }
  ],
  "technical_requirements": [
    {
      "id": "TR-1",
      "requirement": "Technical constraint",
      "rationale": "Why needed"
    }
  ],
  "system_architecture": {
    "overview": "High-level description with tech stack",
    "components": [
      {
        "name": "ComponentName",
        "responsibility": "What it does",
        "technology": "Specific tech (e.g., TypeScript, Supabase RPC)"
      }
    ],
    "data_flow": "Step-by-step data flow description",
    "integration_points": ["Specific integration 1", "Specific integration 2"],
    "trade_offs": "Why this approach was chosen over alternatives"
  },
  "test_scenarios": [
    {
      "id": "TS-1",
      "scenario": "Descriptive name",
      "test_type": "unit|integration|e2e|performance|security",
      "given": "Specific precondition with test data",
      "when": "Specific action",
      "then": "Specific expected outcome with values"
    }
  ],
  "acceptance_criteria": ["Measurable criterion 1", "Measurable criterion 2"],
  "risks": [
    {
      "risk": "Specific risk description",
      "probability": "HIGH|MEDIUM|LOW",
      "impact": "HIGH|MEDIUM|LOW",
      "mitigation": "Concrete mitigation steps",
      "rollback_plan": "Exact rollback procedure",
      "monitoring": "Specific metrics to watch"
    }
  ],
  "implementation_approach": {
    "phases": [{"phase": "Phase 1", "description": "...", "deliverables": [...]}],
    "technical_decisions": ["Decision 1 with rationale"]
  }
}

CRITICAL: Generate AT LEAST 8 functional requirements, 8 test scenarios, and 4 risks.`;

async function main() {
  console.log('🔄 Enhanced PRD Regeneration (Aggressive Scoring Focus)');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`📋 SD ID: ${SD_ID}\n`);

  // Get SD
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(SD_ID);
  const queryField = isUUID ? 'id' : 'legacy_id';

  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq(queryField, SD_ID)
    .single();

  if (sdError || !sd) {
    console.error('❌ SD not found:', sdError?.message);
    process.exit(1);
  }

  console.log('📋 SD:', sd.title);
  console.log('   Type:', sd.sd_type || sd.category || 'feature');

  // Get PRD
  let { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('sd_id', sd.id)
    .single();

  if (!prd) {
    const fallback = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('directive_id', SD_ID)
      .single();
    prd = fallback.data;
  }

  if (!prd) {
    console.error('❌ PRD not found');
    process.exit(1);
  }

  console.log('📄 PRD:', prd.id);

  // Get existing stories
  const { data: stories } = await supabase
    .from('user_stories')
    .select('story_key, title, acceptance_criteria')
    .eq('sd_id', sd.id);

  console.log('📚 Stories:', stories?.length || 0);

  // Build user prompt
  const userPrompt = `Generate a comprehensive PRD for:

## STRATEGIC DIRECTIVE
**ID**: ${SD_ID}
**Title**: ${sd.title}
**Type**: ${sd.sd_type || sd.category || 'database'}
**Description**: ${sd.description || 'Database schema foundation'}
**Scope**: ${sd.scope || 'Create database tables and RLS policies'}

**Strategic Objectives**:
${sd.strategic_objectives ? (Array.isArray(sd.strategic_objectives)
  ? sd.strategic_objectives.map((o, i) => `${i+1}. ${typeof o === 'string' ? o : o.objective || JSON.stringify(o)}`).join('\n')
  : JSON.stringify(sd.strategic_objectives))
: '- Establish database schema'}

## EXISTING USER STORIES (Ensure Consistency)
${stories?.map(s => `- ${s.story_key}: ${s.title}`).join('\n') || 'No stories'}

## TASK
Generate a PRD that scores 8+/10 on ALL four quality dimensions.
Be extremely specific - include table names, column types, API routes, error codes, test data values.
This is a DATABASE SD - focus on schema design, migrations, RLS policies, data integrity.`;

  console.log('\n🧠 Generating with enhanced prompt...');
  console.log('   Model: gpt-5.2');
  console.log('   Temperature: 0.5 (more precise)');
  console.log('   Max tokens: 32000\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.2',
      temperature: 0.5,
      max_completion_tokens: 32000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ]
    });

    const content = response.choices[0]?.message?.content;
    const finishReason = response.choices[0]?.finish_reason;

    if (!content) {
      console.error('❌ Empty response from LLM');
      process.exit(1);
    }

    if (finishReason === 'length') {
      console.warn('⚠️  Response truncated - attempting parse anyway');
    }

    console.log('✅ Response received, parsing JSON...');

    // Parse JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('❌ No JSON found in response');
      console.log('Preview:', content.substring(0, 1000));
      process.exit(1);
    }

    const prdContent = JSON.parse(jsonMatch[0]);

    console.log('\n📊 Generated Content:');
    console.log('   Executive Summary:', prdContent.executive_summary?.length || 0, 'chars');
    console.log('   Functional Requirements:', prdContent.functional_requirements?.length || 0);
    console.log('   Technical Requirements:', prdContent.technical_requirements?.length || 0);
    console.log('   Test Scenarios:', prdContent.test_scenarios?.length || 0);
    console.log('   Risks:', prdContent.risks?.length || 0);
    console.log('   Architecture Components:', prdContent.system_architecture?.components?.length || 0);

    // Update PRD
    console.log('\n📝 Updating PRD in database...');

    const update = {
      updated_at: new Date().toISOString()
    };

    if (prdContent.executive_summary) {
      update.executive_summary = prdContent.executive_summary;
    }
    if (prdContent.functional_requirements?.length > 0) {
      update.functional_requirements = prdContent.functional_requirements;
    }
    if (prdContent.technical_requirements?.length > 0) {
      update.technical_requirements = prdContent.technical_requirements;
    }
    if (prdContent.system_architecture) {
      update.system_architecture = prdContent.system_architecture;
    }
    if (prdContent.test_scenarios?.length > 0) {
      update.test_scenarios = prdContent.test_scenarios;
    }
    if (prdContent.acceptance_criteria?.length > 0) {
      update.acceptance_criteria = prdContent.acceptance_criteria;
    }
    if (prdContent.risks?.length > 0) {
      update.risks = prdContent.risks;
    }
    if (prdContent.implementation_approach) {
      update.implementation_approach = prdContent.implementation_approach;
    }

    const { error: updateError } = await supabase
      .from('product_requirements_v2')
      .update(update)
      .eq('id', prd.id);

    if (updateError) {
      console.error('❌ Update failed:', updateError.message);
      process.exit(1);
    }

    console.log('✅ PRD updated successfully!\n');

    console.log('═══════════════════════════════════════════════════════');
    console.log('📝 Next: Run handoff validation');
    console.log('   node scripts/handoff.js execute PLAN-TO-EXEC ' + SD_ID);
    console.log('═══════════════════════════════════════════════════════');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.response?.data) {
      console.error('API Error:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
}

main().catch(console.error);
