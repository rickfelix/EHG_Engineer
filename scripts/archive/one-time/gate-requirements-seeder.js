#!/usr/bin/env node
/**
 * Seed gate_requirements_templates for user story quality validators
 * SD: SD-LEO-INFRA-USER-STORY-REQUIREMENTS-001
 *
 * Idempotent: uses upsert on (gate_type, template_name) unique constraint.
 *
 * Usage:
 *   node scripts/seed-gate-requirements.js
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const templates = [
  {
    gate_type: 'userStoryQualityValidation',
    template_name: 'structural_requirements',
    is_default: true,
    requirements_template: {
      dimension: 'structural',
      description: 'Database column constraints that must be satisfied for INSERT to succeed',
      requirements: [
        { field: 'implementation_context', type: 'text', constraint: 'NOT NULL', min_chars: 20, description: 'Technical approach and file locations' },
        { field: 'given_when_then', type: 'JSONB array', constraint: 'recommended', min_items: 1, format: '[{given, when, then_clause}]' },
        { field: 'testing_scenarios', type: 'JSONB array', constraint: 'recommended', min_items: 1, format: '["Run X and verify Y"]' },
        { field: 'architecture_references', type: 'JSONB array', constraint: 'optional', format: '["Phase 1: Component"]' },
        { field: 'acceptance_criteria', type: 'JSONB array', constraint: 'min 2 items', description: 'Specific, measurable pass/fail assertions' },
        { field: 'user_benefit', type: 'text', constraint: 'recommended 400+ chars', description: 'User-centric value proposition' }
      ]
    },
    verification_criteria: {
      blocking: ['implementation_context NOT NULL'],
      recommended: ['given_when_then has ≥1 item', 'testing_scenarios has ≥1 item', 'acceptance_criteria has ≥2 items', 'user_benefit ≥400 characters']
    }
  },
  {
    gate_type: 'userStoryQualityValidation',
    template_name: 'semantic_quality_rubric',
    is_default: false,
    requirements_template: {
      dimension: 'semantic',
      description: 'AI-scored quality criteria with weighted dimensions',
      scoring_scale: '0-10 per criterion, weighted to 0-100 total',
      criteria: [
        { name: 'acceptance_criteria_clarity_testability', weight: 50, description: 'Specificity, testability, pass/fail clarity of acceptance criteria', scoring: { low: '0-3: boilerplate, untestable', mid: '4-6: some specific but vague', high: '7-8: mostly testable', excellent: '9-10: fully testable with clear pass/fail' } },
        { name: 'story_independence_implementability', weight: 30, description: 'Self-containment, INVEST principles', scoring: { low: '0-3: dependent, unclear', mid: '4-6: partial independence', high: '7-8: mostly independent', excellent: '9-10: fully self-contained' } },
        { name: 'benefit_articulation', weight: 15, description: 'User value proposition clarity and specificity', scoring: { low: '0-3: generic (improve system)', mid: '4-6: some specificity', high: '7-8: clear user value', excellent: '9-10: quantified, persona-specific' } },
        { name: 'given_when_then_format', weight: 5, description: 'BDD scenario completeness', scoring: { low: '0-3: no scenarios', mid: '4-6: partial', high: '7-8: complete', excellent: '9-10: comprehensive edge cases' } }
      ]
    },
    verification_criteria: {
      method: 'LLM rubric evaluation',
      fallback: 'heuristic scoring when LLM unavailable',
      source_files: ['scripts/modules/rubrics/user-story-quality-rubric.js', 'scripts/modules/user-story-quality-validation.js']
    }
  },
  {
    gate_type: 'userStoryQualityValidation',
    template_name: 'sd_type_thresholds',
    is_default: false,
    requirements_template: {
      dimension: 'contextual',
      description: 'Pass thresholds vary by SD type',
      thresholds: {
        documentation: 50, infrastructure: 50, quality: 50,
        tooling: 55, devops: 55, feature: 55, enhancement: 55, bugfix: 55, fix: 55,
        database: 68, security: 68,
        default: 70
      },
      special_rules: [
        { sd_types: ['feature', 'bugfix', 'security'], rule: 'Must include ≥1 human-verifiable acceptance criterion' },
        { sd_types: ['infrastructure', 'documentation'], rule: 'Technical-only criteria acceptable; "developer" or "system" as user role OK' },
        { sd_types: ['security'], rule: 'Require threat modeling in acceptance criteria' }
      ]
    },
    verification_criteria: {
      source_file: 'scripts/modules/handoff/verifiers/plan-to-exec/story-quality.js',
      lookup_method: 'SD type from strategic_directives_v2.sd_type'
    }
  }
];

async function main() {
  console.log('Seeding gate_requirements_templates for userStoryQualityValidation...\n');

  for (const tmpl of templates) {
    const { error } = await supabase
      .from('gate_requirements_templates')
      .upsert(tmpl, { onConflict: 'gate_type,template_name' });

    if (error) {
      console.error(`  ❌ ${tmpl.template_name}: ${error.message}`);
    } else {
      console.log(`  ✅ ${tmpl.template_name} (${tmpl.requirements_template.dimension})`);
    }
  }

  console.log('\nDone. Query with:');
  console.log("  SELECT * FROM gate_requirements_templates WHERE gate_type = 'userStoryQualityValidation';");
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
