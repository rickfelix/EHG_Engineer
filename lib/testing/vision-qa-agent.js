#!/usr/bin/env node

/**
 * Vision-Based QA Agent for EHG_Engineer
 * LEO Protocol v3.1.5 - Autonomous Testing with Multimodal LLMs
 * 
 * Implements Observe → Think → Act loop for intelligent UI testing
 */

const playwright = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const MultimodalClient = require('../ai/multimodal-client');
const PlaywrightBridge = require('./playwright-bridge');
const VisionAnalyzer = require('./vision-analyzer');
const TestReporter = require('./test-reporter');
require('dotenv').config();

class VisionQAAgent {
  constructor(config = {}) {
    this.config = {
      maxIterations: config.maxIterations || 50,
      screenshotInterval: config.screenshotInterval || 'smart', // 'always', 'smart', 'error'
      costLimit: config.costLimit || 5.00, // USD
      confidenceThreshold: config.confidenceThreshold || 0.85,
      retryAttempts: config.retryAttempts || 3,
      consensusRuns: config.consensusRuns || 3,
      temperature: config.temperature || 0, // For determinism
      headless: config.headless !== false,
      ...config
    };

    // Auto-select model if not specified
    if (!this.config.model) {
      this.config.model = this.autoSelectModel(this.config);
      console.log(`🤖 Auto-selected model: ${this.config.model}`);
    }

    // Initialize components
    this.aiClient = new MultimodalClient(this.config);
    this.bridge = new PlaywrightBridge();
    this.analyzer = new VisionAnalyzer(this.config);
    this.reporter = new TestReporter();
    
    // Database connection
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Test state
    this.state = {
      currentApp: null,
      browser: null,
      page: null,
      context: null,
      iterations: 0,
      totalCost: 0,
      actions: [],
      observations: [],
      decisions: [],
      bugs: [],
      goalAchieved: false
    };
  }

  /**
   * Main test execution for an application
   */
  async testApplication(appId, testGoal, options = {}) {
    console.log(`
╔══════════════════════════════════════════════╗
║         Vision-Based QA Testing               ║
║           LEO Protocol v3.1.5                 ║
╚══════════════════════════════════════════════╝

Application: ${appId}
Test Goal: ${testGoal}
Mode: ${this.config.screenshotInterval}
Cost Limit: $${this.config.costLimit}
    `);

    try {
      // Initialize test session
      await this.initializeTestSession(appId, testGoal);
      
      // Load application configuration
      const appConfig = await this.loadAppConfig(appId);
      
      // Launch browser and navigate
      await this.launchBrowser();
      await this.navigateToApp(appConfig);
      
      // Main Observe-Think-Act loop
      while (this.shouldContinue()) {
        this.state.iterations++;
        
        // Observe current state
        const observation = await this.observe();
        
        // Think about next action
        const decision = await this.think(observation, testGoal);
        
        // Act on decision
        const result = await this.act(decision);
        
        // Check for goal achievement or bugs
        await this.evaluateProgress(result, testGoal);
        
        // Cost management
        if (this.state.totalCost >= this.config.costLimit) {
          console.warn(`⚠️ Cost limit reached: $${this.state.totalCost}`);
          break;
        }
      }
      
      // Generate test report
      const report = await this.generateReport();
      
      // Store results in database
      await this.storeResults(appId, testGoal, report);
      
      return report;
      
    } catch (error) {
      console.error('❌ Test execution failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Observe: Capture current state
   */
  async observe() {
    const startTime = Date.now();
    
    try {
      // Take screenshot
      const screenshot = await this.page.screenshot({
        fullPage: false, // Just viewport for efficiency
        type: 'png'
      });
      
      // Get page metadata
      const metadata = {
        url: this.page.url(),
        title: await this.page.title(),
        timestamp: new Date().toISOString(),
        iteration: this.state.iterations
      };
      
      // Analyze accessibility tree if needed
      const accessibility = await this.analyzer.getAccessibilitySnapshot(this.page);
      
      // Store observation
      const observation = {
        screenshot,
        metadata,
        accessibility,
        duration: Date.now() - startTime
      };
      
      this.state.observations.push(observation);
      
      console.log(`👁️  Observed: ${metadata.url} (${observation.duration}ms)`);
      
      return observation;
      
    } catch (error) {
      console.error('❌ Observation failed:', error);
      throw error;
    }
  }

  /**
   * Think: Analyze and decide next action
   */
  async think(observation, testGoal) {
    const startTime = Date.now();
    
    try {
      // Prepare context for LLM
      const context = {
        goal: testGoal,
        currentUrl: observation.metadata.url,
        previousActions: this.state.actions.slice(-5), // Last 5 actions
        iteration: this.state.iterations
      };
      
      // Analyze screenshot with vision model
      const analysis = await this.analyzer.analyzeScreenshot(
        observation.screenshot,
        context
      );
      
      // Track API cost (now returns object with total and breakdown)
      const costData = typeof analysis.cost === 'object' ? analysis.cost : { total: analysis.cost || 0.01 };
      this.state.totalCost += costData.total;
      
      // Decide next action
      const decision = {
        action: analysis.nextAction,
        reasoning: analysis.reasoning,
        confidence: analysis.confidence,
        possibleBugs: analysis.bugs || [],
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        cost: analysis.cost
      };
      
      this.state.decisions.push(decision);
      
      // Log decision
      console.log(`🤔 Decision: ${decision.action.type} - ${decision.action.description}`);
      console.log(`   Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
      const displayCost = typeof decision.cost === 'object' ? decision.cost.total : (decision.cost || 0.01);
      console.log(`   Cost: $${displayCost.toFixed(4)}`);
      
      // Check for bugs
      if (decision.possibleBugs.length > 0) {
        console.warn('⚠️  Potential bugs detected:', decision.possibleBugs);
        this.state.bugs.push(...decision.possibleBugs);
      }
      
      return decision;
      
    } catch (error) {
      console.error('❌ Decision failed:', error);
      throw error;
    }
  }

  /**
   * Act: Execute the decided action
   */
  async act(decision) {
    const startTime = Date.now();
    
    try {
      // Skip if confidence too low
      if (decision.confidence < this.config.confidenceThreshold) {
        console.warn(`⚠️ Low confidence (${decision.confidence}), requesting clarification`);
        return { success: false, reason: 'low_confidence' };
      }
      
      // Translate decision to Playwright action
      const playwrightAction = await this.bridge.translateToPlaywright(
        decision.action,
        this.page
      );
      
      // Execute action
      console.log(`🎯 Executing: ${playwrightAction.description}`);
      const result = await this.bridge.executeAction(this.page, playwrightAction);
      
      // Record action
      const actionRecord = {
        ...playwrightAction,
        result,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      };
      
      this.state.actions.push(actionRecord);
      
      // Wait for page to stabilize
      await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      
      return result;
      
    } catch (error) {
      console.error('❌ Action execution failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Evaluate progress toward goal
   */
  async evaluateProgress(actionResult, testGoal) {
    // Check for explicit bugs
    if (this.state.bugs.length > 0) {
      console.log(`🐛 Bugs found: ${this.state.bugs.length}`);
    }
    
    // Check for goal achievement
    if (actionResult.goalAchieved) {
      this.state.goalAchieved = true;
      console.log(`✅ Goal achieved: ${testGoal}`);
    }
    
    // Check for test failure conditions
    if (actionResult.testFailed) {
      console.log(`❌ Test failed: ${actionResult.reason}`);
    }
  }

  /**
   * Determine if testing should continue
   */
  shouldContinue() {
    return (
      !this.state.goalAchieved &&
      this.state.iterations < this.config.maxIterations &&
      this.state.totalCost < this.config.costLimit &&
      this.state.bugs.length === 0 // Stop if critical bug found
    );
  }

  /**
   * Initialize test session
   */
  async initializeTestSession(appId, testGoal) {
    this.state.currentApp = appId;
    this.state.testId = `TEST-${appId}-${Date.now()}`;
    
    // Record in database
    const { error } = await this.supabase
      .from('vision_qa_sessions')
      .insert({
        id: this.state.testId,
        application_id: appId,
        test_goal: testGoal,
        status: 'running',
        started_at: new Date().toISOString(),
        config: this.config
      });
    
    if (error) {
      console.warn('Failed to record test session:', error);
    }
  }

  /**
   * Load application configuration
   */
  async loadAppConfig(appId) {
    const configPath = path.join(
      __dirname,
      '../../applications',
      appId,
      'config.json'
    );
    
    try {
      const configData = await fs.readFile(configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      throw new Error(`Failed to load config for ${appId}: ${error.message}`);
    }
  }

  /**
   * Launch browser instance
   */
  async launchBrowser() {
    this.state.browser = await playwright.chromium.launch({
      headless: this.config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.state.context = await this.state.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'EHG-Vision-QA-Agent/1.0'
    });
    
    this.state.page = await this.state.context.newPage();
    
    // Enable console logging
    this.state.page.on('console', msg => {
      if (msg.type() === 'error') {
        this.state.bugs.push({
          type: 'console_error',
          message: msg.text(),
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  /**
   * Navigate to application
   */
  async navigateToApp(appConfig) {
    // Determine URL based on environment
    const url = appConfig.test_url || 
                appConfig.dev_url || 
                'http://localhost:8080'; // SD-ARCH-EHG-007: EHG unified frontend
    
    console.log(`🌐 Navigating to: ${url}`);
    await this.state.page.goto(url, {
      waitUntil: 'networkidle'
    });
  }

  /**
   * Generate comprehensive test report
   */
  async generateReport() {
    const report = await this.reporter.generateNarrativeReport({
      testId: this.state.testId,
      appId: this.state.currentApp,
      iterations: this.state.iterations,
      totalCost: this.state.totalCost,
      goalAchieved: this.state.goalAchieved,
      bugs: this.state.bugs,
      actions: this.state.actions,
      decisions: this.state.decisions,
      observations: this.state.observations
    });
    
    return report;
  }

  /**
   * Store test results in database
   */
  async storeResults(appId, testGoal, report) {
    const { error } = await this.supabase
      .from('vision_qa_sessions')
      .update({
        status: this.state.goalAchieved ? 'passed' : 'failed',
        completed_at: new Date().toISOString(),
        total_cost: this.state.totalCost,
        iterations: this.state.iterations,
        bugs_found: this.state.bugs.length,
        report: report,
        goal_achieved: this.state.goalAchieved
      })
      .eq('id', this.state.testId);
    
    if (error) {
      console.warn('Failed to update test session:', error);
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.state.browser) {
      await this.state.browser.close();
    }
    
    // Reset state
    this.state = {
      ...this.state,
      browser: null,
      page: null,
      context: null
    };
  }

  /**
   * Auto-select the best model based on test configuration and goal
   */
  autoSelectModel(config) {
    // Analyze test goal for keywords
    const goal = (config.testGoal || '').toLowerCase();
    
    // Check for specific testing types in goal
    if (goal.includes('accessibility') || goal.includes('aria') || goal.includes('keyboard')) {
      // Claude is better for accessibility testing
      return 'claude-sonnet-3.7';
    }
    
    if (goal.includes('performance') || goal.includes('load') || goal.includes('speed')) {
      // Use fast, cheap model for performance testing
      return 'gpt-5-nano';
    }
    
    if (goal.includes('critical') || goal.includes('payment') || goal.includes('security') || goal.includes('compliance')) {
      // Use best model for critical paths
      return 'gpt-5';
    }
    
    if (goal.includes('smoke') || goal.includes('basic') || goal.includes('simple')) {
      // Use cheapest model for basic tests
      return 'gpt-5-nano';
    }
    
    // Check configuration hints
    if (config.consensusRuns && config.consensusRuns >= 3) {
      // Multiple runs = need cheaper model
      return 'gpt-5-mini';
    }
    
    if (config.maxIterations > 50) {
      // Long test = need cheaper model
      return 'gpt-5-mini';
    }
    
    if (config.costLimit && config.costLimit < 1.0) {
      // Low budget = cheapest model
      return 'gpt-5-nano';
    }
    
    if (config.bugDetectionSensitivity === 'high') {
      // High sensitivity = better model
      return 'gpt-5';
    }
    
    // Check for CI/CD environment
    if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.JENKINS) {
      // CI/CD = balanced model
      return 'gpt-5-mini';
    }
    
    // Default: balanced model that works well for most cases
    return 'gpt-5-mini';
  }

  /**
   * Run consensus testing (multiple runs for reliability)
   */
  async runWithConsensus(appId, testGoal) {
    const runs = [];
    
    console.log(`🔄 Running ${this.config.consensusRuns} consensus tests...`);
    
    for (let i = 0; i < this.config.consensusRuns; i++) {
      console.log(`\n--- Run ${i + 1}/${this.config.consensusRuns} ---`);
      const result = await this.testApplication(appId, testGoal);
      runs.push(result);
    }
    
    // Analyze consensus
    const consensus = this.analyzer.findConsensus(runs);
    
    return {
      consensus,
      individualRuns: runs,
      reliability: consensus.agreement
    };
  }
}

module.exports = VisionQAAgent;