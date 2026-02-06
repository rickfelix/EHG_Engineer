/**
 * UAT: Core Navigation Tests (SD-UAT-NAV-001)
 *
 * Three-Tier Testing Architecture - Tier 2 (AI-Executed UAT)
 *
 * Tests:
 * - US-001: Sidebar Menu Navigation
 * - US-002: Header User Menu
 * - US-003: Page Routing (URL + back/forward)
 * - US-004: Breadcrumb Navigation
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:8080';
const SCREENSHOT_DIR = path.resolve('tests/uat/screenshots/nav-uat');
const RESULTS = {
  timestamp: new Date().toISOString(),
  sdId: 'SD-UAT-NAV-001',
  userStories: {},
  findings: [],
  summary: {}
};

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function addFinding(severity, category, description) {
  RESULTS.findings.push({ severity, category, description, timestamp: new Date().toISOString() });
}

function addTestResult(storyId, criterion, status, details = '') {
  if (!RESULTS.userStories[storyId]) {
    RESULTS.userStories[storyId] = { criteria: [], status: 'PENDING' };
  }
  RESULTS.userStories[storyId].criteria.push({ criterion, status, details });
}

async function takeScreenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  return filepath;
}

async function runTests() {
  console.log('=== SD-UAT-NAV-001: Core Navigation UAT ===\n');

  const browser = await chromium.launch({ headless: true, timeout: 60000 });

  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // Track console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', error => {
      consoleErrors.push(error.message);
    });

    // ========================================
    // PHASE 0: Initial Page Load
    // ========================================
    console.log('--- Phase 0: Initial Page Load ---');

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await takeScreenshot(page, '00-initial-load');

    const initialUrl = page.url();
    console.log(`  Initial URL: ${initialUrl}`);
    console.log(`  Title: ${await page.title()}`);

    // ========================================
    // PHASE 1: Public Routes Check
    // ========================================
    console.log('\n--- Phase 1: Public Routes ---');

    const publicRoutes = [
      { path: '/', name: 'Home' },
      { path: '/about', name: 'About' },
      { path: '/approach', name: 'Approach' },
      { path: '/ventures', name: 'Public Ventures' },
      { path: '/contact', name: 'Contact' },
      { path: '/login', name: 'Login' }
    ];

    for (const route of publicRoutes) {
      try {
        await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1000);

        const currentUrl = page.url();
        const pageContent = await page.content();
        const hasContent = pageContent.length > 500;

        console.log(`  ${route.name} (${route.path}): URL=${currentUrl}, Content=${hasContent ? 'OK' : 'EMPTY'}`);
        await takeScreenshot(page, `01-public-${route.name.toLowerCase().replace(/\s+/g, '-')}`);
      } catch (err) {
        console.log(`  ${route.name} FAILED: ${err.message}`);
        addFinding('CRITICAL', 'page-load', `${route.name} page at ${route.path} failed to load: ${err.message}`);
      }
    }

    // ========================================
    // PHASE 2: Login & Authentication
    // ========================================
    console.log('\n--- Phase 2: Login ---');

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '02-login-page');

    const emailField = page.locator('#signin-email').first();
    const passwordField = page.locator('#signin-password').first();
    const signInButton = page.locator('form button[type="submit"]').first();

    const hasEmail = await emailField.count() > 0;
    const hasPassword = await passwordField.count() > 0;
    const hasButton = await signInButton.count() > 0;

    console.log(`  Login form: email=${hasEmail}, password=${hasPassword}, button=${hasButton}`);

    let loginSuccess = false;

    if (!hasEmail || !hasPassword || !hasButton) {
      addFinding('CRITICAL', 'auth', 'Login form is missing required fields');
      console.log('  CRITICAL: Cannot proceed without login form.');
      addTestResult('US-001', 'sidebar-requires-auth', 'BLOCKED', 'Login form not found');
      addTestResult('US-002', 'user-menu-requires-auth', 'BLOCKED', 'Login form not found');
      addTestResult('US-004', 'breadcrumbs-require-auth', 'BLOCKED', 'Login form not found');
    } else {
      const testEmail = process.env.TEST_USER_EMAIL || 'rickfelix2000@gmail.com';
      const testPassword = process.env.TEST_USER_PASSWORD || 'TestPass123!';

      console.log(`  Attempting login with ${testEmail}...`);
      await emailField.fill(testEmail);
      await passwordField.fill(testPassword);
      await takeScreenshot(page, '02-login-filled');

      await signInButton.click();

      // Wait for navigation or error
      await Promise.race([
        page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 }),
        page.waitForSelector('[role="alert"], .destructive, .error', { timeout: 10000, state: 'visible' })
      ]).catch(() => {});

      await page.waitForTimeout(2000);

      const postLoginUrl = page.url();
      loginSuccess = !postLoginUrl.includes('/login');

      console.log(`  Post-login URL: ${postLoginUrl}`);
      console.log(`  Login success: ${loginSuccess}`);
      await takeScreenshot(page, '02-post-login');

      if (!loginSuccess) {
        console.log('  LOGIN FAILED - testing limited to public routes');
        addFinding('CRITICAL', 'auth', `Login failed. Still at: ${postLoginUrl}`);

        const errorMsg = page.locator('[role="alert"], .destructive').first();
        if (await errorMsg.count() > 0) {
          const errorText = await errorMsg.textContent();
          console.log(`  Error message: ${errorText}`);
          addFinding('CRITICAL', 'auth', `Login error: ${errorText}`);
        }

        addTestResult('US-001', 'all', 'BLOCKED', 'Login required but authentication failed');
        addTestResult('US-002', 'all', 'BLOCKED', 'Login required but authentication failed');
        addTestResult('US-004', 'all', 'BLOCKED', 'Login required but authentication failed');
        addTestResult('US-003', 'public-routes', 'PASS', 'Public routes load via direct URL');
      }
    }

    // ========================================
    // AUTHENTICATED TESTS (only if login succeeded)
    // ========================================
    if (loginSuccess) {
      await page.waitForTimeout(3000);
      await takeScreenshot(page, '02-authenticated-layout');

      // ========================================
      // US-001: Sidebar Menu Navigation
      // ========================================
      console.log('\n--- US-001: Sidebar Menu Navigation ---');

      const sidebar = page.locator('[data-sidebar="sidebar"], nav[class*="Sidebar"], aside, [class*="sidebar"]').first();
      const hasSidebar = await sidebar.count() > 0;
      console.log(`  Sidebar found: ${hasSidebar}`);

      if (hasSidebar) {
        await takeScreenshot(page, '03-sidebar-visible');
        addTestResult('US-001', 'sidebar-renders', 'PASS', 'Sidebar component is present in DOM');

        // Check for sidebar menu items
        const sidebarLinks = page.locator('[data-sidebar="sidebar"] a, [data-sidebar="menu-button"] a, [class*="sidebar"] a[href]');
        const linkCount = await sidebarLinks.count();
        console.log(`  Sidebar link count: ${linkCount}`);

        if (linkCount > 0) {
          addTestResult('US-001', 'sidebar-has-items', 'PASS', `${linkCount} navigation items found`);

          const testPaths = [];
          const maxLinksToTest = Math.min(linkCount, 5);

          for (let i = 0; i < maxLinksToTest; i++) {
            try {
              const link = sidebarLinks.nth(i);
              const href = await link.getAttribute('href');
              const text = await link.textContent();

              if (href && !href.startsWith('http') && !testPaths.includes(href)) {
                testPaths.push(href);
                console.log(`  Testing sidebar item: "${text?.trim()}" -> ${href}`);

                // Clear console errors before navigation
                consoleErrors.length = 0;

                await link.click();
                await page.waitForTimeout(2000);

                const newUrl = page.url();
                const urlUpdated = newUrl.includes(href) || new URL(newUrl).pathname === href;

                console.log(`    URL after click: ${newUrl} (expected: ${href})`);
                console.log(`    URL updated correctly: ${urlUpdated}`);

                // Check for JS errors (filter noise)
                const jsErrors = consoleErrors.filter(e =>
                  !e.includes('favicon') && !e.includes('404') && !e.includes('net::ERR')
                );

                if (jsErrors.length > 0) {
                  console.log(`    JS errors: ${jsErrors.join('; ')}`);
                  addFinding('MEDIUM', 'js-error', `JS errors on ${href}: ${jsErrors.join('; ')}`);
                }

                await takeScreenshot(page, `03-sidebar-nav-${i}-${href.replace(/\//g, '_')}`);

                if (urlUpdated) {
                  addTestResult('US-001', `nav-${text?.trim()}-url-update`, 'PASS', `URL updated to ${newUrl}`);
                } else {
                  addTestResult('US-001', `nav-${text?.trim()}-url-update`, 'FAIL', `Expected ${href}, got ${newUrl}`);
                  addFinding('HIGH', 'navigation', `Clicking "${text?.trim()}" did not update URL. Expected ${href}, got ${newUrl}`);
                }
              }
            } catch (err) {
              console.log(`    Error testing link ${i}: ${err.message}`);
            }
          }
        } else {
          addTestResult('US-001', 'sidebar-has-items', 'FAIL', 'No navigation links found');
          addFinding('CRITICAL', 'navigation', 'Sidebar has no clickable navigation items');
        }

        // Check sidebar section grouping
        const sidebarGroups = page.locator('[data-sidebar="group"]');
        const groupCount = await sidebarGroups.count();
        console.log(`  Sidebar groups: ${groupCount}`);
        if (groupCount > 0) {
          addTestResult('US-001', 'sidebar-grouped', 'PASS', `${groupCount} navigation groups found`);
        }

        // Check sidebar search
        const sidebarSearch = page.locator('#sidebar-search, [data-sidebar] input[type="text"]');
        const hasSearch = await sidebarSearch.count() > 0;
        console.log(`  Sidebar search: ${hasSearch}`);
        addTestResult('US-001', 'sidebar-search', hasSearch ? 'PASS' : 'INFO', hasSearch ? 'Search input found' : 'No search in sidebar');
      } else {
        addTestResult('US-001', 'sidebar-renders', 'FAIL', 'Sidebar not found in DOM');
        addFinding('CRITICAL', 'navigation', 'Sidebar navigation component not found');
      }

      // ========================================
      // US-002: Header User Menu
      // ========================================
      console.log('\n--- US-002: Header User Menu ---');

      await page.goto(`${BASE_URL}/chairman`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(3000);

      const userMenuTrigger = page.locator('button:has-text("Chairman"), button:has([class*="User"])').first();
      const hasUserMenu = await userMenuTrigger.count() > 0;
      console.log(`  User menu trigger found: ${hasUserMenu}`);

      if (hasUserMenu) {
        addTestResult('US-002', 'user-menu-exists', 'PASS', 'User menu trigger button found');
        await takeScreenshot(page, '04-user-menu-before');

        try {
          await userMenuTrigger.click();
          await page.waitForTimeout(1000);
          await takeScreenshot(page, '04-user-menu-open');

          const dropdown = page.locator('[role="menu"], [data-radix-menu-content]');
          const hasDropdown = await dropdown.count() > 0;
          console.log(`  Dropdown visible: ${hasDropdown}`);

          if (hasDropdown) {
            addTestResult('US-002', 'dropdown-opens', 'PASS', 'Dropdown menu opens on click');

            const profileItem = page.locator('[role="menuitem"]:has-text("Profile")');
            const hasProfile = await profileItem.count() > 0;
            console.log(`  Profile option: ${hasProfile}`);
            addTestResult('US-002', 'has-profile', hasProfile ? 'PASS' : 'FAIL',
              hasProfile ? 'Profile option present' : 'Profile option missing');

            const settingsItem = page.locator('[role="menuitem"]:has-text("Settings")');
            const hasSettings = await settingsItem.count() > 0;
            console.log(`  Settings option: ${hasSettings}`);
            addTestResult('US-002', 'has-settings', hasSettings ? 'PASS' : 'FAIL',
              hasSettings ? 'Settings option present' : 'Settings option missing');

            const signOutItem = page.locator('[role="menuitem"]:has-text("Sign Out")');
            const hasSignOut = await signOutItem.count() > 0;
            console.log(`  Sign Out option: ${hasSignOut}`);
            addTestResult('US-002', 'has-signout', hasSignOut ? 'PASS' : 'FAIL',
              hasSignOut ? 'Sign Out option present' : 'Sign Out option missing');

            if (!hasProfile) addFinding('HIGH', 'user-menu', 'Profile option missing from user dropdown');
            if (!hasSettings) addFinding('HIGH', 'user-menu', 'Settings option missing from user dropdown');
            if (!hasSignOut) addFinding('CRITICAL', 'user-menu', 'Sign Out option missing from user dropdown');

            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
          } else {
            addTestResult('US-002', 'dropdown-opens', 'FAIL', 'Dropdown did not appear');
            addFinding('HIGH', 'user-menu', 'User menu dropdown did not open on click');
          }
        } catch (err) {
          console.log(`  Error testing user menu: ${err.message}`);
          addTestResult('US-002', 'dropdown-interaction', 'FAIL', `Error: ${err.message}`);
        }
      } else {
        addTestResult('US-002', 'user-menu-exists', 'FAIL', 'User menu trigger not found');
        addFinding('HIGH', 'user-menu', 'User menu trigger button not found in header');
      }

      // ========================================
      // US-003: Page Routing
      // ========================================
      console.log('\n--- US-003: Page Routing ---');

      const authRoutes = [
        { path: '/chairman', name: 'Chairman Dashboard' },
        { path: '/settings', name: 'Settings' },
        { path: '/analytics', name: 'Analytics' },
      ];

      for (const route of authRoutes) {
        try {
          consoleErrors.length = 0;
          await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 15000 });
          await page.waitForTimeout(2000);

          const currentUrl = page.url();
          const urlCorrect = currentUrl.includes(route.path);

          console.log(`  Direct nav to ${route.path}: URL=${currentUrl}, Correct=${urlCorrect}`);

          const jsErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('net::ERR'));

          addTestResult('US-003', `direct-url-${route.name}`, urlCorrect ? 'PASS' : 'FAIL',
            `URL ${urlCorrect ? 'matches' : 'does not match'} expected path. Got: ${currentUrl}`);

          if (jsErrors.length > 0) {
            addFinding('MEDIUM', 'js-error', `JS errors on ${route.path}: ${jsErrors.slice(0, 3).join('; ')}`);
          }

          await takeScreenshot(page, `05-direct-nav-${route.name.toLowerCase().replace(/\s+/g, '-')}`);
        } catch (err) {
          console.log(`  FAILED: ${err.message}`);
          addTestResult('US-003', `direct-url-${route.name}`, 'FAIL', `Error: ${err.message}`);
        }
      }

      // Test Back/Forward buttons
      console.log('\n  Testing browser back/forward...');
      try {
        await page.goto(`${BASE_URL}/chairman`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(1500);

        await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(1500);

        await page.goto(`${BASE_URL}/analytics`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(1500);

        // Go back
        await page.goBack();
        await page.waitForTimeout(2000);
        const backUrl = page.url();
        const backWorks = backUrl.includes('/settings');
        console.log(`  After goBack: ${backUrl} (expected /settings: ${backWorks})`);
        addTestResult('US-003', 'back-button', backWorks ? 'PASS' : 'FAIL',
          `Back: ${backWorks ? 'correct' : 'incorrect'}. Got: ${backUrl}`);

        // Go forward
        await page.goForward();
        await page.waitForTimeout(2000);
        const forwardUrl = page.url();
        const forwardWorks = forwardUrl.includes('/analytics');
        console.log(`  After goForward: ${forwardUrl} (expected /analytics: ${forwardWorks})`);
        addTestResult('US-003', 'forward-button', forwardWorks ? 'PASS' : 'FAIL',
          `Forward: ${forwardWorks ? 'correct' : 'incorrect'}. Got: ${forwardUrl}`);

        if (!backWorks) addFinding('HIGH', 'routing', 'Browser back button does not work correctly');
        if (!forwardWorks) addFinding('HIGH', 'routing', 'Browser forward button does not work correctly');
      } catch (err) {
        console.log(`  Back/forward error: ${err.message}`);
        addTestResult('US-003', 'back-forward', 'FAIL', `Error: ${err.message}`);
      }

      // Test 404 page
      console.log('\n  Testing 404 page...');
      try {
        await page.goto(`${BASE_URL}/this-page-does-not-exist-xyz`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);

        const notFoundContent = await page.content();
        const has404 = notFoundContent.toLowerCase().includes('not found') ||
                      notFoundContent.toLowerCase().includes('404') ||
                      notFoundContent.toLowerCase().includes('page not found');

        console.log(`  404 page shows error: ${has404}`);
        await takeScreenshot(page, '05-404-page');
        addTestResult('US-003', '404-page', has404 ? 'PASS' : 'INFO',
          has404 ? '404 page displays correctly' : '404 page may not show proper error');
      } catch (err) {
        addTestResult('US-003', '404-page', 'FAIL', `Error: ${err.message}`);
      }

      // ========================================
      // US-004: Breadcrumb Navigation
      // ========================================
      console.log('\n--- US-004: Breadcrumb Navigation ---');

      // Breadcrumbs should NOT show on /chairman
      await page.goto(`${BASE_URL}/chairman`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);

      const breadcrumbOnHome = page.locator('nav[aria-label="Breadcrumb"]');
      const hasBreadcrumbOnHome = await breadcrumbOnHome.count() > 0;
      console.log(`  Breadcrumbs on /chairman: ${hasBreadcrumbOnHome} (expected: false)`);
      addTestResult('US-004', 'breadcrumb-hidden-on-home', !hasBreadcrumbOnHome ? 'PASS' : 'INFO',
        !hasBreadcrumbOnHome ? 'Correctly hidden on homepage' : 'Visible on homepage (acceptable)');

      // Check breadcrumbs on nested pages
      const nestedRoutes = [
        { path: '/settings', expected: ['Settings'] },
        { path: '/analytics', expected: ['Analytics'] },
        { path: '/chairman/decisions', expected: ['Chairman', 'Decisions'] },
      ];

      for (const route of nestedRoutes) {
        try {
          await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 15000 });
          await page.waitForTimeout(2000);

          const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
          const hasBreadcrumb = await breadcrumb.count() > 0;
          console.log(`  Breadcrumbs on ${route.path}: ${hasBreadcrumb}`);

          if (hasBreadcrumb) {
            const breadcrumbText = await breadcrumb.textContent();
            console.log(`    Text: "${breadcrumbText?.trim()}"`);

            const homeButton = breadcrumb.locator('button[aria-label*="Chairman"], button[aria-label*="Home"]');
            const hasHomeButton = await homeButton.count() > 0;

            const separators = breadcrumb.locator('svg');
            const hasSeparators = await separators.count() > 0;

            addTestResult('US-004', `breadcrumb-${route.path}`, 'PASS',
              `Text: "${breadcrumbText?.trim()}", Home: ${hasHomeButton}, Separators: ${hasSeparators}`);

            // Test clicking home breadcrumb
            if (hasHomeButton) {
              await homeButton.click();
              await page.waitForTimeout(2000);
              const afterClickUrl = page.url();
              const navigatedHome = afterClickUrl.includes('/chairman');
              console.log(`    After home click: ${afterClickUrl} (chairman: ${navigatedHome})`);
              addTestResult('US-004', `breadcrumb-home-click-${route.path}`, navigatedHome ? 'PASS' : 'FAIL',
                `Home breadcrumb ${navigatedHome ? 'works' : 'broken'}`);
            }

            await takeScreenshot(page, `06-breadcrumb-${route.path.replace(/\//g, '_')}`);
          } else {
            addTestResult('US-004', `breadcrumb-${route.path}`, 'FAIL', `No breadcrumbs on ${route.path}`);
            addFinding('MEDIUM', 'breadcrumb', `Breadcrumbs not visible on ${route.path}`);
          }
        } catch (err) {
          console.log(`  Error on ${route.path}: ${err.message}`);
          addTestResult('US-004', `breadcrumb-${route.path}`, 'FAIL', `Error: ${err.message}`);
        }
      }
    }

    // ========================================
    // PHASE 3: Accessibility Quick Check
    // ========================================
    console.log('\n--- Phase 3: Accessibility Quick Check ---');

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const skipNav = page.locator('[class*="SkipNav"], a[href="#main-content"], .skip-navigation');
    const hasSkipNav = await skipNav.count() > 0;
    console.log(`  Skip navigation: ${hasSkipNav}`);
    if (!hasSkipNav) {
      addFinding('LOW', 'accessibility', 'No skip navigation link found for keyboard users');
    }

    const mainLandmark = page.locator('main, [role="main"]');
    const navLandmark = page.locator('nav, [role="navigation"]');
    console.log(`  Main landmark: ${await mainLandmark.count() > 0}, Nav landmark: ${await navLandmark.count() > 0}`);

    // ========================================
    // COMPILE RESULTS
    // ========================================

    for (const [storyId, story] of Object.entries(RESULTS.userStories)) {
      const fails = story.criteria.filter(c => c.status === 'FAIL');
      const blocked = story.criteria.filter(c => c.status === 'BLOCKED');
      const passes = story.criteria.filter(c => c.status === 'PASS');

      if (blocked.length > 0) story.status = 'BLOCKED';
      else if (fails.length > 0) story.status = 'FAIL';
      else if (passes.length > 0) story.status = 'PASS';
      else story.status = 'INCONCLUSIVE';
    }

    const stories = Object.entries(RESULTS.userStories);
    RESULTS.summary = {
      totalStories: stories.length,
      passed: stories.filter(([, s]) => s.status === 'PASS').length,
      failed: stories.filter(([, s]) => s.status === 'FAIL').length,
      blocked: stories.filter(([, s]) => s.status === 'BLOCKED').length,
      findings: {
        critical: RESULTS.findings.filter(f => f.severity === 'CRITICAL').length,
        high: RESULTS.findings.filter(f => f.severity === 'HIGH').length,
        medium: RESULTS.findings.filter(f => f.severity === 'MEDIUM').length,
        low: RESULTS.findings.filter(f => f.severity === 'LOW').length,
      }
    };

  } catch (err) {
    console.error('FATAL ERROR:', err.message);
    RESULTS.findings.push({
      severity: 'CRITICAL',
      category: 'test-execution',
      description: `Fatal test error: ${err.message}`,
      timestamp: new Date().toISOString()
    });
  } finally {
    await browser.close();
  }

  // Write results
  const resultsPath = path.join(SCREENSHOT_DIR, 'uat-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(RESULTS, null, 2));

  // Print summary
  console.log('\n================================================');
  console.log('UAT RESULTS SUMMARY');
  console.log('================================================');
  console.log(`SD: ${RESULTS.sdId}`);
  console.log(`Timestamp: ${RESULTS.timestamp}`);
  console.log(`\nUser Story Results:`);

  for (const [storyId, story] of Object.entries(RESULTS.userStories)) {
    const tag = story.status === 'PASS' ? '[PASS]' : story.status === 'FAIL' ? '[FAIL]' : '[BLOCKED]';
    console.log(`  ${tag} ${storyId}: ${story.status}`);
    for (const c of story.criteria) {
      const mark = c.status === 'PASS' ? '  +' : c.status === 'FAIL' ? '  -' : '  ?';
      console.log(`    ${mark} ${c.criterion}: ${c.status} ${c.details ? `(${c.details})` : ''}`);
    }
  }

  console.log(`\nFindings: ${RESULTS.findings.length} total`);
  console.log(`  CRITICAL: ${RESULTS.summary.findings?.critical || 0}`);
  console.log(`  HIGH: ${RESULTS.summary.findings?.high || 0}`);
  console.log(`  MEDIUM: ${RESULTS.summary.findings?.medium || 0}`);
  console.log(`  LOW: ${RESULTS.summary.findings?.low || 0}`);

  if (RESULTS.findings.length > 0) {
    console.log(`\nDetailed Findings:`);
    RESULTS.findings.forEach((f, i) => {
      console.log(`  ${i + 1}. [${f.severity}] (${f.category}) ${f.description}`);
    });
  }

  console.log(`\nScreenshots saved to: ${SCREENSHOT_DIR}`);
  console.log(`Results JSON: ${resultsPath}`);
  console.log('================================================\n');

  return RESULTS;
}

runTests().catch(console.error);
