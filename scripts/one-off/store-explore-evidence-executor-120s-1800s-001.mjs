#!/usr/bin/env node
// LEAD-phase Explore evidence for SD-LEO-INFRA-EXECUTOR-120S-1800S-001. The SD's
// as-submitted premise (a 120s-vs-1800s timeout race) does NOT hold against measured
// reality -- see detailed_analysis below. Written before re-scoping the SD's DB record.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = 'b1387e83-cc56-45ce-8ea5-6cf29042a607';
const SD_KEY = 'SD-LEO-INFRA-EXECUTOR-120S-1800S-001';

async function run() {
  const supabase = createSupabaseServiceClient();

  let results = {
    sub_agent_name: 'Explore (premise verification)',
    verdict: 'CONDITIONAL_PASS',
    confidence: 95,
    critical_issues: [],
    warnings: [
      'SD premise (120s-vs-1800s timeout race) does not hold against measured reality',
    ],
    recommendations: [
      'Re-scope SD to the real defect: executor.js:243-267 bare catch{} swallows every exception from execute() and mislabels it identically as MANUAL_REQUIRED, regardless of cause',
    ],
    detailed_analysis:
      'MEASURED, not assumed: (a) the 120s constant is real -- lib/sub-agent-executor/executor.js:243 ' +
      '`const timeoutMs = options.timeout || parseInt(process.env.SUB_AGENT_TIMEOUT_MS || \'120000\', 10)`, ' +
      'racing execute() via Promise.race() (lines 249-252) inside a try whose catch (bare `catch {`, no error ' +
      'binding, line 262) unconditionally sets verdict=MANUAL_REQUIRED with a hardcoded "No module found for ' +
      '{code}, using manual mode" message -- regardless of whether the catch fired from a missing module, a ' +
      'timeout rejection, or any other exception. metadata.error/metadata.stack are never populated because ' +
      'the exception is never bound. (b) The "1800s real budget" the SD is built around does NOT EXIST anywhere ' +
      'in the codebase -- grepped lib/, scripts/, docs/, .github/workflows/ for 1800000/1800*1000/30*60/1800; ' +
      'every hit is an unrelated subsystem (coordinator reply-starvation threshold, adaptive-comms-cadence poll ' +
      'cap, role-capture-gate intervals, TTL-map defaults, EVA batch interval, unrelated GH Actions timeout-' +
      'minutes:30). The origin plan doc (.artifacts/adam-plans/executor-timeout-race-plan.md, byte-identical to ' +
      'its archived copy) asserts the 1800s figure with zero file:line citation -- an unsourced number, not a ' +
      'measured constant. (c) Live DB query against sub_agent_execution_results (current data): 82 total ' +
      'MANUAL_REQUIRED rows (SD claimed 69), 77 distinct sd_id (SD claimed 67). execution_time distribution: ' +
      'min 0ms, max 13666ms -- ZERO rows in the 100000-200000ms band a 120s-timeout collision would produce. ' +
      '80/82 rows complete in under 1000ms. 81/82 rows carry the literal "Create lib/sub-agents/{code}.js for ' +
      'automation" text -- the hardcoded missing-module branch, not a timeout message. Breakdown: DOCMON 39, ' +
      'STORIES 32, TESTING 10, DATABASE 1 -- but lib/sub-agents/docmon.js, stories.js, testing.js, database.js ' +
      'ALL EXIST in the current worktree, so the "module not found" label is also factually wrong for every one ' +
      'of these rows. Sampled 10 recent rows including one from today (2026-08-24 12:25, 479ms execution_time): ' +
      'all carry metadata.error=null, metadata.stack="" -- confirming the bare catch{} swallowed whatever ' +
      'actually threw. This independently corroborates a parallel RCA investigation (rca-docmon-hang, working a ' +
      'different SD) that found the identical executor.js:243-267 site producing the same MANUAL_REQUIRED ' +
      'mislabel pattern across 81 rows in the last 90 days, and separately root-caused DOCMON\'s specific ' +
      'execute()-failure to a rootDir off-by-one (lib/sub-agents/docmon.js:144/78, feedback rows cc8e9b8e/' +
      'f8c2befb) -- the SAME executor.js bare-catch is what turned that failure into a silent, traceless ' +
      'MANUAL_REQUIRED instead of a visible error. (e) Origin plan docs contain no independent investigation -- ' +
      'they restate the SD text verbatim with no file:line evidence or query methodology. ' +
      'CONCLUSION: the 120s ceiling and its catch-all mislabeling is a real, worth-fixing defect, but FR-2 as ' +
      'literally scoped ("re-evaluate the 69/67 rows under a corrected single timeout -- completions lose the ' +
      'label") would very likely find zero rows change, since raising a timeout does nothing for executions ' +
      'failing in under 1 second. The real fix is: (1) bind the caught exception and distinguish timeout vs ' +
      'genuine-error vs actually-missing-module in the verdict/metadata rather than collapsing all three to one ' +
      'hardcoded message: (2) root-cause what is actually throwing inside docmon.js/stories.js/testing.js/' +
      'database.js execute() (DOCMON\'s cause is already known: the rootDir bug); (3) decide how to handle the ' +
      '82 already-corrupted historical rows, which are currently indistinguishable from legitimate ' +
      'MANUAL_REQUIRED results once the fix lands.',
    execution_time: 0,
    validation_mode: 'prospective',
    justification:
      'SD as submitted asked to fix a 120s-vs-1800s timeout race; measured reality shows no such race exists ' +
      '(no 1800s constant on this path, zero rows in the timeout-duration band) -- the SD record needs ' +
      're-scoping to the actually-measured defect (exception-swallowing bare catch{} in executor.js) before ' +
      'PLAN work proceeds, matching this session\'s established pattern of re-scoping to match reality rather ' +
      'than building to a false premise.',
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_UUID,
    subAgentCode: 'EXPLORE',
    targetApplication: 'EHG_Engineer',
  });
  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'EXPLORE',
    SD_UUID,
    { name: 'Explore (premise verification)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD' }
  );

  console.log('\nEvidence row written:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
