/**
 * Performance Sub-Agent with Observability
 * Wraps performance-sub-agent.js with performance tracking
 *
 * Usage: Same as performance agent, but automatically tracks metrics
 */

const { AgentObservability } = require('./observability.cjs');
const { spawn } = require('child_process');
const path = require('path');

class ObservablePerformanceAgent {
  constructor() {
    this.obs = new AgentObservability();
    this.agentPath = path.join(__dirname, 'performance-sub-agent.js');
  }

  async initialize() {
    await this.obs.initialize();
  }

  /**
   * Execute performance agent with observability tracking
   * @param {Object} options - Agent options
   * @returns {Promise<Object>} Agent results
   */
  async execute(options = {}) {
    if (!this.obs.initialized) {
      await this.initialize();
    }

    const tracker = this.obs.startTracking('PERFORMANCE', {
      analysisType: options.analysisType || 'full',
      path: options.path || './src',
      executionMode: 'wrapped',
    });

    try {
      console.log('⚡ Executing Performance Agent with observability...\n');

      // Execute the actual agent
      const result = await this._executeAgent(options);

      await tracker.end({
        success: result.success,
        data: {
          bottlenecksFound: result.data?.bottlenecksFound || 0,
          optimizationsSuggested: result.data?.optimizationsSuggested || 0,
          filesAnalyzed: result.data?.filesAnalyzed || 0,
          performanceScore: result.data?.performanceScore || 100,
          avgLoadTime: result.data?.avgLoadTime || 0,
          memoryUsage: result.data?.memoryUsage || 0,
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
   * Execute the actual performance agent
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
          reject(new Error(`Performance agent exited with code ${code}\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute performance agent: ${error.message}`));
      });
    });
  }

  /**
   * Parse agent output to extract metrics
   * @private
   */
  _parseOutput(output) {
    const metrics = {
      bottlenecksFound: 0,
      optimizationsSuggested: 0,
      filesAnalyzed: 0,
      performanceScore: 100,
      avgLoadTime: 0,
      memoryUsage: 0,
    };

    // Try to extract bottleneck counts
    const bottleneckMatch = output.match(/(\d+)\s+bottlenecks?\s+found/i);
    if (bottleneckMatch) metrics.bottlenecksFound = parseInt(bottleneckMatch[1]);

    const optimizationsMatch = output.match(/(\d+)\s+optimizations?\s+suggested/i);
    if (optimizationsMatch) metrics.optimizationsSuggested = parseInt(optimizationsMatch[1]);

    const filesMatch = output.match(/(\d+)\s+files?\s+analyzed/i);
    if (filesMatch) metrics.filesAnalyzed = parseInt(filesMatch[1]);

    // Try to extract performance score
    const scoreMatch = output.match(/performance\s+score:\s*(\d+)/i);
    if (scoreMatch) metrics.performanceScore = parseInt(scoreMatch[1]);

    // Try to extract load time
    const loadTimeMatch = output.match(/(?:avg|average)\s+load\s+time:\s*(\d+)ms/i);
    if (loadTimeMatch) metrics.avgLoadTime = parseInt(loadTimeMatch[1]);

    // Try to extract memory usage
    const memoryMatch = output.match(/memory\s+usage:\s*(\d+)(?:MB|mb)/i);
    if (memoryMatch) metrics.memoryUsage = parseInt(memoryMatch[1]);

    return metrics;
  }
}

// Allow both module.exports and direct execution
module.exports = { ObservablePerformanceAgent };

// CLI usage
if (require.main === module) {
  const agent = new ObservablePerformanceAgent();

  agent.execute({
    path: process.argv[2] || './src',
    analysisType: process.argv[3] || 'full',
  })
    .then((result) => {
      console.log('\n✅ Performance Agent completed with observability tracking');
      console.log(`Bottlenecks: ${result.data.bottlenecksFound}, Score: ${result.data.performanceScore}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Performance Agent failed:', error.message);
      process.exit(1);
    });
}
