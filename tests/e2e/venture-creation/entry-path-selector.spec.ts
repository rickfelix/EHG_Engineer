/**
 * Entry Path Selector E2E Tests
 *
 * User Story: SD-STAGE1-ENTRY-UX-001:US-001 (3 SP)
 * Title: Path Selection Screen
 * Strategic Directive: SD-STAGE1-ENTRY-UX-001
 *
 * As a Chairman, I want to see a clean selection screen when I click
 * Create New Venture, so that I can choose my preferred approach to
 * starting a venture.
 *
 * Test Coverage:
 * - AC-1: Create New Venture button shows Path Selection screen
 * - AC-2: Manual Idea Entry option visible with icon and description
 * - AC-3: Competitor-Based Cloning option visible with icon and description
 * - AC-4: Browse Blueprint Ideas option visible with icon and description
 * - AC-5: No path selected initially, cannot proceed
 * - AC-6: Clicking path card highlights it as selected
 */

import { test, expect } from '@playwright/test';

test.describe('US-001: Path Selection Screen', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Ventures Dashboard
    await page.goto('/ventures');
    await page.waitForLoadState('networkidle');
  });

  test('AC-1: should display Path Selection screen when clicking Create New Venture', async ({ page }) => {
    // Selector: data-testid for Create New Venture button
    const createButton = page.locator('[data-testid="create-venture-btn"]');
    await createButton.click();

    // Verify Path Selection screen appears
    const pathSelector = page.locator('[data-testid="path-selector-screen"]');
    await expect(pathSelector).toBeVisible();

    // Verify heading
    const heading = page.locator('[data-testid="path-selector-heading"]');
    await expect(heading).toContainText(/choose.*path|select.*approach|how.*start/i);
  });

  test('AC-2: should display Manual Idea Entry option with icon and description', async ({ page }) => {
    await page.locator('[data-testid="create-venture-btn"]').click();

    // Selector: Manual Entry path card
    const manualCard = page.locator('[data-testid="path-card-manual-entry"]');
    await expect(manualCard).toBeVisible();

    // Verify icon present
    const icon = manualCard.locator('[data-testid="path-icon-manual"]');
    await expect(icon).toBeVisible();

    // Verify title
    const title = manualCard.locator('[data-testid="path-title-manual"]');
    await expect(title).toContainText(/manual.*entry|describe.*idea|own.*words/i);

    // Verify description
    const description = manualCard.locator('[data-testid="path-description-manual"]');
    await expect(description).toBeVisible();
  });

  test('AC-3: should display Competitor-Based Cloning option with icon and description', async ({ page }) => {
    await page.locator('[data-testid="create-venture-btn"]').click();

    // Selector: Competitor Cloning path card
    const cloneCard = page.locator('[data-testid="path-card-competitor-clone"]');
    await expect(cloneCard).toBeVisible();

    // Verify icon present
    const icon = cloneCard.locator('[data-testid="path-icon-clone"]');
    await expect(icon).toBeVisible();

    // Verify title
    const title = cloneCard.locator('[data-testid="path-title-clone"]');
    await expect(title).toContainText(/competitor|clone|analyze/i);

    // Verify description
    const description = cloneCard.locator('[data-testid="path-description-clone"]');
    await expect(description).toBeVisible();
  });

  test('AC-4: should display Browse Blueprint Ideas option with icon and description', async ({ page }) => {
    await page.locator('[data-testid="create-venture-btn"]').click();

    // Selector: Blueprint Browse path card
    const blueprintCard = page.locator('[data-testid="path-card-blueprint-browse"]');
    await expect(blueprintCard).toBeVisible();

    // Verify icon present
    const icon = blueprintCard.locator('[data-testid="path-icon-blueprint"]');
    await expect(icon).toBeVisible();

    // Verify title
    const title = blueprintCard.locator('[data-testid="path-title-blueprint"]');
    await expect(title).toContainText(/blueprint|browse|explore/i);

    // Verify description
    const description = blueprintCard.locator('[data-testid="path-description-blueprint"]');
    await expect(description).toBeVisible();
  });

  test('AC-5: should have no path selected initially and proceed button disabled', async ({ page }) => {
    await page.locator('[data-testid="create-venture-btn"]').click();

    // Verify no path is selected (no selected state class)
    const selectedPath = page.locator('[data-testid^="path-card-"][aria-selected="true"]');
    await expect(selectedPath).toHaveCount(0);

    // Verify proceed/continue button is disabled
    const proceedButton = page.locator('[data-testid="path-selector-proceed-btn"]');
    await expect(proceedButton).toBeDisabled();
  });

  test('AC-6: should highlight path card when clicked and enable proceed', async ({ page }) => {
    await page.locator('[data-testid="create-venture-btn"]').click();

    // Click Manual Entry path
    const manualCard = page.locator('[data-testid="path-card-manual-entry"]');
    await manualCard.click();

    // Verify selected state
    await expect(manualCard).toHaveAttribute('aria-selected', 'true');

    // Verify proceed button is now enabled
    const proceedButton = page.locator('[data-testid="path-selector-proceed-btn"]');
    await expect(proceedButton).toBeEnabled();
  });

  test('should allow changing selection between paths', async ({ page }) => {
    await page.locator('[data-testid="create-venture-btn"]').click();

    // Select Manual Entry
    const manualCard = page.locator('[data-testid="path-card-manual-entry"]');
    await manualCard.click();
    await expect(manualCard).toHaveAttribute('aria-selected', 'true');

    // Change to Blueprint Browse
    const blueprintCard = page.locator('[data-testid="path-card-blueprint-browse"]');
    await blueprintCard.click();

    // Verify Manual is deselected
    await expect(manualCard).toHaveAttribute('aria-selected', 'false');
    // Verify Blueprint is selected
    await expect(blueprintCard).toHaveAttribute('aria-selected', 'true');
  });

  test('should navigate to correct path when proceed clicked', async ({ page }) => {
    await page.locator('[data-testid="create-venture-btn"]').click();

    // Select Competitor Clone path
    const cloneCard = page.locator('[data-testid="path-card-competitor-clone"]');
    await cloneCard.click();

    // Click proceed
    const proceedButton = page.locator('[data-testid="path-selector-proceed-btn"]');
    await proceedButton.click();

    // Verify navigation to competitor clone page
    await expect(page).toHaveURL(/\/ventures\/competitor-clone|\/ventures\/new\?path=competitor/);
  });

  test('should be accessible with keyboard navigation', async ({ page }) => {
    await page.locator('[data-testid="create-venture-btn"]').click();

    // Tab to first path card
    await page.keyboard.press('Tab');

    // Get focused element
    const focusedCard = page.locator('[data-testid^="path-card-"]:focus');
    await expect(focusedCard).toBeVisible();

    // Press Enter to select
    await page.keyboard.press('Enter');

    // Verify selection
    const selectedPath = page.locator('[data-testid^="path-card-"][aria-selected="true"]');
    await expect(selectedPath).toHaveCount(1);
  });

  test('should display responsive layout on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.locator('[data-testid="create-venture-btn"]').click();

    // Verify all three cards are visible (stacked vertically on mobile)
    await expect(page.locator('[data-testid="path-card-manual-entry"]')).toBeVisible();
    await expect(page.locator('[data-testid="path-card-competitor-clone"]')).toBeVisible();
    await expect(page.locator('[data-testid="path-card-blueprint-browse"]')).toBeVisible();
  });
});

/**
 * Required data-testid Attributes for Component Implementation:
 *
 * 1. create-venture-btn - Main "Create New Venture" button on Ventures Dashboard
 * 2. path-selector-screen - Container for the path selection UI
 * 3. path-selector-heading - Heading text for the selection screen
 * 4. path-card-manual-entry - Card for Manual Idea Entry option
 * 5. path-card-competitor-clone - Card for Competitor Cloning option
 * 6. path-card-blueprint-browse - Card for Blueprint Browse option
 * 7. path-icon-manual - Icon element inside manual entry card
 * 8. path-icon-clone - Icon element inside competitor clone card
 * 9. path-icon-blueprint - Icon element inside blueprint browse card
 * 10. path-title-manual - Title text in manual entry card
 * 11. path-title-clone - Title text in competitor clone card
 * 12. path-title-blueprint - Title text in blueprint browse card
 * 13. path-description-manual - Description text in manual entry card
 * 14. path-description-clone - Description text in competitor clone card
 * 15. path-description-blueprint - Description text in blueprint browse card
 * 16. path-selector-proceed-btn - Button to proceed with selected path
 *
 * ARIA Attributes Required:
 * - aria-selected="true|false" on path cards for selection state
 * - role="button" on path cards for keyboard accessibility
 */
