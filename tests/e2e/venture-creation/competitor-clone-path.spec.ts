/**
 * Competitor Clone Path E2E Tests
 *
 * User Story: SD-STAGE1-ENTRY-UX-001:US-003 (8 SP)
 * Title: Competitor Cloning Path
 * Strategic Directive: SD-STAGE1-ENTRY-UX-001
 *
 * As a Chairman, I want to select Competitor-Based Cloning so that the
 * system can analyze an existing company and generate a differentiated
 * venture idea.
 *
 * Test Coverage:
 * - AC-1: Navigate from Path Selection to Competitor Analysis form
 * - AC-2: Form displays competitor input field
 * - AC-3: Analyze button triggers analysis with loading state
 * - AC-4: Successful analysis displays AI-generated venture idea
 * - AC-5: Generated idea fields are editable
 * - AC-6: Create venture saves with cloned data
 * - AC-7: Failed analysis shows error with retry option
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const timestamp = Date.now();

test.describe('US-003: Competitor Cloning Path', () => {
  let createdVentureIds: string[] = [];

  test.afterAll(async () => {
    // Cleanup created test ventures
    for (const id of createdVentureIds) {
      await supabase.from('ventures').delete().eq('id', id);
    }
  });

  test.beforeEach(async ({ page }) => {
    // Navigate to Competitor Clone form via Path Selection
    await page.goto('/ventures');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="create-venture-btn"]').click();
    await page.locator('[data-testid="path-card-competitor-clone"]').click();
    await page.locator('[data-testid="path-selector-proceed-btn"]').click();
  });

  test('AC-1: should navigate to Competitor Analysis form when path selected', async ({ page }) => {
    // Verify we're on the Competitor Analysis form
    const formContainer = page.locator('[data-testid="competitor-clone-form"]');
    await expect(formContainer).toBeVisible();

    // Verify URL indicates competitor clone path
    await expect(page).toHaveURL(/\/ventures\/competitor-clone|\/ventures\/new\?path=competitor/);
  });

  test('AC-2: should display competitor input field', async ({ page }) => {
    // Verify competitor name/URL input field
    const competitorInput = page.locator('[data-testid="competitor-url-input"]');
    await expect(competitorInput).toBeVisible();

    // Verify helpful label/placeholder
    const label = page.locator('label[for="competitor-url"]');
    await expect(label).toContainText(/company.*name|url|competitor/i);

    // Verify placeholder provides guidance
    const placeholder = await competitorInput.getAttribute('placeholder');
    expect(placeholder).toMatch(/enter.*company|example\.com|https?:\/\//i);
  });

  test('AC-3: should show loading state during competitor analysis', async ({ page }) => {
    // Enter competitor URL
    const competitorInput = page.locator('[data-testid="competitor-url-input"]');
    await competitorInput.fill('https://stripe.com');

    // Click Analyze button
    const analyzeButton = page.locator('[data-testid="analyze-competitor-btn"]');
    await analyzeButton.click();

    // Verify loading state visible
    const loadingIndicator = page.locator('[data-testid="analysis-loading"]');
    await expect(loadingIndicator).toBeVisible();

    // Verify analyze button disabled during analysis
    await expect(analyzeButton).toBeDisabled();

    // Verify progress message shown
    const progressMessage = page.locator('[data-testid="analysis-progress-message"]');
    await expect(progressMessage).toContainText(/analyzing|processing|loading/i);
  });

  test('AC-4: should display AI-generated venture idea after successful analysis', async ({ page }) => {
    // Mock successful API response
    await page.route('**/api/competitor-analysis', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          venture: {
            name: 'AI-Generated Fintech Venture',
            problem_statement: 'High transaction fees for small businesses',
            solution: 'Low-cost payment processing with AI fraud detection',
            target_market: 'Small and medium businesses',
            differentiation_points: [
              'Lower fees than Stripe',
              'AI-powered fraud prevention',
              'Instant settlements'
            ],
            competitor_reference: 'https://stripe.com'
          }
        })
      });
    });

    // Enter competitor and analyze
    await page.locator('[data-testid="competitor-url-input"]').fill('https://stripe.com');
    await page.locator('[data-testid="analyze-competitor-btn"]').click();

    // Wait for results
    await page.waitForSelector('[data-testid="analysis-results"]', { timeout: 10000 });

    // Verify generated venture idea displayed
    const resultsContainer = page.locator('[data-testid="analysis-results"]');
    await expect(resultsContainer).toBeVisible();

    // Verify key fields populated
    const nameField = page.locator('[data-testid="generated-name"]');
    await expect(nameField).toHaveValue(/AI-Generated|Fintech/i);

    const problemField = page.locator('[data-testid="generated-problem"]');
    await expect(problemField).toContainText(/transaction|fees|cost/i);

    // Verify differentiation points shown
    const diffPoints = page.locator('[data-testid="differentiation-points"]');
    await expect(diffPoints).toBeVisible();
  });

  test('AC-5: should allow editing generated idea fields', async ({ page }) => {
    // Mock API response
    await page.route('**/api/competitor-analysis', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          venture: {
            name: 'Original Generated Name',
            problem_statement: 'Original problem',
            solution: 'Original solution',
            target_market: 'Original market',
            differentiation_points: ['Point 1']
          }
        })
      });
    });

    // Trigger analysis
    await page.locator('[data-testid="competitor-url-input"]').fill('https://example.com');
    await page.locator('[data-testid="analyze-competitor-btn"]').click();
    await page.waitForSelector('[data-testid="analysis-results"]');

    // Edit the generated name
    const nameField = page.locator('[data-testid="generated-name"]');
    await nameField.clear();
    await nameField.fill('My Custom Venture Name');

    // Verify edit persisted
    await expect(nameField).toHaveValue('My Custom Venture Name');

    // Edit problem statement
    const problemField = page.locator('[data-testid="generated-problem"]');
    await problemField.clear();
    await problemField.fill('My custom problem statement');
    await expect(problemField).toHaveValue('My custom problem statement');
  });

  test('AC-6: should create venture with cloned data on confirmation', async ({ page }) => {
    const ventureName = `Cloned Venture ${timestamp}`;

    // Mock API response
    await page.route('**/api/competitor-analysis', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          venture: {
            name: ventureName,
            problem_statement: 'Cloned problem statement',
            solution: 'Cloned solution',
            target_market: 'Cloned market',
            differentiation_points: ['Unique differentiator']
          }
        })
      });
    });

    // Trigger analysis
    await page.locator('[data-testid="competitor-url-input"]').fill('https://stripe.com');
    await page.locator('[data-testid="analyze-competitor-btn"]').click();
    await page.waitForSelector('[data-testid="analysis-results"]');

    // Click Create Venture
    const createButton = page.locator('[data-testid="create-cloned-venture-btn"]');
    await createButton.click();

    // Wait for success
    await page.waitForURL(/\/ventures\/[a-zA-Z0-9-]+|\/ventures.*success/);

    // Verify database record
    const { data: venture } = await supabase
      .from('ventures')
      .select('*')
      .eq('name', ventureName)
      .single();

    expect(venture).toBeTruthy();
    expect(venture.stage).toBe(1);
    expect(venture.origin_type).toBe('competitor_clone');
    expect(venture.competitor_ref).toContain('stripe.com');

    if (venture) createdVentureIds.push(venture.id);
  });

  test('AC-7: should show error with retry option on failed analysis', async ({ page }) => {
    // Mock failed API response
    await page.route('**/api/competitor-analysis', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Unable to analyze competitor website'
        })
      });
    });

    // Trigger analysis
    await page.locator('[data-testid="competitor-url-input"]').fill('https://nonexistent-company.com');
    await page.locator('[data-testid="analyze-competitor-btn"]').click();

    // Wait for error to appear
    await page.waitForSelector('[data-testid="analysis-error"]');

    // Verify error message displayed
    const errorMessage = page.locator('[data-testid="analysis-error"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/error|unable|failed/i);

    // Verify retry button available
    const retryButton = page.locator('[data-testid="retry-analysis-btn"]');
    await expect(retryButton).toBeVisible();

    // Verify back button available
    const backButton = page.locator('[data-testid="back-to-path-selection-btn"]');
    await expect(backButton).toBeVisible();
  });

  test('should validate competitor URL format', async ({ page }) => {
    // Enter invalid URL
    await page.locator('[data-testid="competitor-url-input"]').fill('not-a-valid-url');
    await page.locator('[data-testid="analyze-competitor-btn"]').click();

    // Verify validation error
    const urlError = page.locator('[data-testid="error-competitor-url"]');
    await expect(urlError).toBeVisible();
    await expect(urlError).toContainText(/valid.*url|invalid/i);
  });

  test('should preserve competitor input on retry', async ({ page }) => {
    const competitorUrl = 'https://example-competitor.com';

    // Mock first call to fail
    let callCount = 0;
    await page.route('**/api/competitor-analysis', async (route) => {
      callCount++;
      if (callCount === 1) {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({ success: false, error: 'Temporary error' })
        });
      } else {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            success: true,
            venture: { name: 'Retry Success', problem_statement: 'P', solution: 'S', target_market: 'M' }
          })
        });
      }
    });

    // First attempt
    await page.locator('[data-testid="competitor-url-input"]').fill(competitorUrl);
    await page.locator('[data-testid="analyze-competitor-btn"]').click();
    await page.waitForSelector('[data-testid="analysis-error"]');

    // Verify URL still present
    await expect(page.locator('[data-testid="competitor-url-input"]')).toHaveValue(competitorUrl);

    // Retry
    await page.locator('[data-testid="retry-analysis-btn"]').click();

    // Should succeed on retry
    await page.waitForSelector('[data-testid="analysis-results"]');
  });
});

/**
 * Required data-testid Attributes for Component Implementation:
 *
 * Form Container:
 * 1. competitor-clone-form - Main form container
 *
 * Input Fields:
 * 2. competitor-url-input - Competitor company name/URL input
 *
 * Action Buttons:
 * 3. analyze-competitor-btn - Trigger competitor analysis
 * 4. create-cloned-venture-btn - Create venture from generated idea
 * 5. retry-analysis-btn - Retry failed analysis
 * 6. back-to-path-selection-btn - Return to path selection
 *
 * Loading States:
 * 7. analysis-loading - Loading spinner during analysis
 * 8. analysis-progress-message - Progress/status message during analysis
 *
 * Results Display:
 * 9. analysis-results - Container for analysis results
 * 10. generated-name - Editable name field in results
 * 11. generated-problem - Editable problem statement in results
 * 12. generated-solution - Editable solution in results
 * 13. generated-market - Editable target market in results
 * 14. differentiation-points - List of differentiation points
 *
 * Error States:
 * 15. analysis-error - Error message container
 * 16. error-competitor-url - URL validation error
 */
