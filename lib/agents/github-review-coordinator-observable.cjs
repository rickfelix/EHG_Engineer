/**
 * GitHub Review Coordinator with Observability
 * Wraps github-review-coordinator.js with performance tracking
 *
 * Usage: Same as GitHub agent, but automatically tracks metrics
 */

const { AgentObservability } = require('./observability.cjs');
const { spawn } = require('child_process');
const path = require('path');

class ObservableGitHubAgent {
  constructor() {
    this.obs = new AgentObservability();
    this.agentPath = path.join(__dirname, 'github-review-coordinator.js');
  }

  async initialize() {
    await this.obs.initialize();
  }

  /**
   * Execute GitHub agent with observability tracking
   * @param {Object} options - Agent options
   * @returns {Promise<Object>} Agent results
   */
  async execute(options = {}) {
    if (!this.obs.initialized) {
      await this.initialize();
    }

    const tracker = this.obs.startTracking('GITHUB', {
      operation: options.operation || 'review',
      prNumber: options.prNumber,
      executionMode: 'wrapped',
    });

    try {
      console.log('⚙️  Executing GitHub Review Coordinator with observability...\n');

      // Execute the actual agent
      const result = await this._executeAgent(options);

      await tracker.end({
        success: result.success,
        data: {
          checksRun: result.data?.checksRun || 0,
          checksPassed: result.data?.checksPassed || 0,
          checksFailed: result.data?.checksFailed || 0,
          filesReviewed: result.data?.filesReviewed || 0,
          commentsAdded: result.data?.commentsAdded || 0,
          reviewScore: result.data?.reviewScore || 100,
        },
      });

      return result;
    } catch (error) {
      await tracker.end({
        success: false,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Execute the actual GitHub agent
   * @private
   */
  async _executeAgent(options) {
    return new Promise((resolve, reject) => {
      const args = [];
      if (options.operation) args.push(`--operation=${options.operation}`);
      if (options.prNumber) args.push(`--pr=${options.prNumber}`);

      const child = spawn('node', [this.agentPath, ...args], {
        stdio: ['inherit', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        process.stdout.write(output);
      });

      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        process.stderr.write(output);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            data: this._parseOutput(stdout),
            output: stdout,
          });
        } else {
          reject(new Error(`GitHub agent exited with code ${code}\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute GitHub agent: ${error.message}`));
      });
    });
  }

  /**
   * Parse agent output to extract metrics
   * @private
   */
  _parseOutput(output) {
    const metrics = {
      checksRun: 0,
      checksPassed: 0,
      checksFailed: 0,
      filesReviewed: 0,
      commentsAdded: 0,
      reviewScore: 100,
    };

    // Try to extract check counts
    const checksMatch = output.match(/(\d+)\s+checks?\s+(?:run|executed)/i);
    if (checksMatch) metrics.checksRun = parseInt(checksMatch[1]);

    const passedMatch = output.match(/(\d+)\s+(?:checks?\s+)?passed/i);
    if (passedMatch) metrics.checksPassed = parseInt(passedMatch[1]);

    const failedMatch = output.match(/(\d+)\s+(?:checks?\s+)?failed/i);
    if (failedMatch) metrics.checksFailed = parseInt(failedMatch[1]);

    const filesMatch = output.match(/(\d+)\s+files?\s+reviewed/i);
    if (filesMatch) metrics.filesReviewed = parseInt(filesMatch[1]);

    const commentsMatch = output.match(/(\d+)\s+comments?\s+added/i);
    if (commentsMatch) metrics.commentsAdded = parseInt(commentsMatch[1]);

    // Try to extract review score
    const scoreMatch = output.match(/review\s+score:\s*(\d+)/i);
    if (scoreMatch) metrics.reviewScore = parseInt(scoreMatch[1]);

    return metrics;
  }
}

// Allow both module.exports and direct execution
module.exports = { ObservableGitHubAgent };

// CLI usage
if (require.main === module) {
  const agent = new ObservableGitHubAgent();

  agent.execute({
    operation: process.argv[2] || 'review',
    prNumber: process.argv[3],
  })
    .then((result) => {
      console.log('\n✅ GitHub Agent completed with observability tracking');
      console.log(`Checks: ${result.data.checksRun}, Passed: ${result.data.checksPassed}, Score: ${result.data.reviewScore}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ GitHub Agent failed:', error.message);
      process.exit(1);
    });
}
