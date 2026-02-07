/**
 * Gate Validators Domain
 * Defines validation gates for LEAD-FINAL-APPROVAL handoff
 *
 * @module lead-final-approval/gates
 */

import path from 'path';
import { fileURLToPath } from 'url';

// Core Protocol Gate - SD Start Gate (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
import { createSdStartGate } from '../../gates/core-protocol-gate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get repository path by name
 * @param {string} repoName - Repository name
 * @returns {string} Repository path
 */
function getRepoPath(repoName) {
  const normalizedName = repoName.toLowerCase();
  if (normalizedName.includes('engineer')) {
    return path.resolve(__dirname, '../../../../../');
  }
  return path.resolve(__dirname, '../../../../../../ehg');
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

      const { data: retrospective } = await supabase
        .from('retrospectives')
        .select('id, quality_score, status, created_at')
        .eq('sd_id', ctx.sd.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!retrospective) {
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: ['No retrospective found - run RETRO sub-agent first'],
          warnings: []
        };
      }

      console.log(`   Retrospective found: ${retrospective.id.substring(0, 8)}...`);
      console.log(`   Quality score: ${retrospective.quality_score}`);
      console.log(`   Status: ${retrospective.status}`);

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
            console.log(`   ⚠️  Could not check ${repo}: ${repoError.message?.substring(0, 50) || 'unknown error'}`);
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
              ...openPRs.map(pr => `  → PR #${pr.number} (${pr.repo}): ${pr.url}`)
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
                    unmergedBranches.push({
                      branch: cleanBranch,
                      repo: repo,
                      commits: parseInt(commitCount)
                    });
                  }
                } catch (_e) {
                  // Branch comparison failed - skip
                }
              }
            }
          } catch (_repoError) {
            // Skip repo if can't check branches
          }
        }

        if (unmergedBranches.length > 0) {
          console.log(`   ❌ Found ${unmergedBranches.length} unmerged branch(es) with commits:`);
          unmergedBranches.forEach(b => {
            console.log(`      - ${b.branch} (${b.commits} commits ahead of main)`);
            console.log(`        Repo: ${b.repo}`);
          });

          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [
              `${unmergedBranches.length} unmerged branch(es) with commits - create PRs and merge before completion`,
              ...unmergedBranches.map(b => `  → ${b.branch} (${b.commits} commits) in ${b.repo}`)
            ],
            warnings: [],
            details: {
              checkedPatterns: branchPatterns,
              openPRs: 0,
              unmergedBranches: unmergedBranches
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
        console.log(`   ⚠️  PR verification skipped: ${error.message}`);
        return {
          passed: true,
          score: 80,
          max_score: 100,
          issues: [],
          warnings: [`PR verification could not run: ${error.message}. Verify manually that all PRs are merged.`],
          details: { skipped: true, reason: error.message }
        };
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
  // Ensures CLAUDE_CORE.md is read before any SD work
  if (sd) {
    gates.push(createSdStartGate(sd.sd_key || sd.id || 'unknown'));
  }

  gates.push(createPlanToLeadHandoffGate(supabase));
  gates.push(createUserStoriesCompleteGate(supabase, prdRepo));
  gates.push(createRetrospectiveExistsGate(supabase));
  gates.push(createPRMergeVerificationGate());

  return gates;
}

export default {
  createSdStartGate,
  createPlanToLeadHandoffGate,
  createUserStoriesCompleteGate,
  createRetrospectiveExistsGate,
  createPRMergeVerificationGate,
  getRequiredGates
};
