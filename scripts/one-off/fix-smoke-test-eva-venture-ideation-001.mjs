#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FEAT-EVA-VENTURE-IDEATION-001';

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Open the committed spec document and locate the "Shared Interface" section naming both consumers (EVA ideation scoring; Solomon Cluster-6 feedback-to-backlog, marked future/not-built-here)',
    expected_outcome: 'Both consumers are named explicitly, with Cluster-6 marked as a future, not-yet-built consumer',
  },
  {
    step_number: 2,
    instruction: 'Locate the section generalizing lib/competitive-intelligence/index.js\'s existing analyzeCompetitor contract into the shared interface, and confirm it does not specify a second/duplicate scanner',
    expected_outcome: 'Spec explicitly references lib/competitive-intelligence/index.js and lib/eva/stage-zero/paths/competitor-teardown.js as the code being generalized, with no new competing scanner proposed',
  },
  {
    step_number: 3,
    instruction: 'Locate the integration-point section naming which EVA ideation scoring file(s) (lib/eva/stage-zero/ranking-pipeline.js and/or lib/discovery/opportunity-scorer.js) consume the competitive-analysis input, and the "target their best product, do extremely better" evaluation rubric',
    expected_outcome: 'A named file/function integration point and a concrete scoring/differentiation rubric are both present, not left as TBD',
  },
];

async function main() {
  const { error } = await supabase.from('strategic_directives_v2').update({ smoke_test_steps }).eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('smoke_test_steps corrected: replaced generic UI placeholders with a real 30-second demo for the spec deliverable');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
