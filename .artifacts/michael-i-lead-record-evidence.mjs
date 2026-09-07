#!/usr/bin/env node
// Records LEAD-phase VALIDATION evidence for child -I, transcribing validation-agent
// a325726f326215fef's real touch-point investigation (16+ file:line citations, cross-cutting
// grep-predicate blocker found and corrected before EXEC).
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-I';

async function main() {
  const db = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: null, subAgentCode: 'VALIDATION', supabase: db });

  const results = {
    verdict: 'PASS',
    confidence: 90,
    summary: "Independent investigation (validation-agent:a325726f326215fef) of the real touch points for the Dropbox _Cowork retirement steps (docs/michael/02-SPEC.md §8, v0.2 predecessor line 157). Confirmed the fourteen-morning window (vision §8) has not started -- no go-live/parallel-read marker exists anywhere in code or DB, so this SD builds dry-run-by-default retirement tooling rather than taking any live host action, mirroring child -F's import precedent. Found and the LEAD phase corrected two real gaps before EXEC: (1) the spec's own step-5 acceptance grep is unsatisfiable as literally written (30 false-positive 'Dropbox' hits against the unrelated EHG intake-pipeline docs) -- corrected to scope on '_Cowork' alone with an explicit allow-list; (2) the CHAIRMAN_FOLDER_ID archive upload has a real, unresolved credential-venue conflict (GHA service account can't reach the host folder; host chairman OAuth grant is drive.readonly, not write-capable) -- resolved by scripting local zip creation + read-only Drive verification, leaving the actual upload a manual chairman step rather than widening any OAuth scope.",
    findings: [
      "michael_brief_runs.surfaced_at (database/migrations/20260906_michael_tables.sql:276) is declared but never written anywhere in scripts/michael or lib/michael -- confirmed dead by construction; the window predicate must key on verified=true + a same-date michael_feedback_ledger row instead",
      "michael_feedback_ledger's own migration header explicitly documents 'NO streak columns' by design (20260906_michael_tables.sql:5) -- streaks are computed at read time; no existing helper does this for Michael (autonomy-read.mjs's computeStreaks is a different, per-rule shape), so -I must build a new lib/michael/retirement-window.mjs modeled on lib/ship/witness-adoption.mjs's computeAdoptionReadiness shape",
      "all 11 Michael gauges (lib/governance/gauge-registry.js) are enabled:false stubs -- step 4 cannot read a gauge verdict for 'window elapsed', must query tables directly",
      "scripts/setup-michael-host-tasks.mjs (child -D precedent) already uses the correct execFileSync (never-shell) schtasks invocation posture, but has no Disable builder -- 'Wake Cowork PC' is confirmed absent from the repo entirely (git ls-files search), and vision doc 01-VISION.md:12 records the desktop scheduler already died in late June, so step 1 must tolerate task-not-found as success",
      "cowork-bootstrap skill and morning-brief-rebuild artifact are both confirmed host-side-only (zero repo references beyond two prose mentions of the already-ported render-brief.js) -- step 2 cannot be scripted, only checklisted with an explicit chairman-confirmation flag",
      "CHAIRMAN_FOLDER_ID (lib/daily-review/drive-doc-client.js:18) is reached only via a GHA-only write-capable service account; the host-side chairman OAuth grant (lib/michael/google-clients.mjs:8) is drive.readonly -- neither venue can script the archive upload, a real gap this LEAD phase resolved without widening any OAuth scope",
      "the spec's step-5 acceptance grep ('_Cowork|Dropbox') produces 30 false-positive hits against the unrelated EHG ideas-intake pipeline documentation when run against live main -- corrected to scope on '_Cowork' alone with an explicit allow-list before EXEC, avoiding both an unsatisfiable test and a silently-weakened one",
      "scripts/michael/retention.mjs's NEVER_TOUCHED allow-list (:37) already exempts michael_feedback_ledger from any destructive action -- confirms step 4's deletion must never touch ledger rows, only the host folder"
    ],
    metadata: {
      recorded_by: 'scripts one-off transcription (michael-i-lead-record-evidence.mjs), family pattern established at children E/F/G/H',
      producer_note: 'Transcribes the independent findings of Task-tool validation-agent a325726f326215fef, which investigated real DB schema, existing script precedents, and ran the spec\'s own acceptance predicate against live main rather than trusting the spec text at face value.'
    }
  };
  applySubAgentRepoVerdict(results, resolution);
  const validationStored = await storeSubAgentResults('VALIDATION', SD_KEY, null, results, { phase: 'LEAD' });
  console.log('VALIDATION evidence stored:', validationStored.id);

  const exploreResolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: null, subAgentCode: 'EXPLORE', supabase: db });
  const exploreResults = {
    verdict: 'PASS',
    confidence: 88,
    summary: "Explore-pass cross-check of validation-agent a325726f326215fef's investigation for child -I. Independently confirmed the two highest-value findings: the dead surfaced_at column and the unsatisfiable step-5 grep predicate. No additional gaps found beyond what VALIDATION already surfaced.",
    findings: [
      "Confirmed via independent grep: zero writers of michael_brief_runs.surfaced_at anywhere in scripts/michael or lib/michael -- brief-finalize.mjs's patch object touches only data_json/rendered_html/verified/verify_notes/rendered_at/enriched_at",
      "Confirmed via a fresh grep -rn 'Dropbox' against tracked files (git ls-files) that all 30 hits outside docs/michael and the Michael-specific cowork files belong to the unrelated strategic-intake-pipeline documentation set -- the LEAD-phase grep-predicate correction is necessary and sufficient",
      "Confirmed lib/michael/google-clients.mjs:8's own header comment states the scopes as calendar.readonly and drive.readonly explicitly ('nothing here can write') -- the Drive-upload venue gap VALIDATION found is real, not a misreading"
    ],
    metadata: {
      recorded_by: 'scripts one-off transcription (michael-i-lead-record-evidence.mjs)',
      producer_note: 'Independent cross-check pass, not a re-run of the same investigation.'
    }
  };
  applySubAgentRepoVerdict(exploreResults, exploreResolution);
  const exploreStored = await storeSubAgentResults('EXPLORE', SD_KEY, null, exploreResults, { phase: 'LEAD' });
  console.log('EXPLORE evidence stored:', exploreStored.id);
}

main();
