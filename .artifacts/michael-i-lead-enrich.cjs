#!/usr/bin/env node
// LEAD-phase enrichment for SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-I, citing validation-agent
// a325726f326215fef's investigation of the real touch points (16 file:line citations, cross-repo).
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-I';

async function main() {
  const { data: sd, error: fetchErr } = await supabase.from('strategic_directives_v2')
    .select('metadata').eq('sd_key', SD_KEY).single();
  if (fetchErr) throw fetchErr;

  const key_changes = [
    {
      change: "New scripts/michael/retire-cowork.mjs orchestrates the 5 retirement steps from docs/michael/02-SPEC.md §8 (v0.2 predecessor, git 2127b0ace0b, line 157 -- v0.3 says 'unchanged from v0.2') in order, dry-run by default (--apply required for steps 1-3, a SEPARATE --apply-deletion required for step 4 given its irreversibility), matching child -F's import-cowork-memory.mjs precedent exactly.",
      impact: "The retirement mechanism is built and testable now, without taking any live, irreversible host action before its real precondition (the fourteen-morning window) actually holds -- which validation confirmed has NOT started, since only children A-H have landed and there is no go-live/parallel-read marker anywhere in code or DB."
    },
    {
      change: "Step 1 (disable remaining Cowork scheduled tasks + 'Wake Cowork PC'): extends scripts/setup-alarm-cron-tasks.mjs's existing pure builder set (buildCreateArgs/buildRemoveArgs/buildQueryArgs/buildQueryXmlArgs at :125-141) with a new buildDisableArgs ('/Change','/TN',name,'/DISABLE'), invoked via the same execFileSync posture as scripts/setup-michael-host-tasks.mjs:103 -- never a shell string, so the fleet's known schtasks-from-Git-Bash-returns-false-empty defect never applies. 'Wake Cowork PC' is NOT FOUND anywhere in the repo (confirmed via git ls-files search) and vision doc 01-VISION.md:12 records 'the overnight feeders died when the desktop scheduler went away in late June' -- so the step must treat 'task not found' as already-satisfied, not a failure.",
      impact: "Reuses a proven, already-tested schtasks invocation pattern instead of inventing a new one, and correctly handles the realistic case that the Cowork-era tasks may already be gone."
    },
    {
      change: "Step 2 (delete morning-brief-rebuild artifact, uninstall cowork-bootstrap skill): both are confirmed host-side-only and NOT reachable by this repo (cowork-bootstrap: zero hits repo-wide; morning-brief-rebuild: only prose references at lib/michael/render-brief.js:4 and docs/michael/02-SPEC.md:127 -- the actual port already happened, render-brief.js exists). retire-cowork.mjs cannot perform this step in code; it prints the checklist instructions and records chairman confirmation via a --confirm-step2 flag, written to the ledger/report metadata.",
      impact: "The script is honest about what it can and cannot do from inside the repo, rather than silently no-op'ing a step it has no way to verify."
    },
    {
      change: "Step 3 (archive C:\\Users\\rickf\\Dropbox\\_Cowork as _Cowork-archive-<date>.zip into CHAIRMAN_FOLDER_ID = '1_Ui4ckZLtIUi3Sm9W_y41eEDHEnNIwDP', lib/daily-review/drive-doc-client.js:18): zip creation happens locally via PowerShell Compress-Archive through execFileSync (no zip library exists in the repo -- confirmed via dependency grep). Upload is a MANUAL chairman/host action, not scripted -- validation confirmed neither available Google Drive venue can write it: the GHA service-account credential (drive-doc-client.js's own venue) cannot reach the host's local folder, and the host-side chairman OAuth grant (lib/michael/google-clients.mjs:8) is drive.readonly, not write-capable. retire-cowork.mjs instead VERIFIES the upload landed using the existing read-only listDriveFiles({folderId, name}) (google-clients.mjs:69), refusing to mark step 3 complete until the file is actually present in Drive.",
      impact: "Closes a real venue gap validation found (neither existing credential can write this upload) without widening any OAuth scope or building a new write pathway -- both of which would be meaningful, out-of-scope security surface for a retirement child. The script still provides real, automated verification rather than trusting an unverified chairman claim."
    },
    {
      change: "Step 4 (delete the folder, gated on the fourteen-morning window from vision §8 having elapsed): new lib/michael/retirement-window.mjs computes the streak directly from michael_brief_runs.verified=true + a same-et_date michael_feedback_ledger row (NOT michael_brief_runs.surfaced_at, which validation confirmed is a declared-but-never-written column -- dead by construction), modeled on lib/ship/witness-adoption.mjs:142's computeAdoptionReadiness shape (walk from a start date, skip/break, return {ready, consecutiveDays, reason}) since no Michael-native streak helper exists (autonomy-read.mjs:27's computeStreaks is a different, per-rule shape). Since no go-live marker exists anywhere, the window start is an explicit required --window-start <et_date> argument, not auto-derived. Refuses with WINDOW_NOT_ELAPSED unless the streak is >= 14 AND requires the separate --apply-deletion flag. michael_feedback_ledger rows themselves are never touched by this step, matching scripts/michael/retention.mjs's NEVER_TOUCHED precedent (:37).",
      impact: "The single highest-risk step (irreversible host deletion) cannot fire without both a real, DB-verified 14-day streak and explicit operator intent -- it structurally cannot be triggered by an accidental --apply."
    },
    {
      change: "Step 5's acceptance predicate is corrected before EXEC: the spec's literal grep -r \"_Cowork\\|Dropbox\" lib scripts .github docs is unsatisfiable as written -- validation found 30 live hits for the bare 'Dropbox' alternation, all in the unrelated EHG ideas-intake pipeline (docs/06_deployment/strategic-intake-pipeline-v1.md and 10 other files), none Cowork-related. The corrected predicate scopes to _Cowork alone (dropping the Dropbox alternation), with an explicit allow-list for the files that legitimately and permanently reference it (scripts/michael/import-cowork-memory.{mjs,test.js}, lib/michael/cowork-*.mjs, docs/michael/**). Encoded as an automated test, not a manual eyeball check.",
      impact: "Prevents EXEC from either shipping a test that can never pass (unsatisfiable predicate) or silently weakening the check to something that would pass trivially and miss the real thing it's meant to catch."
    }
  ];

  const success_criteria = [
    { criterion: "retire-cowork.mjs exists, dry-run by default; --apply required for steps 1-3, a separate --apply-deletion required for step 4", measure: "unit tests exercise the flag gating with no real side effects" },
    { criterion: "Step 1 tolerates a not-found scheduled task as success, never as failure", measure: "unit test asserts this with a mocked schtasks query returning ERROR 2 (task not found)" },
    { criterion: "Step 3's upload is verified via the existing read-only listDriveFiles, never scripted as a write", measure: "grep confirms no new Drive write/create call anywhere in the new code; a unit test mocks listDriveFiles and asserts the step refuses to complete until the file is present" },
    { criterion: "Step 4 refuses deletion unless a real >=14-day streak is computed from live michael_brief_runs/michael_feedback_ledger rows AND --apply-deletion is passed", measure: "unit tests cover: streak < 14 refuses; streak >= 14 with --apply-deletion absent still refuses; both conditions met proceeds (mocked filesystem, never a real host deletion in CI)" },
    { criterion: "Step 5's corrected grep predicate (scoped to _Cowork, with the documented allow-list) passes against the live repo", measure: "a real test executes the corrected grep and asserts zero un-allow-listed hits" }
  ];

  const success_metrics = [
    { metric: "No live host action taken during this SD's build", target: "Zero real schtasks mutations, zero real Drive uploads, zero real folder deletions execute during EXEC -- everything is dry-run/mocked in tests, since the real 14-morning window has not started" },
    { metric: "Acceptance grep correctness", target: "The corrected step-5 predicate passes against current main with zero false positives and zero false negatives against the documented allow-list" },
    { metric: "Deletion-gate soundness", target: "retirement-window.mjs's streak computation is covered by tests proving both directions: a real >=14-day verified streak passes, and any gap (missing brief_runs row, unverified brief, or missing ledger row on any date in the window) breaks the streak and refuses deletion" }
  ];

  const smoke_test_steps = [
    { step_number: 1, instruction: "node scripts/michael/retire-cowork.mjs (no flags)", expected_outcome: "Dry-run report printing all 5 steps' status, no side effects" },
    { step_number: 2, instruction: "npm run test:unit -- scripts/michael/retire-cowork.test.js lib/michael/retirement-window.test.js", expected_outcome: "All pass, including the flag-gating, not-found-tolerance, streak-computation, and Drive-verification-not-write tests" },
    { step_number: 3, instruction: "grep -rn '_Cowork' lib scripts docs (scoped, excluding the documented allow-list files)", expected_outcome: "Zero hits outside the allow-list" },
    { step_number: 4, instruction: "node scripts/michael/retire-cowork.mjs --apply-deletion --window-start 2026-01-01 (a deliberately-old, never-satisfied date)", expected_outcome: "Refuses with WINDOW_NOT_ELAPSED, no deletion attempted" }
  ];

  const mechanism_verifications = [
    { verified_by: 'validation-agent:a325726f326215fef', verified_at: 'scripts/setup-alarm-cron-tasks.mjs:125', note: 'confirmed the existing builder set (buildCreateArgs/buildRemoveArgs/buildQueryArgs/buildQueryXmlArgs) has no Disable builder -- new buildDisableArgs needed for step 1' },
    { verified_by: 'validation-agent:a325726f326215fef', verified_at: 'scripts/setup-michael-host-tasks.mjs:103', note: 'confirmed the execFileSync (never-shell) schtasks invocation posture this SD reuses' },
    { verified_by: 'validation-agent:a325726f326215fef', verified_at: 'lib/daily-review/drive-doc-client.js:18', note: 'confirmed CHAIRMAN_FOLDER_ID is a hardcoded constant reached only via the GHA-only service-account credential' },
    { verified_by: 'validation-agent:a325726f326215fef', verified_at: 'lib/michael/google-clients.mjs:8', note: 'confirmed the host-side chairman OAuth grant scopes are calendar.readonly and drive.readonly -- cannot write the archive upload' },
    { verified_by: 'validation-agent:a325726f326215fef', verified_at: 'lib/ship/witness-adoption.mjs:142', note: 'confirmed computeAdoptionReadiness as the nearest shape precedent for the new retirement-window streak computation' },
    { verified_by: 'validation-agent:a325726f326215fef', verified_at: 'scripts/michael/retention.mjs:37', note: 'confirmed the NEVER_TOUCHED allow-list already exempts michael_feedback_ledger from destructive actions' },
    { verified_by: 'validation-agent:a325726f326215fef', verified_at: 'database/migrations/20260906_michael_tables.sql:276', note: 'confirmed michael_brief_runs.surfaced_at is declared but never written anywhere -- dead column' },
    { verified_by: 'explore-agent:be799ce0-cross-check', verified_at: 'lib/michael/render-brief.js:4', note: 'confirmed morning-brief-rebuild is a prose-only reference; the actual port to render-brief.js already happened' }
  ];

  const metadata = {
    ...(sd.metadata || {}),
    mechanism_verifications,
    lead_design_notes: {
      ...(sd.metadata?.lead_design_notes || {}),
      exec_time_conditions: [
        'retire-cowork.mjs must never attempt a real schtasks mutation, Drive write, or filesystem deletion in the test suite -- all host interactions mocked',
        'step 4 window-start has no auto-derivation source; it is a required, explicit CLI argument until a go-live marker mechanism exists (out of scope for -I)',
        'do not widen the chairman OAuth Drive scope beyond drive.readonly for this SD -- that is a security-relevant change requiring its own review, not bundled into a retirement child'
      ]
    }
  };

  const { error } = await supabase.from('strategic_directives_v2').update({
    key_changes, success_criteria, success_metrics, smoke_test_steps, metadata
  }).eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('SD-I enriched successfully.');
}

main().catch(e => { console.error(e); process.exit(1); });
