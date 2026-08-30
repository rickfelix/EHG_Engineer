#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FEAT-EVA-VENTURE-IDEATION-001';

const spec_summary = {
  artifact: 'docs/architecture/eva-ideation-competitive-analysis-spec.md',
  key_decision: 'Shared interface = lib/competitive-intelligence/index.js as it exists today (analyzeCompetitor, persistTeardownAnalyses). No new scanner proposed. Ideation-specific logic lives in a future thin scoring-adapter, not the shared interface, so the greenfield Cluster-6 consumer can adopt it later without inheriting ideation-only assumptions.',
  integration_point_chosen: 'lib/discovery/opportunity-scorer.js competitive_advantage scoring dimension (not ranking-pipeline.js, which is trend-discovery, not competitor-targeting)',
  targeting_rubric: 'Reuses existing lib/competitive-intelligence/differentiation-board.js computeDifferentiationDelta() + applyDeltaGate(delta, threshold=0.5) — no new "extremely better" threshold invented. Best-product identification runs analyzeCompetitor() per product URL and ranks via the existing opportunity-scorer composite score, reusing scorer weighting rather than a second ranking method.',
  consumers_named: ['EVA ideation scoring (this SD; future build)', 'Solomon Cluster-6 feedback-to-backlog pipeline (future, confirmed greenfield by LEAD-phase Explore evidence)'],
  code_changes_shipped: 'ZERO — design/spec-only per SD scope. Diff is the spec document + evidence one-off scripts only.',
  sd_type_correction: 'Corrected feature -> documentation post-LEAD-TO-PLAN via governance automation_context bypass (audited), because the SD is explicitly design-only and the feature-type TESTING gate was blocking on E2E-mapped user stories for a deliverable with no code/UI. See governance_metadata.type_change_reason and .automation_context for full audit trail.',
};

async function main() {
  const { data: row, error: e0 } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  if (e0) throw e0;
  const md = { ...row.metadata, spec_summary };
  const { error: e1 } = await supabase.from('strategic_directives_v2').update({ metadata: md }).eq('sd_key', SD_KEY);
  if (e1) throw e1;
  console.log('spec_summary recorded');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
