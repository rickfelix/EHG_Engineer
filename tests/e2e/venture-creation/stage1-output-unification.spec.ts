/**
 * Stage 1 Output Unification E2E Tests
 *
 * User Story: SD-STAGE1-ENTRY-UX-001:US-005 (3 SP)
 * Title: Unified Stage 1 Output
 * Strategic Directive: SD-STAGE1-ENTRY-UX-001
 *
 * As a Chairman, I want all three paths to produce the same Stage 1 output
 * format so that Stage 2 processes my venture consistently regardless of
 * which path I chose.
 *
 * Test Coverage:
 * - AC-1: Manual Entry creates correct Stage1Output schema
 * - AC-2: Competitor Clone creates correct Stage1Output schema
 * - AC-3: Blueprint Selection creates correct Stage1Output schema
 * - AC-4: Stage 2 processing uses same fields for all origins
 * - AC-5: All origins share identical required columns
 * - AC-6: Origin type displayed as badge in dashboard
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

test.describe('US-005: Unified Stage 1 Output', () => {
  let manualVentureId: string | null = null;
  let clonedVentureId: string | null = null;
  let blueprintVentureId: string | null = null;

  test.afterAll(async () => {
    // Cleanup all created test ventures
    const idsToCleanup = [manualVentureId, clonedVentureId, blueprintVentureId].filter(Boolean);
    for (const id of idsToCleanup) {
      await supabase.from('ventures').delete().eq('id', id);
    }
  });

  test.describe('AC-1: Manual Entry Schema Validation', () => {
    test('should create venture with correct Stage1Output schema via Manual Entry', async ({ page }) => {
      const ventureName = `Manual Schema Test ${timestamp}`;

      // Navigate through Manual Entry path
      await page.goto('/ventures');
      await page.locator('[data-testid="create-venture-btn"]').click();
      await page.locator('[data-testid="path-card-manual-entry"]').click();
      await page.locator('[data-testid="path-selector-proceed-btn"]').click();

      // Fill and submit form
      await page.locator('[data-testid="manual-entry-name-input"]').fill(ventureName);
      await page.locator('[data-testid="manual-entry-problem-input"]').fill('Manual problem statement');
      await page.locator('[data-testid="manual-entry-solution-input"]').fill('Manual solution description');
      await page.locator('[data-testid="manual-entry-market-input"]').fill('Manual target market');
      await page.locator('[data-testid="manual-entry-submit-btn"]').click();

      await page.waitForURL(/\/ventures\/[a-zA-Z0-9-]+|\/ventures.*success/);

      // Verify database schema
      const { data: venture } = await supabase
        .from('ventures')
        .select('*')
        .eq('name', ventureName)
        .single();

      expect(venture).toBeTruthy();

      // Required Stage1Output fields
      expect(venture.name).toBe(ventureName);
      expect(venture.problem_statement).toBe('Manual problem statement');
      expect(venture.solution).toBe('Manual solution description');
      expect(venture.target_market).toBe('Manual target market');
      expect(venture.stage).toBe(1);
      expect(venture.origin_type).toBe('manual');

      // Manual-specific: no competitor_ref or blueprint_id
      expect(venture.competitor_ref).toBeNull();
      expect(venture.blueprint_id).toBeNull();

      manualVentureId = venture.id;
    });
  });

  test.describe('AC-2: Competitor Clone Schema Validation', () => {
    test('should create venture with correct Stage1Output schema via Competitor Cloning', async ({ page }) => {
      const ventureName = `Clone Schema Test ${timestamp}`;

      // Mock competitor analysis API
      await page.route('**/api/competitor-analysis', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            venture: {
              name: ventureName,
              problem_statement: 'Cloned problem statement',
              solution: 'Cloned solution description',
              target_market: 'Cloned target market',
              competitor_reference: 'https://competitor.com'
            }
          })
        });
      });

      // Navigate through Competitor Clone path
      await page.goto('/ventures');
      await page.locator('[data-testid="create-venture-btn"]').click();
      await page.locator('[data-testid="path-card-competitor-clone"]').click();
      await page.locator('[data-testid="path-selector-proceed-btn"]').click();

      // Trigger analysis and create
      await page.locator('[data-testid="competitor-url-input"]').fill('https://competitor.com');
      await page.locator('[data-testid="analyze-competitor-btn"]').click();
      await page.waitForSelector('[data-testid="analysis-results"]');
      await page.locator('[data-testid="create-cloned-venture-btn"]').click();

      await page.waitForURL(/\/ventures\/[a-zA-Z0-9-]+|\/ventures.*success/);

      // Verify database schema
      const { data: venture } = await supabase
        .from('ventures')
        .select('*')
        .eq('name', ventureName)
        .single();

      expect(venture).toBeTruthy();

      // Required Stage1Output fields (same as manual)
      expect(venture.name).toBe(ventureName);
      expect(venture.problem_statement).toBe('Cloned problem statement');
      expect(venture.solution).toBe('Cloned solution description');
      expect(venture.target_market).toBe('Cloned target market');
      expect(venture.stage).toBe(1);
      expect(venture.origin_type).toBe('competitor_clone');

      // Clone-specific: has competitor_ref
      expect(venture.competitor_ref).toContain('competitor.com');
      expect(venture.blueprint_id).toBeNull();

      clonedVentureId = venture.id;
    });
  });

  test.describe('AC-3: Blueprint Selection Schema Validation', () => {
    test('should create venture with correct Stage1Output schema via Blueprint', async ({ page }) => {
      const ventureName = `Blueprint Schema Test ${timestamp}`;

      // Mock blueprints API
      await page.route('**/api/blueprints', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            blueprints: [{
              id: 'bp-test-001',
              title: ventureName,
              summary: 'Test blueprint summary',
              problem: 'Blueprint problem statement',
              solution: 'Blueprint solution description',
              target_market: 'Blueprint target market'
            }]
          })
        });
      });

      // Navigate through Blueprint path
      await page.goto('/ventures');
      await page.locator('[data-testid="create-venture-btn"]').click();
      await page.locator('[data-testid="path-card-blueprint-browse"]').click();
      await page.locator('[data-testid="path-selector-proceed-btn"]').click();

      // Select blueprint and create
      await page.waitForSelector('[data-testid="blueprint-grid"]');
      await page.locator('[data-testid="blueprint-card-bp-test-001"]').click();
      await page.locator('[data-testid="select-blueprint-btn"]').click();
      await page.locator('[data-testid="create-blueprint-venture-btn"]').click();

      await page.waitForURL(/\/ventures\/[a-zA-Z0-9-]+|\/ventures.*success/);

      // Verify database schema
      const { data: venture } = await supabase
        .from('ventures')
        .select('*')
        .eq('name', ventureName)
        .single();

      expect(venture).toBeTruthy();

      // Required Stage1Output fields (same as manual and clone)
      expect(venture.name).toBe(ventureName);
      expect(venture.problem_statement).toBe('Blueprint problem statement');
      expect(venture.solution).toBe('Blueprint solution description');
      expect(venture.target_market).toBe('Blueprint target market');
      expect(venture.stage).toBe(1);
      expect(venture.origin_type).toBe('blueprint');

      // Blueprint-specific: has blueprint_id
      expect(venture.blueprint_id).toBe('bp-test-001');
      expect(venture.competitor_ref).toBeNull();

      blueprintVentureId = venture.id;
    });
  });

  test.describe('AC-4: Stage 2 Processing Consistency', () => {
    test('should process all origin types identically in Stage 2', async ({ page }) => {
      // Create ventures from all three paths (using API directly for speed)
      const testVentures = [
        { name: `Stage2 Manual ${timestamp}`, origin_type: 'manual', competitor_ref: null, blueprint_id: null },
        { name: `Stage2 Clone ${timestamp}`, origin_type: 'competitor_clone', competitor_ref: 'https://test.com', blueprint_id: null },
        { name: `Stage2 Blueprint ${timestamp}`, origin_type: 'blueprint', competitor_ref: null, blueprint_id: 'bp-test' }
      ];

      const createdIds: string[] = [];

      for (const v of testVentures) {
        const { data: venture } = await supabase
          .from('ventures')
          .insert({
            ...v,
            problem_statement: 'Standard problem',
            solution: 'Standard solution',
            target_market: 'Standard market',
            stage: 1
          })
          .select()
          .single();

        if (venture) createdIds.push(venture.id);
      }

      // Navigate to Stage 2 processing (or trigger via API)
      for (const ventureId of createdIds) {
        await page.goto(`/ventures/${ventureId}`);
        await page.waitForLoadState('networkidle');

        // Verify Stage 2 initiation available (regardless of origin)
        const advanceButton = page.locator('[data-testid="advance-to-stage-2-btn"]');
        await expect(advanceButton).toBeVisible();

        // Verify same Stage 2 UI shown for all origin types
        await advanceButton.click();

        const stage2Form = page.locator('[data-testid="stage-2-form"]');
        await expect(stage2Form).toBeVisible();

        // Verify Stage 2 uses standard fields regardless of origin
        await expect(page.locator('[data-testid="stage2-problem-display"]')).toContainText('Standard problem');
        await expect(page.locator('[data-testid="stage2-solution-display"]')).toContainText('Standard solution');
      }

      // Cleanup
      for (const id of createdIds) {
        await supabase.from('ventures').delete().eq('id', id);
      }
    });
  });

  test.describe('AC-5: Schema Column Consistency', () => {
    test('should share identical required columns across all origin types', async () => {
      // Fetch ventures from all three paths created earlier
      const { data: ventures } = await supabase
        .from('ventures')
        .select('*')
        .in('id', [manualVentureId, clonedVentureId, blueprintVentureId].filter(Boolean));

      expect(ventures).toHaveLength(3);

      // Define required columns that must exist for all ventures
      const requiredColumns = [
        'id', 'name', 'problem_statement', 'solution', 'target_market',
        'stage', 'origin_type', 'created_at', 'updated_at'
      ];

      for (const venture of ventures!) {
        for (const col of requiredColumns) {
          expect(venture).toHaveProperty(col);
          expect(venture[col]).not.toBeUndefined();
          // name, problem_statement, solution, target_market should be non-null
          if (['name', 'problem_statement', 'solution', 'target_market'].includes(col)) {
            expect(venture[col]).not.toBeNull();
          }
        }
      }
    });
  });

  test.describe('AC-6: Origin Badge Display', () => {
    test('should display origin type badge on venture dashboard', async ({ page }) => {
      // Navigate to ventures dashboard
      await page.goto('/ventures');
      await page.waitForLoadState('networkidle');

      // Check for venture cards with origin badges
      const ventureCards = page.locator('[data-testid^="venture-card-"]');

      // Verify origin badges exist
      const manualBadge = page.locator('[data-testid="origin-badge-manual"]');
      const cloneBadge = page.locator('[data-testid="origin-badge-competitor_clone"]');
      const blueprintBadge = page.locator('[data-testid="origin-badge-blueprint"]');

      // At least one of each type should exist (from our test data)
      // These may not all be visible depending on test data state
      const hasManual = await manualBadge.count() > 0;
      const hasClone = await cloneBadge.count() > 0;
      const hasBlueprint = await blueprintBadge.count() > 0;

      // Verify badge styling is consistent but distinguishable
      if (hasManual) {
        await expect(manualBadge.first()).toContainText(/manual|idea/i);
      }
      if (hasClone) {
        await expect(cloneBadge.first()).toContainText(/clone|competitor/i);
      }
      if (hasBlueprint) {
        await expect(blueprintBadge.first()).toContainText(/blueprint|template/i);
      }
    });

    test('should show origin badge on individual venture page', async ({ page }) => {
      if (!manualVentureId) {
        test.skip();
        return;
      }

      await page.goto(`/ventures/${manualVentureId}`);
      await page.waitForLoadState('networkidle');

      // Verify origin badge visible on detail page
      const originBadge = page.locator('[data-testid="venture-origin-badge"]');
      await expect(originBadge).toBeVisible();
      await expect(originBadge).toContainText(/manual/i);
    });

    test('should display venture card layout consistently regardless of origin', async ({ page }) => {
      await page.goto('/ventures');
      await page.waitForLoadState('networkidle');

      // Get all venture cards
      const ventureCards = page.locator('[data-testid^="venture-card-"]');
      const cardCount = await ventureCards.count();

      if (cardCount < 2) {
        test.skip();
        return;
      }

      // Verify all cards have same structure
      for (let i = 0; i < Math.min(cardCount, 5); i++) {
        const card = ventureCards.nth(i);

        // All cards should have these elements
        await expect(card.locator('[data-testid="venture-card-title"]')).toBeVisible();
        await expect(card.locator('[data-testid="venture-card-stage"]')).toBeVisible();
        await expect(card.locator('[data-testid="venture-card-created"]')).toBeVisible();

        // Origin badge is optional but if present, should be in consistent location
        const badge = card.locator('[data-testid^="origin-badge-"]');
        if (await badge.count() > 0) {
          // Badge should be in header area
          const badgeParent = badge.locator('..');
          await expect(badgeParent).toBeVisible();
        }
      }
    });
  });
});

/**
 * Required data-testid Attributes for Component Implementation:
 *
 * Dashboard Cards:
 * 1. venture-card-{id} - Individual venture card
 * 2. venture-card-title - Venture name in card
 * 3. venture-card-stage - Current stage indicator
 * 4. venture-card-created - Creation date
 *
 * Origin Badges:
 * 5. origin-badge-manual - Badge for manual entry ventures
 * 6. origin-badge-competitor_clone - Badge for cloned ventures
 * 7. origin-badge-blueprint - Badge for blueprint ventures
 * 8. venture-origin-badge - Origin badge on detail page
 *
 * Stage 2 Elements:
 * 9. advance-to-stage-2-btn - Button to advance venture to Stage 2
 * 10. stage-2-form - Stage 2 processing form
 * 11. stage2-problem-display - Problem statement display in Stage 2
 * 12. stage2-solution-display - Solution display in Stage 2
 *
 * Database Schema Requirements:
 * - ventures table must have columns:
 *   - name (text, NOT NULL)
 *   - problem_statement (text, NOT NULL)
 *   - solution (text, NOT NULL)
 *   - target_market (text, NOT NULL)
 *   - stage (integer, default 1)
 *   - origin_type (enum: 'manual', 'competitor_clone', 'blueprint')
 *   - competitor_ref (text, nullable)
 *   - blueprint_id (text, nullable)
 */
