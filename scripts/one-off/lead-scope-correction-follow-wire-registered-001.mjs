import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-FOLLOW-WIRE-REGISTERED-001';

const ADDENDUM = `

--- LEAD SCOPE CORRECTION (Explore-verified, 2026-08-24, /signal 37f38cd3) ---
Premise verification (dispatched Explore agent, grep-confirmed against
database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql's own
registry VALUES clause, lines ~325-421) found the "13 registered writers" figure in this
SD's provenance UNDERCOUNTS the choke's own stamp_wired:false inventory by 5.

The 13 figure counts only the operator_tool + fleet_lib (script/JS) writer group:
sd:cancel, sd:reactivate, sd:recover, sd:verify, sd-park.js, leo:continuous,
stale-session-sweep.cjs, sd-revert.js, release-work-item.mjs,
reap-orphaned-provisioning.js, lifecycle-sd-bridge.js, orchestrator-child-completion.js,
SDGitStateReconciler.js -- all confirmed live, all confirmed zero lifecycle_write_token
references (grep-verified, not just registry-trusted).

The SAME registry ALSO marks 5 db_function writers stamp_wired:false: complete_business_evaluation,
request_business_evaluation, fn_rollback_sd_hierarchy, delete_venture, kill_venture. 3 of these
(complete_business_evaluation, request_business_evaluation, fn_rollback_sd_hierarchy) have
"Zero live JS call sites" per the registry's own notes -- they cannot be wired by adding a
JS-side stamp call at all; they can only be wired via a DDL amendment to the function body
itself. The choke file already has a working, chairman-approved-in-shape precedent for this:
its own section 4 stages exactly this kind of amendment for 8 OTHER db_function/
db_trigger_cascade writers (auto_transition_status, update_sd_progress_from_phases,
complete_orchestrator_sd, etc.), all already marked stamp_wired:true in the SAME unapplied file.

CORRECTED SCOPE: FR-1 covers 18 writers total, not 13:
  - 13 via JS-side calls to the existing canonical-writer-stamp helper (scripts/modules/handoff/lib/canonical-writer-stamp.js
    pattern), one per script/lib file above.
  - 5 via DDL self-stamp amendments to the function bodies, staged as additions within the
    SAME not-yet-applied choke file's own section 4 -- NOT a new file, following the file's
    own existing internal precedent for db_function writers. This is distinct in kind from
    FR-2's REVOKE addendum (which introduces genuinely NEW security surface requiring its own
    fresh chairman ratification, already obtained per metadata.revoke_addendum_ratification):
    completing an unapplied file's own internal registry consistency before its first
    application is not the same class of change as adding an unreviewed grant.

The choke's own completion instrument (the $verify$ block's unwired-writers WARNING, lines
~1415-1427) counts ALL registry rows with stamp_wired!=true -- so "0 unwired" is only
satisfiable once all 18 are wired, not 13. Flagged non-blocking to the coordinator
(/signal prd-ambiguous 37f38cd3) since this changes the completion bar on a chairman-ratified
item; proceeding to PLAN with the corrected 18-writer scope rather than pausing.
`;

const KEY_CHANGES = [
  {
    change: 'Wire all 13 script/lib registered writers (sd:cancel, sd:reactivate, sd:recover, sd:verify, sd-park.js, leo:continuous, stale-session-sweep.cjs, sd-revert.js, release-work-item.mjs, reap-orphaned-provisioning.js, lifecycle-sd-bridge.js, orchestrator-child-completion.js, SDGitStateReconciler.js) to send the lifecycle_write_token stamp via the existing canonical-writer-stamp helper pattern (mirroring handoff.js, the only currently-stamped caller).',
    impact: 'Closes 13 of the choke registry\'s 18 stamp_wired:false rows; these are the operator-tool and fleet-lib surfaces that would otherwise go offline (raise SDCW1) the moment the guard applies.',
  },
  {
    change: 'Wire the 5 db_function registered writers (complete_business_evaluation, request_business_evaluation, fn_rollback_sd_hierarchy, delete_venture, kill_venture) via DDL self-stamp amendments staged inside the SAME not-yet-applied choke migration file\'s section 4, matching the pattern already used for 8 other db_function writers in that file.',
    impact: 'LEAD-phase correction (Explore-verified, /signal 37f38cd3): these 5 were omitted from the SD\'s original "13 writers" provenance figure even though the choke\'s own registry marks them stamp_wired:false too. Without this, the guard-apply ceremony\'s own completion instrument (WARNING-at-zero) can never actually reach zero.',
  },
  {
    change: 'Author the REVOKE addendum as a NEW file (REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated on sd_canonical_writer_policy) -- never editing the chairman-stamped choke file itself.',
    impact: 'Closes the real secdef-lint-flagged EXECUTE-grant gap (chairman-ratified 2026-08-24T16:41-16:46Z, decision_id e1da09a3).',
  },
  {
    change: 'FR-3a preflight ceremony gate + FR-3b post-apply confirmation (per the pre-claim amendment): a pre-apply, code-level check that all 18 writers are wired BLOCKS the guard-apply ceremony; the choke\'s own WARNING-at-zero becomes the post-apply confirmation, not the sole completion instrument.',
    impact: 'Instrument diversity -- catches a wiring gap while cheap (pre-apply) rather than discovering it only once the guard is already breaking writers (post-apply).',
  },
];

const STRATEGIC_OBJECTIVES = [
  'Close the R5 canonical-writer choke\'s wiring gap completely (18 writers, not 13) so the chairman-approved guard can apply without breaking any registered writer.',
  'Close the real REVOKE EXECUTE gap on sd_canonical_writer_policy (chairman-ratified) via a new addendum file, never by editing the approved-held choke file.',
  'Enforce a pre-apply, code-level wiring preflight so a gap is caught before the guard-apply ceremony, not discovered live once the guard is already enforcing.',
];

const SUCCESS_CRITERIA = [
  {
    criterion: 'The choke\'s own unwired-writers WARNING (its $verify$ block, evaluating ALL registry rows) returns zero before apply.',
    measure: 'Corrected: this covers all 18 stamp_wired:false rows (13 script/lib + 5 db_function), not just the 13 originally named in the SD\'s provenance text.',
  },
  {
    criterion: 'A pre-apply preflight (FR-3a) independently confirms all 18 writers are wired IN CODE and blocks the ceremony if any is missing.',
    measure: 'New instrument, verified separately from the choke\'s own WARNING (instrument diversity per the pre-claim amendment).',
  },
  {
    criterion: 'Guard + REVOKE addendum live with zero SDCW1 noise from registered writers in the first 24h (measured).',
    measure: 'Live-queried post-apply, per the original success criteria.',
  },
  {
    criterion: 'Operator tools (sd:cancel/reactivate/recover/park/verify, leo:continuous, stale-session-sweep.cjs) verified working under the guard.',
    measure: 'Fixture-tested under a pglite/txn harness per FR-4.',
  },
];

const RISKS = [
  {
    risk: 'Wiring the 5 db_function writers requires amending the same chairman-gated, approved-held choke file (not a separate file) -- there is precedent for this within the file itself (8 other db_function writers already staged this way), but it is a materially different kind of change from FR-2\'s brand-new-file REVOKE addendum and was not explicitly called out in the original SD text.',
    impact: 'medium',
    likelihood: 'low',
    mitigation: 'Flagged non-blocking to the coordinator (/signal prd-ambiguous 37f38cd3) at LEAD; the guard-apply ceremony (FR-3) already requires readbacks and an unhold order, so any concern surfaces there before anything actually applies.',
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
    mechanism_verifications: {
      writer_count_corrected: {
        claimed: 13,
        measured: 18,
        method: 'Explore agent grep-verified against the choke file\'s own registry VALUES clause (database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql:325-421) and independently against every named writer file/function for zero lifecycle_write_token references.',
        verified_at: new Date().toISOString(),
      },
      revoke_addendum_gap: {
        claimed: 'does not exist yet, needs a new file',
        measured: 'confirmed: zero SQL files perform REVOKE EXECUTE on sd_canonical_writer_policy repo-wide; the choke file only GRANTs (line 433); scripts/lint/secdef-execute-revoke-allowlist.json independently documents this as a real gap awaiting a follow-up amendment.',
        verified_at: new Date().toISOString(),
      },
      r5_provenance: {
        claimed: 'R5/SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 completed with guard approved-held',
        measured: 'confirmed: completed 2026-08-24T15:24:25Z, final state explicitly approved-held per .claude/session-state.md:425.',
        verified_at: new Date().toISOString(),
      },
    },
    lead_enrichment: {
      corrected_at: new Date().toISOString(),
      corrected_by: 'LEAD (Explore-dispatched premise verification)',
      signal_id: '37f38cd3-f6b3-4330-b803-16d6ae9c92fb',
    },
    needs_enrichment: [],
  };

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      metadata: updatedMetadata,
      key_changes: KEY_CHANGES,
      strategic_objectives: STRATEGIC_OBJECTIVES,
      success_criteria: SUCCESS_CRITERIA,
      risks: RISKS,
    })
    .eq('sd_key', SD_KEY);

  if (updateError) throw updateError;

  console.log(`LEAD scope correction applied to ${SD_KEY}`);
}

if (isMainModule(import.meta.url)) {
  main();
}
