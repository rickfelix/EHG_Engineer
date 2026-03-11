#!/usr/bin/env node
/**
 * Insert PRD for SD-STAGE-ZERO-EXPERIMENTATION-FRAMEWORK-ORCH-001-C
 * Phase 3: Experiment Engine
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_UUID = 'f374d0fa-7019-4001-8996-7da510915d06';
const SD_KEY = 'SD-STAGE-ZERO-EXPERIMENTATION-FRAMEWORK-ORCH-001-C';

async function main() {
  const prdId = crypto.randomUUID();

  const prd = {
    id: prdId,
    directive_id: SD_UUID,
    title: 'Stage Zero Experiment Engine - Phase 3',
    status: 'approved',
    version: '1.0.0',
    executive_summary: 'Build the core experiment engine that enables A/B testing of Stage 0 venture creation prompts. The engine manages experiment lifecycle (create/assign/evaluate/analyze), uses deterministic hash-based assignment for consistency, runs dual evaluation (control vs variant), and applies Bayesian statistical analysis to determine winners with configurable stopping rules.',
    functional_requirements: [
      {
        id: 'FR-001',
        title: 'Experiment Database Schema',
        description: 'Create three tables: experiments (lifecycle, config, status), experiment_assignments (venture-to-variant mapping), experiment_outcomes (scored results per variant). Include proper indexes, constraints, and RLS policies.',
        priority: 'critical',
        acceptance_criteria: [
          'experiments table with id, name, hypothesis, variants JSONB, status enum, created_at, ended_at',
          'experiment_assignments table with experiment_id FK, venture_id, variant_key, assigned_at',
          'experiment_outcomes table with assignment_id FK, variant_key, scores JSONB, evaluated_at',
          'Unique constraint on (experiment_id, venture_id) in assignments',
          'RLS policies for service role access'
        ]
      },
      {
        id: 'FR-002',
        title: 'Experiment Manager Module',
        description: 'Build experiment-manager.js providing CRUD lifecycle: createExperiment, getExperiment, listExperiments, startExperiment, stopExperiment, archiveExperiment. Validates experiment config before creation.',
        priority: 'critical',
        acceptance_criteria: [
          'createExperiment validates name, hypothesis, and at least 2 variants',
          'startExperiment transitions status from draft to running',
          'stopExperiment transitions from running to stopped, records end timestamp',
          'listExperiments supports filtering by status',
          'All operations use supabase client from deps injection'
        ]
      },
      {
        id: 'FR-003',
        title: 'Experiment Assignment Module',
        description: 'Build experiment-assignment.js with deterministic hash-based venture-to-variant bucketing. Given a venture_id and experiment config, always assigns the same variant. Persists assignments to experiment_assignments table.',
        priority: 'critical',
        acceptance_criteria: [
          'assignVariant(ventureId, experiment) returns consistent variant for same inputs',
          'Uses SHA-256 hash of ventureId + experimentId for bucketing',
          'Supports weighted variant distribution (e.g., 50/50, 70/30)',
          'Persists assignment to database on first call, returns cached on subsequent',
          'getAssignment(ventureId, experimentId) retrieves existing assignment'
        ]
      },
      {
        id: 'FR-004',
        title: 'Dual Evaluator Module',
        description: 'Build dual-evaluator.js that runs both control and variant evaluation paths for a venture, collecting scores from each. Scores include venture_score, chairman_confidence, and synthesis_quality.',
        priority: 'high',
        acceptance_criteria: [
          'evaluateDual(venture, experiment, deps) runs both variant paths',
          'Each variant produces {venture_score, chairman_confidence, synthesis_quality}',
          'Results stored in experiment_outcomes table',
          'Non-blocking: failures in one variant do not block the other',
          'Timeout protection: each variant evaluation capped at 60s'
        ]
      },
      {
        id: 'FR-005',
        title: 'Bayesian Analyzer Module',
        description: 'Build bayesian-analyzer.js implementing Beta-Binomial model for experiment analysis. Computes posterior distributions, credible intervals, probability of improvement, and stopping rules.',
        priority: 'high',
        acceptance_criteria: [
          'analyzePosterior(outcomes) computes Beta posterior for each variant',
          'computeCredibleInterval(posterior, level) returns [lower, upper] bounds',
          'probabilityOfImprovement(variantA, variantB) returns P(A > B)',
          'shouldStop(experiment) implements stopping rules: min 20 samples, 95% credible interval, or max 200 samples',
          'generateReport(experiment) returns human-readable analysis summary'
        ]
      },
      {
        id: 'FR-006',
        title: 'Stage Zero Orchestrator Integration',
        description: 'Wire experiment engine into stage-zero-orchestrator.js executeStageZero() as a non-blocking hook. When an active experiment exists, the orchestrator assigns the venture to a variant and triggers dual evaluation after synthesis.',
        priority: 'high',
        acceptance_criteria: [
          'Check for active experiments after path execution step',
          'If experiment active: assign variant, store assignment',
          'After synthesis: trigger dual evaluation in background',
          'Experiment failure does not block normal Stage 0 flow',
          'Experiment metadata attached to Stage 0 result object'
        ]
      },
      {
        id: 'FR-007',
        title: 'CLI Tools',
        description: 'Create three CLI scripts: experiment-create.js (interactive experiment setup), experiment-status.js (show running experiments with sample counts), experiment-results.js (run Bayesian analysis and show winner).',
        priority: 'medium',
        acceptance_criteria: [
          'experiment-create.js: --name, --hypothesis, --variants flags',
          'experiment-status.js: shows all experiments with assignment counts and status',
          'experiment-results.js: --experiment-id flag, runs analysis, shows probability of improvement',
          'All scripts use dotenv and supabase client pattern',
          'Human-readable console output with clear formatting'
        ]
      }
    ],
    system_architecture: 'New lib/eva/experiments/ directory with 4 modules (experiment-manager.js, experiment-assignment.js, dual-evaluator.js, bayesian-analyzer.js). Database tables created via migration SQL. CLI tools in scripts/. Integration point: stage-zero-orchestrator.js gains experiment hook after synthesis step. All modules use dependency injection pattern for testability.',
    acceptance_criteria: [
      'All 3 database tables created with proper constraints and indexes',
      'Experiment CRUD lifecycle works end-to-end',
      'Deterministic assignment produces consistent results across calls',
      'Dual evaluation runs both variants and stores outcomes',
      'Bayesian analysis produces credible intervals and stopping recommendations',
      'Stage 0 orchestrator integrates experiment hook without blocking normal flow',
      'CLI tools provide visibility into experiment state and results'
    ],
    test_scenarios: [
      {
        id: 'TS-001',
        title: 'Experiment lifecycle',
        description: 'Create experiment, start it, assign ventures, stop it, verify state transitions',
        expected_result: 'Status transitions: draft → running → stopped'
      },
      {
        id: 'TS-002',
        title: 'Deterministic assignment',
        description: 'Assign same venture to same experiment multiple times',
        expected_result: 'Same variant returned every time for same venture+experiment pair'
      },
      {
        id: 'TS-003',
        title: 'Bayesian analysis with known data',
        description: 'Feed outcomes where variant A clearly beats B',
        expected_result: 'P(A > B) > 0.95 and shouldStop returns true'
      },
      {
        id: 'TS-004',
        title: 'Orchestrator integration non-blocking',
        description: 'Run Stage 0 with experiment active but evaluator failing',
        expected_result: 'Stage 0 completes successfully, experiment error logged as warning'
      },
      {
        id: 'TS-005',
        title: 'CLI status output',
        description: 'Create experiment, add assignments, run experiment-status.js',
        expected_result: 'Shows experiment name, status, assignment count, and variant distribution'
      }
    ],
    implementation_approach: 'Phase 3 builds on Phase 1 telemetry (gate signals) and Phase 2 prompt variants. Implementation order: 1) Database migration for 3 tables, 2) experiment-manager.js (CRUD), 3) experiment-assignment.js (deterministic bucketing), 4) dual-evaluator.js (parallel evaluation), 5) bayesian-analyzer.js (statistical analysis), 6) Stage 0 orchestrator integration hook, 7) CLI tools for visibility.',
    risks: [
      {
        id: 'RISK-001',
        description: 'Bayesian analysis may require more samples than available ventures',
        mitigation: 'Configurable stopping rules with minimum sample threshold; INSUFFICIENT_DATA fallback'
      },
      {
        id: 'RISK-002',
        description: 'Dual evaluation doubles processing time for Stage 0',
        mitigation: 'Run variant evaluation asynchronously; timeout protection per variant'
      },
      {
        id: 'RISK-003',
        description: 'Hash-based assignment may produce uneven distribution with small samples',
        mitigation: 'Monitor distribution in experiment-status CLI; support manual rebalancing'
      }
    ],
    exploration_summary: 'Architecture plan ARCH-STAGE0-EXPERIMENT-001 defines the experiment engine as Phase 3 of the Stage Zero Experimentation Framework. The engine enables systematic A/B testing of Stage 0 venture creation prompts to optimize venture quality scores. Key design decisions: Beta-Binomial Bayesian model (conjugate prior, closed-form), deterministic hash assignment (reproducibility), and non-blocking orchestrator integration (safety).'
  };

  console.log('Inserting PRD for Child C...');
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select('id, title, status');

  if (error) {
    console.error('PRD insert error:', error.message);
    process.exit(1);
  }

  console.log('PRD inserted:', JSON.stringify(data, null, 2));
  console.log('PRD ID:', prdId);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
