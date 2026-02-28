---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Enhanced Testing and Debugging Sub-Agents Troubleshooting Guide



## Table of Contents

- [Metadata](#metadata)
- [Quick Diagnostics](#quick-diagnostics)
  - [Health Check Script](#health-check-script)
- [Common Issues](#common-issues)
  - [Issue 1: Self-Healing Selectors Not Working](#issue-1-self-healing-selectors-not-working)
  - [Issue 2: Fix Scripts Not Executing](#issue-2-fix-scripts-not-executing)
  - [Issue 3: Handoff Data Too Large](#issue-3-handoff-data-too-large)
  - [Issue 4: Diagnosis Taking Too Long](#issue-4-diagnosis-taking-too-long)
- [Error Messages](#error-messages)
  - [Database Connection Errors](#database-connection-errors)
  - [Playwright Errors](#playwright-errors)
  - [Import/Module Errors](#importmodule-errors)
- [Performance Problems](#performance-problems)
  - [Slow Test Execution](#slow-test-execution)
  - [Memory Usage Issues](#memory-usage-issues)
- [Configuration Issues](#configuration-issues)
  - [Environment Variables Not Loaded](#environment-variables-not-loaded)
  - [Database Schema Issues](#database-schema-issues)
  - [Playwright Configuration Conflicts](#playwright-configuration-conflicts)
- [Integration Problems](#integration-problems)
  - [Jest Integration Issues](#jest-integration-issues)
  - [CI/CD Pipeline Issues](#cicd-pipeline-issues)
- [Best Practices](#best-practices)
  - [Debugging Best Practices](#debugging-best-practices)
  - [Performance Best Practices](#performance-best-practices)
- [Frequently Asked Questions](#frequently-asked-questions)
  - [Q: Do enhanced agents work with existing Playwright tests?](#q-do-enhanced-agents-work-with-existing-playwright-tests)
  - [Q: How do I disable auto-fix for critical tests?](#q-how-do-i-disable-auto-fix-for-critical-tests)
  - [Q: Can I use enhanced agents with headless browsers?](#q-can-i-use-enhanced-agents-with-headless-browsers)
  - [Q: How do I handle custom authentication in enhanced tests?](#q-how-do-i-handle-custom-authentication-in-enhanced-tests)
  - [Q: How do I handle tests that require specific data setup?](#q-how-do-i-handle-tests-that-require-specific-data-setup)
- [Debug Utilities](#debug-utilities)
  - [Enhanced Debug Console](#enhanced-debug-console)
  - [Test Recorder](#test-recorder)
- [Support Resources](#support-resources)
  - [Getting Help](#getting-help)
  - [Documentation Links](#documentation-links)
  - [Community Resources](#community-resources)

## Metadata
- **Category**: Testing
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, e2e

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Common Issues](#common-issues)
3. [Error Messages](#error-messages)
4. [Performance Problems](#performance-problems)
5. [Configuration Issues](#configuration-issues)
6. [Integration Problems](#integration-problems)
7. [Best Practices](#best-practices)
8. [FAQ](#frequently-asked-questions)
9. [Debug Utilities](#debug-utilities)
10. [Support Resources](#support-resources)

---

## Quick Diagnostics

### Health Check Script

Run this script to quickly diagnose system health:

```javascript
// scripts/health-check.js
import { TestCollaborationCoordinator } from '../lib/testing/enhanced-testing-debugging-agents.js';
import { chromium } from '@playwright/test';

async function runHealthCheck() {
  console.log('🏥 Enhanced Testing Agents Health Check');
  console.log('='.repeat(50));
  
  const issues = [];
  
  // 1. Environment Check
  console.log('\n📋 Environment Check:');
  const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      console.log(`   ✅ ${envVar}: Set`);
    } else {
      console.log(`   ❌ ${envVar}: Missing`);
      issues.push(`Missing environment variable: ${envVar}`);
    }
  }
  
  // 2. Dependencies Check
  console.log('\n📦 Dependencies Check:');
  try {
    const { createClient } = await import('@supabase/supabase-js');
    console.log('   ✅ Supabase client: Available');
  } catch (error) {
    console.log('   ❌ Supabase client: Not available');
    issues.push('Supabase dependency not installed');
  }
  
  try {
    await chromium.launch({ headless: true });
    console.log('   ✅ Playwright: Available');
  } catch (error) {
    console.log('   ❌ Playwright: Not available');
    issues.push('Playwright not properly installed');
  }
  
  // 3. Agent Initialization
  console.log('\n🤖 Agent Initialization:');
  try {
    const coordinator = new TestCollaborationCoordinator();
    await coordinator.initialize();
    console.log('   ✅ Coordinator: Initialized');
    
    if (coordinator.testingAgent.backstory) {
      console.log('   ✅ Testing Agent: Backstory loaded');
    } else {
      console.log('   ⚠️  Testing Agent: No backstory (will use defaults)');
    }
    
    if (coordinator.debuggingAgent.backstory) {
      console.log('   ✅ Debugging Agent: Backstory loaded');
    } else {
      console.log('   ⚠️  Debugging Agent: No backstory (will use defaults)');
    }
    
  } catch (error) {
    console.log('   ❌ Agent initialization failed');
    issues.push(`Agent initialization error: ${error.message}`);
  }
  
  // 4. Database Connectivity
  console.log('\n🗄️  Database Connectivity:');
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
    
    const { data, error } = await supabase
      .from('leo_sub_agents')
      .select('count')
      .limit(1);
    
    if (error) {
      console.log(`   ❌ Database: ${error.message}`);
      issues.push(`Database connection error: ${error.message}`);
    } else {
      console.log('   ✅ Database: Connected');
    }
  } catch (error) {
    console.log('   ❌ Database check failed');
    issues.push(`Database check error: ${error.message}`);
  }
  
  // 5. Summary
  console.log('\n📊 Health Check Summary:');
  if (issues.length === 0) {
    console.log('   ✅ All systems operational');
    console.log('   🚀 Ready to run enhanced tests');
  } else {
    console.log(`   ❌ ${issues.length} issue(s) found:`);
    issues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`);
    });
    console.log('\n   💡 See troubleshooting guide for solutions');
  }
}

runHealthCheck().catch(console.error);
```

Run with: `node scripts/health-check.js`

---

## Common Issues

### Issue 1: Self-Healing Selectors Not Working

**Symptoms:**
- Tests fail despite multiple selector strategies
- Elements not found with any strategy
- Frequent "element not found" errors

**Diagnostics:**
```javascript
// Debug selector strategies
const debugSelectors = async (page, strategies) => {
  console.log('🔍 Debugging Selector Strategies:');
  
  for (const strategy of strategies) {
    try {
      const element = await page.locator(strategy.selector).first();
      const count = await element.count();
      const isVisible = count > 0 ? await element.isVisible() : false;
      
      console.log(`   ${count > 0 ? '✅' : '❌'} ${strategy.name}: ${strategy.selector}`);
      console.log(`      Count: ${count}, Visible: ${isVisible}`);
      
      if (count > 0) {
        const text = await element.textContent().catch(() => '');
        console.log(`      Text: "${text.substring(0, 50)}..."`);
      }
    } catch (error) {
      console.log(`   ❌ ${strategy.name}: Error - ${error.message}`);
    }
  }
};

// Usage in test
await debugSelectors(page, [
  { name: 'testId', selector: '[data-testid="directive-lab"]' },
  { name: 'text', selector: 'button:has-text("DirectiveLab")' }
]);
```

**Solutions:**

1. **Add Missing Test IDs:**
   ```javascript
   // Add data-testid attributes to components
   <button data-testid="directive-lab">DirectiveLab</button>
   <textarea data-testid="feedback-input" placeholder="Enter feedback...">
   <button data-testid="submit-button" type="submit">Submit</button>
   ```

2. **Improve Selector Strategies:**
   ```javascript
   // More comprehensive strategies
   const betterStrategies = [
     // Primary: Test ID
     { name: 'testId', selector: '[data-testid="element-name"]' },
     
     // Secondary: ARIA attributes
     { name: 'aria', selector: '[aria-label="Element Name"]' },
     { name: 'role', selector: '[role="button"][name="Element Name"]' },
     
     // Tertiary: Text content
     { name: 'text', selector: 'button:has-text("Element Name")' },
     { name: 'partialText', selector: 'button:has-text(/Element/i)' },
     
     // Quaternary: Structure
     { name: 'structure', selector: 'nav > button:nth-child(3)' },
     
     // Last resort: CSS selectors
     { name: 'class', selector: '.element-class' },
     { name: 'id', selector: '#element-id' }
   ];
   ```

3. **Wait for Dynamic Content:**
   ```javascript
   // Wait for element to appear
   const element = await coordinator.testingAgent.findElement(page, strategies);
   if (!element) {
     await page.waitForTimeout(1000); // Wait for dynamic content
     const retryElement = await coordinator.testingAgent.findElement(page, strategies);
   }
   ```

### Issue 2: Fix Scripts Not Executing

**Symptoms:**
- Generated fix scripts don't run
- Permission denied errors
- Scripts generate but don't apply

**Diagnostics:**
```bash
# Check script permissions
ls -la scripts/fixes/

# Check Node.js shebang
head -n 1 scripts/fixes/fix-*.js

# Test script execution manually
node scripts/fixes/fix-example.js
```

**Solutions:**

1. **Fix Permissions:**
   ```bash
   chmod +x scripts/fixes/*.js
   chmod 755 scripts/fixes/
   ```

2. **Update Fix Generation:**
   ```javascript
   // Ensure proper script format
   const fixScript = `#!/usr/bin/env node

   /**
    * Auto-generated fix for: ${issue.failureId}
    * Generated: ${new Date().toISOString()}
    */

   async function applyFix() {
     try {
       console.log('🔧 Applying fix...');
       
       // Fix implementation here
       
       console.log('✅ Fix applied successfully');
       process.exit(0);
     } catch (error) {
       console.error('❌ Fix failed:', error.message);
       process.exit(1);
     }
   }

   applyFix();
   `;
   ```

3. **Safe Execution Environment:**
   ```javascript
   // Enhanced fix application with safety checks
   async function safelyApplyFix(fix) {
     if (!fix.autoExecutable) {
       console.log('⚠️  Manual fix required:', fix.description);
       return false;
     }
     
     if (fix.requiresReview) {
       console.log('🔍 Fix requires manual review before execution');
       return false;
     }
     
     try {
       const { exec } = await import('child_process');
       const { promisify } = await import('util');
       const execAsync = promisify(exec);
       
       // Run in isolated environment
       const { stdout, stderr } = await execAsync(`node ${fix.path}`, {
         timeout: 10000,
         cwd: process.cwd(),
         env: { ...process.env, NODE_ENV: 'fix-application' }
       });
       
       console.log('Fix output:', stdout);
       if (stderr) console.warn('Fix warnings:', stderr);
       
       return true;
     } catch (error) {
       console.error('Fix execution failed:', error.message);
       return false;
     }
   }
   ```

### Issue 3: Handoff Data Too Large

**Symptoms:**
- Memory errors during test execution
- Slow handoff processing
- Screenshots causing timeout

**Solutions:**

1. **Compress Screenshots:**
   ```javascript
   import zlib from 'zlib';
   
   // Compress base64 screenshots
   const compressScreenshot = (base64Data) => {
     const buffer = Buffer.from(base64Data, 'base64');
     const compressed = zlib.gzipSync(buffer);
     return compressed.toString('base64');
   };
   
   // Usage in TestHandoff
   handoff.addFailure({
     ...failure,
     screenshot: compressScreenshot(failure.screenshot)
   });
   ```

2. **Store Large Artifacts Externally:**
   ```javascript
   import { createClient } from '@supabase/supabase-js';
   
   class ArtifactStorage {
     constructor() {
       this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
     }
     
     async storeScreenshot(screenshot) {
       const fileName = `screenshots/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
       const { data, error } = await this.supabase.storage
         .from('test-artifacts')
         .upload(fileName, Buffer.from(screenshot, 'base64'));
       
       if (error) throw error;
       return data.path;
     }
   }
   
   // Use storage instead of inline data
   const storage = new ArtifactStorage();
   const screenshotPath = await storage.storeScreenshot(screenshot);
   handoff.addArtifact('screenshots', screenshotPath);
   ```

3. **Limit Log Collection:**
   ```javascript
   // Limit console logs to errors and warnings only
   page.on('console', msg => {
     if (msg.type() === 'error' || msg.type() === 'warn') {
       consoleLogs.push({
         type: msg.type(),
         text: msg.text().substring(0, 500), // Limit message length
         timestamp: new Date().toISOString()
       });
     }
   });
   
   // Limit network logs to failed requests
   page.on('response', response => {
     if (!response.ok() && response.status() >= 400) {
       networkLogs.push({
         url: response.url(),
         status: response.status(),
         timestamp: new Date().toISOString()
       });
     }
   });
   ```

### Issue 4: Diagnosis Taking Too Long

**Symptoms:**
- Mean Time To Diagnosis exceeds target (>5s)
- Tests timeout during diagnosis phase
- Slow debugging agent responses

**Solutions:**

1. **Implement Diagnosis Caching:**
   ```javascript
   import crypto from 'crypto';
   
   class DiagnosisCache {
     constructor() {
       this.cache = new Map();
     }
     
     generateKey(error, stack) {
       const content = `${error}${stack}`;
       return crypto.createHash('md5').update(content).digest('hex');
     }
     
     get(error, stack) {
       const key = this.generateKey(error, stack);
       const cached = this.cache.get(key);
       
       if (cached && Date.now() - cached.timestamp < 300000) { // 5 minutes
         return cached.diagnosis;
       }
       return null;
     }
     
     set(error, stack, diagnosis) {
       const key = this.generateKey(error, stack);
       this.cache.set(key, {
         diagnosis,
         timestamp: Date.now()
       });
     }
   }
   
   // Usage in debugging agent
   const diagnosisCache = new DiagnosisCache();
   
   async diagnoseFailure(failure) {
     const cached = diagnosisCache.get(failure.error, failure.stack);
     if (cached) {
       console.log('🔄 Using cached diagnosis');
       return cached;
     }
     
     const diagnosis = await this.performDiagnosis(failure);
     diagnosisCache.set(failure.error, failure.stack, diagnosis);
     return diagnosis;
   }
   ```

2. **Parallel Diagnosis:**
   ```javascript
   // Diagnose multiple failures in parallel
   async analyzeHandoff(handoff) {
     console.log('🔬 Analyzing test handoff...');
     
     const diagnosisPromises = handoff.failures.map(failure => 
       this.diagnoseFailure(failure)
     );
     
     const issues = await Promise.all(diagnosisPromises);
     
     // Continue with aggregation...
   }
   ```

3. **Optimize Error Analysis:**
   ```javascript
   // Pre-compile regex patterns for better performance
   class OptimizedErrorAnalysis {
     constructor() {
       this.patterns = [
         { regex: /not found|cannot find/i, category: 'ELEMENT_NOT_FOUND' },
         { regex: /timeout|timed out/i, category: 'TIMEOUT' },
         { regex: /network|fetch|xhr/i, category: 'NETWORK_ERROR' },
         { regex: /permission|denied|unauthorized/i, category: 'PERMISSION_DENIED' },
         { regex: /database|sql|postgres/i, category: 'DATABASE_ERROR' }
       ].map(p => ({ ...p, compiled: new RegExp(p.regex) }));
     }
     
     analyzeError(error, stack) {
       const errorString = `${error} ${stack || ''}`;
       
       for (const pattern of this.patterns) {
         if (pattern.compiled.test(errorString)) {
           return {
             category: pattern.category,
             rootCause: this.getRootCause(pattern.category)
           };
         }
       }
       
       return { category: 'UNKNOWN', rootCause: 'Unable to classify' };
     }
   }
   ```

---

## Error Messages

### Database Connection Errors

**Error:** `Invalid API key or unable to connect to Supabase`

**Solution:**
```bash
# Check environment variables
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY

# Verify Supabase project status
curl -H "apikey: $SUPABASE_ANON_KEY" "$SUPABASE_URL/rest/v1/leo_sub_agents?select=count"

# Update environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
```

### Playwright Errors

**Error:** `Browser not found or failed to launch`

**Solution:**
```bash
# Reinstall Playwright browsers
npx playwright install --with-deps

# Check browser installation
npx playwright install-deps chromium

# Verify installation
node -e "import('playwright').then(({ chromium }) => chromium.launch().then(() => console.log('✅ Chromium working')))"
```

**Error:** `Page timeout exceeded`

**Solution:**
```javascript
// Increase timeout in test
test.setTimeout(60000); // 60 seconds

// Or in coordinator configuration
const coordinator = new TestCollaborationCoordinator({
  timeout: 30000,
  navigationTimeout: 15000
});

// Wait for specific conditions
await page.waitForLoadState('networkidle');
await page.waitForFunction(() => document.readyState === 'complete');
```

### Import/Module Errors

**Error:** `Cannot import enhanced-testing-debugging-agents.js`

**Solution:**
```bash
# Check file exists
ls -la lib/testing/enhanced-testing-debugging-agents.js

# Verify Node.js version (requires 18+)
node --version

# Check package.json type
grep '"type"' package.json

# Add type: "module" if missing
echo '{"type": "module"}' >> package.json
```

---

## Performance Problems

### Slow Test Execution

**Diagnostics:**
```javascript
// Add performance monitoring
class PerformanceMonitor {
  constructor() {
    this.timers = new Map();
  }
  
  start(label) {
    this.timers.set(label, Date.now());
  }
  
  end(label) {
    const startTime = this.timers.get(label);
    if (startTime) {
      const duration = Date.now() - startTime;
      console.log(`⏱️  ${label}: ${duration}ms`);
      this.timers.delete(label);
      return duration;
    }
  }
}

// Usage in tests
const monitor = new PerformanceMonitor();

monitor.start('Page Load');
await page.goto('http://localhost:3000/dashboard');
monitor.end('Page Load');

monitor.start('Element Search');
const element = await coordinator.testingAgent.findElement(page, strategies);
monitor.end('Element Search');
```

**Solutions:**

1. **Optimize Selector Strategies:**
   ```javascript
   // Order strategies by performance (fastest first)
   const optimizedStrategies = [
     { name: 'testId', selector: '[data-testid="element"]' },    // Fastest
     { name: 'id', selector: '#element-id' },                    // Fast
     { name: 'class', selector: '.element-class' },              // Medium
     { name: 'text', selector: 'button:has-text("Text")' },      // Slower
     { name: 'xpath', selector: '//button[contains(text())]' }   // Slowest
   ];
   ```

2. **Parallel Element Searches:**
   ```javascript
   // Search for multiple elements in parallel
   const findMultipleElements = async (page, elementMap) => {
     const promises = Object.entries(elementMap).map(async ([key, strategies]) => {
       const element = await coordinator.testingAgent.findElement(page, strategies);
       return [key, element];
     });
     
     const results = await Promise.all(promises);
     return Object.fromEntries(results);
   };
   
   // Usage
   const elements = await findMultipleElements(page, {
     submitButton: [{ name: 'testId', selector: '[data-testid="submit"]' }],
     cancelButton: [{ name: 'testId', selector: '[data-testid="cancel"]' }]
   });
   ```

3. **Browser Optimization:**
   ```javascript
   // Launch browser with performance optimizations
   const browser = await chromium.launch({
     headless: true,
     args: [
       '--no-sandbox',
       '--disable-setuid-sandbox',
       '--disable-dev-shm-usage',
       '--disable-background-timer-throttling',
       '--disable-backgrounding-occluded-windows',
       '--disable-renderer-backgrounding',
       '--disable-features=TranslateUI',
       '--disable-ipc-flooding-protection'
     ]
   });
   ```

### Memory Usage Issues

**Diagnostics:**
```javascript
// Monitor memory usage
const monitorMemory = () => {
  const used = process.memoryUsage();
  console.log('Memory Usage:');
  for (let key in used) {
    console.log(`  ${key}: ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
  }
};

// Call periodically during tests
setInterval(monitorMemory, 10000); // Every 10 seconds
```

**Solutions:**

1. **Cleanup Resources:**
   ```javascript
   // Proper cleanup in tests
   test.afterEach(async ({ page }) => {
     // Clear page resources
     await page.removeAllListeners();
     
     // Clear console/network logs
     consoleLogs.length = 0;
     networkLogs.length = 0;
     
     // Force garbage collection (if available)
     if (global.gc) {
       global.gc();
     }
   });
   ```

2. **Optimize Screenshot Capture:**
   ```javascript
   // Capture smaller screenshots
   const optimizedScreenshot = await page.screenshot({
     encoding: 'base64',
     quality: 60,        // Lower quality for smaller size
     fullPage: false,    // Viewport only
     type: 'jpeg'        // JPEG instead of PNG
   });
   ```

3. **Limit Concurrent Tests:**
   ```javascript
   // playwright.config.js
   export default defineConfig({
     workers: Math.min(2, os.cpus().length), // Limit workers
     use: {
       // Limit browser contexts
       launchOptions: {
         args: ['--memory-pressure-off']
       }
     }
   });
   ```

---

## Configuration Issues

### Environment Variables Not Loaded

**Problem:** Enhanced agents can't connect to Supabase

**Solution:**
```javascript
// Enhanced environment validation
import dotenv from 'dotenv';
import path from 'path';

// Load from multiple possible locations
const envPaths = [
  '.env',
  '.env.local',
  '.env.development',
  process.env.ENV_FILE_PATH
].filter(Boolean);

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`✅ Loaded environment from ${envPath}`);
    break;
  }
}

// Validate required variables
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}
```

### Database Schema Issues

**Problem:** Tables not found or missing columns

**Solution:**
```sql
-- Create missing tables
CREATE TABLE IF NOT EXISTS leo_sub_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_diagnoses (
  id SERIAL PRIMARY KEY,
  handoff_id TEXT NOT NULL,
  diagnosis JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Verify tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'leo_%';
```

### Playwright Configuration Conflicts

**Problem:** Tests fail with configuration errors

**Solution:**
```javascript
// playwright.config.js - Enhanced configuration
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 0, // Let enhanced agents handle retries
  
  use: {
    // Enhanced settings
    actionTimeout: 10000,
    navigationTimeout: 15000,
    
    // Capture artifacts for debugging
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    
    // Browser context settings
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    
    // Enhanced user agent
    userAgent: 'Enhanced-Testing-Agent/1.0'
  },
  
  // Enhanced reporter
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'junit-results.xml' }]
  ],
  
  projects: [
    {
      name: 'enhanced-chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
          ]
        }
      }
    }
  ]
});
```

---

## Integration Problems

### Jest Integration Issues

**Problem:** Enhanced agents not working with Jest

**Solution:**
```javascript
// jest.config.js - Enhanced Jest configuration
export default {
  preset: 'jest-playwright-preset',
  testEnvironment: 'node',
  
  // Enhanced module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^lib/(.*)$': '<rootDir>/lib/$1'
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/enhanced-setup.js'
  ],
  
  // Enhanced timeout
  testTimeout: 60000,
  
  // Transform settings for ES modules
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Coverage settings
  collectCoverage: false, // Enhanced agents provide their own metrics
  
  // Enhanced globals
  globals: {
    'process.env': {
      NODE_ENV: 'test'
    }
  }
};
```

### CI/CD Pipeline Issues

**Problem:** Enhanced agents fail in CI/CD environment

**Solution:**
```yaml
# Enhanced GitHub Actions workflow
name: Enhanced Testing CI

on: [push, pull_request]

jobs:
  enhanced-tests:
    runs-on: ubuntu-latest
    
    services:
      # If using local database
      postgres:
        image: postgres:13
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: |
        npm ci
        npx playwright install --with-deps
    
    - name: Setup environment
      run: |
        echo "SUPABASE_URL=${{ secrets.SUPABASE_URL }}" >> .env
        echo "SUPABASE_ANON_KEY=${{ secrets.SUPABASE_ANON_KEY }}" >> .env
        echo "NODE_ENV=test" >> .env
        echo "CI=true" >> .env
    
    - name: Start application
      run: |
        npm run build
        npm start &
        npx wait-on http://localhost:3000 --timeout 60000
    
    - name: Run enhanced tests
      run: |
        # Set memory limits for CI
        export NODE_OPTIONS="--max-old-space-size=4096"
        npx playwright test --reporter=html
      env:
        CI: true
        PWDEBUG: 0
    
    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: enhanced-test-results
        path: |
          playwright-report/
          test-results/
          scripts/fixes/
```

---

## Best Practices

### Debugging Best Practices

1. **Enable Verbose Logging:**
   ```javascript
   // Enable detailed logging
   process.env.DEBUG = 'enhanced-agents:*';
   
   // Custom logger
   class EnhancedLogger {
     static debug(message, data = {}) {
       if (process.env.NODE_ENV === 'development') {
         console.log(`🔍 [DEBUG] ${message}`, data);
       }
     }
     
     static info(message, data = {}) {
       console.log(`ℹ️  [INFO] ${message}`, data);
     }
     
     static error(message, error) {
       console.error(`❌ [ERROR] ${message}`, error);
     }
   }
   ```

2. **Test Isolation:**
   ```javascript
   // Ensure test isolation
   test.beforeEach(async ({ page }) => {
     // Clear state
     await page.goto('about:blank');
     await page.evaluate(() => {
       localStorage.clear();
       sessionStorage.clear();
       // Clear cookies
       document.cookie.split(";").forEach(cookie => {
         const eqPos = cookie.indexOf("=");
         const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
         document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
       });
     });
   });
   ```

3. **Resource Management:**
   ```javascript
   // Proper resource cleanup
   class ResourceManager {
     constructor() {
       this.resources = new Set();
     }
     
     register(resource) {
       this.resources.add(resource);
     }
     
     async cleanup() {
       for (const resource of this.resources) {
         if (resource.close) await resource.close();
         if (resource.dispose) await resource.dispose();
       }
       this.resources.clear();
     }
   }
   
   // Usage
   const resourceManager = new ResourceManager();
   
   test.afterEach(async () => {
     await resourceManager.cleanup();
   });
   ```

### Performance Best Practices

1. **Selector Optimization:**
   ```javascript
   // Best practices for selectors
   const bestPracticeSelectors = {
     // ✅ Good - Fast and stable
     good: [
       '[data-testid="element"]',
       '#unique-id',
       '[aria-label="Element"]'
     ],
     
     // ⚠️  OK - Use with caution
     ok: [
       '.element-class',
       'button:has-text("Submit")',
       '[name="fieldName"]'
     ],
     
     // ❌ Avoid - Slow and brittle
     avoid: [
       'div > div > button:nth-child(3)',
       'button[style*="color"]',
       ':has-text("Partial text match")'
     ]
   };
   ```

2. **Batch Operations:**
   ```javascript
   // Batch multiple actions
   const batchActions = async (page, actions) => {
     // Group actions by type
     const fillActions = actions.filter(a => a.type === 'fill');
     const clickActions = actions.filter(a => a.type === 'click');
     
     // Execute fills first (usually faster)
     for (const action of fillActions) {
       await page.fill(action.selector, action.value);
     }
     
     // Then clicks
     for (const action of clickActions) {
       await page.click(action.selector);
     }
   };
   ```

---

## Frequently Asked Questions

### Q: Do enhanced agents work with existing Playwright tests?

**A:** Yes, but with modifications. You need to:
1. Replace `page.locator()` with `coordinator.testingAgent.findElement()`
2. Initialize the coordinator before tests
3. Handle results from `runTestSuite()` instead of individual test assertions

**Example Migration:**
```javascript
// Before
await page.locator('[data-testid="submit"]').click();

// After
const submitButton = await coordinator.testingAgent.findElement(page, [
  { name: 'testId', selector: '[data-testid="submit"]' },
  { name: 'text', selector: 'button:has-text("Submit")' }
]);
await submitButton.click();
```

### Q: How do I disable auto-fix for critical tests?

**A:** Configure fix generators to require manual review:
```javascript
// Custom debugging agent with strict rules
class StrictDebuggingAgent extends EnhancedDebuggingSubAgent {
  async generateFix(issue) {
    const fix = await super.generateFix(issue);
    
    if (fix && this.isCriticalTest(issue.testName)) {
      fix.autoExecutable = false;
      fix.requiresReview = true;
      fix.reason = 'Critical test - manual review required';
    }
    
    return fix;
  }
  
  isCriticalTest(testName) {
    return testName.toLowerCase().includes('payment') ||
           testName.toLowerCase().includes('auth') ||
           testName.toLowerCase().includes('security');
  }
}
```

### Q: Can I use enhanced agents with headless browsers?

**A:** Yes, enhanced agents work with both headless and headed browsers:
```javascript
// Headless mode (default)
const browser = await chromium.launch({ headless: true });

// Headed mode for debugging
const browser = await chromium.launch({ 
  headless: false,
  slowMo: 100 // Slow down actions for debugging
});

// Enhanced debugging mode
const browser = await chromium.launch({ 
  headless: false,
  devtools: true // Open DevTools
});
```

### Q: How do I handle custom authentication in enhanced tests?

**A:** Create a custom authentication helper:
```javascript
class EnhancedAuthHelper {
  constructor(coordinator) {
    this.coordinator = coordinator;
  }
  
  async login(page, credentials) {
    const loginSteps = [
      {
        name: 'Navigate to Login',
        function: async () => {
          await page.goto('/login');
        }
      },
      {
        name: 'Fill Credentials',
        function: async () => {
          const usernameField = await this.coordinator.testingAgent.findElement(page, [
            { name: 'testId', selector: '[data-testid="username"]' },
            { name: 'name', selector: 'input[name="username"]' },
            { name: 'type', selector: 'input[type="email"]' }
          ]);
          await usernameField.fill(credentials.username);
          
          const passwordField = await this.coordinator.testingAgent.findElement(page, [
            { name: 'testId', selector: '[data-testid="password"]' },
            { name: 'name', selector: 'input[name="password"]' },
            { name: 'type', selector: 'input[type="password"]' }
          ]);
          await passwordField.fill(credentials.password);
        }
      },
      {
        name: 'Submit Login',
        function: async () => {
          const loginButton = await this.coordinator.testingAgent.findElement(page, [
            { name: 'testId', selector: '[data-testid="login-submit"]' },
            { name: 'text', selector: 'button:has-text("Login")' },
            { name: 'type', selector: 'button[type="submit"]' }
          ]);
          await loginButton.click();
          await page.waitForURL('/dashboard');
        }
      }
    ];
    
    const results = await this.coordinator.runTestSuite(page, loginSteps);
    
    if (results.handoff.metrics.failed > 0) {
      throw new Error('Authentication failed');
    }
  }
}
```

### Q: How do I handle tests that require specific data setup?

**A:** Use enhanced setup/teardown with the coordinator:
```javascript
class EnhancedDataSetup {
  constructor(coordinator) {
    this.coordinator = coordinator;
  }
  
  async setupTestData(page) {
    const setupSteps = [
      {
        name: 'Create Test User',
        function: async () => {
          const response = await page.request.post('/api/test/users', {
            data: { name: 'Test User', email: 'test@example.com' }
          });
          if (!response.ok()) throw new Error('User creation failed');
        }
      },
      {
        name: 'Seed Test Data',
        function: async () => {
          const response = await page.request.post('/api/test/seed', {
            data: { scenario: 'enhanced-testing' }
          });
          if (!response.ok()) throw new Error('Data seeding failed');
        }
      }
    ];
    
    const results = await this.coordinator.runTestSuite(page, setupSteps);
    
    if (results.handoff.metrics.failed > 0) {
      throw new Error('Test data setup failed');
    }
  }
  
  async cleanupTestData(page) {
    const cleanupSteps = [
      {
        name: 'Clean Test Data',
        function: async () => {
          const response = await page.request.delete('/api/test/cleanup');
          if (!response.ok()) throw new Error('Cleanup failed');
        }
      }
    ];
    
    await this.coordinator.runTestSuite(page, cleanupSteps);
  }
}

// Usage in tests
let dataSetup;

test.beforeAll(async ({ page }) => {
  const coordinator = new TestCollaborationCoordinator();
  await coordinator.initialize();
  
  dataSetup = new EnhancedDataSetup(coordinator);
  await dataSetup.setupTestData(page);
});

test.afterAll(async ({ page }) => {
  await dataSetup.cleanupTestData(page);
});
```

---

## Debug Utilities

### Enhanced Debug Console

```javascript
// debug-console.js
class EnhancedDebugConsole {
  constructor(coordinator) {
    this.coordinator = coordinator;
    this.history = [];
  }
  
  async inspectElement(page, selector) {
    console.log(`🔍 Inspecting element: ${selector}`);
    
    try {
      const element = await page.locator(selector);
      const count = await element.count();
      
      if (count === 0) {
        console.log('❌ Element not found');
        
        // Suggest alternatives using enhanced agent
        const suggestions = await this.coordinator.testingAgent.findElement(page, [
          { name: 'similar', selector: selector.replace(/"/g, "'") },
          { name: 'partial', selector: selector.split(' ')[0] }
        ]);
        
        if (suggestions) {
          console.log('💡 Found similar element');
        }
      } else {
        console.log(`✅ Found ${count} element(s)`);
        
        for (let i = 0; i < Math.min(count, 3); i++) {
          const el = element.nth(i);
          const text = await el.textContent();
          const visible = await el.isVisible();
          
          console.log(`   Element ${i}: visible=${visible}, text="${text?.substring(0, 50)}..."`);
        }
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  
  async debugTest(page, testName, testFunction) {
    console.log(`\n🎯 Debug Test: ${testName}`);
    console.log('─'.repeat(50));
    
    const startTime = Date.now();
    
    try {
      await testFunction();
      const duration = Date.now() - startTime;
      console.log(`✅ Test passed in ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ Test failed in ${duration}ms`);
      console.log(`Error: ${error.message}`);
      
      // Use enhanced debugging
      const diagnosis = await this.coordinator.debuggingAgent.diagnoseFailure({
        testName,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      
      console.log('\n🔍 Enhanced Diagnosis:');
      console.log(`   Category: ${diagnosis.category}`);
      console.log(`   Severity: ${diagnosis.severity}`);
      console.log(`   Root Cause: ${diagnosis.rootCause}`);
      console.log(`   Suggested Fix: ${diagnosis.suggestedFix}`);
    }
  }
  
  startInteractiveMode(page) {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('\n🎮 Enhanced Debug Console');
    console.log('Commands:');
    console.log('  inspect <selector> - Inspect element');
    console.log('  test <name> <function> - Run debug test');
    console.log('  exit - Exit debug mode');
    
    const prompt = () => {
      readline.question('debug> ', async (input) => {
        const [command, ...args] = input.trim().split(' ');
        
        switch (command) {
          case 'inspect':
            await this.inspectElement(page, args.join(' '));
            break;
          case 'exit':
            readline.close();
            return;
          default:
            console.log('Unknown command');
        }
        
        prompt();
      });
    };
    
    prompt();
  }
}

// Usage
const debugConsole = new EnhancedDebugConsole(coordinator);
await debugConsole.inspectElement(page, '[data-testid="submit-button"]');
```

### Test Recorder

```javascript
// test-recorder.js
class EnhancedTestRecorder {
  constructor() {
    this.actions = [];
    this.recording = false;
  }
  
  startRecording(page) {
    if (this.recording) return;
    
    this.recording = true;
    this.actions = [];
    
    console.log('🔴 Recording started');
    
    // Record clicks
    page.on('click', (element) => {
      this.actions.push({
        type: 'click',
        selector: this.getSelector(element),
        timestamp: Date.now()
      });
    });
    
    // Record input
    page.on('input', (element, value) => {
      this.actions.push({
        type: 'fill',
        selector: this.getSelector(element),
        value: value,
        timestamp: Date.now()
      });
    });
    
    // Record navigation
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        this.actions.push({
          type: 'goto',
          url: frame.url(),
          timestamp: Date.now()
        });
      }
    });
  }
  
  stopRecording() {
    this.recording = false;
    console.log('⏹️  Recording stopped');
    return this.actions;
  }
  
  generateTest(testName) {
    const testCode = `
test('${testName}', async ({ page }) => {
  const coordinator = new TestCollaborationCoordinator();
  await coordinator.initialize();
  
  const tests = [
    {
      name: '${testName}',
      function: async () => {
${this.actions.map(action => this.generateActionCode(action)).join('\n')}
      }
    }
  ];
  
  const results = await coordinator.runTestSuite(page, tests);
  expect(results.handoff.metrics.passed).toBe(1);
});
    `.trim();
    
    return testCode;
  }
  
  generateActionCode(action) {
    switch (action.type) {
      case 'goto':
        return `        await page.goto('${action.url}');`;
      case 'click':
        return `        const element = await coordinator.testingAgent.findElement(page, [
          { name: 'recorded', selector: '${action.selector}' }
        ]);
        await element.click();`;
      case 'fill':
        return `        const element = await coordinator.testingAgent.findElement(page, [
          { name: 'recorded', selector: '${action.selector}' }
        ]);
        await element.fill('${action.value}');`;
      default:
        return `        // Unknown action: ${action.type}`;
    }
  }
  
  getSelector(element) {
    // Generate multiple selector candidates
    const selectors = [];
    
    if (element.getAttribute('data-testid')) {
      selectors.push(`[data-testid="${element.getAttribute('data-testid')}"]`);
    }
    
    if (element.id) {
      selectors.push(`#${element.id}`);
    }
    
    if (element.className) {
      selectors.push(`.${element.className.split(' ')[0]}`);
    }
    
    return selectors[0] || element.tagName.toLowerCase();
  }
}
```

---

## Support Resources

### Getting Help

1. **Check Health Status:**
   ```bash
   node scripts/health-check.js
   ```

2. **Enable Debug Logging:**
   ```bash
   DEBUG=enhanced-agents:* npm test
   ```

3. **Generate Debug Report:**
   ```javascript
   // Generate comprehensive debug report
   const generateDebugReport = async (coordinator, results) => {
     const report = {
       timestamp: new Date().toISOString(),
       environment: process.env.NODE_ENV,
       nodeVersion: process.version,
       
       // Test results
       results: {
         total: results.handoff.metrics.totalTests,
         passed: results.handoff.metrics.passed,
         failed: results.handoff.metrics.failed,
         duration: results.handoff.metrics.duration
       },
       
       // Agent status
       agents: {
         testing: {
           initialized: !!coordinator.testingAgent.backstory,
           strategies: coordinator.testingAgent.selectorStrategies.length
         },
         debugging: {
           initialized: !!coordinator.debuggingAgent.backstory,
           generators: Object.keys(coordinator.debuggingAgent.fixGenerators).length
         }
       },
       
       // Issues and fixes
       issues: results.diagnosis.issues.length,
       fixes: results.diagnosis.fixScripts.length,
       recommendations: results.diagnosis.recommendations.length,
       
       // System info
       system: {
         platform: process.platform,
         memory: process.memoryUsage(),
         uptime: process.uptime()
       }
     };
     
     await fs.writeFile('debug-report.json', JSON.stringify(report, null, 2));
     console.log('📊 Debug report saved to debug-report.json');
   };
   ```

### Documentation Links

- **Main README**: `/docs/ENHANCED_TESTING_DEBUGGING_README.md`
- **API Reference**: `/docs/ENHANCED_TESTING_API_REFERENCE.md`
- **Integration Guide**: `/docs/ENHANCED_TESTING_INTEGRATION_GUIDE.md`
- **Collaboration Playbook**: `/docs/TESTING_DEBUGGING_COLLABORATION_PLAYBOOK.md`

### Community Resources

- **Issue Tracker**: Create detailed issue reports with debug information
- **Examples Repository**: Browse real-world implementation examples
- **Performance Benchmarks**: Compare your metrics with baselines

---

*Last Updated: 2025-09-04*  
*Version: 1.0.0*  
*Part of LEO Protocol v4.1.2 Enhanced Testing Framework*