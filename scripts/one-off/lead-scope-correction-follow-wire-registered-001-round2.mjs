import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-FOLLOW-WIRE-REGISTERED-001';

const NEW_TITLE = 'R5 follow-on: wire the 18 registered writers + REVOKE addendum, then apply the approved-held guard';

const ADDENDUM = `

--- LEAD SCOPE CORRECTION ROUND 2 (VALIDATION-verified, 2026-08-24, evidence d041e68a) ---
An independent LEAD-phase VALIDATION pass (CONDITIONAL_PASS, confidence 88) re-derived
round 1's 18-vs-13 finding from scratch (confirmed) and surfaced 3 blocking corrections round 1
missed:

C-1 (title): this SD's own TITLE still said "13 registered writers" even after round 1
corrected the structured columns -- the title is the most-read surface and would keep
re-seeding the wrong number. Corrected to "18 registered writers".

C-2 (timestamp instrument mismatch): metadata.revoke_addendum_ratification.at said
"2026-08-24T16:41-16:46Z", but the actual sms_relay_staging rows backing decision_id
e1da09a3 (45411c8a-1ca7-4e19-8bcc-597da2b52585 body="A", fc671c59-854b-4443-bab3-4aed971b4627
body="Go and ratify") have received_at = 2026-08-24T16:16:08.848Z and
2026-08-24T16:25:40.363Z respectively -- pasted verbatim from the instrument below,
replacing the narrated (wrong) window. The decision content and signature validity are both
confirmed real; only the timestamp narration was wrong.

C-4 (design correction -- round 1's own resolution reversed): round 1 proposed wiring the 5
db_function writers (complete_business_evaluation, request_business_evaluation,
fn_rollback_sd_hierarchy, delete_venture, kill_venture) via a DDL amendment staged INSIDE the
same chairman-gated choke file's own section 4. VALIDATION correctly identified this
contradicts the SD's OWN stated rule ("never editing the chairman-stamped choke file itself"),
already applied to FR-2's REVOKE addendum -- and that the 5 db_function writers are NOT
risk-equivalent to the 8 existing precedent amendments in that section: 3 of 5 are SECURITY
DEFINER, they sit in the venture/business-evaluation product domain rather than the handoff
lifecycle domain, and delete_venture is on a LIVE product path (lib/deleteVentureFully.js:148).
Per this org's own MECH-AMEND calibration (equivalence-preserving apply-mechanics amendments
are decide-and-inform; anything that changes outcome/semantics/permissions is an ask),
redefining live SECURITY DEFINER product-domain functions is the latter, not the former.

CORRECTED FR-1 DESIGN: the 5 db_function writers are now wired via a SEPARATE addendum file
(matching FR-2's own established pattern -- author a new file, never edit the approved-held
choke file), not by amending the choke file's section 4. This keeps FR-1 internally consistent
with the rule the SD already imposes on FR-2, and keeps the higher-risk, live-product-path
functions on the same "new file, its own approval" footing as the REVOKE grant change.

VALIDATION also found the likely ROOT CAUSE of the original "13": the choke file itself is
internally inconsistent (line 307 says "13 own-UPDATE sites + the 2 RPCs" describing pipeline
UPDATE SITES, while line 330 separately says "12 reachable own-UPDATE sites") -- the SD's
provenance appears to have imported the pipeline-site count as a writer count, and it happened
to numerically coincide with the true script/lib writer count (also 13), making the error
self-consistent and easy to miss.

Non-blocking recommendations carried into FR-3a's design (from VALIDATION's REC-3/4/6/7, not
requiring an SD field change now, tracked for PLAN/EXEC): enumerate writers by calling
sd_canonical_writer_policy(NULL) at preflight time rather than hardcoding the count of 18;
be multi-line/raw-pg/payload-by-reference aware when scanning for the stamp (VALIDATION's own
first two scan attempts reproduced a documented ~0%-recall same-line-regex defect at
scripts/lib/lead-precheck-helpers.js:300-421); explicitly exclude the dead, unreachable
lib/db/SDRepository.js:187 updateStatus() (writes status+current_phase unstamped but has zero
call sites, predecessor-SD disposition no_action_needed); and note the ESM-vs-CJS interop gap
-- stale-session-sweep.cjs cannot require() an ESM-only stamp helper, and since each writer
must send its OWN registry identity (not the shared CANONICAL_WRITER_STAMP='handoff.js'
constant), the stamp helper needs either a dual-format export or a per-writer identity param.
`;

const KEY_CHANGES = [
  {
    change: 'Wire all 13 script/lib registered writers (sd:cancel, sd:reactivate, sd:recover, sd:verify, sd-park.js, leo:continuous, stale-session-sweep.cjs, sd-revert.js, release-work-item.mjs, reap-orphaned-provisioning.js, lifecycle-sd-bridge.js, orchestrator-child-completion.js, SDGitStateReconciler.js) to send the lifecycle_write_token stamp via the existing canonical-writer-stamp helper pattern (mirroring handoff.js, the only currently-stamped caller). Each writer sends its OWN registry identity, not a shared constant.',
    impact: 'Closes 13 of the choke registry\'s 18 stamp_wired:false rows; these are the operator-tool and fleet-lib surfaces that would otherwise go offline (raise SDCW1) the moment the guard applies.',
  },
  {
    change: 'Wire the 5 db_function registered writers (complete_business_evaluation, request_business_evaluation, fn_rollback_sd_hierarchy, delete_venture, kill_venture) via a SEPARATE, NEW addendum file (matching FR-2\'s own new-file pattern) -- never editing the chairman-stamped choke file\'s section 4, since these 5 are not risk-equivalent to that section\'s existing 8 precedent amendments (3 are SECURITY DEFINER, live in the venture/business-evaluation product domain, and delete_venture sits on a live product call path).',
    impact: 'Round-2 correction (VALIDATION evidence d041e68a, confidence 88): round 1 had proposed amending the choke file directly, which contradicted the SD\'s own "never edit the chairman-stamped file" rule already applied to FR-2. Keeping FR-1 and FR-2 on the same footing (new file, fresh approval) avoids an inconsistent security posture.',
  },
  {
    change: 'Author the REVOKE addendum as a NEW file (REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated on sd_canonical_writer_policy) -- never editing the chairman-stamped choke file itself.',
    impact: 'Closes the real secdef-lint-flagged EXECUTE-grant gap (chairman-ratified 2026-08-24T16:16:08.848Z + 16:25:40.363Z per sms_relay_staging rows 45411c8a/fc671c59, decision_id e1da09a3 -- timestamp corrected round 2 from a narrated-but-wrong 16:41-16:46Z window).',
  },
  {
    change: 'FR-3a preflight ceremony gate + FR-3b post-apply confirmation (per the pre-claim amendment): a pre-apply, code-level check that all 18 writers are wired BLOCKS the guard-apply ceremony; the choke\'s own WARNING-at-zero becomes the post-apply confirmation, not the sole completion instrument. Preflight enumerates by calling sd_canonical_writer_policy(NULL) rather than a hardcoded count, and is multi-line/raw-pg-aware when scanning for the stamp.',
    impact: 'Instrument diversity -- catches a wiring gap while cheap (pre-apply) rather than discovering it only once the guard is already breaking writers (post-apply). The multi-line/raw-pg awareness closes a documented ~0%-recall same-line-regex scanning defect VALIDATION independently reproduced.',
  },
];

const SUCCESS_CRITERIA = [
  {
    criterion: 'The choke\'s own unwired-writers WARNING (its $verify$ block, evaluating ALL registry rows) returns zero before apply.',
    measure: 'Covers all 18 stamp_wired:false rows (13 script/lib + 5 db_function), not the original "13" figure -- which VALIDATION traced to the choke file\'s own internal inconsistency between a pipeline-UPDATE-site count and a writer count that happened to numerically coincide.',
  },
  {
    criterion: 'A pre-apply preflight (FR-3a) independently confirms all 18 writers are wired IN CODE and blocks the ceremony if any is missing.',
    measure: 'New instrument, verified separately from the choke\'s own WARNING (instrument diversity per the pre-claim amendment). Enumerates via sd_canonical_writer_policy(NULL), not a hardcoded count.',
  },
  {
    criterion: 'Both the REVOKE addendum and the 5-writer DDL addendum are new files with their own explicit approval trail, never edits to the chairman-stamped choke file.',
    measure: 'Round-2 addition: consistency check that FR-1 and FR-2 follow the identical never-edit-the-approved-file rule.',
  },
  {
    criterion: 'Guard + both addenda live with zero SDCW1 noise from registered writers in the first 24h (measured).',
    measure: 'Live-queried post-apply, per the original success criteria.',
  },
  {
    criterion: 'Operator tools (sd:cancel/reactivate/recover/park/verify, leo:continuous, stale-session-sweep.cjs) verified working under the guard.',
    measure: 'Fixture-tested under a pglite/txn harness per FR-4.',
  },
];

const RISKS = [
  {
    risk: 'The 5 db_function writers include 3 SECURITY DEFINER functions on the venture/business-evaluation product domain, one of which (delete_venture) sits on a live product call path (lib/deleteVentureFully.js) -- amending them, even via a new addendum file rather than the choke file directly, is a higher-consequence change than the 13 script/lib writers.',
    impact: 'medium',
    likelihood: 'low',
    mitigation: 'Staged as its own addendum file with its own explicit approval trail (not bundled into or editing the chairman-stamped choke file); the guard-apply ceremony (FR-3) already requires readbacks and an unhold order before anything applies.',
  },
  {
    risk: 'Implementation may not fully address root cause',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'Verify against original evidence; re-queue via /learn if pattern recurs',
  },
];

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: sd, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();

  if (fetchError) throw fetchError;

  const updatedMetadata = {
    ...sd.metadata,
    plan_content: `${sd.metadata.plan_content}${ADDENDUM}`,
    revoke_addendum_ratification: {
      ...sd.metadata.revoke_addendum_ratification,
      at: '2026-08-24T16:16:08.848Z (row 45411c8a, body="A") and 2026-08-24T16:25:40.363Z (row fc671c59, body="Go and ratify") -- corrected round 2 from a narrated-but-instrument-contradicted 16:41-16:46Z window (VALIDATION evidence d041e68a)',
    },
    mechanism_verifications: {
      ...sd.metadata.mechanism_verifications,
      round2_validation: {
        evidence_id: 'd041e68a-d694-4421-b069-93f4ae1603c6',
        verdict: 'CONDITIONAL_PASS',
        confidence: 88,
        blocking_conditions_resolved: ['C-1 title', 'C-2 ratification timestamp', 'C-4 db_function wiring design'],
        verified_at: new Date().toISOString(),
      },
    },
    lead_enrichment: {
      ...sd.metadata.lead_enrichment,
      round2_corrected_at: new Date().toISOString(),
    },
  };

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      title: NEW_TITLE,
      metadata: updatedMetadata,
      key_changes: KEY_CHANGES,
      success_criteria: SUCCESS_CRITERIA,
      risks: RISKS,
    })
    .eq('sd_key', SD_KEY);

  if (updateError) throw updateError;

  console.log(`LEAD scope correction round 2 applied to ${SD_KEY}`);
}

if (isMainModule(import.meta.url)) {
  main();
}
