#!/usr/bin/env node

/**
 * Example Vision QA Test Scenarios
 * Demonstrates different testing approaches and goals
 */

const VisionQAAgent = require('../lib/testing/vision-qa-agent');

// Example test scenarios
const testScenarios = {
  // Basic form submission test
  basicFormSubmission: {
    appId: 'APP-001',
    goal: 'Submit the contact form with test data and verify success message',
    config: {
      maxIterations: 20,
      costLimit: 1.00,
      headless: false, // Show browser for demo
      // Model will be auto-selected based on goal (likely gpt-5-mini)
    }
  },

  // E-commerce checkout flow
  ecommerceCheckout: {
    appId: 'APP-002',
    goal: 'Add a product to cart, proceed to checkout, and complete purchase',
    config: {
      maxIterations: 50,
      costLimit: 3.00,
      consensusRuns: 3, // Run 3 times for reliability
      confidenceThreshold: 0.9
    }
  },

  // User authentication flow
  authenticationFlow: {
    appId: 'APP-003',
    goal: 'Register a new user account, log out, then log back in successfully',
    config: {
      maxIterations: 30,
      screenshotInterval: 'smart',
      retryAttempts: 3
    }
  },

  // Bug detection focused
  bugHunting: {
    appId: 'APP-004',
    goal: 'Navigate through all main pages and identify visual bugs or console errors',
    config: {
      maxIterations: 100,
      bugDetectionSensitivity: 'high',
      costLimit: 5.00,
      temperature: 0 // Deterministic for bug consistency
    }
  },

  // Mobile responsive testing
  mobileResponsive: {
    appId: 'APP-005',
    goal: 'Test mobile navigation menu and verify all elements are accessible on mobile viewport',
    config: {
      viewport: { width: 375, height: 667 }, // iPhone size
      maxIterations: 25,
      visualCheckThreshold: 0.9
    }
  },

  // Accessibility compliance
  accessibilityAudit: {
    appId: 'APP-006',
    goal: 'Navigate using keyboard only and verify all interactive elements are accessible',
    config: {
      maxIterations: 40,
      checkAccessibility: true,
      // Model will be auto-selected: claude-sonnet-3.7 for accessibility
    }
  },

  // Performance testing
  performanceTest: {
    appId: 'APP-007',
    goal: 'Load heavy data table, apply filters, and measure response times',
    config: {
      maxIterations: 15,
      measurePerformance: true,
      costLimit: 2.00
    }
  },

  // Multi-language support
  internationalization: {
    appId: 'APP-008',
    goal: 'Switch between English, Spanish, and French languages and verify all UI text changes',
    config: {
      maxIterations: 30,
      languages: ['en', 'es', 'fr']
    }
  },

  // Search functionality
  searchFeature: {
    appId: 'APP-009',
    goal: 'Search for "test product", apply filters, and verify results are relevant',
    config: {
      maxIterations: 20,
      searchTerms: ['test product', 'invalid item', 'special chars!@#']
    }
  },

  // File upload testing
  fileUpload: {
    appId: 'APP-010',
    goal: 'Upload various file types and verify they are processed correctly',
    config: {
      maxIterations: 25,
      testFiles: [
        'test-image.png',
        'test-document.pdf',
        'large-file.zip'
      ]
    }
  }
};

/**
 * Run a specific test scenario
 */
async function runTestScenario(scenarioName) {
  const scenario = testScenarios[scenarioName];
  if (!scenario) {
    console.error(`Unknown scenario: ${scenarioName}`);
    console.log('Available scenarios:', Object.keys(testScenarios).join(', '));
    return;
  }

  console.log(`
╔════════════════════════════════════════════════╗
║  Running Vision QA Test: ${scenarioName.padEnd(20)} ║
╚════════════════════════════════════════════════╝
  `);

  const agent = new VisionQAAgent(scenario.config);
  
  try {
    // Run the test
    const report = await agent.testApplication(
      scenario.appId,
      scenario.goal,
      scenario.config
    );
    
    // Save report
    const reportPath = `./reports/${scenarioName}-${Date.now()}.md`;
    await agent.reporter.saveReport(report, reportPath);
    
    // Print summary
    console.log('\n✅ Test completed!');
    console.log(`Report saved to: ${reportPath}`);
    
    return report;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

/**
 * Run consensus testing for reliability
 */
async function runConsensusTest(scenarioName) {
  const scenario = testScenarios[scenarioName];
  if (!scenario) {
    console.error(`Unknown scenario: ${scenarioName}`);
    return;
  }

  const agent = new VisionQAAgent({
    ...scenario.config,
    consensusRuns: scenario.config.consensusRuns || 3
  });
  
  console.log(`
╔════════════════════════════════════════════════╗
║  Running Consensus Test (${agent.config.consensusRuns} runs)        ║
╚════════════════════════════════════════════════╝
  `);
  
  const result = await agent.runWithConsensus(
    scenario.appId,
    scenario.goal
  );
  
  console.log('\n📊 Consensus Results:');
  console.log(`Agreement Rate: ${(result.consensus.agreement * 100).toFixed(1)}%`);
  console.log(`Reliability: ${result.consensus.isReliable ? '✅ Reliable' : '⚠️  Unreliable'}`);
  console.log(`Consensus Outcome: ${result.consensus.consensus?.goalAchieved ? 'PASSED' : 'FAILED'}`);
  
  return result;
}

/**
 * Run all scenarios in sequence
 */
async function runAllScenarios() {
  const results = {};
  
  for (const [name, scenario] of Object.entries(testScenarios)) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Testing: ${name}`);
    console.log('='.repeat(50));
    
    try {
      results[name] = await runTestScenario(name);
      console.log(`✅ ${name} completed`);
    } catch (error) {
      console.error(`❌ ${name} failed:`, error.message);
      results[name] = { error: error.message };
    }
    
    // Brief pause between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary report
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY REPORT');
  console.log('='.repeat(50));
  
  let passed = 0;
  let failed = 0;
  
  for (const [name, result] of Object.entries(results)) {
    if (result.error) {
      console.log(`❌ ${name}: FAILED - ${result.error}`);
      failed++;
    } else {
      console.log(`✅ ${name}: PASSED`);
      passed++;
    }
  }
  
  console.log(`\nTotal: ${passed} passed, ${failed} failed`);
  
  return results;
}

/**
 * Interactive test runner
 */
async function interactiveRunner() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log(`
╔════════════════════════════════════════════════╗
║        Vision QA Interactive Test Runner        ║
╚════════════════════════════════════════════════╝

Available test scenarios:
`);
  
  Object.entries(testScenarios).forEach(([name, scenario], index) => {
    console.log(`${index + 1}. ${name} - ${scenario.goal.substring(0, 50)}...`);
  });
  
  console.log(`
Options:
- Enter scenario name to run single test
- Enter 'consensus <name>' to run consensus test
- Enter 'all' to run all scenarios
- Enter 'exit' to quit
`);
  
  const prompt = () => {
    rl.question('\n> ', async (answer) => {
      answer = answer.trim().toLowerCase();
      
      if (answer === 'exit') {
        rl.close();
        return;
      }
      
      if (answer === 'all') {
        await runAllScenarios();
      } else if (answer.startsWith('consensus ')) {
        const scenario = answer.replace('consensus ', '');
        await runConsensusTest(scenario);
      } else if (testScenarios[answer]) {
        await runTestScenario(answer);
      } else {
        console.log('Invalid option. Please try again.');
      }
      
      prompt();
    });
  };
  
  prompt();
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Interactive mode
    interactiveRunner();
  } else if (args[0] === 'all') {
    // Run all scenarios
    runAllScenarios().then(() => process.exit(0));
  } else if (args[0] === 'consensus' && args[1]) {
    // Run consensus test
    runConsensusTest(args[1]).then(() => process.exit(0));
  } else {
    // Run specific scenario
    runTestScenario(args[0]).then(() => process.exit(0));
  }
}

module.exports = {
  testScenarios,
  runTestScenario,
  runConsensusTest,
  runAllScenarios
};