/**
 * API Sub-Agent with Observability
 * Wraps api-sub-agent.js with performance tracking
 *
 * Usage: Same as API agent, but automatically tracks metrics
 */

const { AgentObservability } = require('./observability.cjs');
const { spawn } = require('child_process');
const path = require('path');

class ObservableAPIAgent {
  constructor() {
    this.obs = new AgentObservability();
    this.agentPath = path.join(__dirname, 'api-sub-agent.js');
  }

  async initialize() {
    await this.obs.initialize();
  }

  /**
   * Execute API agent with observability tracking
   * @param {Object} options - Agent options
   * @returns {Promise<Object>} Agent results
   */
  async execute(options = {}) {
    if (!this.obs.initialized) {
      await this.initialize();
    }

    const tracker = this.obs.startTracking('API', {
      analysisType: options.analysisType || 'endpoints',
      path: options.path || './src',
      executionMode: 'wrapped',
    });

    try {
      console.log('🔌 Executing API Agent with observability...\n');

      // Execute the actual agent
      const result = await this._executeAgent(options);

      await tracker.end({
        success: result.success,
        data: {
          endpointsAnalyzed: result.data?.endpointsAnalyzed || 0,
          issuesFound: result.data?.issuesFound || 0,
          missingDocs: result.data?.missingDocs || 0,
          versioningIssues: result.data?.versioningIssues || 0,
          apiScore: result.data?.apiScore || 100,
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
   * Execute the actual API agent
   * @private
   */
  async _executeAgent(options) {
    return new Promise((resolve, reject) => {
      const args = [];
      if (options.path) args.push(options.path);
      if (options.analysisType) args.push(`--analysis=${options.analysisType}`);

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
          reject(new Error(`API agent exited with code ${code}\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute API agent: ${error.message}`));
      });
    });
  }

  /**
   * Parse agent output to extract metrics
   * @private
   */
  _parseOutput(output) {
    const metrics = {
      endpointsAnalyzed: 0,
      issuesFound: 0,
      missingDocs: 0,
      versioningIssues: 0,
      apiScore: 100,
    };

    const endpointsMatch = output.match(/(\d+)\s+endpoints?\s+analyzed/i);
    if (endpointsMatch) metrics.endpointsAnalyzed = parseInt(endpointsMatch[1]);

    const issuesMatch = output.match(/(\d+)\s+issues?\s+found/i);
    if (issuesMatch) metrics.issuesFound = parseInt(issuesMatch[1]);

    const docsMatch = output.match(/(\d+)\s+missing\s+(?:docs|documentation)/i);
    if (docsMatch) metrics.missingDocs = parseInt(docsMatch[1]);

    const versionMatch = output.match(/(\d+)\s+versioning\s+issues?/i);
    if (versionMatch) metrics.versioningIssues = parseInt(versionMatch[1]);

    const scoreMatch = output.match(/api\s+score:\s*(\d+)/i);
    if (scoreMatch) metrics.apiScore = parseInt(scoreMatch[1]);

    return metrics;
  }
}

module.exports = { ObservableAPIAgent };

if (require.main === module) {
  const agent = new ObservableAPIAgent();

  agent.execute({
    path: process.argv[2] || './src',
    analysisType: process.argv[3] || 'endpoints',
  })
    .then((result) => {
      console.log('\n✅ API Agent completed with observability tracking');
      console.log(`Endpoints: ${result.data.endpointsAnalyzed}, Issues: ${result.data.issuesFound}, Score: ${result.data.apiScore}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ API Agent failed:', error.message);
      process.exit(1);
    });
}
