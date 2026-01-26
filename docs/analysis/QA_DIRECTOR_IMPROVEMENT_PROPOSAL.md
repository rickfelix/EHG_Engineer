# QA Engineering Director v2.1 - Improvement Proposal


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, testing, e2e, unit

## Current Issues (from E2E Authentication Fix Retrospective)

### Problem 1: Execution Error When Running E2E Tests
**Symptom**: Script reports "E2E tests FAILED (execution error)" but manual `npm run test:e2e` passes all tests (5/5).

**Root Cause Hypotheses**:
1. Script may be using preview mode configuration (port 4173) instead of dev mode (port 5173)
2. Working directory may be incorrect when executing npm commands
3. Script may not wait for dev server to fully start before running tests
4. Environment variables may not be propagated correctly

**Evidence**: Manual run shows:
```
✅ Unit tests PASSED (175/175)
✅ E2E tests PASSED (5/5) manually
❌ E2E tests FAILED (execution error) via QA Director script
```

### Problem 2: No Pre-flight Check for Dev Server
**Impact**: Tests may start before server is ready, causing false failures.

**Solution**: Add health check endpoint polling before test execution.

### Problem 3: Build Mode Not Configurable
**Current**: Script may default to preview mode for E2E tests.

**Desired**: Allow specifying dev mode vs preview mode with clear defaults.

---

## Proposed Improvements

### Enhancement 1: Fix E2E Test Execution
**File**: `scripts/qa-engineering-director-enhanced.js`

**Changes Needed**:
1. Ensure working directory is set correctly before npm commands:
   ```javascript
   const targetApp = process.argv[3] || 'ehg';
   const appPath = targetApp === 'ehg' ? '/mnt/c/_EHG/EHG' : '/mnt/c/_EHG/EHG_Engineer';
   process.chdir(appPath); // Set working directory BEFORE test commands
   ```

2. Use dev mode by default for E2E tests:
   ```javascript
   // Check if dev server is running, start if not
   const devServerRunning = await checkPortInUse(5173);
   if (!devServerRunning) {
     console.log('   🚀 Starting dev server on port 5173...');
     // Start dev server in background
   }
   ```

3. Add explicit test file path:
   ```javascript
   // Instead of: npm run test:e2e
   // Use: npm run test:e2e -- tests/e2e/agent-admin-smoke.spec.ts --project=mock
   ```

4. Better error handling:
   ```javascript
   try {
     const result = execSync('npm run test:e2e -- tests/e2e/agent-admin-smoke.spec.ts --project=mock', {
       cwd: appPath,
       encoding: 'utf8',
       stdio: 'pipe', // Capture output instead of inherit
       timeout: 300000 // 5 minute timeout
     });
     console.log(result); // Show actual test output
   } catch (error) {
     console.error('E2E test execution error:', error.message);
     console.error('stdout:', error.stdout);
     console.error('stderr:', error.stderr);
   }
   ```

### Enhancement 2: Add Dev Server Health Check
**New Function**:
```javascript
async function waitForDevServer(port = 5173, maxWaitSeconds = 30) {
  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;

  console.log(`   ⏳ Waiting for dev server on port ${port}...`);

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(`http://localhost:${port}`);
      if (response.ok) {
        console.log(`   ✅ Dev server ready on port ${port}`);
        return true;
      }
    } catch (e) {
      // Server not ready yet, wait and retry
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
  }

  console.error(`   ❌ Dev server failed to start after ${maxWaitSeconds}s`);
  return false;
}
```

### Enhancement 3: Test Mode Configuration
**Add CLI option**:
```bash
# Dev mode (default)
node scripts/qa-engineering-director-enhanced.js SD-AGENT-ADMIN-002 ehg

# Preview mode (for production parity testing)
node scripts/qa-engineering-director-enhanced.js SD-AGENT-ADMIN-002 ehg --mode=preview
```

**Implementation**:
```javascript
const testMode = process.argv.includes('--mode=preview') ? 'preview' : 'dev';
const port = testMode === 'dev' ? 5173 : 4173;
console.log(`   🎯 Test Mode: ${testMode} (port ${port})`);
```

### Enhancement 4: Better Test Result Parsing
**Current**: Generic "FAIL" or "PASS"

**Proposed**: Parse test output for detailed results:
```javascript
function parsePlaywrightResults(output) {
  const passedMatch = output.match(/(\d+) passed/);
  const failedMatch = output.match(/(\d+) failed/);
  const skippedMatch = output.match(/(\d+) skipped/);

  return {
    passed: passedMatch ? parseInt(passedMatch[1]) : 0,
    failed: failedMatch ? parseInt(failedMatch[1]) : 0,
    skipped: skippedMatch ? parseInt(skippedMatch[1]) : 0,
    duration: extractDuration(output)
  };
}
```

### Enhancement 5: Evidence Collection Improvements
**Add**:
- Link to Playwright HTML report
- Screenshot URLs for test evidence
- Video recording URLs for failures
- Test execution logs

```javascript
const evidenceUrls = {
  html_report: `file://${appPath}/playwright-report/index.html`,
  screenshots: `file://${appPath}/tests/e2e/evidence/SD-${sdId}/`,
  videos: `file://${appPath}/test-results/`,
  execution_log: testOutput
};
```

---

## Testing the Improvements

### Validation Steps:
1. Run QA Director manually: `node scripts/qa-engineering-director-enhanced.js SD-AGENT-ADMIN-002 ehg`
2. Verify E2E tests execute correctly
3. Confirm results match manual test run (5/5 passing)
4. Check evidence collection (HTML report, screenshots)
5. Validate stored results in database

### Success Criteria:
- ✅ E2E tests execute without "execution error"
- ✅ Test results match manual run (5/5 passing)
- ✅ Dev server health check prevents premature test execution
- ✅ Evidence collection captures Playwright reports
- ✅ Final verdict: PASS with 95% confidence

---

## Continuous Improvement Path

### v2.1 (Immediate - This Release)
- Fix E2E test execution error
- Add dev server health check
- Support dev mode (default) and preview mode
- Better error reporting

### v2.5 (Future - 2-3 SDs)
- Automated test generation from user stories
- Smart selector strategies (retry with fallbacks)
- Parallel test execution

### v3.0 (Future - 5-10 SDs)
- AI-assisted test case creation from PRDs
- Self-healing tests (auto-fix selectors)
- Visual regression automation
- Performance metrics collection

---

## Implementation Priority

**HIGH (Do Now)**:
1. Fix working directory and command execution
2. Add dev mode default configuration
3. Better error output capture

**MEDIUM (Next SD)**:
4. Dev server health check
5. Detailed test result parsing
6. Evidence collection improvements

**LOW (Future)**:
7. Preview mode support
8. Parallel execution
9. Visual regression

---

## Files to Modify

1. `scripts/qa-engineering-director-enhanced.js` - Main script fixes
2. `CLAUDE.md` - Add E2E testing guidance section
3. `playwright.config.ts` (template for new SDs) - Default to dev mode
4. `scripts/templates/playwright.config.template.ts` - New file for consistent config

---

## Estimated Effort

- Script fixes: 30-45 minutes
- CLAUDE.md updates: 15-20 minutes
- Testing validation: 10-15 minutes
- Documentation: 10 minutes

**Total**: ~1.5 hours

---

## Benefits

**Immediate**:
- SD-AGENT-ADMIN-002 can be validated automatically
- Future SDs won't encounter same E2E issues
- Clear guidance prevents repeated problems

**Long-term**:
- Testing sub-agent becomes more reliable
- Faster SD validation (saves 1-2 hours per SD)
- Better evidence for LEAD approval decisions
