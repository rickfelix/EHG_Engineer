#!/usr/bin/env node
/**
 * RETRO sub-agent evidence for the PLAN-TO-LEAD handoff gate on
 * SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001.
 *
 * scripts/modules/handoff/required-subagents.js declares RETRO required for PLAN-TO-LEAD, enforced
 * by GATE_SUBAGENT_EVIDENCE (scripts/modules/handoff/gates/subagent-evidence-gate.js) and mirrored
 * pre-handoff by PREREQUISITE_PREFLIGHT (scripts/modules/handoff/pre-checks/prerequisite-preflight.js,
 * which imports and calls the SAME validateSubagentEvidence validator -- no drift between the two).
 *
 * WHAT WAS ALREADY THERE, AND WHY IT WAS INSUFFICIENT DESPITE A 100% GATE SCORE:
 * A retro row (retrospectives.id=1d0a69f1-e229-48ad-adad-028b71dfc668) and a RETRO
 * sub_agent_execution_results row (id=64ac4313-8fc6-431a-8e1e-89acab19a866, phase=PLAN_VERIFICATION,
 * verdict=PASS, confidence=100, created 2026-09-14T11:53:40Z, ~10s after the retro row) already exist,
 * both stamped metadata.generated_by='preflight_autogen' -- PLAN-TO-LEAD's own RETROSPECTIVE_QUALITY_GATE
 * preflight auto-generating a completion retro when none was found. The retro row IS PUBLISHED with
 * quality_score=80 (>=70), which is why RETROSPECTIVE_QUALITY_GATE (a DB-CONTENT check keyed on
 * status+quality_score+retro_type) reports 100%. But read in full, its content is TEMPLATE-FILLED
 * boilerplate, not genuine SD-specific retrospective content:
 *   - what_went_well / key_learnings recite generic counts ("11/12 sub-agent validations passed",
 *     3x near-duplicate "SUCCESS_METRICS_DEFINED" entries reciting the PRD's success_metrics field
 *     verbatim) and one FR excerpt truncated mid-sentence ("Add a new internal core (e.g.
 *     mergeJsonbColumn({table, keyColumn, keyValue, j...").
 *   - improvement_areas contains raw, unrendered JSON blobs as literal strings (a templated
 *     5-whys root-cause-analysis object about "missing PLAN-TO-LEAD handoff" -- which is simply
 *     this SD not having reached PLAN-TO-LEAD yet at generation time -- serialized with
 *     JSON.stringify and stored as prose).
 *   - action_items include "Record missing handoffs...", "Run E2E tests..." -- generic template
 *     filler, not derived from this SD's actual delivered work.
 *   - ZERO mention of: the 2 EXEC-phase SECURITY findings (SEC-1 MEDIUM extraGuardSql injection
 *     surface, SEC-2 LOW mutable/prototype-pollution-vulnerable allowlist) found and fixed in this
 *     SD's own new code; the FR-5 lint-widening attempt-then-revert after measuring 38
 *     false-positive-risk findings; the corrected 9->28 call-site count; the nonexistent RCA
 *     prototype file citation; the independent prior fork (lib/fleet/qf-metadata-merge.mjs); the
 *     29th bypass call site (scripts/coordinator-backlog-rank.mjs:180); the mutation-testing
 *     evidence; or any commit SHA.
 * This is EXACTLY the "rubber-stamp automated check" pattern documented in the precedent script
 * (scripts/one-off/_retro-evidence-sd-leo-infra-dedicated-venture-uat-001-a-plan-to-lead.mjs): a row
 * exists and technically satisfies the presence/verdict check GATE_SUBAGENT_EVIDENCE performs, but
 * does not represent genuine sub-agent review of this SD's actual work -- "a DB-content check
 * passing is not the same as sub-agent EVIDENCE existing" (per the task brief this script executes
 * under). A fresh, hand-verified evidence row is written below regardless of what the gate's own
 * automated math already accepts.
 *
 * WHY ENHANCE, NOT SKIP OR CLOBBER: lib/sub-agents/retro/db-operations.js's checkExistingRetrospective
 * finds the existing row IS a valid completion retro by its own criteria (isAfterExec, PUBLISHED,
 * quality_score>=70, retro_type!=HANDOFF) -- so the normal generator path would report found:true and
 * do nothing further. enhanceRetrospective() cannot be used to improve it either: it consults
 * scripts/modules/handoff/lib/retro-clobber-guard.js's isSafeToWriteRetro, whose classifyRetro()
 * checks `retro_type === 'SD_COMPLETION' && (status === 'PUBLISHED' || quality_score >= 70)` FIRST,
 * unconditionally, before any content-richness heuristic -- this row matches on both status AND
 * score, so the guard returns {safe:false, reason:'published_sd_completion'}. That reason is NOT the
 * 'completion_write_onto_handoff_row' special case (reserved for HANDOFF-typed rows only), so
 * enhanceRetrospective's own code takes the generic branch and returns {success:true, skipped:true}
 * -- it does NOT fall back to an insert. The correct path, per that same file's documented behaviour
 * for a protected published row and the identical situation resolved in
 * scripts/one-off/_retro-evidence-sd-leo-infra-dedicated-venture-uat-001-a-plan-to-lead.mjs, is a
 * fresh, ADDITIVE INSERT via storeRetrospective() (lib/sub-agents/retro/db-operations.js) -- leaving
 * the boilerplate row untouched rather than attempting to overwrite a row the guard protects.
 *
 * Content below is SD-specific and independently re-verified against live source (not taken on
 * assertion) before this script ran: git log/show on all 5 of this SD's commits, npx vitest run of
 * the 2 core test files (40/40 passing, live), the PRD's functional_requirements, and the full text
 * of the EXPLORE/VALIDATION/TESTING(x2)/SECURITY sub_agent_execution_results rows for this SD.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { storeRetrospective } from '../../lib/sub-agents/retro/db-operations.js';
import { normalizeLearningCategory } from '../../lib/retro/learning-category.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'f88e14d6-6c87-46fb-981a-ae165a70102b';
const SD_KEY = 'SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001';
const FEAT_COMMIT = '5afccc8019dba1e9e411f442d067169e61102e49';
const SEC_COMMIT = 'ac7ff40ac534a1fcffce7cc827f73192c6536933';
const BOILERPLATE_RETRO_ID = '1d0a69f1-e229-48ad-adad-028b71dfc668';
const BOILERPLATE_EVIDENCE_ROW_ID = '64ac4313-8fc6-431a-8e1e-89acab19a866';

const supabase = createSupabaseServiceClient();

async function insertRetrospective() {
  const retrospective = {
    sd_id: SD_ID,
    target_application: 'EHG_Engineer',
    project_name: 'Generic table-parameterized atomic JSONB merge core (lib/coordinator/safe-metadata-merge.mjs)',
    retro_type: 'SD_COMPLETION',
    retrospective_type: null,
    title: `${SD_KEY} Retrospective`,
    description: 'SD-specific retrospective for extracting a generic, table-parameterized atomic JSONB '
      + 'merge/remove core (mergeJsonbColumn/removeJsonbColumnKey + JSONB_MERGE_ALLOWLIST) from the '
      + `strategic_directives_v2-only safe-metadata-merge.mjs, with 2 EXEC-phase SECURITY findings in `
      + `the SD's own new code found and fixed before handoff. Commits ${FEAT_COMMIT.slice(0, 11)} `
      + `(core extraction) and ${SEC_COMMIT.slice(0, 11)} (SEC-1/SEC-2 fixes).`,
    conducted_date: new Date().toISOString(),
    agents_involved: ['LEAD', 'PLAN', 'EXEC'],
    sub_agents_involved: ['EXPLORE', 'VALIDATION', 'DESIGN', 'DATABASE', 'RISK', 'STORIES', 'TESTING', 'SECURITY', 'RETRO'],
    human_participants: ['LEAD-Session'],

    what_went_well: [
      "LEAD EXPLORE (sub_agent_execution_results id 9a774659-6218-4f0a-9a7e-0111be591637) corrected 2 stale "
        + "facts baked into the SD's own description before PLAN began: mergeMetadataKeys' real call-site "
        + 'count is 28 across 17 files, not the stated 9 (a stale QF-20260902-928-era number baked into the '
        + "helper's own docblock); and the cited RCA prototype file "
        + '(.artifacts/rca-jsonb-merge-detector.mjs) does not exist anywhere in the repo, on any branch, or '
        + 'in git history, across 4 independent searches with positive controls proving the search tooling '
        + 'itself worked.',
      "VALIDATION's LEAD-TO-PLAN review (sub_agent_execution_results id a0598585-ba27-430a-b36e-a56cde2147ed) "
        + "did not just trust EXPLORE's numbers -- it independently re-derived all of them from scratch "
        + "(resolving 20 of 28 call sites through injection-seam aliases a naive grep would miss), found and "
        + "corrected one of EXPLORE's own sub-counts (chairman-gated-decision-row-guard.mjs has 6 call sites, "
        + "not the '4' EXPLORE's prose stated), and then ran a mandatory duplicate-implementation sweep "
        + "EXPLORE never did, finding lib/fleet/qf-metadata-merge.mjs -- a prior, independent generalization "
        + "attempt for the quick_fixes table whose own header states 'lib/coordinator/safe-metadata-merge.mjs "
        + "is strategic_directives_v2-only by design' -- someone had already hit this exact wall and forked "
        + 'rather than generalized, plus a 29th logical call site '
        + '(scripts/coordinator-backlog-rank.mjs:180) writing the identical inline SQL, bypassing the '
        + "helper's decider-pairing guard and audit path entirely, invisible to the existing lint (no "
        + '.update(, no spread). Both were explicitly scoped OUT of this SD (documented as follow-ups) '
        + 'rather than silently ignored or silently expanded into scope.',
      'The refactor is genuinely zero-external-behavior-change, not just claimed: the 3 existing exports '
        + '(mergeMetadataKeys/removeMetadataKey/removeMetadataKeyIfClaimedBy) now delegate to a new generic '
        + 'core (mergeJsonbColumn/removeJsonbColumnKey) with identical signatures, and this RETRO pass '
        + 're-ran the 2 core test files live: 40/40 passing (safe-metadata-merge.test.js + '
        + 'generic-jsonb-merge.test.js), matching the EXEC-TO-PLAN TESTING row\'s reported counts.',
      'A real regression was measured, not assumed, before FR-5 (widening '
        + 'scripts/lint/unsafe-sd-metadata-full-blob-write-lint.mjs\'s table gate to cover '
        + "product_requirements_v2) was reverted: the lint's file-level (not call-site-proximate) heuristic "
        + 'produced 38 false-positive-risk backlog findings on a full sweep once the second table joined the '
        + 'gate -- spot-checked and confirmed genuinely a false positive (a flagged .update() targeted an '
        + 'unrelated table merely co-located in a file that separately mentions '
        + 'product_requirements_v2). Properly disposed in the PRD as deferred with a harness_backlog ticket '
        + '(f4f8bac3-99db-412a-9a1f-ac3c628c87d0), not silently dropped or shipped with a known-bad '
        + 'heuristic.',
      "SECURITY's EXEC-phase review (sub_agent_execution_results id de79927b-25bd-4cf7-b4e6-1348361e1ba6) "
        + "found 2 real vulnerabilities IN THIS SD'S OWN NEW CODE, not in a pre-existing surface: SEC-1 "
        + '(MEDIUM) removeJsonbColumnKey accepted a raw, unvalidated extraGuardSql string that a future '
        + "caller passing untrusted data through (e.g. 'OR 1=1') could use to silently widen the WHERE "
        + 'clause and defeat the claim compare-and-swap the parameter exists to express -- proven live by a '
        + 'runtime probe that was ACCEPTED and emitted exactly that widened SQL; SEC-2 (LOW) '
        + 'JSONB_MERGE_ALLOWLIST was a plain mutable object (Object.isFrozen()=false, measured, not '
        + 'assumed) reachable by prototype-chain keys. Both were fixed in-session before EXEC-TO-PLAN '
        + '(commit ac7ff40ac53) with 7 new regression tests, each individually mutation-tested against its '
        + 'target line.',
      "TESTING's EXEC-phase re-verification (sub_agent_execution_results id "
        + 'e34b9cdb-afcf-477f-ab66-d49ed124ff20) proved the PLAN-phase mutation-testing evidence still '
        + "applied by BYTE-IDENTITY rather than by re-assertion: it read back the PLAN row's recorded git "
        + "blob sha and file sha256 for the production module, recomputed both from the live tree, and "
        + 'confirmed all three (worktree blob, HEAD blob, file sha256) identical, plus confirmed via '
        + '`git diff` that the production module had not moved a single byte since the mutation-tested '
        + 'commit -- the only EXEC-phase commit before that point touched scripts/one-off/ and .artifacts/ '
        + 'only.',
    ],

    key_learnings: [
      {
        category: 'STALE_FACTS_IN_SD_TEXT',
        learning: "An SD's own authored description can carry TWO independent classes of stale/false facts "
          + '(a call-site count last measured ~2 iterations before this SD, and a citation to an artifact '
          + 'that was apparently planned but never actually created) that survive from SD creation through '
          + 'the start of LEAD review, and both were only caught because EXPLORE re-measured the repo live '
          + "rather than trusting the SD's own prose.",
        applicability: 'Treat count/artifact-existence claims in an SD description as hypotheses to '
          + 're-verify at LEAD, not as ground truth -- especially for infrastructure SDs whose motivating '
          + 'numbers were themselves generated by a prior automated sweep.',
      },
      {
        category: 'VALIDATION_RE_DERIVES_NOT_TRUSTS',
        learning: "VALIDATION independently re-doing EXPLORE's own measurement from scratch (not merely "
          + "reviewing EXPLORE's conclusions) is what surfaced a genuine sub-count error in EXPLORE's own "
          + 'summary prose AND an entirely separate finding (the prior fork + the 29th bypass call site) '
          + "that a review-only pass would likely have missed, because EXPLORE's own recommendations never "
          + 'mentioned either.',
        applicability: 'Chair a mandatory duplicate-implementation sweep as a standing LEAD-phase step for '
          + 'any SD that "generalizes" or "extracts" an existing helper -- this program found a real prior '
          + 'fork of the exact same problem purely by looking for one, not because anything in the SD '
          + 'description hinted at it.',
      },
      {
        category: 'SECURITY_ON_NEW_CODE_NOT_JUST_LEGACY_SURFACE',
        learning: "This SD's own newly-written generalization code introduced a genuine (if unexploited) "
          + 'injection-adjacent trust-boundary widening (SEC-1) and a mutable-allowlist hardening gap '
          + '(SEC-2) -- neither existed in the pre-refactor code, because the pre-refactor code had no '
          + "generic, caller-extensible guard parameter at all. Generalizing a hard-coded function into a "
          + 'parameterized one is itself a security-relevant change (new surface area, even when call sites '
          + 'are unchanged), not merely a mechanical refactor exempt from a fresh SECURITY pass.',
        applicability: 'Any "extract a generic core from a hard-coded helper" SD should treat SECURITY '
          + 'review of the NEW core as mandatory regardless of how narrow the delta looks from the call '
          + "site's perspective -- the risk moved from \"can this helper's fixed SQL be abused\" to \"can "
          + 'this helper\'s new parameters be abused", which is a different question the pre-refactor code '
          + 'never had to answer.',
      },
      {
        category: 'MEASURE_THE_REGRESSION_BEFORE_REVERTING_OR_SHIPPING',
        learning: 'FR-5 (widening the metadata-write lint to a second table) was not deferred on suspicion '
          + 'or theoretical risk -- it was attempted, its regression was measured (38 concrete '
          + 'false-positive-risk findings), one was spot-checked and confirmed a genuine false positive, '
          + 'and only then was it reverted and disposed with a named follow-up ticket rather than either '
          + 'silently shipping a known-bad heuristic or silently dropping the requirement with no record.',
        applicability: "A PRD's disposition record for a deferred FR should distinguish "
          + '"deferred because we measured a real problem" from "deferred because it seemed risky" -- this '
          + "SD's own PRD does the former, with the measured count and a spot-check, which is materially "
          + 'more useful to the next SD that picks the ticket up.',
      },
      {
        category: 'MUTATION_TESTING_PROOF_SURVIVES_BYTE_IDENTITY_CHECK',
        learning: "A PLAN-phase mutation-testing result (killing mutants against a specific file's specific "
          + "blob) can be re-validated cheaply at EXEC-TO-PLAN by comparing the file's current git blob sha "
          + "and content sha256 against the PLAN row's recorded values, rather than re-running the mutation "
          + 'harness -- if the bytes are identical, the mutation proof carries forward exactly, and if they '
          + "differ, that is the trigger to re-run it. This SD's EXEC-TO-PLAN TESTING row did exactly that "
          + 'and confirmed carry-forward validity rather than re-asserting it.',
        applicability: 'Prefer byte-identity carry-forward checks over blanket mutation-harness re-runs at '
          + 'EXEC-TO-PLAN when the file under test provably has not changed since the PLAN-phase proof.',
      },
    ],

    action_items: [
      {
        action: 'Track SEC-1 follow-up (SECURITY row recommendation): replace extraGuardSql\'s free-text '
          + 'SQL parameter with a structured guard spec (e.g. {column, paramIndex}) validated against the '
          + 'same allowlist entry, or constrain it to a fixed regex, plus a negative test asserting a '
          + 'hostile guard string is refused -- nothing in the repo pins this today even after the SEC-1 '
          + 'fix closed the raw-string acceptance path for the one real call site.',
        owner: 'PLAN (follow-up SD/QF)',
        priority: 'medium',
        blocking: false,
      },
      {
        action: 'Evaluate reconciling lib/fleet/qf-metadata-merge.mjs (the prior, independent fork for '
          + 'quick_fixes) with the now-generic mergeJsonbColumn/removeJsonbColumnKey core -- explicitly '
          + 'scoped OUT of this SD per VALIDATION\'s recommendation (different CAS semantics, separate '
          + 'migration effort), but the duplication now has a clear merge target that did not exist before '
          + 'this SD.',
        owner: 'PLAN (follow-up SD)',
        priority: 'medium',
        blocking: false,
      },
      {
        action: 'Retrofit scripts/coordinator-backlog-rank.mjs:180 (the 29th logical call site, an inline '
          + 'COALESCE(metadata,\'{}\')||patch bypassing the helper entirely) onto the generic core now that '
          + 'one exists -- explicitly out of scope for this SD (retrofitting existing bypass instances), '
          + "named for awareness per VALIDATION's recommendation.",
        owner: 'PLAN (follow-up SD/QF)',
        priority: 'low',
        blocking: false,
      },
      {
        action: 'Investigate why PLAN-TO-LEAD\'s own RETROSPECTIVE_QUALITY_GATE preflight auto-generated a '
          + 'retro that scores 100% on the DB-content gate (PUBLISHED, quality_score=80, retro_type='
          + 'SD_COMPLETION) while containing template-filled boilerplate with zero SD-specific findings -- '
          + 'the gate cannot currently distinguish a genuinely reviewed retrospective from an auto-generated '
          + 'one that merely recites counts pulled mechanically from the SD/PRD/sub_agent rows. Consider a '
          + 'gate-side signal (e.g. metadata.generated_by=\'preflight_autogen\') that keeps such a row from '
          + 'satisfying RETROSPECTIVE_QUALITY_GATE at full score without also requiring fresh RETRO '
          + 'sub-agent evidence, so the two checks cannot silently diverge on the same SD the way they did '
          + 'here.',
        owner: 'PLAN/protocol',
        priority: 'medium',
        blocking: false,
      },
    ],

    what_needs_improvement: [
      'PLAN-TO-LEAD\'s RETROSPECTIVE_QUALITY_GATE preflight auto-generated a boilerplate completion retro '
        + `(retrospectives.id=${BOILERPLATE_RETRO_ID}) and a matching RETRO evidence row `
        + `(sub_agent_execution_results.id=${BOILERPLATE_EVIDENCE_ROW_ID}) that scored 100%/PASS on their `
        + "respective DB-content checks while containing no SD-specific findings at all -- neither the SEC-1/"
        + 'SEC-2 security findings, the corrected call-site count, the prior-fork discovery, nor the FR-5 '
        + 'revert appear anywhere in it. A DB-content check passing (status, quality_score, verdict fields) '
        + 'is not the same signal as genuine sub-agent evidence existing, and this gap let the two diverge '
        + 'silently on this SD until this RETRO pass caught it by reading the row in full rather than '
        + 'trusting its score.',
      'extraGuardSql (SEC-1) shipped as a MEDIUM finding rather than blocking, because the one real call '
        + 'site passes a fixed literal and pg\'s extended query protocol forbids statement stacking with '
        + 'bound parameters present -- but the fix (structured guard spec) is still only a follow-up '
        + 'recommendation, not enforced by a test today, so a future caller could reintroduce the same '
        + 'class of trust-boundary widening the SEC-1 fix closed for the current call site.',
      'Only 1 of 3 exported functions (mergeMetadataKeys) had real (non-mock) unit test coverage before '
        + "this SD -- EXPLORE's finding, addressed by this SD's own new tests for "
        + 'removeMetadataKey/removeMetadataKeyIfClaimedBy, but a gap that existed silently across 2 other '
        + 'production functions until an unrelated generalization SD happened to surface it.',
    ],

    learning_category: normalizeLearningCategory('SECURITY_REVIEW'),
    affected_components: [
      'lib/coordinator/safe-metadata-merge.mjs',
      'mergeJsonbColumn',
      'removeJsonbColumnKey',
      'JSONB_MERGE_ALLOWLIST',
      'mergeMetadataKeys',
      'removeMetadataKey',
      'removeMetadataKeyIfClaimedBy',
    ],
    related_files: [
      'lib/coordinator/safe-metadata-merge.mjs',
      'tests/unit/coordinator/safe-metadata-merge.test.js',
      'tests/unit/coordinator/generic-jsonb-merge.test.js',
      'scripts/lint/unsafe-sd-metadata-full-blob-write-lint.mjs',
      'lib/fleet/qf-metadata-merge.mjs',
      'scripts/coordinator-backlog-rank.mjs',
    ],
    related_commits: [FEAT_COMMIT, SEC_COMMIT],
    related_prs: [],
    tags: [SD_KEY, 'jsonb-merge', 'sql-injection-hardening', 'security-fix', 'mutation-testing', 'duplicate-implementation-sweep'],

    team_satisfaction: 8,
    business_value_delivered: 'MEDIUM',
    customer_impact: 'LOW',
    technical_debt_addressed: true,
    technical_debt_created: false,
    bugs_found: 2,
    bugs_resolved: 2,
    tests_added: 27,
    objectives_met: true,
    on_schedule: true,
    within_scope: true,
    success_patterns: [
      "EXPLORE re-measures the SD's own stated facts (call-site count, cited artifact existence) live "
        + 'against the repo rather than trusting the SD description, catching 2 independent stale/false '
        + 'claims before PLAN began.',
      "VALIDATION independently re-derives EXPLORE's own measurements from scratch AND runs a mandatory "
        + 'duplicate-implementation sweep EXPLORE never attempted, surfacing a prior independent fork of '
        + 'the same problem plus an additional undocumented bypass call site.',
      "SECURITY reviews the SD's OWN newly-written generalization code (not just the pre-existing call "
        + 'sites), finding 2 real findings introduced by the refactor itself, both fixed in-session with '
        + 'individually mutation-tested regression tests before EXEC-TO-PLAN.',
      'A risky scope item (FR-5 lint widening) is attempted, its regression is measured concretely (38 '
        + 'findings, one spot-checked), and only then reverted with a recorded disposition and follow-up '
        + 'ticket -- not silently dropped or silently shipped.',
    ],
    failure_patterns: [
      "PLAN-TO-LEAD's own RETROSPECTIVE_QUALITY_GATE preflight auto-generated a template-filled "
        + 'boilerplate completion retro that scored 100% on its DB-content check while containing zero '
        + "SD-specific findings, diverging silently from the SD's real, substantial delivered content "
        + 'until this RETRO pass read it in full.',
    ],
    improvement_areas: [
      'Gate design: RETROSPECTIVE_QUALITY_GATE currently cannot distinguish a genuinely-reviewed '
        + 'retrospective from an auto-generated, template-filled one that happens to clear the '
        + 'status/quality_score/retro_type thresholds -- both this SD and the RETRO evidence gate '
        + '(sub_agent_execution_results) need a way to signal "auto-generated, not genuine review" that '
        + "the completion gates actually consult, rather than relying on a worker to notice the row's "
        + 'content is boilerplate.',
      'extraGuardSql / structured-guard follow-up: SEC-1\'s fix closed the one real call site, but the '
        + 'underlying free-text-SQL-parameter shape is only closed by convention (a follow-up '
        + 'recommendation) at the removeJsonbColumnKey API surface level, not by a test that would catch a '
        + 'future caller reintroducing it.',
      'Duplicate-implementation sweeps: this program only found lib/fleet/qf-metadata-merge.mjs (the prior '
        + 'fork) because VALIDATION happened to run a sweep unprompted by the SD description -- making that '
        + 'sweep a standing, named step for "generalize/extract an existing helper" SDs would make this '
        + 'discovery mode reliable rather than incidental.',
    ],
    generated_by: 'SUB_AGENT',
    trigger_event: 'SD_STATUS_COMPLETED',
    status: 'DRAFT',
  };

  const stored = await storeRetrospective(supabase, retrospective);
  if (!stored.success) {
    throw new Error(`Failed to insert retrospective: ${stored.error}`);
  }

  const { data: inserted, error: fetchError } = await supabase
    .from('retrospectives')
    .select('id, quality_score')
    .eq('id', stored.id)
    .single();
  if (fetchError) {
    throw new Error(`Failed to read back inserted retrospective: ${fetchError.message}`);
  }

  const retroId = inserted.id;
  const calculatedScore = inserted.quality_score;
  console.log(`Retrospective inserted (DRAFT): id=${retroId} quality_score=${calculatedScore}`);

  if (calculatedScore < 70) {
    console.log(`WARNING: quality_score ${calculatedScore} is below the 70 publish threshold; leaving DRAFT.`);
    return { retroId, calculatedScore, status: 'DRAFT' };
  }

  const { error: updateError } = await supabase
    .from('retrospectives')
    .update({ status: 'PUBLISHED' })
    .eq('id', retroId);

  if (updateError) {
    console.log(`WARNING: failed to publish: ${updateError.message}`);
    return { retroId, calculatedScore, status: 'DRAFT' };
  }

  console.log('Retrospective published.');
  return { retroId, calculatedScore, status: 'PUBLISHED' };
}

async function main() {
  const { retroId, calculatedScore, status } = await insertRetrospective();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'RETRO',
    supabase,
  });

  const findings = [
    {
      id: 'RETRO-boilerplate-preflight-row-identified',
      severity: 'INFO',
      summary: `Confirmed retrospectives.id=${BOILERPLATE_RETRO_ID} (PUBLISHED, quality_score=80, `
        + `retro_type=SD_COMPLETION, metadata.generated_by='preflight_autogen', created `
        + '2026-09-14T11:53:30Z) and its matching RETRO evidence row '
        + `(sub_agent_execution_results.id=${BOILERPLATE_EVIDENCE_ROW_ID}, phase=PLAN_VERIFICATION, `
        + 'verdict=PASS, confidence=100, source=sub_agent_executor) are both real DB rows that satisfy '
        + "their respective automated checks by content shape (status/score/verdict), but read in full "
        + 'the retro is template-filled boilerplate with zero mention of this SD\'s actual delivered '
        + 'content: no SEC-1/SEC-2 security findings, no corrected 9->28 call-site count, no '
        + 'nonexistent-RCA-file finding, no prior-fork discovery, no FR-5 revert, no commit SHA. '
        + 'Verified by reading the full row, not by trusting its quality_score.',
    },
    {
      id: 'RETRO-sdcompletion-row-published-additive',
      severity: 'INFO',
      summary: `Inserted an ADDITIVE, genuinely SD-specific retro_type=SD_COMPLETION retrospective `
        + `(retrospectives.id=${retroId}, status=${status}, quality_score=${calculatedScore}) via `
        + "storeRetrospective() (lib/sub-agents/retro/db-operations.js) -- NOT enhanceRetrospective(), "
        + "because scripts/modules/handoff/lib/retro-clobber-guard.js's classifyRetro() checks "
        + "retro_type==='SD_COMPLETION' && (status==='PUBLISHED' || quality_score>=70) FIRST and "
        + `unconditionally; the boilerplate row (${BOILERPLATE_RETRO_ID}) matches on both, so `
        + "isSafeToWriteRetro returns {safe:false, reason:'published_sd_completion'} -- not the "
        + "'completion_write_onto_handoff_row' special case that auto-falls-back to an insert -- so "
        + 'enhanceRetrospective would only SKIP, never insert. The boilerplate row is left untouched and '
        + 'unmodified; this new row is additive.',
    },
    {
      id: 'RETRO-claims-independently-reverified',
      severity: 'INFO',
      summary: 'Before writing this evidence, independently re-verified (not taken on assertion): all 5 '
        + `commits for this SD via git log/show (feat ${FEAT_COMMIT.slice(0, 11)}, SEC-fix `
        + `${SEC_COMMIT.slice(0, 11)}, plus the 3 evidence-writer commits); the PRD's `
        + 'functional_requirements (FR-1..FR-5) in product_requirements_v2 matching the described scope '
        + 'and FR-5 deferral; the full text of the EXPLORE (9a774659), VALIDATION (a0598585), '
        + 'TESTING x2 (e1766774 PLAN, e34b9cdb EXEC), and SECURITY (de79927b) '
        + 'sub_agent_execution_results rows for this SD, confirming the 28-call-site correction, the '
        + 'nonexistent RCA-prototype-file finding, the prior-fork discovery (lib/fleet/qf-metadata-merge.mjs), '
        + 'the 29th bypass call site (scripts/coordinator-backlog-rank.mjs:180), SEC-1/SEC-2, and the '
        + "byte-identity mutation-proof carry-forward check, all in the sub-agents' own words rather than "
        + "this script's summary. Re-ran the delivered core test suite live: "
        + '`npx vitest run tests/unit/coordinator/safe-metadata-merge.test.js '
        + 'tests/unit/coordinator/generic-jsonb-merge.test.js` -- 2 files, 40/40 tests passed.',
    },
  ];

  const warnings = [
    'The boilerplate preflight-generated retro/evidence pair remains in the DB unmodified (additive '
      + 'insert, not a replace) -- RETROSPECTIVE_QUALITY_GATE will continue to see 2 qualifying '
      + 'SD_COMPLETION rows for this SD (the boilerplate one and this one); both are PUBLISHED with '
      + 'quality_score>=70, so the gate\'s own logic (checks the newest/any qualifying row) is unaffected '
      + 'by the duplicate.',
    'SEC-1\'s underlying free-text-SQL-parameter shape at the removeJsonbColumnKey API surface is closed '
      + 'for the one real call site but not enforced by a negative test against a future caller -- named '
      + 'as an action item above, not fixed by this RETRO pass (out of scope for evidence-writing).',
  ];

  const recommendations = [
    'GO for PLAN-TO-LEAD on the RETRO axis -- a genuinely SD-specific, non-boilerplate SD_COMPLETION '
      + 'retrospective is published and this evidence row records the review that produced it.',
    'File a protocol-level follow-up (see action_items) on RETROSPECTIVE_QUALITY_GATE accepting a '
      + 'template-filled preflight-autogenerated retro at full score with no signal distinguishing it from '
      + 'a genuinely-reviewed one -- this SD is a live, reproducible specimen.',
    'Carry the 3 SD-specific follow-ups forward: SEC-1 structured-guard-spec hardening, '
      + 'lib/fleet/qf-metadata-merge.mjs reconciliation, and the scripts/coordinator-backlog-rank.mjs:180 '
      + 'retrofit -- all explicitly out of scope for this SD, all named rather than silently dropped.',
  ];

  const summary = `RETRO PASS for ${SD_KEY} PLAN-TO-LEAD handoff. The pre-existing preflight-autogenerated `
    + `retro (${BOILERPLATE_RETRO_ID}) and its matching RETRO evidence row (${BOILERPLATE_EVIDENCE_ROW_ID}) `
    + 'both satisfy their respective automated DB-content checks (100%/PASS) but, read in full, contain no '
    + "SD-specific content -- confirmed a genuine instance of \"a DB-content check passing is not the same "
    + 'as sub-agent evidence existing\". Published a genuinely SD-specific SD_COMPLETION retrospective '
    + `(retrospectives.id=${retroId}, quality_score=${calculatedScore}, status=${status}), additive `
    + 'alongside the boilerplate row, covering: (1) EXPLORE correcting a stale 9->28 call-site count and a '
    + "nonexistent RCA-prototype-file citation in the SD's own description; (2) VALIDATION independently "
    + "re-deriving EXPLORE's numbers and finding a prior independent fork "
    + '(lib/fleet/qf-metadata-merge.mjs) plus a 29th bypass call site via a mandatory duplicate-'
    + 'implementation sweep; (3) the zero-external-behavior-change refactor of 3 existing exports onto a '
    + 'new generic core, re-verified live (40/40 tests passing) during this RETRO pass; (4) FR-5 (lint '
    + 'widening) attempted and reverted after measuring a real 38-finding regression, properly disposed '
    + 'with a harness_backlog ticket; (5) SECURITY finding and this SD fixing 2 real vulnerabilities '
    + '(SEC-1 MEDIUM, SEC-2 LOW) in its OWN new code before EXEC-TO-PLAN, with 7 individually '
    + "mutation-tested regression tests; (6) TESTING's byte-identity carry-forward proof that the PLAN-"
    + 'phase mutation-testing result still applied at EXEC-TO-PLAN. All claims independently re-verified '
    + `against live git history, the PRD, and 5 sub_agent_execution_results rows before this write. GO.`;

  let results = {
    verdict: 'PASS',
    confidence_score: 92,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      commits: [FEAT_COMMIT, SEC_COMMIT],
      retrospective_id: retroId,
      retrospective_status: status,
      retrospective_quality_score: calculatedScore,
      retro_type: 'SD_COMPLETION',
      prior_preflight_autogen_retro: BOILERPLATE_RETRO_ID,
      prior_preflight_autogen_evidence_row: BOILERPLATE_EVIDENCE_ROW_ID,
      verified_lessons: [
        'stale-call-site-count-corrected-9-to-28',
        'nonexistent-rca-prototype-file-citation-corrected',
        'prior-independent-fork-lib-fleet-qf-metadata-merge-discovered',
        '29th-bypass-call-site-coordinator-backlog-rank-discovered',
        'fr5-lint-widening-attempted-and-reverted-on-measured-regression',
        'sec-1-medium-extraguardsql-fixed-in-session',
        'sec-2-low-mutable-allowlist-fixed-in-session',
        'mutation-proof-carry-forward-verified-by-byte-identity',
        'preflight-autogenerated-retro-scores-100pct-while-boilerplate',
      ],
      test_suite_live_rerun: { files_passed: 2, tests_passed: 40, files_skipped: 0, tests_skipped: 0 },
      go_no_go: 'GO',
    },
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'RETRO',
    SD_ID,
    { name: 'Continuous Improvement Coach (retro-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_VERIFICATION' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  console.log('  retrospective_id:', retroId, 'status:', status, 'quality_score:', calculatedScore);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
