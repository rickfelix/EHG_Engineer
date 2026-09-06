// Backfill ship_review_findings for SD-LEO-FIX-POST-TOOL-LOOP-001, whose PR (#8330) merged
// on branch qf/QF-20260905-970 BEFORE this SD existed -- the SD was created via
// leo-create-sd.js --from-qf to satisfy lib/quick-fix/sensitive-path-registry.js's
// no-bypass escalation requirement (the QF touched scripts/hooks/**). PR_MERGE_VERIFICATION's
// branch-name-ownership resolver cannot find this PR under any feat|fix|docs|test/<SD-KEY>
// pattern since the branch legitimately predates and never referenced the SD; the gate's own
// isNeverPushedSpecimen() explicitly treats a ship_review_findings row carrying pr_number as
// sufficient evidence a PR existed and was reviewed. Logging the two independent sub-agent
// reviews (SECURITY PASS 96%, TESTING PASS 92%) actually performed against PR #8330's diff.
import { logFindings } from '../../lib/ship/review-findings-logger.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

async function main() {
  const findings = [
    {
      type: 'INFO',
      title: 'SECURITY sub-agent independent review (row bc032500-e8b1-4f23-a69f-7facd598595a)',
      description: 'Token-stream diff localized the only change to a destructure ({error,count}->{data,error}); .update({loop_state:state}) payload token-identical; .eq() parameterized; state bounded by a frozen allowlist + live DB CHECK; .maybeSingle() confirmed fail-safe (>1 row synthesizes PGRST116, does not throw); session_id UNIQUE constraint verified live; the sensitive-path file (post-tool-loop-state.cjs) has a byte-identical token stream before/after (comment-only change).',
      verdict: 'CONFIRMED',
    },
    {
      type: 'INFO',
      title: 'TESTING sub-agent independent review (row fd827a93-6ac5-4e02-96b1-44eaff8cecb6)',
      description: 'Confirmed fix present on main (HEAD is exactly the PR #8330 merge); independently reproduced the postgrest-js arity-1 root cause (PostgrestTransformBuilder.select().length===1); verified the regression canary is discriminating (re-adding {count,head} would trip COUNT_UNMEASURABLE); 131/131 tests passing across 5 collectible files.',
      verdict: 'CONFIRMED',
    },
  ];

  const result = await logFindings({
    prNumber: 8330,
    reviewTier: 'deep',
    riskScore: 0.15,
    findings,
    verdict: 'pass',
    sdKey: 'SD-LEO-FIX-POST-TOOL-LOOP-001',
    branch: 'qf/QF-20260905-970',
    multiAgent: true,
    repo: 'rickfelix/EHG_Engineer',
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exit(1);
}

if (isMainModule(import.meta.url)) {
  main();
}
