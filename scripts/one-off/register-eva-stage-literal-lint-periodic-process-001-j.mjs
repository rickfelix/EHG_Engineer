#!/usr/bin/env node
// SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-J (FR-10) -- registers
// standard_loop:eva-stage-literal-lint-weekly in periodic_process_registry. Required BEFORE
// stampLastFired can do anything: registry membership is additive, not auto-creating
// (lib/periodic-liveness/stamp-last-fired.js's own docblock).
//
// This row is the graduation instrument FR-10's acceptance criteria names: "ships its
// CI-asserted exit predicate in the same PR ... closes/graduates only after 2 consecutive
// weekly zero readings via a periodic_process_registry row (ratification 49656c8c, line 62;
// precedent: lib/governance/orphan-writers-registry.js FR-7c), never on a single merge."
// .github/workflows/eva-stage-literal-lint-weekly.yml only calls stampLastFired() on a CLEAN
// (exit 0) full sweep -- so a healthy last_fired_at read via periodic-liveness-watcher.mjs
// IS "the last scheduled run was clean", and this row's own consecutive_miss_count becomes
// the objective "how many recent weekly runs were NOT clean" signal the .yml's advisory
// (continue-on-error) per-PR gate is flipped to blocking against.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const PROCESS_KEY = 'standard_loop:eva-stage-literal-lint-weekly';

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: existing, error: readErr } = await supabase
    .from('periodic_process_registry')
    .select('process_key')
    .eq('process_key', PROCESS_KEY)
    .maybeSingle();
  if (readErr) throw readErr;
  if (existing) {
    console.log(`${PROCESS_KEY} already registered — no-op.`);
    return;
  }

  const { error } = await supabase.from('periodic_process_registry').insert({
    process_key: PROCESS_KEY,
    display_name: 'EVA stage-literal lint: weekly full-repo sweep (graduation gauge)',
    owner: 'leo-infra',
    process_type: 'standalone_cron',
    expected_interval_seconds: 604800,
    grace_multiplier: 2,
    liveness_source: 'self_stamped',
    liveness_source_ref: {
      cron: '0 7 * * 1',
      workflow: '.github/workflows/eva-stage-literal-lint-weekly.yml',
      sd_key: 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-J',
      stamps_only_on: 'node scripts/lint/eva-stage-literal-lint.mjs --all exits 0 (clean sweep)',
    },
    session_bound: false,
    currently_expected_active: true,
  });
  if (error) throw error;

  console.log(`Registered ${PROCESS_KEY} in periodic_process_registry.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
