#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001';

// LEAD 9-question gate: Q9 (30-second demo -> smoke_test_steps) and Q8 (deletion audit ->
// scope_reduction_percentage). Auto-generated smoke_test_steps were generic boilerplate
// ("Run the modified script/gate...") -- replaced with SD-specific steps matching the SD's
// own success_criteria. Q8: the chairman-commissioned architecture-eval finding (S5/P5) this
// SD implements was explicitly narrowed at scope-lock -- zombie-venture teardown (a full
// separate SD, SD-LEO-INFRA-VENTURE-KILL-CANCEL-001) and retroactive forced upgrades across
// the ~44 live venture repos (backfill is PROPOSED per-venture, never auto-applied) were both
// cut. Forced-upgrade auto-application in particular would have been the largest blast-radius
// item in the original ask (touching every live repo); excluding it is the dominant reduction.

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Run a fixture provisioning against the new scaffold-as-code path (both the leo_bridge/provisionVenture entry point and the seeded_repo/create-and-seed entry point, per the entrypoint census this SD\'s LEAD phase confirmed as two structurally divergent paths).',
    expected_outcome: 'The resulting repo contains the vendored deploy.yml + ci.yml + stack-scan-equivalent workflow + feedback module, a scaffold manifest naming the pinned version, and a registry entry -- all written in the same provisioning step, for BOTH entry points.',
  },
  {
    step_number: 2,
    instruction: 'Run provisioning again against a fixture repo with the manifest file deliberately removed/missing.',
    expected_outcome: 'The build-gate BLOCKS provisioning/launch with a clear error naming the missing manifest -- the negative-test half of this SD\'s own acceptance criteria.',
  },
  {
    step_number: 3,
    instruction: 'Run the backfill census script against the live venture-repo population.',
    expected_outcome: 'A report is produced listing scaffold presence/version per repo across the full live population (confirmed ~44 non-infra-pattern GitHub repos, not just the 5-repo sample cited in the original problem statement) -- with zero repos silently auto-modified (backfill remains PROPOSED, never auto-applied).',
  },
];

const success_criteria = [
  {
    criterion: 'A fixture provisioning run produces a repo with all scaffold files + manifest + registry entry.',
    measure: 'Fixture provisioning run through BOTH real entry points (leo_bridge/provisionVenture AND seeded_repo/create-and-seed); assert the resulting repo has the scaffold files, a manifest naming the pinned scaffold version, and a registry entry written in the same step.',
  },
  {
    criterion: 'Negative test: provisioning gate fails on a repo missing the manifest.',
    measure: 'Automated test asserting provisioning/launch is BLOCKED (not silently allowed) for a fixture repo with the manifest file absent, at both entry points.',
  },
  {
    criterion: 'Census report merged listing every live venture\'s scaffold state.',
    measure: 'Backfill census script run against the full live venture-repo population and its output (per-repo scaffold presence/version) reviewed and merged as a PR artifact, with zero writes to any venture repo (report-only).',
  },
];

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr || !sd) { console.error('READ ERR', readErr?.message); process.exit(1); }

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ smoke_test_steps, success_criteria, scope_reduction_percentage: 30 })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERR', writeErr.message); process.exit(1); }
console.log('LEAD smoke_test_steps/success_criteria/scope_reduction_percentage written for SD', sd.id);
