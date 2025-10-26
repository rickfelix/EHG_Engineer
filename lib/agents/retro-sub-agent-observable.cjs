/**
 * Retrospective Sub-Agent with Observability
 * Wraps base-sub-agent.js for retrospective analysis with performance tracking
 *
 * Usage: Retrospective analysis with automatic metrics tracking
 */

const { AgentObservability } = require('./observability.cjs');
const { spawn } = require('child_process');
const path = require('path');

class ObservableRetroAgent {
  constructor() {
    this.obs = new AgentObservability();
    this.agentPath = path.join(__dirname, 'base-sub-agent.js');
  }

  async initialize() {
    await this.obs.initialize();
  }

  /**
   * Execute retrospective agent with observability tracking
   * @param {Object} options - Agent options
   * @returns {Promise<Object>} Agent results
   */
  async execute(options = {}) {
    if (!this.obs.initialized) {
      await this.initialize();
    }

    const tracker = this.obs.startTracking('RETRO', {
      analysisType: options.analysisType || 'sprint',
      period: options.period,
      executionMode: 'wrapped',
    });

    try {
      console.log('🔄 Executing Retrospective Agent with observability...\n');

      // Execute the actual agent
      const result = await this._executeAgent(options);

      await tracker.end({
        success: result.success,
        data: {
          itemsAnalyzed: result.data?.itemsAnalyzed || 0,
          lessonsExtracted: result.data?.lessonsExtracted || 0,
          improvementsIdentified: result.data?.improvementsIdentified || 0,
          actionItemsCreated: result.data?.actionItemsCreated || 0,
          retroScore: result.data?.retroScore || 100,
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
   * Execute the actual retrospective agent
   * @private
   */
  async _executeAgent(options) {
    return new Promise((resolve, reject) => {
      const args = [];
      if (options.analysisType) args.push(`--analysis=${options.analysisType}`);
      if (options.period) args.push(`--period=${options.period}`);

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
          reject(new Error(`Retrospective agent exited with code ${code}\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute retrospective agent: ${error.message}`));
      });
    });
  }

  /**
   * Parse agent output to extract metrics
   * @private
   */
  _parseOutput(output) {
    const metrics = {
      itemsAnalyzed: 0,
      lessonsExtracted: 0,
      improvementsIdentified: 0,
      actionItemsCreated: 0,
      retroScore: 100,
    };

    const itemsMatch = output.match(/(\d+)\s+items?\s+analyzed/i);
    if (itemsMatch) metrics.itemsAnalyzed = parseInt(itemsMatch[1]);

    const lessonsMatch = output.match(/(\d+)\s+lessons?\s+(?:extracted|learned)/i);
    if (lessonsMatch) metrics.lessonsExtracted = parseInt(lessonsMatch[1]);

    const improvementsMatch = output.match(/(\d+)\s+improvements?\s+identified/i);
    if (improvementsMatch) metrics.improvementsIdentified = parseInt(improvementsMatch[1]);

    const actionsMatch = output.match(/(\d+)\s+action\s+items?\s+created/i);
    if (actionsMatch) metrics.actionItemsCreated = parseInt(actionsMatch[1]);

    const scoreMatch = output.match(/(?:retro|retrospective)\s+score:\s*(\d+)/i);
    if (scoreMatch) metrics.retroScore = parseInt(scoreMatch[1]);

    return metrics;
  }
}

module.exports = { ObservableRetroAgent };

if (require.main === module) {
  const agent = new ObservableRetroAgent();

  agent.execute({
    analysisType: process.argv[2] || 'sprint',
    period: process.argv[3],
  })
    .then((result) => {
      console.log('\n✅ Retrospective Agent completed with observability tracking');
      console.log(`Items Analyzed: ${result.data.itemsAnalyzed}, Lessons: ${result.data.lessonsExtracted}, Score: ${result.data.retroScore}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Retrospective Agent failed:', error.message);
      process.exit(1);
    });
}
