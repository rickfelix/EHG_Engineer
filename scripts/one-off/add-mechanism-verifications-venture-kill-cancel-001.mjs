#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER requires metadata.mechanism_verifications for
 * SD-LEO-INFRA-VENTURE-KILL-CANCEL-001's spine, which names specific file+function
 * mechanisms (kill_venture(), the deploy pipeline's dead-code status, venture-ops-actuals-
 * sweep.mjs reuse target). The Explore + VALIDATION sub-agents' own genuine, live-verified
 * investigation (evidence rows 3194859e / bfd1beef) is the verifier.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-VENTURE-KILL-CANCEL-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('Fetch failed:', fetchErr.message); process.exit(1); }

const metadata = {
  ...existing.metadata,
  mechanism_verifications: [
    {
      verified_by: 'sub_agent_execution_results:3194859e-dd64-455f-8550-05479465cb79 (EXPLORE, phase=LEAD)',
      verified_at: 'database/migrations/20260505224113_ventures_kill_log_and_rpc.sql:55-139 (kill_venture RPC), database/migrations/20260821_eva_scheduler_queue_kill_time_teardown.sql:69-140 (status-change trigger precedent)',
      claim: 'kill_venture() writes status=cancelled/workflow_status=killed with no teardown logic. Live-queried both MarketLens rows directly: id=4e710bb2 (stage 19, deployment_url=NULL, killed_at=NULL -- cancelled outside kill_venture()) and id=ecbba50e (stage 24, deployment_url set, killed_at=2026-07-08) -- confirming the two rows do NOT share a deployment_url.',
      reproduction: 'Live Supabase query against ventures table for both specimen IDs; direct read of both migration files.'
    },
    {
      verified_by: 'sub_agent_execution_results:bfd1beef-366e-4918-891b-50b088ff8d93 (VALIDATION, phase=LEAD)',
      verified_at: 'lib/venture-deploy/promote.js, lib/venture-deploy/publish.js, scripts/cron/venture-ops-actuals-sweep.mjs + lib/ops/venture-uptime-probe.js',
      claim: 'promote.js is called with no deps argument from its only production call site (stage-24-go-live.js:233), so hasRealAdapters===false and it never reaches a real gcloud adapter; publish.js (the module that defaults to real adapters) has zero production importers. gcloud CLI confirmed not on PATH; no GCP admin credentials in .env. venture-ops-actuals-sweep.mjs already probes all deployment_url IS NOT NULL ventures (3 rows) via lib/ops/venture-uptime-probe.js -- FR-2s target set (terminal AND url, 2 rows) is a strict subset.',
      reproduction: 'Direct source read of both call sites and their argument lists; PATH/env inspection for gcloud/GCP credentials; live HTTP probe of the MarketLens deployment_url (200 OK, 2.06s) independently reproducing the original zombie-detection claim.'
    }
  ]
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY);
if (updateErr) { console.error('Update failed:', updateErr.message); process.exit(1); }
console.log('mechanism_verifications recorded for', SD_KEY);
