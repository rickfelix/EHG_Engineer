#!/usr/bin/env node
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'ffc670b0-a10a-4c5d-bce0-dbc5dfa77630';

const stories = [
  {
    id: crypto.randomUUID(),
    prd_id: PRD_ID,
    story_key: 'SZEF3C:US-001',
    title: 'Experiment database schema and manager module',
    user_role: 'platform engineer',
    user_want: 'experiment lifecycle tables and CRUD operations',
    user_benefit: 'experiments can be created, started, stopped, and archived with proper state management',
    priority: 'critical',
    story_points: 5,
    status: 'ready',
    acceptance_criteria: [
      'experiments table created with id, name, hypothesis, variants JSONB, status, timestamps',
      'experiment_assignments table with unique constraint on (experiment_id, venture_id)',
      'experiment_outcomes table with assignment_id FK and scores JSONB',
      'createExperiment validates required fields and min 2 variants',
      'Status transitions: draft → running → stopped → archived'
    ],
    implementation_context: JSON.stringify({
      affected_files: ['migrations/create-experiment-tables.sql', 'lib/eva/experiments/experiment-manager.js'],
      test_approach: 'Unit test CRUD operations with mock supabase client',
      dependencies: ['@supabase/supabase-js']
    })
  },
  {
    id: crypto.randomUUID(),
    prd_id: PRD_ID,
    story_key: 'SZEF3C:US-002',
    title: 'Deterministic experiment assignment',
    user_role: 'platform engineer',
    user_want: 'hash-based venture-to-variant assignment',
    user_benefit: 'the same venture always gets the same variant for reproducible experiment results',
    priority: 'critical',
    story_points: 3,
    status: 'ready',
    acceptance_criteria: [
      'assignVariant returns consistent variant for same venture+experiment',
      'SHA-256 hash of ventureId+experimentId determines bucket',
      'Supports weighted distribution (50/50 default, configurable)',
      'Persists assignment on first call, returns cached on subsequent',
      'getAssignment retrieves existing assignment without reassigning'
    ],
    implementation_context: JSON.stringify({
      affected_files: ['lib/eva/experiments/experiment-assignment.js'],
      test_approach: 'Test determinism with multiple calls; test distribution with 1000 synthetic IDs',
      dependencies: ['crypto (Node built-in)']
    })
  },
  {
    id: crypto.randomUUID(),
    prd_id: PRD_ID,
    story_key: 'SZEF3C:US-003',
    title: 'Dual evaluation and outcome recording',
    user_role: 'platform engineer',
    user_want: 'both control and variant evaluations to run for assigned ventures',
    user_benefit: 'venture scores can be compared between experiment arms',
    priority: 'critical',
    story_points: 5,
    status: 'ready',
    acceptance_criteria: [
      'evaluateDual runs both variant paths and collects scores',
      'Each variant produces venture_score, chairman_confidence, synthesis_quality',
      'Results stored in experiment_outcomes table',
      'One variant failure does not block the other',
      'Timeout protection at 60s per variant evaluation'
    ],
    implementation_context: JSON.stringify({
      affected_files: ['lib/eva/experiments/dual-evaluator.js'],
      test_approach: 'Mock evaluation functions; test timeout behavior; test partial failure isolation',
      dependencies: ['stage-zero-orchestrator.js']
    })
  },
  {
    id: crypto.randomUUID(),
    prd_id: PRD_ID,
    story_key: 'SZEF3C:US-004',
    title: 'Bayesian analysis and stopping rules',
    user_role: 'platform engineer',
    user_want: 'Beta-Binomial Bayesian analysis of experiment outcomes',
    user_benefit: 'I can determine when one variant statistically outperforms another and stop the experiment',
    priority: 'critical',
    story_points: 5,
    status: 'ready',
    acceptance_criteria: [
      'analyzePosterior computes Beta posterior for each variant',
      'computeCredibleInterval returns [lower, upper] at configurable level',
      'probabilityOfImprovement returns P(A > B) via Monte Carlo sampling',
      'shouldStop implements rules: min 20 samples, 95% CI, or max 200',
      'generateReport produces human-readable summary with recommendation'
    ],
    implementation_context: JSON.stringify({
      affected_files: ['lib/eva/experiments/bayesian-analyzer.js'],
      test_approach: 'Test with known distributions; verify stopping with clear winner; verify no-stop with equal split',
      dependencies: []
    })
  },
  {
    id: crypto.randomUUID(),
    prd_id: PRD_ID,
    story_key: 'SZEF3C:US-005',
    title: 'Orchestrator integration and CLI tools',
    user_role: 'platform engineer',
    user_want: 'the experiment engine wired into Stage 0 orchestrator with CLI tools for visibility',
    user_benefit: 'experiments run automatically during venture creation and results are monitorable',
    priority: 'critical',
    story_points: 5,
    status: 'ready',
    acceptance_criteria: [
      'stage-zero-orchestrator.js checks for active experiments after path execution',
      'Experiment assignment and dual evaluation run non-blocking',
      'Experiment failure does not block normal Stage 0 flow',
      'experiment-create.js CLI creates experiments with --name, --hypothesis, --variants',
      'experiment-status.js CLI shows running experiments with counts',
      'experiment-results.js CLI runs Bayesian analysis for given experiment'
    ],
    implementation_context: JSON.stringify({
      affected_files: ['lib/eva/stage-zero/stage-zero-orchestrator.js', 'scripts/experiment-create.js', 'scripts/experiment-status.js', 'scripts/experiment-results.js'],
      test_approach: 'Integration test: mock experiment in DB, run orchestrator, verify assignment created',
      dependencies: ['experiment-manager.js', 'experiment-assignment.js', 'dual-evaluator.js', 'bayesian-analyzer.js']
    })
  }
];

async function main() {
  console.log(`Inserting ${stories.length} user stories...`);
  for (const story of stories) {
    const { data, error } = await supabase
      .from('user_stories')
      .insert(story)
      .select('story_key, title, status');
    if (error) {
      console.error(`  Error ${story.story_key}:`, error.message);
    } else {
      console.log(`  OK: ${data[0].story_key} - ${data[0].title}`);
    }
  }
  console.log('Done.');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
