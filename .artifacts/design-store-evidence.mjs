#!/usr/bin/env node
/**
 * Store the PLAN-phase DESIGN sub-agent verdict for
 * SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 via the canonical evidence path.
 *
 * Run from inside the SD worktree so executed_from_cwd reflects the tree actually analysed.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..'), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const SD_ID = 'ef96ac1a-69f1-4f57-8ba5-fcec84ad66d5';
const SD_KEY = 'SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001';

const F = (id, severity, title, detail, action) => ({ id, severity, title, detail, action });

const findings = [
  F('D-1', 'HIGH',
    "LEAD Q7 'no UI exists' is FACTUALLY WRONG -- a chairman-reachable /security dashboard DOES exist. The conclusion (build no UI) survives; the reason does not.",
    "MEASURED, not inferred. The ehg app (C:/Users/rickf/Projects/_EHG/ehg, applications.local_path for 'EHG') registers /security at src/routes/featureRoutes.tsx:259 via protectedRoute(\"/security\", SecurityPage, ...), lazy-loading app/security/page.tsx (src/routes/featureRoutes.tsx:95), permission-gated on usePermission('operations_security_read'). It renders ComprehensiveSecurityDashboard (548 LOC) + SecurityIncidentManager. My first pass nearly recorded this as unreachable dead code (app/*/page.tsx is a Next.js App Router convention and ehg is Vite -- 12 such orphan-looking pages exist); that was MY OWN scope error, falsified by grepping for the lazy import. So the surface is real and reachable. WHY IT IS STILL THE WRONG SURFACE, three measured reasons: (a) ZERO privilege dimension -- grep -inE 'grant|execute|privileg|anon|security definer' across src/components/security/, src/hooks/useSecurityData.ts, src/hooks/useSecurityCompliance.ts and app/security/page.tsx returns 0 hits; its tabs are Active Threats / Security Scans / Compliance / AI Analytics, an incident-and-framework model with no database-ACL concept anywhere. (b) It is DEMO-GRADE: ComprehensiveSecurityDashboard.tsx:71-91 builds mockCompanyId / mockThreats / mockScans behind the comment 'For demo purposes, use mock data since we need to work with existing schema'. (c) Its one live path is broken: useSecurityData fetches /api/security/overview, Vite proxies /api -> http://localhost:3000 (EHG_Engineer, vite.config.ts:56-60), and NO such route exists there -- I searched all 6466 tracked .js/.mjs/.cjs/.ts files in EHG_Engineer (git ls-files, excluding test/spec) for 'security/overview' and the only hit is scripts/archive/one-time/create-additional-reconnection-sds.js. The page therefore loads, toasts 'Failed to load security overview', and displays mock threat rows. EHG_Engineer itself has no candidate surface at all: src/client does not exist (backend-API-only per SD-ARCH-EHG-007).",
    "DESIGN VERDICT: do NOT surface this SD's results in the UI, but record the CORRECT reason in the PRD. Routing a real, chairman-gated, live-measured privilege verdict into a panel whose neighbouring rows are fabricated would place a measured assertion beside demo data with no visual discriminator -- the reader cannot tell which is which, and the mock rows would borrow the credibility of the real one. Replace LEAD's 'no data output a user would view' with: 'the only existing security surface is demo-grade, has no privilege axis, and its live endpoint 404s; the chairman-facing artifact for this SD is the ceremony report (D-6), not a dashboard.'"),

  F('D-2', 'HIGH',
    "Migration PLACEMENT is what enforces the chairman gate, not the blank @approved-by header. Following the predecessor's path would AUTO-APPLY this SD's migration and silently defeat its central non-negotiable.",
    "The predecessor this SD is explicitly told to copy -- 20260728_revoke_public_execute_role_flag_rpcs.sql + its _DOWN.sql, commit 13d02e18d81 -- landed in database/migrations/. Per database/chairman-gated/README.md, BaseExecutor._checkAndExecutePendingMigrations runs with autoExecute: options.autoExecuteMigrations !== false (TRUE by default) and scans exactly three directories (pending-migrations-check.js:778): database/migrations, database/manual-updates, supabase/migrations. The TIER-2 default-deny classifier that is supposed to stop risky DDL is gated on leo_feature_flags.LEO_MIGRATION_TIER_GATE_BYPASS and tierGateEnabled() returns true only for the literal string 'on'; with it off the classification is 'computed and logged but changes NOTHING' (README's words). The README states the rule outright: 'A worker cannot place chairman-gated DDL in an auto-applied path and still call it gated.' Success criterion #6 requires @approved-by be left blank -- but a blank header does not stop the auto-applier. Only the directory does. This is a check the caller can satisfy without changing the harm.",
    "Add an explicit PRD acceptance criterion: the migration, its _DOWN.sql, and its acceptance script are placed in database/chairman-gated/ -- NOT database/migrations/. Near-exact template already in that directory: 20260804_session_coordination_revoke_authenticated_writes.sql + _DOWN.sql (a REVOKE migration with a paired DOWN, chairman-gated). Apply path per README: node scripts/apply-migration.js \"database/chairman-gated/<file>\" --prod-deploy --issue-token <token>."),

  F('D-3', 'HIGH',
    "TASK 3 SCOPE DEFECT: a standing check that copies the existing lint's directory scope would be structurally BLIND to this SD's own migration. The blind spot is already empirically documented in-repo.",
    "Measured across 1878 tracked .sql files, SECURITY DEFINER-creating SQL by directory: database/migrations 232, supabase/migrations 24, supabase/ehg_engineer/migrations 6, archive/migrations/legacy 6, supabase/ehg_app/migrations 5, db/migrations/eng/legacy 5, database/manual-updates 5, database/chairman-gated 5, plus golden-references/docs/one-off singletons. The obvious model to copy, scripts/lint/rls-anon-tenant-predicate-lint.mjs, scopes to ONE of these: candidateFilesDiff filters f.startsWith('database/migrations/') (line 244) and candidateFilesAll reads only that dir (line 249). That blind spot is NOT hypothetical -- database/chairman-gated/20260812_venture_operating_burn_tenant_predicate_acceptance.mjs:16-22 records it verbatim: 'The CLI's --diff and --all modes both scan only database/migrations/ and are blind to database/chairman-gated/ (verified empirically during PLAN-phase TESTING: --diff scanned 0 files here; --all still flagged the untouched historical migration instead).' That SD had to work around it by binding to the exported lintSql() directly instead of using the CLI. Combined with D-2 (this SD's migration MUST live in database/chairman-gated/), a scope-copying guard would ship unable to see the very artifact it exists to check.",
    "Scan the UNION of four directories from day one: {database/migrations, database/manual-updates, supabase/migrations} -- the three auto-applied dirs, i.e. the actual risk surface -- PLUS {database/chairman-gated} -- the highest-risk DDL and where D-2 places this SD's own migration. Do NOT repeat the bind-to-lintSql() workaround; fix the scope in the CLI so the next acceptance script does not have to. Export the pure lintSql() anyway (house convention) so acceptance scripts can bind directly, but make the CLI correct."),

  F('D-4', 'HIGH',
    "TASK 2 FORMAT REQUIREMENT: rendering only has_function_privilege() makes the report structurally INCAPABLE of proving or disproving correction C1. The PUBLIC axis must be decomposed, not collapsed.",
    "has_function_privilege('anon', oid, 'EXECUTE') returns TRUE when anon holds a DIRECT grant OR merely inherits PUBLIC's grant -- the two are indistinguishable in that predicate. C1 is precisely that anon/authenticated inherit PUBLIC, so 'REVOKE ... FROM anon, authenticated' is a no-op while every has_function_privilege-based check keeps reporting the same value it would report after a correct fix. A report built on the effective predicate alone cannot tell the chairman whether the REVOKE he is authorizing will actually work; it is the same shape as the C3 complaint (the designated verifier cannot see the change being made), moved one layer up into the presentation. The report must therefore render the DECOMPOSED proacl -- direct PUBLIC entry, direct anon entry, direct authenticated entry -- ALONGSIDE the effective answers, and name the cause inline.",
    "Column model (grouped, one header line, ~92 chars, fits CI log width):\n  function                                   PUB anon auth | eff.anon eff.auth | verdict\nWith the house inline-annotation convention (broad-policy-audience-audit.mjs:74 uses 'NO  <-- undecidable without guessing intent') carrying the CAUSE:\n  fn_enforce_stage_advancement_artifact_gate  X   .    .   |  YES      YES     | EXPOSED (anon via PUBLIC)\n  fn_stage_artifact_precondition              X   X    X   |  YES      YES     | EXPOSED (anon direct + PUBLIC)\n  fn_user_has_company_access                  .   .    .   |  no       no      | CLOSED\nThe '(anon via PUBLIC)' annotation is the load-bearing cell: it is the only thing in the report that distinguishes a REVOKE that works from one that reads as if it did."),

  F('D-5', 'HIGH',
    "TASK 2 FORMAT REQUIREMENT: iterate the CATALOG and reconcile in BOTH directions. A report that walks the declared 42 and asserts each is closed reads green while newly-added functions sit exposed.",
    "C5 establishes the list is a floor, not a ceiling (get_daily_briefing, get_okr_metrics, get_portfolio_summary predate the scan; fn_anon_ingress_prior_hour_count and log_sd_mutation_audit post-date it). A declared-list-driven report is the 'successful fallback tier hides an empty authoritative tier' shape: every declared row can be green while the population it was drawn from has grown. C9's operational note is the live proof that this repo's existing tooling already fails this way -- audit-rpc-execute-grants.mjs's EHG_APP_SRC default resolves to a nonexistent path from a worktree and silently falls back to a stale 24-name list missing 7 real Bucket B members, printing a confident green over a smaller-than-believed input set.",
    "Drive the loop from the live catalog (all SECURITY DEFINER functions in public), not from the bucket list, and emit BOTH reconciliation directions with a closed verdict taxonomy:\n  CLOSED      -- final state reached, no action\n  EXPOSED     -- anon/PUBLIC can execute AND declared for revoke -> will change (this set sizes the ask)\n  NO-OP       -- declared for revoke but already closed (the C4 population; must NOT inflate the ask)\n  PRESERVED   -- Bucket C, deliberately untouched; assert byte-identical before/after\n  REGRESSED   -- authenticated grant lost that should have been kept (see D-8)\n  UNDECLARED  -- SECDEF + anon-executable, in NO bucket -> FAIL LOUDLY (C3/C5)\n  ABSENT      -- declared in a bucket, not in the catalog (C9: 2 Bucket A fns have no committed CREATE FUNCTION)\nUNDECLARED and ABSENT are the two the current tooling cannot express, and they are the two that matter."),

  F('D-6', 'MEDIUM',
    "TASK 2: the chairman artifact and the engineer artifact are different documents. Add a --ceremony mode; every count must be printed WITH its list.",
    "C4 says the ask must be sized by the ~16 genuinely changing, not '42 verdicts', and the SD's own stated principle is that authorization is 'given against a verified list rather than a category'. A single verbose per-function dump (42 x 4 labelled lines = ~170 lines) does not meet a chairman reviewing a 3-factor ask, and a bare summary count does not either -- it re-creates the category-authorization the SD exists to avoid. The format must make the principle structural: no number appears without the list that produces it.",
    "Three modes (mirrors the established --diff/--all/--json precedent): default = engineer verbose (D-4 table, per bucket); --json = CI; --ceremony = the one-page ask. --ceremony sections, each count followed by its members:\n  1. YOU ARE AUTHORIZING N FUNCTIONS TO CHANGE STATE -- split by action (revoke PUBLIC+anon+auth / revoke PUBLIC+anon keep auth), each row carrying its one-line reason.\n  2. DELIBERATELY UNTOUCHED (Bucket C) -- each with its exclusion reason, e.g. fn_relay_insert_sms_candidate: anon-only grant, zero internal callers -> external integration (Twilio inbound SMS, the chairman's own inbound channel).\n  3. ALREADY CLOSED, NO ACTION -- the C4/C9 population listed by name with the SD that closed it (SD-MAN-FIX-SECURITY-GUARD-PACK-001 closed 8), so the reduction from 42 is AUDITABLE rather than asserted.\n  4. REVERSALS OF PRIOR EXPLICIT DECISIONS -- carries C6's fn_user_has_company_access flag (20260603_03 explicitly allowlisted it; scripts/lint/rls-anon-tenant-predicate-lint.mjs:62 still names it as a caller-binding auth primitive, and line ~207's message steers policy authors toward it). Also carries C6's fn_stage_artifact_precondition correction: safe by COINCIDENCE (scripts/harness/s20-fixture.mjs:219 calls it with a service_role client), not safe by design as originally recorded.\n  5. NOT PLACEABLE -- must read 0 before the ceremony proceeds.\n  6. Rollback artifact path + the ACL baseline it was generated from.\nHeader must stamp the MEASUREMENT time, not the render time, and state 'point-in-time read; re-run immediately before the ceremony -- C5 established this list is a floor, not a ceiling.'"),

  F('D-7', 'MEDIUM',
    "TASK 2: do not invent a standalone reporter -- database/chairman-gated/ already carries the house convention for a chairman-gated migration's verification artifact.",
    "Three precedents exist: 20260803_bound_anon_ingress_source_type_qualifier_acceptance.mjs (240 LOC), 20260812_venture_ingest_key_binding_acceptance.mjs (195), 20260812_venture_operating_burn_tenant_predicate_acceptance.mjs (80). Extracted conventions: numbered sections '=== N. NAME -- one-line statement of METHOD ==='; section 1 is always BASELINE, a live catalog read printed BEFORE apply; three-way '->' interpretation of each observed value (matches known pre-fix state / already carries the fix / UNEXPECTED -- investigate before proceeding) rather than a two-way pass-fail; '  ok/X/warn' glyphs at 2-space indent; terminal '=== PASS ===' / '=== FAIL ==='; process.exitCode rather than process.exit. Also a prominent 'SCOPE, stated plainly' header declaring what the script does NOT verify, citing the evidence row of the finding that forced the disclaimer, plus an explicit warning against tautological checks: a probe that 'would pass identically under the leaking policy or the fixed one ... is worse than no test at all because it would look like evidence'. The nearest structural sibling for the whole SD is scripts/audit/broad-policy-audience-audit.mjs, whose header states the same shape as this SD: the SD is forbidden from applying anything, so the proof it worked is the query returning zero AFTER the chairman applies.",
    "Deliver the verification as database/chairman-gated/<migration>_acceptance.mjs co-located with the migration and its _DOWN.sql, following those conventions. Keep the three-way interpretation arm -- the 'unexpected' branch is what makes the baseline honest. Reuse broad-policy-audience-audit.mjs's report grammar: '[SCREAMING-KEBAB] <headline count sentence>', an empty case that RESTATES the invariant ('None. Every ...') rather than printing 0, and a closing gauge line naming the single number to watch."),

  F('D-8', 'MEDIUM',
    "Extending audit-rpc-execute-grants.mjs must not regress its original job: two opposite-polarity assertions must not collapse into one pass/fail, and the script must print its input provenance.",
    "The script exists to detect CREATE OR REPLACE silently dropping the AUTHENTICATED grant and 403-ing the chairman console (its header, lines 4-7). This SD adds an anon axis whose desired value is the OPPOSITE polarity (authenticated: must be PRESENT; anon/PUBLIC: must be ABSENT). Collapsing both into one exit code lets a fix on one axis mask a break on the other -- and the authenticated break is the one that takes down the chairman's own console. Separately, C9's operational note documents that EHG_APP_SRC defaults to ../ehg/src relative to REPO_ROOT, which from a worktree resolves to .worktrees/ehg/src, does not exist, and silently falls back (line 63-66) to a stale 24-name FALLBACK_RPCS list missing 7 real Bucket B members -- printing '[guard] ... using committed fallback list (24)' at info level where a green summary later drowns it.",
    "Keep REGRESSED (lost authenticated) as a verdict DISTINCT from EXPOSED (has anon/PUBLIC) in the taxonomy of D-5, and make the exit code report which axis failed. Promote the input-provenance line to a mandatory report HEADER rendered adjacent to the verdict, not a line at the top that scrolls away: 'input: fallback list (24 names) -- EHG_APP_SRC=<path> NOT FOUND' must be visually attached to any green result, because a green over an empty or stale input set is the failure mode this SD is trying to close everywhere else."),

  F('D-9', 'MEDIUM',
    "TASK 3: default to --diff (blocking) with --all advisory, or the guard blocks every PR on a 137-function pre-existing backlog.",
    "The SD's own numbers: 46 of 137 SECURITY DEFINER functions in public were PUBLIC-exposed with no migration ever having written a REVOKE. A full-sweep-blocking guard would fail on day one on migrations nobody in the PR touched. scripts/lint/rls-anon-tenant-predicate-lint.mjs:34-39 states the house resolution: '--diff (default in CI): lint ONLY migration files changed vs the merge base with origin/main -- a pre-existing backlog must never block a PR that didn't introduce it. --all: advisory full sweep.'",
    "Same posture. Also mirror the workflow conventions measured in .github/workflows/: one workflow per lint named <name>-lint.yml; an EXPLICIT path list with NO brace globs (ismainmodule-classguard-lint.yml:22-23 records that GitHub Actions does not expand brace alternation, so a brace-glob filter matched nothing -- 'not weak enforcement, it is no enforcement wearing a green check'); the paths filter must include the lint script, its allowlist, AND the workflow file itself; concurrency group ${{ github.workflow }}-${{ github.ref }} with cancel-in-progress. Declare the blocking-vs-advisory posture in a header comment as the newer guards do -- this one should be GENUINELY BLOCKING (no continue-on-error), matching count-delta-gate-lint / ismainmodule-classguard-lint rather than the older advisory scanners."),

  F('D-10', 'MEDIUM',
    "TASK 3: the highest-value violation class is revoke_omits_public, NOT missing-revoke -- and it is the exact defect this SD's own plan committed.",
    "Two classes are needed and they are not equally valuable. (a) secdef_no_revoke: a SECURITY DEFINER CREATE FUNCTION with no REVOKE at all. Once this SD's ALTER DEFAULT PRIVILEGES lands, new functions created by the covered role are no longer PUBLIC-executable by default, so this class becomes belt-and-braces -- but ADP is per-creating-role, so it stays necessary for any function created by a role the ADP was not scoped to, which is the half nobody watches. (b) revoke_omits_public: a REVOKE that names only anon and/or authenticated and omits PUBLIC. This is the C1 defect -- a statement that READS as a fix, passes review, and changes nothing, because anon and authenticated inherit PUBLIC's grant. LEAD found this in this SD's OWN migration plan. A guard that ships without class (b) would not have caught the SD that created it.",
    "Carry both classes. Class (b)'s message must state the inheritance MECHANISM, not just the omission, because the omission looks harmless without it. Add a third class for the escape hatch itself: allowlist_entry_missing_reason, following alter-default-override-lint.mjs:296 where an allowlist entry lacking a non-empty 'reason' is itself a build failure (allowErrors feed the exit code) -- that is what makes the SD's 'or record why not' clause mechanically real rather than an unpoliced opt-out."),

  F('D-11', 'INFO',
    "TASK 3: concrete failure-message template + naming, extracted from the measured house style.",
    "Message anatomy distilled from scripts/lint/rls-anon-tenant-predicate-lint.mjs's VIOLATION_MESSAGES map (lines 200-208), alter-default-override-lint.mjs's summary block (lines 388-394), and audit-rpc-execute-grants.mjs:111: (1) '<file>: ' prefix; (2) WHAT -- the exact object, fully qualified with signature; (3) WHY -- the mechanism stated in one clause, not a label; (4) PRIOR REAL INSTANCE -- cite the SD/commit where this class actually shipped (a distinctive house signature: every message in rls-anon-tenant-predicate-lint names its real instances); (5) 'Fix:' with COPY-PASTEABLE SQL, not a description of a fix -- the guard knows the signature so it can emit the literal statement, and audit-rpc-execute-grants.mjs:111 already sets that precedent; (6) the escape hatch named by path with its reason requirement. Report grammar: '[SECDEF-REVOKE-PUBLIC-LINT] mode=diff scanned=N', '  0 violation(s) -- clean.' on success, '  <file>: <message>' per violation, process.exitCode = 1 in diff mode.",
    "Proposed naming per house convention: scripts/lint/secdef-revoke-public-lint.mjs + scripts/lint/secdef-revoke-public-allowlist.json + .github/workflows/secdef-revoke-public-lint.yml + npm script 'lint:secdef-revoke'. Use isMainModule from lib/utils/is-main-module.js for the main guard (enforced repo-wide by scripts/lint/ismainmodule-classguard-lint.mjs with 'zero exceptions' in scripts/**) -- note rls-anon-tenant-predicate-lint.mjs still uses the older raw pathToFileURL pattern, so copy alter-default-override-lint.mjs's guard, not that one. Worked class-(b) message:\n  database/chairman-gated/<f>.sql: CREATE FUNCTION public.fn_x(uuid) has a REVOKE, but it reads FROM anon, authenticated and omits PUBLIC. anon and authenticated INHERIT PUBLIC's grant, so this REVOKE is a NO-OP -- the function stays anon-executable while the migration reads as if it closed it. Real instance: this exact omission was found in SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001's own migration plan at LEAD (correction C1); the correct pattern is in database/migrations/20260728_revoke_public_execute_role_flag_rpcs.sql (commit 13d02e18d81). Fix: REVOKE EXECUTE ON FUNCTION public.fn_x(uuid) FROM PUBLIC, anon, authenticated;"),

  F('C-1', 'INFO',
    "CONFIRMED SOUND: the SD's no-UI posture is correct, and there is no second candidate surface anywhere in either repo.",
    "Directly answering the question posed. Beyond ehg's /security (D-1), I found no other human-viewable surface rendering function grant state. EHG_Engineer has no src/client and serves no dashboard route matching security/overview across 6466 tracked source files. ehg's other security-adjacent surfaces do not qualify: SecurityStatusQuadrant (rendered by app/operations/page.tsx) and SecuritySettings (rendered by ChairmanSettingsPage/settings.tsx) both carry zero grant/privilege vocabulary. The 12 ehg files mentioning 'SECURITY DEFINER' are all call-site COMMENTS explaining why a given RPC is used (e.g. useUserRole.ts:4 on fn_is_chairman, WebAuthnRegistration.tsx:42 on fn_list_chairman_webauthn_credentials) -- documentation of consumption, never a rendering of grant state.",
    "NO UI WORK. Record the corrected reason from D-1 in the PRD rather than LEAD's 'no data output a user would view'."),
];

const conditions = [
  'PRD-REQUIRED (D-2): an acceptance criterion placing the migration + _DOWN.sql + acceptance script in database/chairman-gated/, NOT database/migrations/. The blank @approved-by in success criterion #6 does not stop the auto-applier; only the directory does.',
  'PRD-REQUIRED (D-3): the standing check scans {database/migrations, database/manual-updates, supabase/migrations, database/chairman-gated}. A guard scoped to database/migrations/ alone cannot see this SD\'s own migration.',
  'PRD-REQUIRED (D-4): the verifier renders decomposed proacl (direct PUBLIC / anon / authenticated) alongside effective has_function_privilege, with the cause annotated inline. Effective-only output cannot prove or disprove C1.',
  'PRD-REQUIRED (D-5): the verifier iterates the live catalog, not the declared bucket list, and emits UNDECLARED and ABSENT verdicts. Declared-list iteration reads green while newly-added functions sit exposed.',
  'PRD-REQUIRED (D-8): REGRESSED (lost authenticated) stays a distinct verdict from EXPOSED (has anon), and input provenance renders adjacent to the verdict, not above it.',
  'EXEC-VERIFY (D-6): the --ceremony artifact prints every count with its member list, including the already-closed population by name and the C6 reversal flags, stamped with MEASUREMENT time and a re-verify instruction.',
  'EXEC-VERIFY (D-10): the guard carries the revoke_omits_public class, not only secdef_no_revoke, plus allowlist_entry_missing_reason as a build failure.',
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  status: 'completed',
  findings,
  critical_issues: findings.filter((f) => f.severity === 'HIGH').map((f) => `${f.id}: ${f.title}`),
  recommendations: conditions,
  detailed_analysis: [
    'PLAN-phase DESIGN review for SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001. This is a pure database-security SD with no end-user feature, so the classic DESIGN scope (wireframes, component sizing, WCAG) does not apply. The review was reframed to the three questions actually posed: (1) independently verify the no-UI finding, (2) design the verification tooling\'s reporting format, (3) design the CI standing check\'s failure presentation.',
    '',
    'VERDICT: CONDITIONAL_PASS. The SD\'s no-UI posture is correct and is CONFIRMED (C-1). But LEAD\'s stated REASON for it is factually wrong (D-1), and I found four HIGH-severity design defects in how the deliverables are shaped and placed (D-1..D-4) that would each have shipped an artifact that reads correct and is not.',
    '',
    'THE THROUGH-LINE. Three of the four HIGH findings are the same failure at different layers: an instrument that cannot observe the thing it certifies.',
    '  - D-4: a report built on has_function_privilege alone cannot distinguish a working REVOKE from the C1 no-op, because that predicate collapses direct grants and PUBLIC inheritance.',
    '  - D-3: a guard scoped to database/migrations/ cannot see database/chairman-gated/, where D-2 requires this SD\'s own migration to live.',
    '  - D-2: a blank @approved-by header does not gate anything; the auto-applier keys on the DIRECTORY, so a migration in the predecessor\'s path is applied by the pipeline regardless.',
    'This SD\'s LEAD phase already caught one instance of this class (C3: the designated verifier cannot see the change being made). These are three more of it, in the layer PLAN is about to author.',
    '',
    'ON D-1 AND MY OWN ERROR, recorded rather than laundered. My first pass concluded the ehg /security page was unreachable dead code, on the reasoning that app/*/page.tsx is a Next.js App Router convention and ehg is a Vite app (12 such pages exist, and vite has no file-based routing from app/). That was wrong: src/routes/featureRoutes.tsx:95 lazy-imports it and line 259 registers it as a protected route. I found this by falsifying my own conclusion rather than by the original sweep -- the same reason LEAD\'s "no UI exists" survived. A bounded grep\'s directory scope is an assumption, and both of us made it. The corrected finding is stronger than either: the surface EXISTS, is reachable, is permission-gated -- and is demo-grade with no privilege axis and a 404ing data endpoint, which is a much better argument for not building on it than its absence would have been.',
    '',
    'ON TASK 2. The single most consequential format decision is D-4: decompose the PUBLIC axis. Everything else is presentation; that one is the difference between a report that can prove the fix and one that will read green either way. D-5 (catalog-driven, two-sided reconciliation) is second: it is what makes the UNDECLARED and ABSENT populations expressible at all, and C5/C9 both establish those populations are non-empty. D-6 (--ceremony mode) is what makes the SD\'s own stated principle -- authorization against a verified list, not a category -- structural rather than aspirational, by refusing to print any count without its members. D-7 keeps all of it inside an existing house convention (database/chairman-gated/<migration>_acceptance.mjs) instead of inventing a reporter.',
    '',
    'ON TASK 3. The failure-message house style is well-established and consistent across scripts/lint/: file-prefixed, mechanism-stated, prior-real-instance-cited, copy-pasteable Fix: SQL, named escape hatch. The genuinely load-bearing decisions are not the message text but D-3 (scope), D-9 (--diff blocking / --all advisory, or it blocks every PR on a 137-function backlog) and D-10 (carry revoke_omits_public, the class this SD itself committed). A guard with a beautiful message and the wrong directory scope is the green check the ismainmodule workflow header warns about.',
    '',
    'EMPIRICAL BASIS. Every claim above was measured, not inferred. ehg route registration read directly from src/routes/featureRoutes.tsx; grant-vocabulary absence measured by grep over the four security UI files (0 hits); mock data read at ComprehensiveSecurityDashboard.tsx:71-91; the missing endpoint established by searching all 6466 tracked source files in EHG_Engineer in two chunks (I also verified my grep scope existed first -- lib/dashboard/ does not, so a grep over it would have been vacuous); SECURITY DEFINER directory distribution counted over 1878 tracked .sql files; auto-apply behaviour read from database/chairman-gated/README.md; the chairman-gated lint blind spot read verbatim from an existing acceptance script that had already hit it; predecessor migration path and _DOWN.sql pairing confirmed via git log --diff-filter=A and git show 13d02e18d81.',
  ].join('\n'),
  metadata: {
    phase: 'PLAN',
    sd_key: SD_KEY,
    sd_id: SD_ID,
    review_type: 'PLAN-phase DESIGN review, reframed for a UI-less database-security SD (no wireframes/component-sizing scope applies)',
    findings_total: findings.length,
    findings_high: findings.filter((f) => f.severity === 'HIGH').length,
    findings_medium: findings.filter((f) => f.severity === 'MEDIUM').length,
    findings_info: findings.filter((f) => f.severity === 'INFO').length,
    ui_surface_question: {
      answer: 'A chairman-reachable /security dashboard DOES exist in the ehg app -- LEAD Q7 "no UI exists" is factually wrong -- but it is the WRONG surface, so the no-UI conclusion stands on a corrected reason.',
      ehg_route: 'src/routes/featureRoutes.tsx:259 protectedRoute("/security", SecurityPage) -> lazy import app/security/page.tsx (line 95); permission operations_security_read',
      grant_vocabulary_hits: 0,
      grant_vocabulary_scope: 'src/components/security/, src/hooks/useSecurityData.ts, src/hooks/useSecurityCompliance.ts, app/security/page.tsx',
      mock_data: 'ComprehensiveSecurityDashboard.tsx:71-91 -- mockCompanyId/mockThreats/mockScans, "For demo purposes, use mock data since we need to work with existing schema"',
      backend_endpoint: '/api/security/overview DOES NOT EXIST in EHG_Engineer (searched all 6466 tracked .js/.mjs/.cjs/.ts, excluding test/spec; only hit is scripts/archive/one-time/create-additional-reconnection-sds.js)',
      ehg_engineer_has_no_client: 'src/client absent -- backend API only per SD-ARCH-EHG-007',
      verdict: 'NO UI WORK for this SD; record the corrected reason in the PRD',
    },
    secdef_sql_directory_distribution: {
      measured_over: '1878 tracked .sql files (git ls-files)',
      'database/migrations': 232,
      'supabase/migrations': 24,
      'supabase/ehg_engineer/migrations': 6,
      'archive/migrations/legacy': 6,
      'supabase/ehg_app/migrations': 5,
      'db/migrations/eng/legacy': 5,
      'database/manual-updates': 5,
      'database/chairman-gated': 5,
      recommended_guard_scope: ['database/migrations', 'database/manual-updates', 'supabase/migrations', 'database/chairman-gated'],
      rationale: 'first three are the auto-applied set (pending-migrations-check.js:778); the fourth is where D-2 places this SD\'s own migration',
    },
    house_style_sources: [
      'scripts/lint/alter-default-override-lint.mjs (allowlist-with-mandatory-reason; summary block; isMainModule guard)',
      'scripts/lint/rls-anon-tenant-predicate-lint.mjs (VIOLATION_MESSAGES map; --diff blocking / --all advisory; prior-real-instance citation; database/migrations-only scope = the D-3 blind spot)',
      'scripts/audit/broad-policy-audience-audit.mjs (chairman-gated read-only audit grammar; inline "<--" annotation; closing gauge line)',
      'database/chairman-gated/*_acceptance.mjs (numbered sections; BASELINE-first; three-way -> interpretation; terminal PASS/FAIL)',
      'database/chairman-gated/README.md (auto-apply directory set; "a worker cannot place chairman-gated DDL in an auto-applied path and still call it gated")',
      '.github/workflows/ismainmodule-classguard-lint.yml (no brace globs; blocking-vs-advisory posture declared in header)',
    ],
    analysis_trees: [
      'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 (SD worktree -- lint/workflow/chairman-gated survey)',
      'C:/Users/rickf/Projects/_EHG/EHG_Engineer (canonical local_path -- endpoint sweep, .sql distribution, git history)',
      'C:/Users/rickf/Projects/_EHG/ehg (applications.local_path for EHG -- the UI surface question)',
    ],
    analysis_tree_note: 'repo_path resolves to the EHG_Engineer canonical local_path (target_application=EHG_Engineer). The UI-surface question (D-1/C-1) necessarily required scanning the sibling ehg app at C:/Users/rickf/Projects/_EHG/ehg, since EHG_Engineer serves no UI (no src/client) -- recorded so repo_path is not read as the only tree scanned.',
    plan_conditions: conditions,
    self_correction: 'First pass concluded ehg /security was unreachable (app/*/page.tsx is a Next.js convention; ehg is Vite). Falsified by src/routes/featureRoutes.tsx:95 lazy import + line 259 route registration. Recorded rather than silently corrected -- the error and LEAD Q7 share a root cause (unmeasured grep scope).',
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'DESIGN',
  fallback: 'EHG_Engineer',
  probeExistsRelative: 'package.json',
  supabase,
});
console.log('Repo resolution:', JSON.stringify(resolution, null, 2));

applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('DESIGN', SD_ID, { name: 'DESIGN' }, results, {
  phase: 'PLAN',
  source: 'manual',
  sdKey: SD_KEY,
});

console.log('\n=== STORED ===');
console.log(JSON.stringify(stored, null, 2));
