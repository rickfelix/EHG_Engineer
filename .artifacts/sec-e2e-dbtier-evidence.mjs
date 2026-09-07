import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import crypto from 'node:crypto';

const SD_ID = '91c9e619-1ccd-4d63-9660-fc05f17f0fb1';
const COMMIT = '85358aea633';
const sb = createSupabaseServiceClient();

const critical_issues = [];

const warnings = [
  'F1 (MEDIUM, residual): env-resolution asymmetry -- the guard resolves .env CWD-ONLY (tests/helpers/e2e-db-target-guard.js:48 calls bare dotenv.config()), but the client it guards, lib/supabase-client.js:47, resolves via resolveEnvPath() (git-common-dir + ancestor walk). EMPIRICALLY DEMONSTRATED, not theoretical: from a cwd containing no .env, assertPlaywrightTargetSafe() returned ALLOWED (process.env.SUPABASE_URL stayed unset) while importing lib/supabase-client.js from that same cwd resolved to host dedlbzhpgkmetvhbkyzq. Realistic trigger is a fresh "git worktree add" with no .env copy -- a documented real occurrence (QF-20260504-755, cited in lib/__tests__/supabase-client-env-walk.test.js:1-3). NOT CI-affecting: all four playwright workflows export SUPABASE_URL into the process env directly (e2e-human-like.yml:123, stories-ci.yml:61, rca-auto-trigger.yml:145), so dotenv never participates there. Local-run risk only. One-line fix reusing existing repo machinery, no new module: dotenv.config({ path: resolveEnvPath(process.cwd()).path, quiet: true }).',
  'F2 (LOW, inherited): projectRefOf() does not trim/normalise its input (tests/helpers/db-target.js:30, UNMODIFIED by this branch). A leading space or newline in SUPABASE_URL defeats the ^https? anchor -> ref null -> BOTH checks pass, while WHATWG new URL() strips that same leading whitespace and resolves to hostname dedlbzhpgkmetvhbkyzq.supabase.co. Measured: SUPABASE_URL=" https://<prod>.supabase.co" -> ALLOWED. Pre-existing in the reused predicate, but the new check-2 denylist newly depends on it. Fix: String(url).trim() inside projectRefOf.',
  'F3 (LOW, non-accidental): URL userinfo bypass. https://x.supabase.co@dedlbzhpgkmetvhbkyzq.supabase.co parses under the regex as ref "x" (the \\b after co matches at the @), so check 2 does not fire, yet new URL().hostname is dedlbzhpgkmetvhbkyzq.supabase.co -- a real, network-reachable production target. Measured ALLOWED when no service key is present; check 1 DOES catch it whenever SUPABASE_SERVICE_ROLE_KEY is set (refuses ref "x" as undesignated). Requires deliberate crafting, so it is an insider/malicious shape, not the accidental-misconfiguration threat this SD targets. Structural fix: derive the ref from new URL(u).hostname rather than a raw-string regex.',
  'F4 (LOW, scope-adjacent): the guard reads only SUPABASE_URL || NEXT_PUBLIC_SUPABASE_URL (line 64), but tests/ also builds targets from SUPABASE_POOLER_URL (26 occurrences) and SUPABASE_DB_URL (4). Those are postgres connection strings that carry the ref in the USERNAME (postgres.<ref>@aws-0-*.pooler.supabase.com), which projectRefOf cannot parse -- measured ALLOWED. A pooler/pg-based writer to strategic_directives_v2 is therefore unguarded. Outside the SD stated scope (Playwright REST path) but the same target table.',
  'F5 (LOW, hardening): line 48 calls dotenv.config() WITHOUT quiet:true, re-introducing the QF-20260611-017 defect class that lib/supabase-client.js:32-40 explicitly documents and avoids. Verified the banner does print to STDOUT on config load. Not realised today (stories-ci.yml:100 writes --output=test-results.json to a FILE and tools/post-playwright-results.mjs:39 reads that file, never stdout), so no live breakage -- but a future --reporter=json-to-stdout consumer would break. One-word fix.',
  'F6 (NOTE, testing-lane): the spawn regression suite is describe.skipIf(IS_CI) (tests/unit/testing/e2e-db-target-guard.spawn.test.js:27,89), so the strongest end-to-end proof (real child playwright process aborts) never runs in CI. The hermetic unit suite (tests/unit/e2e-db-target-guard.test.js) is not skipped and does cover the predicate. Flagged for TESTING, not a security blocker.',
  'F7 (OPERATIONAL, intended): DESIGNATED_NON_PROD_REFS is Object.freeze([]) and this guard is not overridable, so every CI workflow that exports the production SUPABASE_URL into a Playwright job (e2e-human-like.yml, rca-auto-trigger.yml, stories-ci.yml) will now HARD-FAIL at config load until a non-production project is provisioned. This is the correct fail-closed posture for an active data-integrity incident, but it is a visible, immediate consequence the team should expect rather than diagnose as a regression.',
  'F8 (OBSERVATION, pre-existing, out of scope): sub_agent_execution_results is readable by the ANON role (count 27334 via createSupabaseClient()), while strategic_directives_v2 and product_requirements_v2 correctly return 0 to anon. The anon key is by design distributed to browser clients, so internal sub-agent verdicts/analysis are effectively public-readable. Unrelated to this SD; raising it once for the record.',
];

const recommendations = [
  'MERGE AS-IS. The SD exit predicate is met and independently re-measured: all five playwright*.config.js files refuse at module load against the live repo environment. None of F1-F8 re-opens the witnessed incident path.',
  'Follow-up QF (single ~3-line change, closes F1+F2+F5 together): in assertPlaywrightTargetSafe(), replace bare dotenv.config() with dotenv.config({ path: resolveEnvPath(process.cwd()).path, quiet: true }) reusing lib/env-resolver.cjs, and add String(url).trim() to projectRefOf. No new module, no new env var, no new allow-list -- consistent with this SD no-new-mechanism philosophy.',
  'Optional hardening for F3: derive the ref from new URL(resolvedUrl).hostname instead of regexing the raw string, which structurally eliminates the userinfo class rather than enumerating it.',
  'Do NOT add a VITEST_DB_ALLOW_REF-style escape hatch to check 2. Its non-overridability (verified by TS-7) is the single most valuable property of this change.',
];


const conditions = [
  'Follow-up QF filed to close F1 (guard resolves .env cwd-only via bare dotenv.config() while lib/supabase-client.js:47 walks ancestors via resolveEnvPath -- measured ALLOWED-but-production from a .env-less cwd). Fix: dotenv.config({ path: resolveEnvPath(process.cwd()).path, quiet: true }).',
  'Same follow-up QF adds String(url).trim() to projectRefOf (tests/helpers/db-target.js:30) to close F2, the leading-whitespace bypass that new URL() silently normalises back to the production host.',
  'Same follow-up QF adds quiet:true to the guard dotenv.config() call, closing F5 (re-introduced QF-20260611-017 stdout-banner class).',
  'Team is informed of F7 before merge: with DESIGNATED_NON_PROD_REFS empty and check 2 non-overridable, e2e-human-like.yml, rca-auto-trigger.yml and stories-ci.yml will now fail closed at Playwright config load. This is the intended incident posture, not a regression to be reverted.',
];

const detailed_analysis = {
  verdict_basis: 'Independent re-measurement, not a read-through of the EXEC claims. Every claim the assignment asked me to verify was checked against source or executed, and all four held.',
  primary_exit_predicate: {
    method: 'Imported each of the five playwright*.config.js from the worktree root with the real on-disk .env in place.',
    result: 'ALL FIVE REFUSED: playwright.config.js, playwright-test.config.js, playwright-uat.config.js, playwright-uat-nosetup.config.js, playwright.diagnostic.config.js -- each threw "[e2e-db-target-guard] Refused: target ref dedlbzhpgkmetvhbkyzq is not designated safe". Incident path closed.',
  },
  entry_point_coverage: 'COMPLETE. git ls-files finds exactly five tracked playwright config files -- all five are guarded, no sixth exists. npm scripts test:e2e/test:uat use --config with two of the guarded five. The four CI workflows invoke "npx playwright test <path>" with NO --config, so Playwright default-discovers playwright.config.js at repo root, which is guarded.',
  q1_guard_logic: 'Genuinely refuses the production ref across realistic env shapes. Measured REFUSED: prod+service key; prod with NO service key (the stories-ci.yml shape); NEXT_PUBLIC_SUPABASE_URL only; prod+anon key only; UPPERCASE host (the i flag plus m[1].toLowerCase() handles case correctly -- no case-sensitivity bypass); http:// not https; trailing-dot FQDN; and VITEST_DB_ALLOW_REF deliberately set to the production ref (TS-7 -- check 2 is genuinely non-overridable). The two-check design is sound: check 1 gates on assessment.ref && !assessment.allowed rather than bare !allowed, which correctly preserves the deliberately credential-less ehg-app-auth-smoke.yml run (measured: empty env bag -> ALLOWED, as intended).',
  q1_reuse_claim: 'ACCURATE. git diff --stat main...HEAD -- tests/helpers/db-target.js is EMPTY: db-target.js is genuinely unmodified, and assessDbTarget/projectRefOf are imported, not re-derived. This honours that file own header warning against parallel re-derivation.',
  q2_scope_compliance: {
    new_credential: 'NONE. No JWT/secret material in the diff. The only key-shaped literals are the fixture string "k" in test files.',
    new_env_var: 'NONE. Added lines reference only SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITEST_DB_ALLOW_REF (all pre-existing in db-target.js) and process.env.CI (standard).',
    new_allow_list: 'NONE. DESIGNATED_NON_PROD_REFS remains Object.freeze([]) in the unmodified db-target.js. PRODUCTION_REF is a DENY-list of one -- the inverse of an allow-list.',
    production_ref_secrecy: 'CLAIM VERIFIED INDEPENDENTLY, and the SD UNDERSTATED it. git grep -lI counts 1139 tracked files containing the prod ref (SD said "30+"), including README.md:9,10,85 and .env.example:13. It is a public URL subdomain, not a credential. Confirmed separately by decoding the ANON key JWT: its own ref claim is the same production ref, and that key is by design shipped to browsers.',
  },
  q3_both_check_bypass: 'YES -- three shapes defeat BOTH checks while still resolving to a real production target. Ranked by realism: (1) leading whitespace/newline in SUPABASE_URL [F2] -- accidental, most realistic; (2) postgres pooler/DB connection strings [F4] -- accidental, but a different client library; (3) URL userinfo @-trick [F3] -- deliberate only. Each confirmed against Node WHATWG new URL(): all three yield hostname dedlbzhpgkmetvhbkyzq.supabase.co or an equivalent production route. None re-opens the witnessed incident (which was plain SUPABASE_URL=prod), so none blocks the merge.',
  q4_dotenv_idempotency: 'CLAIM VERIFIED IN SOURCE, NOT ASSUMED. dotenv 17.4.1, node_modules/dotenv/lib/main.js:372 sets const override = Boolean(options && options.override) -- false for a bare config() -- and populate() at lines 383-386 writes processEnv[key] ONLY inside if (override === true), i.e. an already-present key is left untouched. The header comment at e2e-db-target-guard.js:48 is correct. Corroborated observationally: the banner printed "injected env (0)" when the vars were already set.',
  q5_owasp: {
    command_injection: 'NONE. spawnSync at tests/unit/testing/e2e-db-target-guard.spawn.test.js:48-59 does set shell:true, but every argv element is a hardcoded literal (the CONFIGS array at :35-41 and NO_MATCH_FILTER at :33). No external, env-derived or user-derived value reaches the command line -- env is passed via the env option, not interpolated. Latent hazard only if configFile is ever parameterised; noted, not a finding.',
    path_traversal: 'NONE. Paths are derived from import.meta.url via fileURLToPath/path.resolve; no user-controlled path segments.',
    secret_exposure: 'NONE. Both throw sites (lines 55-58, 67-70) emit only the project ref plus an enum reason string -- never a key, URL userinfo, or env value. The test safety invariant (--list plus a deliberately non-matching filter, :33/:50) means even the not-refused control case loads zero spec files, so the test suite itself cannot write to any target.',
    injection_other: 'No SQL string concatenation, no eval, no dynamic import of env-derived specifiers in the new files.',
  },
  measurement_extent: 'Bounded by static + local-process analysis. I executed the guard against 18 crafted env bags and loaded all five real configs, but I did NOT execute a full Playwright run against production (deliberately -- that is the behaviour under remediation). The CI-workflow conclusions are read from workflow YAML, not from an observed CI run.',
};

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  critical_issues,
  warnings,
  recommendations,
  detailed_analysis,
  conditions,
  summary: 'CONDITIONAL_PASS (88). Exit predicate independently re-measured: all 5 playwright configs refuse the production ref at module load; entry-point coverage is complete (5 of 5 tracked configs, and CI default-discovery lands on a guarded config). Scope honoured -- no new credential, no new env var, no new allow-list; db-target.js verified unmodified; the public-subdomain claim for the prod ref verified at 1139 tracked files; dotenv no-overwrite verified in dotenv 17.4.1 source at main.js:383-386. Conditional on 8 residual findings, none re-opening the witnessed incident: the notable one (F1) is that the guard resolves .env cwd-only while lib/supabase-client.js walks ancestors, demonstrated to yield ALLOWED-but-production from a .env-less cwd (local runs only; CI exports the URL directly).',
  justification: 'CONDITIONAL_PASS rather than PASS because three env shapes were measured to defeat BOTH checks while still resolving to a reachable production target (F1 whitespace-prefixed URL, F3 URL userinfo, F4 pooler connection strings), and because the guard env resolution is strictly weaker than that of the client it guards (F1). None of these reproduce the witnessed incident shape (plain SUPABASE_URL=prod, which is firmly refused), so the change is safe and valuable to merge now, with a small follow-up QF closing F1+F2+F5 in roughly three lines using machinery the repo already has.',
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'SECURITY',
  probeExistsRelative: 'tests/helpers/e2e-db-target-guard.js',
  supabase: sb,
});
applySubAgentRepoVerdict(results, resolution);

results.metadata = {
  ...(results.metadata || {}),
  phase: 'EXEC-TO-PLAN',
  evaluated_commit_sha: COMMIT,
  branch: 'feat/SD-LEO-INFRA-E2E-DBTIER-PROD-REF-GUARD-001',
  reviewer_model: 'claude-opus-5[1m]',
  files_reviewed: [
    'tests/helpers/e2e-db-target-guard.js',
    'tests/helpers/db-target.js',
    'tests/unit/e2e-db-target-guard.test.js',
    'tests/unit/testing/e2e-db-target-guard.spawn.test.js',
    'playwright.config.js', 'playwright-test.config.js', 'playwright-uat.config.js',
    'playwright-uat-nosetup.config.js', 'playwright.diagnostic.config.js',
    'node_modules/dotenv/lib/main.js', 'lib/supabase-client.js',
  ],
  content_hash: crypto.createHash('sha256').update(JSON.stringify(detailed_analysis)).digest('hex'),
};

const { data, error } = await sb.from('sub_agent_execution_results').insert({
  sd_id: SD_ID,
  sub_agent_code: 'SECURITY',
  sub_agent_name: 'Chief Security Architect',
  phase: 'EXEC-TO-PLAN',
  verdict: results.verdict,
  confidence: results.confidence,
  critical_issues: results.critical_issues,
  warnings: results.warnings,
  recommendations: results.recommendations,
  detailed_analysis: results.detailed_analysis,
  summary: results.summary,
  justification: results.justification,
  conditions: results.conditions,
  source: 'manual',
  executed_from_cwd: process.cwd(),
  metadata: results.metadata,
}).select('id,verdict,confidence,phase').single();

console.log(error ? 'INSERT ERROR: ' + JSON.stringify(error) : 'EVIDENCE ROW: ' + JSON.stringify(data, null, 1));
console.log('repo_path:', results.metadata.repo_path, '| repo_resolved:', results.metadata.repo_resolved, '| probeExists:', resolution.probeExists);
