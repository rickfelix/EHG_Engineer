/**
 * PRD SD-041C Data Module
 *
 * Exports all PRD content for the AI-Powered Documentation Generator.
 * Used by create-prd-sd-041c.js
 */

import {
  overview,
  functionalRequirements,
  acceptanceCriteria
} from './prd-content.js';

import { testScenarios } from './test-scenarios.js';
import { databaseSchema } from './database-schema.js';
import { technicalDesign } from './technical-design.js';

export {
  overview,
  functionalRequirements,
  acceptanceCriteria,
  testScenarios,
  databaseSchema,
  technicalDesign
};

/**
 * Create the complete PRD data object
 * @returns {Object} PRD data for SD-041C
 */
export function createPrdData() {
  return {
    sd_id: 'SD-041C',
    id: 'PRD-041C-001',
    title: 'AI-Powered Documentation Generator - Product Requirements',
    version: '1.0.0',
    status: 'active',
    overview,
    functional_requirements: functionalRequirements,
    acceptance_criteria: acceptanceCriteria,
    test_scenarios: testScenarios,
    database_schema: databaseSchema,
    technical_design: technicalDesign,
    metadata: {
      prd_version: '1.0.0',
      created_by: 'PLAN Agent',
      created_at: new Date().toISOString(),
      total_functional_requirements: 6,
      total_acceptance_criteria: 30,
      total_test_scenarios: 14,
      database_tables: 6,
      estimated_implementation_hours: 10,
      ai_provider_recommendation: 'Anthropic Claude 3.5 Sonnet',
      requires_design_review: true,
      design_keywords_detected: ['dashboard', 'admin', 'interface', 'UI', 'documentation']
    }
  };
}
