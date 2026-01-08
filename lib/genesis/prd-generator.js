/**
 * Genesis Virtual Bunker - PRD Generator (STUB)
 *
 * SD: SD-GENESIS-FIX-001 (US-004)
 * Status: STUB - NOT IMPLEMENTED
 *
 * This module is a placeholder for AI-powered PRD generation from seed text.
 * Currently returns structured placeholder content that clearly indicates
 * the feature is not yet implemented.
 *
 * Future Implementation Notes:
 * - Integrate with EVA or external AI API for generation
 * - Parse seed text to extract key requirements
 * - Generate structured PRD following EHG PRD schema
 * - Support tier-specific generation (A: summary, B: detailed)
 *
 * @module lib/genesis/prd-generator
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

let supabase = null;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

/**
 * @typedef {Object} GeneratedPRD
 * @property {string} title - PRD title
 * @property {string} executiveSummary - Executive summary
 * @property {string[]} functionalRequirements - List of functional requirements
 * @property {string[]} acceptanceCriteria - List of acceptance criteria
 * @property {string[]} testScenarios - List of test scenarios
 * @property {Object} metadata - Generation metadata
 * @property {boolean} isStub - Whether this is a stub (always true currently)
 */

/**
 * Generate a PRD from seed text.
 *
 * STUB IMPLEMENTATION - Returns placeholder content.
 *
 * @param {string} seedText - The venture idea/description
 * @param {Object} options - Generation options
 * @param {string} [options.tier='A'] - Simulation tier (A: summary, B: detailed)
 * @param {string} [options.simulationId] - Link to simulation session
 * @returns {Promise<GeneratedPRD>} Generated PRD (stub)
 */
export async function generatePRD(seedText, options = {}) {
  const tier = options.tier || 'A';

  console.log(`[Genesis PRD] STUB: PRD generation requested for tier ${tier}`);
  console.log(`[Genesis PRD] STUB: Seed text: "${seedText.substring(0, 50)}..."`);
  console.log('[Genesis PRD] STUB: Returning placeholder content');

  // Generate title from seed text
  const title = generateTitleFromSeed(seedText);

  // Create stub PRD structure
  const prd = {
    title,
    executiveSummary: `[STUB] This PRD was auto-generated from seed text: "${seedText.substring(0, 100)}..."

This is a PLACEHOLDER PRD. AI-powered generation is not yet implemented.

To implement full PRD generation:
1. Integrate with EVA or external AI API
2. Parse seed text for key business/technical requirements
3. Generate structured requirements following EHG PRD schema
4. Add validation and quality scoring`,

    functionalRequirements: [
      '[STUB] FR-1: Core functionality based on seed text',
      '[STUB] FR-2: User authentication and authorization',
      '[STUB] FR-3: Data persistence and retrieval',
      '[STUB] FR-4: User interface and experience',
      '[STUB] FR-5: Integration with external services'
    ],

    acceptanceCriteria: [
      '[STUB] AC-1: Application launches without errors',
      '[STUB] AC-2: Core user journey completes successfully',
      '[STUB] AC-3: Data is persisted and retrievable',
      '[STUB] AC-4: UI renders correctly on mobile and desktop'
    ],

    testScenarios: tier === 'B' ? [
      '[STUB] TS-1: Unit tests for core business logic',
      '[STUB] TS-2: Integration tests for API endpoints',
      '[STUB] TS-3: E2E tests for critical user journeys',
      '[STUB] TS-4: Performance tests under load'
    ] : [
      '[STUB] TS-1: Basic smoke test for launch'
    ],

    metadata: {
      generatedAt: new Date().toISOString(),
      tier,
      seedTextLength: seedText.length,
      isStub: true,
      stubReason: 'AI-powered PRD generation not yet implemented',
      implementationNotes: [
        'Requires EVA integration or external AI API',
        'Should parse seed text for domain, features, users',
        'Should generate requirements following EHG PRD schema',
        'Consider using Claude/GPT for natural language processing'
      ]
    },

    isStub: true
  };

  // Optionally store in database if simulationId provided
  if (options.simulationId) {
    await storePRDContent(options.simulationId, prd);
  }

  return prd;
}

/**
 * Generate a title from seed text.
 *
 * @param {string} seedText - Seed text
 * @returns {string} Generated title
 */
function generateTitleFromSeed(seedText) {
  // Extract first meaningful phrase
  const cleaned = seedText
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(' ');

  return `PRD: ${cleaned}`;
}

/**
 * Store PRD content in simulation session.
 *
 * @param {string} simulationId - Simulation session UUID
 * @param {GeneratedPRD} prd - Generated PRD
 * @returns {Promise<void>}
 */
async function storePRDContent(simulationId, prd) {
  const db = getSupabase();

  const { error } = await db
    .from('simulation_sessions')
    .update({ prd_content: prd })
    .eq('id', simulationId);

  if (error) {
    console.warn(`[Genesis PRD] STUB: Could not store PRD content: ${error.message}`);
  } else {
    console.log(`[Genesis PRD] STUB: PRD content stored for simulation ${simulationId}`);
  }
}

/**
 * Validate PRD quality (stub).
 *
 * @param {GeneratedPRD} prd - PRD to validate
 * @returns {{ score: number, issues: string[], isStub: boolean }}
 */
export function validatePRD(prd) {
  if (prd.isStub) {
    return {
      score: 0,
      issues: ['PRD is a stub - AI generation not implemented'],
      isStub: true
    };
  }

  // Future: implement real validation
  return {
    score: 50,
    issues: ['Validation not fully implemented'],
    isStub: false
  };
}

/**
 * Check if PRD generation is available.
 *
 * @returns {boolean} Always false (stub)
 */
export function isPRDGenerationAvailable() {
  return false;
}

/**
 * Get implementation status for PRD generation.
 *
 * @returns {Object} Status information
 */
export function getPRDGenerationStatus() {
  return {
    available: false,
    status: 'STUB',
    reason: 'AI-powered PRD generation not yet implemented',
    requiredFor: 'Full Genesis simulation (Tier B)',
    workaround: 'Manual PRD creation via LEO Protocol',
    implementationEffort: 'Medium (requires AI API integration)',
    blockedBy: ['EVA integration', 'AI API selection'],
    createdAt: '2026-01-08',
    sd: 'SD-GENESIS-FIX-001'
  };
}

export default {
  generatePRD,
  validatePRD,
  isPRDGenerationAvailable,
  getPRDGenerationStatus
};
