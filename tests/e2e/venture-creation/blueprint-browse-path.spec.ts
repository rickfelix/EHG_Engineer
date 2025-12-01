/**
 * Blueprint Browse Path E2E Tests
 *
 * User Story: SD-STAGE1-ENTRY-UX-001:US-004 (8 SP)
 * Title: Blueprint Browse Path
 * Strategic Directive: SD-STAGE1-ENTRY-UX-001
 *
 * As a Chairman, I want to select Browse Blueprint Ideas so that I can
 * explore system-generated venture opportunities and choose one as my
 * starting point.
 *
 * Test Coverage:
 * - AC-1: Navigate from Path Selection to Blueprint Browser
 * - AC-2: Display grid/list of pre-generated blueprints
 * - AC-3: Click blueprint shows expanded details
 * - AC-4: Select button populates venture creation form
 * - AC-5: Customization before final creation
 * - AC-6: Create venture with blueprint origin tracked
 * - AC-7: Filter and search functionality
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

// Mock blueprint data for testing
const mockBlueprints = [
  {
    id: 'bp-001',
    title: 'FinTech Payment Solution',
    summary: 'Modern payment processing for small businesses',
    category: 'fintech',
    market: 'B2B',
    problem: 'High transaction fees hurt small business margins',
    solution: 'AI-optimized payment routing to minimize fees',
    differentiation: 'Real-time fee optimization'
  },
  {
    id: 'bp-002',
    title: 'HealthTech Telemedicine Platform',
    summary: 'Virtual healthcare for remote communities',
    category: 'healthtech',
    market: 'B2C',
    problem: 'Limited healthcare access in rural areas',
    solution: 'Video consultations with AI triage',
    differentiation: 'Offline-first with sync capability'
  },
  {
    id: 'bp-003',
    title: 'EdTech Adaptive Learning',
    summary: 'Personalized education through AI',
    category: 'edtech',
    market: 'B2C',
    problem: 'One-size-fits-all education fails many students',
    solution: 'AI tutoring that adapts to learning style',
    differentiation: 'Gamified learning paths'
  }
];

test.describe('US-004: Blueprint Browse Path', () => {
  let createdVentureIds: string[] = [];

  test.afterAll(async () => {
    // Cleanup created test ventures
    for (const id of createdVentureIds) {
      await supabase.from('ventures').delete().eq('id', id);
    }
  });

  test.beforeEach(async ({ page }) => {
    // Mock blueprints API
    await page.route('**/api/blueprints', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ blueprints: mockBlueprints })
      });
    });

    // Navigate to Blueprint Browser via Path Selection
    await page.goto('/ventures');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="create-venture-btn"]').click();
    await page.locator('[data-testid="path-card-blueprint-browse"]').click();
    await page.locator('[data-testid="path-selector-proceed-btn"]').click();
  });

  test('AC-1: should navigate to Blueprint Browser when path selected', async ({ page }) => {
    // Verify we're on the Blueprint Browser
    const browserContainer = page.locator('[data-testid="blueprint-browser"]');
    await expect(browserContainer).toBeVisible();

    // Verify URL indicates blueprint path
    await expect(page).toHaveURL(/\/ventures\/browse-blueprints|\/ventures\/new\?path=blueprint/);
  });

  test('AC-2: should display grid/list of pre-generated blueprints', async ({ page }) => {
    // Wait for blueprints to load
    await page.waitForSelector('[data-testid="blueprint-grid"]');

    // Verify grid container visible
    const blueprintGrid = page.locator('[data-testid="blueprint-grid"]');
    await expect(blueprintGrid).toBeVisible();

    // Verify blueprint cards rendered
    const blueprintCards = page.locator('[data-testid^="blueprint-card-"]');
    await expect(blueprintCards).toHaveCount(mockBlueprints.length);

    // Verify each card shows title and summary
    for (const blueprint of mockBlueprints) {
      const card = page.locator(`[data-testid="blueprint-card-${blueprint.id}"]`);
      await expect(card).toBeVisible();

      const title = card.locator('[data-testid="blueprint-card-title"]');
      await expect(title).toContainText(blueprint.title);

      const summary = card.locator('[data-testid="blueprint-card-summary"]');
      await expect(summary).toContainText(blueprint.summary);
    }
  });

  test('AC-3: should show expanded details when clicking blueprint card', async ({ page }) => {
    await page.waitForSelector('[data-testid="blueprint-grid"]');

    // Click on first blueprint card
    const firstCard = page.locator('[data-testid="blueprint-card-bp-001"]');
    await firstCard.click();

    // Verify detail panel/modal appears
    const detailPanel = page.locator('[data-testid="blueprint-detail-panel"]');
    await expect(detailPanel).toBeVisible();

    // Verify expanded details shown
    const problemSection = detailPanel.locator('[data-testid="blueprint-detail-problem"]');
    await expect(problemSection).toContainText('transaction fees');

    const solutionSection = detailPanel.locator('[data-testid="blueprint-detail-solution"]');
    await expect(solutionSection).toContainText('AI-optimized');

    const marketSection = detailPanel.locator('[data-testid="blueprint-detail-market"]');
    await expect(marketSection).toBeVisible();

    const differentiationSection = detailPanel.locator('[data-testid="blueprint-detail-differentiation"]');
    await expect(differentiationSection).toContainText('Real-time fee optimization');
  });

  test('AC-4: should populate venture form when Select Blueprint clicked', async ({ page }) => {
    await page.waitForSelector('[data-testid="blueprint-grid"]');

    // Click on blueprint card
    await page.locator('[data-testid="blueprint-card-bp-002"]').click();

    // Click Select This Blueprint button
    const selectButton = page.locator('[data-testid="select-blueprint-btn"]');
    await selectButton.click();

    // Verify venture creation form appears with pre-populated data
    const ventureForm = page.locator('[data-testid="blueprint-venture-form"]');
    await expect(ventureForm).toBeVisible();

    // Verify fields populated from blueprint
    const nameField = page.locator('[data-testid="blueprint-form-name"]');
    await expect(nameField).toHaveValue(/HealthTech|Telemedicine/i);

    const problemField = page.locator('[data-testid="blueprint-form-problem"]');
    await expect(problemField).toHaveValue(/healthcare access|rural/i);
  });

  test('AC-5: should allow customization before final creation', async ({ page }) => {
    await page.waitForSelector('[data-testid="blueprint-grid"]');

    // Select a blueprint
    await page.locator('[data-testid="blueprint-card-bp-001"]').click();
    await page.locator('[data-testid="select-blueprint-btn"]').click();

    // Edit the name
    const nameField = page.locator('[data-testid="blueprint-form-name"]');
    await nameField.clear();
    await nameField.fill('My Custom FinTech Venture');

    // Edit problem statement
    const problemField = page.locator('[data-testid="blueprint-form-problem"]');
    await problemField.clear();
    await problemField.fill('My customized problem statement');

    // Verify edits persisted
    await expect(nameField).toHaveValue('My Custom FinTech Venture');
    await expect(problemField).toHaveValue('My customized problem statement');
  });

  test('AC-6: should create venture with blueprint origin tracked', async ({ page }) => {
    const ventureName = `Blueprint Venture ${timestamp}`;

    await page.waitForSelector('[data-testid="blueprint-grid"]');

    // Select blueprint
    await page.locator('[data-testid="blueprint-card-bp-003"]').click();
    await page.locator('[data-testid="select-blueprint-btn"]').click();

    // Customize name
    const nameField = page.locator('[data-testid="blueprint-form-name"]');
    await nameField.clear();
    await nameField.fill(ventureName);

    // Create venture
    const createButton = page.locator('[data-testid="create-blueprint-venture-btn"]');
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
    expect(venture.origin_type).toBe('blueprint');
    expect(venture.blueprint_id).toBe('bp-003');

    if (venture) createdVentureIds.push(venture.id);
  });

  test('AC-7: should filter blueprints by category', async ({ page }) => {
    await page.waitForSelector('[data-testid="blueprint-grid"]');

    // Verify all blueprints initially visible
    let visibleCards = page.locator('[data-testid^="blueprint-card-"]');
    await expect(visibleCards).toHaveCount(3);

    // Click category filter for fintech
    const categoryFilter = page.locator('[data-testid="filter-category-fintech"]');
    await categoryFilter.click();

    // Verify only fintech blueprints visible
    visibleCards = page.locator('[data-testid^="blueprint-card-"]:visible');
    await expect(visibleCards).toHaveCount(1);
    await expect(page.locator('[data-testid="blueprint-card-bp-001"]')).toBeVisible();
  });

  test('AC-7: should filter blueprints by market', async ({ page }) => {
    await page.waitForSelector('[data-testid="blueprint-grid"]');

    // Click market filter for B2C
    const marketFilter = page.locator('[data-testid="filter-market-b2c"]');
    await marketFilter.click();

    // Verify only B2C blueprints visible
    const visibleCards = page.locator('[data-testid^="blueprint-card-"]:visible');
    await expect(visibleCards).toHaveCount(2); // healthtech and edtech are B2C
  });

  test('AC-7: should search blueprints by keyword', async ({ page }) => {
    await page.waitForSelector('[data-testid="blueprint-grid"]');

    // Enter search keyword
    const searchInput = page.locator('[data-testid="blueprint-search-input"]');
    await searchInput.fill('telemedicine');

    // Verify filtered results
    const visibleCards = page.locator('[data-testid^="blueprint-card-"]:visible');
    await expect(visibleCards).toHaveCount(1);
    await expect(page.locator('[data-testid="blueprint-card-bp-002"]')).toBeVisible();
  });

  test('should show empty state when no blueprints match filter', async ({ page }) => {
    await page.waitForSelector('[data-testid="blueprint-grid"]');

    // Search for non-existent term
    const searchInput = page.locator('[data-testid="blueprint-search-input"]');
    await searchInput.fill('cryptocurrency blockchain web3');

    // Verify empty state
    const emptyState = page.locator('[data-testid="blueprint-empty-state"]');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText(/no.*blueprints|no.*results|try.*different/i);

    // Verify clear filters button
    const clearButton = page.locator('[data-testid="clear-filters-btn"]');
    await expect(clearButton).toBeVisible();
  });

  test('should close detail panel and return to grid', async ({ page }) => {
    await page.waitForSelector('[data-testid="blueprint-grid"]');

    // Open detail panel
    await page.locator('[data-testid="blueprint-card-bp-001"]').click();
    await expect(page.locator('[data-testid="blueprint-detail-panel"]')).toBeVisible();

    // Close panel
    const closeButton = page.locator('[data-testid="close-detail-panel-btn"]');
    await closeButton.click();

    // Verify panel closed
    await expect(page.locator('[data-testid="blueprint-detail-panel"]')).not.toBeVisible();

    // Verify grid still visible
    await expect(page.locator('[data-testid="blueprint-grid"]')).toBeVisible();
  });
});

/**
 * Required data-testid Attributes for Component Implementation:
 *
 * Container:
 * 1. blueprint-browser - Main browser container
 * 2. blueprint-grid - Grid/list container for blueprint cards
 *
 * Blueprint Cards:
 * 3. blueprint-card-{id} - Individual blueprint card (dynamic ID)
 * 4. blueprint-card-title - Title within card
 * 5. blueprint-card-summary - Summary text within card
 * 6. blueprint-card-category - Category badge
 * 7. blueprint-card-market - Market indicator (B2B/B2C)
 *
 * Detail Panel:
 * 8. blueprint-detail-panel - Expanded detail view
 * 9. blueprint-detail-problem - Problem statement in detail
 * 10. blueprint-detail-solution - Solution description in detail
 * 11. blueprint-detail-market - Market information in detail
 * 12. blueprint-detail-differentiation - Differentiation points
 * 13. select-blueprint-btn - Button to select this blueprint
 * 14. close-detail-panel-btn - Close detail panel
 *
 * Venture Form (after selection):
 * 15. blueprint-venture-form - Form container after selection
 * 16. blueprint-form-name - Editable venture name
 * 17. blueprint-form-problem - Editable problem statement
 * 18. blueprint-form-solution - Editable solution
 * 19. blueprint-form-market - Editable target market
 * 20. create-blueprint-venture-btn - Create venture button
 *
 * Filters/Search:
 * 21. blueprint-search-input - Search input field
 * 22. filter-category-{category} - Category filter buttons
 * 23. filter-market-{market} - Market filter buttons (b2b, b2c)
 * 24. clear-filters-btn - Clear all filters
 *
 * Empty State:
 * 25. blueprint-empty-state - No results message
 */
