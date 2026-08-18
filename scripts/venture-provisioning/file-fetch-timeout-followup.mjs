#!/usr/bin/env node
/**
 * Durably captures the /ship deep-tier adversarial review's INFO finding 4
 * (PR #7221 round 1) as a tech_debt feedback row, per the completion-flags
 * reflective interrogation ("are there any gaps we failed to close?") -- an
 * INFO-level finding is non-blocking but must not be silently dropped.
 *
 * Finding: checkDeploymentHealth()'s fetch call has no AbortSignal timeout,
 * so a deploy target that accepts a connection but never responds hangs the
 * whole readiness report indefinitely. Left unfixed at merge time since the
 * 3 WARNING-level findings from that same review round were the blocking
 * ones (fixed in commit 594cfe80019).
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { emitFeedback } from '../../lib/governance/emit-feedback.js';

dotenv.config();

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const result = await emitFeedback({
    supabase,
    title: 'checkDeploymentHealth(): no fetch timeout, a hanging deploy target blocks the whole readiness report',
    description: "lib/venture-provisioning/exec-boundary-readiness.js's checkDeploymentHealth() (line 106) calls fetchImpl(url, { method: 'GET' }) with no AbortSignal timeout. A deploy target that accepts the TCP connection but never responds (hung process, black-holed route) will hang the fetch indefinitely, blocking buildProvisioningReadinessReport() and any CLI/handoff caller with no way to time out. INFO-level finding from the /ship deep-tier adversarial review of PR #7221 (round 1) -- left unfixed at merge time since the other 3 WARNING-level findings from that round were the blocking ones and were fixed in commit 594cfe80019. Durable fix: pass an AbortSignal.timeout(N) (e.g. 10000ms) into the fetchImpl call, and classify an abort as {reachable:false, error:'timeout'} rather than a hang.",
    category: 'tech_debt',
    severity: 'low',
    source_type: 'manual_feedback',
    sd_id: '74346a80-c7cb-474e-b068-152415a840f7', // feedback.sd_id is UUID, NOT the SD-KEY string (C-DB-2)
    dedup_key: 'lib/venture-provisioning/exec-boundary-readiness.js:checkDeploymentHealth-no-fetch-timeout',
    metadata: {
      logged_via: 'file-fetch-timeout-followup.mjs',
      source_location: 'lib/venture-provisioning/exec-boundary-readiness.js:106',
      originating_sd_key: 'SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A',
      originating_review: 'ship deep-tier adversarial review, PR #7221 round 1, INFO finding 4',
      defer_only: true,
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => { console.error('Fatal error:', err.message); process.exit(1); });
