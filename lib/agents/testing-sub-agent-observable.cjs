/**
 * Testing Sub-Agent with Observability
 * Wraps testing-sub-agent.js with performance tracking
 *
 * Usage: Same as testing-sub-agent.js, but automatically tracks metrics
 */

const { AgentObservability } = require('./observability.cjs');
const { spawn } = require('child_process');
const path = require('path');

class ObservableTestingAgent {
  constructor() {
    this.obs = new AgentObservability();
    this.agentPath = path.join(__dirname, 'testing-sub-agent.js');
  }

  async initialize() {
    await this.obs.initialize();
  }

  /**
   * Execute testing agent with observability tracking
   * @param {Object} options - Agent options
   * @returns {Promise<Object>} Agent results
   */
  async execute(options = {}) {
    if (!this.obs.initialized) {
      await this.initialize();
    }

    const tracker = this.obs.startTracking('TESTING', {
      testType: options.testType || 'all',
      path: options.path || 'tests',
      executionMode: 'wrapped',
    });

    try {
      console.log('🧪 Executing Testing Agent with observability...\n');

      // Execute the actual agent
      const result = await this._executeAgent(options);

      await tracker.end({
        success: result.success,
        data: {
          testsFound: result.data?.testsFound,
          testsPassed: result.data?.testsPassed,
          testsFailed: result.data?.testsFailed,
          coverage: result.data?.coverage,
          score: result.data?.score,
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
   * Execute the actual testing agent
   * @private
   */
  async _executeAgent(options) {
    return new Promise((resolve, reject) => {
      const args = [];
      if (options.path) args.push(options.path);
      if (options.testType) args.push(`--type=${options.testType}`);

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
          reject(new Error(`Testing agent exited with code ${code}\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute testing agent: ${error.message}`));
      });
    });
  }

  /**
   * Parse agent output to extract metrics
   * @private
   */
  _parseOutput(output) {
    const metrics = {
      testsFound: 0,
      testsPassed: 0,
      testsFailed: 0,
      coverage: 0,
      score: 100,
    };

    // Try to extract test counts
    const passedMatch = output.match(/(\d+)\s+passed/i);
    if (passedMatch) metrics.testsPassed = parseInt(passedMatch[1]);

    const failedMatch = output.match(/(\d+)\s+failed/i);
    if (failedMatch) metrics.testsFailed = parseInt(failedMatch[1]);

    metrics.testsFound = metrics.testsPassed + metrics.testsFailed;

    // Try to extract coverage
    const coverageMatch = output.match(/coverage:\s*(\d+\.?\d*)%/i);
    if (coverageMatch) metrics.coverage = parseFloat(coverageMatch[1]);

    return metrics;
  }
}

// Allow both module.exports and direct execution
module.exports = { ObservableTestingAgent };

// CLI usage
if (require.main === module) {
  const agent = new ObservableTestingAgent();

  agent.execute({
    path: process.argv[2] || 'tests',
    testType: process.argv[3] || 'all',
  })
    .then((result) => {
      console.log('\n✅ Testing Agent completed with observability tracking');
      console.log(`Tests: ${result.data.testsFound}, Passed: ${result.data.testsPassed}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Testing Agent failed:', error.message);
      process.exit(1);
    });
}
