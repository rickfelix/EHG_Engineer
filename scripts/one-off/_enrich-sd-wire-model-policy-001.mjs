#!/usr/bin/env node
/**
 * Enrich SD-LEO-INFRA-WIRE-MODEL-POLICY-001 with the concrete deferred scope from QF-20260911-878.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-WIRE-MODEL-POLICY-001';

const description = `Follow-up to QF-20260911-878, which pinned the seat-class model policy (lib/fleet/model-policy.cjs -- workers default to claude-opus-5, role seats stay pinned to claude-fable-5-1) and wired --model into lib/fleet/build-session-launch.cjs's spawn invocation. That QF deliberately deferred the two remaining, higher-blast-radius fix items named in the original chairman-facing defect:

(2) SessionStart mismatch detection: scripts/hooks/capture-session-id.cjs is the SessionStart hook every fleet seat's registration depends on. It currently WRITES metadata.model silently (model_source='sessionstart_observed') with no comparison against the seat-class policy. Wire lib/fleet/model-policy.cjs's checkModelMismatch({role, model}) into this hook's write path so that a mismatch (a worker measured running Fable, or a role seat measured running a worker model) writes a LOUD row -- both to 'feedback' (chairman-facing) and to 'fleet_health' (or whatever the current live fleet-health surface is; verify against main before assuming a table name) -- instead of silently stamping and moving on. This must NOT skip or break the existing metadata.model/model_family/tier_rank stamping that other fleet machinery (worker-checkin.cjs tiering, tier-ladder.cjs) depends on -- this is an ADDITION (a loud side-channel signal), not a replacement.

(3) Fleet-dashboard line: a "seats off policy" count, derived from the same checkModelMismatch logic applied across all active claude_sessions rows. Identify the current live fleet-dashboard surface (fleet-dashboard.cjs, or its current successor -- verify against main) and add one summary line/metric.

Both items were deferred specifically because they touch live, critical-path infrastructure (the SessionStart hook, and a shared dashboard surface) that deserved fuller review than a single QF's scope, unlike the pure, self-contained policy module QF-20260911-878 shipped. Verify the premise (is capture-session-id.cjs still the live SessionStart hook, does its metadata.model write path still look as described) against current main before implementing -- this description is a snapshot from 2026-09-11.`;

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ description, scope: description })
    .eq('sd_key', SD_KEY)
    .select('id, sd_key');
  if (error) throw new Error(`update failed: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`no row matched sd_key=${SD_KEY}`);
  console.log(`Enriched ${data[0].sd_key} (${data[0].id}).`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
