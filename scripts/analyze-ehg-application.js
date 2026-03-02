#!/usr/bin/env node

/**
 * EHG Application Flow Analyzer
 * Maps out the complete application structure for comprehensive UAT testing
 */

import { chromium } from '@playwright/test';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = process.env.BASE_URL || 'http://localhost:8082';

/**
 * Application flow mapping
 */
const _EHG_FLOW = {
  entry: {
    url: '/',
    description: 'Landing page - First point of contact',
    elements: {
      navigation: 'Main navigation bar',
      hero: 'Hero section with CTA',
      features: 'Feature showcase',
      loginButton: 'Login/Sign up buttons'
    },
    flows: ['unauthenticated', 'authenticated']
  },

  authentication: {
    login: {
      url: '/login',
      description: 'Login page with Sign In/Sign Up tabs',
      elements: {
        signInTab: 'Sign In tab',
        signUpTab: 'Sign Up tab',
        emailField: '#signin-email or input[type="email"]',
        passwordField: '#signin-password or input[type="password"]',
        submitButton: 'Sign In/Sign Up button',
        forgotPassword: 'Forgot password link'
      },
      successRedirect: '/chairman'
    }
  },

  authenticated: {
    chairman: {
      url: '/chairman',
      description: 'Chairman Dashboard - Main hub after login',
      elements: {
        sidebar: 'Navigation sidebar',
        widgets: 'Dashboard widgets',
        metrics: 'Key metrics display',
        quickActions: 'Quick action buttons',
        notifications: 'Notification center'
      },
      subPages: [
        '/ventures',
        '/analytics',
        '/eva-orchestration',
        '/ai-agents'
      ]
    },

    ventures: {
      url: '/ventures',
      description: 'Venture management',
      actions: ['list', 'create', 'edit', 'delete', 'search'],
      detailView: '/ventures/:id'
    },

    analytics: {
      url: '/analytics',
      description: 'Analytics and reporting',
      features: ['charts', 'exports', 'filters', 'date-range']
    },

    eva: {
      url: '/eva-orchestration',
      description: 'EVA AI Assistant interface',
      features: ['chat', 'commands', 'history', 'settings']
    },

    aiAgents: {
      url: '/ai-agents',
      description: 'AI Agents management',
      types: ['ceo', 'gtm', 'competitive', 'creative']
    }
  },

  administrative: {
    settings: '/settings',
    governance: '/governance',
    security: '/security',
    performance: '/performance',
    team: '/team',
    monitoring: '/monitoring'
  }
};

/**
 * Analyze the application flow
 */
async function analyzeApplication() {
  console.log(chalk.bold.cyan(`
╔══════════════════════════════════════════════════════════════╗
║              EHG Application Flow Analysis                    ║
╚══════════════════════════════════════════════════════════════╝
  `));

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  const analysis = {
    timestamp: new Date().toISOString(),
    baseURL: BASE_URL,
    flows: {},
    routes: [],
    elements: {},
    recommendations: []
  };

  try {
    // 1. Analyze Landing Page
    console.log(chalk.blue('\n📍 Analyzing Landing Page...'));
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const landingElements = {
      hasLoginButton: await page.locator('text=/login|sign in/i').count() > 0,
      hasSignUpButton: await page.locator('text=/sign up|get started/i').count() > 0,
      hasNavigation: await page.locator('nav').count() > 0,
      hasHeroSection: await page.locator('h1').count() > 0,
      url: page.url()
    };

    analysis.flows.landing = landingElements;
    console.log(chalk.green('  ✓ Landing page analyzed'));
    console.log(`    - Login button: ${landingElements.hasLoginButton ? '✓' : '✗'}`);
    console.log(`    - Sign up button: ${landingElements.hasSignUpButton ? '✓' : '✗'}`);

    // 2. Navigate to Login
    console.log(chalk.blue('\n📍 Analyzing Authentication Flow...'));

    // Try clicking login button first
    if (landingElements.hasLoginButton) {
      await page.click('text=/login|sign in/i');
      await page.waitForTimeout(2000);
    } else {
      // Direct navigation
      await page.goto(`${BASE_URL}/login`);
      await page.waitForTimeout(2000);
    }

    // Check if we're on login page
    const currentURL = page.url();
    const isOnLoginPage = currentURL.includes('login');

    if (!isOnLoginPage) {
      console.log(chalk.yellow('  ⚠️  Could not navigate to login page'));
      console.log(`    Current URL: ${currentURL}`);
    }

    // Analyze login form
    const loginElements = {
      signinEmailField: await page.locator('#signin-email').count(),
      signupEmailField: await page.locator('#signup-email').count(),
      genericEmailField: await page.locator('input[type="email"]').count(),
      passwordField: await page.locator('input[type="password"]').count(),
      signInButton: await page.locator('button:has-text("Sign In")').count(),
      signUpButton: await page.locator('button:has-text("Sign Up")').count(),
      tabs: await page.locator('[role="tablist"]').count(),
      currentURL: page.url()
    };

    analysis.flows.authentication = loginElements;
    console.log(chalk.green('  ✓ Authentication flow analyzed'));
    console.log(`    - Sign in email field: ${loginElements.signinEmailField ? '✓' : '✗'}`);
    console.log(`    - Sign up email field: ${loginElements.signupEmailField ? '✓' : '✗'}`);
    console.log(`    - Password field: ${loginElements.passwordField ? '✓' : '✗'}`);
    console.log(`    - Tabs present: ${loginElements.tabs ? '✓' : '✗'}`);

    // 3. Analyze available routes
    console.log(chalk.blue('\n📍 Discovering Routes...'));

    // Get all links on the page
    const links = await page.$$eval('a[href]', elements =>
      elements.map(el => el.href).filter(href => !href.includes('#'))
    );

    const uniqueRoutes = [...new Set(links)].map(link => {
      try {
        const url = new URL(link);
        return url.pathname;
      } catch {
        return link;
      }
    });

    analysis.routes = uniqueRoutes;
    console.log(chalk.green(`  ✓ Found ${uniqueRoutes.length} unique routes`));
    uniqueRoutes.slice(0, 10).forEach(route => {
      console.log(`    - ${route}`);
    });

    // 4. Generate recommendations
    console.log(chalk.blue('\n📍 Generating Test Recommendations...'));

    if (!loginElements.signinEmailField && !loginElements.genericEmailField) {
      analysis.recommendations.push({
        priority: 'HIGH',
        issue: 'No login form fields detected',
        action: 'Tests need to handle SPA navigation properly'
      });
    }

    if (loginElements.tabs) {
      analysis.recommendations.push({
        priority: 'MEDIUM',
        info: 'Login page uses tabs for Sign In/Sign Up',
        action: 'Tests should handle tab switching'
      });
    }

    if (!isOnLoginPage && landingElements.hasLoginButton) {
      analysis.recommendations.push({
        priority: 'HIGH',
        issue: 'Login button click did not navigate to login page',
        action: 'May need to handle client-side routing or authentication state'
      });
    }

    // 5. Save analysis
    const outputPath = join(__dirname, '..', 'test-results', 'ehg-flow-analysis.json');
    await fs.mkdir(dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(analysis, null, 2));

    console.log(chalk.green('\n✅ Analysis Complete'));
    console.log(`   Saved to: ${outputPath}`);

    // Display recommendations
    if (analysis.recommendations.length > 0) {
      console.log(chalk.yellow('\n⚠️  Recommendations:'));
      analysis.recommendations.forEach(rec => {
        console.log(`   [${rec.priority}] ${rec.issue || rec.info}`);
        console.log(`   → ${rec.action}`);
      });
    }

  } catch (error) {
    console.error(chalk.red('❌ Analysis failed:'), error);
    analysis.error = error.message;
  } finally {
    await browser.close();
  }

  return analysis;
}

/**
 * Generate comprehensive test plan based on analysis
 */
async function generateTestPlan(_analysis) {
  console.log(chalk.bold.cyan(`
╔══════════════════════════════════════════════════════════════╗
║           Comprehensive UAT Test Plan for EHG                 ║
╚══════════════════════════════════════════════════════════════╝
  `));

  const testPlan = {
    phases: [],
    testSuites: {},
    totalTests: 0,
    estimatedDuration: '30 minutes'
  };

  // Phase 1: Unauthenticated Tests
  testPlan.phases.push({
    name: 'Phase 1: Unauthenticated User Journey',
    tests: [
      'Landing page loads correctly',
      'Navigation elements are visible',
      'Login/Sign up buttons work',
      'Public content is accessible',
      'SEO elements present',
      'Performance metrics acceptable'
    ]
  });

  // Phase 2: Authentication Tests
  testPlan.phases.push({
    name: 'Phase 2: Authentication Flow',
    tests: [
      'Navigate to login from landing',
      'Sign in with valid credentials',
      'Sign in with invalid credentials',
      'Sign up new account',
      'Password reset flow',
      'Remember me functionality',
      'Logout flow',
      'Session management'
    ]
  });

  // Phase 3: Authenticated User Tests
  testPlan.phases.push({
    name: 'Phase 3: Core Application Features',
    tests: [
      'Chairman dashboard loads',
      'All widgets display data',
      'Navigation sidebar works',
      'Venture CRUD operations',
      'Analytics displays charts',
      'EVA chat interface',
      'AI Agents interaction',
      'Settings management'
    ]
  });

  // Phase 4: Advanced Features
  testPlan.phases.push({
    name: 'Phase 4: Advanced & Administrative',
    tests: [
      'Governance workflows',
      'Security settings',
      'Performance monitoring',
      'Team management',
      'Notifications system',
      'Export functionality',
      'Search functionality',
      'Accessibility compliance'
    ]
  });

  // Calculate totals
  testPlan.totalTests = testPlan.phases.reduce((sum, phase) =>
    sum + phase.tests.length, 0
  );

  console.log(chalk.green('\n📋 Test Plan Summary:'));
  testPlan.phases.forEach((phase, _index) => {
    console.log(chalk.blue(`\n${phase.name}`));
    phase.tests.forEach(test => {
      console.log(`   ✓ ${test}`);
    });
  });

  console.log(chalk.yellow(`\n📊 Total Tests: ${testPlan.totalTests}`));
  console.log(chalk.yellow(`⏱️  Estimated Duration: ${testPlan.estimatedDuration}`));

  return testPlan;
}

// Main execution
async function main() {
  try {
    const analysis = await analyzeApplication();
    const _testPlan = await generateTestPlan(analysis);

    console.log(chalk.bold.green('\n✨ Ready to implement comprehensive UAT testing!'));
    console.log(chalk.cyan('\nNext Steps:'));
    console.log('1. Fix authentication flow based on analysis');
    console.log('2. Implement phased test approach');
    console.log('3. Generate tests for all discovered routes');
    console.log('4. Set up continuous monitoring');

  } catch (error) {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  }
}

// Execute
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main();
}

export { analyzeApplication, generateTestPlan };