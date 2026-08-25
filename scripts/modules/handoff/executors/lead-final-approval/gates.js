/**
 * Gate Validators Domain
 * Defines validation gates for LEAD-FINAL-APPROVAL handoff
 *
 * @module lead-final-approval/gates
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { safeTruncate } from '../../../../../lib/utils/safe-truncate.js';
// SD-LEO-INFRA-RESUME-FINAL-READ-001 (FR-3/FR-4): branch→owner resolution replaces the anchored
// regex. See lib/git/branch-owner.js for why a widened regex is provably impossible.
import { branchBelongsToSd, loadKeySet, isRefCharsetSafe, OWNER_REASON, BRANCH_TYPE_TOKENS } from '../../../../../lib/git/branch-owner.js';
import { resolveRepoPath, resolveGitHubRepo, ENGINEER_ROOT } from '../../../../../lib/repo-paths.js';
import { getTierForSD } from '../../../sd-type-checker.js';
import { getFilteredRetrospective, isValidPreflightRetro } from '../../retro-filters.js';
import { sdKeyOwnsFile } from './sd-key-file-ownership.js';

// Core Protocol Gate - SD Start Gate (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
import { createSdStartGate } from '../../gates/core-protocol-gate.js';
import {
  classifyFrDelivery,
  projectGateResult,
  isFrTraceabilityEnforced,
  NOT_MEASURED_SCORE,
  ERRORED_SCORE,
} from '../../gates/fr-delivery-classifier.js';

// Pipeline Flow Verifier (SD-LEO-INFRA-INTEGRATION-AWARE-PRD-001 FR-5)
import { verifyPipelineFlow, requiresPipelineFlowVerification } from '../../../../../lib/pipeline-flow-verifier.js';

// Observe-only witness rung (SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-D)
import { withObserveOnlyWitness } from '../../../../../lib/eva/observe-gate-witness.js';

// Orchestrator Completion Validation Gates (SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001)
import { createSmokeTestGate } from './gates/smoke-test-gate.js';
export { createSmokeTestGate };

// Automated UAT Gate (SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001-D)
import { createAutomatedUatGate } from './gates/automated-uat-gate.js';
export { createAutomatedUatGate };

// Wiring Validation Gate (SD-LEO-INFRA-CROSS-REPO-ORPHAN-001)
import { createWiringValidationGate } from '../exec-to-plan/gates/wiring-validation.js';
export { createWiringValidationGate };

// Wire Check Gate — AST call graph reachability (SD-MAN-INFRA-FIX-ORCHESTRATOR-CHILD-001-C)
import { createWireCheckGate } from './gates/wire-check-gate.js';
export { createWireCheckGate };

// Invocation-Path Proof Gate — autonomous code must have a LIVE trigger, not just be reachable
// (SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-C)
import { createInvocationPathGate } from './gates/invocation-path-gate.js';
// SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001: a direct re-export-from passthrough, not a separate
// `export { createInvocationPathGate };` of the locally-imported binding.
//
// CORRECTED (RCA, see tests/unit/gates-namespace-exports.test.js): an earlier version of this
// comment attributed the break to "co-scheduling in the same vitest worker" — that mechanism was
// measured FALSE by RCA (reproduces with this file running completely alone). The REAL root cause
// was a literal mock-hoisting trigger token (a "vi" + ".mock(" pair) sitting in an unrelated
// comment elsewhere in this file (the FR-2
// exemption note below, quoting the test files' own mock call for explanatory purposes). Vitest's
// mock-hoisting transform (@vitest/mocker's hoistMocks) scans raw file TEXT, comments included, for
// that token; finding it, it hoists this PRODUCTION module's imports as if it were a test file, and
// its rewrite does not correctly handle `export { X };` of a plain locally-imported binding — Vite's
// generated export getter throws on the (now-hoisted-away) local reference and a wrapping try/catch
// silently converts that into `undefined`. That single mistaken comment silently broke 11 of the 12
// `export { X };` re-exports in this file, not just this one — this passthrough form (an `export {
// X } from '...'` re-export declaration, rather than a getter over a local binding) happens to be
// immune to that specific rewrite bug, which is why converting only this one export "fixed" the
// symptom without touching the actual root cause. The literal token has since been removed from the
// exemption comment below; this passthrough form is kept regardless, since it is a reasonable,
// slightly more standard way to re-export a plain pass-through binding.
export { createInvocationPathGate } from './gates/invocation-path-gate.js';

// Phantom Test Audit Gate — call-surface alignment check (SD-FDBK-ENH-PAT-PHANTOM-TABLE-001)
import { createPhantomTestAuditGate } from './gates/phantom-test-audit-gate.js';
export { createPhantomTestAuditGate };
// Acceptance-Tier Downgrade Gate — surfaces a live/never-mocked AC satisfied by unit-only
// evidence instead of a silent pass (SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-C)
import { createAcceptanceTierDowngradeGate } from './gates/acceptance-tier-downgrade-gate.js';
export { createAcceptanceTierDowngradeGate };
import { createLearningOrBypassResolvedGate } from './gates/learning-or-bypass-resolved-gate.js';
export { createLearningOrBypassResolvedGate };
// SD-LEO-INFRA-ADKAR-CHANGE-ADOPTION-FRAMEWORK-001-B: block completion of a
// metadata.requires_adoption=true SD until all 5 ADKAR stages are evidenced or waived.
import { createAdkarAdoptionGate } from './gates/adkar-adoption-gate.js';
export { createAdkarAdoptionGate };
// SD-LEO-INFRA-COMPLETION-GATE-DEFERRED-HOME-001: block completion when declared deferred
// follow-up work has no live home SD (stop deferred scope from evaporating).
import { createDeferredFollowupsGate } from './gates/deferred-followups-gate.js';
export { createDeferredFollowupsGate };

// Cross-SD File-Overlap Temporal Gate — SHIP oracle (SD-LEO-INFRA-CROSS-FILE-OVERLAP-001 FR-2b)
import { createCrossSdFileOverlapTemporalShipGate } from './gates/cross-sd-file-overlap-temporal-ship.js';
export { createCrossSdFileOverlapTemporalShipGate };

// Activation Invariant Gate — schema+UI+worker chain end-to-end test enforcement
// (SD-LEO-INFRA-REQUIRE-END-END-001 FR-2; 26th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001)
import { createActivationInvariantGate } from './gates/activation-invariant-gate.js';
export { createActivationInvariantGate };

// SD-FDBK-FIX-GATE-PIPELINE-GATE1-001: GATE4_WORKFLOW_ROI is NOT pushed here as an executor gate.
// It is ALREADY evaluated at LEAD-FINAL-APPROVAL via the DB-driven validator-registry rules
// (leo_validation_rules gate='4' handoff_type='LEAD-FINAL-APPROVAL': valueDelivered,
// patternEffectiveness, executiveValidation, processAdherence — all resolve to
// validateGate4LeadFinal via the gate-4 preloader). Adding an executor-level push would run the
// git-shelling + multi-DB-round-trip GATE4 computation a SECOND time per handoff (dedup keys on
// rule name, which differs). The (A) fix is simply removing the PREMATURE PLAN-TO-LEAD execution.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get repository path by name
 * @param {string} repoName - Repository name
 * @returns {string} Repository path
 */
function getRepoPath(repoName) {
  return resolveRepoPath(repoName) || ENGINEER_ROOT;
}

/**
 * Compute the list of repos to scan for a given SD's PR_MERGE_VERIFICATION.
 *
 * SD-LEO-INFRA-CROSS-REPO-MERGE-001: Closes the gate-side phantom-branch class
 * where single-repo SDs were blocked by stale branches in the OTHER repo.
 *
 * Precedence:
 *   1. sd.metadata.target_repos[] — explicit allowlist (canonical for cross-repo SDs)
 *   2. sd.target_application — single-repo derivation (case-insensitive)
 *   3. fallback to both repos with WARN log (legacy SDs without metadata)
 *
 * @param {Object} sd - Strategic Directive record
 * @returns {Array<{githubRepo: string, localPath: string}>}
 */
export function computeReposForSD(sd) {
  const sdId = sd?.sd_key || sd?.id || 'unknown';
  const all = [
    { githubRepo: 'rickfelix/ehg', localPath: getRepoPath('EHG') },
    { githubRepo: 'rickfelix/EHG_Engineer', localPath: getRepoPath('EHG_Engineer') }
  ];

  // Tier 1: explicit metadata.target_repos[] allowlist
  const targetRepos = sd?.metadata?.target_repos;
  if (Array.isArray(targetRepos) && targetRepos.length > 0) {
    const allowed = targetRepos.map(r => String(r).toLowerCase().trim());
    const result = all.filter(r => {
      const shortName = r.githubRepo.split('/')[1].toLowerCase();
      return allowed.includes(shortName) || allowed.includes(r.githubRepo.toLowerCase());
    });
    if (result.length > 0) {
      console.log(`[GATE_PR_MERGE_REPO_SCOPE] sd=${sdId} target_application=${sd?.target_application || 'NULL'} target_repos=${JSON.stringify(targetRepos)} scanning=${JSON.stringify(result.map(r => r.githubRepo))}`);
      return result;
    }
  }

  // Tier 2: derived from target_application (case-insensitive)
  const ta = (typeof sd?.target_application === 'string') ? sd.target_application.toLowerCase().trim() : '';
  if (ta) {
    if (ta.includes('engineer')) {
      const result = [all[1]]; // EHG_Engineer only
      console.log(`[GATE_PR_MERGE_REPO_SCOPE] sd=${sdId} target_application=${sd.target_application} target_repos=NULL scanning=${JSON.stringify(result.map(r => r.githubRepo))}`);
      return result;
    }
    if (ta === 'ehg' || ta === 'app' || ta === 'application') {
      const result = [all[0]]; // EHG only
      console.log(`[GATE_PR_MERGE_REPO_SCOPE] sd=${sdId} target_application=${sd.target_application} target_repos=NULL scanning=${JSON.stringify(result.map(r => r.githubRepo))}`);
      return result;
    }
    // SD-LEO-INFRA-VENTURE-AWARE-COMPLETION-001 (FR-3): a venture target_application
    // resolves to its SINGLE venture repo instead of falling through to the Tier-3
    // both-platform-repos scan. github_repo + local_path come from the registry mirror
    // (applications.github_repo is NULL for ventures; registry is kept in lockstep by the
    // provisioner write-through) via the SYNC resolvers — computeReposForSD is synchronous.
    const ventureGithub = resolveGitHubRepo(sd.target_application);
    const ventureLocal = resolveRepoPath(sd.target_application);
    if (ventureGithub && ventureLocal) {
      const result = [{ githubRepo: ventureGithub, localPath: ventureLocal }];
      console.log(`[GATE_PR_MERGE_REPO_SCOPE] sd=${sdId} target_application=${sd.target_application} resolved=venture scanning=${JSON.stringify(result.map(r => r.githubRepo))}`);
      return result;
    }
    // Venture github_repo/local_path unresolved — fall through to Tier 3
  }

  // Tier 3: legacy fallback — scan both repos with WARN
  console.warn(`[GATE_PR_MERGE_REPO_SCOPE] sd=${sdId} no target_application or target_repos — scanning both repos (legacy behavior)`);
  return all;
}

/**
 * Create Gate 1: PLAN-TO-LEAD handoff verification
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate definition
 */
export function createPlanToLeadHandoffGate(supabase) {
  return {
    name: 'PLAN_TO_LEAD_HANDOFF_EXISTS',
    validator: async (ctx) => {
      console.log('\n🔒 GATE 1: PLAN-TO-LEAD Handoff Verification');
      console.log('-'.repeat(50));

      const { data: handoff } = await supabase
        .from('sd_phase_handoffs')
        .select('id, status, validation_score, created_at')
        .eq('sd_id', ctx.sd.id)
        .eq('handoff_type', 'PLAN-TO-LEAD')
        .eq('status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!handoff) {
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: ['No accepted PLAN-TO-LEAD handoff found - run PLAN-TO-LEAD handoff first'],
          warnings: []
        };
      }

      console.log(`   ✅ PLAN-TO-LEAD handoff found: ${handoff.id.substring(0, 8)}...`);
      console.log(`      Status: ${handoff.status}`);
      console.log(`      Score: ${handoff.validation_score}`);
      console.log(`      Date: ${new Date(handoff.created_at).toLocaleString()}`);

      ctx._planToLeadHandoff = handoff;

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: { handoffId: handoff.id, validationScore: handoff.validation_score }
      };
    },
    required: true
  };
}

/**
 * Create Gate 2: User stories completion verification
 * @param {Object} supabase - Supabase client
 * @param {Object} prdRepo - PRD repository
 * @returns {Object} Gate definition
 */
export function createUserStoriesCompleteGate(supabase, prdRepo) {
  return {
    name: 'USER_STORIES_COMPLETE',
    validator: async (ctx) => {
      console.log('\n🔒 GATE 2: User Stories Completion Check');
      console.log('-'.repeat(50));

      // SD-LEO-INFRA-TYPE-AWARE-GATE-001: SD type check — does this type require user stories/PRD?
      const sdType = ctx.sd.sd_type || 'feature';
      const { data: typeProfile } = await supabase
        .from('sd_type_validation_profiles')
        .select('requires_prd, requires_user_stories')
        .eq('sd_type', sdType)
        .single();

      const prdRequired = typeProfile?.requires_prd ?? true;
      const storiesRequired = typeProfile?.requires_user_stories ?? true;

      if (!storiesRequired) {
        console.log(`   ℹ️  SD type '${sdType}' does not require user stories — auto-pass`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`SD type '${sdType}' does not require user stories`],
          details: { sd_type: sdType, stories_required: false }
        };
      }

      // Use PRDRepository for resilient lookup
      const prd = await prdRepo?.getBySdUuid(ctx.sd.id);

      if (!prd) {
        // For orchestrator SDs, no PRD is expected
        const { data: children } = await supabase
          .from('strategic_directives_v2')
          .select('id')
          .eq('parent_sd_id', ctx.sd.id);

        if (children && children.length > 0) {
          console.log('   ℹ️  Orchestrator SD - no PRD (children have PRDs)');
          return {
            passed: true,
            score: 100,
            max_score: 100,
            issues: [],
            warnings: ['Orchestrator SD - validated via children completion']
          };
        }

        // SD type says PRD not required — auto-pass on missing PRD
        if (!prdRequired) {
          console.log(`   ℹ️  SD type '${sdType}' does not require PRD — auto-pass`);
          return {
            passed: true,
            score: 100,
            max_score: 100,
            issues: [],
            warnings: [`SD type '${sdType}' does not require PRD`],
            details: { sd_type: sdType, prd_required: false }
          };
        }

        // Check if user stories exist directly linked to SD
        const { data: directStories } = await supabase
          .from('user_stories')
          .select('id, status')
          .eq('sd_id', ctx.sd.id);

        if (directStories && directStories.length > 0) {
          console.log(`   ℹ️  Found ${directStories.length} user stories directly linked to SD`);
          const completed = directStories.filter(s =>
            s.status === 'completed' || s.status === 'done' || s.status === 'validated'
          );
          const completionRate = Math.round((completed.length / directStories.length) * 100);

          if (completionRate === 100) {
            return {
              passed: true,
              score: 100,
              max_score: 100,
              issues: [],
              warnings: ['User stories validated via direct SD link (no PRD)']
            };
          }

          return {
            passed: false,
            score: completionRate,
            max_score: 100,
            issues: [`User story completion rate is ${completionRate}% (required: 100%)`],
            warnings: []
          };
        }

        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: ['No PRD found for this SD and no direct user stories found'],
          warnings: []
        };
      }

      // Check user stories
      const { data: stories } = await supabase
        .from('user_stories')
        .select('id, title, status')
        .eq('prd_id', prd.id);

      if (!stories || stories.length === 0) {
        console.log('   ⚠️  No user stories found');
        return {
          passed: true,
          score: 80,
          max_score: 100,
          issues: [],
          warnings: ['No user stories found - verify this is expected']
        };
      }

      const completed = stories.filter(s =>
        s.status === 'completed' || s.status === 'done' || s.status === 'validated'
      );
      const completionRate = Math.round((completed.length / stories.length) * 100);

      console.log(`   Total stories: ${stories.length}`);
      console.log(`   Completed: ${completed.length}`);
      console.log(`   Completion rate: ${completionRate}%`);

      if (completionRate < 100) {
        const incomplete = stories.filter(s =>
          s.status !== 'completed' && s.status !== 'done' && s.status !== 'validated'
        );
        console.log('   Incomplete stories:');
        incomplete.forEach(s => console.log(`     - ${s.title} (${s.status})`));
      }

      if (completionRate < 100) {
        return {
          passed: false,
          score: completionRate,
          max_score: 100,
          issues: [`User story completion rate is ${completionRate}% (required: 100%)`],
          warnings: []
        };
      }

      console.log('   ✅ All user stories completed');

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: { total: stories.length, completed: completed.length }
      };
    },
    required: true
  };
}

/**
 * Create Gate 3: Retrospective verification
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate definition
 */
export function createRetrospectiveExistsGate(supabase) {
  return withObserveOnlyWitness('RETROSPECTIVE_EXISTS', {
    name: 'RETROSPECTIVE_EXISTS',
    validator: async (ctx) => {
      console.log('\n🔒 GATE 3: Retrospective Verification');
      console.log('-'.repeat(50));

      // SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001: Use shared three-filter helper so
      // this gate and PLAN-TO-LEAD retrospective-quality.js share the same invariants
      // (existence + retro_type=SD_COMPLETION + created_at > LEAD-TO-PLAN acceptance).
      // Handoff-time retros share retro_type='SD_COMPLETION' so the timestamp filter
      // is what distinguishes them from true SD-completion retrospectives.
      //
      // SD-LEO-INFRA-PLAN-LEAD-RETRO-001 FR-1: this gate still runs its own authoritative
      // query every time (unchanged) — it only additionally trusts
      // ctx.options._preflightRetro (stashed by setup()'s preflight, same call) after
      // re-validating it against THIS query's own cutoff/invariants; a stale/wrong-SD/
      // wrong-type object is treated identically to "unset". Skipped under the rollback
      // env var, which restores pre-SD behavior (this query only, never trusting ctx).
      const queried = await getFilteredRetrospective(ctx.sd.id, ctx.sd.created_at || null, supabase, ctx.sd.sd_key || null);
      const { leadToPlanAcceptedAt } = queried;
      const stashed = ctx.options?._preflightRetro;
      const trustStash = !process.env.LEO_RETRO_PREFLIGHT_GATE_UNCONDITIONAL_REGEN
        && isValidPreflightRetro(stashed, ctx.sd.id, leadToPlanAcceptedAt);
      const retrospective = trustStash ? stashed : queried.retrospective;

      if (!retrospective) {
        const sdKey = ctx.sd?.sd_key || ctx.sdId || 'unknown';
        // FR-3: append the normalized preflight-generation error (when attempted and
        // failed) to this SAME issues[0] string, after the unchanged prefix.
        const preflightError = process.env.LEO_RETRO_PREFLIGHT_GATE_UNCONDITIONAL_REGEN
          ? null
          : ctx.options?._preflightRetroError;
        const baseIssue = `No SD-completion retrospective found for ${sdKey} (must be retro_type=SD_COMPLETION with created_at > ${leadToPlanAcceptedAt}) - run RETRO sub-agent first`;
        const issue = preflightError
          ? `${baseIssue} -- preflight auto-generation was attempted and failed: ${preflightError}`
          : baseIssue;
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [issue],
          warnings: [],
          remediation: 'Quality retrospective required for final approval.\n'
            + '   A handoff-time retrospective does not satisfy this gate — must be retro_type=SD_COMPLETION authored after LEAD-TO-PLAN acceptance.\n'
            + '   --- TASK TOOL INVOCATION ---\n'
            + '   subagent_type: "retro-agent"\n'
            + '   prompt: |\n'
            + `     Symptom: No qualifying SD-completion retrospective found for ${sdKey}. LEAD-FINAL-APPROVAL blocked.\n`
            + `     Location: retrospectives table WHERE sd_id='${ctx.sd?.id || sdKey}' AND retro_type='SD_COMPLETION' AND created_at > '${leadToPlanAcceptedAt}'\n`
            + '     Frequency: Blocking final approval\n'
            + '     Prior attempts: Retrospective not yet generated (or existing retro is a handoff-time retro created before LEAD-TO-PLAN)\n'
            + `     Desired outcome: Generate retrospective for ${sdKey} with quality score >= 60% and retro_type=SD_COMPLETION. Include SD-specific learnings, not boilerplate.\n`
            + '   --- END INVOCATION ---'
        };
      }

      console.log(`   Retrospective found: ${retrospective.id.substring(0, 8)}...`);
      console.log(`   Quality score: ${retrospective.quality_score}`);
      console.log(`   Status: ${retrospective.status}`);

      // SD-PROTOCOL-COMPLETION-INTEGRITY-AUTOHEAL-ORCH-001-A: Tier-based retro gate enforcement
      // Replaces type-based auto-pass with tier classification.
      // Tier 1-2 (≤75 LOC, no risk keywords): exempt — small fixes don't need full retros
      // Tier 3 (>75 LOC or risk keywords): retrospective required
      const tier = getTierForSD(ctx.sd);
      const sdType = ctx.sd?.sd_type || ctx.sd?.category || 'feature';

      if (tier <= 2) {
        // FR-3: decorative citation removed. `passed: true` below is unconditional for tier<=2,
        // so this only populated a reported number; report the floor the exemption guarantees.
        const score = 55;
        console.log(`   ⏭️  SKIP: Tier ${tier} SD — retrospective gate exempt`);
        console.log(`   Score floor: ${score}/100`);
        return {
          passed: true,
          skipped: true,
          score,
          max_score: 100,
          issues: [],
          warnings: [],
          skip_reason: `Tier ${tier} SD (${sdType}) — retrospective gate exempt for small work items`,
          details: {
            skipped: true,
            skip_reason: `Tier ${tier} SD exempt from retrospective quality enforcement`,
            tier,
            sd_type: sdType,
            retrospectiveId: retrospective.id,
            qualityScore: retrospective.quality_score
          }
        };
      }

      // Tier 3 SDs: require a MEASURED assessment, not the stored diagnostic gauge.
      //
      // SD-LEO-INFRA-RETRO-INTEGRITY-RUN-001 FR-3 step 2 — this read
      // `retrospective.quality_score < minScore`. Like the orchestrator fast-path, it is a REAL
      // predicate, so deleting the citation would have OPENED the gate rather than reconciled it.
      // Replaced with the AI-evaluator verdict — a measured signal — which is only safe to depend
      // on because that evaluator's outage fallback was made FAIL-CLOSED in this same change.
      // Previously it fell back to this exact gauge plus content presence, so citing it here
      // would have relocated the fabricated dependency rather than removed it.
      const minScore = 60;
      const { validateSDCompletionReadiness } = await import('../../../sd-quality-validation.js');
      const assessment = await validateSDCompletionReadiness(ctx.sd, retrospective);

      if (!assessment?.passed || assessment.score < minScore) {
        return {
          passed: false,
          score: assessment?.score ?? 0,
          max_score: 100,
          issues: [
            assessment?.manual_review_required
              ? 'Retrospective could not be assessed (evaluator unavailable) — MANUAL REVIEW REQUIRED. A gate that cannot run has not passed.'
              : `Retrospective assessed score ${assessment?.score ?? 0}% is below minimum ${minScore}%`
          ],
          warnings: assessment?.warnings || []
        };
      }

      console.log('   ✅ Retrospective quality meets threshold');

      return {
        passed: true,
        score: retrospective.quality_score,
        max_score: 100,
        issues: [],
        warnings: [],
        details: { retrospectiveId: retrospective.id, qualityScore: retrospective.quality_score }
      };
    },
    required: true
  });
}

/**
 * Create PR Precheck Gate: Fast-fail on open PRs before heavyweight gates.
 * Prevents retry storms where sessions run LEAD-FINAL-APPROVAL without merging PRs.
 * (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-081)
 *
 * @returns {Object} Gate definition
 */
export function createPRPrecheckGate(supabase, deps = {}) {
  const getKeySet = deps.loadKeySet || (() => loadKeySet(supabase));

  return {
    name: 'PR_PRECHECK',
    validator: async (ctx) => {
      console.log('\n⚡ PR PRECHECK: Quick open-PR scan');
      console.log('-'.repeat(50));

      const sdId = ctx.sd.sd_key || ctx.sd.id;
      // (The branchPatterns array that used to sit here fed only the anchored regex and became
      // dead when that was removed — deleted rather than prefixed with _, since nothing reads it.)

      // FR-3: third call site of the matcher that was replaced. All three migrate together —
      // leaving one on the anchored regex would leave a live blind site.
      //
      // FR-4, AND THIS IS A DELIBERATE ASYMMETRY, NOT AN OVERSIGHT. Unlike PR_MERGE_VERIFICATION,
      // this gate does NOT block when the key set is unavailable. It is a fast-fail optimisation
      // whose whole contract is "the full PR_MERGE gate will validate" — its existing catch
      // already returns passed:true on any error by design. Blocking here would turn an
      // optimisation into a second hard dependency on the key-set lookup. The decision is recorded
      // and LOGGED rather than inherited silently, because the risk of a permissive precheck is
      // entirely carried by PR_MERGE_VERIFICATION actually blocking — if that ever stops being
      // true, this asymmetry becomes a hole.
      const keySetResult = await getKeySet();
      if (!keySetResult.ok) {
        console.log(`   ⚠️  Key set unavailable (${keySetResult.error || keySetResult.reason}) — precheck skipped by design; PR_MERGE_VERIFICATION blocks on this condition`);
        return {
          passed: true, score: 100, max_score: 100, issues: [],
          warnings: [`PR_PRECHECK skipped: key set unavailable (${keySetResult.reason}). This is non-blocking BY DESIGN — PR_MERGE_VERIFICATION fails closed on the same condition.`],
          details: { skipped: true, reason: OWNER_REASON.KEY_SET_UNAVAILABLE, deferred_to: 'PR_MERGE_VERIFICATION' }
        };
      }
      const keySet = keySetResult.keys;

      try {
        const { execSync } = await import('child_process');
        // SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 (FR-4 audit): `repo` iterates this HARDCODED
        // literal array -- verified-safe, no interpolation risk, no conversion needed.
        const repos = ['rickfelix/ehg', 'rickfelix/EHG_Engineer'];

        for (const repo of repos) {
          try {
            const result = execSync(
              `gh pr list --repo ${repo} --state open --json number,headRefName --limit 50`,
              { encoding: 'utf8', timeout: 15000 }
            );
            const prs = JSON.parse(result || '[]');
            const matching = prs.filter(pr => branchBelongsToSd(pr.headRefName, sdId, keySet).belongs);

            if (matching.length > 0) {
              console.log(`   ❌ Open PR(s) found in ${repo} — run /ship first`);
              return {
                passed: false,
                score: 0,
                max_score: 100,
                issues: [
                  `Open PR(s) detected for ${sdId} in ${repo}. Run /ship to merge before LEAD-FINAL-APPROVAL.`,
                  'Required order: EXEC → /ship (merge PR) → LEAD-FINAL-APPROVAL'
                ],
                warnings: [],
                details: { fastFail: true, repo, matchCount: matching.length }
              };
            }
          } catch (_e) {
            // Skip repo if gh fails — full PR_MERGE gate will catch it
          }
        }

        console.log('   ✅ No open PRs detected — proceeding to full validation');
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [] };
      } catch (_e) {
        // Non-blocking: if precheck fails, let the full gate handle it
        console.log('   ⚠️  Precheck skipped — full PR_MERGE gate will validate');
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['Precheck skipped due to error'] };
      }
    }
  };
}

// SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (FR-2): the narrow, MEASURED exemption for
// "this sd_type ships no code". Deliberately NOT scripts/modules/sd-type-checker.js's
// isInfrastructureSDSync()/SD_TYPE_CATEGORIES.NON_CODE — measured against strategic_directives_v2,
// NON_CODE exempts 3393/4595 completed SDs (73.8%), with 'infrastructure' alone accounting for
// 2733 (59.5%) — including this SD's own type. Both test files for this gate also fully mock
// sd-type-checker.js (both test files mock its getTierForSD export), so importing any
// further symbol from that module throws under mock and the outer catch reads as a false green
// (see the note on FR-2 in the PRD). Checking ctx.sd.sd_type against this local Set avoids both
// problems. 'process' is deliberately NOT included: SECURITY EXEC review (SEC-7) measured it
// against the live sd_type_check CHECK constraint (15 permitted values) and found it is not a
// valid sd_type — a dead Set member that would additionally have told an operator, via the
// never-pushed remediation message, to set a value the database rejects.
const NO_CODE_SD_TYPES = new Set(['documentation', 'docs', 'orchestrator']);

// SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (VALIDATION VERIFY finding, 1-REP): named directly
// off BRANCH_TYPE_TOKENS (lib/git/branch-owner.js, already imported above for branchBelongsToSd)
// instead of a second, hand-maintained literal — the never-pushed message and
// branchBelongsToSd's own recognition now cannot drift apart. 'chore' is deliberately NOT in
// BRANCH_TYPE_TOKENS (pinned by an existing test fixture); this alias exists only to give the
// never-pushed failure message a name that doesn't imply a private, SD-local list.
const RECOGNIZED_BRANCH_TYPES = BRANCH_TYPE_TOKENS;

/**
 * SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (FR-4, TR-8): pure classifier shared by the live gate's
 * third state (below) and the retro census one-off script, so the two definitions of "never-pushed
 * specimen" can never drift apart. Takes no I/O — callers gather the evidence.
 *
 * @param {Object} params
 * @param {Object} params.sd - { sd_type }
 * @param {Array} [params.shipReviewFindings] - rows that may carry pr_url / merged_at as evidence
 * @param {Object} [params.metadata] - { openPRs, mergedPRs, hasMergeEvidence, unmergedBranches }
 * @returns {boolean}
 */
export function isNeverPushedSpecimen({ sd, shipReviewFindings, metadata } = {}) {
  if (NO_CODE_SD_TYPES.has(sd?.sd_type)) return false;
  const md = metadata || {};
  const hasOpenPR = Number(md.openPRs ?? 0) > 0;
  const hasMergedPR = Number(md.mergedPRs ?? 0) > 0 || Boolean(md.hasMergeEvidence);
  const hasUnmergedBranch = Number(md.unmergedBranches ?? 0) > 0;
  if (hasOpenPR || hasMergedPR || hasUnmergedBranch) return false;
  // ship_review_findings has no pr_url/merged_at column — a row's presence with a pr_number is
  // itself the evidence (a PR was reviewed, which requires one to have existed).
  if (Array.isArray(shipReviewFindings) && shipReviewFindings.some((f) => f?.pr_number)) {
    return false;
  }
  return true;
}

/**
 * Create Gate 4: PR merge verification
 *
 * PAT-SHIP-ORDER-001: Correct ordering is:
 *   EXEC complete → /ship (commit, PR, merge) → LEAD-FINAL-APPROVAL
 * This gate enforces that PRs are merged BEFORE final approval.
 * If this gate fails, run /ship first.
 *
 * @returns {Object} Gate definition
 */
export function createPRMergeVerificationGate(supabase, deps = {}) {
  // Injectable so the fail-closed path is unit-testable WITHOUT a database. A DB-backed test would
  // file under the vitest `db` project, which is disabled when no non-production target is
  // designated and runs zero files — a fail-closed test that cannot fire, inside the SD about
  // guards that cannot fire (SD-LEO-INFRA-RESUME-FINAL-READ-001, TS-3).
  const getKeySet = deps.loadKeySet || (() => loadKeySet(supabase));

  return {
    name: 'PR_MERGE_VERIFICATION',
    validator: async (ctx) => {
      console.log('\n🔒 GATE 4: PR Merge Verification');
      console.log('   ℹ️  Required order: EXEC → /ship (merge PR) → LEAD-FINAL-APPROVAL');
      console.log('-'.repeat(50));

      const sdId = ctx.sd.sd_key || ctx.sd.id;

      // Build expected branch name pattern for this SD (kept for logging downstream).
      const branchPatterns = [
        `feat/${sdId}`,
        `fix/${sdId}`,
        `docs/${sdId}`,
        `test/${sdId}`
      ];

      // SD-LEO-INFRA-RESUME-FINAL-READ-001 (FR-3) — replaces the anchored regex that used to be
      // built here. That regex could not see a branch carrying a suffix after the SD key, so an
      // OPEN PR was invisible and an SD completed with its deliverable unmerged. The obvious
      // repair (also match <type>/<KEY>-<suffix>) is PROVABLY IMPOSSIBLE: for key K and child key
      // K-x the string <type>/K-x is simultaneously a suffixed branch of K and the canonical
      // branch of K-x. The disambiguating information is in the KEY SET, not the string.
      //
      // LOADED BEFORE THE try BELOW, DELIBERATELY. The catch at the end of this validator already
      // returns fail-closed on any throw, so loading inside it would make the resolver inherit
      // fail-closed behaviour it does not implement — and a test asserting "the gate blocks" would
      // pass with no resolver logic at all. Loading here keeps the resolver's own refusal
      // observable and separately assertable (TS-3's negative control).
      const keySetResult = await getKeySet();
      if (!keySetResult.ok) {
        console.log(`   ❌ Key set unavailable (${keySetResult.error || keySetResult.reason}) — cannot resolve branch ownership`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [
            `Cannot verify PR merge state for ${sdId}: the SD key set could not be loaded (${keySetResult.error || keySetResult.reason}).`,
            'This BLOCKS rather than passes. Without the key set, "no matching branches" is indistinguishable from "the lookup failed", and treating the second as the first is the fail-open this gate exists to close.',
            'Bypass available for documented emergencies: --bypass-validation --bypass-reason "<reason>"'
          ],
          warnings: [],
          details: { fail_closed: true, reason: OWNER_REASON.KEY_SET_UNAVAILABLE, resolver: true }
        };
      }
      const keySet = keySetResult.keys;

      try {
        const { execSync, execFileSync } = await import('child_process');

        // SD-LEO-INFRA-CROSS-REPO-MERGE-001: scope repo scan to SD's target_application
        // and metadata.target_repos[] instead of hardcoding both repos.
        const reposWithPaths = computeReposForSD(ctx.sd);
        const openPRs = [];
        // FR-4: repos whose PR list could not be read. An unreadable repo may hold the open PR that
        // should block this completion, so it is tracked and refused below rather than logged past.
        const unreadableRepos = [];

        for (const { githubRepo: repo } of reposWithPaths) {
          try {
            // SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 (FR-4): `repo` here is registry/provisioner
            // derived (computeReposForSD -> resolveGitHubRepo(sd.target_application) on the
            // venture path), not attacker-controlled via a branch name -- a tighter trust
            // boundary than the FR-1 sinks, but converted for completeness/defense-in-depth.
            const result = execFileSync(
              'gh',
              ['pr', 'list', '--repo', repo, '--state', 'open', '--json', 'number,title,headRefName,url', '--limit', '100'],
              { encoding: 'utf8', timeout: 30000 }
            );

            const prs = JSON.parse(result || '[]');

            // FR-3: ownership resolution, not pattern matching. A suffixed branch belongs to this
            // SD when no LONGER key claims it — which is why the key set is required and why the
            // anchored regex this replaces could not answer the question at all.
            const matchingPRs = prs.filter(pr => branchBelongsToSd(pr.headRefName, sdId, keySet).belongs);

            if (matchingPRs.length > 0) {
              openPRs.push(...matchingPRs.map(pr => ({
                ...pr,
                repo: repo
              })));
            }
          } catch (repoError) {
            // SD-LEO-INFRA-RESUME-FINAL-READ-001 (FR-4): "we could not look" is NOT evidence of
            // "nothing is there". This catch used to log and continue, so a gh outage — auth
            // expiry, rate limit, network — produced an empty openPRs list and the gate PASSED.
            // Probed by the EXEC TESTING sub-agent: gh throwing for every repo returned
            // passed:true, score:100. That is the same fail-open the key-set guard closes, forty
            // lines away in this same function, and leaving it would make FR-4 incoherent: the
            // whole reason PR_PRECHECK may be permissive is that THIS gate blocks.
            unreadableRepos.push({ repo, error: safeTruncate(repoError.message || '', 120) || 'unknown error' });
            console.log(`   ❌ Could not check ${repo}: ${safeTruncate(repoError.message || '', 80) || 'unknown error'}`);
          }
        }

        // FR-4: refuse BEFORE reporting a result derived from an incomplete scan. Ordered ahead of
        // the openPRs check deliberately — if one repo read cleanly and another failed, "found 0
        // open PRs" is a statement about the repo we could see, presented as a statement about all
        // of them. Both branches of that are wrong to pass on.
        if (unreadableRepos.length > 0) {
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [
              `Cannot verify PR merge state for ${sdId}: ${unreadableRepos.length} repo(s) could not be scanned.`,
              ...unreadableRepos.map((r) => `  → ${r.repo}: ${r.error}`),
              '',
              'This BLOCKS rather than passes. An unreadable repo may hold the open PR that should stop this completion, and "we could not look" is not evidence of "nothing is there".',
              'Usually gh auth or rate limiting: check `gh auth status`, then re-run.',
              'Bypass available for documented emergencies: --bypass-validation --bypass-reason "<reason>"',
            ],
            warnings: [],
            details: { fail_closed: true, reason: 'repo_scan_unreadable', unreadableRepos, scanIncomplete: true },
          };
        }

        if (openPRs.length > 0) {
          console.log(`   ❌ Found ${openPRs.length} open PR(s) for this SD:`);
          openPRs.forEach(pr => {
            console.log(`      - PR #${pr.number}: ${pr.title}`);
            console.log(`        Branch: ${pr.headRefName}`);
            console.log(`        Repo: ${pr.repo}`);
            console.log(`        URL: ${pr.url}`);
          });

          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [
              `${openPRs.length} open PR(s) must be merged before SD completion`,
              ...openPRs.map(pr => `  → PR #${pr.number} (${pr.repo}): ${pr.url}`),
              '',
              'REMEDIATION: Run /ship to merge open PRs before running LEAD-FINAL-APPROVAL.',
              'Required order: EXEC → /ship (merge PR) → LEAD-FINAL-APPROVAL',
              ...openPRs.map(pr => `  → gh pr merge ${pr.number} --repo ${pr.repo} --merge --delete-branch`) // gh-merge-guard-exempt: FR-1B -- gh-merge-safe.mjs has no --repo support; dropping it here would risk merging the wrong PR in the wrong repo (Category E, SD-LEO-INFRA-GH-MERGE-SAFE-WIRING-001)
            ],
            warnings: [],
            details: { openPRs: openPRs.map(pr => ({ number: pr.number, repo: pr.repo, url: pr.url })) }
          };
        }

        console.log('   ✅ No open PRs found for this SD');
        console.log(`   Checked patterns: ${branchPatterns.join(', ')}`);

        // Check for unmerged branches with commits
        // SD-LEO-INFRA-CROSS-REPO-MERGE-001: reuse the same scoped repo list (computeReposForSD)
        // for the unmerged-branch scan to keep both loops consuming a single source of truth
        // (writer/consumer asymmetry class — PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).
        const unmergedBranches = [];
        // SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (TR-6): squash-merge evidence observed below
        // (the `gh pr list --head ... --state merged` whitelist check) used to live only in a
        // function-local `let prMerged` and was discarded once the loop moved on. Hoisted here so
        // it survives as positive evidence for the never-pushed third-state check further down —
        // without this, a squash-merged SD is indistinguishable from a never-pushed one.
        const mergeEvidence = [];
        for (const { githubRepo: repo, localPath: repoPath } of reposWithPaths) {
          try {

            // SD-LLM-CONTRACT-PIPELINE-TEST-ORCH-001-B RCA: prune stale remote-tracking refs
            // before checking branches. Without this, squash-merged branches whose remote was
            // deleted on GitHub still appear in `git branch -r` and trigger false failures.
            try {
              execSync('git fetch --prune origin', { encoding: 'utf8', cwd: repoPath, timeout: 30000 });
            } catch (_fetchErr) {
              console.log('   ⚠️  Could not fetch latest remote state — branch check may use stale data');
            }

            const branchList = execSync('git branch -r', { encoding: 'utf8', cwd: repoPath, timeout: 10000 });

            // QF-20260509-PRMERGE-EXACT: per-branch exact-match instead of
            // per-pattern .includes() (collapses 4 pattern iterations into 1
            // regex test per branch).
            {
              const matchingBranches = [];
              // SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 (FR-2): branches that resolve to this SD but
              // fail the ref-charset guard are tracked separately and treated as BLOCKING below,
              // never silently dropped -- see isRefCharsetSafe's docblock for why filtering them
              // out here would be a fail-open.
              const charsetViolations = [];
              for (const raw of branchList.split('\n')) {
                const b = raw.trim();
                if (!b || b.includes('HEAD')) continue;
                // FR-3: SAME resolver as the PR scan above. This is the second of the two guards
                // that shared the anchored regex — so both were blind to a suffixed branch, and
                // fixing only the PR scan would have left this one silently passing.
                if (!branchBelongsToSd(b, sdId, keySet).belongs) continue;
                if (!isRefCharsetSafe(b)) { charsetViolations.push(b); continue; }
                matchingBranches.push(b);
              }

              for (const branch of charsetViolations) {
                const cleanBranch = branch.replace('origin/', '');
                console.log(`   ⚠️  ${cleanBranch} rejected by ref-charset guard — treated as blocking (FR-2)`);
                // SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 (SEC-3): unverified:true, NOT the `verified`
                // bucket -- `verified` entries get rendered below into a copy-pasteable
                // `git push ... && gh pr create && gh pr merge` remediation command with the raw
                // branch text spliced in. A branch that just failed the shell-metacharacter
                // allowlist is exactly the string that must never reach that command-shaped output.
                unmergedBranches.push({ branch: cleanBranch, repo, commits: null, reason: 'ref_charset_violation', unverified: true });
              }

              for (const branch of matchingBranches) {
                const cleanBranch = branch.replace('origin/', '');
                try {
                  // SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 (FR-1, live RCE fix): was execSync with
                  // unescaped template-literal branch interpolation -- a branch name containing a
                  // bare '&' executed as an injected shell command (confirmed by execution).
                  // execFileSync with an argv array never invokes a shell, so `branch` can never be
                  // reparsed as a command regardless of its characters. NO leading '--' separator:
                  // `git rev-list --count -- <rev>` fails with a usage error (verified) because '--'
                  // before the rev is parsed as "no commits given, paths follow"; the argv element
                  // can never itself start with '-' so no separator is needed here.
                  const commitCount = execFileSync(
                    'git',
                    ['rev-list', '--count', `origin/main..${branch}`],
                    { encoding: 'utf8', cwd: repoPath, timeout: 10000 }
                  ).trim();

                  if (parseInt(commitCount) > 0) {
                    // Check if this branch has a merged PR (squash-merge artifact)
                    // After squash merge, the remote branch may still exist briefly or
                    // the worktree branch diverges from main. If the PR is merged, skip.
                    let prMerged = false;
                    try {
                      // SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 (FR-1, live RCE fix): was execSync with
                      // cleanBranch wrapped in double quotes -- double-quoting does NOT prevent
                      // shell injection (a quote-breakout payload, e.g. a literal '"' followed by
                      // '&whoami&', executes; confirmed by execution). execFileSync as an argv
                      // element is behavior-identical for a legitimate branch and inert for either
                      // this payload class or a bare '&' (which the old sink #1 above was directly
                      // vulnerable to with no quoting at all).
                      const prStatus = execFileSync(
                        'gh',
                        ['pr', 'list', '--head', cleanBranch, '--state', 'merged', '--json', 'number', '--limit', '1'],
                        { encoding: 'utf8', cwd: repoPath, timeout: 15000 }
                      ).trim();
                      const mergedPrs = JSON.parse(prStatus || '[]');
                      if (mergedPrs.length > 0) {
                        prMerged = true;
                        mergeEvidence.push({ branch: cleanBranch, repo, prNumber: mergedPrs[0].number });
                        console.log(`   ✅ ${cleanBranch} has merged PR #${mergedPrs[0].number} — squash-merge artifact, skipping`);
                      }
                    } catch (_prErr) {
                      // gh CLI unavailable or failed — fall through to unmerged check
                    }

                    if (!prMerged) {
                      unmergedBranches.push({
                        branch: cleanBranch,
                        repo: repo,
                        commits: parseInt(commitCount)
                      });
                    }
                  }
                } catch (e) {
                  // SD-LEO-INFRA-HANDOFF-MERGE-MAIN-001: do NOT silently skip.
                  // A branch we cannot compare against main is unverified — treat as
                  // unmerged unless we have positive evidence otherwise. This was the
                  // dual failure mode in SD-MAN-ORCH-S18-S26-PIPELINE-001-A: branch
                  // existed on origin but rev-list/gh-pr-list either errored or was
                  // skipped on the LEAD host, leaving the branch unverified yet allowed.
                  console.log(`   ⚠️  Could not verify ${cleanBranch}: ${e?.message || e}`);
                  unmergedBranches.push({
                    branch: cleanBranch,
                    repo: repo,
                    commits: null,
                    unverified: true,
                    reason: e?.message || String(e)
                  });
                }
              }
            }
          } catch (_repoError) {
            // Intentionally suppressed: skip repo if can't check branches
            // SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (FR-5, deferred, NOT closed by this SD):
            // this is the same fail-open class RESUME-FINAL-READ-001's FR-4 already closed on the
            // PR-scan side (the `unreadableRepos` refusal above, ~line 726) — an unreadable repo
            // here is silently treated as "nothing to report" instead of blocking. Flagged by this
            // SD's own review as a candidate follow-up SD; out of scope here (this SD's boundary is
            // the never-pushed third state, not other suppression sites in this gate).
            console.debug('[LeadFinalApproval] repo branch check suppressed:', _repoError?.message || _repoError);
          }
        }

        if (unmergedBranches.length > 0) {
          const verified = unmergedBranches.filter(b => !b.unverified);
          const unverified = unmergedBranches.filter(b => b.unverified);
          console.log(`   ❌ Found ${unmergedBranches.length} branch(es) blocking completion (${verified.length} unmerged + ${unverified.length} unverified):`);
          verified.forEach(b => {
            console.log(`      - ${b.branch} (${b.commits} commits ahead of main)`);
            console.log(`        Repo: ${b.repo}`);
          });
          unverified.forEach(b => {
            console.log(`      - ${b.branch} (UNVERIFIED — could not compare against main: ${b.reason})`);
            console.log(`        Repo: ${b.repo}`);
          });

          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [
              `${unmergedBranches.length} branch(es) block completion (${verified.length} unmerged, ${unverified.length} unverified) - resolve before completion`,
              ...verified.map(b => `  → ${b.branch} (${b.commits} commits) in ${b.repo}`),
              ...unverified.map(b => `  → ${b.branch} (UNVERIFIED: ${b.reason}) in ${b.repo}`),
              '',
              'REMEDIATION: Run /ship to create PRs and merge branches before running LEAD-FINAL-APPROVAL.',
              'Required order: EXEC → /ship (merge PR) → LEAD-FINAL-APPROVAL',
              ...verified.map(b => `  → cd to ${b.repo} repo, then: git push -u origin ${b.branch} && gh pr create && gh pr merge --merge --delete-branch`), // gh-merge-guard-exempt: FR-1B -- cross-repo chained command, gh-merge-safe.mjs has no --repo support (Category E, SD-LEO-INFRA-GH-MERGE-SAFE-WIRING-001)
              ...(unverified.length > 0 ? ['', 'For UNVERIFIED branches: resolve the comparison error (gh auth, network, repo path) and re-run, OR --bypass-validation with documented reason if the branch is known-merged.'] : [])
            ],
            warnings: [],
            details: {
              checkedPatterns: branchPatterns,
              openPRs: 0,
              unmergedBranches: unmergedBranches,
              unverifiedCount: unverified.length
            }
          };
        }

        console.log('   ✅ No unmerged branches with commits found');

        // SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (FR-1): Scan A (open PRs) and Scan B (unmerged
        // remote branches) are BOTH remote-only "is anything currently outstanding" surfaces. A
        // normally-shipped SD (PR opened, merged, branch deleted via /ship --delete-branch) returns
        // zero on BOTH — MEASURED (TESTING sub-agent PLAN-phase probe) to be byte-identical to a
        // branch that was never pushed at all. mergeEvidence (hoisted above from the squash-merge
        // whitelist check) is the first, cheap positive-evidence signal. When it's empty too, Scan C
        // below is the authoritative positive-evidence source: same execSync/gh-CLI invocation
        // pattern, same branchBelongsToSd resolver as Scan A, `--state merged` instead of
        // `--state open`, PLUS `--search "<sdId>"` — MEASURED (TESTING sub-agent EXEC-phase probe,
        // row d0b12eb8) that omitting --search reintroduces the exact false-positive class this SD
        // exists to close: `gh pr list --state merged --limit 100` with no search filter only sees
        // the 100 most-recently-merged PRs REPO-WIDE (a ~50-hour window measured live on
        // rickfelix/EHG_Engineer), so any SD merged earlier than that window — the common case for
        // an orchestrator parent waiting on children, a resumed SD, or simply a few days passing —
        // reads as zero evidence and false-positives as never_pushed. Demonstrated live:
        // SD-LEO-INFRA-RESUME-FINAL-READ-001 (merged PR #6790, 2026-08-04) returns 0 matches
        // without --search and is found immediately with it. Only when Scan A, Scan B,
        // mergeEvidence, AND Scan C are ALL empty for a code-implying sd_type (NOT in
        // NO_CODE_SD_TYPES) do we conclude nothing was ever pushed.
        if (mergeEvidence.length === 0 && !NO_CODE_SD_TYPES.has(ctx.sd.sd_type)) {
          const SCAN_C_LIMIT = 100;
          const mergedPRs = [];
          let scanCFailed = false;
          let scanCSaturated = false;
          for (const { githubRepo: repo } of reposWithPaths) {
            try {
              // SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 (FR-4): sdId is a DB-resolved SD identifier
              // (not attacker-controlled via a branch name), and repo is registry/provisioner
              // derived (see FR-4 note above) -- lower severity than the FR-1 sinks, converted
              // for completeness.
              const result = execFileSync(
                'gh',
                ['pr', 'list', '--repo', repo, '--state', 'merged', '--search', sdId, '--json', 'number,headRefName,url,mergedAt', '--limit', String(SCAN_C_LIMIT)],
                { encoding: 'utf8', timeout: 30000 }
              );
              const prs = JSON.parse(result || '[]');
              // SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (SECURITY EXEC finding SEC-9, medium,
              // self-referential — this SD's own key already returns 65/100 before shipping):
              // --search matches the SD key anywhere in a PR title/body/comments, not only on the
              // owning branch (branchBelongsToSd is what narrows that down), and --limit caps the
              // RAW search result set. If the raw set hits the cap, GitHub's relevance ranking may
              // have pushed the actually-owning PR outside the window — a capped, all-filtered-out
              // result is "cannot conclude", not "no evidence".
              if (prs.length >= SCAN_C_LIMIT) scanCSaturated = true;
              const matching = prs.filter(pr => branchBelongsToSd(pr.headRefName, sdId, keySet).belongs);
              mergedPRs.push(...matching.map(pr => ({ ...pr, repo })));
            } catch (_e) {
              // SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (TESTING EXEC finding, medium): a
              // transient gh failure here must NOT silently read as "no merge evidence" — that
              // would mislabel a verification outage as reason:'never_pushed', which matters
              // because FR-4's census keys off that exact code. Track and fail closed below,
              // consistent with the unreadableRepos posture Scan A already takes (~line 730) rather
              // than the historically lenient posture this catch used to have.
              scanCFailed = true;
            }
          }

          if (scanCFailed && mergedPRs.length === 0) {
            return {
              passed: false,
              score: 0,
              max_score: 100,
              issues: [
                `Cannot verify merge evidence for ${sdId}: Scan C (merged-PR search) failed for at least one repo.`,
                'This BLOCKS rather than reporting never_pushed. A gh outage during Scan C is not evidence the SD was never pushed.',
                'Usually gh auth or rate limiting: check `gh auth status`, then re-run.',
                'Bypass available for documented emergencies: --bypass-validation --bypass-reason "<reason>"'
              ],
              warnings: [],
              details: { fail_closed: true, reason: 'scan_c_unreadable' }
            };
          }

          if (scanCSaturated && mergedPRs.length === 0) {
            return {
              passed: false,
              score: 0,
              max_score: 100,
              issues: [
                `Cannot conclude merge evidence for ${sdId}: Scan C's search returned ${SCAN_C_LIMIT}+ results (window saturated) with none matching this SD's branch ownership.`,
                'This BLOCKS rather than reporting never_pushed. A saturated search window is not evidence of absence — the owning PR may have been ranked outside it.',
                'Verify manually (e.g. `gh pr list --state merged --search "<sdKey>" --json headRefName,number,url`) before concluding this SD never shipped.',
                'Bypass available for documented emergencies: --bypass-validation --bypass-reason "<reason>"'
              ],
              warnings: [],
              details: { fail_closed: true, reason: 'scan_c_saturated' }
            };
          }

          // SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (TESTING EXEC finding, high): route the
          // "is this a specimen" decision through the SAME isNeverPushedSpecimen classifier the
          // retro census (FR-4) uses, instead of a second, independently-drifting inline
          // condition. shipReviewFindings gives ship_review_findings-recorded evidence (a
          // pr_number row) one more chance to save an SD Scan A/B/C's live git/gh state missed —
          // e.g. a repo that has since been archived/renamed. supabase is optional (tests pass
          // null); a DB lookup failure here degrades to "no additional evidence", never to a
          // false pass — Scan A/B/C above remain the authoritative, already-fail-closed source.
          let shipReviewFindings = [];
          if (supabase) {
            try {
              // SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (SECURITY EXEC finding, low): bind and
              // log `error` (repo convention: ALWAYS bind error on supabase reads) so a
              // permanently-broken lookup (renamed column, revoked grant) is observable rather
              // than silently indistinguishable from "no rows". Direction stays fail-closed
              // either way — an error still degrades to [], never to a false pass.
              const { data, error: findingsErr } = await supabase
                .from('ship_review_findings')
                .select('id, pr_number, sd_key')
                .eq('sd_key', sdId)
                .limit(5);
              if (findingsErr) {
                console.log(`   ⚠️  ship_review_findings lookup failed (degrading to no additional evidence): ${findingsErr.message}`);
              }
              shipReviewFindings = data || [];
            } catch (_findingsErr) {
              // Non-fatal — see comment above.
            }
          }
          const isSpecimen = isNeverPushedSpecimen({
            sd: { sd_type: ctx.sd.sd_type },
            shipReviewFindings,
            metadata: { openPRs: 0, mergedPRs: mergedPRs.length, unmergedBranches: 0 },
          });

          if (isSpecimen) {
            // DIAGNOSTIC ONLY, never required for the FAIL verdict below. Enumerates LOCAL
            // branches — host-local: if this gate runs on a different machine/worktree than EXEC,
            // this step finds nothing, and the verdict still correctly fails on the strength of
            // Scan A/B/C being empty alone (SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 residual,
            // documented — not a gap this SD claims to close).
            let localCandidate = null;
            for (const { localPath: repoPath } of reposWithPaths) {
              try {
                const localRefs = execSync('git for-each-ref --format=%(refname:short) refs/heads/', {
                  encoding: 'utf8', cwd: repoPath, timeout: 10000
                });
                const localBranches = localRefs.split('\n').map(b => b.trim()).filter(Boolean);
                for (const branch of localBranches) {
                  if (!branchBelongsToSd(branch, sdId, keySet).belongs) continue;
                  try {
                    // SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (SECURITY EXEC finding SEC-1,
                    // CONFIRMED BY EXECUTION): branchBelongsToSd imposes no charset constraint on
                    // the suffix after the SD key, so a local branch name like
                    // `feat/<KEY>-a&whoami` passes the filter and, via execSync's shell
                    // interpolation, executed an injected command when probed. execFileSync with
                    // an argv array (git's own `--` end-of-options marker) never invokes a shell,
                    // so the branch name can never be reparsed as a command regardless of its
                    // characters.
                    const remoteCheck = execFileSync('git', ['ls-remote', '--heads', 'origin', '--', branch], {
                      encoding: 'utf8', cwd: repoPath, timeout: 10000
                    });
                    if (!remoteCheck.trim()) { localCandidate = branch; break; }
                  } catch (_lsErr) {
                    // Cannot confirm remote absence for this candidate — skip naming it.
                  }
                }
              } catch (_forEachErr) {
                // git for-each-ref unavailable in this repo — diagnostic-only, no effect on verdict.
              }
              if (localCandidate) break;
            }

            console.log(`   ❌ No open PR, no unmerged branch, and no merged PR found for ${sdId}`);

            return {
              passed: false,
              score: 0,
              max_score: 100,
              issues: [
                `No branch was ever pushed for ${sdId}: found no open PR, no unmerged remote branch, and no merged PR evidence.`,
                localCandidate
                  ? `  → Local branch found but never pushed to remote: ${localCandidate}`
                  : `  → Checked recognized branch types (${RECOGNIZED_BRANCH_TYPES.join('|')}); none found locally on this host — this diagnostic step is host-local and does not affect the verdict above.`,
                '',
                'REMEDIATION: If code was written, push the branch and open a PR via /ship.',
                `If this SD genuinely ships no code, its sd_type should be one of: ${[...NO_CODE_SD_TYPES].join(', ')}.`,
                'Bypass available for documented emergencies: --bypass-validation --bypass-reason "<reason>"'
              ],
              warnings: [],
              details: {
                checkedPatterns: branchPatterns,
                openPRs: 0,
                unmergedBranches: 0,
                mergedPRs: 0,
                reason: 'never_pushed',
                recognizedBranchTypes: RECOGNIZED_BRANCH_TYPES,
                localCandidate
              }
            };
          }

          console.log(`   ✅ Found ${mergedPRs.length} merged PR(s) as positive evidence — SD has shipped code`);
          mergeEvidence.push(...mergedPRs.map(pr => ({ branch: pr.headRefName, repo: pr.repo, prNumber: pr.number })));
        }

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { checkedPatterns: branchPatterns, openPRs: 0, unmergedBranches: 0, mergeEvidence: mergeEvidence.length }
        };

      } catch (error) {
        // SD-LEO-INFRA-HANDOFF-MERGE-MAIN-001: fail-closed when verification cannot run.
        // Previously returned passed=true score=80 here, which silently allowed completion
        // when gh CLI was unavailable or git operations threw. Witnessed live in
        // SD-MAN-ORCH-S18-S26-PIPELINE-001-A: branch never merged, gate accepted at 88,
        // 24 warnings, no bypass. The fail-open path is the bug — verification failure
        // is not equivalent to verification success.
        console.log(`   ❌ PR verification failed: ${error.message}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [
            `PR verification could not run: ${error.message}`,
            '',
            'REMEDIATION: Resolve the underlying verification error before retrying:',
            '  - gh CLI unauthenticated → run: gh auth login',
            '  - gh CLI not installed → install from https://cli.github.com/',
            '  - Repo path missing → verify EHG/EHG_Engineer paths in repo-paths.js',
            '  - Network/timeout → retry; if persistent, document and use --bypass-validation with reason',
            '',
            'Bypass available for documented emergencies: --bypass-validation --bypass-reason "<reason>"'
          ],
          warnings: [],
          details: { failed: true, reason: error.message, fail_closed: true }
        };
      }
    },
    required: true
  };
}

/**
 * Create Gate 5: Pipeline Flow Verification for standalone code-producing SDs
 * Part of SD-LEO-INFRA-INTEGRATION-AWARE-PRD-001 (FR-5)
 *
 * @returns {Object} Gate definition
 */
export function createPipelineFlowGate() {
  return {
    name: 'GATE_PIPELINE_FLOW',
    validator: async (ctx) => {
      console.log('\n🔄 GATE 5: Pipeline Flow Verification');
      console.log('-'.repeat(50));

      const sdType = ctx.sd?.sd_type || 'feature';

      // Check if this is a code-producing standalone SD
      if (!requiresPipelineFlowVerification(sdType)) {
        console.log(`   SKIPPED: sd_type='${sdType}' does not require pipeline verification`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`Non-code SD type '${sdType}' - pipeline flow not required`],
          details: { skipped: true, reason: `sd_type=${sdType}` }
        };
      }

      // Check if this is an orchestrator (children have their own verification)
      const isOrchestrator = ctx.sd?.parent_sd_id === null && ctx._childCount > 0;
      if (isOrchestrator) {
        console.log('   SKIPPED: Orchestrator SD - verification runs at orchestrator completion');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: ['Orchestrator SD - pipeline flow runs at orchestrator completion']
        };
      }

      try {
        const report = await verifyPipelineFlow({
          sdId: ctx.sd?.id || ctx.sdId,
          stage: 'LEAD-FINAL-APPROVAL',
          scopePaths: ['lib', 'scripts']
        });

        if (report.status === 'skipped' || report.status === 'bypassed') {
          console.log(`   ${report.status.toUpperCase()}: ${report.reasoning_notes?.[0] || 'See report'}`);
          return {
            passed: true,
            score: 80,
            max_score: 100,
            issues: [],
            warnings: [report.reasoning_notes?.[0] || `Pipeline flow ${report.status}`],
            details: { report }
          };
        }

        const coveragePct = ((report.coverage_score || 0) * 100).toFixed(1);
        const thresholdPct = ((report.threshold_used || 0.6) * 100).toFixed(1);

        if (report.status === 'pass') {
          console.log(`   ✅ Pipeline flow: ${coveragePct}% coverage (threshold: ${thresholdPct}%)`);
          return {
            passed: true,
            score: Math.round((report.coverage_score || 0) * 100),
            max_score: 100,
            issues: [],
            warnings: [],
            details: { report }
          };
        }

        // Failed
        console.log(`   ❌ Pipeline flow: ${coveragePct}% BELOW threshold ${thresholdPct}%`);
        if (report.unreachable_exports?.length > 0) {
          console.log('   Unreachable exports:');
          report.unreachable_exports.slice(0, 5).forEach(e =>
            console.log(`      - ${e.file}:${e.symbol}`)
          );
          if (report.unreachable_exports.length > 5) {
            console.log(`      ... and ${report.unreachable_exports.length - 5} more`);
          }
        }

        return {
          passed: false,
          score: Math.round((report.coverage_score || 0) * 100),
          max_score: 100,
          issues: [`Pipeline coverage ${coveragePct}% is below threshold ${thresholdPct}%`],
          warnings: [],
          details: { report }
        };

      } catch (err) {
        console.log(`   ⚠️  Pipeline flow verification error: ${err.message}`);
        return {
          passed: true,
          score: 70,
          max_score: 100,
          issues: [],
          warnings: [`Pipeline flow verification error: ${err.message}`],
          details: { error: err.message }
        };
      }
    },
    required: false // Advisory initially, becomes required after stabilization
  };
}

/** The real validation body — separated so the fail-open wrapper below stays trivial. */
async function runFRDeliveryVerification(ctx, supabase, prdRepo) {
  console.log('\n🔒 GATE 6: FR Delivery Verification (CONST-012)');
  console.log('-'.repeat(50));

  const prd = await prdRepo?.getBySdUuid(ctx.sd.id);

  if (!prd) {
    const { data: children } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('parent_sd_id', ctx.sd.id);

    // SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001: each of the three non-measurement paths below
    // used to emit its own unearned score (100 / 80 / 100), so "delegated to children",
    // "there was no PRD" and "every FR verified delivered" were indistinguishable to the
    // composite mean. They now share ONE representation — NOT_MEASURED_SCORE — and each
    // names its own condition in the warning text.
    if (children && children.length > 0) {
      console.log('   ℹ️  Orchestrator SD — FR verification delegated to children (not measured here)');
      return { passed: true, score: NOT_MEASURED_SCORE, max_score: 100, issues: [], warnings: ['Orchestrator SD — FR verification delegated to children; NOT verified at this boundary'] };
    }

    console.log('   ⚠️  No PRD found — FR delivery NOT verified');
    return { passed: true, score: NOT_MEASURED_SCORE, max_score: 100, issues: [], warnings: ['No PRD found — FR delivery NOT verified (this is a non-measurement, not a pass)'] };
  }

  const frs = prd.functional_requirements || [];
  if (frs.length === 0) {
    console.log('   ℹ️  No functional requirements in PRD — nothing to verify');
    return { passed: true, score: NOT_MEASURED_SCORE, max_score: 100, issues: [], warnings: ['No FRs defined in PRD — FR delivery NOT verified'] };
  }

  console.log(`   📋 Checking ${frs.length} functional requirements (per-FR mapping)...`);

  // SD-LEO-INFRA-HARDEN-LEO-COMPLETION-001: real per-FR classification (validated story
  // REFERENCING the FR id, or approver-gated descope) — NOT the prior any-completed-story
  // proxy that marked every FR delivered if any story existed. Enforcement is gated by
  // LEO_FR_TRACEABILITY_ENFORCE (default OFF = warn-only) so this strict path cannot brick
  // the ~every in-flight SD whose stories do not yet reference FR ids.
  const classification = await classifyFrDelivery(supabase, {
    sdId: ctx.sd.id,
    sdMetadata: ctx.sd.metadata || {},
    functionalRequirements: frs,
    requesterSessionId: ctx.sessionId || ctx.session_id || null,
  });
  const MARKS = { delivered: '✅', descoped: '🔵', unverifiable: '❓', undelivered: '❌' };
  for (const f of classification.frs) {
    console.log(`   ${MARKS[f.status] || '❌'} ${f.id} [${f.status}]: ${safeTruncate(f.description || '', 56)}`);
  }
  const enforced = isFrTraceabilityEnforced();
  console.log(`\n   📊 FR delivery: ${classification.delivered} delivered, ${classification.descoped} descoped, ${classification.undelivered} undelivered, ${classification.unverifiable} unverifiable (enforce=${enforced ? 'ON' : 'OFF/warn-only'})`);
  const result = projectGateResult(classification, { enforced, gateName: 'FR_DELIVERY_VERIFICATION' });
  if (!result.passed) {
    console.log(`   ❌ FR delivery FAILED — ${classification.undelivered}/${classification.total} undelivered`);
  } else if (classification.unverifiable === classification.total) {
    console.log(`   ❓ FR delivery UNVERIFIABLE — this SD does not use the FR-reference convention, so delivery was NOT observed (score ${result.score} = verified delivery only)`);
  } else if (result.warnings.length) {
    console.log('   ⚠️  FR delivery passed (warn-only) with undelivered or unverifiable FRs');
  } else {
    console.log('   ✅ All FRs delivered or approver-descoped');
  }
  return result;
}

/**
 * Create Gate 6: FR Delivery Verification (CONST-012)
 * Verifies all PRD functional requirements have delivery evidence before SD completion.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} prdRepo - PRD repository
 * @returns {Object} Gate definition
 */
export function createFRDeliveryVerificationGate(supabase, prdRepo) {
  return {
    name: 'FR_DELIVERY_VERIFICATION',
    validator: async (ctx) => {
      // QF-20260704-468 (pattern-port of SD-LEO-FIX-RECONCILE-DEAD-ARRIVAL-001 FR-2):
      // ValidationOrchestrator blocks on the STATIC gate.required=true whenever a validator
      // THROWS — so a transient classifier error would hard-fail every LEAD-FINAL even in
      // warn-only mode. Off => thrown errors resolve to a passing warn result; ON => strict
      // propagation preserved (a genuine FR-delivery failure still fails via projectGateResult,
      // which never throws).
      try {
        return await runFRDeliveryVerification(ctx, supabase, prdRepo);
      } catch (err) {
        if (isFrTraceabilityEnforced()) throw err;
        console.log(`   ⚠️  FR delivery verification errored in warn-only mode (fail-open): ${err.message}`);
        // SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001: still non-blocking, but NOT a 100. A broken
        // instrument must not be arithmetically indistinguishable from a verified delivery.
        return {
          passed: true, score: ERRORED_SCORE, max_score: 100, issues: [],
          warnings: [`FR delivery verification ERRORED (warn-only, fail-open) — delivery NOT verified: ${err.message}`],
        };
      }
    },
    // `required` is decided dynamically inside the validator result (projectGateResult sets it
    // from the enforcement flag). Keep the static flag true so the orchestrator consults the
    // result; the OFF path returns required:false to stay warn-only.
    required: true
  };
}

/**
 * Create Gate: Architecture Phase Coverage Exit Gate
 * SD-LEO-ORCH-ARCHITECTURE-PHASE-COVERAGE-001-C
 *
 * Validates that all architecture phases have COMPLETED SDs before
 * an orchestrator can finish. This is the exit counterpart to the
 * ARCHITECTURE_PHASE_COVERAGE entry gate at LEAD-TO-PLAN.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate definition
 */
export function createPhaseCoverageExitGate(supabase) {
  return {
    name: 'ARCHITECTURE_PHASE_COVERAGE_EXIT',
    validator: async (ctx) => {
      console.log('\n🏗️  GATE: Architecture Phase Coverage (Exit)');
      console.log('-'.repeat(50));

      const archKey = ctx.sd?.metadata?.arch_key || ctx.sd?.metadata?.architecture_plan_key;

      if (!archKey) {
        console.log('   ℹ️  No architecture plan linked — gate not applicable');
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['No arch_key — gate skipped'] };
      }

      // PAT-AUTO-999899ce: Child SDs should only verify their own phase, not all sibling phases.
      // Without this, Child A scores 25%, B scores 50%, C scores 75% — all fail before last child.
      // Full coverage is enforced when the parent orchestrator completes.
      if (ctx.sd?.parent_sd_id) {
        const currentSdKey = ctx.sd?.sd_key || ctx.sd?.id;
        console.log(`   ℹ️  Child SD detected (parent: ${ctx.sd.parent_sd_id})`);
        console.log('   ℹ️  Full phase coverage enforced at parent orchestrator level');
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [`Child SD ${currentSdKey} — full coverage enforced at parent level`] };
      }

      try {
        // Get architecture plan with structured phases
        const { data: plan, error: planError } = await supabase
          .from('eva_architecture_plans')
          .select('sections')
          .eq('plan_key', archKey)
          .single();

        if (planError || !plan) {
          console.log(`   ⚠️  Architecture plan '${archKey}' not found`);
          return { passed: true, score: 50, max_score: 100, issues: [], warnings: [`Architecture plan '${archKey}' not found`] };
        }

        const phases = plan.sections?.implementation_phases;
        if (!phases || !Array.isArray(phases) || phases.length === 0) {
          console.log('   ℹ️  No structured phases — gate not applicable');
          return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['No structured phases in architecture plan'] };
        }

        // Get all SDs linked to this architecture plan
        const { data: sds, error: sdsError } = await supabase
          .from('strategic_directives_v2')
          .select('sd_key, title, status')
          .or(`metadata->>arch_key.eq.${archKey},metadata->>architecture_plan_key.eq.${archKey}`);

        if (sdsError) {
          console.log(`   ⚠️  Error querying SDs: ${sdsError.message}`);
          return { passed: true, score: 50, max_score: 100, issues: [], warnings: [`SD query error: ${sdsError.message}`] };
        }

        const sdMap = new Map((sds || []).map(sd => [sd.sd_key, sd]));
        const covered = [];
        const uncovered = [];
        const incomplete = [];
        const deferred = [];

        // PAT-AUTO-30e58b88: Detect phases explicitly marked as deferred/future.
        // These should not block orchestrator completion.
        const DEFERRED_PATTERN = /\b(deferred|future|planned|upcoming|tbd)\b/i;

        // The SD currently being approved should count as covered (avoid circular dependency)
        const currentSdKey = ctx.sd?.sd_key || ctx.sd?.id;

        for (const phase of phases) {
          // Check if this phase is explicitly deferred/future before evaluating coverage
          const phaseTitle = phase.title || '';
          if (DEFERRED_PATTERN.test(phaseTitle)) {
            deferred.push(phase);
            continue;
          }

          const assignedKey = phase.covered_by_sd_key;
          if (!assignedKey) {
            uncovered.push(phase);
            continue;
          }

          // Self-exclusion: the SD being approved right now counts as covered
          if (assignedKey === currentSdKey) {
            covered.push({ phase, sd_key: assignedKey, status: 'pending_approval (current)' });
            continue;
          }

          const sd = sdMap.get(assignedKey);
          if (!sd) {
            // SD key referenced but not found in linked SDs — check if it exists at all
            const { data: anySD } = await supabase
              .from('strategic_directives_v2')
              .select('sd_key, status')
              .eq('sd_key', assignedKey)
              .single();

            if (anySD && ['completed', 'released'].includes(anySD.status)) {
              covered.push({ phase, sd_key: assignedKey, status: anySD.status });
            } else if (anySD) {
              incomplete.push({ phase, sd_key: assignedKey, status: anySD.status });
            } else {
              uncovered.push(phase);
            }
            continue;
          }

          if (['completed', 'released'].includes(sd.status)) {
            covered.push({ phase, sd_key: assignedKey, status: sd.status });
          } else {
            incomplete.push({ phase, sd_key: assignedKey, status: sd.status });
          }
        }

        // Display coverage report
        console.log('   📋 Architecture Phase Coverage (Exit):');
        for (const { phase, sd_key, status } of covered) {
          console.log(`   ✅ Phase ${phase.number}: ${phase.title} → ${sd_key} (${status})`);
        }
        for (const { phase, sd_key, status } of incomplete) {
          console.log(`   ⏳ Phase ${phase.number}: ${phase.title} → ${sd_key} (${status}) — NOT COMPLETE`);
        }
        for (const phase of uncovered) {
          console.log(`   ❌ Phase ${phase.number}: ${phase.title} → NO SD ASSIGNED`);
        }
        for (const phase of deferred) {
          console.log(`   ⏭️  Phase ${phase.number}: ${phase.title} → DEFERRED (excluded from coverage)`);
        }

        // PAT-AUTO-30e58b88: Only count active (non-deferred) phases for coverage
        const activePhaseCount = phases.length - deferred.length;
        const coveredCount = covered.length;
        const coveragePct = activePhaseCount > 0 ? Math.round((coveredCount / activePhaseCount) * 100) : 100;
        console.log(`\n   Coverage: ${coveredCount}/${activePhaseCount} active phases completed (${coveragePct}%)`);
        if (deferred.length > 0) {
          console.log(`   ⏭️  ${deferred.length} phase(s) deferred (excluded): ${deferred.map(d => d.title).join(', ')}`);
        }

        const warnings = [];
        if (deferred.length > 0) {
          warnings.push(`${deferred.length} phase(s) deferred and excluded from coverage: ${deferred.map(d => d.title).join(', ')}`);
        }

        if (incomplete.length > 0 || uncovered.length > 0) {
          const issues = [];
          if (incomplete.length > 0) {
            issues.push(`${incomplete.length} phase(s) have SDs that are not completed: ${incomplete.map(i => `${i.sd_key} (${i.status})`).join(', ')}`);
          }
          if (uncovered.length > 0) {
            issues.push(`${uncovered.length} phase(s) have no SD assigned: ${uncovered.map(u => u.title).join(', ')}`);
          }
          return { passed: false, score: coveragePct, max_score: 100, issues, warnings, details: { deferred_phases: deferred.length } };
        }

        console.log('   ✅ All active architecture phases have completed SDs');
        return { passed: true, score: 100, max_score: 100, issues: [], warnings, details: { deferred_phases: deferred.length } };
      } catch (err) {
        console.log(`   ⚠️  Error: ${err.message}`);
        return { passed: true, score: 50, max_score: 100, issues: [], warnings: [`Phase coverage exit error: ${err.message}`] };
      }
    },
    required: true
  };
}

/**
 * Get all required gates for LEAD-FINAL-APPROVAL
 * @param {Object} supabase - Supabase client
 * @param {Object} prdRepo - PRD repository
 * @param {Object} sd - Strategic Directive (optional, for SD Start Gate)
 * @returns {Array} Array of gate definitions
 */
/**
 * SD-LEO-INFRA-CHAIRMAN-APPLY-FLAG-001 — make metadata.requires_chairman_apply mean something.
 *
 * The flag READ as protection and provided none. Its only functional consumer was
 * check-migration-readiness.mjs, which uses it to make a PR-time drift detector QUIETER, and
 * this executor could not see it at all (verified: zero matches for the flag across the whole
 * lead-final-approval tree, against a populated 31-file/17-gate negative control, plus a live
 * dry-run manifest of 30 gates with none migration-related). So a chairman-gated SD parked at
 * pending_approval/LEAD_FINAL was one adopt-and-auto-chain away from being marked completed
 * with its production migration never applied.
 *
 * THREE migration checks already existed and NOT ONE enforced: verify-migration-apply-state.mjs
 * (mature classifier, CI-only, behind a wrapper that converts errors to exit 0),
 * pending-migrations-check.js (wired into every handoff but defaulted to warn), and
 * LeadFinalApprovalExecutor.verifyMigrationsApplied() (runs here, but CREATE-TABLE-only and
 * fail-open). This gate is the reconciliation, not a fourth mechanism: it REUSES the mature
 * classifier verbatim, by invoking it, and adds the one thing missing — refusal.
 *
 * WIDENED to ALL SDs by SD-LEO-INFRA-COMPLETION-FAIL-OWN-001 (2026-08-10, ruling 454e005a):
 * the requires_chairman_apply flag now selects which clearance ceremony a refusal names, not
 * whether enforcement happens. See the dated comment inside the validator for why the original
 * unflagged-SDs-see-no-change scoping went stale.
 *
 * @returns {Object} Gate definition
 */
export function createChairmanApplyVerificationGate() {
  return {
    name: 'CHAIRMAN_APPLY_VERIFICATION',
    validator: async (ctx) => {
      console.log('\n🔒 GATE: Chairman-Apply Verification');
      console.log('-'.repeat(50));

      const sd = ctx.sd || {};
      const sdKey = sd.sd_key || sd.id || 'unknown';
      // Accept the string 'true' as well as the boolean. Not defensive clutter: the flag's
      // sibling consumer check-migration-readiness.mjs resolveSdGated() (:141) already guards
      // `flag === 'true' || flag === true`, because it reads via raw SQL ->> which always
      // returns text — in-repo evidence that this field demonstrably arrives as a string on
      // some paths. This gate is the HIGHER-consequence consumer (it blocks completion, that
      // one only quiets a warning), so it must not be the LESS tolerant of the two. Erring
      // toward gating is the safe direction; erring toward skipping is the incident.
      const rawFlag = sd.metadata?.requires_chairman_apply;
      const gated = rawFlag === true || rawFlag === 'true';

      // WIDENED 2026-08-10 (SD-LEO-INFRA-COMPLETION-FAIL-OWN-001, coordinator ruling 454e005a):
      // this branch used to return passed:true/applicable:false for unflagged SDs — "Unflagged
      // SDs must see no behaviour change at all." That scoping was correct when written: no role
      // was defined as the applier for an ungated migration, so a completion-block would have
      // been unclearable, and an unclearable block is worse than a silent miss. The standing
      // 2026-06-16 token authority plus ruling 454e005a have since named an applier for BOTH
      // classes (ungated → coordinator, delegable via database-agent; gated → chairman approval
      // + coordinator apply), which is the one condition that makes blocking legitimate. The
      // flag now selects WHICH clearance ceremony a refusal names, not WHETHER enforcement
      // happens. SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 reached status=completed with two
      // absent tables through the old early-return; that is the incident this widening closes.

      try {
        // Which migration(s) does this SD own? Deliberately does NOT reuse or improve
        // pending-migrations-check.js's filename-substring heuristic — sharpening that
        // matching pushes more work into execute-manual-migrations.js, which has no
        // chairman-gate awareness and could auto-apply the very migration being gated.
        // Prefer an explicit declaration; fall back to an SD-key-bearing filename.
        const declared = Array.isArray(sd.metadata?.migration_files) ? sd.metadata.migration_files : [];
        const { classifyMigrationApplyState } = await import('./chairman-apply-state.js');
        const { files, error } = await classifyMigrationApplyState();

        if (error) {
          // FR-3: could-not-determine BLOCKS. Verification failure is not verification success —
          // the same lesson PR_MERGE_VERIFICATION records above, and the reason the CI wrapper's
          // error-to-exit-0 conversion is deliberately NOT inherited here.
          return failClosed(`apply-state could not be determined: ${error}`, sdKey);
        }

        // UNION, never an exclusive branch. An earlier cut used
        //   declared.length ? filter(declared) : filter(sdKey)
        // which the EXEC security and testing reviews independently broke: the moment
        // metadata.migration_files was non-empty — honest partial declaration, stale
        // copy-paste, or a deliberate decoy — the SD-key fallback was SKIPPED ENTIRELY, so a
        // declared already-APPLIED file passed the gate while the real SD-key-named
        // NOT_APPLIED migration sat untouched in the same files[] the gate already held.
        // metadata is a DATABASE WRITE, not part of any git diff, so that bypass would have
        // been invisible to review of the PR that introduced it. A declaration may only ever
        // ADD to what is checked; it can never subtract.
        // SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-LANES-001 (FR-6, coordinator rulings #6/#7):
        // a bare substring match here let an orchestrator PARENT's sd_key (a strict PREFIX of
        // its CHILDREN's sd_keys) "own" a child's staged migration file -- measured live on -H
        // (inheriting H1's DDL) and -C (inheriting C1..C4's). Boundary-anchored via
        // sdKeyOwnsFile: matches the fallback case exactly as before EXCEPT when the character
        // immediately following the matched key is alphanumeric (a longer, different key).
        // declared.includes(f.file) is UNCHANGED -- an explicit declaration remains exact-match.
        const owned = files.filter(f => declared.includes(f.file) || sdKeyOwnsFile(sdKey, f.file));

        // A declaration that names a file the corpus does not contain is itself unverifiable.
        // Without this, declaring ['real.sql','typo.sql'] checked only real.sql and silently
        // dropped the other — a partial match reported as a full pass.
        const missingDeclared = declared.filter(d => !files.some(f => f.file === d));
        if (missingDeclared.length) {
          return failClosed(
            `declared migration(s) not found in the migration corpus: ${missingDeclared.join(', ')}`,
            sdKey,
            ['Correct metadata.migration_files, or remove entries that no longer exist.']
          );
        }

        if (!owned.length) {
          // A gated SD is an explicit promise that a migration exists — finding none is
          // unverifiable, and unverifiable is not verified. An UNGATED SD owning nothing in the
          // corpus is the majority of the fleet: the classifier ran and found nothing of ours to
          // verify, which is a determinate pass, not the old applicable:false skip.
          if (gated) {
            return failClosed(`no migration file could be associated with ${sdKey}`, sdKey,
              ['Declare the SD\'s migration(s) in metadata.migration_files so this gate can verify them.']);
          }
          console.log('   ✅ no migration associated with this SD — nothing to verify');
          return {
            passed: true, score: 100, max_score: 100, issues: [], warnings: [],
            details: { applicable: true, migrationless: true }
          };
        }

        // PARTIAL is not APPLIED. A half-applied migration is precisely the state this gate exists
        // to refuse, and treating it as good would rebuild the fail-open it replaces.
        const unapplied = owned.filter(f => f.status !== 'APPLIED' && f.status !== 'NO_DDL');
        if (unapplied.length) {
          console.log(`   ❌ ${unapplied.length} migration(s) not applied`);
          // Applier-reachability is a requirement, not rationale (ruling 454e005a condition 4):
          // a refusal must name the ceremony that clears it, or it recreates the unclearable
          // block the original scoping existed to avoid.
          const clearance = gated
            ? 'REMEDIATION (chairman-gated): obtain the chairman GO, then the coordinator applies via the apply-migration.js token ceremony, then re-run this handoff.'
            : 'REMEDIATION (ungated): route the apply to the coordinator — delegable via database-agent over the pooler (standing 2026-06-16 token authority; ruling 454e005a) — then re-run this handoff.';
          return {
            passed: false, score: 0, max_score: 100,
            issues: [
              `${sdKey}'s own migration is merged but NOT applied to the live database${gated ? ' (chairman-gated)' : ''}.`,
              ...unapplied.map(f => `  ${f.file} → ${f.status}${f.missing?.length ? ` (missing: ${f.missing.slice(0, 3).join(', ')})` : ''}`),
              '',
              clearance,
              'Completing now would mark the SD done against a migration that was never applied — code-shipped is not capability-live.'
            ],
            warnings: [],
            details: { applicable: true, gated, unapplied: unapplied.map(f => ({ file: f.file, status: f.status })) }
          };
        }

        console.log(`   ✅ ${owned.length} owned migration(s) verified applied`);
        return {
          passed: true, score: 100, max_score: 100, issues: [], warnings: [],
          details: { applicable: true, gated, verified: owned.map(f => f.file) }
        };
      } catch (e) {
        return failClosed(e.message, sdKey);
      }
    },
    required: true
  };
}

/** Shared fail-closed shape for CHAIRMAN_APPLY_VERIFICATION (FR-3). */
function failClosed(reason, sdKey, extra = []) {
  console.log(`   ❌ Chairman-apply verification could not run: ${reason}`);
  return {
    passed: false, score: 0, max_score: 100,
    issues: [
      `Chairman-apply verification could not be completed for ${sdKey}: ${reason}`,
      'This BLOCKS rather than passes: an unverifiable migration is not a verified one.',
      ...extra,
      '',
      'Bypass available for documented emergencies: --bypass-validation --bypass-reason "<reason>"'
    ],
    warnings: [],
    details: { failed: true, reason, fail_closed: true }
  };
}

export function getRequiredGates(supabase, prdRepo, sd = null) {
  const gates = [];

  // SD Start Gate - FIRST (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
  if (sd) {
    gates.push(createSdStartGate(sd.sd_key || sd.id || 'unknown'));
  }

  // PR Precheck — fast-fail before heavyweight gates (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-081)
  // FR-3/FR-4: both PR gates now resolve branch ownership against the SD key set, so both need
  // the client. Passing it here rather than constructing one inside the gate keeps the key-set
  // failure path injectable — and therefore testable in the unit tier.
  gates.push(createPRPrecheckGate(supabase));

  gates.push(createPlanToLeadHandoffGate(supabase));
  gates.push(createUserStoriesCompleteGate(supabase, prdRepo));
  gates.push(createRetrospectiveExistsGate(supabase));
  gates.push(createPRMergeVerificationGate(supabase));

  // Chairman-Apply Verification (SD-LEO-INFRA-CHAIRMAN-APPLY-FLAG-001; widened to all SDs by
  // SD-LEO-INFRA-COMPLETION-FAIL-OWN-001) — refuses completion of
  // any SD whose own staged migration was never applied. Registration is a manual push
  // (there is no directory scan here), so a gate that is written but not pushed silently does
  // nothing — which is how the flag it enforces became decorative in the first place.
  gates.push(createChairmanApplyVerificationGate());

  gates.push(createPipelineFlowGate());

  // FR Delivery Verification (CONST-012 — SD-MAN-ORCH-SCOPE-INTEGRITY-CONSTITUTIONAL-001-C)
  gates.push(createFRDeliveryVerificationGate(supabase, prdRepo));

  // Architecture Phase Coverage Exit Gate (SD-LEO-ORCH-ARCHITECTURE-PHASE-COVERAGE-001-C)
  gates.push(createPhaseCoverageExitGate(supabase));

  // Smoke Test Gate (SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001-A)
  gates.push(createSmokeTestGate(supabase, prdRepo));

  // Automated UAT Gate (SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001-D)
  gates.push(createAutomatedUatGate(supabase));

  // Wiring Validation Gate — catch orphaned components before final merge
  // (SD-LEO-INFRA-CROSS-REPO-ORPHAN-001)
  gates.push(createWiringValidationGate(supabase));

  // Wire Check Gate — AST call graph reachability for new files
  // (SD-MAN-INFRA-FIX-ORCHESTRATOR-CHILD-001-C)
  gates.push(createWireCheckGate(supabase));
  // Invocation-Path Proof — autonomous code (per FR-2 classifier) must have a LIVE production
  // trigger (per FR-1 detector), complementing WIRE_CHECK's reachable-only check.
  // (SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-C)
  gates.push(createInvocationPathGate(supabase));
  gates.push(createPhantomTestAuditGate(supabase));

  // Acceptance-Tier Downgrade Gate (SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-C)
  // Observe-only by default (ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING=true to flip) — see the
  // gate file's header for the full rationale.
  gates.push(createAcceptanceTierDowngradeGate(supabase, prdRepo));

  // Learning-or-Bypass-Resolved Gate — completion safeguard
  // (SD-LEARN-FIX-ADDRESS-PAT-AGENT-001)
  // Blocks status=completed when --bypass-validation was used without corresponding
  // /learn execution (learning_runs row) or follow-up SD resolution. Default warn-only;
  // set ENFORCE_LEARNING_GATE=true to block.
  gates.push(createLearningOrBypassResolvedGate(supabase));

  // ADKAR Adoption Gate — completion safeguard (SD-LEO-INFRA-ADKAR-CHANGE-ADOPTION-FRAMEWORK-001-B)
  // No-op for any SD without metadata.requires_adoption=true. Blocks/warns (per
  // ENFORCE_ADKAR_GATE) on missing ADKAR stage evidence-or-waiver for SDs that set it.
  // Default warn-only; set ENFORCE_ADKAR_GATE=true to block.
  gates.push(createAdkarAdoptionGate(supabase));

  // Deferred-Followups Home — SD-LEO-INFRA-COMPLETION-GATE-DEFERRED-HOME-001
  // Blocks completion when metadata.deferred_followups[] references a follow-up SD that does
  // not exist (or is cancelled). Heuristic-warns on unstructured deferral phrases. Blocking by
  // default; set DEFERRED_HOME_GATE_DISABLED=true for a byte-identical pass-through.
  gates.push(createDeferredFollowupsGate(supabase));

  // Cross-SD File-Overlap Temporal Gate — SHIP oracle (FR-2b)
  // Compares this PR's diff against the merge-commit diffs of SDs shipped
  // within the configured window. High-risk = FAIL, medium = WARN unless ack'd.
  gates.push(createCrossSdFileOverlapTemporalShipGate(supabase));

  // Activation Invariant Gate — blocks completion when an SD ships a
  // schema+UI+worker chain without an end-to-end test asserting the chain
  // works against real data. Closes 26th writer-consumer asymmetry witness.
  // (SD-LEO-INFRA-REQUIRE-END-END-001 FR-2)
  gates.push(createActivationInvariantGate(supabase, prdRepo));

  // SD-FDBK-FIX-GATE-PIPELINE-GATE1-001: GATE4_WORKFLOW_ROI is intentionally NOT pushed here —
  // it already runs at LEAD-FINAL via the validator-registry DB rules (see header note). The (A)
  // fix is the PLAN-TO-LEAD removal + the (B) gate1 key-drift fix so the LFA computation scores
  // correctly. Adding a push here would double-run validateGate4LeadFinal.

  return gates;
}

export default {
  createSdStartGate,
  createPRPrecheckGate,
  createPlanToLeadHandoffGate,
  createUserStoriesCompleteGate,
  createRetrospectiveExistsGate,
  createPRMergeVerificationGate,
  createPipelineFlowGate,
  createFRDeliveryVerificationGate,
  createPhaseCoverageExitGate,
  createSmokeTestGate,
  createAutomatedUatGate,
  createWireCheckGate,
  createPhantomTestAuditGate,
  createAcceptanceTierDowngradeGate,
  createLearningOrBypassResolvedGate,
  createAdkarAdoptionGate,
  createDeferredFollowupsGate,
  createCrossSdFileOverlapTemporalShipGate,
  createActivationInvariantGate,
  getRequiredGates
};
