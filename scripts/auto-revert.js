#!/usr/bin/env node
// Safe, opt-in error recovery helper for CI gate failures
const fs = require('fs');
const path = require('path');

class AutoRevertHelper {
  constructor() {
    this.githubRef = process.env.GITHUB_REF || '';
    this.githubSha = process.env.GITHUB_SHA || '';
    this.prLabels = process.env.PR_LABELS || '';
    this.commitMessage = process.env.COMMIT_MESSAGE || '';
    this.failureReason = process.env.FAILURE_REASON || 'Unknown gate failure';
    this.githubJob = process.env.GITHUB_JOB || 'test';
    this.prNumber = process.env.PR_NUMBER || this.githubRef.match(/pull\/(\d+)/)?.[1] || '';
    this.failingTests = process.env.FAILING_TESTS || '';
  }

  isEligibleForRevert() {
    if (!this.githubRef.includes('pull/')) {
      console.log('❌ Not a PR context - auto-revert not applicable');
      return false;
    }
    if (!this.prLabels.includes('ci-allow-revert')) {
      console.log('❌ Missing ci-allow-revert label - add label to enable recovery');
      return false;
    }
    if (!this.commitMessage.includes('[revert-ok]')) {
      console.log('❌ Missing [revert-ok] in commit message - add marker to confirm');
      return false;
    }
    if (!this.githubSha) {
      console.log('❌ No commit SHA available - cannot generate revert command');
      return false;
    }
    return true;
  }

  generateRecoveryPlan() {
    const revertCommand = `git revert --no-edit ${this.githubSha}`;

    const failingTestsList = this.failingTests
      ? `\nFailing tests (first 20):\n${this.failingTests.split('\n').slice(0, 20).join('\n')}`
      : '';

    const plan = `
=== GATE FAILURE RECOVERY PLAN ===
Failing job: ${this.githubJob}
Failure: ${this.failureReason}
Commit: ${this.githubSha}${failingTestsList}

✅ Recovery authorized (label + marker present)

STEP 1: Revert the failing commit
${revertCommand}

# If you confirm locally:
# gh pr checkout ${this.prNumber} && git revert --no-edit ${this.githubSha}

STEP 2: Fix the issue locally
- Review the failure reason above
- Make necessary corrections
- Run tests locally: npm test

STEP 3: Push fixed version
git add .
git commit -m "fix: Address gate failure after revert"
git push

📌 Note: This is a suggestion only. Review before executing.
=================================
`;

    return { revertCommand, plan };
  }

  writeRecoveryArtifact(content) {
    const artifactDir = process.env.GITHUB_WORKSPACE
      ? path.join(process.env.GITHUB_WORKSPACE, 'artifacts')
      : './artifacts';

    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }

    const recoveryFile = path.join(artifactDir, 'recovery.txt');
    fs.writeFileSync(recoveryFile, content);
    console.log(`✅ Recovery plan written to: ${recoveryFile}`);
  }

  run() {
    if (!this.isEligibleForRevert()) {
      const noOpMessage = 'No recovery plan generated (opt-in requirements not met)';
      console.log(noOpMessage);
      this.writeRecoveryArtifact(noOpMessage);
      return;
    }

    const { plan } = this.generateRecoveryPlan();
    console.log(plan);
    this.writeRecoveryArtifact(plan);
  }
}

// Main execution
if (require.main === module) {
  const helper = new AutoRevertHelper();
  helper.run();
}

module.exports = AutoRevertHelper;