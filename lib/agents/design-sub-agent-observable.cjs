/**
 * Design Sub-Agent with Observability
 * Wraps design-sub-agent.js with performance tracking
 *
 * Usage: Same as design agent, but automatically tracks metrics
 */

const { AgentObservability } = require('./observability.cjs');
const { spawn } = require('child_process');
const path = require('path');

class ObservableDesignAgent {
  constructor() {
    this.obs = new AgentObservability();
    this.agentPath = path.join(__dirname, 'design-sub-agent.js');
  }

  async initialize() {
    await this.obs.initialize();
  }

  /**
   * Execute design agent with observability tracking
   * @param {Object} options - Agent options
   * @returns {Promise<Object>} Agent results
   */
  async execute(options = {}) {
    if (!this.obs.initialized) {
      await this.initialize();
    }

    const tracker = this.obs.startTracking('DESIGN', {
      reviewType: options.reviewType || 'ui',
      path: options.path || './src',
      executionMode: 'wrapped',
    });

    try {
      console.log('🎨 Executing Design Agent with observability...\n');

      // Execute the actual agent
      const result = await this._executeAgent(options);

      await tracker.end({
        success: result.success,
        data: {
          componentsReviewed: result.data?.componentsReviewed || 0,
          designIssuesFound: result.data?.designIssuesFound || 0,
          a11yIssues: result.data?.a11yIssues || 0,
          uxImprovements: result.data?.uxImprovements || 0,
          designScore: result.data?.designScore || 100,
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
   * Execute the actual design agent
   * @private
   */
  async _executeAgent(options) {
    return new Promise((resolve, reject) => {
      const args = [];
      if (options.path) args.push(options.path);
      if (options.reviewType) args.push(`--review=${options.reviewType}`);

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
          reject(new Error(`Design agent exited with code ${code}\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute design agent: ${error.message}`));
      });
    });
  }

  /**
   * Parse agent output to extract metrics
   * @private
   */
  _parseOutput(output) {
    const metrics = {
      componentsReviewed: 0,
      designIssuesFound: 0,
      a11yIssues: 0,
      uxImprovements: 0,
      designScore: 100,
    };

    const componentsMatch = output.match(/(\d+)\s+components?\s+reviewed/i);
    if (componentsMatch) metrics.componentsReviewed = parseInt(componentsMatch[1]);

    const issuesMatch = output.match(/(\d+)\s+design\s+issues?\s+found/i);
    if (issuesMatch) metrics.designIssuesFound = parseInt(issuesMatch[1]);

    const a11yMatch = output.match(/(\d+)\s+(?:a11y|accessibility)\s+issues?/i);
    if (a11yMatch) metrics.a11yIssues = parseInt(a11yMatch[1]);

    const uxMatch = output.match(/(\d+)\s+ux\s+improvements?/i);
    if (uxMatch) metrics.uxImprovements = parseInt(uxMatch[1]);

    const scoreMatch = output.match(/design\s+score:\s*(\d+)/i);
    if (scoreMatch) metrics.designScore = parseInt(scoreMatch[1]);

    return metrics;
  }
}

module.exports = { ObservableDesignAgent };

if (require.main === module) {
  const agent = new ObservableDesignAgent();

  agent.execute({
    path: process.argv[2] || './src',
    reviewType: process.argv[3] || 'ui',
  })
    .then((result) => {
      console.log('\n✅ Design Agent completed with observability tracking');
      console.log(`Components: ${result.data.componentsReviewed}, Issues: ${result.data.designIssuesFound}, Score: ${result.data.designScore}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Design Agent failed:', error.message);
      process.exit(1);
    });
}
