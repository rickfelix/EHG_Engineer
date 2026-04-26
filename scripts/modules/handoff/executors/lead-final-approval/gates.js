/**
 * Gate Validators Domain
 * Defines validation gates for LEAD-FINAL-APPROVAL handoff
 *
 * @module lead-final-approval/gates
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { safeTruncate } from '../../../../../lib/utils/safe-truncate.js';
import { resolveRepoPath, ENGINEER_ROOT } from '../../../../../lib/repo-paths.js';
import { getTierForSD } from '../../../sd-type-checker.js';
import { getFilteredRetrospective } from '../../retro-filters.js';

// Core Protocol Gate - SD Start Gate (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
import { createSdStartGate } from '../../gates/core-protocol-gate.js';

// Pipeline Flow Verifier (SD-LEO-INFRA-INTEGRATION-AWARE-PRD-001 FR-5)
import { verifyPipelineFlow, requiresPipelineFlowVerification } from '../../../../../lib/pipeline-flow-verifier.js';

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
import { createLearningOrBypassResolvedGate } from './gates/learning-or-bypass-resolved-gate.js';
export { createLearningOrBypassResolvedGate };

// Cross-SD File-Overlap Temporal Gate — SHIP oracle (SD-LEO-INFRA-CROSS-FILE-OVERLAP-001 FR-2b)
import { createCrossSdFileOverlapTemporalShipGate } from './gates/cross-sd-file-overlap-temporal-ship.js';
export { createCrossSdFileOverlapTemporalShipGate };

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
  return {
    name: 'RETROSPECTIVE_EXISTS',
    validator: async (ctx) => {
      console.log('\n🔒 GATE 3: Retrospective Verification');
      console.log('-'.repeat(50));

      // SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001: Use shared three-filter helper so
      // this gate and PLAN-TO-LEAD retrospective-quality.js share the same invariants
      // (existence + retro_type=SD_COMPLETION + created_at > LEAD-TO-PLAN acceptance).
      // Handoff-time retros share retro_type='SD_COMPLETION' so the timestamp filter
      // is what distinguishes them from true SD-completion retrospectives.
      const { retrospective, leadToPlanAcceptedAt } =
        await getFilteredRetrospective(ctx.sd.id, ctx.sd.created_at || null, supabase);

      if (!retrospective) {
        const sdKey = ctx.sd?.sd_key || ctx.sdId || 'unknown';
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`No SD-completion retrospective found for ${sdKey} (must be retro_type=SD_COMPLETION with created_at > ${leadToPlanAcceptedAt}) - run RETRO sub-agent first`],
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
        const score = Math.max(retrospective.quality_score || 55, 55);
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

      // Tier 3 SDs: require quality_score >= 60
      const minScore = 60;
      if (retrospective.quality_score < minScore) {
        return {
          passed: false,
          score: retrospective.quality_score,
          max_score: 100,
          issues: [`Retrospective quality score ${retrospective.quality_score}% is below minimum ${minScore}%`],
          warnings: []
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
  };
}

/**
 * Create PR Precheck Gate: Fast-fail on open PRs before heavyweight gates.
 * Prevents retry storms where sessions run LEAD-FINAL-APPROVAL without merging PRs.
 * (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-081)
 *
 * @returns {Object} Gate definition
 */
export function createPRPrecheckGate() {
  return {
    name: 'PR_PRECHECK',
    validator: async (ctx) => {
      console.log('\n⚡ PR PRECHECK: Quick open-PR scan');
      console.log('-'.repeat(50));

      const sdId = ctx.sd.sd_key || ctx.sd.id;
      const branchPatterns = [`feat/${sdId}`, `fix/${sdId}`, `docs/${sdId}`, `test/${sdId}`];

      try {
        const { execSync } = await import('child_process');
        const repos = ['rickfelix/ehg', 'rickfelix/EHG_Engineer'];

        for (const repo of repos) {
          try {
            const result = execSync(
              `gh pr list --repo ${repo} --state open --json number,headRefName --limit 50`,
              { encoding: 'utf8', timeout: 15000 }
            );
            const prs = JSON.parse(result || '[]');
            const matching = prs.filter(pr =>
              branchPatterns.some(p => pr.headRefName.toLowerCase().includes(p.toLowerCase()))
            );

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
export function createPRMergeVerificationGate() {
  return {
    name: 'PR_MERGE_VERIFICATION',
    validator: async (ctx) => {
      console.log('\n🔒 GATE 4: PR Merge Verification');
      console.log('   ℹ️  Required order: EXEC → /ship (merge PR) → LEAD-FINAL-APPROVAL');
      console.log('-'.repeat(50));

      const sdId = ctx.sd.sd_key || ctx.sd.id;

      // Build expected branch name pattern for this SD
      const branchPatterns = [
        `feat/${sdId}`,
        `fix/${sdId}`,
        `docs/${sdId}`,
        `test/${sdId}`
      ];

      try {
        const { execSync } = await import('child_process');

        const repos = ['rickfelix/ehg', 'rickfelix/EHG_Engineer'];
        const openPRs = [];

        for (const repo of repos) {
          try {
            const result = execSync(
              `gh pr list --repo ${repo} --state open --json number,title,headRefName,url --limit 100`,
              { encoding: 'utf8', timeout: 30000 }
            );

            const prs = JSON.parse(result || '[]');

            const matchingPRs = prs.filter(pr =>
              branchPatterns.some(pattern =>
                pr.headRefName.toLowerCase().includes(pattern.toLowerCase())
              )
            );

            if (matchingPRs.length > 0) {
              openPRs.push(...matchingPRs.map(pr => ({
                ...pr,
                repo: repo
              })));
            }
          } catch (repoError) {
            console.log(`   ⚠️  Could not check ${repo}: ${safeTruncate(repoError.message || '', 50) || 'unknown error'}`);
          }
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
              ...openPRs.map(pr => `  → gh pr merge ${pr.number} --repo ${pr.repo} --merge --delete-branch`)
            ],
            warnings: [],
            details: { openPRs: openPRs.map(pr => ({ number: pr.number, repo: pr.repo, url: pr.url })) }
          };
        }

        console.log('   ✅ No open PRs found for this SD');
        console.log(`   Checked patterns: ${branchPatterns.join(', ')}`);

        // Check for unmerged branches with commits
        const unmergedBranches = [];
        for (const repo of repos) {
          try {
            const repoPath = repo === 'rickfelix/ehg' ? getRepoPath('EHG') : getRepoPath('EHG_Engineer');

            // SD-LLM-CONTRACT-PIPELINE-TEST-ORCH-001-B RCA: prune stale remote-tracking refs
            // before checking branches. Without this, squash-merged branches whose remote was
            // deleted on GitHub still appear in `git branch -r` and trigger false failures.
            try {
              execSync('git fetch --prune origin', { encoding: 'utf8', cwd: repoPath, timeout: 30000 });
            } catch (_fetchErr) {
              console.log('   ⚠️  Could not fetch latest remote state — branch check may use stale data');
            }

            const branchList = execSync('git branch -r', { encoding: 'utf8', cwd: repoPath, timeout: 10000 });

            for (const pattern of branchPatterns) {
              const matchingBranches = branchList.split('\n')
                .map(b => b.trim())
                .filter(b => b.toLowerCase().includes(pattern.toLowerCase()) && !b.includes('HEAD'));

              for (const branch of matchingBranches) {
                const cleanBranch = branch.replace('origin/', '');
                try {
                  const commitCount = execSync(
                    `git rev-list --count origin/main..${branch}`,
                    { encoding: 'utf8', cwd: repoPath, timeout: 10000 }
                  ).trim();

                  if (parseInt(commitCount) > 0) {
                    // Check if this branch has a merged PR (squash-merge artifact)
                    // After squash merge, the remote branch may still exist briefly or
                    // the worktree branch diverges from main. If the PR is merged, skip.
                    let prMerged = false;
                    try {
                      const prStatus = execSync(
                        `gh pr list --head "${cleanBranch}" --state merged --json number --limit 1`,
                        { encoding: 'utf8', cwd: repoPath, timeout: 15000 }
                      ).trim();
                      const mergedPrs = JSON.parse(prStatus || '[]');
                      if (mergedPrs.length > 0) {
                        prMerged = true;
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
              ...verified.map(b => `  → cd to ${b.repo} repo, then: git push -u origin ${b.branch} && gh pr create && gh pr merge --merge --delete-branch`),
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

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { checkedPatterns: branchPatterns, openPRs: 0, unmergedBranches: 0 }
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
      console.log('\n🔒 GATE 6: FR Delivery Verification (CONST-012)');
      console.log('-'.repeat(50));

      const prd = await prdRepo?.getBySdUuid(ctx.sd.id);

      if (!prd) {
        const { data: children } = await supabase
          .from('strategic_directives_v2')
          .select('id')
          .eq('parent_sd_id', ctx.sd.id);

        if (children && children.length > 0) {
          console.log('   ℹ️  Orchestrator SD — FR verification delegated to children');
          return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['Orchestrator SD — FR verification delegated to children'] };
        }

        console.log('   ⚠️  No PRD found — skipping FR verification');
        return { passed: true, score: 80, max_score: 100, issues: [], warnings: ['No PRD found — FR delivery verification skipped'] };
      }

      const frs = prd.functional_requirements || [];
      if (frs.length === 0) {
        console.log('   ℹ️  No functional requirements in PRD');
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['No FRs defined in PRD'] };
      }

      console.log(`   📋 Checking ${frs.length} functional requirements...`);

      // Evidence sources: completed user stories + accepted handoffs
      const { data: stories } = await supabase
        .from('user_stories')
        .select('id, title, status')
        .eq('sd_id', ctx.sd.id);

      const completedStories = (stories || []).filter(s =>
        s.status === 'completed' || s.status === 'done' || s.status === 'validated'
      );

      const { data: handoffs } = await supabase
        .from('sd_phase_handoffs')
        .select('handoff_type, status')
        .eq('sd_id', ctx.sd.id)
        .eq('status', 'accepted');

      const hasExecHandoff = (handoffs || []).some(h => h.handoff_type === 'PLAN-TO-LEAD');

      const frResults = [];
      for (const fr of frs) {
        const frId = fr.id || `FR-${frs.indexOf(fr) + 1}`;
        const evidenced = completedStories.length > 0 || hasExecHandoff;
        frResults.push({ id: frId, description: safeTruncate(fr.description || '', 80), evidenced });
        console.log(`   ${evidenced ? '✅' : '❌'} ${frId}: ${safeTruncate(fr.description || '', 60)}`);
      }

      const evidencedCount = frResults.filter(r => r.evidenced).length;
      const coveragePct = Math.round((evidencedCount / frs.length) * 100);
      console.log(`\n   📊 FR Coverage: ${evidencedCount}/${frs.length} (${coveragePct}%)`);

      if (coveragePct < 100) {
        const missing = frResults.filter(r => !r.evidenced);
        return {
          passed: false, score: coveragePct, max_score: 100,
          issues: [`FR delivery coverage ${coveragePct}% — ${missing.length} FR(s) lack evidence`, ...missing.map(m => `  Missing: ${m.id}`)],
          warnings: [], details: { frResults, coveragePct }
        };
      }

      console.log('   ✅ All FRs have delivery evidence');
      return { passed: true, score: 100, max_score: 100, issues: [], warnings: [], details: { frResults, coveragePct: 100 } };
    },
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
export function getRequiredGates(supabase, prdRepo, sd = null) {
  const gates = [];

  // SD Start Gate - FIRST (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
  if (sd) {
    gates.push(createSdStartGate(sd.sd_key || sd.id || 'unknown'));
  }

  // PR Precheck — fast-fail before heavyweight gates (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-081)
  gates.push(createPRPrecheckGate());

  gates.push(createPlanToLeadHandoffGate(supabase));
  gates.push(createUserStoriesCompleteGate(supabase, prdRepo));
  gates.push(createRetrospectiveExistsGate(supabase));
  gates.push(createPRMergeVerificationGate());
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

  // Learning-or-Bypass-Resolved Gate — completion safeguard
  // (SD-LEARN-FIX-ADDRESS-PAT-AGENT-001)
  // Blocks status=completed when --bypass-validation was used without corresponding
  // /learn execution (learning_runs row) or follow-up SD resolution. Default warn-only;
  // set ENFORCE_LEARNING_GATE=true to block.
  gates.push(createLearningOrBypassResolvedGate(supabase));

  // Cross-SD File-Overlap Temporal Gate — SHIP oracle (FR-2b)
  // Compares this PR's diff against the merge-commit diffs of SDs shipped
  // within the configured window. High-risk = FAIL, medium = WARN unless ack'd.
  gates.push(createCrossSdFileOverlapTemporalShipGate(supabase));

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
  createLearningOrBypassResolvedGate,
  createCrossSdFileOverlapTemporalShipGate,
  getRequiredGates
};
