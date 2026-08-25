#!/usr/bin/env node
/**
 * Record FR-4 AC-3/AC-4's required post-merge CI guard measurements in the SD's own metadata:
 * both guards' next scheduled/triggered run outcomes after PR #7534/#7545 merged, with the
 * specific evidence establishing each "failure" conclusion as the expected, disclosed,
 * pre-existing state (not a regression this SD introduced).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CHRONIC-RED-GUARD-001';

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: sd, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (readErr) throw new Error(readErr.message);

  const metadata = {
    ...sd.metadata,
    fr4_ci_guard_verification: {
      recorded_at: new Date().toISOString(),
      ac3_migration_deploy_drift_guard: {
        workflow: 'migration-deploy-drift-guard.yml',
        run_id: 32840258008,
        run_url: 'https://github.com/rickfelix/EHG_Engineer/actions/runs/32840258008',
        event: 'push',
        head_branch: 'main',
        created_at: '2026-08-25T11:02:32Z',
        conclusion: 'failure',
        verdict: 'EXPECTED — not a regression from this SD',
        evidence:
          'Job log: "RECENT gaps (date >= 20260615, BLOCKING under --strict): 5; LEGACY gaps ' +
          '(advisory only): 131" and "DISPOSITIONS: 136 of 143 gap file(s) undispositioned; 7 ' +
          'suppressed". The 5 RECENT blocking gaps are: ' +
          'database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql ' +
          '(CEREMONY_PENDING), database/chairman-gated/20260824_sms_status_staging.sql ' +
          '(CEREMONY_PENDING), 20260824_sms_outbound_obligations_delivery_status_source.sql ' +
          '(NOT_APPLIED), 20260824_chairman_held_sends.sql (NOT_APPLIED), ' +
          '20260819_eva_scheduler_metrics_created_at_index.sql (NOT_APPLIED — already dispositioned ' +
          "in this SD's own fr4_migration_disposition entry). None of these 5 files belong to " +
          "this SD's scope or were introduced by it -- all are dated 20260819/20260824, filed by " +
          "other sessions/SDs. This SD's own scope (FR-1) fixed the seeder's ability to find/" +
          'classify chairman-gated files; it never claimed to eliminate the pre-existing corpus ' +
          'backlog, and docs/database/migration-disposition-ledger.md already discloses this as an ' +
          'ongoing, undispositioned-majority state (136/143 here vs. the doc\'s earlier-cited ' +
          '123/126 -- the corpus continues to grow from unrelated concurrent SDs, which is exactly ' +
          'the drift-guard doing its job of staying loud rather than silently passing).',
      },
      ac4_security_linter_sentinel: {
        workflow: 'security-linter-sentinel.yml',
        trigger_method:
          'workflow_dispatch --strict=true (per PRD AC-4\'s explicit allowance: "workflow_dispatch ' +
          'with strict=true is an acceptable earlier verification trigger" -- the natural cron is ' +
          "Mondays 14:00 UTC and this SD's merge landed mid-week, so waiting for the natural " +
          'schedule was not practical)',
        run_id: 32843440074,
        run_url: 'https://github.com/rickfelix/EHG_Engineer/actions/runs/32843440074',
        dispatched_at: '2026-08-25T11:39:27Z',
        completed_at: '2026-08-25T11:40:06Z',
        conclusion: 'failure',
        verdict: 'EXPECTED — not a regression from this SD',
        evidence:
          'Job log: "sensitive_columns_exposed (session_id, no RLS): 1" plus the pre-existing ' +
          'RLS-disabled and mutable-search-path findings -- the same finding set independently ' +
          'confirmed live via local `node scripts/sentinels/audit-security-linter.mjs --strict` ' +
          '(exit code 1) during this SD\'s own /heal verification pass. ' +
          'docs/audits/sentinel-finding-dispositions.json is confirmed (by grep) to have zero code ' +
          'consumers in scripts/sentinels/audit-security-linter.mjs -- it is a pure audit-trail ' +
          'artifact, unlike the migration ledger which IS wired into ' +
          'scripts/verify-migration-apply-state.mjs. A remediate_staged disposition for a ' +
          'chairman-gated-but-unapplied migration therefore cannot and structurally should not ' +
          "suppress the sentinel's exit code -- these are RLS/security migrations deliberately " +
          'gated behind chairman approval, so remaining loud until actually applied is correct, ' +
          'by-design behavior.',
      },
    },
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('sd_key', SD_KEY);
  if (updateErr) throw new Error(updateErr.message);

  console.log('✅ FR-4 AC-3/AC-4 CI guard verification recorded in SD metadata');
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
