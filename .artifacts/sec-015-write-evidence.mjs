import dotenv from 'dotenv';
dotenv.config();
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { createClient } from '@supabase/supabase-js';

const SD = 'SD-LEARN-FIX-ADDRESS-PAT-LES-015';
const COMMIT = '581d3606f197d70be4bea170a257c7c66ffb5b3f';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const findings = [
  {
    area: 'SQL injection (OWASP A03) -- CLEAR',
    severity: 'INFO',
    issue: 'gate-registry-audit.js issues exactly ONE query: supabase.from("validation_gate_registry").select("gate_key, sd_type, applicability").order("gate_key"), wrapped in fetchAllPaginated. Table name, column list and order key are all LITERAL strings -- zero template interpolation, zero concatenation, no .rpc(), no raw-string .filter()/.or() predicates anywhere in the file. sd_type never reaches the query at all: it is applied client-side in computeNearMissFindings via String comparison after normalizeSdType(). No injection surface exists.'
  },
  {
    area: 'Read-only DB posture -- CONFIRMED',
    severity: 'INFO',
    issue: 'grep for .insert( / .update( / .delete( / .upsert( / .rpc( across gate-registry-audit.js returns ZERO hits. The only other DB path is dryRunHandoff(), whose doc contract ("without executing gates, writing to database, or updating SD status") I verified against its body at HandoffOrchestrator.js:698-830: steps are sdRepo.getById (read), _getExecutor, getRequiredGates, applyGatePolicies (reads validation_gate_registry), loadValidationRules (read), threshold resolution, manifest build -- no write call in the manifest-build tail. Independently corroborated: all 4 application-code references to validation_gate_registry repo-wide (this gate, vision-score.js:171, gate-policy-resolver.js:66, ValidationOrchestrator.js:112) are SELECTs; the table is written only by database/migrations/*.sql.'
  },
  {
    area: 'Dynamic import (OWASP A08 unsafe code loading) -- CLEAR',
    severity: 'INFO',
    issue: 'The sole dynamic import is import("../../../HandoffOrchestrator.js") at line 156 -- a hardcoded literal relative specifier resolved against the module URL, with no variable, no interpolation and no external input on any path reaching it. No eval(), no new Function(), no require(), no child_process/execSync/spawn. Confirmed by grep across the whole file.'
  },
  {
    area: 'Secrets / credentials / filesystem / network -- CLEAR',
    severity: 'INFO',
    issue: 'Zero hits for process.env, fs.*, readFile/writeFile, path.*, __dirname, fetch(, axios, or any http(s) URL in gate-registry-audit.js. The gate handles no credentials: it consumes an already-constructed supabase client injected by LeadToPlanExecutor (this.supabase), adding no new external network egress beyond that pre-existing client. A secret-pattern scan over the entire diff (api_key|secret|password|token|bearer|credential|private_key|BEGIN RSA|sk-*|eyJ*) returned zero matches.'
  },
  {
    area: 'Trust boundary of the audited data -- CONFIRMED INTERNAL, evidenced not assumed',
    severity: 'INFO',
    issue: 'The brief characterized validation_gate_registry contents as internal/trusted; I verified this at the DB-control level rather than taking it on description. database/migrations/20260207_validation_gate_registry.sql:67-82 shows ALTER TABLE ... ENABLE ROW LEVEL SECURITY with exactly TWO policies: service_role_full_access_gate_registry (FOR ALL TO service_role) and authenticated_read_gate_registry (FOR SELECT TO authenticated). There is NO anon policy of any kind, and database/chairman-gated/20260819_anon_truncate_sweep.sql:1478 additionally REVOKEs TRUNCATE from anon. So writes require service_role; no user-facing/untrusted input path can author a row. Content is governance data (gate_key / sd_type / applicability enum / reason) authored via migrations. Characterization is accurate.'
  },
  {
    area: 'Log/reflection injection of registry + error strings -- NO UNSAFE SINK',
    severity: 'INFO',
    issue: 'Data flowing out of the gate is gate_key, sd_type and dryRunHandoff error messages, interpolated into plain warning STRINGS by findingsToWarnings() and returned in the gate result. Sinks are the handoff CLI console output and the gate-result JSON persisted as validation evidence -- no HTML/DOM rendering (no UI consumes this), no SQL, no shell, no file path, no HTTP header. Combined with the service_role-only write boundary above, there is no attacker-influenced content and no unsafe sink. XSS / log-forging risk: none reachable.'
  },
  {
    area: 'Advisory-only claim is TRUE for blocking, but NOT absolute for scoring -- one narrow path',
    severity: 'LOW',
    issue: 'ACCURACY CORRECTION to the "can never affect handoff pass/fail" premise. The blocking half is TRUE: ValidationOrchestrator.js:488 guards blocking with (!gateResult.passed && gate.required !== false && !isSkipped), so this required:false gate can never block. BUT the weighted-score aggregation 13 lines earlier (ValidationOrchestrator.js:475-480 -- gateWeight = gate.weight || 1.0; weightedScoreSum += gatePercentage * gateWeight; totalWeight += gateWeight) is NOT filtered by gate.required -- every gate contributes, and results.normalizedScore (lines 582-583) is then compared against the SD-type threshold via _evaluateSdTypeThreshold (line 606). The gate body handles every anticipated failure safely (dryRunHandoff throw -> per-phase catch in auditPhases; registry read throw -> catch at line 184 converting to AUDIT_INCOMPLETE), BUT the await orchestratorFactory() at line 171 sits OUTSIDE any try/catch. If it throws (failed dynamic import or HandoffOrchestrator construction), the validator throws, ValidationOrchestrator.js:213-225 catches and substitutes {passed:false, score:0, maxScore:100}, and that 0 enters the weighted average at full weight 1.0 -- capable of tipping a borderline LEAD-TO-PLAN handoff below its threshold. NOT a security vulnerability: no attacker control (the import specifier is static), no confidentiality/integrity impact, and the trigger requires a missing/broken core module that would break the handoff system regardless. Availability/correctness only, and it is an inconsistency with the fail-safe pattern the file applies everywhere else.'
  },
  {
    area: 'Shared test-factory change -- test-only, zero production reachability',
    severity: 'INFO',
    issue: 'tests/factories/validator-context-factory.js gains one additive method range: () => Promise.resolve(defaultSelect). Verified reachability by grepping scripts/ and lib/ for importers: 10 hits, every one a *.test.js file; filtering out *.test.js leaves ZERO non-test importers. Purely additive (no existing mock method altered), so no behavior change to the 11 sibling suites that share it. No production code path can reach it.'
  },
  {
    area: 'Dependencies -- none added',
    severity: 'INFO',
    issue: 'git diff main...HEAD -- package.json package-lock.json is EMPTY. The one new import, fetchAllPaginated from lib/db/fetch-all-paginated.mjs, is a pre-existing first-party module (present on main via commit ea467c39e8d). No new supply-chain surface.'
  },
  {
    area: 'Sixth diff file not in the review brief -- benign',
    severity: 'INFO',
    issue: 'The diff contains scripts/one-off/prd-content-pat-les-015.json (149 lines), which the review brief did not list. Inspected: inert PRD prose (executive_summary / FR / TR / acceptance-criteria text). No credentials, no PII, no executable content; grep confirms it is referenced by no code in scripts/ or lib/ and is not loaded at runtime. No security impact.'
  },
  {
    area: 'Test file hermeticity',
    severity: 'INFO',
    issue: 'gate-registry-audit.test.js imports only vitest, the unit under test, and the shared mock factory. Zero hits for createClient / @supabase/supabase-js / process.env / fetch( / http(s) / fs. / readFile / execSync / child_process -- no live DB, network, filesystem or credential access. Tests cannot exfiltrate or mutate anything.'
  },
  {
    area: 'CARRIED FORWARD from the automated scan -- pre-existing, repo-wide, OUT OF SCOPE for this diff',
    severity: 'MEDIUM',
    issue: 'The automated SECURITY scan in this same run (row ec0c3ce4-bab4-4a93-830c-c27a42b12729) returned CONDITIONAL_PASS on two repo-wide posture items that this diff neither introduces nor touches, preserved here so the signal is not laundered away: (1) the RLS table census could NOT run -- "Could not find the function public.get_tables_without_rls" -- and an unrun census is not a clean census; (2) 60 SECURITY DEFINER functions run as a BYPASSRLS owner and are EXECUTE-able by anon or authenticated. Both predate this branch and belong to the repo baseline, not to SD-LEARN-FIX-ADDRESS-PAT-LES-015. Recorded, not attributed to this change.'
  },
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 92,
  execution_time_ms: 0,
  phase: 'EXEC',
  summary: 'EXEC-phase MANUAL SECURITY diff review of commit 581d3606f19 (the 2nd, corrective commit) for SD-LEARN-FIX-ADDRESS-PAT-LES-015. DIFF VERDICT: PASS -- no exploitable security defect introduced. Reviewed all 6 changed files (the brief listed 5; prd-content-pat-les-015.json was an unlisted 6th). Confirmed by grep + source reading: zero write operations (.insert/.update/.delete/.upsert/.rpc) in the new gate; the single registry query is a literal-column SELECT via the Supabase query builder with no interpolation (no SQL-injection surface); the only dynamic import is a hardcoded static relative specifier; no eval/Function/child_process; no process.env, fs, path or network access; no secrets anywhere in the diff; no new dependencies (package.json/package-lock.json diff is empty). Verified the trust-boundary claim at the DB-control level rather than by assertion: validation_gate_registry has RLS ENABLED with service_role-write / authenticated-read-only and NO anon policy, so its contents cannot be authored from untrusted input -- the gate consumes internal governance data only, and its string outputs reach no HTML/SQL/shell/path sink. The shared test-factory range() addition has ZERO non-test importers. ONE LOW advisory finding: the "can never affect pass/fail" premise is true for BLOCKING (ValidationOrchestrator.js:488 guards on gate.required !== false) but not for SCORING -- the weighted aggregation at lines 475-480 is not filtered by required, and await orchestratorFactory() (line 171) is the one await outside the gate own try/catch, so a construction/import failure yields score:0 at weight 1.0 into the threshold comparison. No attacker control; availability/correctness only. The row verdict is CONDITIONAL_PASS solely to preserve the automated scan two PRE-EXISTING repo-wide posture items (unrunnable RLS census; 60 anon/authenticated-EXECUTE-able SECURITY DEFINER functions), which this diff neither introduces nor touches.',
  critical_issues: [],
  warnings: findings.filter((f) => f.severity !== 'INFO'),
  recommendations: [
    'OPTIONAL (LOW, non-blocking): move the await orchestratorFactory() call (gate-registry-audit.js:171) inside a try/catch that converts a construction/import failure into AUDIT_INCOMPLETE findings for all 5 phases -- identical to the pattern the file already applies to the registry read at line 184. This makes the advisory gate fully score-safe and matches its own documented fail-safe intent. Not required for this handoff.',
    'OUT OF SCOPE for this SD: restore the public.get_tables_without_rls catalog function so the RLS census can actually run -- an unrun census currently reads as an unverified tier on every SECURITY invocation repo-wide.',
    'OUT OF SCOPE for this SD: review the 60 SECURITY DEFINER functions that are anon/authenticated-EXECUTE-able while running as a BYPASSRLS owner.',
  ],
  detailed_analysis: {
    diff_verdict: 'PASS',
    repo_posture_verdict: 'CONDITIONAL_PASS (pre-existing, out of diff scope)',
    owasp_reviewed: [
      'A01 Broken Access Control',
      'A02 Cryptographic Failures (n/a - no crypto/secrets)',
      'A03 Injection',
      'A05 Security Misconfiguration',
      'A08 Software and Data Integrity Failures',
      'A09 Logging Failures',
    ],
    files_reviewed: [
      'scripts/modules/handoff/executors/lead-to-plan/gates/gate-registry-audit.js (NEW, 211 lines, read in full)',
      'scripts/modules/handoff/executors/lead-to-plan/gates/gate-registry-audit.test.js (NEW, 257 lines)',
      'scripts/modules/handoff/executors/lead-to-plan/gates/index.js (+6 export lines)',
      'scripts/modules/handoff/executors/lead-to-plan/index.js (+11/-1 registration)',
      'tests/factories/validator-context-factory.js (+4, additive range() mock)',
      'scripts/one-off/prd-content-pat-les-015.json (NEW, 149 lines, inert data - not in review brief)',
    ],
    corroborating_reads: [
      'scripts/modules/handoff/HandoffOrchestrator.js:698-830 (dryRunHandoff read-only verification)',
      'scripts/modules/handoff/validation/ValidationOrchestrator.js:185-225, 465-490, 582-606 (blocking vs scoring semantics)',
      'database/migrations/20260207_validation_gate_registry.sql:18-82 (schema + RLS policies)',
      'database/chairman-gated/20260819_anon_truncate_sweep.sql:1478 (anon TRUNCATE revoke)',
      'lib/db/fetch-all-paginated.mjs (pre-existing first-party pagination helper)',
    ],
    live_registry_state: {
      rows: 113,
      distinct_applicability: ['DISABLED', 'REQUIRED', 'OPTIONAL', 'OPTIONAL_OVERRIDE'],
      null_sd_type_rows: 4,
      sentinel_all_rows: 2,
      note: 'Matches the code own documented handling exactly; 113 < 1000 so pagination is defensive, not load-bearing today.',
    },
    findings,
  },
  metadata: {
    phase: 'EXEC',
    handoff_type: 'EXEC-TO-PLAN',
    analysis_mode: 'manual_diff_review',
    analyst: 'security-agent (Chief Security Architect)',
    model: 'claude-opus-5[1m]',
    evaluated_commit_sha: COMMIT,
    branch: 'feat/SD-LEARN-FIX-ADDRESS-PAT-LES-015',
    diff_range: 'main...HEAD',
    worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PAT-LES-015',
    supersedes_note: 'Complements automated scan row ec0c3ce4-bab4-4a93-830c-c27a42b12729 (same run); that row is a repo-wide posture scan that did not inspect this diff. Its two findings are carried forward verbatim in findings[] here.',
    diff_verdict: 'PASS',
    findings,
    metrics: {
      files_in_diff: 6,
      lines_added: 637,
      lines_removed: 1,
      new_dependencies: 0,
      db_write_calls_in_new_gate: 0,
      dynamic_imports_static_verified: 1,
      secrets_found: 0,
      sql_injection_sinks: 0,
      critical_findings: 0,
      high_findings: 0,
      medium_findings_preexisting_out_of_scope: 1,
      low_findings: 1,
      registry_rls_policies_verified: 2,
      registry_anon_policies: 0,
      nontest_importers_of_changed_test_factory: 0,
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'SECURITY',
  supabase: sb,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: true });

const stored = await storeSubAgentResults(
  'SECURITY',
  SD,
  { code: 'SECURITY', name: 'Chief Security Architect' },
  results,
  { phase: 'EXEC', sdKey: SD }
);
console.log('\nSTORED ID:', stored?.id || JSON.stringify(stored)?.slice(0, 300));
