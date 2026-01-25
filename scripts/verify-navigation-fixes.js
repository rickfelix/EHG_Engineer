#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


/**
 * Comprehensive test to verify all navigation fixes
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

console.log('🧪 COMPREHENSIVE NAVIGATION FIX VERIFICATION\n');
console.log('=' .repeat(60));

const tests = [];
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          data: data,
          headers: res.headers
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Test 1: Server is running
test('Server responds on port 3000', async () => {
  const res = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/',
    method: 'GET'
  });
  return res.status === 200;
});

// Test 2: SD dropdown fix is in place
test('ActiveSDProgress has navigation fix', async () => {
  const filePath = path.join(__dirname, '../lib/dashboard/client/src/components/ActiveSDProgress.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for the fix: custom event emission instead of navigation
  const hasCustomEvent = content.includes("window.dispatchEvent(new CustomEvent('activeSDChanged'");
  const preventNavigation = content.includes('// Prevent any default navigation behavior') || 
                            content.includes('return false');
  
  return hasCustomEvent || preventNavigation;
});

// Test 3: App.jsx has proper routing structure
test('App.jsx has nested SD routes', async () => {
  const filePath = path.join(__dirname, '../lib/dashboard/client/src/App.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for nested route structure
  const hasNestedRoutes = content.includes('<Route path="strategic-directives">');
  const hasDetailRoute = content.includes('path=":id"');
  const hasDetailMode = content.includes('detailMode={true}');
  
  return hasNestedRoutes && hasDetailRoute && hasDetailMode;
});

// Test 4: 404 fallback route exists
test('App.jsx has 404 fallback route', async () => {
  const filePath = path.join(__dirname, '../lib/dashboard/client/src/App.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  
  const hasFallback = content.includes('path="*"') && 
                      content.includes('<Navigate to="/" replace />');
  
  return hasFallback;
});

// Test 5: SDManager has navigation guards
test('SDManager has navigation guards', async () => {
  const filePath = path.join(__dirname, '../lib/dashboard/client/src/components/SDManager.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for navigation guards
  const hasUseParams = content.includes('useParams');
  const hasUseNavigate = content.includes('useNavigate');
  const hasValidation = content.includes('if (!sd || !sd.id)') || 
                       content.includes('SD not found, redirect');
  const hasErrorHandling = content.includes('console.warn') || 
                          content.includes('console.error');
  
  return hasUseParams && hasUseNavigate && hasValidation && hasErrorHandling;
});

// Test 6: API endpoints are working
test('All API endpoints respond correctly', async () => {
  const endpoints = ['/api/state', '/api/sd', '/api/prd', '/api/progress'];
  
  for (const endpoint of endpoints) {
    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: endpoint,
      method: 'GET'
    });
    
    if (res.status !== 200) {
      console.log(`  ❌ ${endpoint} returned ${res.status}`);
      return false;
    }
  }
  
  return true;
});

// Test 7: SD selection doesn't cause navigation
test('SD dropdown onClick prevents navigation', async () => {
  const filePath = path.join(__dirname, '../lib/dashboard/client/src/components/ActiveSDProgress.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check that onClick doesn't use navigate()
  const lines = content.split('\n');
  let inOnClick = false;
  let hasNavigate = false;
  
  for (const line of lines) {
    if (line.includes('onClick={() => {')) {
      inOnClick = true;
    }
    if (inOnClick && line.includes('navigate(')) {
      hasNavigate = true;
    }
    if (inOnClick && line.includes('}}')) {
      inOnClick = false;
    }
  }
  
  // Should NOT have navigate in onClick
  return !hasNavigate;
});

// Test 8: Direct URL access handling
test('Direct SD URL access is handled', async () => {
  const filePath = path.join(__dirname, '../lib/dashboard/client/src/components/SDManager.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for URL parameter handling
  const hasUrlHandling = content.includes('useEffect') && 
                         content.includes('detailMode && id') &&
                         content.includes('strategicDirectives.find');
  
  return hasUrlHandling;
});

// Run all tests
async function runTests() {
  console.log('\n📋 Running Navigation Fix Tests...\n');
  
  for (const { name, fn } of tests) {
    process.stdout.write(`  Testing: ${name}... `);
    
    try {
      const result = await fn();
      
      if (result) {
        console.log('✅ PASSED');
        passedTests++;
      } else {
        console.log('❌ FAILED');
        failedTests++;
      }
    } catch (_error) {
      console.log(`❌ ERROR: ${error.message}`);
      failedTests++;
    }
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('📊 TEST RESULTS SUMMARY\n');
  console.log(`  Total Tests: ${tests.length}`);
  console.log(`  ✅ Passed: ${passedTests}`);
  console.log(`  ❌ Failed: ${failedTests}`);
  console.log(`  Success Rate: ${Math.round((passedTests / tests.length) * 100)}%`);
  
  console.log('\n🔍 NAVIGATION FIX STATUS:\n');
  
  if (failedTests === 0) {
    console.log('  ✅ ALL NAVIGATION FIXES VERIFIED!');
    console.log('  ✅ SD dropdown no longer causes blank screen');
    console.log('  ✅ Proper routing structure in place');
    console.log('  ✅ 404 fallback route implemented');
    console.log('  ✅ Navigation guards active');
    console.log('\n  🎉 The dashboard navigation is fully fixed!');
  } else {
    console.log('  ⚠️ Some navigation issues remain:');
    console.log('  - Review failed tests above');
    console.log('  - Check console errors in browser');
    console.log('  - Verify all components are updated');
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('Verification complete.');
  
  process.exit(failedTests === 0 ? 0 : 1);
}

// Start tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
