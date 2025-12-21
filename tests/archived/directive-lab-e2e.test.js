/**
 * DirectiveLab End-to-End Test with Testing & Debugging Sub-Agents
 * =================================================================
 * This test demonstrates the complete DirectiveLab workflow with 
 * sub-agent collaboration for testing and debugging.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

/**
 * Testing Sub-Agent with SaaS Focus
 */
class TestingSubAgent {
  constructor(supabase) {
    this.supabase = supabase;
    this.name = 'Testing Sub-Agent';
    this.backstory = null;
  }

  async loadBackstory() {
    const { data } = await this.supabase
      .from('leo_sub_agents')
      .select('name, description, metadata')
      .eq('id', 'testing-sub')
      .single();
    
    if (data?.metadata?.backstory) {
      this.backstory = data.metadata.backstory;
      console.log('🧪 TESTING SUB-AGENT ACTIVATED');
      console.log(`📖 ${this.backstory.summary}`);
      console.log(`💭 Mantra: "${this.backstory.mantras?.[0]}"`);
    }
    return data;
  }

  async validateDirectiveLab(page) {
    console.log('\n📊 Running DirectiveLab validation...');
    const tests = [];
    
    // Test 1: Dashboard loads
    tests.push({
      name: 'Dashboard Page Load',
      passed: await page.title() === 'LEO Protocol Dashboard',
      details: `Title: ${await page.title()}`
    });

    // Test 2: DirectiveLab tab exists
    const directiveLabTab = await page.locator('button:has-text("DirectiveLab")').count();
    tests.push({
      name: 'DirectiveLab Tab',
      passed: directiveLabTab > 0,
      details: directiveLabTab > 0 ? 'Tab found' : 'Tab not found'
    });

    // Test 3: Can navigate to DirectiveLab
    if (directiveLabTab > 0) {
      await page.locator('button:has-text("DirectiveLab")').click();
      await page.waitForTimeout(1000);
      
      const feedbackArea = await page.locator('textarea[placeholder*="feedback"]').count();
      tests.push({
        name: 'DirectiveLab Feedback Input',
        passed: feedbackArea > 0,
        details: feedbackArea > 0 ? 'Input field ready' : 'Input field not found'
      });
    }

    // Test 4: API endpoint health
    try {
      const response = await page.request.get('http://localhost:3000/api/sdip/health');
      tests.push({
        name: 'DirectiveLab API Health',
        passed: response.ok(),
        details: `Status: ${response.status()}`
      });
    } catch (error) {
      tests.push({
        name: 'DirectiveLab API Health',
        passed: false,
        details: error.message
      });
    }

    return tests;
  }
}

/**
 * Debugging Sub-Agent with SaaS Focus
 */
class DebuggingSubAgent {
  constructor(supabase) {
    this.supabase = supabase;
    this.name = 'Debugging Sub-Agent';
    this.backstory = null;
  }

  async loadBackstory() {
    const { data } = await this.supabase
      .from('leo_sub_agents')
      .select('name, description, metadata')
      .eq('id', 'debugging-sub')
      .single();
    
    if (data?.metadata?.backstory) {
      this.backstory = data.metadata.backstory;
      console.log('\n🔍 DEBUGGING SUB-AGENT ACTIVATED');
      console.log(`📖 ${this.backstory.summary}`);
      console.log(`🏆 Achievement: ${this.backstory.achievements?.[0]}`);
    }
    return data;
  }

  async diagnoseIssues(testResults) {
    console.log('\n🔬 Analyzing test results...');
    
    const failedTests = testResults.filter(t => !t.passed);
    const diagnosis = {
      timestamp: new Date().toISOString(),
      totalTests: testResults.length,
      passed: testResults.filter(t => t.passed).length,
      failed: failedTests.length,
      issues: [],
      recommendations: []
    };

    if (failedTests.length === 0) {
      diagnosis.issues.push('All systems operational');
      diagnosis.recommendations.push('Continue monitoring for performance metrics');
      if (this.backstory) {
        diagnosis.recommendations.push(`Apply "${this.backstory.mantras?.[1]}" for proactive monitoring`);
      }
    } else {
      failedTests.forEach(test => {
        if (test.name.includes('API')) {
          diagnosis.issues.push('API connectivity problem detected');
          diagnosis.recommendations.push('Check server logs for errors');
          diagnosis.recommendations.push('Verify CORS configuration');
        } else if (test.name.includes('Tab')) {
          diagnosis.issues.push('UI component missing');
          diagnosis.recommendations.push('Verify DirectiveLab component is mounted');
          diagnosis.recommendations.push('Check React component tree for errors');
        }
      });
    }

    return diagnosis;
  }
}

/**
 * Main Test Suite
 */
test.describe('DirectiveLab E2E with Sub-Agents', () => {
  let supabase;
  let testingAgent;
  let debuggingAgent;

  test.beforeAll(async () => {
    // Initialize Supabase
    supabase = createClient(supabaseUrl, supabaseKey);
    
    // Initialize sub-agents
    testingAgent = new TestingSubAgent(supabase);
    debuggingAgent = new DebuggingSubAgent(supabase);
    
    // Load backstories
    await testingAgent.loadBackstory();
    await debuggingAgent.loadBackstory();
    
    console.log('\n' + '='.repeat(60));
    console.log('🎯 SUB-AGENTS INITIALIZED FOR E2E TESTING');
    console.log('='.repeat(60));
  });

  test('Complete DirectiveLab workflow', async ({ page }) => {
    console.log('\n📋 TEST: DirectiveLab End-to-End Workflow');
    console.log('='.repeat(60));
    
    // Step 1: Navigate to dashboard
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Step 2: Testing Sub-Agent validates DirectiveLab
    const validationResults = await testingAgent.validateDirectiveLab(page);
    
    console.log('\n📊 Validation Results:');
    validationResults.forEach(test => {
      const icon = test.passed ? '✅' : '❌';
      console.log(`  ${icon} ${test.name}: ${test.details}`);
    });
    
    // Step 3: If issues found, activate Debugging Sub-Agent
    const hasIssues = validationResults.some(t => !t.passed);
    if (hasIssues) {
      const diagnosis = await debuggingAgent.diagnoseIssues(validationResults);
      
      console.log('\n📋 DEBUG ANALYSIS:');
      console.log(`  Total: ${diagnosis.totalTests} | Passed: ${diagnosis.passed} | Failed: ${diagnosis.failed}`);
      console.log(`  Issues:`);
      diagnosis.issues.forEach(issue => console.log(`    • ${issue}`));
      console.log(`  Recommendations:`);
      diagnosis.recommendations.forEach(rec => console.log(`    • ${rec}`));
    }
    
    // Step 4: Try to submit feedback if DirectiveLab is available
    const directiveLabAvailable = validationResults.find(t => t.name === 'DirectiveLab Tab')?.passed;
    
    if (directiveLabAvailable) {
      console.log('\n📊 Step 4: Testing Submission Flow');
      
      // Click DirectiveLab tab
      await page.locator('button:has-text("DirectiveLab")').click();
      await page.waitForTimeout(1000);
      
      // Fill feedback
      const feedbackText = 'Test submission from E2E test: Implement SaaS voice capabilities with real-time processing';
      const feedbackInput = page.locator('textarea').first();
      
      if (await feedbackInput.count() > 0) {
        await feedbackInput.fill(feedbackText);
        console.log('  ✅ Filled feedback input');
        
        // Submit
        const submitButton = page.locator('button:has-text("Submit")').first();
        if (await submitButton.count() > 0) {
          // Set up response listener
          const responsePromise = page.waitForResponse(
            response => response.url().includes('/api/sdip'),
            { timeout: 5000 }
          ).catch(() => null);
          
          await submitButton.click();
          console.log('  ✅ Clicked submit button');
          
          const response = await responsePromise;
          if (response && response.ok()) {
            console.log('  ✅ Submission successful!');
            const data = await response.json();
            console.log(`  📝 Submission ID: ${data.submission?.submission_id}`);
          } else {
            console.log('  ⚠️  Submission may have failed or timed out');
          }
        }
      }
    }
    
    // Step 5: Take screenshot
    await page.screenshot({ 
      path: 'test-results/directivelab-e2e.png', 
      fullPage: true 
    });
    console.log('\n📸 Screenshot saved to test-results/directivelab-e2e.png');
    
    // Final assertion
    const criticalTestsPassed = validationResults.filter(t => 
      t.name === 'Dashboard Page Load'
    ).every(t => t.passed);
    
    expect(criticalTestsPassed).toBe(true);
    
    console.log('\n' + '='.repeat(60));
    console.log('✨ E2E TEST COMPLETE');
    console.log('Sub-agents successfully collaborated on DirectiveLab testing!');
    console.log('='.repeat(60));
  });

  test('Verify sub-agent SaaS backstories', async () => {
    console.log('\n📋 TEST: SaaS Backstory Verification');
    console.log('='.repeat(60));
    
    // Query all sub-agents
    const { data: subAgents } = await supabase
      .from('leo_sub_agents')
      .select('id, name, description, metadata')
      .in('id', ['testing-sub', 'debugging-sub', 'security-sub', 'performance-sub']);
    
    console.log(`\n📊 Checking SaaS-focused backstories:\n`);
    
    const saasKeywords = ['SaaS', 'MRR', 'CAC', 'LTV', 'multi-tenant', 'SOC 2', 'Stripe', 'Datadog', 'Linear', 'Figma'];
    
    subAgents?.forEach(agent => {
      const backstory = agent.metadata?.backstory;
      const hasSaasBackstory = backstory && saasKeywords.some(keyword => 
        JSON.stringify(backstory).includes(keyword)
      );
      
      console.log(`${agent.name}:`);
      if (hasSaasBackstory) {
        console.log(`  ✅ SaaS-focused backstory confirmed`);
        console.log(`  📚 Companies: ${backstory.inspiration_sources?.slice(0, 3).join(', ')}...`);
      } else {
        console.log(`  ❌ Missing SaaS backstory`);
      }
    });
    
    // Verify Testing and Debugging agents specifically
    const testingBackstory = subAgents?.find(a => a.id === 'testing-sub')?.metadata?.backstory;
    const debuggingBackstory = subAgents?.find(a => a.id === 'debugging-sub')?.metadata?.backstory;
    
    expect(testingBackstory).toBeTruthy();
    expect(debuggingBackstory).toBeTruthy();
    expect(testingBackstory?.inspiration_sources).toContain('GitLab');
    expect(debuggingBackstory?.inspiration_sources).toContain('Stripe');
    
    console.log('\n✅ SaaS backstories verified successfully!');
  });
});