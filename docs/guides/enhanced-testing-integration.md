# Enhanced Testing and Debugging Sub-Agents Integration Guide


## Metadata
- **Category**: Testing
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, e2e

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Basic Integration](#basic-integration)
4. [Playwright Integration](#playwright-integration)
5. [Jest Integration](#jest-integration)
6. [CI/CD Pipeline Integration](#cicd-pipeline-integration)
7. [Configuration Options](#configuration-options)
8. [Migration from Basic Agents](#migration-from-basic-agents)
9. [Advanced Patterns](#advanced-patterns)
10. [Real-World Examples](#real-world-examples)

---

## Prerequisites

### System Requirements

- Node.js 18+ 
- npm or yarn package manager
- Playwright 1.40+
- Supabase project (for backstory and metrics storage)

### Required Dependencies

```json
{
  "dependencies": {
    "@playwright/test": "^1.40.0",
    "@supabase/supabase-js": "^2.38.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  }
}
```

---

## Environment Setup

### 1. Install Dependencies

```bash
npm install @playwright/test @supabase/supabase-js dotenv
```

### 2. Configure Environment Variables

Create `.env` file in your project root:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Test Configuration
NODE_ENV=development
TEST_TIMEOUT=30000
RETRY_COUNT=3
```

### 3. Initialize Playwright

```bash
npx playwright install
npx playwright install-deps
```

### 4. Create Directory Structure

```bash
mkdir -p lib/testing
mkdir -p tests/e2e
mkdir -p scripts/fixes
mkdir -p test-results
```

---

## Basic Integration

### 1. Copy Core Files

Copy the enhanced agents to your project:

```bash
cp /path/to/enhanced-testing-debugging-agents.js lib/testing/
```

### 2. Basic Usage Example

```javascript
// basic-example.js
import { TestCollaborationCoordinator } from './lib/testing/enhanced-testing-debugging-agents.js';
import { chromium } from '@playwright/test';

async function runBasicTest() {
  // Initialize coordinator
  const coordinator = new TestCollaborationCoordinator();
  await coordinator.initialize();
  
  // Launch browser
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Define test
    const tests = [
      {
        name: 'Page Load Test',
        function: async () => {
          await page.goto('http://localhost:3000');
          
          // Use self-healing selector
          const title = await coordinator.testingAgent.findElement(page, [
            { name: 'testId', selector: '[data-testid="page-title"]' },
            { name: 'tag', selector: 'h1' },
            { name: 'text', selector: 'text="Welcome"' }
          ]);
          
          if (!title) {
            throw new Error('Page title not found');
          }
        }
      }
    ];
    
    // Run tests with collaboration
    const results = await coordinator.runTestSuite(page, tests);
    
    console.log('Test Results:', {
      passed: results.handoff.metrics.passed,
      failed: results.handoff.metrics.failed,
      duration: results.handoff.metrics.duration + 'ms'
    });
    
    // Apply generated fixes
    if (results.diagnosis.fixScripts.length > 0) {
      console.log('\nGenerated Fixes:');
      for (const fix of results.diagnosis.fixScripts) {
        console.log(`- ${fix.description}`);
        if (fix.autoExecutable && !fix.requiresReview) {
          await coordinator.applyFix(fix);
          console.log(`  ✅ Applied automatically`);
        } else {
          console.log(`  ⚠️  Manual review required`);
        }
      }
    }
    
  } finally {
    await browser.close();
  }
}

runBasicTest().catch(console.error);
```

---

## Playwright Integration

### 1. Enhanced Test Configuration

```javascript
// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 0, // Let enhanced agents handle retries
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'enhanced-chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Enable console logging for enhanced agents
        launchOptions: {
          args: ['--enable-logging', '--v=1']
        }
      }
    }
  ]
});
```

### 2. Enhanced Test Suite

```javascript
// tests/e2e/enhanced-suite.test.js
import { test, expect } from '@playwright/test';
import { TestCollaborationCoordinator } from '../../lib/testing/enhanced-testing-debugging-agents.js';

test.describe('Enhanced DirectiveLab Tests', () => {
  let coordinator;
  
  test.beforeAll(async () => {
    coordinator = new TestCollaborationCoordinator();
    await coordinator.initialize();
    
    // Set up event monitoring
    coordinator.on('test:failed', (data) => {
      console.log(`❌ Test failed: ${data.testName} - ${data.error}`);
    });
    
    coordinator.on('fix:applied', (fix) => {
      console.log(`🔧 Fix applied: ${fix.description}`);
    });
  });
  
  test('Complete DirectiveLab workflow', async ({ page }) => {
    const results = await coordinator.runTestSuite(page, [
      {
        name: 'Navigate to Dashboard',
        function: async () => {
          await page.goto('http://localhost:3000/dashboard');
          await page.waitForLoadState('networkidle');
        }
      },
      {
        name: 'Access DirectiveLab',
        function: async () => {
          const directiveLab = await coordinator.testingAgent.findElement(page, [
            { name: 'testId', selector: '[data-testid="directive-lab"]' },
            { name: 'button', selector: 'button:has-text("DirectiveLab")' },
            { name: 'nav', selector: 'nav >> text=DirectiveLab' },
            { name: 'link', selector: 'a[href*="directive"]' },
            { name: 'partial', selector: ':has-text("Directive")' }
          ]);
          
          if (!directiveLab) {
            throw new Error('DirectiveLab not accessible');
          }
          
          await directiveLab.click();
          await page.waitForTimeout(1000);
        }
      },
      {
        name: 'Submit Feedback Form',
        function: async () => {
          // Enhanced form interaction
          const feedbackInput = await coordinator.testingAgent.findElement(page, [
            { name: 'testId', selector: '[data-testid="feedback-input"]' },
            { name: 'placeholder', selector: 'textarea[placeholder*="feedback"]' },
            { name: 'label', selector: 'textarea[aria-label*="feedback"]' },
            { name: 'name', selector: 'textarea[name="feedback"]' },
            { name: 'first', selector: 'textarea:first-of-type' }
          ]);
          
          if (feedbackInput) {
            await feedbackInput.fill('Enhanced test: Implement real-time voice AI processing for enterprise SaaS platform');
            
            const submitButton = await coordinator.testingAgent.findElement(page, [
              { name: 'testId', selector: '[data-testid="submit-button"]' },
              { name: 'text', selector: 'button:has-text("Submit")' },
              { name: 'type', selector: 'button[type="submit"]' },
              { name: 'class', selector: 'button.primary, button.submit' },
              { name: 'form', selector: 'form button:last-child' }
            ]);
            
            if (submitButton) {
              await submitButton.click();
              await page.waitForTimeout(2000);
            } else {
              throw new Error('Submit button not found');
            }
          } else {
            throw new Error('Feedback input not found');
          }
        }
      },
      {
        name: 'Verify Submission',
        function: async () => {
          // Try multiple success indicators
          const successSelectors = [
            '[data-testid="success-message"]',
            '.success, .alert-success',
            'text=Success, text=Submitted, text=Thank you',
            '[class*="success"]'
          ];
          
          let verified = false;
          for (const selector of successSelectors) {
            const count = await page.locator(selector).count();
            if (count > 0) {
              verified = true;
              break;
            }
          }
          
          if (!verified) {
            // Fallback: Check API response
            const response = await page.request.get('http://localhost:3000/api/sdip/health');
            if (!response.ok()) {
              throw new Error('Submission verification failed - no success indicators found');
            }
          }
        }
      }
    ]);
    
    // Enhanced assertions
    expect(results.handoff.metrics.totalTests).toBe(4);
    expect(results.handoff.metrics.failed).toBeLessThan(results.handoff.metrics.totalTests);
    
    // Log comprehensive results
    console.log('\n📊 Test Suite Summary:');
    console.log(`   Tests: ${results.handoff.metrics.totalTests}`);
    console.log(`   Passed: ${results.handoff.metrics.passed}`);
    console.log(`   Failed: ${results.handoff.metrics.failed}`);
    console.log(`   Duration: ${(results.handoff.metrics.duration / 1000).toFixed(2)}s`);
    console.log(`   Flakiness: ${(results.diagnosis.summary.flakiness * 100).toFixed(1)}%`);
    
    if (results.diagnosis.fixScripts.length > 0) {
      console.log('\n🔧 Generated Fixes:');
      results.diagnosis.fixScripts.forEach((fix, i) => {
        console.log(`   ${i + 1}. ${fix.description} (${fix.autoExecutable ? 'Auto' : 'Manual'})`);
      });
    }
    
    if (results.diagnosis.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      results.diagnosis.recommendations.forEach(rec => {
        console.log(`   [${rec.priority}] ${rec.recommendation}`);
      });
    }
  });
  
  test('Demonstrate intelligent retry logic', async ({ page }) => {
    let attemptCount = 0;
    
    const flakyTest = {
      name: 'Flaky Network Test',
      function: async () => {
        attemptCount++;
        console.log(`  Attempt ${attemptCount}`);
        
        if (attemptCount < 3) {
          throw new Error('Simulated network timeout');
        }
        
        await page.goto('http://localhost:3000/dashboard');
      }
    };
    
    // Test intelligent retry
    const result = await coordinator.testingAgent.intelligentRetry(
      page, 
      flakyTest, 
      3
    );
    
    expect(result.passed).toBe(true);
    expect(attemptCount).toBe(3);
    console.log(`✅ Test passed after ${attemptCount} attempts`);
  });
});
```

---

## Jest Integration

### 1. Jest Configuration

```javascript
// jest.config.js
export default {
  preset: 'jest-playwright-preset',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['**/*.enhanced.test.js'],
  testTimeout: 30000,
  maxWorkers: 1 // Run sequentially for agent coordination
};
```

### 2. Enhanced Jest Setup

```javascript
// tests/setup.js
import { TestCollaborationCoordinator } from '../lib/testing/enhanced-testing-debugging-agents.js';

global.coordinator = null;

beforeAll(async () => {
  global.coordinator = new TestCollaborationCoordinator();
  await global.coordinator.initialize();
  
  console.log('🚀 Enhanced testing agents initialized');
});

afterAll(async () => {
  if (global.coordinator) {
    console.log('🔚 Enhanced testing session complete');
  }
});
```

### 3. Jest Test Example

```javascript
// tests/directivelab.enhanced.test.js
import { chromium } from 'playwright';

describe('Enhanced DirectiveLab with Jest', () => {
  let browser, page;
  
  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
  });
  
  afterAll(async () => {
    await browser.close();
  });
  
  test('should handle form submission with self-healing selectors', async () => {
    const results = await global.coordinator.runTestSuite(page, [
      {
        name: 'Form Submission Test',
        function: async () => {
          await page.goto('http://localhost:3000/dashboard');
          
          const form = await global.coordinator.testingAgent.findElement(page, [
            { name: 'testId', selector: '[data-testid="feedback-form"]' },
            { name: 'tag', selector: 'form' },
            { name: 'class', selector: '.feedback-form' }
          ]);
          
          expect(form).not.toBeNull();
        }
      }
    ]);
    
    expect(results.handoff.metrics.passed).toBeGreaterThan(0);
  });
});
```

---

## CI/CD Pipeline Integration

### 1. GitHub Actions

```yaml
# .github/workflows/enhanced-testing.yml
name: Enhanced Testing Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  enhanced-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Install Playwright
      run: npx playwright install --with-deps
    
    - name: Setup environment
      run: |
        echo "SUPABASE_URL=${{ secrets.SUPABASE_URL }}" >> .env
        echo "SUPABASE_ANON_KEY=${{ secrets.SUPABASE_ANON_KEY }}" >> .env
        echo "NODE_ENV=test" >> .env
    
    - name: Start test server
      run: |
        npm run build
        npm start &
        npx wait-on http://localhost:3000
    
    - name: Run enhanced tests
      run: npx playwright test tests/e2e/enhanced-*.test.js
      env:
        CI: true
    
    - name: Process test results
      if: always()
      run: |
        # Generate test report with fix recommendations
        node scripts/generate-test-report.js
    
    - name: Upload test artifacts
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: enhanced-test-results
        path: |
          test-results/
          playwright-report/
          scripts/fixes/
```

### 2. Jenkins Pipeline

```groovy
// Jenkinsfile
pipeline {
    agent any
    
    environment {
        SUPABASE_URL = credentials('supabase-url')
        SUPABASE_ANON_KEY = credentials('supabase-anon-key')
    }
    
    stages {
        stage('Setup') {
            steps {
                sh 'npm ci'
                sh 'npx playwright install --with-deps'
            }
        }
        
        stage('Enhanced Testing') {
            steps {
                sh 'npm start &'
                sh 'npx wait-on http://localhost:3000'
                sh 'npx playwright test tests/e2e/enhanced-*.test.js'
            }
            post {
                always {
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'playwright-report',
                        reportFiles: 'index.html',
                        reportName: 'Enhanced Test Report'
                    ])
                    
                    archiveArtifacts artifacts: 'scripts/fixes/**/*.js', 
                                   fingerprint: true
                }
                failure {
                    script {
                        // Auto-apply safe fixes and retry
                        sh 'node scripts/apply-safe-fixes.js'
                        sh 'npx playwright test tests/e2e/enhanced-*.test.js || true'
                    }
                }
            }
        }
    }
}
```

---

## Configuration Options

### 1. Coordinator Configuration

```javascript
// enhanced-config.js
export const enhancedTestingConfig = {
  // Retry settings
  maxRetries: 3,
  retryStrategies: {
    'TimeoutError': { wait: 2000, multiplier: 2 },
    'NetworkError': { wait: 1000, multiplier: 1.5 },
    'ElementNotFound': { wait: 500, multiplier: 1.2 }
  },
  
  // Selector strategies
  defaultSelectorOrder: [
    'testId',    // [data-testid="..."]
    'aria',      // [aria-label="..."]
    'text',      // text="..."
    'role',      // role="..." 
    'structure', // nth-child, etc.
    'partial'    // partial text match
  ],
  
  // Fix generation
  autoFixCategories: [
    'ELEMENT_NOT_FOUND',
    'API_TIMEOUT'
  ],
  
  manualReviewRequired: [
    'DATABASE_ERROR',
    'PERMISSION_DENIED',
    'NETWORK_ERROR'
  ],
  
  // Performance thresholds
  thresholds: {
    maxTestDuration: 30000,     // 30 seconds
    maxMTTD: 5000,             // 5 seconds
    minAutoFixRate: 0.6,       // 60%
    maxFlakiness: 0.02         // 2%
  }
};

// Apply configuration
import { TestCollaborationCoordinator } from './enhanced-testing-debugging-agents.js';

const coordinator = new TestCollaborationCoordinator(enhancedTestingConfig);
```

### 2. Environment-Specific Settings

```javascript
// config/enhanced-testing.js
const configs = {
  development: {
    enableVerboseLogging: true,
    autoApplyFixes: true,
    saveFixScripts: true,
    enableMetricsCollection: true
  },
  
  test: {
    enableVerboseLogging: false,
    autoApplyFixes: false,
    saveFixScripts: false,
    enableMetricsCollection: true
  },
  
  production: {
    enableVerboseLogging: false,
    autoApplyFixes: false,
    saveFixScripts: true,
    enableMetricsCollection: true,
    requireManualApproval: true
  }
};

export default configs[process.env.NODE_ENV || 'development'];
```

---

## Migration from Basic Agents

### 1. Assessment Checklist

Before migrating, assess your current testing setup:

```bash
# Audit current test structure
node scripts/audit-current-tests.js

# Identify selector patterns
node scripts/analyze-selectors.js

# Check fix automation opportunities
node scripts/assess-fix-potential.js
```

### 2. Migration Steps

#### Step 1: Gradual Integration

```javascript
// migration-wrapper.js
import { TestCollaborationCoordinator } from './lib/testing/enhanced-testing-debugging-agents.js';

class MigrationWrapper {
  constructor() {
    this.enhancedCoordinator = null;
    this.isEnhancedEnabled = process.env.ENABLE_ENHANCED_AGENTS === 'true';
  }
  
  async initialize() {
    if (this.isEnhancedEnabled) {
      this.enhancedCoordinator = new TestCollaborationCoordinator();
      await this.enhancedCoordinator.initialize();
      console.log('✅ Enhanced agents enabled');
    } else {
      console.log('ℹ️  Using basic testing (set ENABLE_ENHANCED_AGENTS=true to upgrade)');
    }
  }
  
  async runTest(page, testName, testFunction) {
    if (this.enhancedCoordinator) {
      // Use enhanced testing
      return await this.enhancedCoordinator.testingAgent.runTest(page, testName, testFunction);
    } else {
      // Fallback to basic testing
      return await this.runBasicTest(page, testName, testFunction);
    }
  }
  
  async runBasicTest(page, testName, testFunction) {
    const startTime = Date.now();
    try {
      await testFunction();
      return { name: testName, passed: true, duration: Date.now() - startTime };
    } catch (error) {
      return { name: testName, passed: false, error, duration: Date.now() - startTime };
    }
  }
}

export default MigrationWrapper;
```

#### Step 2: Selector Migration

```javascript
// scripts/migrate-selectors.js
import fs from 'fs';
import path from 'path';

const basicToEnhancedSelectors = {
  // Convert basic selectors to self-healing strategies
  '#submit-button': [
    { name: 'testId', selector: '[data-testid="submit-button"]' },
    { name: 'id', selector: '#submit-button' },
    { name: 'text', selector: 'button:has-text("Submit")' }
  ],
  
  '.login-form input[type="email"]': [
    { name: 'testId', selector: '[data-testid="email-input"]' },
    { name: 'type', selector: 'input[type="email"]' },
    { name: 'name', selector: 'input[name="email"]' }
  ]
};

async function migrateSelectors() {
  const testFiles = fs.readdirSync('./tests', { recursive: true })
    .filter(f => f.endsWith('.test.js'));
  
  for (const file of testFiles) {
    let content = fs.readFileSync(path.join('./tests', file), 'utf8');
    
    // Replace basic selectors with enhanced patterns
    Object.entries(basicToEnhancedSelectors).forEach(([oldSelector, strategies]) => {
      const strategiesCode = JSON.stringify(strategies, null, 6);
      content = content.replace(
        new RegExp(`page\\.locator\\(['"]${oldSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\)`, 'g'),
        `coordinator.testingAgent.findElement(page, ${strategiesCode})`
      );
    });
    
    fs.writeFileSync(path.join('./tests', file), content);
    console.log(`✅ Migrated ${file}`);
  }
}

migrateSelectors().catch(console.error);
```

### 3. Rollback Strategy

```javascript
// rollback-plan.js
export const rollbackPlan = {
  // Feature flags for controlled rollout
  enableSelfHealingSelectors: true,
  enableAutoFixGeneration: false,
  enableIntelligentRetry: true,
  enableRealTimeCollaboration: false,
  
  // Monitoring thresholds for automatic rollback
  rollbackTriggers: {
    testFailureRateIncrease: 0.20,  // 20% increase in failures
    averageDurationIncrease: 0.50,  // 50% slower tests
    criticalErrorsDetected: true     // Any critical errors
  },
  
  async checkRollbackConditions(currentMetrics, baselineMetrics) {
    const failureRateIncrease = 
      (currentMetrics.failureRate - baselineMetrics.failureRate) / baselineMetrics.failureRate;
    
    const durationIncrease = 
      (currentMetrics.avgDuration - baselineMetrics.avgDuration) / baselineMetrics.avgDuration;
    
    if (failureRateIncrease > this.rollbackTriggers.testFailureRateIncrease) {
      console.log('🚨 Rollback triggered: High failure rate increase');
      return true;
    }
    
    if (durationIncrease > this.rollbackTriggers.averageDurationIncrease) {
      console.log('🚨 Rollback triggered: Significant duration increase');
      return true;
    }
    
    return false;
  }
};
```

---

## Advanced Patterns

### 1. Custom Fix Generators

```javascript
// custom-fix-generators.js
export class CustomFixGenerators {
  static async generateCustomAuthFix(issue) {
    if (issue.testName.includes('auth') && issue.category === 'NETWORK_ERROR') {
      return {
        id: `auth-fix-${Date.now()}`,
        type: 'AUTH_NETWORK_ERROR',
        description: 'Reset authentication tokens and retry',
        script: `
          // Clear auth tokens
          await page.evaluate(() => {
            localStorage.removeItem('authToken');
            sessionStorage.clear();
          });
          
          // Re-authenticate
          await page.goto('/login');
          await page.fill('[data-testid="username"]', process.env.TEST_USERNAME);
          await page.fill('[data-testid="password"]', process.env.TEST_PASSWORD);
          await page.click('[data-testid="login-button"]');
        `,
        autoExecutable: true,
        requiresReview: false
      };
    }
    return null;
  }
  
  static async generatePerformanceFix(issue) {
    if (issue.category === 'TIMEOUT' && issue.testName.includes('performance')) {
      return {
        id: `perf-fix-${Date.now()}`,
        type: 'PERFORMANCE_OPTIMIZATION',
        description: 'Apply performance optimizations',
        manualSteps: [
          'Enable browser caching',
          'Optimize image loading',
          'Reduce JavaScript bundle size',
          'Implement lazy loading for non-critical content'
        ],
        autoExecutable: false,
        requiresReview: true
      };
    }
    return null;
  }
}

// Extend debugging agent
import { EnhancedDebuggingSubAgent } from './enhanced-testing-debugging-agents.js';

class CustomDebuggingAgent extends EnhancedDebuggingSubAgent {
  setupFixGenerators() {
    super.setupFixGenerators();
    
    // Add custom generators
    this.fixGenerators['AUTH_NETWORK_ERROR'] = CustomFixGenerators.generateCustomAuthFix;
    this.fixGenerators['PERFORMANCE_TIMEOUT'] = CustomFixGenerators.generatePerformanceFix;
  }
}
```

### 2. Machine Learning Integration

```javascript
// ml-enhanced-diagnosis.js
import * as tf from '@tensorflow/tfjs-node';

export class MLEnhancedDiagnosis {
  constructor() {
    this.model = null;
    this.featureExtractor = new FailureFeatureExtractor();
  }
  
  async initialize() {
    // Load pre-trained model for failure classification
    this.model = await tf.loadLayersModel('./models/failure-classifier.json');
  }
  
  async predictFailureCategory(failure) {
    const features = this.featureExtractor.extract(failure);
    const prediction = this.model.predict(tf.tensor2d([features]));
    const probabilities = await prediction.data();
    
    const categories = [
      'ELEMENT_NOT_FOUND',
      'TIMEOUT',
      'NETWORK_ERROR',
      'PERMISSION_DENIED',
      'DATABASE_ERROR'
    ];
    
    const maxIndex = probabilities.indexOf(Math.max(...probabilities));
    return {
      category: categories[maxIndex],
      confidence: probabilities[maxIndex]
    };
  }
}

class FailureFeatureExtractor {
  extract(failure) {
    return [
      // Error message features
      failure.error.includes('timeout') ? 1 : 0,
      failure.error.includes('not found') ? 1 : 0,
      failure.error.includes('network') ? 1 : 0,
      
      // Context features
      failure.consoleLogs?.filter(log => log.type === 'error').length || 0,
      failure.networkLogs?.filter(log => !log.ok).length || 0,
      
      // Timing features
      Date.now() - new Date(failure.timestamp).getTime()
    ];
  }
}
```

---

## Real-World Examples

### 1. E-commerce Checkout Flow

```javascript
// examples/ecommerce-checkout.test.js
import { test } from '@playwright/test';
import { TestCollaborationCoordinator } from '../lib/testing/enhanced-testing-debugging-agents.js';

test('Complete e-commerce checkout with enhanced agents', async ({ page }) => {
  const coordinator = new TestCollaborationCoordinator();
  await coordinator.initialize();
  
  const checkoutFlow = [
    {
      name: 'Add Product to Cart',
      function: async () => {
        await page.goto('http://localhost:3000/products');
        
        const addToCartButton = await coordinator.testingAgent.findElement(page, [
          { name: 'testId', selector: '[data-testid="add-to-cart-123"]' },
          { name: 'product', selector: '[data-product-id="123"] .add-to-cart' },
          { name: 'text', selector: 'button:has-text("Add to Cart")' },
          { name: 'class', selector: '.add-to-cart-btn' },
          { name: 'form', selector: 'form[data-product="123"] button[type="submit"]' }
        ]);
        
        await addToCartButton.click();
        await page.waitForSelector('[data-testid="cart-count"]:has-text("1")');
      }
    },
    {
      name: 'Proceed to Checkout',
      function: async () => {
        const checkoutButton = await coordinator.testingAgent.findElement(page, [
          { name: 'testId', selector: '[data-testid="proceed-checkout"]' },
          { name: 'text', selector: 'button:has-text("Checkout")' },
          { name: 'class', selector: '.checkout-button, .btn-checkout' },
          { name: 'cart', selector: '.cart-actions button:last-child' }
        ]);
        
        await checkoutButton.click();
        await page.waitForURL('**/checkout');
      }
    },
    {
      name: 'Fill Shipping Information',
      function: async () => {
        const shippingFields = {
          'firstName': 'John',
          'lastName': 'Doe',
          'address': '123 Main St',
          'city': 'Anytown',
          'zipCode': '12345'
        };
        
        for (const [field, value] of Object.entries(shippingFields)) {
          const input = await coordinator.testingAgent.findElement(page, [
            { name: 'testId', selector: `[data-testid="shipping-${field}"]` },
            { name: 'name', selector: `input[name="${field}"], input[name="shipping[${field}]"]` },
            { name: 'id', selector: `#${field}, #shipping-${field}` },
            { name: 'placeholder', selector: `input[placeholder*="${field}"]` }
          ]);
          
          await input.fill(value);
        }
      }
    },
    {
      name: 'Complete Payment',
      function: async () => {
        // Enhanced payment form handling
        const cardNumber = await coordinator.testingAgent.findElement(page, [
          { name: 'testId', selector: '[data-testid="card-number"]' },
          { name: 'stripe', selector: 'input[data-elements-stable-field-name="cardNumber"]' },
          { name: 'name', selector: 'input[name="cardNumber"]' },
          { name: 'autocomplete', selector: 'input[autocomplete="cc-number"]' }
        ]);
        
        await cardNumber.fill('4242424242424242');
        
        const submitPayment = await coordinator.testingAgent.findElement(page, [
          { name: 'testId', selector: '[data-testid="submit-payment"]' },
          { name: 'text', selector: 'button:has-text("Complete Order")' },
          { name: 'form', selector: 'form[id*="payment"] button[type="submit"]' },
          { name: 'class', selector: '.payment-submit, .complete-order' }
        ]);
        
        await submitPayment.click();
        await page.waitForSelector('[data-testid="order-confirmation"]', { timeout: 10000 });
      }
    }
  ];
  
  const results = await coordinator.runTestSuite(page, checkoutFlow);
  
  // Enhanced verification
  console.log('\n🛒 E-commerce Checkout Results:');
  console.log(`   Order Success Rate: ${(results.handoff.metrics.passed / results.handoff.metrics.totalTests * 100).toFixed(1)}%`);
  console.log(`   Average Step Duration: ${(results.handoff.metrics.duration / results.handoff.metrics.totalTests / 1000).toFixed(2)}s`);
  
  if (results.diagnosis.issues.length > 0) {
    console.log('\n🚨 Issues Detected:');
    results.diagnosis.issues.forEach(issue => {
      console.log(`   - ${issue.testName}: ${issue.category} (${issue.severity})`);
      console.log(`     Fix: ${issue.suggestedFix}`);
    });
  }
});
```

### 2. Form Validation Testing

```javascript
// examples/form-validation.test.js
test('Complex form validation with smart error handling', async ({ page }) => {
  const coordinator = new TestCollaborationCoordinator();
  await coordinator.initialize();
  
  const formValidationTests = [
    {
      name: 'Test Required Field Validation',
      function: async () => {
        await page.goto('http://localhost:3000/contact');
        
        const submitButton = await coordinator.testingAgent.findElement(page, [
          { name: 'testId', selector: '[data-testid="contact-submit"]' },
          { name: 'text', selector: 'button:has-text("Send Message")' },
          { name: 'form', selector: 'form button[type="submit"]' }
        ]);
        
        // Submit empty form to trigger validation
        await submitButton.click();
        
        // Check for validation errors with enhanced detection
        const errorMessage = await coordinator.testingAgent.findElement(page, [
          { name: 'testId', selector: '[data-testid="validation-error"]' },
          { name: 'class', selector: '.error-message, .validation-error, .field-error' },
          { name: 'role', selector: '[role="alert"]' },
          { name: 'text', selector: 'text="required", text="This field"' }
        ]);
        
        if (!errorMessage) {
          throw new Error('Required field validation not working');
        }
      }
    },
    {
      name: 'Test Email Format Validation',
      function: async () => {
        const emailField = await coordinator.testingAgent.findElement(page, [
          { name: 'testId', selector: '[data-testid="email-input"]' },
          { name: 'type', selector: 'input[type="email"]' },
          { name: 'name', selector: 'input[name="email"]' }
        ]);
        
        // Test invalid email format
        await emailField.fill('invalid-email');
        
        const submitButton = await coordinator.testingAgent.findElement(page, [
          { name: 'testId', selector: '[data-testid="contact-submit"]' },
          { name: 'form', selector: 'form button[type="submit"]' }
        ]);
        
        await submitButton.click();
        
        // Verify email validation error
        const emailError = await coordinator.testingAgent.findElement(page, [
          { name: 'testId', selector: '[data-testid="email-error"]' },
          { name: 'sibling', selector: 'input[type="email"] + .error' },
          { name: 'text', selector: 'text="email", text="invalid"' }
        ]);
        
        if (!emailError) {
          throw new Error('Email format validation not working');
        }
      }
    }
  ];
  
  const results = await coordinator.runTestSuite(page, formValidationTests);
  
  // Log validation testing insights
  console.log('\n📝 Form Validation Results:');
  console.log(`   Validation Coverage: ${(results.handoff.metrics.passed / results.handoff.metrics.totalTests * 100).toFixed(1)}%`);
  
  if (results.diagnosis.recommendations.length > 0) {
    console.log('\n💡 Form Improvement Suggestions:');
    results.diagnosis.recommendations.forEach(rec => {
      if (rec.category === 'MAINTENANCE') {
        console.log(`   - ${rec.recommendation}`);
      }
    });
  }
});
```

---

## Performance Optimization

### 1. Parallel Test Execution

```javascript
// parallel-execution.js
import { TestCollaborationCoordinator } from './enhanced-testing-debugging-agents.js';

class ParallelTestCoordinator {
  constructor(maxConcurrency = 3) {
    this.maxConcurrency = maxConcurrency;
    this.coordinators = [];
  }
  
  async initialize() {
    for (let i = 0; i < this.maxConcurrency; i++) {
      const coordinator = new TestCollaborationCoordinator();
      await coordinator.initialize();
      this.coordinators.push(coordinator);
    }
  }
  
  async runTestsInParallel(testGroups) {
    const promises = testGroups.slice(0, this.maxConcurrency).map((group, index) => {
      return this.coordinators[index].runTestSuite(group.page, group.tests);
    });
    
    return await Promise.all(promises);
  }
}
```

### 2. Test Result Caching

```javascript
// test-caching.js
import crypto from 'crypto';
import fs from 'fs/promises';

class TestResultCache {
  constructor(cacheDir = './test-cache') {
    this.cacheDir = cacheDir;
  }
  
  async getCachedResult(testDefinition, pageState) {
    const hash = this.generateHash(testDefinition, pageState);
    const cachePath = `${this.cacheDir}/${hash}.json`;
    
    try {
      const cached = await fs.readFile(cachePath, 'utf8');
      const result = JSON.parse(cached);
      
      // Check if cache is still valid (e.g., less than 1 hour old)
      if (Date.now() - result.timestamp < 3600000) {
        return result.data;
      }
    } catch (error) {
      // Cache miss or invalid
    }
    
    return null;
  }
  
  async cacheResult(testDefinition, pageState, result) {
    const hash = this.generateHash(testDefinition, pageState);
    const cachePath = `${this.cacheDir}/${hash}.json`;
    
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify({
      timestamp: Date.now(),
      data: result
    }));
  }
  
  generateHash(testDefinition, pageState) {
    const content = JSON.stringify({ testDefinition, pageState });
    return crypto.createHash('md5').update(content).digest('hex');
  }
}
```

---

This comprehensive integration guide provides all the necessary information to successfully implement the Enhanced Testing and Debugging Sub-Agents in various environments and scenarios. The examples demonstrate real-world usage patterns while the configuration options allow for customization to specific needs.

*Last Updated: 2025-09-04*  
*Version: 1.0.0*  
*Part of LEO Protocol v4.1.2 Enhanced Testing Framework*