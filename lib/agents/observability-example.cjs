/**
 * Agent Observability - Usage Examples
 *
 * Demonstrates how to integrate observability tracking into agent code
 */

const { AgentObservability } = require('./observability.cjs');

/**
 * Example 1: Basic agent execution tracking
 */
async function exampleBasicTracking() {
  const obs = new AgentObservability();
  await obs.initialize();

  // Start tracking
  const tracker = obs.startTracking('VALIDATION');

  try {
    // Simulate agent execution
    console.log('Running validation agent...');
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate work

    // Simulated validation result
    const validationResult = {
      passed: true,
      issuesFound: 0,
    };

    // End tracking with success
    await tracker.end({
      success: true,
      data: validationResult,
    });

    console.log('✓ Validation completed successfully');
  } catch (error) {
    // End tracking with failure
    await tracker.end({
      success: false,
      error: error.message,
    });

    console.error('✗ Validation failed:', error.message);
  }
}

/**
 * Example 2: Tracking with context
 */
async function exampleTrackingWithContext() {
  const obs = new AgentObservability();
  await obs.initialize();

  const tracker = obs.startTracking('TESTING', {
    testType: 'unit',
    framework: 'jest',
    fileCount: 25,
  });

  try {
    // Simulate test execution
    console.log('Running tests...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    await tracker.end({
      success: true,
      data: {
        totalTests: 125,
        passed: 120,
        failed: 5,
      },
      context: {
        coverage: 85.5,
      },
    });

    console.log('✓ Tests completed');
  } catch (error) {
    await tracker.end({ success: false, error: error.message });
  }
}

/**
 * Example 3: Wrapper function for any agent
 */
async function withObservability(agentCode, agentFunction, context = {}) {
  const obs = new AgentObservability();
  await obs.initialize();

  const tracker = obs.startTracking(agentCode, context);

  try {
    const result = await agentFunction();

    await tracker.end({
      success: true,
      data: result,
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
 * Example 4: Using the wrapper
 */
async function exampleUsingWrapper() {
  // Wrap any agent function
  const result = await withObservability('DATABASE', async () => {
    console.log('Running database migrations...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { migrationsRun: 5, success: true };
  }, {
    database: 'production',
    migrationCount: 5,
  });

  console.log('Database result:', result);
}

/**
 * Example 5: Querying metrics
 */
async function exampleQueryingMetrics() {
  const obs = new AgentObservability();
  await obs.initialize();

  // Get metrics for specific agent
  const validationMetrics = await obs.getAgentMetrics('VALIDATION', {
    window: 'daily',
    limit: 7,
  });

  console.log('Validation Agent Metrics:');
  console.log(`  Total Executions: ${validationMetrics.summary.totalExecutions}`);
  console.log(`  Success Rate: ${(validationMetrics.summary.successRate * 100).toFixed(1)}%`);
  console.log(`  Avg Time: ${validationMetrics.summary.avgExecutionTime}ms`);

  // Get all metrics
  const allMetrics = await obs.getAllMetrics({ limit: 7 });
  console.log(`\nTotal agents tracked: ${allMetrics.length}`);

  // Get top performing agents
  const topAgents = await obs.getTopAgents(5);
  console.log('\nTop 5 Agents:');
  topAgents.forEach((agent, index) => {
    console.log(`  ${index + 1}. ${agent.agentCode} - ${(agent.summary.successRate * 100).toFixed(1)}% success`);
  });
}

/**
 * Example 6: Integration in existing agent code
 */
class ValidationAgent {
  constructor() {
    this.obs = null;
  }

  async initialize() {
    this.obs = new AgentObservability();
    await this.obs.initialize();
  }

  async validate(data) {
    if (!this.obs) {
      throw new Error('Observability not initialized. Call initialize() first.');
    }

    const tracker = this.obs.startTracking('VALIDATION', {
      dataType: typeof data,
      dataSize: JSON.stringify(data).length,
    });

    try {
      // Validation logic
      console.log('Validating data...');
      await new Promise(resolve => setTimeout(resolve, 500));

      const result = {
        valid: true,
        errors: [],
      };

      await tracker.end({
        success: true,
        data: result,
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
}

/**
 * Example 7: Parallel agent execution tracking
 */
async function exampleParallelTracking() {
  const obs = new AgentObservability();
  await obs.initialize();

  // Start multiple trackers
  const tracker1 = obs.startTracking('VALIDATION');
  const tracker2 = obs.startTracking('TESTING');
  const tracker3 = obs.startTracking('SECURITY');

  // Execute in parallel
  await Promise.all([
    (async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await tracker1.end({ success: true });
    })(),
    (async () => {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await tracker2.end({ success: true });
    })(),
    (async () => {
      await new Promise(resolve => setTimeout(resolve, 800));
      await tracker3.end({ success: true });
    })(),
  ]);

  console.log('All agents completed');

  // Check active trackers
  const activeTrackers = obs.getActiveTrackers();
  console.log(`Active trackers: ${activeTrackers.length}`);
}

// Run examples if executed directly
if (require.main === module) {
  const example = process.argv[2] || '1';

  const examples = {
    '1': exampleBasicTracking,
    '2': exampleTrackingWithContext,
    '3': exampleUsingWrapper,
    '4': exampleQueryingMetrics,
    '5': exampleParallelTracking,
  };

  const runExample = examples[example];

  if (runExample) {
    console.log(`\n Running Example ${example}...\n`);
    runExample()
      .then(() => {
        console.log('\n Example completed successfully\n');
        process.exit(0);
      })
      .catch(error => {
        console.error('\n Example failed:', error.message);
        process.exit(1);
      });
  } else {
    console.log('Available examples: 1, 2, 3, 4, 5');
    console.log('Usage: node observability-example.cjs [1-5]');
  }
}

module.exports = {
  withObservability,
  ValidationAgent,
};
