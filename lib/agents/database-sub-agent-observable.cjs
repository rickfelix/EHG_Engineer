/**
 * Database Sub-Agent with Observability
 * Wraps database-sub-agent.js with performance tracking
 *
 * Usage: Same as database-sub-agent.js, but automatically tracks metrics
 */

const { AgentObservability } = require('./observability.cjs');
const { spawn } = require('child_process');
const path = require('path');

class ObservableDatabaseAgent {
  constructor() {
    this.obs = new AgentObservability();
    this.agentPath = path.join(__dirname, 'database-sub-agent.js');
  }

  async initialize() {
    await this.obs.initialize();
  }

  /**
   * Execute database agent with observability tracking
   * @param {Object} options - Agent options
   * @returns {Promise<Object>} Agent results
   */
  async execute(options = {}) {
    if (!this.obs.initialized) {
      await this.initialize();
    }

    const tracker = this.obs.startTracking('DATABASE', {
      options: JSON.stringify(options),
      executionMode: 'wrapped',
    });

    try {
      console.log('🗄️  Executing Database Agent with observability...\n');

      // Execute the actual agent
      const result = await this._executeAgent(options);

      await tracker.end({
        success: result.success,
        data: {
          schemaScore: result.data?.schema?.score,
          migrationsValid: result.data?.migrations?.valid,
          queriesAnalyzed: result.data?.queries?.total,
          overallScore: result.data?.score,
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
   * Execute the actual database agent
   * @private
   */
  async _executeAgent(options) {
    return new Promise((resolve, reject) => {
      const args = options.path ? [options.path] : [];

      const child = spawn('node', [this.agentPath, ...args], {
        stdio: ['inherit', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        process.stdout.write(output); // Pass through to console
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
          reject(new Error(`Database agent exited with code ${code}\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute database agent: ${error.message}`));
      });
    });
  }

  /**
   * Parse agent output to extract metrics
   * @private
   */
  _parseOutput(output) {
    // Try to extract metrics from output
    const metrics = {
      score: 100,
      schema: {},
      migrations: {},
      queries: {},
    };

    // Look for score in output
    const scoreMatch = output.match(/Database Health Score:\s*(\d+)/i);
    if (scoreMatch) {
      metrics.score = parseInt(scoreMatch[1]);
    }

    return metrics;
  }
}

// Allow both module.exports and direct execution
module.exports = { ObservableDatabaseAgent };

// CLI usage
if (require.main === module) {
  const agent = new ObservableDatabaseAgent();

  agent.execute({
    path: process.argv[2] || './src',
  })
    .then((result) => {
      console.log('\n✅ Database Agent completed with observability tracking');
      console.log(`Score: ${result.data.score}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Database Agent failed:', error.message);
      process.exit(1);
    });
}
