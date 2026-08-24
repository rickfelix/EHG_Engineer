#!/usr/bin/env node
// SD-LEO-INFRA-EXECUTOR-120S-1800S-001 -- LEAD-phase re-scope. The SD's as-submitted premise
// (a 120s-vs-1800s executor timeout race) does not hold against measured reality (Explore
// evidence 9dce7aa0). Re-scoping the DB record to the actual, measured defect before PLAN.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = 'b1387e83-cc56-45ce-8ea5-6cf29042a607';

const NEW_TITLE = 'Executor bare catch{} mislabels every sub-agent failure as MANUAL_REQUIRED with zero trace (82 rows corrupted)';

const NEW_DESCRIPTION = `Executor bare catch{} mislabels every sub-agent failure as MANUAL_REQUIRED with zero trace (82 rows corrupted)

## Type
infrastructure

**Provenance**: Originally minted as "Executor 120s-vs-1800s timeout race" (coordinator<->Adam review cycle 5b3ed68a candidate #4, source signal e87fd1a8). Re-scoped at LEAD 2026-08-24 after an Explore investigation (evidence 9dce7aa0) found the submitted premise does NOT hold against measured reality, independently corroborated by a parallel RCA investigation (feedback rows 7ca27020, 330b89ff, 190a66ea, 12a6732a) working a different SD's DOCMON-hang finding that hit the exact same code site from a different angle.

## Original premise (REJECTED — measured, not assumed)
The SD as submitted claimed an executor path enforces a 120s ceiling while the real operation budget is 1800s, and that re-evaluating under a corrected single timeout would relabel 69 rows across 67 SDs. MEASURED AGAINST CURRENT MAIN:
- The 120s constant is real (lib/sub-agent-executor/executor.js:243), but the claimed "1800s real budget" does NOT EXIST anywhere in the codebase on this path -- grepped lib/, scripts/, docs/, .github/workflows/ for every plausible literal (1800000, 1800*1000, 30*60, 1800); every hit is an unrelated subsystem. The origin plan doc asserts the 1800s figure with zero file:line citation.
- Live DB query (sub_agent_execution_results): 82 total MANUAL_REQUIRED rows (not 69), 77 distinct sd_id (not 67). execution_time distribution: min 0ms, max 13666ms -- ZERO rows in the 100000-200000ms band a 120s-timeout collision would produce. 80/82 rows complete in under 1000ms.
- FR-2 as originally scoped ("re-evaluate rows under a corrected timeout, completions lose the label") would very likely find zero rows change, since raising a timeout does nothing for executions failing in under 1 second.

## Real, measured defect
lib/sub-agent-executor/executor.js:243-267 races subAgentModule.execute() via Promise.race() against a 120s timeout, inside a try whose catch (bare \`catch {\`, no error binding, line 262) unconditionally sets verdict=MANUAL_REQUIRED with a hardcoded "No module found for {code}, using manual mode" message -- regardless of whether the catch fired from a timeout, a genuine thrown exception, or an actually-missing module. metadata.error/metadata.stack are never populated because the exception is never bound, destroying the evidence needed to tell the three cases apart.

Live impact: all 82 current MANUAL_REQUIRED rows carry this same generic mislabel (DOCMON 39, STORIES 32, TESTING 10, DATABASE 1) -- but lib/sub-agents/docmon.js, stories.js, testing.js, database.js ALL EXIST in the current worktree, so "module not found" is factually wrong for every one of them. Sampled rows (including one from today, 479ms execution_time) all show metadata.error=null, metadata.stack="" -- something is throwing near-instantly inside these modules' execute() and getting swallowed. DOCMON's specific cause is already independently root-caused (a rootDir off-by-one, lib/sub-agents/docmon.js:144/78, feedback rows cc8e9b8e/f8c2befb) -- but this executor.js bare-catch is what turns that (and any other module's) real failure into a silent, traceless, generically-labeled MANUAL_REQUIRED instead of a visible, diagnosable error.

## Scope (one SD)
- FR-1: Bind the caught exception in executor.js's catch block and distinguish, in both verdict/metadata and the stored message, three genuinely different causes: (a) timeout (execute() did not resolve within the deadline), (b) genuine error thrown inside execute() (capture message + stack), (c) actually-missing module file (verify via fs existence check, not assumption-from-catch). Single representation: one code path produces one correct label, not a shared catch-all.
- FR-2: Decide and implement handling for the 82 already-corrupted historical rows -- they are currently indistinguishable from legitimate MANUAL_REQUIRED results and there is no retroactive way to tell which were timeouts vs genuine errors vs truly-missing modules once the fix lands. Mark them with an explicit corruption marker (do not silently leave them readable as clean evidence) rather than re-running them speculatively.
- FR-3: Regression fixtures proving each of the three causes (timeout, thrown error, truly-missing module) produces a distinguishable, correctly-labeled outcome with populated metadata.error/stack where applicable.

## Out of scope
- Root-causing what is actually throwing inside stories.js/testing.js/database.js's execute() -- that becomes possible only once FR-1 makes the real error visible; it is downstream follow-up work, not this SD.
- The DOCMON rootDir off-by-one fix (lib/sub-agents/docmon.js:144/78) -- already tracked as a SEPARATE defect (feedback rows cc8e9b8e/f8c2befb) per explicit RCA separability guidance (feedback row 190a66ea): the rootDir fix changes DOCMON's actual verdicts (git starts returning real dates) and needs its own behavioral validation, and bundling it here would make it impossible to tell which fix changed a given row's outcome.

## Success criteria
- executor.js's catch block no longer swallows the real exception; metadata.error/stack are populated for every MANUAL_REQUIRED row going forward.
- The 82 historical rows carry an explicit corruption marker, not silent trust.
- Regression fixtures for all 3 causes pass with correctly-distinguished labels.
`;

async function run() {
  const supabase = createSupabaseServiceClient();

  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', SD_UUID)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const newMetadata = {
    ...current.metadata,
    rescope_note: {
      rescoped_at: '2026-08-24T12:52:00Z',
      rescoped_from: 'Executor 120s-vs-1800s timeout race: 67 SDs mislabeled MANUAL_REQUIRED',
      reason: 'Original premise (120s-vs-1800s timeout race) measurement-contradicted at LEAD -- no 1800s constant exists on this path, and live data shows zero MANUAL_REQUIRED rows in the timeout-duration band. Real defect: executor.js bare catch{} swallows all exceptions and mislabels them identically. See Explore evidence 9dce7aa0.',
      corroborating_feedback_rows: ['7ca27020', '330b89ff', '190a66ea', '12a6732a', 'cc8e9b8e', 'f8c2befb'],
    },
    mechanism_verifications: [
      ...(current.metadata?.mechanism_verifications || []),
      {
        claim: 'lib/sub-agent-executor/executor.js:243-267 has a bare catch{} that mislabels timeout/error/missing-module identically as MANUAL_REQUIRED',
        verified_by: 'Explore (premise verification)',
        verified_at: 'lib/sub-agent-executor/executor.js:243-267',
      },
      {
        claim: 'No 1800s "real operation budget" constant exists anywhere in the codebase for sub-agent execution',
        verified_by: 'Explore (premise verification)',
        verified_at: 'repo-wide grep, no file:line match on this path (negative result)',
      },
    ],
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      title: NEW_TITLE,
      description: NEW_DESCRIPTION,
      scope: NEW_TITLE,
      metadata: newMetadata,
    })
    .eq('id', SD_UUID);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log('SD re-scoped successfully.');
  console.log('New title:', NEW_TITLE);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
