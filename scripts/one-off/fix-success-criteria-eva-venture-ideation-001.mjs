#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FEAT-EVA-VENTURE-IDEATION-001';

const success_criteria = [
  {
    criterion: 'Spec generalizes the existing lib/competitive-intelligence/index.js contract into a shared scan interface rather than specifying a second, ideation-private scanner',
    measure: 'Spec document explicitly references lib/competitive-intelligence/index.js and lib/eva/stage-zero/paths/competitor-teardown.js as the code the shared interface builds on, and states why no new scanner is created',
  },
  {
    criterion: 'Spec defines the integration point(s) into EVA ideation scoring (lib/eva/stage-zero/ranking-pipeline.js and/or lib/discovery/opportunity-scorer.js) where competitive-analysis input feeds idea scoring',
    measure: 'Spec names the specific file(s)/function(s) the scoring integration touches and the shape of the data passed in',
  },
  {
    criterion: 'Spec defines evaluation criteria for the "target their best product, do it extremely better" targeting logic (roadmap item e09426eb)',
    measure: 'Spec document contains a named scoring/ranking rubric for identifying a competitor\'s best-performing product and a differentiation bar for "extremely better"',
  },
  {
    criterion: 'Spec names the two consumers of the shared scan interface (EVA ideation scoring; Solomon Cluster-6 feedback-to-backlog pipeline) and documents that Cluster-6 has zero existing code (greenfield) so the interface is designed generically, not retrofitted to ideation-only shapes',
    measure: 'Spec document has a "Consumers" section naming both, with Cluster-6 marked as future/not-built-here',
  },
  {
    criterion: 'Spec names Solomon as design input and carries the shared-capability NFR with both consumers named (ideation scoring; Cluster-6 feedback-to-backlog)',
    measure: 'Spec document section present; both consumers listed; interface designed once',
  },
  {
    criterion: 'Fold audit: the folded item fbfecad5\'s contributed contents are listed on the SD',
    measure: 'metadata.fold_provenance.contributed_contents non-empty (stamped at mint) — already satisfied, verified present',
  },
];

async function main() {
  const { error } = await supabase.from('strategic_directives_v2').update({ success_criteria }).eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('success_criteria corrected: replaced 4 boilerplate build-oriented criteria with design-scoped criteria matching the SD\'s explicit no-build scope');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
