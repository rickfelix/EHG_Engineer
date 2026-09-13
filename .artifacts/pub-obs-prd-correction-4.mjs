import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PRD_ID = 'PRD-SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001';
const { data: prd, error: readErr } = await supabase.from('product_requirements_v2').select('metadata, risks').eq('id', PRD_ID).single();
if (readErr) throw readErr;

const risks = prd.risks;
risks.push({
  risk: "getTweet() interpolated a caller-supplied external_post_id raw into an authenticated URL path with no shape validation -- a manufactured id (only reachable via a DB write or a compromised X response, never content-generator.js) could hit a DIFFERENT authenticated endpoint on the same host, whose 200 would misclassify exists:true and manufacture false graduation credit (SECURITY finding SEC-1, EXEC phase)",
  severity: 'low',
  mitigation: "getTweet() now rejects any non-digit-string tweetId before making any request (real X tweet ids are digit-only), verified by a regression test proving no fetch call is ever made for a malformed id"
});
risks.push({
  risk: "evaluateGraduation's mode='mock' branch unconditionally upserted 'propose_and_approve' onto venture_channel_autonomy, a table with NO execution_mode dimension -- silently demoting a channel's real (possibly live-graduated) autonomy state based solely on a mock outcome having been recorded (SECURITY finding SEC-2, EXEC phase, newly reachable because this SD is the first production caller of recordPublishOutcome)",
  severity: 'medium',
  mitigation: "evaluateGraduation now skips the venture_channel_autonomy write entirely when mode==='mock' (neither graduates nor demotes), verified by a regression test asserting the upsert is never called"
});
risks.push({
  risk: "The observer's adapter construction did not resolve per-venture credentials, so it fell through to each adapter's shared/environment-wide credential fallback (process.env.*) -- exactly the cross-venture identity leak lib/marketing/publisher/index.js's publish() is explicitly hardened against (SECURITY finding SEC-3, EXEC phase)",
  severity: 'low',
  mitigation: "observeOutcome() now resolves each lookup's own per-venture credential via lib/marketing/channel-secrets.js resolveChannelCredentials() (the SAME mechanism publish() uses) keyed on the ledger row's own venture_id, and leaves the outcome 'unknown' (never falls back to a shared identity) when no credential resolves for that venture+platform -- verified by regression tests"
});

const metadata = {
  ...prd.metadata,
  plan_revision_note_4: {
    at: new Date().toISOString(),
    reason: "EXEC-phase SECURITY sub-agent review (pub-obs-security-exec) found 3 real, diff-specific findings in the actual implementation (not caught by PRD-level review): SEC-1 (LOW) unvalidated tweetId in getTweet() could hit a different authenticated endpoint; SEC-2 (LOW-MED, the most serious) evaluateGraduation's mock-mode branch could silently demote a live-graduated channel's real autonomy_state, since venture_channel_autonomy has no mode dimension; SEC-3 (LOW, scope deviation) the observer bypassed the per-venture credential mechanism and fell back to a shared/environment-wide identity, contradicting the SD's own stated security scope ('channel reads use the keys already provisioned for publishing'). All three fixed in code with independently-verified-discriminating regression tests (each reverted and confirmed to fail pre-fix). The automated repo-wide RLS/SECURITY-DEFINER scanner findings in the same evidence row (missing get_tables_without_rls RPC, 59 pre-existing SECURITY DEFINER functions) are unrelated baseline repo debt, not introduced by or in scope for this SD.",
    source_evidence_row: '643e2ab4-df27-4b71-bd08-aa37d900f763'
  }
};

const { error: writeErr } = await supabase.from('product_requirements_v2').update({ risks, metadata }).eq('id', PRD_ID);
if (writeErr) throw writeErr;
console.log('PRD round-4 corrected. risks:', risks.length);
