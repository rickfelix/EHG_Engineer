/**
 * SD-LEO-INFRA-FIX-STAGE-JOURNEY-001 — SECURITY evidence at EXEC phase (EXEC-TO-PLAN gate).
 *
 * Manual diff-level security review by the security-agent sub-agent (Opus 5), recorded through the
 * canonical writer (storeSubAgentResults) so the row carries the repo's standard provenance shape:
 * metadata.repo_path + metadata.executed_from_cwd via applySubAgentRepoVerdict, no top-level
 * repo_path/local_path columns (CLAUDE.md session prologue item 11).
 *
 * WHY THIS ROW EXISTS ALONGSIDE THE AUTOMATED ONE. `node scripts/execute-subagent.js --code SECURITY`
 * was run first and wrote row 9659e04f-2845-46b3-85e4-ee793bab71cb (CONDITIONAL_PASS, 70%). That row
 * resolved metadata.repo_path to C:/Users/rickf/Projects/_EHG/EHG_Engineer -- the MAIN worktree, where
 * this SD's diff does not exist (verified: `git show main:<SRC> | grep -c computeStoryRef` == 0, branch
 * unmerged, 1 commit ahead). Its CONDITIONAL_PASS is driven entirely by two repo-wide/environment
 * conditions (missing public.get_tables_without_rls RPC; 60 pre-existing SECURITY DEFINER functions)
 * with critical_issues: []. Neither was introduced by this SD. That row is an honest REPO-BASELINE
 * verdict; it is not a verdict on this diff. This row is the diff-level verdict.
 *
 * Findings are measured, not asserted: the module was executed against the committed real-venture
 * fixture snapshot (two ventures) and every consumer of the two fields this SD changes (story_refs,
 * route) was traced to its terminal sink.
 */
import crypto from 'crypto';
import fs from 'fs';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-FIX-STAGE-JOURNEY-001';
const SRC = 'lib/eva/stage-templates/analysis-steps/stage-15-user-journey.js';
const FIXTURE = 'scripts/one-off/fix-stage-journey-001-fixture-snapshot.json';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const srcSha = crypto.createHash('sha256').update(fs.readFileSync(SRC)).digest('hex');
  const fixtureSha = crypto.createHash('sha256').update(fs.readFileSync(FIXTURE)).digest('hex');

  const results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 90,
    phase: 'EXEC',
    execution_time_ms: 0,
    summary:
      "DIFF-LEVEL SECURITY REVIEW, MEASURED NOT ASSERTED. The change is clean: zero injection sinks, zero unsafe deserialization, zero secrets handling, " +
      "zero new external network calls, zero new dependencies (git diff main -- package.json package-lock.json is EMPTY), and zero new auth/authz surface. " +
      "The module's COMPLETE import list is one line: `import crypto from 'crypto'` (line 15). No fs, no child_process, no http/fetch, no process.env, no eval/Function -- " +
      "the single textual 'process.env' match in the file is inside a COMMENT (line 176) explaining what the fix deliberately stopped reading. " +
      "CRYPTO USE IS APPROPRIATE AND WAS ALREADY PRESENT: the prompt's premise that computeStoryRef is 'the only new use of crypto in the file' is FACTUALLY WRONG -- " +
      "crypto.createHash('sha256') already existed at line 34 in the pre-SD computeStepId(). computeStoryRef (line 57) is a SECOND use of an established in-file pattern, " +
      "not a new cryptographic dependency. Confirmed non-cryptographic identity hashing: every consumer of story_refs was traced to a terminal sink and NONE makes an " +
      "access-control decision, NONE compares against a secret, NONE signs or verifies. deriveJourneySteps (lib/eva/bridge/orchestrator-journey-steps.js) DROPS story_refs " +
      "entirely; computeCoverageSelfcheck only COUNTS orphan ids. " +
      "NET REDUCTION IN UNTRUSTED-CONTENT PROPAGATION, MEASURED ON REAL DATA: executed the real module against the committed two-venture fixture snapshot " +
      "(altifyai 50763b6a, apexniche 809ec7e7). story_refs 14/14 and 15/15 -- 29/29 match /^sty-[0-9a-f]{8}$/, ZERO contain '|', ZERO collisions. " +
      "Pre-SD those same fields carried RAW LLM prose (the composite 'goal|screen_ref|action' pipe string and story.title/.name/slugify fallbacks, per the SD's own LEAD evidence " +
      "measuring 14/14 composite strings live). So this SD strictly REMOVES attacker-influenceable free text from two persisted fields rather than adding any. " +
      "FIXTURE SNAPSHOT IS SAFE TO HAVE COMMITTED: scanned scripts/one-off/fix-stage-journey-001-fixture-snapshot.json (98KB, keys [altifyai, apexniche], each " +
      "{venture_id, journey, storyPack, wireframeScreensPayload}) for JWTs (eyJ...), sk-/ghp_/github_pat_/xox*/AKIA keys, service_role, PEM blocks, bearer tokens, emails, " +
      "phone numbers, and URLs: ZERO hits. The only 'password'/'secret'-adjacent matches are LLM-authored acceptance-criteria PROSE ('When I enter my current password...'); " +
      "the only token-shaped matches are inputTokens/outputTokens LLM usage COUNTS. No http(s):// URLs, no supabase.co host, no localhost, no .env reference anywhere in the file. " +
      "It holds two venture UUIDs, which are internal non-secret identifiers for ventures ratification 3c4a6781 has already deleted. No PII of any real person. " +
      "INJECTION PATH CLOSED END TO END: generateUserJourneys' return value is persisted only as a venture_artifacts JSONB payload via the typed {artifacts:[...]} contract " +
      "(lib/eva/stage-templates/stage-15.js:238 -> persistArtifact), i.e. a parameterized supabase-js insert -- no raw SQL, no string-built filter. The route field's one deep " +
      "consumer chain (scenario-generator.js:313 routeContext.path -> result-recorder.js:377 -> matchFailure -> searchPatterns) was read in full: searchPatterns " +
      "(lib/uat/issue-pattern-matcher.js:138) does NOT interpolate searchText into any PostgREST filter -- it fetches active patterns and scores them with in-memory JS token " +
      "similarity. Zero dangerouslySetInnerHTML in src/ or app/; zero UI files reference blueprint_user_journey/journey_steps/routeContext at all; zero href bound to a route. " +
      "Adversarial input probe on the live functions: SQLi payload, <script> payload, 6MB input, and a __proto__ JSON payload all produced inert sty-<8hex> output, no prototype " +
      "pollution, and 8ms for 6MB (no ReDoS -- the new matchers use .toLowerCase()/.includes()/strict equality, not regex). 40/40 unit tests pass. " +
      "VERDICT IS CONDITIONAL_PASS, NOT PASS, ON ONE FORWARD-LOOKING CONDITION (SEC-1): this SD is what turns `route` from structurally-null (14/14 null on live data pre-SD) " +
      "into LLM-derived content -- measured 29/29 non-null, including the PLACEHOLDER TEMPLATES '/projects/{project-id}' and '/content-library/:id/edit'. " +
      "No consumer navigates on step.route today (verified: lib/apa/ contains ZERO reads of .route; the page.goto at venture-step-executors.js:999 takes a HARDCODED literal " +
      "'/images'/'/generate' passed into buildAltifyaiSurfaceOverride, never the artifact), so live exposure is ZERO. But the field is now populated and the obvious next " +
      "consumer is the UAT journey walker. A bare PASS would leave nothing on the record telling that consumer to substitute placeholders and validate the value is a relative " +
      "path before page.goto(baseUrl + route). Recorded as a non-blocking condition, not a defect.",
    critical_issues: [],
    warnings: [
      {
        id: 'SEC-1',
        severity: 'LOW',
        owasp: 'A01 Broken Access Control / A10 SSRF (precondition only, not a live vulnerability)',
        issue: "This SD converts step.route from structurally-null to LLM-derived content from ia_sitemap.pages[].path. There is NO validation on the producing side and no note anywhere telling a future consumer to validate before navigating.",
        evidence: "Measured on the committed real-venture fixture: routes non-null 14/14 (altifyai) and 15/15 (apexniche), pre-SD 14/14 null. Distinct values include the placeholder TEMPLATES '/projects/{project-id}' and '/content-library/:id/edit' -- not concrete paths. Adversarial shape scan over all distinct values (javascript:/data:/vbscript:/protocol-relative '//' /absolute http(s):/ '..' traversal / CR / LF / NUL): ZERO dangerous-shaped routes on real data.",
        live_exposure: "ZERO. Verified by grep: lib/apa/ contains no reads of `.route` at all; the only page.goto that concatenates a route (lib/apa/venture-step-executors.js:999) receives a HARDCODED literal from buildAltifyaiSurfaceOverride call sites (lines 1429-1439: '/images', '/generate'), never the artifact. Repo-wide grep for navigation on a journey/step route returns zero hits. route's actual sinks are: a venture_artifacts JSONB payload, SD metadata.journey_steps, scenario.routeContext.path, console.log output, and a feedback-row metadata JSONB field.",
        recommendation: "When a future SD wires step.route into the UAT walker, it must (a) substitute {placeholder}/:param segments, and (b) reject any value that is not a relative path beginning with a single '/' (no scheme, no '//', no '..'), then re-assert origin after navigation. The origin-equality re-check already implemented at venture-step-executors.js:1000-1006 is the correct pattern to reuse -- it exists precisely because navigation targets need it.",
        blocking: false,
      },
      {
        id: 'SEC-2',
        severity: 'INFO',
        owasp: 'LLM01 Prompt Injection (second-order) -- pre-existing pattern, NOT introduced by this SD',
        issue: "The new finding fields (ROUTE_UNRESOLVED.screen_name, FLOW_STEP_UNRESOLVED.flow_name/page_name, FLOW_COVERAGE_MISSING.flow_name, coverage_selfcheck.uncovered_flows[]) carry raw LLM-generated prose into the persisted artifact, and lib/eva/experience-review/context.js:87 JSON.stringify()s the ENTIRE blueprint_user_journey artifact verbatim into an LLM review prompt.",
        evidence: "Measured raw-prose values now reaching findings: ['New User Onboarding & First Generation', 'Sign Up', 'Generation History', ...] (altifyai, 10 findings) and ['First-Time User Onboarding & Niche Setup', 'Niche Profiles', ...] (apexniche, 13 findings). buildExperienceReviewPrompt embeds `${journeyBlock}` where journeyBlock = JSON.stringify(journey.artifact_data).",
        assessment: "NET EXPOSURE UNCHANGED OR REDUCED. The whole-artifact-stringification pattern is pre-existing and already carried goal/action/expected_outcome/side_effects_claimed -- raw prose from the SAME venture-owned Stage-15 LLM pipeline, i.e. the same trust tier. This SD adds more of that tier while REMOVING raw prose from story_refs and orphan_story_ids (29/29 now hex-only). No new trust boundary is crossed.",
        recommendation: "No action in this SD. Recorded so the whole-artifact-into-prompt composition at experience-review/context.js:87 is on the security record as the place to add delimiting/escaping if venture artifact content ever becomes third-party-authored rather than self-generated.",
        blocking: false,
      },
      {
        id: 'SEC-3',
        severity: 'INFO',
        owasp: 'A08 Software and Data Integrity Failures (robustness, not security)',
        issue: "computeStoryRef returns story.id VERBATIM with no String() coercion or shape validation, so a non-string id would land unvalidated in story_refs / generated_from.stories / orphan_story_ids.",
        evidence: "Probed live: computeStoryRef({id:{a:1}}) returns the object {\"a\":1}. Unreachable on current data -- the live producer (lib/eva/blueprint-agents/user-story-pack.js) emits no id field at all, and 29/29 measured refs are sty-<8hex>.",
        assessment: "NOT A REGRESSION. The pre-SD line (`story.id || provisionalId`) had identical non-coercion. Same behavior, different surrounding code.",
        recommendation: "Optional hardening in a future QF: `if (story?.id) return String(story.id)`. Non-blocking.",
        blocking: false,
      },
      {
        id: 'SEC-4',
        severity: 'INFO',
        owasp: 'A08 Software and Data Integrity Failures (provenance integrity, disclosed)',
        issue: "The sty- pointer hashes a chosen FIELD SUBSET {as_a, i_want_to, so_that} and deliberately excludes acceptance_criteria, so story_refs cannot detect acceptance-criteria drift. Relative to ratification df3186e6 ('if any source record can be overwritten, the pointer should include its version or hash'), the pointer covers part of the record, not the whole record.",
        evidence: "The source declares the deviation explicitly in its own FR-1 comment (lines 43-53): 'hashing a chosen field subset means the pointer does NOT change when an excluded field changes. story_refs does not detect acceptance_criteria drift; this is accepted, not hidden.' The comment also correctly states this is a LOCAL design tradeoff and not mandated by df3186e6.",
        assessment: "DISCLOSED, NOT CONCEALED -- which is the property that matters. Also note the truncation width: 32 bits (8 hex). At real venture scale (measured 14-15 stories) birthday collision probability is ~5e-8; measured collisions 0/14 and 0/15. Not a security boundary; story_refs gates nothing.",
        recommendation: "No action. Recorded so a future reader does not mistake the pointer for whole-record integrity, and does not re-file the tradeoff as a defect.",
        blocking: false,
      },
      {
        id: 'SEC-5',
        severity: 'MEDIUM',
        owasp: 'Evidence provenance (process finding, not a code defect)',
        issue: "The automated SECURITY scan row for this SD did not scan this SD's diff. Reporting its result as diff coverage would be a clean-result-equals-unexecuted-check error.",
        evidence: "Row 9659e04f-2845-46b3-85e4-ee793bab71cb (source=sub_agent_executor, phase=EXEC, CONDITIONAL_PASS, 70%) recorded metadata.repo_path = C:/Users/rickf/Projects/_EHG/EHG_Engineer -- the MAIN worktree. `git show main:lib/eva/stage-templates/analysis-steps/stage-15-user-journey.js | grep -c computeStoryRef` returns 0; the branch feat/SD-LEO-INFRA-FIX-STAGE-JOURNEY-001 is 1 commit ahead of main and unmerged. Its critical_issues is [] and its two warnings are (a) 'RLS table census did not run: Could not find the function public.get_tables_without_rls' and (b) '60 SECURITY DEFINER function(s) run as a BYPASSRLS owner and are anon/authenticated EXECUTE-able' -- both repo/DB-wide baseline conditions predating this SD, neither touching Stage-15 code.",
        assessment: "The automated row is an honest REPO-BASELINE verdict and should be read as such. This row is the diff-level verdict. The two baseline conditions it surfaced are real and deserve their own harness item, but they are not this SD's to fix and must not be attributed to it.",
        recommendation: "Read rows 9659e04f (baseline) and this row (diff) together; neither alone answers 'is this change safe'. The 60-DEFINER and missing-RLS-census findings belong to the harness backlog, not to this SD.",
        blocking: false,
      },
    ],
    recommendations: [
      { action: 'Before any consumer navigates on step.route, add relative-path validation (reject scheme, protocol-relative //, and .. traversal) plus placeholder substitution, reusing the origin re-assertion at lib/apa/venture-step-executors.js:1000-1006. Not required by this SD.', priority: 'medium', blocking: false },
      { action: 'Optional: coerce story.id with String() in computeStoryRef so a non-string producer id cannot land unvalidated in story_refs.', priority: 'low', blocking: false },
      { action: 'Harness backlog (NOT this SD): restore public.get_tables_without_rls so the RLS census is a run check rather than an unrun one, and triage the 60 anon/authenticated-EXECUTE-able SECURITY DEFINER functions. Both surfaced by the baseline scan row 9659e04f.', priority: 'medium', blocking: false },
    ],
    validation_mode: 'retrospective',
    justification:
      "CONDITIONAL_PASS on SEC-1 alone: this SD creates the precondition (route populated with LLM-derived path templates) for a navigation sink that does not yet exist, with no producer-side validation and no note to the future consumer. Live exposure is measured at ZERO and the SD is NOT blocked. Every other dimension is clean and measured: no injection, no secrets, no new dependencies, no new network calls, no auth surface, appropriate non-cryptographic hash use, a committed fixture with zero secrets/PII, and a net REDUCTION in untrusted free text reaching persisted fields (29/29 story_refs now hex-only vs raw composite prose pre-SD). SEC-5 is recorded because the only runner-produced SECURITY row scanned a tree without this diff; a PASS citing it would be evidence laundering.",
    conditions: [
      'SEC-1 is advisory for THIS SD. It becomes blocking for whichever SD first wires step.route into a navigation call (page.goto / location assignment / fetch).',
      'Row 9659e04f (automated, repo_path=main worktree) is a repo-BASELINE verdict and does not cover this diff. This row is the diff-level verdict. Do not cite 9659e04f alone as diff security coverage.',
      'The two baseline warnings on 9659e04f (missing get_tables_without_rls RPC; 60 anon/authenticated-EXECUTE-able SECURITY DEFINER functions) are pre-existing and out of this SD\'s scope. Do not attribute them to this SD, and do not treat this row as closing them.',
    ],
    metadata: {
      analysis_mode: 'manual_diff_review',
      analyst: 'security-agent sub-agent (Opus 5, claude-opus-5[1m])',
      independent_verification: true,
      measured: true,
      reviewed_commit: '90703e3e6149bc2657b29d812fa4cfe7642202b0',
      branch: 'feat/SD-LEO-INFRA-FIX-STAGE-JOURNEY-001',
      source_sha256: srcSha,
      fixture_sha256: fixtureSha,
      scope_reviewed: {
        primary: SRC,
        diff_vs_main_lines: 167,
        also_reviewed: [
          'scripts/one-off/fix-stage-journey-001-fixture-snapshot.json (secrets/PII scan)',
          'scripts/one-off/prd-content-fix-stage-journey-001.json (secrets scan)',
          'scripts/one-off/fix-stage-journey-001-lead-validation-evidence.mjs (credential handling)',
          'tests/unit/stage-15-user-journey.test.js',
        ],
      },
      dependency_check: { package_json_diff_bytes: 0, package_lock_diff_bytes: 0, new_dependencies: 0, module_import_list: ["crypto (node builtin)"] },
      crypto_review: {
        preexisting_crypto_use: 'computeStepId line 34, sha256 truncated to 4 hex -- PRE-DATES this SD',
        new_crypto_use: 'computeStoryRef line 57, sha256 truncated to 8 hex',
        prompt_premise_corrected: "The task prompt stated computeStoryRef is 'the only new use of crypto in the file'. It is not -- crypto was already imported (line 15) and used (line 34) pre-SD.",
        used_for_auth_or_signing: false,
        used_for_access_control: false,
        compared_against_any_secret: false,
        purpose: 'content-addressed identity / dedup pointer only',
        consumers_traced: ['lib/eva/bridge/orchestrator-journey-steps.js (DROPS story_refs)', 'computeCoverageSelfcheck (counts orphan ids only)'],
        truncation_bits: 32,
        measured_collisions: { altifyai: '0/14', apexniche: '0/15' },
      },
      injection_review: {
        sql: 'NONE. Persisted via parameterized supabase-js insert (stage-15.js:238 -> persistArtifact). searchPatterns (issue-pattern-matcher.js:138) does NOT interpolate searchText into any PostgREST filter -- in-memory JS token similarity only.',
        html_xss: 'NONE. Zero dangerouslySetInnerHTML in src/ or app/; zero UI file references blueprint_user_journey / journey_steps / routeContext; zero href bound to a route.',
        shell: 'NONE. Module imports no child_process; zero exec/spawn anywhere in the diff.',
        path_traversal: 'NONE. Module performs no filesystem access; no route value reaches a path.join/readFile sink (lib/uat/route-context-resolver.js has zero fs/fetch/exec calls).',
        deserialization: 'NONE. No JSON.parse, no eval, no new Function in the diff.',
        prototype_pollution: 'PROBED NEGATIVE. computeStoryRef over a JSON payload containing __proto__ left Object.prototype unpolluted; all new object literals use fixed keys.',
        redos: 'NEGATIVE. New matchers use .toLowerCase()/.includes()/strict equality, no regex. 6MB input hashed in 8ms; personaMatches over 2MB in 2ms.',
      },
      measured_on_real_fixture: {
        fixture: FIXTURE,
        fixture_sha256: fixtureSha,
        ventures: 2,
        altifyai: { journeys: 12, steps: 14, story_refs: 14, all_hex: true, containing_pipe: 0, collisions: 0, routes_non_null: '14/14', dangerous_shaped_routes: 0, findings: { FLOW_STEP_UNRESOLVED: 6, FLOW_COVERAGE_MISSING: 4 } },
        apexniche: { journeys: 12, steps: 15, story_refs: 15, all_hex: true, containing_pipe: 0, collisions: 0, routes_non_null: '15/15', dangerous_shaped_routes: 0, findings: { FLOW_STEP_UNRESOLVED: 9, FLOW_COVERAGE_MISSING: 4 } },
        distinct_routes_observed: ['/dashboard', '/projects', '/projects/{project-id}', '/upload', '/niche-profiles/new', '/content-generator/article', '/content-library/:id/edit', '/content-library', '/content-generator/social'],
        placeholder_templates_present: ['/projects/{project-id}', '/content-library/:id/edit'],
      },
      fixture_secret_scan: {
        file: FIXTURE,
        bytes: 98474,
        top_level_keys: ['altifyai', 'apexniche'],
        patterns_searched: ['eyJ* (JWT)', 'sk-*', 'ghp_/github_pat_', 'xox[baprs]-', 'AKIA*', 'service_role', 'SUPABASE_*KEY', 'api_key', 'client_secret', '-----BEGIN', 'bearer/authorization', 'email addresses', 'phone numbers', 'http(s):// URLs', 'localhost/127.0.0.1', '.env'],
        hits: 0,
        false_positive_matches_reviewed: ['"password" x5 -- LLM-authored acceptance-criteria prose only', 'inputTokens/outputTokens -- LLM usage counts, not credentials'],
        contains_pii: false,
        contains_credentials: false,
        verdict: 'SAFE TO REMAIN COMMITTED',
        note: 'Holds two venture UUIDs (internal non-secret identifiers) for ventures that ratification 3c4a6781 has already deleted.',
      },
      route_sink_trace: {
        sinks_found: ['venture_artifacts JSONB payload (parameterized insert)', 'SD metadata.journey_steps (JSONB)', 'scenario.routeContext.path', 'console.log (lib/sub-agents/uat.js:160, lib/uat/route-aware-reporter.js:93)', 'feedback row metadata.route_context (JSONB)'],
        navigation_sinks_found: 0,
        apa_reads_of_step_route: 0,
        hardcoded_goto_confirmed: 'lib/apa/venture-step-executors.js:999 concatenates a HARDCODED literal route from buildAltifyaiSurfaceOverride call sites (lines 1429-1439), never the artifact',
        scope_validation_enforcer_relevance: 'NONE -- lib/eva/scope-validation-enforcer.js has zero production callers (test file only) and its context.route is EHG_Engineer API routes, not venture journey routes',
      },
      adversarial_probe: {
        sql_payload: "computeStoryRef({as_a: \"'; DROP TABLE venture_artifacts;--\"}) -> sty-7746dab5 (inert)",
        xss_payload: 'computeStoryRef({as_a: "<script>alert(1)</script>"}) -> sty-88202e61 (inert)',
        proto_payload: 'JSON with __proto__ -> no pollution',
        large_input: '6MB across three fields -> 8ms',
        determinism: 'identical input -> identical ref (verified)',
      },
      tests: { file: 'tests/unit/stage-15-user-journey.test.js', passed: 40, failed: 0, runner: 'npx vitest run' },
      security_checklist: {
        authentication_surface_changed: false,
        authorization_surface_changed: false,
        rls_policies_touched: false,
        new_tables_or_migrations: false,
        new_api_routes: false,
        secrets_in_code: false,
        new_dependencies: false,
        new_network_calls: false,
        user_input_handling_changed: false,
      },
      companion_row: {
        id: '9659e04f-2845-46b3-85e4-ee793bab71cb',
        verdict: 'CONDITIONAL_PASS',
        scanned_repo_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
        covers_this_diff: false,
        reason: 'repo_path resolved to the main worktree; the diff is unmerged on feat/SD-LEO-INFRA-FIX-STAGE-JOURNEY-001 (verified: computeStoryRef absent from main)',
      },
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    probeExistsRelative: SRC,
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

  const stored = await storeSubAgentResults('SECURITY', sdRow.id, { code: 'SECURITY', name: 'Chief Security Architect' }, results, { sdKey: SD_KEY, phase: 'EXEC' });
  console.log('STORED:', JSON.stringify({
    id: stored?.id, verdict: stored?.verdict, phase: stored?.phase, confidence: stored?.confidence,
    repo_path: stored?.metadata?.repo_path, repo_resolved: stored?.metadata?.repo_resolved,
    executed_from_cwd: stored?.metadata?.executed_from_cwd,
    warnings: (stored?.warnings || []).length, critical: (stored?.critical_issues || []).length,
  }, null, 1));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
