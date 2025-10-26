/**
 * Dependency Sub-Agent with Observability
 * Wraps dependency-sub-agent.js with performance tracking
 *
 * Usage: Same as dependency agent, but automatically tracks metrics
 */

const { AgentObservability } = require('./observability.cjs');
const { spawn } = require('child_process');
const path = require('path');

class ObservableDependencyAgent {
  constructor() {
    this.obs = new AgentObservability();
    this.agentPath = path.join(__dirname, 'dependency-sub-agent.js');
  }

  async initialize() {
    await this.obs.initialize();
  }

  /**
   * Execute dependency agent with observability tracking
   * @param {Object} options - Agent options
   * @returns {Promise<Object>} Agent results
   */
  async execute(options = {}) {
    if (!this.obs.initialized) {
      await this.initialize();
    }

    const tracker = this.obs.startTracking('DEPENDENCY', {
      checkType: options.checkType || 'all',
      executionMode: 'wrapped',
    });

    try {
      console.log('📦 Executing Dependency Agent with observability...\n');

      // Execute the actual agent
      const result = await this._executeAgent(options);

      await tracker.end({
        success: result.success,
        data: {
          dependenciesChecked: result.data?.dependenciesChecked || 0,
          outdatedPackages: result.data?.outdatedPackages || 0,
          vulnerabilities: result.data?.vulnerabilities || 0,
          conflicts: result.data?.conflicts || 0,
          updatesSuggested: result.data?.updatesSuggested || 0,
          healthScore: result.data?.healthScore || 100,
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
   * Execute the actual dependency agent
   * @private
   */
  async _executeAgent(options) {
    return new Promise((resolve, reject) => {
      const args = [];
      if (options.checkType) args.push(`--check=${options.checkType}`);

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
          reject(new Error(`Dependency agent exited with code ${code}\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute dependency agent: ${error.message}`));
      });
    });
  }

  /**
   * Parse agent output to extract metrics
   * @private
   */
  _parseOutput(output) {
    const metrics = {
      dependenciesChecked: 0,
      outdatedPackages: 0,
      vulnerabilities: 0,
      conflicts: 0,
      updatesSuggested: 0,
      healthScore: 100,
    };

    const checkedMatch = output.match(/(\d+)\s+dependencies?\s+checked/i);
    if (checkedMatch) metrics.dependenciesChecked = parseInt(checkedMatch[1]);

    const outdatedMatch = output.match(/(\d+)\s+outdated\s+packages?/i);
    if (outdatedMatch) metrics.outdatedPackages = parseInt(outdatedMatch[1]);

    const vulnMatch = output.match(/(\d+)\s+vulnerabilit(?:y|ies)/i);
    if (vulnMatch) metrics.vulnerabilities = parseInt(vulnMatch[1]);

    const conflictsMatch = output.match(/(\d+)\s+conflicts?/i);
    if (conflictsMatch) metrics.conflicts = parseInt(conflictsMatch[1]);

    const updatesMatch = output.match(/(\d+)\s+updates?\s+suggested/i);
    if (updatesMatch) metrics.updatesSuggested = parseInt(updatesMatch[1]);

    const scoreMatch = output.match(/(?:health|dependency)\s+score:\s*(\d+)/i);
    if (scoreMatch) metrics.healthScore = parseInt(scoreMatch[1]);

    return metrics;
  }
}

module.exports = { ObservableDependencyAgent };

if (require.main === module) {
  const agent = new ObservableDependencyAgent();

  agent.execute({
    checkType: process.argv[2] || 'all',
  })
    .then((result) => {
      console.log('\n✅ Dependency Agent completed with observability tracking');
      console.log(`Dependencies: ${result.data.dependenciesChecked}, Outdated: ${result.data.outdatedPackages}, Score: ${result.data.healthScore}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Dependency Agent failed:', error.message);
      process.exit(1);
    });
}
