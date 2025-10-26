/**
 * Validation Sub-Agent with Observability
 * Wraps intelligent-base-sub-agent.js (used for validation) with performance tracking
 *
 * Usage: Same as validation agent, but automatically tracks metrics
 */

const { AgentObservability } = require('./observability.cjs');
const { spawn } = require('child_process');
const path = require('path');

class ObservableValidationAgent {
  constructor() {
    this.obs = new AgentObservability();
    this.agentPath = path.join(__dirname, 'intelligent-base-sub-agent.js');
  }

  async initialize() {
    await this.obs.initialize();
  }

  /**
   * Execute validation agent with observability tracking
   * @param {Object} options - Agent options
   * @returns {Promise<Object>} Agent results
   */
  async execute(options = {}) {
    if (!this.obs.initialized) {
      await this.initialize();
    }

    const tracker = this.obs.startTracking('VALIDATION', {
      validationType: options.type || 'code',
      path: options.path || './src',
      executionMode: 'wrapped',
    });

    try {
      console.log('✅ Executing Validation Agent with observability...\n');

      // Execute the actual agent
      const result = await this._executeAgent(options);

      await tracker.end({
        success: result.success,
        data: {
          issuesFound: result.data?.issuesFound || 0,
          criticalIssues: result.data?.criticalIssues || 0,
          warnings: result.data?.warnings || 0,
          filesChecked: result.data?.filesChecked || 0,
          score: result.data?.score || 100,
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
   * Execute the actual validation agent
   * @private
   */
  async _executeAgent(options) {
    return new Promise((resolve, reject) => {
      const args = [];
      if (options.path) args.push(options.path);
      if (options.type) args.push(`--type=${options.type}`);

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
          reject(new Error(`Validation agent exited with code ${code}\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute validation agent: ${error.message}`));
      });
    });
  }

  /**
   * Parse agent output to extract metrics
   * @private
   */
  _parseOutput(output) {
    const metrics = {
      issuesFound: 0,
      criticalIssues: 0,
      warnings: 0,
      filesChecked: 0,
      score: 100,
    };

    // Try to extract issue counts
    const issuesMatch = output.match(/(\d+)\s+issues?\s+found/i);
    if (issuesMatch) metrics.issuesFound = parseInt(issuesMatch[1]);

    const criticalMatch = output.match(/(\d+)\s+critical/i);
    if (criticalMatch) metrics.criticalIssues = parseInt(criticalMatch[1]);

    const warningsMatch = output.match(/(\d+)\s+warnings?/i);
    if (warningsMatch) metrics.warnings = parseInt(warningsMatch[1]);

    const filesMatch = output.match(/(\d+)\s+files?\s+checked/i);
    if (filesMatch) metrics.filesChecked = parseInt(filesMatch[1]);

    // Try to extract score
    const scoreMatch = output.match(/score:\s*(\d+)/i);
    if (scoreMatch) metrics.score = parseInt(scoreMatch[1]);

    return metrics;
  }
}

// Allow both module.exports and direct execution
module.exports = { ObservableValidationAgent };

// CLI usage
if (require.main === module) {
  const agent = new ObservableValidationAgent();

  agent.execute({
    path: process.argv[2] || './src',
    type: process.argv[3] || 'code',
  })
    .then((result) => {
      console.log('\n✅ Validation Agent completed with observability tracking');
      console.log(`Issues: ${result.data.issuesFound}, Score: ${result.data.score}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Validation Agent failed:', error.message);
      process.exit(1);
    });
}
