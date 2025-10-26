/**
 * Documentation Sub-Agent with Observability
 * Wraps documentation-sub-agent.js with performance tracking
 *
 * Usage: Same as documentation agent, but automatically tracks metrics
 */

const { AgentObservability } = require('./observability.cjs');
const { spawn } = require('child_process');
const path = require('path');

class ObservableDocumentationAgent {
  constructor() {
    this.obs = new AgentObservability();
    this.agentPath = path.join(__dirname, 'documentation-sub-agent.js');
  }

  async initialize() {
    await this.obs.initialize();
  }

  /**
   * Execute documentation agent with observability tracking
   * @param {Object} options - Agent options
   * @returns {Promise<Object>} Agent results
   */
  async execute(options = {}) {
    if (!this.obs.initialized) {
      await this.initialize();
    }

    const tracker = this.obs.startTracking('DOCMON', {
      operation: options.operation || 'analyze',
      path: options.path || './src',
      executionMode: 'wrapped',
    });

    try {
      console.log('📚 Executing Documentation Agent with observability...\n');

      // Execute the actual agent
      const result = await this._executeAgent(options);

      await tracker.end({
        success: result.success,
        data: {
          filesAnalyzed: result.data?.filesAnalyzed || 0,
          missingDocs: result.data?.missingDocs || 0,
          outdatedDocs: result.data?.outdatedDocs || 0,
          docsGenerated: result.data?.docsGenerated || 0,
          coverageScore: result.data?.coverageScore || 100,
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
   * Execute the actual documentation agent
   * @private
   */
  async _executeAgent(options) {
    return new Promise((resolve, reject) => {
      const args = [];
      if (options.path) args.push(options.path);
      if (options.operation) args.push(`--operation=${options.operation}`);

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
          reject(new Error(`Documentation agent exited with code ${code}\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute documentation agent: ${error.message}`));
      });
    });
  }

  /**
   * Parse agent output to extract metrics
   * @private
   */
  _parseOutput(output) {
    const metrics = {
      filesAnalyzed: 0,
      missingDocs: 0,
      outdatedDocs: 0,
      docsGenerated: 0,
      coverageScore: 100,
    };

    const filesMatch = output.match(/(\d+)\s+files?\s+analyzed/i);
    if (filesMatch) metrics.filesAnalyzed = parseInt(filesMatch[1]);

    const missingMatch = output.match(/(\d+)\s+missing\s+(?:docs|documentation)/i);
    if (missingMatch) metrics.missingDocs = parseInt(missingMatch[1]);

    const outdatedMatch = output.match(/(\d+)\s+outdated\s+(?:docs|documentation)/i);
    if (outdatedMatch) metrics.outdatedDocs = parseInt(outdatedMatch[1]);

    const generatedMatch = output.match(/(\d+)\s+(?:docs|documentation)\s+generated/i);
    if (generatedMatch) metrics.docsGenerated = parseInt(generatedMatch[1]);

    const scoreMatch = output.match(/(?:coverage|documentation)\s+score:\s*(\d+)/i);
    if (scoreMatch) metrics.coverageScore = parseInt(scoreMatch[1]);

    return metrics;
  }
}

module.exports = { ObservableDocumentationAgent };

if (require.main === module) {
  const agent = new ObservableDocumentationAgent();

  agent.execute({
    path: process.argv[2] || './src',
    operation: process.argv[3] || 'analyze',
  })
    .then((result) => {
      console.log('\n✅ Documentation Agent completed with observability tracking');
      console.log(`Files: ${result.data.filesAnalyzed}, Missing Docs: ${result.data.missingDocs}, Score: ${result.data.coverageScore}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Documentation Agent failed:', error.message);
      process.exit(1);
    });
}
