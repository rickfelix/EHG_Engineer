#!/usr/bin/env node
/**
 * Complete PRD for Phase 1: AI Quality Judge
 * SD: SD-LEO-SELF-IMPROVE-AIJUDGE-001
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function completePRD() {
  console.log('Updating PRD for Phase 1: AI Quality Judge...');

  const prdUpdate = {
    executive_summary: `Phase 1 of the LEO Self-Improvement Loop implements the AI Quality Judge module, a critical component that evaluates improvement proposals against the 9 immutable constitution rules (CONST-001 through CONST-009).

The Judge uses the Russian Judge pattern: multi-criterion weighted scoring (0-10 per criterion) with explicit reasoning for each evaluation. It integrates with the existing protocol-improvements.js CLI and stores assessments in improvement_quality_assessments table.

Key innovation: Uses triangulation protocol to select different model families for proposer vs evaluator, avoiding shared blind spots that could lead to systematically approving unsafe changes. All improvements in Phase 1 require human approval (GOVERNED tier) - no AUTO-apply capability yet.`,

    business_context: `Without objective evaluation criteria, improvement proposals risk either:
- Over-permissive approval (unsafe changes slip through)
- Over-restrictive rejection (beneficial improvements stagnate)

The AI Quality Judge provides consistent, explainable scoring while enforcing constitutional compliance. This enables controlled self-improvement of the LEO protocol without requiring manual review of every proposal's technical details.`,

    technical_context: `Builds on Phase 0 foundation:
- protocol_constitution table (9 immutable rules)
- improvement_quality_assessments table (stores AI evaluations)
- protocol_improvement_queue table (tracks proposals through lifecycle)

Integrates with existing:
- protocol-improvements.js CLI (list/review/approve/reject commands)
- ai-quality-evaluator.js (Russian Judge scoring engine)
- triangulation protocol (model selection patterns)`,

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Constitution Rule Validation',
        description: 'Evaluate each improvement proposal against all 9 constitution rules (CONST-001 through CONST-009) and flag violations with specific rule references',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Validates against all 9 CONST rules',
          '95% accuracy on test suite of known-violating proposals'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Multi-Criterion Quality Scoring',
        description: 'Score improvement proposals using Russian Judge pattern with weighted criteria and explicit reasoning',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Scores clarity, impact, risk, reversibility, evidence (0-10 each)',
          'Weighted aggregate score (0-100)',
          'Explicit reasoning for each criterion',
          'Recommendation: APPROVE, REJECT, or NEEDS_REVISION'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'GOVERNED Pipeline Integration',
        description: 'All evaluated improvements require human approval before application',
        priority: 'HIGH',
        acceptance_criteria: [
          'Human approval required for all improvements',
          'reviewed_by and reviewed_at timestamps populated',
          'Audit trail in improvement_quality_assessments'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Model Diversity for Bias Prevention',
        description: 'Use triangulation protocol to ensure evaluator uses different model family than proposer',
        priority: 'HIGH',
        acceptance_criteria: [
          'Evaluator model recorded in evaluator_model column',
          'Different model families used',
          'Model selection reasoning logged'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'CLI Integration',
        description: 'Integrate AI Quality Judge with existing protocol-improvements.js CLI commands',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'evaluate command triggers AI assessment',
          'Results displayed in review command',
          'Score visible in list command'
        ]
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Use existing improvement_quality_assessments table from Phase 0',
        description: 'Store all evaluations in the table created by 20260122_self_improvement_foundation.sql',
        dependencies: ['Phase 0 migration applied']
      },
      {
        id: 'TR-2',
        requirement: 'Integrate with ai-quality-evaluator.js',
        description: 'Use existing Russian Judge scoring engine with GPT-5-mini (temp 0.3)',
        dependencies: ['scripts/modules/ai-quality-evaluator.js']
      },
      {
        id: 'TR-3',
        requirement: 'Load constitution rules from database',
        description: 'Query protocol_constitution table for validation rules',
        dependencies: ['protocol_constitution table with 9 seeded rules']
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Constitution Violation Detection',
        description: 'Submit improvement that violates CONST-002',
        expected_result: 'Judge rejects with CONST-002 violation reference',
        test_type: 'unit'
      },
      {
        id: 'TS-2',
        scenario: 'High Quality Improvement Scoring',
        description: 'Submit well-formed improvement with evidence',
        expected_result: 'Judge scores 70+ with APPROVE recommendation',
        test_type: 'unit'
      },
      {
        id: 'TS-3',
        scenario: 'Low Quality Improvement Rejection',
        description: 'Submit vague improvement without evidence',
        expected_result: 'Judge scores <70 with REJECT recommendation',
        test_type: 'unit'
      },
      {
        id: 'TS-4',
        scenario: 'GOVERNED Pipeline Enforcement',
        description: 'Attempt to apply without human approval',
        expected_result: 'Application blocked',
        test_type: 'integration'
      },
      {
        id: 'TS-5',
        scenario: 'Model Diversity Verification',
        description: 'Verify evaluator_model differs from proposer',
        expected_result: 'Different model families recorded',
        test_type: 'unit'
      }
    ],

    system_architecture: `## Architecture Overview

protocol-improvements.js CLI
    |
AIQualityJudge module (NEW)
    |- ConstitutionValidator
    |   -> Queries protocol_constitution (9 rules)
    |- RussianJudgeScorer
    |   -> Multi-criterion weighted scoring
    -> ModelSelector
        -> Triangulation protocol for evaluator selection
    |
improvement_quality_assessments table
    |
Human Review (GOVERNED pipeline)
    |
Application (after human approval)

## Data Flow

1. Improvement submitted to queue (status: PENDING)
2. CLI triggers evaluation: node scripts/protocol-improvements.js evaluate <id>
3. AIQualityJudge validates and scores
4. Result stored in improvement_quality_assessments
5. Human reviews via CLI
6. Human approves/rejects
7. If approved, improvement applied`,

    acceptance_criteria: [
      'All 9 constitution rules validated for each improvement',
      'Multi-criterion scoring produces 0-100 aggregate score',
      'Explicit reasoning provided for each criterion',
      'All improvements require human approval (GOVERNED)',
      'Evaluator uses different model family than proposer',
      'Integration with protocol-improvements.js CLI complete',
      '95% accuracy on test suite'
    ],

    technology_stack: [
      'Node.js 20+',
      'Supabase PostgreSQL',
      'OpenAI GPT-5-mini (evaluator)',
      'Existing ai-quality-evaluator.js module',
      'Existing protocol-improvements.js CLI'
    ],

    status: 'approved',

    metadata: {
      risks: [
        {
          category: 'Technical',
          risk: 'Shared model bias if same LLM family used',
          severity: 'HIGH',
          probability: 'MEDIUM',
          impact: 'Systematically approving unsafe changes',
          mitigation: 'Triangulation protocol enforces model diversity'
        },
        {
          category: 'Technical',
          risk: 'Formatting Trojan Horse - semantic changes misclassified',
          severity: 'HIGH',
          probability: 'LOW',
          impact: 'Dangerous changes slip through',
          mitigation: 'GOVERNED tier requires human approval'
        },
        {
          category: 'Technical',
          risk: 'Constitution validation edge cases',
          severity: 'MEDIUM',
          probability: 'MEDIUM',
          impact: 'Valid improvements incorrectly rejected',
          mitigation: 'Build test suite, require 95% accuracy'
        }
      ],
      progress: 25
    }
  };

  const { error } = await supabase
    .from('prds')
    .update(prdUpdate)
    .eq('id', 'PRD-SD-LEO-SELF-IMPROVE-AIJUDGE-001');

  if (error) {
    console.error('Error updating PRD:', error.message);
    process.exit(1);
  }

  console.log('PRD updated and approved successfully!');
}

completePRD().catch(console.error);
