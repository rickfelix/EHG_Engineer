/**
 * Placeholder Replacement Accessibility Tests E2E
 * SD-E2E-UAT-COVERAGE-001B - User Story US-001
 *
 * Tests accessibility compliance for form placeholders:
 *   1. Proper label associations (not just placeholders)
 *   2. WCAG 2.1 AA contrast requirements
 *   3. Focus state indication
 *   4. Screen reader compatibility via ARIA attributes
 *
 * Uses @axe-core/playwright for automated accessibility scanning
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

test.describe('Placeholder Replacement Accessibility Tests E2E', () => {
  test.describe.configure({ mode: 'serial' });

  // ============================================================
  // VENTURE CREATION FORM ACCESSIBILITY
  // ============================================================

  test.describe('Venture Creation Form', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}/ventures/new`);
      await page.waitForLoadState('networkidle');
    });

    test('should have proper label-input associations', async ({ page }) => {
      // Check that inputs have associated labels (not just placeholders)
      const inputs = page.locator('input:not([type="hidden"]), textarea, select').all().first();

      for (const input of inputs) {
        const id = await input.getAttribute('id');
        const ariaLabel = await input.getAttribute('aria-label');
        const ariaLabelledBy = await input.getAttribute('aria-labelledby');

        // Each input should have either:
        // 1. An associated <label for="id">
        // 2. An aria-label attribute
        // 3. An aria-labelledby attribute

        if (id) {
          const label = await page.locator(`label[for="${id}"]`).count();
          const hasLabel = label > 0 || ariaLabel || ariaLabelledBy;

          expect(hasLabel, `Input with id="${id}" should have an associated label`).toBeTruthy();
        } else {
          // Inputs without id should have aria-label or aria-labelledby
          expect(
            ariaLabel || ariaLabelledBy,
            'Input without id should have aria-label or aria-labelledby'
          ).toBeTruthy();
        }
      }
    });

    test('should pass axe-core accessibility audit', async ({ page }) => {
      const accessibilityResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      // Filter for form-related violations
      const formViolations = accessibilityResults.violations.filter(v =>
        v.tags.includes('wcag2a') || v.tags.includes('wcag2aa')
      );

      // Log violations for debugging
      if (formViolations.length > 0) {
        console.log('Accessibility violations found:');
        formViolations.forEach(v => {
          console.log(`  - ${v.id}: ${v.description}`);
          v.nodes.forEach(n => console.log(`    ${n.html}`));
        });
      }

      // Assert no critical or serious violations
      const criticalViolations = formViolations.filter(v =>
        v.impact === 'critical' || v.impact === 'serious'
      );

      expect(criticalViolations.length).toBe(0);
    });

    test('should have visible focus indicators on form fields', async ({ page }) => {
      const inputs = page.locator('input:not([type="hidden"]), textarea, select').all().first();

      for (const input of inputs) {
        // Focus the input
        await input.focus();

        // Check that focus is visible (outline or other visual indicator)
        const focusVisible = await input.evaluate((el) => {
          const styles = window.getComputedStyle(el);
          const outline = styles.outline;
          const boxShadow = styles.boxShadow;
          const borderColor = styles.borderColor;

          // Focus should have visible outline, box-shadow, or different border
          return outline !== 'none' ||
                 boxShadow !== 'none' ||
                 borderColor !== 'rgb(0, 0, 0)'; // Default border color
        });

        expect(focusVisible, 'Input should have visible focus indicator').toBeTruthy();
      }
    });
  });

  // ============================================================
  // ARTIFACT UPLOAD FORM ACCESSIBILITY
  // ============================================================

  test.describe('Artifact Upload Form', () => {
    test('should have accessible file input', async ({ page }) => {
      // Navigate to a venture detail page with artifact upload
      await page.goto(`${BASE_URL}/ventures`);
      await page.waitForLoadState('networkidle');

      // Check if there's a venture to click on
      const ventureCard = page.locator('[data-testid="venture-card"]').first();
      if (await ventureCard.isVisible()) {
        await ventureCard.click();
        await page.waitForLoadState('networkidle');

        // Look for file upload input
        const fileInput = page.locator('input[type="file"]');
        if (await fileInput.count() > 0) {
          const ariaLabel = await fileInput.getAttribute('aria-label');
          const label = await page.locator(`label[for="${await fileInput.getAttribute('id')}"]`).count();

          expect(ariaLabel || label > 0, 'File input should have label or aria-label').toBeTruthy();
        }
      }
    });
  });

  // ============================================================
  // SETTINGS FORM ACCESSIBILITY
  // ============================================================

  test.describe('Settings Page Forms', () => {
    test('should have accessible settings controls', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');

      // Run axe-core audit on settings page
      const accessibilityResults = await new AxeBuilder({ page })
        .include('form')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      // Check for form-related violations
      const criticalViolations = accessibilityResults.violations.filter(v =>
        v.impact === 'critical' || v.impact === 'serious'
      );

      expect(criticalViolations.length).toBe(0);
    });
  });

  // ============================================================
  // ARIA ATTRIBUTES VERIFICATION
  // ============================================================

  test.describe('ARIA Attributes', () => {
    test('should have proper aria-required on required fields', async ({ page }) => {
      await page.goto(`${BASE_URL}/ventures/new`);
      await page.waitForLoadState('networkidle');

      // Check required inputs have aria-required or required attribute
      const requiredInputs = page.locator('[required], [aria-required="true"]').all().first();

      // There should be at least some required fields in venture creation
      expect(requiredInputs.length).toBeGreaterThan(0);
    });

    test('should have aria-describedby for helper text', async ({ page }) => {
      await page.goto(`${BASE_URL}/ventures/new`);
      await page.waitForLoadState('networkidle');

      // Check for inputs with descriptions
      const inputsWithDescription = await page.locator('[aria-describedby]').all();

      for (const input of inputsWithDescription) {
        const describedById = await input.getAttribute('aria-describedby');
        if (describedById) {
          // Verify the referenced element exists
          const descriptionElement = await page.locator(`#${describedById}`).count();
          expect(descriptionElement).toBeGreaterThan(0);
        }
      }
    });
  });

  // ============================================================
  // CONTRAST RATIO CHECKS
  // ============================================================

  test.describe('Color Contrast', () => {
    test('should pass color contrast requirements', async ({ page }) => {
      await page.goto(`${BASE_URL}/ventures/new`);
      await page.waitForLoadState('networkidle');

      // Use axe-core specifically for color contrast
      const contrastResults = await new AxeBuilder({ page })
        .withRules(['color-contrast'])
        .analyze();

      // Log any contrast issues
      if (contrastResults.violations.length > 0) {
        console.log('Contrast violations:');
        contrastResults.violations.forEach(v => {
          v.nodes.forEach(n => {
            console.log(`  - ${n.html}`);
            console.log(`    ${n.failureSummary}`);
          });
        });
      }

      // Check no serious contrast violations
      const seriousViolations = contrastResults.violations.filter(v =>
        v.impact === 'serious' || v.impact === 'critical'
      );

      expect(seriousViolations.length).toBe(0);
    });
  });

  // ============================================================
  // KEYBOARD NAVIGATION
  // ============================================================

  test.describe('Keyboard Navigation', () => {
    test('should allow full form navigation via keyboard', async ({ page }) => {
      await page.goto(`${BASE_URL}/ventures/new`);
      await page.waitForLoadState('networkidle');

      // Tab through all form elements
      const inputs = page.locator('input:not([type="hidden"]), textarea, select, button').all().first();

      for (let i = 0; i < Math.min(inputs.length, 10); i++) {
        await page.keyboard.press('Tab');

        // Verify an interactive element is focused
        const focusedElement = page.locator(':focus').first();
        const tagName = await focusedElement.evaluate(el => el.tagName.toLowerCase());

        expect(['input', 'textarea', 'select', 'button', 'a']).toContain(tagName);
      }
    });

    test('should support Enter key for form submission', async ({ page }) => {
      await page.goto(`${BASE_URL}/ventures/new`);
      await page.waitForLoadState('networkidle');

      // Focus on the first input
      const firstInput = page.locator('input').first();
      if (await firstInput.isVisible()) {
        await firstInput.focus();

        // Press Enter should either submit or move to next field (depending on form type)
        await page.keyboard.press('Enter');

        // Form should still be functional (not crashed)
        await expect(page).not.toHaveURL(/error/);
      }
    });
  });
});
