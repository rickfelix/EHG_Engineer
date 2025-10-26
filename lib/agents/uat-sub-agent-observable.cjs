/**
 * UAT Sub-Agent with Observability
 * Wraps uat-sub-agent.js with performance tracking
 *
 * Usage: Same as UAT agent, but automatically tracks metrics
 */

const { AgentObservability } = require('./observability.cjs');
const { spawn } = require('child_process');
const path = require('path');

class ObservableUATAgent {
  constructor() {
    this.obs = new AgentObservability();
    this.agentPath = path.join(__dirname, 'uat-sub-agent.js');
  }

  async initialize() {
    await this.obs.initialize();
  }

  /**
   * Execute UAT agent with observability tracking
   * @param {Object} options - Agent options
   * @returns {Promise<Object>} Agent results
   */
  async execute(options = {}) {
    if (!this.obs.initialized) {
      await this.initialize();
    }

    const tracker = this.obs.startTracking('UAT', {
      testType: options.testType || 'acceptance',
      executionMode: 'wrapped',
    });

    try {
      console.log('✅ Executing UAT Agent with observability...\n');

      // Execute the actual agent
      const result = await this._executeAgent(options);

      await tracker.end({
        success: result.success,
        data: {
          scenariosTested: result.data?.scenariosTested || 0,
          scenariosPassed: result.data?.scenariosPassed || 0,
          scenariosFailed: result.data?.scenariosFailed || 0,
          criteriaValidated: result.data?.criteriaValidated || 0,
          uatScore: result.data?.uatScore || 100,
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
   * Execute the actual UAT agent
   * @private
   */
  async _executeAgent(options) {
    return new Promise((resolve, reject) => {
      const args = [];
      if (options.testType) args.push(`--test=${options.testType}`);

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
          reject(new Error(`UAT agent exited with code ${code}\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute UAT agent: ${error.message}`));
      });
    });
  }

  /**
   * Parse agent output to extract metrics
   * @private
   */
  _parseOutput(output) {
    const metrics = {
      scenariosTested: 0,
      scenariosPassed: 0,
      scenariosFailed: 0,
      criteriaValidated: 0,
      uatScore: 100,
    };

    const scenariosMatch = output.match(/(\d+)\s+scenarios?\s+tested/i);
    if (scenariosMatch) metrics.scenariosTested = parseInt(scenariosMatch[1]);

    const passedMatch = output.match(/(\d+)\s+(?:scenarios?\s+)?passed/i);
    if (passedMatch) metrics.scenariosPassed = parseInt(passedMatch[1]);

    const failedMatch = output.match(/(\d+)\s+(?:scenarios?\s+)?failed/i);
    if (failedMatch) metrics.scenariosFailed = parseInt(failedMatch[1]);

    const criteriaMatch = output.match(/(\d+)\s+(?:acceptance\s+)?criteria\s+validated/i);
    if (criteriaMatch) metrics.criteriaValidated = parseInt(criteriaMatch[1]);

    const scoreMatch = output.match(/uat\s+score:\s*(\d+)/i);
    if (scoreMatch) metrics.uatScore = parseInt(scoreMatch[1]);

    return metrics;
  }
}

module.exports = { ObservableUATAgent };

if (require.main === module) {
  const agent = new ObservableUATAgent();

  agent.execute({
    testType: process.argv[2] || 'acceptance',
  })
    .then((result) => {
      console.log('\n✅ UAT Agent completed with observability tracking');
      console.log(`Scenarios: ${result.data.scenariosTested}, Passed: ${result.data.scenariosPassed}, Score: ${result.data.uatScore}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ UAT Agent failed:', error.message);
      process.exit(1);
    });
}
