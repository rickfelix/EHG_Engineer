#!/usr/bin/env node

/**
 * Semantic Target Application Validator
 *
 * Uses GPT 5.2 (or configured model) to semantically determine whether an SD
 * should target EHG (runtime app) or EHG_Engineer (governance/infrastructure).
 *
 * This is a HARD GATE - it blocks if confidence is below threshold.
 *
 * TIMING: Should run at SD creation (earliest possible point)
 *
 * Usage:
 *   import { validateTargetApplication } from './validators/semantic-target-application-validator.js';
 *   const result = await validateTargetApplication(sdData);
 *   if (!result.pass) { throw new Error(result.reason); }
 *
 * @module semantic-target-application-validator
 * @version 1.0.0
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

// Model selection: GPT 5.2 preferred, fallback to gpt-5-mini
const MODEL = process.env.TARGET_APP_VALIDATOR_MODEL || 'gpt-5.2';
const FALLBACK_MODEL = 'gpt-5-mini';

// Confidence threshold (0-100) - below this, validation FAILS
const CONFIDENCE_THRESHOLD = parseInt(process.env.TARGET_APP_CONFIDENCE_THRESHOLD || '80', 10);

// API configuration
const API_TIMEOUT_MS = parseInt(process.env.AI_API_TIMEOUT_MS || '30000', 10);
const MAX_RETRIES = 3;

// ============================================================================
// REPOSITORY DEFINITIONS (for LLM context)
// ============================================================================

const REPOSITORY_DEFINITIONS = {
  EHG: {
    name: 'EHG',
    description: 'The main runtime application for solo entrepreneurs',
    contains: [
      'React frontend components and pages',
      'User-facing UI features (dashboards, forms, visualizations)',
      'Supabase Edge Functions for business logic',
      'Database tables for business data (ventures, stages, decisions)',
      'RLS policies for user data access',
      'API endpoints consumed by the frontend',
      'Authentication and user session management',
      'Mobile-responsive UI components'
    ],
    personas: ['Solo Entrepreneur', 'Venture End User', 'Portfolio Manager'],
    keywords: ['venture', 'stage', 'decision', 'dashboard', 'UI', 'frontend', 'user interface',
               'react component', 'edge function', 'portfolio', 'chairman dashboard']
  },
  EHG_Engineer: {
    name: 'EHG_Engineer',
    description: 'Governance and infrastructure tooling (LEO Protocol)',
    contains: [
      'LEO Protocol implementation (handoffs, phases, gates)',
      'Claude Code integration (CLAUDE.md, sub-agents)',
      'CLI scripts for development workflow',
      'Quality assessment tools (Russian Judge)',
      'PRD/SD generation and validation scripts',
      'Retrospective and documentation generators',
      'Database migration tooling',
      'CI/CD pipeline configuration',
      'Test infrastructure (Playwright, Jest)'
    ],
    personas: ['DevOps Engineer', 'LEO Protocol Operator', 'AI Agent'],
    keywords: ['LEO', 'handoff', 'CLAUDE', 'sub-agent', 'script', 'CLI', 'migration',
               'retrospective', 'quality gate', 'PRD', 'protocol', 'governance']
  }
};

// ============================================================================
// MAIN VALIDATOR CLASS
// ============================================================================

export class SemanticTargetApplicationValidator {
  constructor(options = {}) {
    this.model = options.model || MODEL;
    this.confidenceThreshold = options.confidenceThreshold || CONFIDENCE_THRESHOLD;
    this.openai = null;
    this.initialized = false;
  }

  /**
   * Initialize OpenAI client
   */
  async initialize() {
    if (this.initialized) return;

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured - cannot run semantic validation');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: API_TIMEOUT_MS
    });

    // Test model availability, fall back if needed
    try {
      await this._testModel(this.model);
    } catch (error) {
      console.warn(`   ⚠️  Model ${this.model} not available, falling back to ${FALLBACK_MODEL}`);
      this.model = FALLBACK_MODEL;
    }

    this.initialized = true;
  }

  /**
   * Test if a model is available
   */
  async _testModel(model) {
    // Quick validation - just check the model exists via models.retrieve
    const modelInfo = await this.openai.models.retrieve(model);
    return modelInfo;
  }

  /**
   * Build the semantic analysis prompt
   */
  _buildPrompt(sdData) {
    const systemPrompt = `You are an expert software architect who determines which repository a Strategic Directive (SD) belongs to.

## Repository Definitions

### EHG (Runtime Application)
${REPOSITORY_DEFINITIONS.EHG.description}
Contains:
${REPOSITORY_DEFINITIONS.EHG.contains.map(c => `- ${c}`).join('\n')}
Primary Personas: ${REPOSITORY_DEFINITIONS.EHG.personas.join(', ')}

### EHG_Engineer (Governance/Infrastructure)
${REPOSITORY_DEFINITIONS.EHG_Engineer.description}
Contains:
${REPOSITORY_DEFINITIONS.EHG_Engineer.contains.map(c => `- ${c}`).join('\n')}
Primary Personas: ${REPOSITORY_DEFINITIONS.EHG_Engineer.personas.join(', ')}

## Your Task
Analyze the SD and determine which repository it belongs to. Consider:
1. What files/components will be modified?
2. Who are the primary users/personas affected?
3. Is this runtime functionality or development tooling?
4. Does it involve user-facing features or infrastructure?

## Response Format
Return ONLY valid JSON:
{
  "target_application": "EHG" | "EHG_Engineer",
  "confidence": 0-100,
  "reasoning": "1-2 sentence explanation",
  "key_signals": ["signal1", "signal2", "signal3"]
}

IMPORTANT:
- confidence >= 80 means you're certain
- confidence 60-79 means probable but some ambiguity
- confidence < 60 means you genuinely can't determine
- Be honest about uncertainty - it's better to flag ambiguity than guess wrong`;

    const userPrompt = `Analyze this Strategic Directive and determine the correct target_application:

**SD ID:** ${sdData.id || 'N/A'}
**Title:** ${sdData.title || 'N/A'}
**Description:** ${sdData.description || 'N/A'}
**Scope:** ${typeof sdData.scope === 'object' ? JSON.stringify(sdData.scope) : sdData.scope || 'N/A'}
**Category:** ${sdData.category || 'N/A'}
**SD Type:** ${sdData.sd_type || 'N/A'}
**Strategic Objectives:** ${JSON.stringify(sdData.strategic_objectives || [])}

${sdData.target_application ? `**Currently Set:** ${sdData.target_application} (validate if correct)` : '**Currently Set:** NOT SET (determine the correct value)'}

Determine the correct target_application with confidence score.`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Call OpenAI with retry logic
   */
  async _callOpenAI(messages, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Note: gpt-5-mini doesn't support custom temperature, so we omit it
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages: messages,
          response_format: { type: 'json_object' },
          max_completion_tokens: 500
        });

        return response.choices[0].message.content;
      } catch (error) {
        const isLastAttempt = attempt === retries;

        if (error.status === 429) {
          // Rate limited
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(`   Rate limited, waiting ${delay}ms (attempt ${attempt}/${retries})`);
          await new Promise(r => setTimeout(r, delay));
        } else if (isLastAttempt) {
          throw error;
        } else {
          console.warn(`   API error (attempt ${attempt}/${retries}): ${error.message}`);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  }

  /**
   * Validate target_application for an SD
   *
   * @param {Object} sdData - Strategic Directive data
   * @returns {Promise<{pass: boolean, target_application: string, confidence: number, reasoning: string, recommendation: string}>}
   */
  async validate(sdData) {
    await this.initialize();

    console.log('');
    console.log('   ╔═══════════════════════════════════════════════════════════════╗');
    console.log('   ║  🎯 SEMANTIC TARGET APPLICATION VALIDATION                    ║');
    console.log('   ╠═══════════════════════════════════════════════════════════════╣');
    console.log(`   ║  Model: ${this.model.padEnd(52)}║`);
    console.log(`   ║  Confidence Threshold: ${String(this.confidenceThreshold + '%').padEnd(40)}║`);
    console.log('   ╚═══════════════════════════════════════════════════════════════╝');
    console.log('');

    const { systemPrompt, userPrompt } = this._buildPrompt(sdData);

    try {
      const startTime = Date.now();
      const rawResponse = await this._callOpenAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      const duration = Date.now() - startTime;

      // Parse response
      let result;
      try {
        result = JSON.parse(rawResponse);
      } catch (parseError) {
        console.error('   ❌ Failed to parse LLM response as JSON');
        return {
          pass: false,
          target_application: null,
          confidence: 0,
          reasoning: 'LLM response was not valid JSON',
          recommendation: 'Set target_application manually and retry'
        };
      }

      const { target_application, confidence, reasoning, key_signals } = result;

      // Validate response structure
      if (!target_application || !['EHG', 'EHG_Engineer'].includes(target_application)) {
        console.error('   ❌ Invalid target_application in response:', target_application);
        return {
          pass: false,
          target_application: null,
          confidence: 0,
          reasoning: 'LLM returned invalid target_application value',
          recommendation: 'Set target_application manually to EHG or EHG_Engineer'
        };
      }

      // Log results
      console.log(`   Target Application: ${target_application}`);
      console.log(`   Confidence: ${confidence}%`);
      console.log(`   Reasoning: ${reasoning}`);
      if (key_signals?.length > 0) {
        console.log(`   Key Signals: ${key_signals.join(', ')}`);
      }
      console.log(`   Duration: ${duration}ms`);
      console.log('');

      // Determine pass/fail
      const pass = confidence >= this.confidenceThreshold;

      if (pass) {
        console.log(`   ✅ PASSED: Confidence ${confidence}% >= threshold ${this.confidenceThreshold}%`);
      } else {
        console.log(`   ❌ FAILED: Confidence ${confidence}% < threshold ${this.confidenceThreshold}%`);
        console.log('');
        console.log('   ╔═══════════════════════════════════════════════════════════════╗');
        console.log('   ║  ⛔ HARD GATE: target_application validation failed           ║');
        console.log('   ╠═══════════════════════════════════════════════════════════════╣');
        console.log('   ║  The LLM could not determine target_application with         ║');
        console.log('   ║  sufficient confidence. This SD cannot proceed until         ║');
        console.log('   ║  target_application is explicitly set.                       ║');
        console.log('   ║                                                              ║');
        console.log('   ║  Options:                                                    ║');
        console.log('   ║  1. Set target_application = "EHG" for runtime features      ║');
        console.log('   ║  2. Set target_application = "EHG_Engineer" for governance   ║');
        console.log('   ║  3. Clarify SD scope/description and retry validation        ║');
        console.log('   ╚═══════════════════════════════════════════════════════════════╝');
      }
      console.log('');

      // Check for mismatch with existing value
      const existingValue = sdData.target_application;
      const mismatch = existingValue && existingValue !== target_application && confidence >= 80;

      if (mismatch) {
        console.log(`   ⚠️  MISMATCH: Current value "${existingValue}" differs from LLM recommendation "${target_application}"`);
        console.log(`   Consider updating target_application to "${target_application}"`);
      }

      return {
        pass,
        target_application,
        confidence,
        reasoning,
        key_signals: key_signals || [],
        recommendation: pass
          ? `Set target_application = "${target_application}"`
          : 'Manually review and set target_application',
        mismatch,
        existing_value: existingValue,
        model_used: this.model,
        duration_ms: duration
      };

    } catch (error) {
      console.error(`   ❌ Validation error: ${error.message}`);
      return {
        pass: false,
        target_application: null,
        confidence: 0,
        reasoning: `Validation failed: ${error.message}`,
        recommendation: 'Set target_application manually and retry'
      };
    }
  }
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

/**
 * Validate target_application for an SD (convenience wrapper)
 *
 * @param {Object} sdData - Strategic Directive data
 * @param {Object} options - Optional configuration
 * @returns {Promise<ValidationResult>}
 */
export async function validateTargetApplication(sdData, options = {}) {
  const validator = new SemanticTargetApplicationValidator(options);
  return validator.validate(sdData);
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const sdId = args.find(arg => !arg.startsWith('--'));

  if (!sdId) {
    console.log('Usage: node semantic-target-application-validator.js <SD-ID> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --model <model>       Override model (default: gpt-5.2)');
    console.log('  --threshold <N>       Confidence threshold 0-100 (default: 80)');
    console.log('');
    console.log('Environment:');
    console.log('  TARGET_APP_VALIDATOR_MODEL      Model to use');
    console.log('  TARGET_APP_CONFIDENCE_THRESHOLD Confidence threshold');
    console.log('  OPENAI_API_KEY                  Required for API access');
    process.exit(1);
  }

  // Parse options
  const modelIndex = args.indexOf('--model');
  const model = modelIndex !== -1 ? args[modelIndex + 1] : undefined;

  const thresholdIndex = args.indexOf('--threshold');
  const threshold = thresholdIndex !== -1 ? parseInt(args[thresholdIndex + 1], 10) : undefined;

  // Load SD from database
  const { createSupabaseServiceClient } = await import('../lib/supabase-connection.js');
  const supabase = await createSupabaseServiceClient('engineer');

  const { data: sdData, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, description, scope, category, sd_type, target_application, strategic_objectives')
    .eq('id', sdId)
    .single();

  if (error || !sdData) {
    console.error(`❌ SD not found: ${sdId}`);
    process.exit(1);
  }

  console.log('');
  console.log('═'.repeat(70));
  console.log('SEMANTIC TARGET APPLICATION VALIDATOR');
  console.log('═'.repeat(70));
  console.log(`   SD: ${sdId}`);
  console.log(`   Title: ${sdData.title}`);
  console.log(`   Current target_application: ${sdData.target_application || '(not set)'}`);
  console.log('');

  const result = await validateTargetApplication(sdData, {
    model,
    confidenceThreshold: threshold
  });

  // Exit with appropriate code
  process.exit(result.pass ? 0 : 1);
}

// Run if called directly
const isDirectRun = process.argv[1] && process.argv[1].includes('semantic-target-application-validator');
if (isDirectRun) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default SemanticTargetApplicationValidator;
