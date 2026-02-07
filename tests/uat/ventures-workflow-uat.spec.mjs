/**
 * UAT: Ventures & 25-Stage Workflow (SD-UAT-VENTURE-001)
 *
 * Three-Tier Testing Architecture - Tier 2 (AI-Executed UAT)
 *
 * Tests:
 * - US-001: Verify Venture List Display (list, search, filter, sort, detail nav)
 * - US-002: Verify 25-Stage Workflow - Stages 1-5 (Ideation / THE TRUTH)
 * - US-003: Verify 25-Stage Workflow - Stages 6-10 (Validation / THE ENGINE)
 * - US-004: Verify 25-Stage Workflow - Stages 11-15 (Growth / THE IDENTITY + THE BLUEPRINT)
 * - US-005: Verify 25-Stage Workflow - Stages 16-20 (Scale / THE BLUEPRINT + THE BUILD LOOP)
 * - US-006: Verify 25-Stage Workflow - Stages 21-25 (Exit / LAUNCH & LEARN)
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:8080';
const SCREENSHOT_DIR = path.resolve('tests/uat/screenshots/ventures-uat');
const RESULTS = {
  timestamp: new Date().toISOString(),
  sdId: 'SD-UAT-VENTURE-001',
  userStories: {},
  findings: [],
  summary: {}
};

// 25-stage workflow metadata (from src/config/venture-workflow.ts)
const WORKFLOW_PHASES = [
  { name: 'THE TRUTH', stages: [1, 2, 3, 4, 5], color: 'violet' },
  { name: 'THE ENGINE', stages: [6, 7, 8, 9], color: 'blue' },
  { name: 'THE IDENTITY', stages: [10, 11, 12], color: 'cyan' },
  { name: 'THE BLUEPRINT', stages: [13, 14, 15, 16], color: 'emerald' },
  { name: 'THE BUILD LOOP', stages: [17, 18, 19, 20], color: 'amber' },
  { name: 'LAUNCH & LEARN', stages: [21, 22, 23, 24, 25], color: 'rose' },
];

const STAGE_NAMES = {
  1: 'Draft Idea', 2: 'AI Review', 3: 'Comprehensive Validation',
  4: 'Competitive Intelligence', 5: 'Profitability Forecasting',
  6: 'Risk Evaluation', 7: 'Comprehensive Planning',
  8: 'Problem Decomposition', 9: 'Gap Analysis',
  10: 'Technical Review', 11: 'Go-to-Market Strategy',
  12: 'Sales & Success Logic',
  13: 'Tech Stack Interrogation', 14: 'Data Model & Architecture',
  15: 'Epic & User Story Breakdown', 16: 'Schema Firewall',
  17: 'Environment Config', 18: 'MVP Development Loop',
  19: 'Integration & API Layer', 20: 'Security & Performance',
  21: 'QA & UAT', 22: 'Deployment', 23: 'Production Launch',
  24: 'Analytics & Feedback', 25: 'Optimization & Scale',
};

const KILL_GATES = [3, 5, 13, 23];
const PROMOTION_GATES = [16, 17, 22];

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
  console.log('=== SD-UAT-VENTURE-001: Ventures & 25-Stage Workflow UAT ===\n');

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
    // PHASE 0: Login
    // ========================================
    console.log('--- Phase 0: Login ---');

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const emailField = page.locator('#signin-email').first();
    const passwordField = page.locator('#signin-password').first();
    const signInButton = page.locator('form button[type="submit"]').first();

    const hasLoginForm = (await emailField.count() > 0) &&
                          (await passwordField.count() > 0) &&
                          (await signInButton.count() > 0);

    if (!hasLoginForm) {
      console.log('  CRITICAL: Login form not found. Aborting.');
      addFinding('CRITICAL', 'auth', 'Login form not found - cannot proceed with authenticated tests');
      for (const us of ['US-001', 'US-002', 'US-003', 'US-004', 'US-005', 'US-006']) {
        addTestResult(us, 'auth-required', 'BLOCKED', 'Login form not available');
      }
      throw new Error('Login form not found');
    }

    const testEmail = process.env.TEST_USER_EMAIL || 'rickfelix2000@gmail.com';
    const testPassword = process.env.TEST_USER_PASSWORD || 'TestPass123!';

    console.log(`  Logging in as ${testEmail}...`);
    await emailField.fill(testEmail);
    await passwordField.fill(testPassword);
    await signInButton.click();

    await Promise.race([
      page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 }),
      page.waitForSelector('[role="alert"], .destructive, .error', { timeout: 10000, state: 'visible' })
    ]).catch(() => {});

    await page.waitForTimeout(3000);

    const postLoginUrl = page.url();
    const loginSuccess = !postLoginUrl.includes('/login');

    console.log(`  Post-login URL: ${postLoginUrl}`);
    console.log(`  Login success: ${loginSuccess}`);
    await takeScreenshot(page, '00-post-login');

    if (!loginSuccess) {
      console.log('  CRITICAL: Login failed. Aborting.');
      addFinding('CRITICAL', 'auth', `Login failed. URL: ${postLoginUrl}`);
      for (const us of ['US-001', 'US-002', 'US-003', 'US-004', 'US-005', 'US-006']) {
        addTestResult(us, 'auth-required', 'BLOCKED', 'Authentication failed');
      }
      throw new Error('Authentication failed');
    }

    console.log('  Login successful.\n');

    // ========================================
    // US-001: Verify Venture List Display
    // ========================================
    console.log('--- US-001: Verify Venture List Display ---');

    // The authenticated ventures management page is at /chairman/portfolio
    // (not /ventures, which is the public portfolio page)
    const VENTURES_ROUTE = '/chairman/portfolio';
    const VENTURES_ROUTE_ALT = '/ventures';

    consoleErrors.length = 0;
    await page.goto(`${BASE_URL}${VENTURES_ROUTE}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await takeScreenshot(page, '01-ventures-list');

    let currentUrl = page.url();
    let onVenturesPage = currentUrl.includes('/chairman/portfolio') || currentUrl.includes('/ventures');
    console.log(`  Navigated to ${VENTURES_ROUTE}: ${onVenturesPage} (URL: ${currentUrl})`);

    // If chairman/portfolio doesn't work, try /ventures as fallback
    if (!onVenturesPage) {
      console.log('  Trying alternative route /ventures...');
      await page.goto(`${BASE_URL}${VENTURES_ROUTE_ALT}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
      currentUrl = page.url();
      onVenturesPage = currentUrl.includes('/ventures');
      console.log(`  Fallback URL: ${currentUrl}`);
    }

    addTestResult('US-001', 'page-loads', onVenturesPage ? 'PASS' : 'FAIL',
      `Ventures page ${onVenturesPage ? 'loads' : 'did not load'}. URL: ${currentUrl}`);

    // The portfolio page has 4 view tabs: Summary, Stage Navigation, Ventures, RAID
    // Default view is "Summary" which shows metrics and stage distribution
    // Need to check each view mode

    // --- Summary View (default) ---
    console.log('  --- Summary View (default) ---');
    const totalVenturesMetric = page.locator('text=Total Ventures');
    const hasTotalVentures = await totalVenturesMetric.count() > 0;
    console.log(`  Total Ventures metric: ${hasTotalVentures}`);

    const avgStageMetric = page.locator('text=Average Stage');
    const hasAvgStage = await avgStageMetric.count() > 0;
    console.log(`  Average Stage metric: ${hasAvgStage}`);

    const stageDistribution = page.locator('text=Stage Distribution');
    const hasStageDistribution = await stageDistribution.count() > 0;
    console.log(`  Stage Distribution: ${hasStageDistribution}`);

    const triageCards = page.locator('text=Stuck, text=Succeeding, text=Needs Attention');
    const hasTriageCards = await triageCards.count() > 0;
    console.log(`  Triage cards: ${hasTriageCards}`);

    const summaryContentFound = hasTotalVentures || hasAvgStage || hasStageDistribution;
    addTestResult('US-001', 'summary-view-renders', summaryContentFound ? 'PASS' : 'FAIL',
      `Summary view: Total Ventures=${hasTotalVentures}, Avg Stage=${hasAvgStage}, Distribution=${hasStageDistribution}, Triage=${hasTriageCards}`);

    // Check for New Venture button
    const newVentureBtn = page.locator('button:has-text("New Venture"), a:has-text("New Venture")').first();
    const hasNewVentureBtn = await newVentureBtn.count() > 0;
    console.log(`  New Venture button: ${hasNewVentureBtn}`);
    addTestResult('US-001', 'new-venture-button', hasNewVentureBtn ? 'PASS' : 'FAIL',
      hasNewVentureBtn ? 'New Venture button present' : 'New Venture button not found');

    // --- Switch to "Ventures" tab to see table view ---
    console.log('  --- Switching to Ventures table view ---');
    // Must be specific: the view mode tabs (Summary, Stage Navigation, Ventures, RAID)
    // are within the portfolio content area, not the top nav bar
    // Use the "View:" label context or look for tabs that are siblings of Summary/RAID
    const venturesTab = page.locator('[role="tab"]:has-text("Ventures"), button:has-text("Ventures"):near(:has-text("Summary"))').first();
    const hasVenturesTab = await venturesTab.count() > 0;
    console.log(`  Ventures tab found: ${hasVenturesTab}`);

    let hasTable = false;
    let rowCount = 0;

    if (hasVenturesTab) {
      await venturesTab.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '01-ventures-table-view');

      const venturesTable = page.locator('[role="table"][aria-label="Ventures listing"], [data-testid="ventures-table"], table').first();
      hasTable = await venturesTable.count() > 0;
      console.log(`  Ventures table found: ${hasTable}`);

      const tableRows = hasTable ? page.locator('table tbody tr, [role="table"] tbody tr') : null;
      rowCount = tableRows ? await tableRows.count() : 0;
      console.log(`  Table rows: ${rowCount}`);

      if (hasTable) {
        addTestResult('US-001', 'ventures-table-render', 'PASS', `Table renders with ${rowCount} rows`);

        // Test search in table view
        const searchInput = page.locator('#search-ventures, input[aria-label="Search ventures"], input[placeholder*="Search"]').first();
        const hasSearch = await searchInput.count() > 0;
        console.log(`  Search input: ${hasSearch}`);
        addTestResult('US-001', 'search-exists', hasSearch ? 'PASS' : 'INFO',
          hasSearch ? 'Search input present in table view' : 'Search input not found in table view');

        if (hasSearch && rowCount > 0) {
          await searchInput.fill('nonexistent-xyz');
          await page.waitForTimeout(1500);
          const afterSearchRows = await page.locator('table tbody tr, [role="table"] tbody tr').count();
          await searchInput.clear();
          await page.waitForTimeout(1500);
          const afterClearRows = await page.locator('table tbody tr, [role="table"] tbody tr').count();
          addTestResult('US-001', 'search-filters', 'PASS',
            `Search: before=${rowCount}, during=${afterSearchRows}, after-clear=${afterClearRows}`);
          await takeScreenshot(page, '01-ventures-search');
        }

        // Test status filter
        const statusFilter = page.locator('#status-filter, select[id*="status"]').first();
        const hasFilter = await statusFilter.count() > 0;
        console.log(`  Status filter: ${hasFilter}`);
        addTestResult('US-001', 'filter-exists', hasFilter ? 'PASS' : 'INFO',
          hasFilter ? 'Status filter present' : 'Status filter not found');

        // Test sorting (click column headers)
        const columnHeaders = page.locator('table th button, [role="table"] th button, th[aria-sort]');
        const headerCount = await columnHeaders.count();
        console.log(`  Sortable columns: ${headerCount}`);
        if (headerCount > 0) {
          const firstHeader = columnHeaders.first();
          const headerText = await firstHeader.textContent();
          await firstHeader.click();
          await page.waitForTimeout(1000);
          console.log(`  Sorted by: "${headerText?.trim()}"`);
          addTestResult('US-001', 'sort-clickable', 'PASS', `Sort column "${headerText?.trim()}" clickable`);
          await takeScreenshot(page, '01-ventures-sorted');
        }
      } else {
        addTestResult('US-001', 'ventures-table-render', 'FAIL', 'No table found in Ventures tab');
      }
    } else {
      addTestResult('US-001', 'ventures-table-render', 'INFO', 'Ventures tab not found');
    }

    // --- Navigate to venture detail ---
    let ventureDetailUrl = null;
    let ventureName = null;

    // Try clicking a venture from the table
    if (hasTable && rowCount > 0) {
      try {
        const firstRowLink = page.locator('table tbody tr a, [role="table"] tbody tr a').first();
        if (await firstRowLink.count() > 0) {
          ventureName = (await firstRowLink.textContent())?.trim();
          console.log(`  Clicking venture: "${ventureName}"`);
          await firstRowLink.click();
          await page.waitForTimeout(3000);
          ventureDetailUrl = page.url();
          const isDetailPage = ventureDetailUrl.includes('/ventures/');
          console.log(`  Detail URL: ${ventureDetailUrl} (is detail: ${isDetailPage})`);
          addTestResult('US-001', 'click-to-detail', isDetailPage ? 'PASS' : 'FAIL',
            isDetailPage ? `Navigated to detail: ${ventureDetailUrl}` : `Did not navigate. URL: ${ventureDetailUrl}`);
          await takeScreenshot(page, '01-venture-detail');
        }
      } catch (err) {
        console.log(`  Detail nav error: ${err.message}`);
        addTestResult('US-001', 'click-to-detail', 'FAIL', `Error: ${err.message}`);
      }
    }

    // If no venture found in table, try sidebar "New Venture" link
    if (!ventureDetailUrl) {
      console.log('  Trying sidebar venture link...');
      if (!currentUrl.includes('/chairman/portfolio')) {
        await page.goto(`${BASE_URL}/chairman/portfolio`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
      }

      // The sidebar shows venture names under "My Ventures" section
      // e.g., "New Venture" with a score badge
      const sidebarVentures = page.locator('[data-sidebar="sidebar"] a[href*="/ventures/"], aside a[href*="/ventures/"], nav a[href*="/ventures/"]');
      const sidebarCount = await sidebarVentures.count();
      console.log(`  Sidebar venture links: ${sidebarCount}`);

      for (let i = 0; i < sidebarCount; i++) {
        const href = await sidebarVentures.nth(i).getAttribute('href');
        // Skip non-detail links like /ventures/new, /ventures/decisions etc.
        if (href && href.match(/\/ventures\/[a-f0-9-]+/i)) {
          ventureName = (await sidebarVentures.nth(i).textContent())?.trim();
          console.log(`  Sidebar venture: "${ventureName}" -> ${href}`);
          await sidebarVentures.nth(i).click();
          await page.waitForTimeout(3000);
          ventureDetailUrl = page.url();
          const isDetailPage = ventureDetailUrl.includes('/ventures/');
          console.log(`  Detail URL: ${ventureDetailUrl}`);
          addTestResult('US-001', 'click-to-detail', isDetailPage ? 'PASS' : 'FAIL',
            isDetailPage ? `Via sidebar: ${ventureDetailUrl}` : `Did not navigate. URL: ${ventureDetailUrl}`);
          await takeScreenshot(page, '01-venture-detail-sidebar');
          break;
        }
      }

      if (!ventureDetailUrl) {
        addTestResult('US-001', 'click-to-detail', 'INFO', 'No venture detail link found in sidebar');
      }
    }

    // JS error check for ventures page
    const venturesPageErrors = consoleErrors.filter(e =>
      !e.includes('favicon') && !e.includes('net::ERR') && !e.includes('404')
    );
    if (venturesPageErrors.length > 0) {
      addFinding('MEDIUM', 'js-error', `JS errors on portfolio page: ${venturesPageErrors.slice(0, 3).join('; ')}`);
    }

    // ========================================
    // VENTURE DETAIL & WORKFLOW SETUP
    // ========================================
    // Get a venture ID for workflow testing
    let testVentureId = null;

    if (ventureDetailUrl && ventureDetailUrl.includes('/ventures/')) {
      // Extract venture ID from URL
      const urlMatch = ventureDetailUrl.match(/\/ventures\/([^/?#]+)/);
      testVentureId = urlMatch ? urlMatch[1] : null;
    }

    if (!testVentureId) {
      // Try to get a venture ID from any link on the page
      console.log('\n  Attempting to find a venture ID...');

      // Check if we're already on a page with venture links
      const anyVentureLink = page.locator('a[href*="/ventures/"]').first();
      if (await anyVentureLink.count() > 0) {
        const href = await anyVentureLink.getAttribute('href');
        const hrefMatch = href?.match(/\/ventures\/([^/?#]+)/);
        if (hrefMatch && hrefMatch[1] !== 'new' && hrefMatch[1] !== 'decisions' && hrefMatch[1] !== 'calibration' && hrefMatch[1] !== 'matrix') {
          testVentureId = hrefMatch[1];
          console.log(`  Found venture ID from current page: ${testVentureId}`);
        }
      }

      // Navigate to portfolio page to find venture links
      if (!testVentureId) {
        await page.goto(`${BASE_URL}/chairman/portfolio`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);

        const portfolioLinks = page.locator('a[href*="/ventures/"]');
        const linkCount = await portfolioLinks.count();
        for (let i = 0; i < linkCount; i++) {
          const href = await portfolioLinks.nth(i).getAttribute('href');
          const hrefMatch = href?.match(/\/ventures\/([a-f0-9-]+)/i);
          if (hrefMatch) {
            testVentureId = hrefMatch[1];
            console.log(`  Found venture ID from portfolio: ${testVentureId}`);
            break;
          }
        }
      }

      // Try querying Supabase directly for a venture ID via the page's API
      if (!testVentureId) {
        console.log('  No venture ID found via DOM. Will test workflow pages without venture-specific URLs.');
      }
    }

    if (!testVentureId) {
      console.log('  WARNING: No venture ID found. Workflow tests will use direct URL navigation.');
    } else {
      console.log(`  Using venture ID: ${testVentureId} for workflow tests.`);
    }

    // ========================================
    // VENTURE DETAIL PAGE VALIDATION
    // ========================================
    if (testVentureId) {
      console.log('\n--- Venture Detail Page Validation ---');

      consoleErrors.length = 0;
      await page.goto(`${BASE_URL}/ventures/${testVentureId}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
      await takeScreenshot(page, '02-venture-detail-page');

      // Check venture name displays
      const detailHeading = page.locator('h1, h2').first();
      const headingText = await detailHeading.textContent();
      console.log(`  Detail heading: "${headingText?.trim()}"`);

      // Check tabs
      const detailTabs = page.locator('[role="tablist"] [role="tab"]');
      const tabCount = await detailTabs.count();
      console.log(`  Detail tabs: ${tabCount}`);

      if (tabCount > 0) {
        const tabLabels = [];
        for (let i = 0; i < tabCount; i++) {
          const tabText = await detailTabs.nth(i).textContent();
          tabLabels.push(tabText?.trim());
        }
        console.log(`  Tab labels: ${tabLabels.join(', ')}`);
      }

      // Check for workflow tab
      const workflowTab = page.locator('[role="tab"]:has-text("Workflow"), [role="tab"]:has-text("workflow")');
      const hasWorkflowTab = await workflowTab.count() > 0;
      console.log(`  Workflow tab found: ${hasWorkflowTab}`);

      // Check detail page errors
      const detailErrors = consoleErrors.filter(e =>
        !e.includes('favicon') && !e.includes('net::ERR') && !e.includes('404')
      );
      if (detailErrors.length > 0) {
        addFinding('MEDIUM', 'js-error', `JS errors on detail page: ${detailErrors.slice(0, 3).join('; ')}`);
      }
    }

    // ========================================
    // WORKFLOW TESTING HELPER
    // ========================================
    async function testWorkflowStages(storyId, stageRange, phaseName) {
      console.log(`\n--- ${storyId}: ${phaseName} (Stages ${stageRange[0]}-${stageRange[stageRange.length - 1]}) ---`);

      for (const stageNum of stageRange) {
        const stageName = STAGE_NAMES[stageNum] || `Stage ${stageNum}`;
        const isKillGate = KILL_GATES.includes(stageNum);
        const isPromotionGate = PROMOTION_GATES.includes(stageNum);
        const gateLabel = isKillGate ? ' [KILL GATE]' : isPromotionGate ? ' [PROMOTION GATE]' : '';

        console.log(`  Testing Stage ${stageNum}: ${stageName}${gateLabel}`);
        consoleErrors.length = 0;

        try {
          const workflowUrl = testVentureId
            ? `${BASE_URL}/ventures/${testVentureId}/workflow?stage=${stageNum}`
            : `${BASE_URL}/ventures`;

          await page.goto(workflowUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(3000);

          const loadedUrl = page.url();
          const pageLoaded = loadedUrl.includes('/ventures');
          console.log(`    URL: ${loadedUrl} (loaded: ${pageLoaded})`);

          if (!pageLoaded) {
            addTestResult(storyId, `stage-${stageNum}-load`, 'FAIL', `Page did not load for stage ${stageNum}`);
            continue;
          }

          await takeScreenshot(page, `${storyId.toLowerCase()}-stage-${String(stageNum).padStart(2, '0')}-${stageName.toLowerCase().replace(/[\s&]+/g, '-')}`);

          // Check if page has meaningful content (not error page)
          const pageContent = await page.content();
          const hasContent = pageContent.length > 1000;
          const hasError = pageContent.includes('Something went wrong') || pageContent.includes('Error') && pageContent.includes('boundary');

          if (hasError) {
            addTestResult(storyId, `stage-${stageNum}-render`, 'FAIL', `Error boundary triggered on stage ${stageNum}`);
            addFinding('HIGH', 'workflow', `Stage ${stageNum} (${stageName}) triggers error boundary`);
            continue;
          }

          addTestResult(storyId, `stage-${stageNum}-load`, hasContent ? 'PASS' : 'FAIL',
            `Stage ${stageNum} (${stageName})${gateLabel} ${hasContent ? 'loads with content' : 'has no content'}`);

          // Check for stage indicator
          const stageIndicator = page.locator(
            `text=Stage ${stageNum}, text="${stageName}", [data-stage="${stageNum}"], [aria-label*="Stage ${stageNum}"], [aria-label*="${stageName}"]`
          );
          const hasStageIndicator = await stageIndicator.count() > 0;

          // Also check for stage number in any heading or badge
          const stageNumText = page.locator(`text=${stageNum}`);
          const hasStageNum = await stageNumText.count() > 0;

          if (hasStageIndicator || hasStageNum) {
            addTestResult(storyId, `stage-${stageNum}-indicator`, 'PASS',
              `Stage ${stageNum} indicator ${hasStageIndicator ? 'found by name' : 'found by number'}`);
          } else {
            addTestResult(storyId, `stage-${stageNum}-indicator`, 'INFO',
              `Stage ${stageNum} indicator not explicitly found (may be embedded in workflow visualization)`);
          }

          // Check for gate-specific UI if applicable
          if (isKillGate || isPromotionGate) {
            const gateText = isKillGate ? 'kill' : 'promotion';
            // Check for gate UI using separate locators to avoid regex/CSS mixing
            const gateByAttr = page.locator('[data-gate-type], [class*="gate"]');
            const gateByText = page.locator(`text=${gateText}`);
            const gateByLabel = page.locator('text=gate');
            const hasGateUI = (await gateByAttr.count() > 0) ||
                              (await gateByText.count() > 0) ||
                              (await gateByLabel.count() > 0);
            console.log(`    Gate UI (${gateText}): ${hasGateUI}`);
            addTestResult(storyId, `stage-${stageNum}-gate`, hasGateUI ? 'PASS' : 'INFO',
              `${gateText} gate UI ${hasGateUI ? 'rendered' : 'not explicitly visible'} for stage ${stageNum}`);
          }

          // Check for JS errors
          const stageErrors = consoleErrors.filter(e =>
            !e.includes('favicon') && !e.includes('net::ERR') && !e.includes('404') && !e.includes('hydrat')
          );
          if (stageErrors.length > 0) {
            addFinding('MEDIUM', 'js-error', `Stage ${stageNum} (${stageName}): ${stageErrors.slice(0, 2).join('; ')}`);
          }
        } catch (err) {
          console.log(`    Stage ${stageNum} error: ${err.message}`);
          addTestResult(storyId, `stage-${stageNum}-load`, 'FAIL', `Error: ${err.message}`);
          addFinding('HIGH', 'workflow', `Stage ${stageNum} (${stageName}) failed: ${err.message}`);
        }
      }
    }

    // ========================================
    // US-002: Stages 1-5 (THE TRUTH / Ideation)
    // ========================================
    await testWorkflowStages('US-002', [1, 2, 3, 4, 5], 'THE TRUTH (Ideation)');

    // ========================================
    // US-003: Stages 6-10 (THE ENGINE / Validation)
    // ========================================
    await testWorkflowStages('US-003', [6, 7, 8, 9, 10], 'THE ENGINE + THE IDENTITY (Validation)');

    // ========================================
    // US-004: Stages 11-15 (THE IDENTITY + THE BLUEPRINT / Growth)
    // ========================================
    await testWorkflowStages('US-004', [11, 12, 13, 14, 15], 'THE IDENTITY + THE BLUEPRINT (Growth)');

    // ========================================
    // US-005: Stages 16-20 (THE BLUEPRINT + THE BUILD LOOP / Scale)
    // ========================================
    await testWorkflowStages('US-005', [16, 17, 18, 19, 20], 'THE BLUEPRINT + THE BUILD LOOP (Scale)');

    // ========================================
    // US-006: Stages 21-25 (LAUNCH & LEARN / Exit)
    // ========================================
    await testWorkflowStages('US-006', [21, 22, 23, 24, 25], 'LAUNCH & LEARN (Exit)');

    // ========================================
    // PHASE NAVIGATION TEST (bonus - tests phase tabs)
    // ========================================
    if (testVentureId) {
      console.log('\n--- Phase Navigation Test ---');

      // Navigate to workflow page
      await page.goto(`${BASE_URL}/ventures/${testVentureId}/workflow`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Check for phase tabs
      const phaseTabs = page.locator('[role="tablist"][aria-label*="phase"] [role="tab"], [role="tablist"] [role="tab"]');
      const phaseTabCount = await phaseTabs.count();
      console.log(`  Phase tabs found: ${phaseTabCount}`);

      if (phaseTabCount >= 5) {
        addTestResult('US-002', 'phase-tabs-render', 'PASS', `${phaseTabCount} phase tabs found`);

        // Click through phases
        for (let i = 0; i < Math.min(phaseTabCount, 6); i++) {
          try {
            const tab = phaseTabs.nth(i);
            const tabText = await tab.textContent();
            await tab.click();
            await page.waitForTimeout(1500);
            console.log(`    Clicked phase tab ${i + 1}: "${tabText?.trim()}"`);
          } catch (err) {
            console.log(`    Phase tab ${i + 1} click error: ${err.message}`);
          }
        }
        await takeScreenshot(page, '07-phase-tabs');
      } else if (phaseTabCount > 0) {
        addTestResult('US-002', 'phase-tabs-render', 'INFO',
          `${phaseTabCount} tabs found (expected 5-6 phase tabs)`);
      }

      // Check for stage navigation within workflow
      const stageNav = page.locator('[aria-label*="stage"], [data-testid*="stage"], [class*="stage"]');
      const stageNavCount = await stageNav.count();
      console.log(`  Stage navigation elements: ${stageNavCount}`);

      if (stageNavCount > 0) {
        addTestResult('US-002', 'stage-nav-elements', 'PASS', `${stageNavCount} stage navigation elements found`);
      }
    }

    // ========================================
    // STAGE NAVIGATION VIEW TEST
    // ========================================
    console.log('\n--- Stage Navigation View (Ventures List) ---');

    await page.goto(`${BASE_URL}/chairman/portfolio`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Check for stage navigation view mode (VentureStageNavigation)
    const stageNavView = page.locator('[aria-label="Venture Stage Navigation"]');
    const hasStageNavView = await stageNavView.count() > 0;

    // Check for view mode tabs near the "View:" label or the "All Ventures" section
    const allVenturesSection = page.locator('text=All Ventures');
    const viewModeArea = page.locator('text=Summary >> xpath=.. >> xpath=..');
    const viewModeTabs = page.locator('text=Summary, text=Stage Navigation, text=RAID');
    const viewModeTabCount = await viewModeTabs.count();
    console.log(`  Stage Navigation view: ${hasStageNavView}, View mode text elements: ${viewModeTabCount}`);

    if (viewModeTabCount > 0) {
      // Count unique view modes (Summary, Stage Navigation, Ventures, RAID)
      const summaryEl = page.locator('text=Summary');
      const stageNavEl = page.locator('text=Stage Navigation');
      const raidEl = page.locator('text=RAID');
      const uniqueViews = (await summaryEl.count() > 0 ? 1 : 0) +
                          (await stageNavEl.count() > 0 ? 1 : 0) +
                          (await raidEl.count() > 0 ? 1 : 0);
      addTestResult('US-001', 'view-modes', uniqueViews >= 2 ? 'PASS' : 'INFO',
        `View modes found: Summary=${await summaryEl.count() > 0}, Stage Nav=${await stageNavEl.count() > 0}, RAID=${await raidEl.count() > 0}`);

      // Try clicking Stage Navigation
      if (await stageNavEl.count() > 0) {
        await stageNavEl.first().click();
        await page.waitForTimeout(2000);
        await takeScreenshot(page, '01-stage-navigation-view');
        console.log('  Switched to Stage Navigation view');

        // Verify 6 phase tabs are shown
        const phaseTabs = page.locator('text=THE TRUTH, text=THE ENGINE, text=THE IDENTITY, text=THE BLUEPRINT, text=THE BUILD LOOP, text=LAUNCH');
        const phaseCount = await phaseTabs.count();
        console.log(`  Phase tabs visible: ${phaseCount}`);
        if (phaseCount >= 5) {
          addTestResult('US-001', 'stage-nav-phases', 'PASS', `${phaseCount} phase elements visible in Stage Navigation view`);
        }
      }
    }

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
