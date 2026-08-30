#!/usr/bin/env node
import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FEAT-EVA-VENTURE-IDEATION-001';
const REPO_PATH = 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer';
const EXECUTED_FROM_CWD = 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.worktrees\\SD-LEO-FEAT-EVA-VENTURE-IDEATION-001';

const findings = {
  summary: 'Repo-wide discovery confirming existing EVA Stage-Zero ideation and competitive-intelligence infrastructure this SD\'s spec must build on, not duplicate.',
  eva_ideation_stage_zero: {
    root: 'lib/eva/stage-zero/',
    key_files: [
      'path-router.js — ENTRY_PATHS: competitor_teardown | blueprint_browse | discovery_mode | seeded_from_venture',
      'stage-zero-orchestrator.js — top-level orchestration',
      'ranking-pipeline.js — idea scoring/ranking, the integration point for competitive-analysis input',
      'interfaces.js — shared interface contracts',
      'paths/competitor-teardown.js — already implements this SD\'s exact concept: deconstruct a competitor, first-principles rebuild with EHG\'s automation advantage',
    ],
  },
  discovery_module: {
    root: 'lib/discovery/',
    key_files: [
      'opportunity-discovery-service.js',
      'gap-analyzer.js',
      'opportunity-scorer.js — second candidate integration point for competitive-analysis-fed scoring',
      'blueprint-generator.js',
      'competitive-baseline-service.js — existing competitive-baseline consumer (feeds SD-LEO-INFRA-COMPETITIVE-BASELINES-RECURRING-001)',
    ],
  },
  competitive_intelligence_canonical_contract: {
    root: 'lib/competitive-intelligence/',
    files: ['index.js — declared "the single import surface for competitor intelligence", exports analyzeCompetitor', 'canonical-store.js', 'four-buckets.js', 'differentiation-board.js', 'board-result-projection.js'],
    implication: 'This is the existing shared scan capability. The Phase-0 spec must generalize THIS contract into the two-consumer shared interface the hard NFR requires, not specify a second scanner. A new scanner would fail PLAN gate 2 (duplicate infrastructure).',
  },
  cluster_6_pipeline: {
    finding: 'No code exists anywhere in the repo for a Solomon Cluster-6 / feedback-to-backlog pipeline. Only references are in CLAUDE_SOLOMON.md (advise-only, relayed via Coordinator, no direct EVA channel). This consumer is greenfield — confirms the shared-interface NFR is real, non-trivial design work, not documentation of something already unified.',
  },
  adjacent_open_sds: {
    finding: 'SD-LEO-INFRA-COMPETITIVE-BASELINES-RECURRING-001 (active) and SD-LEO-FEAT-COMPETITIVE-VIGILANCE-OBSERVED-BASELINE-001 (deferred) both touch competitive-baseline/vigilance concepts but for stage-scoring, not ideation. Distinct concern, not a duplicate — but the spec should name them as adjacent consumers/precedent for the shared-capability pattern.',
  },
  target_repo: 'EHG_Engineer confirmed (target_application field + all cited code paths live here). The EHG app repo only hosts consuming UI, not the ideation/competitive-analysis logic itself.',
};

async function main() {
  await storeSubAgentResults(
    'Explore',
    SD_KEY,
    null,
    {
      phase: 'LEAD',
      source: 'manual',
      verdict: 'PASS',
      confidence: 90,
      execution_time_ms: 0,
      summary: 'Confirmed existing lib/eva/stage-zero/ ideation infrastructure and lib/competitive-intelligence/index.js canonical scanner contract that the Phase-0 spec must generalize rather than duplicate. Cluster-6 consumer confirmed greenfield.',
      findings,
      metadata: {
        repo_path: REPO_PATH,
        executed_from_cwd: EXECUTED_FROM_CWD,
      },
    }
  );
  console.log('Explore evidence stored');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
