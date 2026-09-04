// LEAD-phase enrichment for SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001, addressing two
// LEAD-TO-PLAN precheck gate failures before handoff:
//
// 1. GATE_MECHANISM_CLAIM_VERIFIER: the SD's description names
//    scripts/hooks/pre-tool-enforce.cjs and scripts/hooks/worktree-claim-decision.cjs as the
//    mechanism. Verified by direct read during LEAD evaluation:
//      - pre-tool-enforce.cjs:368 WORKTREE_PATH_RE = /[/\\]\.worktrees[/\\]([^/\\]+)/
//      - pre-tool-enforce.cjs:1002-1039 ENFORCEMENT 4 (PAT-CLMMULTI-001/002): match[1] (the
//        first .worktrees/<segment>) becomes worktreeSdKey (line 1013), passed to
//        shouldBlockWorktreeEdit at line 1022.
//      - worktree-claim-decision.cjs:23 function shouldBlockWorktreeEdit({worktreeKey,
//        claimedSdKey, qfHeld}) -- confirmed present, exported at line 37.
//    All claims in the SD spine matched the code exactly.
//
// 2. GATE_SD_METRICS_SUFFICIENCY: validateMetricsSufficiency() reads success_metrics
//    preferentially over success_criteria when success_metrics is non-empty (never both
//    combined). This SD's 2 success_metrics entries were both unique but under the
//    minimumMetrics=3 threshold. Adding a third, identity-distinct metric covering FR-5's
//    lint half (the audit-count metric only covered the CI count half).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001';

async function main() {
  const { data: sd, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata, success_metrics')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr || !sd) {
    console.error('SD_FETCH_FAILED', fetchErr);
    process.exit(1);
  }

  const metadata = {
    ...sd.metadata,
    mechanism_verifications: [
      {
        verified_by: 'Hotel (autonomous fleet worker, session ccce0874-7b5f-48e1-b7b5-365682f7a678), LEAD phase direct file read',
        verified_at: 'scripts/hooks/pre-tool-enforce.cjs:1013',
        note: 'ENFORCEMENT 4 (PAT-CLMMULTI-001/002), lines 1002-1039: WORKTREE_PATH_RE (line 368) matches the first .worktrees/<segment>; match[1] becomes worktreeSdKey at line 1013, passed into shouldBlockWorktreeEdit at line 1022. The path-only derivation the SD describes is confirmed exactly as stated.',
      },
      {
        verified_by: 'Hotel (autonomous fleet worker, session ccce0874-7b5f-48e1-b7b5-365682f7a678), LEAD phase direct file read',
        verified_at: 'scripts/hooks/worktree-claim-decision.cjs:23',
        note: 'function shouldBlockWorktreeEdit({ worktreeKey, claimedSdKey, qfHeld }) confirmed present and exported (line 37) — the verdict function ENFORCEMENT 4 calls.',
      },
    ],
  };

  const success_metrics = [
    ...(Array.isArray(sd.success_metrics) ? sd.success_metrics : []),
    {
      metric: 'Directory-name-only SD-key derivation lint violations in other hooks (FR-5 lint half)',
      target: '0 (FR-5 asserts no hook other than the guard itself derives an SD key from a directory name alone)',
    },
  ];

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata, success_metrics })
    .eq('sd_key', SD_KEY);
  if (updateErr) {
    console.error('SD_UPDATE_FAILED', updateErr);
    process.exit(1);
  }
  console.log('LEAD_ENRICHMENT_APPLIED', { mechanism_verifications: metadata.mechanism_verifications.length, success_metrics: success_metrics.length });
}

if (isMainModule(import.meta.url)) {
  main();
}
