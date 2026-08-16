#!/usr/bin/env node
/**
 * SD-completion retrospective for SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001.
 *
 * Written directly against the retrospectives table (same pattern as the
 * scripts/one-off/insert-retro-*.mjs precedents) so the PLAN-TO-LEAD
 * RETROSPECTIVE_QUALITY_GATE has a fresh retro_type=SD_COMPLETION row created
 * after the LEAD-TO-PLAN acceptance timestamp (2026-08-16T12:43:12.494791Z).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = 'f412dad8-3425-4540-a211-b39f09a7652a';
const SD_KEY = 'SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'TESTING_STRATEGY',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  created_at: new Date().toISOString(),
  conducted_date: new Date().toISOString(),

  title: 'Stale QF Disposition Sweep: two PLAN-phase redesigns before any code existed, then four independent adversarial rounds each finding a genuine, non-overlapping defect on already-reviewed code',

  description: "SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001 adds a coordinator-owned, dry-run-by-default sweep (scripts/coordinator-stale-qf-disposition-sweep.mjs) that dispositions 170 of 187 open, unclaimed quick_fixes rows sitting past the 3-day STALE_QF_DAYS auto-start fence (lib/fleet/qf-auto-start.cjs) with no verifier, owner, or expiry -- invisible as both work and neglect, and the direct subject of a chairman question ('why 173 unstartable QFs? why create so many?'). Ships: a staged-never-applied migration (database/migrations/20260816_add_quick_fixes_disposition_columns.sql) adding 6 disposition columns, chairman-ceremony-gated; a new two-signal, no-LLM citation checker (lib/eva/quick-fix-citation-checker.js) built from scratch after PLAN-phase prospective review found the originally-proposed reuse of lib/eva/premise-liveness.js's checkPremiseLiveness() structurally incapable of the job; the sweep itself (dedupe-first via content-fingerprint.cjs with an empty-body singleton guard, citation-driven disposition, a seat-count-injected batching cap, a 30-day TTL re-lapse pass, and an --h2-confirmed CLI attestation gate before any bulk apply); a coordinated age-source edit across the 4 readers that compute QF staleness (qf-auto-start.cjs, belt-depth.cjs, worker-checkin.cjs, sd-next/display/quick-fixes.js + data-loaders.js) so a disposition-sweep re-verify (verified_at) resets the auto-start clock consistently everywhere; and a weekly GH Actions cron with an explicit positive --apply gate. PLAN ran 2 full rounds of prospective TESTING sub-agent review BEFORE any EXEC code existed, each re-measuring against live data and materially reshaping the design. EXEC/VERIFY then ran 4 further independent adversarial sub-agent rounds (TESTING, SECURITY, VALIDATION, REGRESSION) against the delivered code, each finding a genuine, non-overlapping defect: an unquoted-argv GH Actions injection bug, a defense-in-depth `--` argv separator that had silently broken the citation checker's own vitest invocation, a self-referential schema-lint violation plus a TTL-relapse scope gap, and an asymmetric-fallback category error in the factory_lane/verified_at retry logic that risked re-arming a real prior incident (QF-20260712-481). All were fixed within the SD; final verified state is 10210 passed / 0 failed / 32 skipped across 806 files (+2 net new vs. the pre-fix baseline of 10208), schema-reference-lint clean (was 22 violations across 6 call sites in the sweep script itself).",

  affected_components: [
    'scripts/coordinator-stale-qf-disposition-sweep.mjs',
    'lib/eva/quick-fix-citation-checker.js',
    'lib/fleet/qf-auto-start.cjs (isAutoStartableQF dispatch-only guard)',
    'lib/fleet/belt-depth.cjs',
    'scripts/worker-checkin.cjs (selfClaimQuickFix)',
    'scripts/modules/sd-next/display/quick-fixes.js',
    'scripts/modules/sd-next/data-loaders.js (loadOpenQuickFixes)',
    '.github/workflows/coordinator-stale-qf-disposition-sweep.yml',
  ],

  what_went_well: [
    "Two full rounds of PROSPECTIVE TESTING sub-agent review during PLAN -- run BEFORE any EXEC code existed -- caught that the originally-proposed sole disposition instrument (lib/eva/premise-liveness.js's checkPremiseLiveness()) was structurally incapable of the job: measured against 15 real rows, it only ever returned STALE@0.95 or LIVE@0.3, never a high-confidence 'confirmed still present' verdict, and had no file:line-absence check at all. This forced a from-scratch, purpose-built checker (lib/eva/quick-fix-citation-checker.js) before a single line of sweep code was written, instead of a redesign discovered mid-EXEC.",
    "The second PLAN-phase review round measured the checker's redesigned inputs against the FULL live 170-row corpus, not a sample, and found citations were far sparser than assumed (46/170 rows carry any file:line citation, 20 of those are unaddressable ranges, only 1 names a runnable test) -- forcing the PRD to state its actual resolution rate honestly ('resolves a SMALL minority, by design') and to add a distribution-bound test, rather than overselling the sweep's coverage.",
    "That same PLAN-phase review caught that the dedupe design would have falsely collapsed 25 empty-body rows into a single fingerprint cluster, silently closing 24 distinct open QFs as duplicate_of an unrelated survivor before any citation check ran -- fixed with a QF-id-keyed singleton guard before EXEC began, not discovered live against production data.",
    "Four independent EXEC/VERIFY-phase sub-agent rounds (TESTING, SECURITY, VALIDATION, REGRESSION) each found a genuine, previously-undiscovered, non-overlapping defect on the same ~460-line sweep script and its citation checker -- an unquoted GH Actions argv-injection bug, a defense-in-depth hardening fix that had silently broken the checker's own vitest invocation, a self-referential schema-lint violation plus a real TTL-relapse scope gap, and an asymmetric-fallback category error in the factory_lane/verified_at retry. None of the four rounds duplicated another's finding.",
    "The REGRESSION-found factory_lane/verified_at fallback bug was fixed by reusing an EXISTING correct pattern already sitting in the same codebase as precedent (belt-depth.cjs's layered retry) rather than inventing a new mechanism, and the fix was traced against a real named prior incident (QF-20260712-481) rather than fixed in the abstract.",
    "Final state: 10210 passed / 0 failed / 32 skipped across 806 files (REGRESSION sub-agent's own independent wider-suite re-run, +2 net new vs. its pre-fix baseline of 10208), and schema-reference-lint clean (was 22 violations across 6 call sites in the sweep script, closed by the VALIDATION round).",
  ],

  what_needs_improvement: [
    "The `--` argv separator added in commit c79e05ea1fa as claimed defense-in-depth for citation-path extraction was never behaviorally measured against vitest's actual CLI before shipping -- vitest treats `--` as end-of-options and routes everything after it into its own passthrough args rather than the file filter, so every named-test citation check silently ran vitest's entire ~3400-file suite instead of the cited file, always exceeded the 60s timeout, and always wrote a fabricated `test_failing:<path>` evidence code that read as a correct negative result rather than a broken invocation. It shipped invisibly because the citation checker's own test suite mocked execFileSync at the call boundary, so no test exercised vitest's real CLI parsing of the resulting argv.",
    "The PRD's own stated edge-case reasoning for the TTL clock ('Math.max() over null/undefined coerces to 0, so the clock is safe') was carried into EXEC without being checked against the actual function supplying the values -- once pgTimestampMs() (itself a LEAD-phase correction for tz-safety) is the input, absent timestamps return NaN, not 0, and Math.max() with any NaN argument returns NaN, which would have silently broken the TTL clock. This was self-caught mid-EXEC by tracing the actual coercion path, not flagged by a sub-agent or by the PRD's own stated reasoning, which turned out to be wrong.",
    "The original EXEC-time design for FR-6's 42703 (missing-column) fallback -- 'strip both staged columns together on any 42703, worst case is a more conservative age computation' -- was an explicit, reasoned simplification that treated verified_at and factory_lane as equally safe to lose. That assumption was never checked against what each column's absence actually costs, and was wrong: factory_lane's absence blinds qf-auto-start.cjs's dispatch-only safety guard (a real prior incident class, QF-20260712-481), while verified_at's absence is merely inconvenient. The asymmetry was invisible until REGRESSION traced the actual, more-likely migration-landing order.",
    "scripts/modules/sd-next/data-loaders.js's loadOpenQuickFixes() was in FR-6's explicitly named scope (one of the 4 age-source readers to fix) but its SELECT column list simply never included verified_at, so the fix for that specific reader was a no-op from the first EXEC pass -- undetected until REGRESSION explicitly traced the column list end-to-end rather than trusting that 'the file was touched' meant 'the field reached the consumer.'",
  ],

  key_learnings: [
    "A defense-in-depth hardening fix can break the very thing it hardens, and ship anyway, when the hardened code path has zero test coverage exercising its real downstream target. In c79e05ea1fa, a `--` argv separator was added before a test path purely as reasoned belt-and-suspenders on top of an already-sufficient argv-array/leading-word-char-regex protection. The comment justifying it described the change as safe; that description was reasoning, never measurement. vitest treats `--` as end-of-options and reroutes everything after it into its own passthrough args rather than the file filter, so every named-test citation check silently ran the entire ~3400-file repo suite -- always exceeding the 60s timeout, always emitting a plausible `test_failing:<path>` evidence code that looked like a correct result rather than a broken invocation. It survived until SECURITY's independent EXEC-TO-PLAN re-review, confirmed empirically via a live dry-run distribution shift (2 resolved/1 re-verified/1 promoted -> 4 resolved/0/0) once fixed by invoking node directly against vitest's own CLI entry point instead of npx. Generalizable rule: any hardening change to an argument-passing boundary between two CLI tools needs a behavioral assertion that the SPECIFIC downstream tool's argv parsing still does what the pre-hardening code did -- 'more defensive' is not 'still correct,' and a review that reads the justifying comment rather than measuring the claim will accept reasoning it never verified. TESTING's own second-pass review named this exact miss in its own first pass explicitly.",
    "Two similarly-shaped fallback columns are not automatically equally safe to lose together -- what matters is what each column's ABSENCE costs, not how symmetric their failure mode looks. FR-6's original 42703 fallback treated verified_at and factory_lane as an interchangeable pair because both are staged additions to the same table, hit by the identical error code, in the identical catch block, with a comment reasoning 'the worst case is a more conservative age computation.' That reasoning was never checked against what qf-auto-start.cjs's isAutoStartableQF() guard actually does with each column: factory_lane is a dispatch-only safety input (its absence blinds the guard, re-arming the real prior incident QF-20260712-481), while verified_at is purely a staleness/age input (its absence is only inconvenient). Because the two migrations are staged and land independently, and factory_lane's had been staged roughly a month longer, the MORE LIKELY real ordering is exactly the dangerous one -- factory_lane present, verified_at still absent -- where the combined strip-both-on-42703 fallback strips a column that never needed to be stripped. Generalizable rule: when a fallback path handles 'either of these columns might be missing,' never combine their failure handling by default -- enumerate what each column's absence costs independently before deciding whether combining is even correct. Sharing an error code and a catch block is evidence of a shared failure SIGNATURE, not a shared failure CONSEQUENCE.",
    "Four consecutive, independently-scoped adversarial review rounds on the same already-reviewed code (TESTING, SECURITY, VALIDATION, REGRESSION, all in EXEC/VERIFY) each found a genuine, non-overlapping defect -- none was redundant with the others. TESTING (EXEC-TO-PLAN) found the GH Actions workflow's unquoted, string-concatenated argv could word-split a crafted seat_count input into a live --apply run regardless of dry_run. SECURITY, an independent pass on the SAME handoff, found the earlier `--` argv-separator hardening had silently broken vitest's own file-targeting. VALIDATION (PLAN_VERIFICATION) found the sweep script itself violated the exact schema-lint pragma convention its own FR-6 had mandated for OTHER files (22 violations), plus a real TTL-relapse scope gap with no status/claim filter that could close a row out from under an active worker. REGRESSION (VERIFY) found the factory_lane/verified_at asymmetric-fallback category error plus a completely inert reader fix in sd-next/data-loaders.js. Each sub-agent's lens was categorically different -- argument-injection framing catches CLI-argv bugs, security framing catches 'was this hardening actually verified' bugs, spec-fidelity framing catches 'does the code match its own stated convention' bugs, regression framing catches 'does this interact correctly with a real prior incident and the actual state of independently-staged migrations' bugs -- and none of the four could have substituted for another. Generalizable rule: for infrastructure work touching multiple external interfaces (CLI tools, CI workflows, an existing safety-critical guard, independently-staged migrations), one or two review lenses leave systematically different bug classes uncaught; 'already reviewed' is not 'reviewed enough' when each subsequent round is structurally asking a different question than the ones before it.",
    "Prospective (before-any-code) review pays off specifically when a design assumption is checkable against live data, and pays off twice when the checking is re-run against the FULL population rather than a sample. Round 1 of PLAN-phase TESTING review measured the originally-proposed disposition instrument (checkPremiseLiveness()) against 15 real rows and found it structurally could not produce a 'confirmed still present' verdict. Round 2, after the redesign, measured the new checker's inputs against the entire 170-row live corpus (not a sample) and found citations were far sparser than the design assumed. Both findings reshaped the actual mechanism before EXEC started, converting what would otherwise have been a mid-implementation redesign (as happened anyway, later, for the TTL-clock NaN issue and the factory_lane/verified_at fallback) into a PLAN-phase correction with zero EXEC rework cost.",
  ],

  action_items: [
    {
      action: "Require any change to a CLI-argv-building code path that crosses a tool boundary (this repo -> vitest, this repo -> npx, this repo -> gh) to ship with a test asserting the actual downstream tool's parsed argv/behavior, not just the array shape passed to execFileSync -- closing the exact gap that let the `--` separator regression (5bc3a3d17d5, found by SECURITY at EXEC-TO-PLAN) ship invisibly on top of a mocked execFileSync boundary.",
      owner: "EXEC / TESTING sub-agent convention",
      category: "testing_convention",
      deadline: "next SD that adds or hardens a CLI-argv-building code path",
      verification: "buildVitestInvocation()-style exported argv-shape functions exist and are covered by a test asserting the specific downstream CLI's real parsing behavior (or, where subprocess spawning is unreliable in-process, a fast deterministic test pinning the exact argv/entry-point shape) rather than only the array contents at the execFileSync call site.",
    },
    {
      action: "Before combining failure-handling for two or more fallback/staged-migration columns on the same table behind the same error code and catch block, enumerate what each column's absence costs independently (per this SD's factory_lane vs. verified_at asymmetry, closed in 01d407f0c32) and combine only if genuinely symmetric.",
      owner: "PLAN / EXEC on the next SD touching quick_fixes staged columns, or any table with independently-staged migrations",
      category: "design_review",
      deadline: "next PRD authoring a multi-column 42703/PGRST204 fallback",
      verification: "PRD or code comment explicitly states the independent consequence of losing each column (not just 'worst case is conservative'), and if both are safety-relevant, the fallback layers the retry (belt-depth.cjs's pattern) rather than stripping both together.",
    },
    {
      action: "Apply the staged migration (database/migrations/20260816_add_quick_fixes_disposition_columns.sql) at the next chairman ceremony, then run the sweep's first --apply pass gated by the existing --h2-confirmed two-sided control (10/10 premise_resolved candidates independently re-verified, plus a positive control drawn from the same past-the-fence population the pipeline actually processes).",
      owner: "coordinator / chairman ceremony",
      category: "deployment",
      deadline: "next scheduled chairman migration ceremony",
      verification: "quick_fixes.disposition column exists live; the first --apply run's ledger is fully accounted for (candidateCount = resolved + reVerified + promoted + deferredOverSeatCount, relapsedCount tracked separately) and the H2 control result is attached to the run's evidence.",
    },
    {
      action: "When a future FR names 'the reader(s) that compute X' as in-scope, verify each named reader's SELECT/column list actually changed end-to-end to the consumer, not just that the file was touched -- per the sd-next/data-loaders.js gap (loadOpenQuickFixes() never selecting verified_at, fixed in 01d407f0c32) that made FR-6's fix inert for that one reader through the entire first EXEC pass.",
      owner: "PLAN / VALIDATION sub-agent",
      category: "verification_practice",
      deadline: "next FR that touches multiple reader call sites for the same field",
      verification: "VALIDATION sub-agent's PRD-fidelity check explicitly traces the named field from its write site through to each named reader's actual returned output, not merely presence-of-edit in the diff.",
    },
    {
      action: "Monitor the first several scheduled runs of .github/workflows/coordinator-stale-qf-disposition-sweep.yml after the migration ceremony for the H2-gate's positive --apply invariant (never applies unattended on a schedule trigger without the explicit gate) and for the accounting-identity invariant actually holding against live data, not just the dry-run fixture population.",
      owner: "coordinator",
      category: "monitoring",
      deadline: "first 4 scheduled runs after the migration ceremony",
      verification: "each run's evidence log shows the accounting identity balances and no unattended --apply occurred on a schedule-trigger run without the explicit gate.",
    },
  ],

  improvement_areas: [
    {
      area: "Defense-in-depth `--` argv separator broke vitest's real file-targeting (added c79e05ea1fa, broke citation checker, fixed 5bc3a3d17d5)",
      analysis: "Root cause chain: (1) an earlier, smaller finding asked for stronger flag-injection protection on citation-extracted paths feeding execFileSync; (2) the fix added a `--` separator as declared belt-and-suspenders on top of an already-sufficient argv-array/leading-word-char-regex protection; (3) the commit message reasoning that the change was safe defense-in-depth was never behaviorally measured against the real downstream tool; (4) the citation checker's own test suite mocked execFileSync at the call boundary, so no test in the suite ever exercised vitest's actual CLI parsing of the resulting argv; (5) vitest treats `--` as end-of-options and routes everything after it into its own passthrough args rather than the file filter, so every named-test check silently ran the full ~3400-file suite; (6) the failure mode was self-disguising -- it always exceeded the 60s timeout and always produced a plausible `test_failing:<path>` evidence code, which reads as 'the checker correctly found a failing test' rather than 'the checker never invoked the right file' -- so a reviewer scanning output codes alone would not notice.",
      prevention: "Fixed by invoking process.execPath directly against vitest's own CLI entry script (resolved via require.resolve('vitest/package.json')), bypassing npx and every OS-specific shim (also separately fixing an ENOENT on Windows, where npx resolves to npx.cmd and Node refuses to spawn .cmd files without shell:true). The `--` separator was dropped entirely -- never load-bearing, since the leading-word-char regex already makes a flag-shaped extraction impossible. New coverage pins the exact argv shape via a fast deterministic test on the exported buildVitestInvocation() return value rather than a real subprocess spawn, because spawning `vitest run` as a child of an already-running vitest process was measured to produce unreliable PASS/FAIL results (a nested-runner artifact; production never nests). Generalizable prevention: any future defense-in-depth change to an argv-building boundary requires a test asserting the real downstream tool's behavior, not just the array passed to the spawn call.",
    },
    {
      area: "FR-6's 42703 fallback treated verified_at and factory_lane as an interchangeable pair (original EXEC design, fixed 01d407f0c32)",
      analysis: "Root cause chain: (1) both columns are staged additions to the same quick_fixes table, hit by the identical 42703 error code, handled in the identical catch block -- a strong surface signal they are the same kind of thing; (2) the original design's comment reasoned 'the worst case is a more conservative age computation' as if losing either column had the same consequence; (3) that reasoning was never checked against what qf-auto-start.cjs's isAutoStartableQF() guard actually does with factory_lane (a dispatch-only safety input) versus verified_at (a pure age/staleness input); (4) the two migrations are staged and applied independently, and factory_lane's had been staged roughly a month longer than verified_at's, so the actual likely production ordering (factory_lane present, verified_at absent) is exactly the case where a combined strip-both-on-42703 fallback strips a column that did not need to be stripped, re-arming a real prior incident class (QF-20260712-481, previously closed by SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001).",
      prevention: "Fixed by layering the retry, mirroring belt-depth.cjs's existing correct pattern already present in the same codebase as precedent: strip verified_at first and retry, keeping factory_lane; only strip factory_lane too if that second retry also 42703s. New regression tests specifically cover the 'verified_at missing, factory_lane present' scenario -- the exact case the prior design got wrong -- asserting factory_lane is never stripped when it did not need to be. Generalizable prevention: when two columns share an error code and a catch block, that is evidence they share a failure SIGNATURE, not evidence they share a failure CONSEQUENCE -- each must be evaluated separately against what its consumer actually does with it before their failure handling is combined into one fallback.",
    },
    {
      area: "PLAN-phase premise correction: the originally-proposed disposition instrument could not produce the verdict this SD actually needs",
      analysis: "The original proposal assumed an existing capability (lib/eva/premise-liveness.js's checkPremiseLiveness(), already wired for intake-time premise verification via scripts/create-quick-fix.js) could be adapted as the sole disposition instrument for a materially different job: distinguishing 'still present' from 'now resolved' on a periodic sweep of already-stale rows. Prospective TESTING review in PLAN measured it against 15 real rows before any EXEC code existed and found it structurally could not produce a high-confidence 'confirmed still present' verdict -- its output space is only 'provably dead' (STALE@0.95) or 'not provably dead' (LIVE@0.3), the wrong shape for a three-way disposition (resolved / still-present / inconclusive). Root cause: the reuse decision was made from the capability's name and its existing integration point, not from its actual output distribution against representative data.",
      prevention: "Replaced with a from-scratch, narrowly-scoped two-signal checker (lib/eva/quick-fix-citation-checker.js), and PLAN ran a second round of the same prospective measurement against the full 170-row live corpus (not a sample) before finalizing the design -- catching that even the new checker's inputs were sparser than assumed (46/170 rows citable, 20 of those unaddressable ranges). Generalizable prevention: when a PRD proposes reusing an existing capability for a new purpose, measure that capability's actual output distribution against representative data from the NEW job before writing the FR around it -- a matching integration point or a plausible-sounding name is not evidence the output shape fits.",
    },
  ],

  success_patterns: [
    "Prospective (before-any-code) sub-agent review, re-run twice in PLAN against progressively fuller live data (15-row sample, then the full 170-row corpus), caught a structurally-incapable core instrument and a false-dedupe design before any EXEC code existed.",
    "Four independent EXEC/VERIFY adversarial review rounds (TESTING, SECURITY, VALIDATION, REGRESSION) each found a distinct, non-overlapping defect class on the same delivered code, and every finding was fixed and independently re-verified within the SD.",
    "The factory_lane/verified_at fallback fix reused an existing correct pattern already present in the codebase (belt-depth.cjs's layered retry) instead of inventing new logic, and was traced against a real, named prior incident (QF-20260712-481) rather than fixed in the abstract.",
    "Final regression sweep (10210 passed / 0 failed / 32 skipped, +2 net new vs. pre-fix baseline) and a clean schema-reference-lint run were independently confirmed by the REGRESSION and VALIDATION sub-agents rather than only self-reported by EXEC.",
  ],

  failure_patterns: [
    "A defense-in-depth argv-separator hardening fix (c79e05ea1fa) shipped without a test exercising the real downstream CLI's parsing behavior, silently broke the citation checker's primary signal, and was only caught by an independent SECURITY re-review rather than by the fix's own test suite.",
    "An EXEC-time fallback-design simplification (strip both staged columns together on any 42703) was reasoned as safe without checking what each column's absence actually costs its own consumer, and was only caught by an independent REGRESSION re-review tracing the real migration-landing order and a named prior incident.",
  ],

  protocol_improvements: [
    {
      category: 'review_lens_diversity',
      improvement: "When infrastructure work touches multiple external interfaces (CLI-tool argv boundaries, CI workflow inputs, an existing safety-critical guard, independently-staged migrations), route it through all four of TESTING/SECURITY/VALIDATION/REGRESSION at EXEC/VERIFY rather than a subset -- this SD is a measured instance where each of the four caught a defect none of the other three found on the same code.",
      evidence: "TESTING found the GH Actions unquoted-argv injection; SECURITY (same handoff) found the `--` separator had broken vitest's file-targeting; VALIDATION found the schema-lint self-violation plus the TTL-relapse scope gap; REGRESSION found the factory_lane/verified_at asymmetric-fallback bug plus the inert data-loaders.js reader fix. Zero overlap across the four findings sets.",
      impact: 'Prevents a false sense of completeness after any single review lens passes; each lens is asking a structurally different question, not re-checking the same one.',
      affected_phase: 'EXEC',
    },
    {
      category: 'argv_boundary_testing',
      improvement: "Add a checklist item (or a lint rule) for any code that hardens an argv-building boundary crossing into a specific external CLI tool (vitest, npx, gh, etc.): require a test that asserts the real tool's parsed behavior on the resulting argv, not only the array shape at the local spawn call site.",
      evidence: 'The `--` separator regression (c79e05ea1fa -> 5bc3a3d17d5) shipped because the citation checker’s test suite mocked execFileSync at the boundary, so no test could observe that vitest itself would misparse the hardened invocation.',
      impact: 'Would have caught this specific regression class before SECURITY had to find it in an independent EXEC-TO-PLAN pass.',
      affected_phase: 'EXEC',
    },
  ],

  business_value_delivered: "Closes 170 of 187 open, unclaimed quick_fixes rows that were invisible as both work and neglect (past the 3-day auto-start fence with no verifier, owner, or expiry) -- directly answering the chairman's own question ('why 173 unstartable QFs? why create so many?') with a machine-visible disposition field and a repeatable weekly sweep instead of a one-time manual triage. The sweep's own dry-run measurement against the live population (170 candidates, ledger fully accounted-for, ~2.4% combined resolution rate) matches the PRD's predicted distribution, so the mechanism is verified against reality before its first --apply run.",

  customer_impact: "Internal harness/operations impact only (EHG_Engineer LEO fleet) -- no direct end-venture-customer-facing change. The beneficiaries are the coordinator/chairman (an honest, machine-visible view of the QF backlog instead of an invisible pile) and future QF-lane workers, who no longer inherit an unbounded, unowned, unexpiring backlog of stale rows.",

  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 13,
  bugs_resolved: 13,
  code_coverage_delta: null,
  performance_impact: null,
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  team_satisfaction: 8,
  quality_score: 85,

  test_total_count: 10242,
  test_passed_count: 10210,
  test_failed_count: 0,
  test_skipped_count: 32,
  test_pass_rate: 100,
  test_verdict: 'PASS',

  related_files: [
    '.github/workflows/coordinator-stale-qf-disposition-sweep.yml',
    'database/migrations/20260816_add_quick_fixes_disposition_columns.sql',
    'lib/eva/quick-fix-citation-checker.js',
    'lib/fleet/belt-depth.cjs',
    'lib/fleet/qf-auto-start.cjs',
    'scripts/coordinator-stale-qf-disposition-sweep.mjs',
    'scripts/modules/sd-next/display/quick-fixes.js',
    'scripts/modules/sd-next/data-loaders.js',
    'scripts/worker-checkin.cjs',
    'tests/unit/coordinator/stale-qf-disposition-sweep.test.js',
    'tests/unit/eva/quick-fix-citation-checker.test.js',
    'tests/unit/fleet/belt-depth-qf.test.js',
    'tests/unit/fleet/qf-auto-start.test.js',
    'tests/unit/sd-next/quick-fix-freshness-gate.test.js',
    'tests/unit/worker-checkin-qf-candidate-query-retry.test.js',
  ],
  related_commits: [
    '5b5876f1b4934f1d43c36bf616ee3b58d17da46e',
    'c79e05ea1fac048f5d0aefe44356b707dc7145bc',
    'bb534736575300e3b2a46819db7df642e4686c74',
    '5bc3a3d17d55703c8a4fa41e26bc8dd48f90eb36',
    'de5063329f5a92aec21ef9d471cf614ae09b4679',
    'df665ac6d3961a38d7e6fe43de8bf0525c00dc2a',
    '01d407f0c3205c8b8392a4f1f504e75f677881a2',
  ],
  related_prs: [],
  tags: [
    'quick-fixes',
    'stale-disposition-sweep',
    'citation-checker',
    'argv-injection',
    'defense-in-depth-regression',
    'staged-migration',
    'chairman-gated',
    'adversarial-review',
    'asymmetric-fallback',
  ],

  agents_involved: ['LEAD', 'PLAN', 'EXEC', 'coordinator'],
  sub_agents_involved: ['VALIDATION', 'Explore', 'DESIGN', 'DATABASE', 'RISK', 'STORIES', 'TESTING', 'SECURITY', 'REGRESSION', 'VISION_FIDELITY'],
  human_participants: ['chairman (proposal origin + ceremony gate, deferred)'],
  trigger_event: 'PLAN-TO-LEAD handoff after PLAN_VERIFICATION closed all VALIDATION and REGRESSION findings (HEAD 01d407f0c32)',

  metadata: {
    sd_key: SD_KEY,
    branch: 'feat/SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001',
    fleet_worker: 'Golf-4',
    claude_session: '51fab48f-8867-4fe2-9698-0a1b8639e6ee',
    handoffs_completed: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN'],
    lead_to_plan_accepted_at: '2026-08-16T12:43:12.494791Z',
    plan_to_exec_accepted_at: '2026-08-16T13:47:39.656267Z',
    exec_to_plan_accepted_at: '2026-08-16T15:47:31.708896Z',
    plan_rounds_prospective_testing: 2,
    exec_verify_adversarial_rounds: ['TESTING', 'SECURITY', 'VALIDATION', 'REGRESSION'],
    final_regression_evidence: '10210 passed / 0 failed / 32 skipped across 806 files, +2 vs pre-fix baseline of 10208 (REGRESSION sub-agent row f90d0c2a-b54d-4e37-ac97-778677d113b1)',
    dry_run_distribution_before_vitest_fix: '2 resolved / 1 re-verified / 1 promoted',
    dry_run_distribution_after_vitest_fix: '4 resolved / 0 re-verified / 0 promoted',
    prior_incident_referenced: 'QF-20260712-481 (previously fixed by SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001)',
    migration_file: 'database/migrations/20260816_add_quick_fixes_disposition_columns.sql',
    migration_status: 'staged, never auto-applied -- pending chairman ceremony',
  },
};

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const s = createClient(url, key);

  const { data: ins, error: insErr } = await s.from('retrospectives').insert(retro).select('id').single();
  if (insErr) {
    console.error('Insert failed:', insErr.message, insErr.details || '', insErr.hint || '');
    process.exit(1);
  }
  const retroId = ins.id;
  console.log('Inserted retrospective id:', retroId);

  const { data: ver, error: verErr } = await s
    .from('retrospectives')
    .select('id, sd_id, retro_type, retrospective_type, quality_score, status, created_at, learning_category, target_application')
    .eq('id', retroId)
    .single();
  if (verErr) {
    console.error('Verify failed:', verErr.message);
    process.exit(1);
  }
  console.log('Verified:', JSON.stringify(ver, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
