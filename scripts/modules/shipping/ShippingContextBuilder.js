/**
 * ShippingContextBuilder - Builds rich context for LLM shipping decisions
 *
 * Gathers comprehensive context for GPT-5.2 to make intelligent decisions:
 * - SD metadata from database
 * - Git state (branch, commits, changes)
 * - CI/CD status (workflow runs, checks)
 * - PR status (if exists)
 * - Test results
 * - Risk assessment
 *
 * @module shipping/ShippingContextBuilder
 * @version 1.0.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

export class ShippingContextBuilder {
  /**
   * @param {string} sdId - Strategic Directive ID
   * @param {string} repoPath - Path to git repository
   * @param {Object} options - Additional options
   */
  constructor(sdId, repoPath, options = {}) {
    this.sdId = sdId;
    this.repoPath = repoPath;
    this.options = options;
    this.supabase = null;
  }

  async initialize() {
    if (!this.supabase) {
      this.supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
    }
  }

  /**
   * Build complete context for shipping decision
   * @param {string} handoffType - EXEC-TO-PLAN or LEAD-FINAL-APPROVAL
   * @returns {Promise<Object>} Complete shipping context
   */
  async buildContext(handoffType) {
    await this.initialize();

    const [sd, git, ci, pr, tests, risk, handoffResults] = await Promise.all([
      this.getSDContext(),
      this.getGitContext(),
      this.getCIContext(),
      this.getPRContext(),
      this.getTestContext(),
      this.assessRisk(),
      this.getHandoffResults()
    ]);

    return {
      sdId: this.sdId,
      handoffType,
      repoPath: this.repoPath,
      timestamp: new Date().toISOString(),
      sd,
      git,
      ci,
      pr,
      tests,
      risk,
      handoffResults
    };
  }

  /**
   * Get Strategic Directive context from database
   */
  async getSDContext() {
    try {
      const { data: sd } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, legacy_id, title, description, status, sd_type, current_phase, target_application, priority')
        .or(`legacy_id.eq.${this.sdId},id.eq.${this.sdId}`)
        .single();

      return sd || { id: this.sdId, title: 'Unknown', sd_type: 'feature' };
    } catch (error) {
      console.warn(`[ShippingContext] SD fetch error: ${error.message}`);
      return { id: this.sdId, title: 'Unknown', sd_type: 'feature' };
    }
  }

  /**
   * Get comprehensive git state
   */
  async getGitContext() {
    const context = {
      currentBranch: null,
      commitsAhead: 0,
      hasUncommittedChanges: false,
      hasUnstagedChanges: false,
      unpushedCommits: 0,
      filesChanged: [],
      filesChangedCount: 0,
      linesAdded: 0,
      linesRemoved: 0,
      recentCommits: [],
      branchAge: null,
      lastCommitMessage: null
    };

    try {
      // Get current branch
      const { stdout: branch } = await execAsync(
        `cd "${this.repoPath}" && git branch --show-current`
      );
      context.currentBranch = branch.trim();

      // Check for uncommitted changes
      const { stdout: status } = await execAsync(
        `cd "${this.repoPath}" && git status --porcelain`
      );
      const statusLines = status.trim().split('\n').filter(l => l);
      context.hasUncommittedChanges = statusLines.length > 0;
      context.hasUnstagedChanges = statusLines.some(
        l => l[1] === 'M' || l[1] === 'D' || l[0] === '?'
      );

      // Get commits ahead of main
      try {
        const { stdout: ahead } = await execAsync(
          `cd "${this.repoPath}" && git rev-list --count main..HEAD 2>/dev/null || echo "0"`
        );
        context.commitsAhead = parseInt(ahead.trim()) || 0;
      } catch {
        context.commitsAhead = 0;
      }

      // Get unpushed commits
      try {
        const { stdout: unpushed } = await execAsync(
          `cd "${this.repoPath}" && git log @{u}.. --oneline 2>/dev/null | wc -l`
        );
        context.unpushedCommits = parseInt(unpushed.trim()) || 0;
      } catch {
        // No upstream set
        context.unpushedCommits = context.commitsAhead;
      }

      // Get files changed vs main
      try {
        const { stdout: files } = await execAsync(
          `cd "${this.repoPath}" && git diff main --name-only 2>/dev/null || echo ""`
        );
        context.filesChanged = files.trim().split('\n').filter(f => f);
        context.filesChangedCount = context.filesChanged.length;
      } catch {
        context.filesChanged = [];
      }

      // Get lines added/removed
      try {
        const { stdout: diffStat } = await execAsync(
          `cd "${this.repoPath}" && git diff main --shortstat 2>/dev/null || echo ""`
        );
        const addMatch = diffStat.match(/(\d+) insertion/);
        const delMatch = diffStat.match(/(\d+) deletion/);
        context.linesAdded = addMatch ? parseInt(addMatch[1]) : 0;
        context.linesRemoved = delMatch ? parseInt(delMatch[1]) : 0;
      } catch {
        // Ignore
      }

      // Get recent commits
      try {
        const { stdout: commits } = await execAsync(
          `cd "${this.repoPath}" && git log -10 --format='%H|%s|%cr' 2>/dev/null || echo ""`
        );
        context.recentCommits = commits.trim().split('\n')
          .filter(l => l)
          .map(line => {
            const [sha, message, age] = line.split('|');
            return { sha, message, age };
          });
        if (context.recentCommits.length > 0) {
          context.lastCommitMessage = context.recentCommits[0].message;
        }
      } catch {
        context.recentCommits = [];
      }

      // Get branch age
      try {
        const { stdout: branchDate } = await execAsync(
          `cd "${this.repoPath}" && git for-each-ref --format='%(committerdate:unix)' refs/heads/${context.currentBranch}`
        );
        const branchTimestamp = parseInt(branchDate.trim());
        if (branchTimestamp) {
          const ageMs = Date.now() - (branchTimestamp * 1000);
          context.branchAge = {
            ms: ageMs,
            hours: Math.round(ageMs / (1000 * 60 * 60)),
            days: Math.round(ageMs / (1000 * 60 * 60 * 24))
          };
        }
      } catch {
        context.branchAge = null;
      }

    } catch (error) {
      console.warn(`[ShippingContext] Git context error: ${error.message}`);
    }

    return context;
  }

  /**
   * Get CI/CD status from GitHub
   */
  async getCIContext() {
    const context = {
      workflowsPassing: false,
      lastRunStatus: 'unknown',
      failingChecks: [],
      recentRuns: [],
      checksComplete: false
    };

    try {
      // Get recent workflow runs
      const { stdout: runs } = await execAsync(
        `cd "${this.repoPath}" && gh run list --limit 5 --json conclusion,status,name,createdAt 2>/dev/null || echo "[]"`,
        { timeout: 15000 }
      );

      const runData = JSON.parse(runs);
      context.recentRuns = runData;

      if (runData.length > 0) {
        context.lastRunStatus = runData[0].conclusion || runData[0].status;
        context.workflowsPassing = runData[0].conclusion === 'success';
        context.checksComplete = runData[0].status === 'completed';
        context.failingChecks = runData
          .filter(r => r.conclusion === 'failure')
          .map(r => r.name);
      }
    } catch (error) {
      console.warn(`[ShippingContext] CI context error: ${error.message}`);
    }

    return context;
  }

  /**
   * Get PR status if one exists for current branch
   */
  async getPRContext() {
    const context = {
      number: null,
      state: null,
      mergeable: null,
      reviewStatus: null,
      url: null,
      title: null,
      checksStatus: null
    };

    try {
      const git = await this.getGitContext();
      if (!git.currentBranch || git.currentBranch === 'main') {
        return context;
      }

      // Find PR for current branch
      const { stdout: prList } = await execAsync(
        `cd "${this.repoPath}" && gh pr list --head ${git.currentBranch} --state all --json number,state,mergeable,url,reviewDecision,title,statusCheckRollup --limit 1 2>/dev/null || echo "[]"`,
        { timeout: 15000 }
      );

      const prs = JSON.parse(prList);
      if (prs.length > 0) {
        const pr = prs[0];
        context.number = pr.number;
        context.state = pr.state;
        context.mergeable = pr.mergeable;
        context.reviewStatus = pr.reviewDecision;
        context.url = pr.url;
        context.title = pr.title;

        // Summarize check status
        if (pr.statusCheckRollup && pr.statusCheckRollup.length > 0) {
          const allPassed = pr.statusCheckRollup.every(c => c.conclusion === 'SUCCESS');
          const anyFailed = pr.statusCheckRollup.some(c => c.conclusion === 'FAILURE');
          context.checksStatus = allPassed ? 'passing' : anyFailed ? 'failing' : 'pending';
        }
      }
    } catch (error) {
      console.warn(`[ShippingContext] PR context error: ${error.message}`);
    }

    return context;
  }

  /**
   * Get test results status
   */
  async getTestContext() {
    const context = {
      unitTestsPassing: null,
      e2eTestsPassing: null,
      lastTestRun: null,
      coveragePercent: null
    };

    // Try to get test status from database (user_stories e2e_test_status)
    try {
      const { data: stories } = await this.supabase
        .from('user_stories')
        .select('e2e_test_status, validation_status')
        .eq('sd_id', this.sdId);

      if (stories && stories.length > 0) {
        const passingStories = stories.filter(s => s.e2e_test_status === 'passing');
        context.e2eTestsPassing = passingStories.length === stories.length;
      }
    } catch {
      // Ignore
    }

    // Infer from CI if available
    const ci = await this.getCIContext();
    if (ci.workflowsPassing) {
      context.unitTestsPassing = true;
      if (context.e2eTestsPassing === null) {
        context.e2eTestsPassing = true;
      }
    }

    return context;
  }

  /**
   * Assess deployment risk based on files changed
   */
  async assessRisk() {
    const risk = {
      level: 'low',
      factors: [],
      score: 0 // 0-100, higher = riskier
    };

    const git = await this.getGitContext();

    // High-risk file patterns
    const highRiskPatterns = [
      { pattern: /database\/migrations/, name: 'Database migration', points: 30 },
      { pattern: /schema.*\.sql/, name: 'Schema change', points: 25 },
      { pattern: /auth/i, name: 'Authentication code', points: 20 },
      { pattern: /\.env/, name: 'Environment config', points: 40 },
      { pattern: /secrets?/i, name: 'Secrets file', points: 50 },
      { pattern: /credentials?/i, name: 'Credentials file', points: 50 },
      { pattern: /rls|row.level.security/i, name: 'RLS policy', points: 25 }
    ];

    // Medium-risk patterns
    const mediumRiskPatterns = [
      { pattern: /package\.json$/, name: 'Package dependencies', points: 10 },
      { pattern: /package-lock\.json$/, name: 'Lock file', points: 5 },
      { pattern: /api\//, name: 'API endpoint', points: 10 },
      { pattern: /server\//, name: 'Server code', points: 10 },
      { pattern: /middleware/, name: 'Middleware', points: 10 }
    ];

    for (const file of git.filesChanged || []) {
      for (const { pattern, name, points } of highRiskPatterns) {
        if (pattern.test(file)) {
          risk.factors.push(`High-risk: ${name} (${file})`);
          risk.score += points;
        }
      }
      for (const { pattern, name, points } of mediumRiskPatterns) {
        if (pattern.test(file)) {
          risk.factors.push(`Medium-risk: ${name} (${file})`);
          risk.score += points;
        }
      }
    }

    // Large PRs are risky
    if (git.filesChangedCount > 20) {
      risk.factors.push(`Large change: ${git.filesChangedCount} files`);
      risk.score += 15;
    }
    if (git.linesAdded + git.linesRemoved > 500) {
      risk.factors.push(`Many lines changed: +${git.linesAdded}/-${git.linesRemoved}`);
      risk.score += 10;
    }

    // Determine level
    if (risk.score >= 40) {
      risk.level = 'high';
    } else if (risk.score >= 15) {
      risk.level = 'medium';
    } else {
      risk.level = 'low';
    }

    return risk;
  }

  /**
   * Get recent handoff results for this SD
   */
  async getHandoffResults() {
    const results = {
      lastHandoff: null,
      gatesPassed: null,
      gateScore: null
    };

    try {
      const { data: handoff } = await this.supabase
        .from('leo_handoff_executions')
        .select('handoff_type, status, validation_score, validation_passed, created_at')
        .eq('sd_id', this.sdId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (handoff) {
        results.lastHandoff = handoff.handoff_type;
        results.gatesPassed = handoff.validation_passed;
        results.gateScore = handoff.validation_score;
      }
    } catch {
      // No handoffs yet
    }

    return results;
  }
}

export default ShippingContextBuilder;
