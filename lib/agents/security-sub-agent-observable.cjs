/**
 * Security Sub-Agent with Observability
 * Wraps security-sub-agent.js with performance tracking
 *
 * Usage: Same as security agent, but automatically tracks metrics
 */

const { AgentObservability } = require('./observability.cjs');
const { spawn } = require('child_process');
const path = require('path');

class ObservableSecurityAgent {
  constructor() {
    this.obs = new AgentObservability();
    this.agentPath = path.join(__dirname, 'security-sub-agent.js');
  }

  async initialize() {
    await this.obs.initialize();
  }

  /**
   * Execute security agent with observability tracking
   * @param {Object} options - Agent options
   * @returns {Promise<Object>} Agent results
   */
  async execute(options = {}) {
    if (!this.obs.initialized) {
      await this.initialize();
    }

    const tracker = this.obs.startTracking('SECURITY', {
      scanType: options.scanType || 'full',
      path: options.path || './src',
      executionMode: 'wrapped',
    });

    try {
      console.log('🔒 Executing Security Agent with observability...\n');

      // Execute the actual agent
      const result = await this._executeAgent(options);

      await tracker.end({
        success: result.success,
        data: {
          vulnerabilitiesFound: result.data?.vulnerabilitiesFound || 0,
          criticalIssues: result.data?.criticalIssues || 0,
          highSeverity: result.data?.highSeverity || 0,
          mediumSeverity: result.data?.mediumSeverity || 0,
          lowSeverity: result.data?.lowSeverity || 0,
          filesScanned: result.data?.filesScanned || 0,
          securityScore: result.data?.securityScore || 100,
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
   * Execute the actual security agent
   * @private
   */
  async _executeAgent(options) {
    return new Promise((resolve, reject) => {
      const args = [];
      if (options.path) args.push(options.path);
      if (options.scanType) args.push(`--scan=${options.scanType}`);

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
          reject(new Error(`Security agent exited with code ${code}\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute security agent: ${error.message}`));
      });
    });
  }

  /**
   * Parse agent output to extract metrics
   * @private
   */
  _parseOutput(output) {
    const metrics = {
      vulnerabilitiesFound: 0,
      criticalIssues: 0,
      highSeverity: 0,
      mediumSeverity: 0,
      lowSeverity: 0,
      filesScanned: 0,
      securityScore: 100,
    };

    // Try to extract vulnerability counts
    const vulnMatch = output.match(/(\d+)\s+vulnerabilit(?:y|ies)\s+found/i);
    if (vulnMatch) metrics.vulnerabilitiesFound = parseInt(vulnMatch[1]);

    const criticalMatch = output.match(/(\d+)\s+critical/i);
    if (criticalMatch) metrics.criticalIssues = parseInt(criticalMatch[1]);

    const highMatch = output.match(/(\d+)\s+high\s+severity/i);
    if (highMatch) metrics.highSeverity = parseInt(highMatch[1]);

    const mediumMatch = output.match(/(\d+)\s+medium\s+severity/i);
    if (mediumMatch) metrics.mediumSeverity = parseInt(mediumMatch[1]);

    const lowMatch = output.match(/(\d+)\s+low\s+severity/i);
    if (lowMatch) metrics.lowSeverity = parseInt(lowMatch[1]);

    const filesMatch = output.match(/(\d+)\s+files?\s+scanned/i);
    if (filesMatch) metrics.filesScanned = parseInt(filesMatch[1]);

    // Try to extract security score
    const scoreMatch = output.match(/security\s+score:\s*(\d+)/i);
    if (scoreMatch) metrics.securityScore = parseInt(scoreMatch[1]);

    return metrics;
  }
}

// Allow both module.exports and direct execution
module.exports = { ObservableSecurityAgent };

// CLI usage
if (require.main === module) {
  const agent = new ObservableSecurityAgent();

  agent.execute({
    path: process.argv[2] || './src',
    scanType: process.argv[3] || 'full',
  })
    .then((result) => {
      console.log('\n✅ Security Agent completed with observability tracking');
      console.log(`Vulnerabilities: ${result.data.vulnerabilitiesFound}, Score: ${result.data.securityScore}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Security Agent failed:', error.message);
      process.exit(1);
    });
}
