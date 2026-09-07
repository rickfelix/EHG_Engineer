#!/usr/bin/env node
// Records the PLAN-TO-EXEC TESTING evidence for child -I, transcribing testing-agent
// a4cc2b598c73322da's strategy-only review findings, and folds the corrections into
// metadata.lead_design_notes.exec_time_conditions_from_testing_review for EXEC to follow.
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-I';

async function main() {
  const db = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: null, subAgentCode: 'TESTING', supabase: db });

  const results = {
    verdict: 'WARNING',
    confidence: 82,
    summary: "Strategy-only pre-EXEC review (testing-agent:a4cc2b598c73322da) of the 8 PRD test_scenarios, nothing built yet. Found 6 BLOCKING corrections against live sibling code (execFileSync throws rather than returns on failure -- the PRD's own mock description was backwards; a real 'Access is denied' schtasks result would be misclassified as success under the described tolerance; real Compress-Archive is NOT idempotent without -Force, contradicting the PRD's own idempotency claim; listDriveFiles has a third {ok:false} outcome the PRD's two-case test ignores; the PRD's cited streak model (witness-adoption.mjs) has INVERTED gap semantics -- it SKIPS missing days rather than breaking the streak, exactly backwards for gating an irreversible deletion; no persistence venue is defined for step 1-3 state, making the step-4 precondition unenforceable across process invocations). Also found a real DST-boundary date (window starting ~2026-10-25 through Nov 1 2026) and 8 additional test-scenario additions. All folded into EXEC guidance below.",
    findings: [
      "A1: execFileSync throws (does not return) on non-zero exit -- the PRD's mocked not-found test must mock a thrown error object with {status, stdout, stderr}, matching the real try/catch shape at scripts/setup-alarm-cron-tasks.mjs:179-181 and scripts/setup-michael-host-tasks.mjs:103-105",
      "A2: schtasks exit 1 covers BOTH not-found AND 'Access is denied' (scripts/setup-michael-host-tasks.mjs:21) -- a blanket exit-1 tolerance would report a still-enabled task as disabled; needs a named classifySchtasksResult() predicate distinguishing not_found/denied/failed/ok, with denied asserted as a step FAILURE",
      "A3: real Compress-Archive errors on an existing destination without -Force -- the PRD calls the tool idempotent but the mocked tests would stay green while a real second --apply run fails; needs -Force, -LiteralPath (not -Path), pinned powershell.exe -NoProfile -NonInteractive, and a re-run test",
      "A4: lib/michael/google-clients.mjs's listDriveFiles never throws, it returns {ok:false, error} on any credential/network/403 failure -- the PRD's found/not-found-only test would misreport 'could not check' as 'not uploaded'; needs a distinct UNVERIFIABLE outcome",
      "A5 (highest severity): lib/ship/witness-adoption.mjs's computeAdoptionReadiness, cited as the model for the streak function, explicitly SKIPS evidence-free days rather than breaking the streak -- a faithful port would return ready:true on a window full of holes, which is backwards for gating an irreversible folder deletion. EXEC must not inherit this behavior.",
      "A6: no persistence venue defined for step 1-3 completion state (needed to enforce FR-1's 'steps 1-3 complete before step 4' precondition across separate invocations) -- must follow import-cowork-memory.mjs's .artifacts/-file + injected-fsImpl precedent, and a missing/corrupt state file must fail CLOSED (refuse step 4), never open",
      "Q3: the 3 gap-breaking cases in the PRD are not exhaustive -- also needed: an ET/DST-boundary test (a window crossing 2026-11-01 DST-end), boundary-position tests at day 1/7/14 specifically (day-14 catches the classic off-by-one), --window-start input validation (malformed/future dates), and a test proving requiredConsecutiveDays cannot be CLI-lowered below 14",
      "Q4: FR-6's single synthetic-violation test needs 3 more assertions: a vacuity guard (total hits > 0 across allow-listed files, proving the grep isn't just finding nothing), allow-list entries all resolve on disk (catches silent rot from a rename), and explicit scope/case-sensitivity documentation -- implement as a pure Node fs walk, not a shelled-out grep (win32 fragility)",
      "C1: retirement-window.mjs is .mjs -- its test MUST be retirement-window.test.js (not .test.mjs), matching the existing lib/michael/*.test.js convention; vitest.config.js only collects .test.mjs under two unrelated tests/unit/ subtrees",
      "C2: retire-cowork.mjs's main logic must be exported as an injectable-deps function (sb, argv, now, fsImpl, execFileImpl, driveImpl, manifestPath), mirroring import-cowork-memory.mjs:82, or TS-1's 'zero side effects' claim is unprovable without spawning a real subprocess"
    ],
    metadata: {
      recorded_by: 'scripts one-off transcription (michael-i-plan-testing-record.mjs), family pattern established at children E/F/G/H',
      producer_note: 'Transcribes the independent findings of Task-tool testing-agent a4cc2b598c73322da, a strategy-only review against live sibling code (setup-alarm-cron-tasks.mjs, setup-michael-host-tasks.mjs, witness-adoption.mjs, google-clients.mjs) rather than the PRD text at face value.'
    }
  };
  applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('TESTING', SD_KEY, null, results, { phase: 'PLAN' });
  console.log('TESTING evidence stored:', stored.id);

  const { data: sd } = await db.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  const metadata = {
    ...(sd.metadata || {}),
    lead_design_notes: {
      ...(sd.metadata?.lead_design_notes || {}),
      exec_time_conditions_from_testing_review: {
        source: 'testing-agent:a4cc2b598c73322da PLAN-TO-EXEC review',
        must_do: [
          "Mock execFileSync as THROWING {status, stdout, stderr} on failure, never returning a failure shape -- matches the real try/catch posture in both sibling schtasks scripts",
          "Write classifySchtasksResult({status, stdout, stderr}) as a named, separately-unit-tested pure predicate returning not_found | denied | failed | ok; 'denied' is a step FAILURE, not a tolerated case",
          "Compress-Archive call must include -Force and -LiteralPath (never -Path), invoked via powershell.exe -NoProfile -NonInteractive; add a re-run/idempotency test",
          "listDriveFiles's {ok:false, error} outcome must map to a distinct UNVERIFIABLE step-3 result, never conflated with 'not uploaded'",
          "DO NOT port lib/ship/witness-adoption.mjs's skip-on-no-evidence behavior -- retirement-window.mjs MUST break the streak on any missing/unverified date, the opposite of that model's own semantics",
          "Persist step 1-3 completion state to a file (e.g. .artifacts/michael-cowork-retirement-state.json) via an injected fsImpl, following import-cowork-memory.mjs's own precedent; a missing/corrupt state file must fail CLOSED (step 4 refuses)",
          "--window-start requires input validation (malformed/future dates get distinct refusal reasons); requiredConsecutiveDays must not be CLI-lowerable below 14",
          "Add a DST-boundary test: a 14-day window starting 2026-10-25 (crosses Nov 1 2026 US DST end) must still resolve to exactly 14 distinct ET dates",
          "retirement-window.mjs's test file MUST be named retirement-window.test.js (not .test.mjs) to be collected by vitest.config.js",
          "retire-cowork.mjs's core logic must be exported as an injectable-deps function (sb, argv, now, fsImpl, execFileImpl, driveImpl, manifestPath) so tests can prove zero real side effects without spawning subprocesses",
          "FR-6's allow-list test needs: a vacuity guard (total hits > 0), an existence check for every allow-listed path, and coverage of tests/ and database/ in addition to lib/scripts/.github/docs"
        ]
      }
    }
  };
  const { error } = await db.from('strategic_directives_v2').update({ metadata }).eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('EXEC-time conditions folded into metadata.lead_design_notes.');
}

main();
