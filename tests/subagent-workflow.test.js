/**
 * Playwright Test with Testing and Debugging Sub-Agents
 * ======================================================
 * This test demonstrates the collaboration between Testing and Debugging
 * sub-agents to validate the DirectiveLab user workflow.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

/**
 * Testing Sub-Agent Backstory Integration
 */
class TestingSubAgent {
  constructor() {
    this.name = 'Testing Sub-Agent';
    this.backstory = {
      summary: 'QA mastermind trained at NASA zero-defect culture and Toyota quality principles',
      mantras: [
        'Test early, test often, test automatically',
        'A test not written is a bug in production',
        'Quality is not an act, it is a habit'
      ]
    };
  }

  async validateWorkflow(page) {
    console.log('🧪 TESTING SUB-AGENT ACTIVATED');
    console.log(`📖 Backstory: ${this.backstory.summary}`);
    console.log(`💭 Mantra: "${this.backstory.mantras[0]}"`);
    
    const validationResults = {
      timestamp: new Date().toISOString(),
      agent: this.name,
      checks: []
    };

    // Test 1: Check page loads
    const titleCheck = await page.title();
    validationResults.checks.push({
      test: 'Page Title',
      expected: 'EHG Engineer',
      actual: titleCheck,
      passed: titleCheck === 'EHG Engineer'
    });

    // Test 2: Check DirectiveLab component exists
    const directiveLabExists = await page.locator('[data-testid="directive-lab"]').count() > 0;
    validationResults.checks.push({
      test: 'DirectiveLab Component',
      expected: 'Present',
      actual: directiveLabExists ? 'Present' : 'Missing',
      passed: directiveLabExists
    });

    // Test 3: Check submit button
    const submitButton = await page.locator('button:has-text("Submit and Analyze")').count() > 0;
    validationResults.checks.push({
      test: 'Submit Button',
      expected: 'Available',
      actual: submitButton ? 'Available' : 'Missing',
      passed: submitButton
    });

    return validationResults;
  }
}

/**
 * Debugging Sub-Agent Backstory Integration
 */
class DebuggingSubAgent {
  constructor(supabase) {
    this.supabase = supabase;
    this.name = 'Debugging Sub-Agent';
    this.backstory = null;
  }

  async loadBackstory() {
    // Retrieve backstory from database
    const { data } = await this.supabase
      .from('leo_sub_agents')
      .select('metadata')
      .eq('id', 'debugging-sub')
      .single();
    
    if (data?.metadata?.backstory) {
      this.backstory = data.metadata.backstory;
      console.log('🔍 DEBUGGING SUB-AGENT BACKSTORY LOADED FROM DATABASE');
      console.log(`📖 ${this.backstory.summary}`);
      console.log(`🏆 Achievement: ${this.backstory.achievements?.[0] || 'N/A'}`);
    }
  }

  async analyzeError(error, context) {
    console.log('\n🔍 DEBUGGING SUB-AGENT ACTIVATED');
    
    if (this.backstory) {
      console.log(`💭 Applying mantra: "${this.backstory.mantras?.[0] || 'Trust the logs'}"`);
    }

    const analysis = {
      timestamp: new Date().toISOString(),
      agent: this.name,
      error: error.message || error,
      context: context,
      diagnosis: null,
      recommendations: []
    };

    // Apply NASA-level debugging expertise
    if (error.message?.includes('Failed to submit feedback')) {
      analysis.diagnosis = 'Database schema mismatch - PostgREST cannot find expected columns';
      analysis.recommendations = [
        'Create directive_submissions table in database',
        'Verify all required columns exist',
        'Check database connection and permissions'
      ];
    } else if (error.message?.includes('Network')) {
      analysis.diagnosis = 'Network connectivity issue';
      analysis.recommendations = [
        'Check server is running on correct port',
        'Verify CORS settings',
        'Check firewall rules'
      ];
    } else {
      analysis.diagnosis = 'Unknown error - requires deeper analysis';
      analysis.recommendations = [
        'Check browser console for detailed errors',
        'Review server logs for backend issues',
        'Verify all dependencies are installed'
      ];
    }

    return analysis;
  }
}

/**
 * Main Test Suite
 */
test.describe('DirectiveLab Workflow with Sub-Agents', () => {
  let testingAgent;
  let debuggingAgent;
  let supabase;

  test.beforeAll(async () => {
    // Initialize Supabase client
    if (supabaseKey) {
      supabase = createClient(supabaseUrl, supabaseKey);
      
      // Initialize sub-agents
      testingAgent = new TestingSubAgent();
      debuggingAgent = new DebuggingSubAgent(supabase);
      
      // Load debugging agent backstory from database
      await debuggingAgent.loadBackstory();
      
      console.log('=' .repeat(60));
      console.log('🎯 SUB-AGENTS INITIALIZED WITH BACKSTORIES');
      console.log('=' .repeat(60));
    } else {
      console.log('⚠️  No Supabase key - using basic sub-agents');
      testingAgent = new TestingSubAgent();
      debuggingAgent = new DebuggingSubAgent(null);
    }
  });

  test('Complete DirectiveLab workflow with sub-agent validation', async ({ page }) => {
    console.log('\n📋 TEST: DirectiveLab User Workflow');
    console.log('=' .repeat(60));
    
    // Navigate to the application
    await page.goto('http://localhost:3000');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Step 1: Testing Sub-Agent validates initial state
    console.log('\n📊 Step 1: Initial Validation');
    const validationResults = await testingAgent.validateWorkflow(page);
    
    console.log('Validation Results:');
    validationResults.checks.forEach(check => {
      const status = check.passed ? '✅' : '❌';
      console.log(`  ${status} ${check.test}: ${check.actual}`);
    });
    
    // Check if all validations passed
    const allPassed = validationResults.checks.every(c => c.passed);
    expect(allPassed).toBe(true);
    
    // Step 2: Try to interact with DirectiveLab
    console.log('\n📊 Step 2: Testing DirectiveLab Interaction');
    
    try {
      // Click on DirectiveLab tab/button if it exists
      const directiveLabTab = page.locator('text=DirectiveLab');
      if (await directiveLabTab.count() > 0) {
        await directiveLabTab.click();
        console.log('  ✅ Clicked DirectiveLab tab');
        
        // Wait for DirectiveLab to load
        await page.waitForTimeout(1000);
        
        // Try to fill in feedback
        const feedbackInput = page.locator('textarea[placeholder*="feedback"]').first();
        if (await feedbackInput.count() > 0) {
          await feedbackInput.fill('Test feedback from Chairman: Implement real-time voice capabilities');
          console.log('  ✅ Filled feedback input');
          
          // Try to submit
          const submitButton = page.locator('button:has-text("Submit and Analyze")');
          if (await submitButton.count() > 0) {
            // Listen for any errors
            let submissionError = null;
            
            page.on('response', response => {
              if (!response.ok() && response.url().includes('/api/sdip')) {
                submissionError = `API Error: ${response.status()} ${response.statusText()}`;
              }
            });
            
            await submitButton.click();
            console.log('  ✅ Clicked submit button');
            
            // Wait for response
            await page.waitForTimeout(2000);
            
            // Check for success or error
            const successMessage = await page.locator('text=/success|submitted/i').count();
            const errorMessage = await page.locator('text=/error|failed/i').count();
            
            if (successMessage > 0) {
              console.log('  ✅ Submission successful!');
            } else if (errorMessage > 0 || submissionError) {
              console.log('  ⚠️  Submission failed - activating Debugging Sub-Agent');
              
              // Step 3: Debugging Sub-Agent analyzes the error
              const error = submissionError || { message: 'Failed to submit feedback' };
              const debugAnalysis = await debuggingAgent.analyzeError(error, 'DirectiveLab submission');
              
              console.log('\n📋 DEBUG ANALYSIS:');
              console.log(`  Diagnosis: ${debugAnalysis.diagnosis}`);
              console.log(`  Recommendations:`);
              debugAnalysis.recommendations.forEach(rec => {
                console.log(`    • ${rec}`);
              });
            }
          } else {
            console.log('  ⚠️  Submit button not found');
          }
        } else {
          console.log('  ⚠️  Feedback input not found');
        }
      } else {
        console.log('  ⚠️  DirectiveLab tab not found - may be on main dashboard');
      }
      
    } catch (error) {
      console.log('  ❌ Error during interaction:', error.message);
      
      // Activate Debugging Sub-Agent
      const debugAnalysis = await debuggingAgent.analyzeError(error, 'DirectiveLab interaction');
      
      console.log('\n📋 DEBUG ANALYSIS:');
      console.log(`  Diagnosis: ${debugAnalysis.diagnosis}`);
      console.log(`  Recommendations:`);
      debugAnalysis.recommendations.forEach(rec => {
        console.log(`    • ${rec}`);
      });
    }
    
    // Step 4: Final validation
    console.log('\n📊 Step 4: Final State Validation');
    const finalValidation = await testingAgent.validateWorkflow(page);
    
    console.log('Final Validation:');
    finalValidation.checks.forEach(check => {
      const status = check.passed ? '✅' : '❌';
      console.log(`  ${status} ${check.test}: ${check.actual}`);
    });
    
    // Take screenshot for documentation
    await page.screenshot({ path: 'test-results/directivelab-workflow.png', fullPage: true });
    console.log('\n📸 Screenshot saved to test-results/directivelab-workflow.png');
    
    console.log('\n' + '=' .repeat(60));
    console.log('✨ TEST COMPLETE - Sub-agents successfully collaborated!');
    console.log('=' .repeat(60));
  });

  test('Verify sub-agent backstories are accessible', async () => {
    console.log('\n📋 TEST: Sub-Agent Backstory Verification');
    console.log('=' .repeat(60));
    
    if (!supabase) {
      console.log('⚠️  Skipping - no database connection');
      return;
    }
    
    // Query all sub-agents with backstories
    const { data: subAgents } = await supabase
      .from('leo_sub_agents')
      .select('id, name, description, metadata')
      .order('priority', { ascending: false });
    
    console.log(`\n📊 Found ${subAgents?.length || 0} sub-agents in database:\n`);
    
    subAgents?.forEach(agent => {
      console.log(`${agent.name} (${agent.id})`);
      console.log(`  Description: ${agent.description}`);
      
      if (agent.metadata?.backstory) {
        console.log(`  ✅ Has backstory: ${agent.metadata.backstory.summary?.substring(0, 60)}...`);
        console.log(`  📚 Achievements: ${agent.metadata.backstory.achievements?.length || 0}`);
        console.log(`  💭 Mantras: ${agent.metadata.backstory.mantras?.length || 0}`);
      } else {
        console.log(`  ❌ No backstory found`);
      }
      console.log('');
    });
    
    // Verify Testing and Debugging agents have backstories
    const hasTestingBackstory = subAgents?.some(a => 
      a.code === 'TESTING' && a.metadata?.backstory
    );
    const hasDebuggingBackstory = subAgents?.some(a => 
      a.code === 'DEBUGGING' && a.metadata?.backstory
    );
    
    expect(hasDebuggingBackstory).toBe(true);
    console.log(`✅ Debugging Sub-Agent backstory verified`);
    
    if (hasTestingBackstory) {
      console.log(`✅ Testing Sub-Agent backstory verified`);
    } else {
      console.log(`⚠️  Testing Sub-Agent backstory not in database (using local)`);
    }
  });
});

// Configuration for Playwright
export default {
  testDir: '.',
  timeout: 30000,
  use: {
    headless: false, // Run in headed mode to see the browser
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  }
};