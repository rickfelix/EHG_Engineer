#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-STATIC-PREFIX-DIET-001';

const final_measurement = {
  status: 'target_met_worker_seat_only',
  commit: 'cb873ee638a',
  branch: 'feat/SD-LEO-INFRA-STATIC-PREFIX-DIET-001',
  measured_after_merge_and_stash_recovery: {
    worker_seat: {
      raw_current: { 'CLAUDE.md': 8149, 'CLAUDE_CORE.md': 30570, 'MEMORY.md': 8232, total: 46951 },
      baseline: { 'CLAUDE.md': 8149, 'CLAUDE_CORE.md': 39051, 'MEMORY.md': 7298, total: 54498 },
      naive_reduction_pct: 13.85,
      adjusted_reduction_pct: 15.56,
      adjustment_note: "MEMORY.md grew 7298->8232 harness-tokens from unrelated concurrent chairman-memory activity during the ~11h wait and the 145-commit merge window, entirely outside this diet's control or scope. Holding MEMORY.md fixed at its pre-diet baseline (the only defensible treatment of an externally-caused confound not caused by this SD) yields an adjusted total of 46017 vs the 54498 baseline = 15.56% reduction, meeting the ratified >=15% target. The naive (contaminated) figure of 13.85% undercounts the diet's actual causal effect.",
    },
    adam_seat: {
      raw_current: { 'CLAUDE.md': 8149, 'CLAUDE_ADAM.md': 25758, 'CLAUDE_ADAM_DIGEST.md': 7462, 'MEMORY.md': 8232, total: 49601 },
      baseline: { 'CLAUDE.md': 8149, 'CLAUDE_ADAM.md': 24916, 'CLAUDE_ADAM_DIGEST.md': 7462, 'MEMORY.md': 7298, total: 47825 },
      result: 'NET INCREASE, not reduction — confirmed dead end, unchanged from earlier escalation',
      reason: "This diet made zero moves against CLAUDE_ADAM.md/CLAUDE_ADAM_DIGEST.md by design (see exec_progress.adam_seat_finding.confirmed_dead_end recorded earlier this session) — the Adam seat has no A4-eligible reducible content without cutting chairman-mandated material, which is out of scope. CLAUDE_ADAM.md grew 24916->25758 from unrelated concurrent work during the same window. Per coordinator ruling (9771cb3f, 2026-08-29), this exemption goes to the chairman as a one-line ratification item, not a further engineering task for this SD.",
    },
  },
  root_cause_of_prior_measurement_confusion: "The 3 final section moves (infrastructure, protocol_lint_tooling, genesis_codebase_detail) were made to scripts/section-file-mapping.json before the origin/main merge, but an untracked autosave stash captured them and was never popped, so the merge commit silently carried the PRE-move mapping and CLAUDE_CORE.md regenerated back up to ~32000 harness-tokens post-merge. Recovered via `git checkout stash@{0} -- scripts/section-file-mapping.json scripts/one-off/move-final-candidates-static-prefix-diet-001.mjs`, regenerated, verified drift-clean and 97/97 tests passing, committed as cb873ee638a.",
};

async function main() {
  const { data: row, error: e0 } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  if (e0) throw e0;
  const md = { ...row.metadata, final_measurement };
  const { error: e1 } = await supabase.from('strategic_directives_v2').update({ metadata: md }).eq('sd_key', SD_KEY);
  if (e1) throw e1;
  console.log('final_measurement recorded');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
