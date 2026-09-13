import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PRD_ID = 'PRD-SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H';

const { data: prd, error } = await s.from('product_requirements_v2')
  .select('functional_requirements,test_scenarios')
  .eq('id', PRD_ID)
  .single();
if (error) throw error;

const frs = prd.functional_requirements;
const byId = Object.fromEntries(frs.map(fr => [fr.id, fr]));

// FR-1: tighten to the 24->25 PAIR (not a single-side "reference stage 24"), add the 3rd
// stale site, and require the existing dead/bug-encoding integration test to be updated.
byId['FR-1'].description += " CORRECTION (PLAN-phase TESTING review): PLAN-phase re-verification found the live RPC fn_advance_venture_stage ALREADY enforces p_from_stage=24 AND p_to_stage=25 for the product_review query -- this is not 'a reader lagging a constant', it is a live disagreement between TWO canonical advance paths (the RPC vs this worker choke point). A THIRD stale site was found in the same review: lib/eva/stage-execution-worker.js:3053, a log string reading 'from Stage 23 to Stage 24' -- fix this too. Additionally, tests/integration/eva/chairman-product-review-gate-realdb.test.js currently SEEDS decisions at lifecycle_stage:23 and calls callAdvance(venture,23,24) -- it both encodes the bug AND contradicts the RPC it calls; it must be updated in the SAME change as the choke-point fix, not left as-is.";
byId['FR-1'].acceptance_criteria[0] = "The choke point's fromStage/toStage comparison and its lifecycle_stage query both reference the pair 24->25 (or the imported PRODUCT_REVIEW_STAGE constant), not 23->24 -- tightened from 'stage 24' to the explicit pair per PLAN-phase re-verification.";
byId['FR-1'].acceptance_criteria.push("The log string at stage-execution-worker.js:3053 ('from Stage 23 to Stage 24') is corrected to match.");
byId['FR-1'].acceptance_criteria.push("tests/integration/eva/chairman-product-review-gate-realdb.test.js is updated in the same change (it currently seeds decisions at lifecycle_stage:23 and asserts stage 23 is gate_type=kill, both stale) -- and the PRD's own D1 finding (see FR-7 note) about the DB test tier being CI-dead must be resolved or explicitly worked around so this test's assertions actually execute in CI, not silently skip.");

// FR-2: note it's proven zero-yield by construction, note the second (hard-throw) failure
// mode, and correct the likely fix target to moving CROSS_STAGE_DEPS[24]'s list to key 25.
byId['FR-2'].description += " CORRECTION (PLAN-phase TESTING review, proven not inferred): CROSS_STAGE_DEPS[25]=[23,24] feeds fetchUpstreamArtifacts, which keys results as `stage${lifecycle_stage}Data` -- so at stage 25 ONLY stage23Data/stage24Data can EVER exist; stage21Data/stage22Data are structurally undefined by construction, not merely empty under some conditions. SECOND FAILURE MODE found: since live stage 23 is dedicated_venture_uat (not launch-readiness), stage23Data?.verdict is a UAT artifact and the analyzer likely HARD-THROWS at its own line ~56 rather than merely emptying channels_to_activate -- verify which failure mode actually occurs before writing the fix. LIKELY FIX TARGET (found during the same review): CROSS_STAGE_DEPS key 24 currently carries the PRE-RENUMBER 'Go Live' dependency list [1,21,22,23] -- the fix is most likely moving that dependency list from key 24 to key 25 (where go_live now lives), not inventing a new list. Implement this together with FR-5 in the same stage-contracts.js edit.";

// FR-3: re-scope to documentation-only. The lines are COMMENTS, not executable code --
// remove the untestable-without-becoming-vacuous unit-test AC (D3) and add a deliberate
// disposition for the adjacent RESERVED_CHAIRMAN_STAGES/stage-25-auto-approve finding.
byId['FR-3'].description = byId['FR-3'].description.replace(
  "Fix both sets to match the live venture_stages table exactly.",
  "CORRECTION (PLAN-phase TESTING review): lines 34/36 are COMMENT LINES in a doc block, not executable code -- GATE_BEHAVIOR_MATRIX is keyed by gate_type STRING, and no exported stage-number set exists anywhere in this file to test. Re-scoped to DOCUMENTATION-ONLY: fix the comment text to match live venture_stages (kill={3,5,13,24}, promotion includes {10,16,17,18,19,25,26}, both confirmed against the live table), with NO unit-test acceptance criterion (a regex-match-on-comment-text test is the exact zero-yield shape that let 9 stale sites survive a full renumber undetected -- see tests/unit/activation-invariant/venture-uat-stage-renumber-chain.test.js's existing, passing, comment-matching tests as the cautionary precedent, not a pattern to copy)."
);
byId['FR-3'].acceptance_criteria = [
  "The comment text at autonomy-model.js:34,36 (and RESERVED_CHAIRMAN_STAGES if still empty in the renumbered band) is corrected to match the live venture_stages table exactly -- documentation fix only, no behavioral/test claim.",
  "Deliberately dispositioned (not silently skipped): live stage 25 (go_live) is gate_type=promotion -> auto_approve at autonomy level L2+, and is NOT in RESERVED_CHAIRMAN_STAGES -- given chairman ratification #13 (no real-customer outreach before go-live, mock-first), confirm this is intentional (go-live itself isn't outreach) or escalate as a finding; do not silently 'fix' this without a written decision.",
];

// FR-4: add the second stale label (event_source) found in the same review.
byId['FR-4'].description += " A second stale label in the same telemetry row was found during PLAN-phase review: event_source:'stage-23-launch-readiness' at line ~226 -- fix both labels together.";

// FR-5: expand scope to the full tail-shift, STAGE_CONTRACTS parallel map, and the
// existing test file's hardcoded stage count; add a non-vacuous-proof AC.
byId['FR-5'].description += " CORRECTION (PLAN-phase TESTING review, scope larger than 'add key 27'): the whole CROSS_STAGE_DEPS tail is shifted, not just missing a key -- key 24 carries the PRE-RENUMBER 'Go Live' deps [1,21,22,23] (see FR-2's likely fix target), and key 25 is commented 'Launch readiness (chairman gate)' while live stage 25 is go_live. A PARALLEL map, STAGE_CONTRACTS, is ALSO missing key 27 with the same vacuous-pass defect (getContract(27)/validatePreStage(27)/validatePostStage(27) all silently no-op). tests/unit/eva/stage-contracts.test.js:15 hardcodes the assertion text 'covers all 26 stages' and must be updated to 27.";
byId['FR-5'].acceptance_criteria.push("The fix is proven non-vacuous by a discriminating test: pass a supabase stub that THROWS if .from() is called into validateDependencyChain(27) (and the equivalent STAGE_CONTRACTS accessors) -- a vacuous pass returns a clean {valid:true,...} result WITHOUT ever touching the stub, which is exactly how the pre-fix vacuity was proven during PLAN review; the test must fail loudly (by the stub throwing) if the fix regresses to vacuous.");
byId['FR-5'].acceptance_criteria.push("STAGE_CONTRACTS gains the equivalent key-27 fix alongside CROSS_STAGE_DEPS, and tests/unit/eva/stage-contracts.test.js:15's 'covers all 26 stages' assertion text is updated to 27.");

// FR-6: expand scope -- PIPELINE_STAGES is a fully fictional table needing full replacement.
byId['FR-6'].description += " CORRECTION (PLAN-phase TESTING review, scope larger than framed): scripts/governance-stages.js:22-48's PIPELINE_STAGES is a 25-row name table that is ENTIRELY FICTIONAL against the live table (e.g. 'Ideation'/'Research'/.../'Expansion'/'Maturity'/'Exit Strategy' vs the real 'draft_idea'/'ai_review'/.../'go_live'/'post_launch_review'/'growth_playbook') -- 'match the live table' means replacing all 27 rows, not patching a few stale numbers.";

// FR-7: replace the naive positive-assertion AC with the 3-way error-code discriminator,
// correct the "no committed test exists" premise, and name the CI-tier problem explicitly.
byId['FR-7'].description += " CORRECTIONS (PLAN-phase TESTING review, both independently re-verified live/read-only): (1) A registered stamp does NOT simply 'succeed' on a real venture write -- an UNRELATED trigger, enforce_stage_advancement_artifact_gate, rejects first with error code 23514 (an artifact-gate check, a different invariant than the writer-identity check this FR covers). A test asserting bare success would fail for the wrong reason; the correct assertion is the ERROR-CODE DISCRIMINATOR: unstamped write -> SVCW1 ('missing canonical-writer stamp'); write with an UNREGISTERED stamp value -> ALSO SVCW1 but with a distinct message ('stamp value not present in canonical-writer registry') -- this third case proves the registry lookup is live, not merely a NOT NULL check; write with a REGISTERED stamp -> anything EXCEPT SVCW1 (a 23514 rejection from the unrelated artifact gate is a PASS for this invariant, not a failure). (2) The premise 'today it exists only as ad-hoc uncommitted scripts' is partly stale: tests/ddl/ventures-canonical-writer-choke-ddl.db.test.js already exists and is wired into .github/workflows/drive-reports-ddl.yml:107 -- but that test's OWN header discloses it runs against a hand-stubbed narrow schema with the migration re-applied, disclaims proof of production firing order, and states 'COULD NOT BE EXECUTED DURING AUTHORING ... Treat this as UNVERIFIED until CI runs it once.' The real gap is 'no test against the LIVE DEPLOYED trigger', not 'no committed test at all.' SEPARATELY, and load-bearing for whether ANY new db-tier test in this SD provides real CI signal: the `db` vitest tier was measured DEAD in CI during this review -- a real run against it returned 'SKIPPED at runtime -- no designated non-production target' with 0 executed / 0 passed / 7 pending and exit code 0 (green while asserting nothing). This SD MUST explicitly name which test tier its new/updated tests run under and prove (not assume) that tier actually executes in CI before claiming FR-1's or FR-7's regression coverage is real.";
byId['FR-7'].acceptance_criteria[0] = "A committed test asserts the 3-way error-code discriminator against the LIVE deployed trigger: unstamped write -> SVCW1 ('missing canonical-writer stamp'); write with an unregistered stamp value -> SVCW1 with the distinct 'stamp value not present in canonical-writer registry' message; write with a registered stamp -> NOT SVCW1 (a 23514 rejection from the separate artifact-gate trigger is an acceptable pass for THIS invariant). All three cases run inside a BEGIN...ROLLBACK that never commits.";
byId['FR-7'].acceptance_criteria.push("The test explicitly runs under a vitest tier PROVEN (not assumed) to execute in CI -- if the `db` tier is used, its CI-execution is verified directly (not inferred from the test merely existing), given this review measured that tier SKIPPING silently with exit code 0 in at least one configuration.");

// FR-8: correct call-site count from 8 to 12, and flag the work_type clobbering issue.
byId['FR-8'].description = byId['FR-8'].description.replace(
  "Confirmed 8 non-advancing call sites where this is wrong: review-blocked (~1453), chairman-gate-blocked (~1505), killed (~1512), failed (~1543), governance-blocked (~1619), HELD (~1631), filter STOP (~1642), REQUIRE_REVIEW (~1657) -- line numbers approximate, re-grep at EXEC time since the file has likely shifted since LEAD-phase measurement.",
  "CORRECTION (PLAN-phase TESTING review, line numbers confirmed EXACT at current HEAD, no drift): 8 non-advancing call sites are wrong -- review-blocked (1453), chairman-gate-blocked (1505), killed (1512), failed (1543), governance-blocked (1619), HELD (1631), filter STOP (1642), REQUIRE_REVIEW (1657). FOUR MORE call sites (1934, 1942, 1959, 1967) are legitimate completions that a signature change to _writeHealthScore will still touch -- total 12 call sites to update, not 8, even though only the first 8 are currently WRONG. Also found: the same upsert clobbers work_type to 'artifact_only' unconditionally -- a stage_status-only fix that doesn't also address this will keep overwriting genuine sd_required/automated_check work_type values at those same 8 wrong call sites."
);
byId['FR-8'].acceptance_criteria.push("All 12 call sites (the 8 wrong ones plus the 4 legitimate-completion ones a signature change also touches) are updated consistently; work_type is no longer unconditionally clobbered to 'artifact_only' -- it reflects the real value for each call site.");

const tss = prd.test_scenarios;
const tsById = Object.fromEntries(tss.map(ts => [ts.id, ts]));
tsById['TS-3'].expected = "Documentation-only: the comment text matches the live venture_stages table exactly. No test asserts this programmatically (re-scoped per PLAN-phase TESTING review -- FR-3's lines are comments, not executable code, and a regex-on-comment-text test is the exact zero-yield shape this SD exists to eliminate).";
tsById['TS-7'].expected = "3-way error-code discriminator against the LIVE deployed trigger, inside a rolled-back transaction: unstamped -> SVCW1 (missing stamp); unregistered stamp -> SVCW1 (stamp not in registry, a distinct message proving the registry lookup is live); registered stamp -> NOT SVCW1 (a 23514 rejection from the separate artifact-gate trigger is an acceptable pass here). Test tier's actual CI execution is verified, not assumed.";
tsById['TS-8'].expected = "stage_status AND work_type both reflect the real exit outcome across all 12 call sites (8 currently-wrong + 4 legitimate-completion sites also touched by the signature change), never a hardcoded 'completed'/'artifact_only' on a non-advancing exit.";

const { error: updErr } = await s.from('product_requirements_v2')
  .update({ functional_requirements: frs, test_scenarios: tss })
  .eq('id', PRD_ID);
if (updErr) throw updErr;
console.log('PRD patched successfully');
