#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER (QF-20260727-982, LEAD-TO-PLAN) requires a NAME plus a
 * file:line citation for every file+function mechanism claim in the SD spine -- a boolean
 * attestation is explicitly rejected. Records the real file:line locations actually opened
 * and verified during this SD's LEAD-phase investigation.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const SD_KEY = 'SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001';

const mechanismVerifications = [
  {
    verified_by: 'Alpha-2 (primary session)',
    verified_at: 'lib/eva/archplan-upsert.js:135-136',
    note: 'confirmed status/chairman_approved are set from a real isApproved branch (approved !== false), NOT a hardcoded literal as the SD text\'s cited lines 121-122 describe -- the SD\'s specific "hardcoded" claim is stale, though the SD\'s core claim (no distinct approver-identity column) is independently true.'
  },
  {
    verified_by: 'Alpha-2 (primary session)',
    verified_at: 'lib/eva/archplan-promote.js:26-32',
    note: 'confirmed promoteArchPlan()\'s own docblock explicitly names the missing approved_by column as a deferred FR-6 from SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001, and calls its own same-party guard a "provenance PLACEHOLDER, not a strong identity check".'
  },
  {
    verified_by: 'Alpha-2 (primary session)',
    verified_at: 'lib/eva/archplan-promote.js:86-97',
    note: 'confirmed promotedBy is used only for the self-approval guard comparison and a log line -- it is never written to the eva_architecture_plans row; the UPDATE touches only status/chairman_approved/chairman_approved_at.'
  },
  {
    verified_by: 'Alpha-2 (primary session)',
    verified_at: 'scripts/modules/stage-execution/stage-execution-worker.js:4015-4018',
    note: 'confirmed _autoApproveCloneVision overwrites created_by (the original author label) on approval, destroying author provenance on eva_vision_documents -- a live, currently-occurring instance of the defect class this SD exists to close.'
  },
  {
    verified_by: 'Explore sub-agent (Task-tool, independent verification)',
    verified_at: 'lib/eva/archplan-upsert.js:15,125 and scripts/cron/cascade-watcher.mjs:215',
    note: 'independently traced the same branching logic and cited a real live caller passing approved:false, confirming the "hardcoded" sub-claim is stale and the function is genuinely exercised both ways.'
  }
];

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: existing, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();

  if (readErr) { console.error('READ FAILED:', readErr.message); process.exit(1); }

  const metadata = { ...existing.metadata, mechanism_verifications: mechanismVerifications };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('sd_key', SD_KEY)
    .select('sd_key')
    .single();

  if (error) { console.error('FAILED:', error.message); process.exit(1); }

  console.log('UPDATED:', data.sd_key, '-- mechanism_verifications count:', mechanismVerifications.length);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
