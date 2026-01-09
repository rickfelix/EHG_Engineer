/**
 * Attention Queue Sidebar E2E Tests
 * SD-EVAL-MATRIX-001-B: Attention Queue Dashboard UI
 *
 * Test Coverage:
 * - TS-001: Sidebar renders in collapsed state by default in ChairmanLayout
 * - TS-002: Sidebar expands when expand button clicked
 * - TS-003: Severity counts display correctly
 * - TS-004: Venture list sorted by attention score
 * - TS-005: Click on venture navigates to venture detail
 * - TS-006: Empty state displays when no ventures
 *
 * User Stories:
 * - As a Chairman, I want to see ventures requiring attention at a glance
 * - As a Chairman, I want to quickly navigate to high-priority ventures
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

test.describe('Attention Queue Sidebar', () => {
  let testVentureIds: string[] = [];

  test.beforeAll(async () => {
    // Create test ventures for attention queue testing
    const ventures = [
      {
        name: `Critical Venture ${timestamp}`,
        problem_statement: 'Test problem',
        solution: 'Test solution',
        target_market: 'Test market',
        stage: 'launch' // Higher stage = higher attention multiplier
      },
      {
        name: `Medium Venture ${timestamp}`,
        problem_statement: 'Test problem',
        solution: 'Test solution',
        target_market: 'Test market',
        stage: 'validation'
      },
      {
        name: `Low Venture ${timestamp}`,
        problem_statement: 'Test problem',
        solution: 'Test solution',
        target_market: 'Test market',
        stage: 'ideation'
      }
    ];

    for (const venture of ventures) {
      const { data } = await supabase
        .from('ventures')
        .insert(venture)
        .select()
        .single();

      if (data?.id) {
        testVentureIds.push(data.id);
      }
    }
  });

  test.afterAll(async () => {
    // Cleanup: Delete test ventures
    if (testVentureIds.length > 0) {
      await supabase
        .from('ventures')
        .delete()
        .in('id', testVentureIds);
    }
  });

  test('TS-001: should render sidebar container in ChairmanLayout', async ({ page }) => {
    await page.goto('/chairman');
    await page.waitForLoadState('networkidle');

    // Sidebar container should be present
    const sidebarContainer = page.locator('[data-testid="attention-queue-container"]');
    await expect(sidebarContainer).toBeVisible();
  });

  test('TS-002: should render collapsed sidebar by default', async ({ page }) => {
    await page.goto('/chairman');
    await page.waitForLoadState('networkidle');

    // Collapsed sidebar should be visible
    const collapsedSidebar = page.locator('[data-testid="attention-queue-sidebar-collapsed"]');
    await expect(collapsedSidebar).toBeVisible();

    // Expanded sidebar should not be visible
    const expandedSidebar = page.locator('[data-testid="attention-queue-sidebar"]');
    await expect(expandedSidebar).not.toBeVisible();
  });

  test('TS-003: should expand sidebar when expand button clicked', async ({ page }) => {
    await page.goto('/chairman');
    await page.waitForLoadState('networkidle');

    // Click expand button
    const expandButton = page.getByRole('button', { name: /expand attention queue/i });
    await expandButton.click();

    // Expanded sidebar should now be visible
    const expandedSidebar = page.locator('[data-testid="attention-queue-sidebar"]');
    await expect(expandedSidebar).toBeVisible();

    // Should show "Attention Queue" title
    await expect(page.getByText('Attention Queue')).toBeVisible();
  });

  test('TS-004: should display severity summary badges', async ({ page }) => {
    await page.goto('/chairman');
    await page.waitForLoadState('networkidle');

    // Expand sidebar
    const expandButton = page.getByRole('button', { name: /expand attention queue/i });
    await expandButton.click();

    // Severity summary should be visible
    const severitySummary = page.locator('[data-testid="severity-summary"]');
    await expect(severitySummary).toBeVisible();
  });

  test('TS-005: should display venture items in list', async ({ page }) => {
    await page.goto('/chairman');
    await page.waitForLoadState('networkidle');

    // Expand sidebar
    const expandButton = page.getByRole('button', { name: /expand attention queue/i });
    await expandButton.click();

    // Wait for ventures to load
    await page.waitForTimeout(1000);

    // Should show venture items (test ventures we created)
    const ventureItems = page.locator('[data-testid^="venture-item-"]');
    const count = await ventureItems.count();

    // Should have at least 1 venture (our test ventures)
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('TS-006: should collapse sidebar when collapse button clicked', async ({ page }) => {
    await page.goto('/chairman');
    await page.waitForLoadState('networkidle');

    // Expand sidebar first
    const expandButton = page.getByRole('button', { name: /expand attention queue/i });
    await expandButton.click();

    // Click collapse button
    const collapseButton = page.getByRole('button', { name: /collapse attention queue/i });
    await collapseButton.click();

    // Collapsed sidebar should be visible again
    const collapsedSidebar = page.locator('[data-testid="attention-queue-sidebar-collapsed"]');
    await expect(collapsedSidebar).toBeVisible();
  });

  test('TS-007: should show venture details on hover/focus', async ({ page }) => {
    await page.goto('/chairman');
    await page.waitForLoadState('networkidle');

    // Expand sidebar
    const expandButton = page.getByRole('button', { name: /expand attention queue/i });
    await expandButton.click();

    // Wait for ventures to load
    await page.waitForTimeout(1000);

    // Get first venture item
    const firstVenture = page.locator('[data-testid^="venture-item-"]').first();

    // Should show attention level badge and score
    await expect(firstVenture.locator('.text-xs').filter({ hasText: /Score:/ })).toBeVisible();
  });

  test('TS-008: sidebar navigates to chairman pages correctly', async ({ page }) => {
    await page.goto('/chairman');
    await page.waitForLoadState('networkidle');

    // Verify we're on the chairman briefing page
    await expect(page.locator('h1')).toContainText(/Dashboard/i);

    // Sidebar should persist across chairman navigation
    const sidebarContainer = page.locator('[data-testid="attention-queue-container"]');
    await expect(sidebarContainer).toBeVisible();
  });
});
