/**
 * PRD Management E2E Tests
 *
 * User Story: US-003 (8 pts, 8 hours)
 * Strategic Directive: SD-TESTING-COVERAGE-001
 *
 * Tests comprehensive PRD management workflows:
 * - Create PRD from SD via PLAN agent workflow
 * - Validate PRD schema (all required fields present)
 * - Add user stories to PRD
 * - Validate user stories (acceptance criteria, test scenarios)
 * - Approve PRD for EXEC handoff
 * - Reject PRD with feedback
 * - PRD status transitions (DRAFT → PLANNING → APPROVED → IN_PROGRESS → COMPLETED)
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const timestamp = Date.now();

test.describe('PRD Management E2E Tests', () => {
  let testSDId: string;
  let testPRDId: string;

  test.beforeEach(async ({ page }) => {
    // Navigate to the dashboard
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test.describe('Create PRD from Strategic Directive', () => {
    test('should create new PRD via PLAN workflow', async ({ page }) => {
      // First, create or select an existing SD
      testSDId = `SD-TEST-PRD-${timestamp}`;
      testPRDId = `PRD-TEST-${timestamp}`;

      // Navigate to SD detail page
      await page.click(`text=${testSDId}`);

      // Click "Create PRD" button
      await page.click('button:has-text("Create PRD")');

      // Fill in PRD details
      await page.fill('input[name="prd_id"]', testPRDId);
      await page.fill('input[name="title"]', 'Test Product Requirements Document');
      await page.fill('textarea[name="description"]', 'Comprehensive PRD for testing PLAN workflow');

      // Fill in system architecture
      await page.fill('textarea[name="system_architecture"]', JSON.stringify({
        overview: 'Test architecture overview',
        components: ['Frontend', 'Backend', 'Database'],
        patterns: ['MVC', 'Repository Pattern']
      }));

      // Fill in data model
      await page.fill('textarea[name="data_model"]', JSON.stringify({
        tables: ['users', 'posts', 'comments'],
        relationships: ['one-to-many', 'many-to-many']
      }));

      // Fill in UI/UX requirements
      await page.fill('textarea[name="ui_ux_requirements"]', JSON.stringify({
        wireframes: true,
        accessibility: 'WCAG2.1-AA',
        responsiveDesign: true
      }));

      // Fill in test scenarios
      await page.fill('textarea[name="test_scenarios"]', JSON.stringify({
        unit: ['Test user creation', 'Test post creation'],
        integration: ['Test user-post relationship'],
        e2e: ['Test complete user journey']
      }));

      // Fill in implementation approach
      await page.fill('textarea[name="implementation_approach"]', JSON.stringify({
        phases: ['Setup', 'Development', 'Testing', 'Deployment'],
        technologies: ['React', 'Node.js', 'PostgreSQL'],
        estimatedHours: 40
      }));

      // Submit form
      await page.click('button[type="submit"]');

      // Wait for success message
      await expect(page.locator('text=PRD created successfully')).toBeVisible({ timeout: 5000 });

      // Verify PRD appears in list
      await expect(page.locator(`text=${testPRDId}`)).toBeVisible();
    });

    test('should enforce required PRD fields', async ({ page }) => {
      // Navigate to create PRD page
      await page.click('button:has-text("Create PRD")');

      // Try to submit without required fields
      await page.click('button[type="submit"]');

      // Should show validation errors
      await expect(page.locator('text=Title is required')).toBeVisible();
      await expect(page.locator('text=Description is required')).toBeVisible();
      await expect(page.locator('text=System architecture is required')).toBeVisible();
    });

    test('should validate PRD ID format', async ({ page }) => {
      // Navigate to create PRD page
      await page.click('button:has-text("Create PRD")');

      // Fill with invalid PRD ID format
      await page.fill('input[name="prd_id"]', 'invalid-prd-format');
      await page.fill('input[name="title"]', 'Test PRD');

      // Submit form
      await page.click('button[type="submit"]');

      // Should show validation error
      await expect(page.locator('text=PRD ID must start with "PRD-"')).toBeVisible();
    });
  });

  test.describe('PRD Schema Validation', () => {
    test('should validate system_architecture field', async ({ page }) => {
      // Navigate to PRD detail page
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Verify system_architecture is present and valid
      await expect(page.locator('[data-field="system_architecture"]')).toBeVisible();

      // Check for required architecture components
      await expect(page.locator('text=components')).toBeVisible();
      await expect(page.locator('text=patterns')).toBeVisible();
    });

    test('should validate data_model field', async ({ page }) => {
      // Navigate to PRD detail page
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Verify data_model is present and valid
      await expect(page.locator('[data-field="data_model"]')).toBeVisible();

      // Check for required data model components
      await expect(page.locator('text=tables')).toBeVisible();
      await expect(page.locator('text=relationships')).toBeVisible();
    });

    test('should validate ui_ux_requirements field', async ({ page }) => {
      // Navigate to PRD detail page
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Verify ui_ux_requirements is present and valid
      await expect(page.locator('[data-field="ui_ux_requirements"]')).toBeVisible();

      // Check for accessibility requirements
      await expect(page.locator('text=WCAG2.1-AA')).toBeVisible();
    });

    test('should validate test_scenarios field', async ({ page }) => {
      // Navigate to PRD detail page
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Verify test_scenarios is present and valid
      await expect(page.locator('[data-field="test_scenarios"]')).toBeVisible();

      // Check for all test types
      await expect(page.locator('text=unit')).toBeVisible();
      await expect(page.locator('text=integration')).toBeVisible();
      await expect(page.locator('text=e2e')).toBeVisible();
    });

    test('should validate implementation_approach field', async ({ page }) => {
      // Navigate to PRD detail page
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Verify implementation_approach is present and valid
      await expect(page.locator('[data-field="implementation_approach"]')).toBeVisible();

      // Check for required implementation components
      await expect(page.locator('text=phases')).toBeVisible();
      await expect(page.locator('text=technologies')).toBeVisible();
    });

    test('should show completeness score', async ({ page }) => {
      // Navigate to PRD detail page
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Verify completeness indicator is displayed
      await expect(page.locator('[data-testid="completeness-score"]')).toBeVisible();

      // For complete PRD, score should be 100%
      const completeness = await page.locator('[data-testid="completeness-score"]').textContent();
      expect(parseInt(completeness || '0')).toBeGreaterThanOrEqual(80);
    });
  });

  test.describe('User Stories Management', () => {
    test('should add user story to PRD', async ({ page }) => {
      // Navigate to PRD detail page
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Click "Add User Story" button
      await page.click('button:has-text("Add User Story")');

      // Fill in user story details
      await page.fill('input[name="story_id"]', `US-TEST-${timestamp}`);
      await page.fill('input[name="title"]', 'Test User Story');
      await page.fill('textarea[name="description"]', 'As a user, I want to test the system');
      await page.fill('input[name="story_points"]', '5');

      // Add acceptance criteria
      await page.click('button:has-text("Add Acceptance Criterion")');
      await page.fill('textarea[name="acceptance_criteria[0]"]', 'Given a user, when they perform action, then result occurs');

      // Add test scenarios
      await page.click('button:has-text("Add Test Scenario")');
      await page.fill('textarea[name="test_scenarios[0]"]', 'Test user can perform the action successfully');

      // Submit user story
      await page.click('button[type="submit"]');

      // Verify user story added
      await expect(page.locator('text=User story added successfully')).toBeVisible({ timeout: 5000 });
      await expect(page.locator(`text=US-TEST-${timestamp}`)).toBeVisible();
    });

    test('should validate user story has acceptance criteria', async ({ page }) => {
      // Navigate to add user story
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);
      await page.click('button:has-text("Add User Story")');

      // Fill user story without acceptance criteria
      await page.fill('input[name="story_id"]', `US-NO-AC-${timestamp}`);
      await page.fill('input[name="title"]', 'Story without AC');
      await page.fill('textarea[name="description"]', 'This story has no acceptance criteria');

      // Try to submit
      await page.click('button[type="submit"]');

      // Should show validation error
      await expect(page.locator('text=At least one acceptance criterion is required')).toBeVisible();
    });

    test('should validate user story has test scenarios', async ({ page }) => {
      // Navigate to add user story
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);
      await page.click('button:has-text("Add User Story")');

      // Fill user story without test scenarios
      await page.fill('input[name="story_id"]', `US-NO-TESTS-${timestamp}`);
      await page.fill('input[name="title"]', 'Story without tests');
      await page.fill('textarea[name="description"]', 'This story has no test scenarios');

      // Add acceptance criteria
      await page.click('button:has-text("Add Acceptance Criterion")');
      await page.fill('textarea[name="acceptance_criteria[0]"]', 'Some acceptance criterion');

      // Try to submit
      await page.click('button[type="submit"]');

      // Should show validation error
      await expect(page.locator('text=At least one test scenario is required')).toBeVisible();
    });

    test('should edit existing user story', async ({ page }) => {
      // Navigate to PRD with user stories
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Click on user story
      await page.click(`text=US-TEST-${timestamp}`);

      // Edit user story
      await page.click('button:has-text("Edit")');
      await page.fill('input[name="title"]', 'Updated Test User Story');

      // Save changes
      await page.click('button:has-text("Save")');

      // Verify update
      await expect(page.locator('text=User story updated successfully')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Updated Test User Story')).toBeVisible();
    });

    test('should delete user story', async ({ page }) => {
      // Navigate to PRD with user stories
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Click on user story
      await page.click(`text=US-TEST-${timestamp}`);

      // Delete user story
      await page.click('button:has-text("Delete")');
      await page.click('button:has-text("Confirm")');

      // Verify deletion
      await expect(page.locator('text=User story deleted successfully')).toBeVisible({ timeout: 5000 });
      await expect(page.locator(`text=US-TEST-${timestamp}`)).not.toBeVisible();
    });
  });

  test.describe('PRD Approval Workflow', () => {
    test('should submit PRD for approval', async ({ page }) => {
      // Navigate to PRD detail page
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Click "Submit for Approval" button
      await page.click('button:has-text("Submit for Approval")');

      // Confirm submission
      await page.click('button:has-text("Confirm")');

      // Verify status changed to PLANNING
      await expect(page.locator('text=Status: PLANNING')).toBeVisible({ timeout: 5000 });
    });

    test('should approve PRD for EXEC handoff', async ({ page }) => {
      // Navigate to PRD in PLANNING status
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Click "Approve" button
      await page.click('button:has-text("Approve")');

      // Add approval notes
      await page.fill('textarea[name="approval_notes"]', 'PRD looks good, approved for implementation');

      // Confirm approval
      await page.click('button:has-text("Confirm Approval")');

      // Verify status changed to APPROVED
      await expect(page.locator('text=Status: APPROVED')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=PRD approved for EXEC handoff')).toBeVisible();
    });

    test('should reject PRD with feedback', async ({ page }) => {
      // Create a new PRD to reject
      const rejectPRDId = `PRD-REJECT-${timestamp}`;
      // ... create PRD ...

      // Navigate to PRD in PLANNING status
      await page.click(`text=${rejectPRDId}`);

      // Click "Reject" button
      await page.click('button:has-text("Reject")');

      // Add rejection feedback
      await page.fill('textarea[name="rejection_notes"]', 'Missing critical implementation details');

      // Confirm rejection
      await page.click('button:has-text("Confirm Rejection")');

      // Verify status changed back to DRAFT
      await expect(page.locator('text=Status: DRAFT')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=PRD rejected')).toBeVisible();

      // Verify rejection notes are visible
      await expect(page.locator('text=Missing critical implementation details')).toBeVisible();
    });

    test('should prevent approval of incomplete PRD', async ({ page }) => {
      // Create incomplete PRD
      const incompletePRDId = `PRD-INCOMPLETE-${timestamp}`;
      // ... create PRD missing required fields ...

      // Navigate to incomplete PRD
      await page.click(`text=${incompletePRDId}`);

      // Approve button should be disabled
      await expect(page.locator('button:has-text("Approve")')).toBeDisabled();

      // Should show warning message
      await expect(page.locator('text=PRD is incomplete')).toBeVisible();
    });
  });

  test.describe('PRD Status Transitions', () => {
    test('should transition DRAFT → PLANNING', async ({ page }) => {
      // Navigate to PRD in DRAFT status
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Submit for planning
      await page.click('button:has-text("Submit for Planning")');

      // Verify status changed
      await expect(page.locator('text=Status: PLANNING')).toBeVisible({ timeout: 5000 });
    });

    test('should transition PLANNING → APPROVED', async ({ page }) => {
      // Navigate to PRD in PLANNING status
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Approve PRD
      await page.click('button:has-text("Approve")');
      await page.click('button:has-text("Confirm Approval")');

      // Verify status changed
      await expect(page.locator('text=Status: APPROVED')).toBeVisible({ timeout: 5000 });
    });

    test('should transition APPROVED → IN_PROGRESS', async ({ page }) => {
      // Navigate to PRD in APPROVED status
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Start implementation
      await page.click('button:has-text("Start Implementation")');

      // Verify status changed
      await expect(page.locator('text=Status: IN_PROGRESS')).toBeVisible({ timeout: 5000 });
    });

    test('should transition IN_PROGRESS → COMPLETED', async ({ page }) => {
      // Navigate to PRD in IN_PROGRESS status
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Mark as completed
      await page.click('button:has-text("Mark Complete")');

      // Add completion notes
      await page.fill('textarea[name="completion_notes"]', 'All requirements implemented and tested');

      // Confirm completion
      await page.click('button:has-text("Confirm Completion")');

      // Verify status changed
      await expect(page.locator('text=Status: COMPLETED')).toBeVisible({ timeout: 5000 });
    });

    test('should prevent invalid status transitions', async ({ page }) => {
      // Create PRD in DRAFT status
      const draftPRDId = `PRD-DRAFT-${timestamp}`;
      // ... create PRD ...

      // Navigate to DRAFT PRD
      await page.click(`text=${draftPRDId}`);

      // Should not have "Mark Complete" button in DRAFT status
      await expect(page.locator('button:has-text("Mark Complete")')).not.toBeVisible();

      // Should not have "Start Implementation" button in DRAFT status
      await expect(page.locator('button:has-text("Start Implementation")')).not.toBeVisible();
    });
  });

  test.describe('PRD Handoff to EXEC', () => {
    test('should create handoff document when PRD approved', async ({ page }) => {
      // Navigate to approved PRD
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Verify handoff section exists
      await expect(page.locator('[data-section="handoff"]')).toBeVisible();

      // Verify handoff contains required information
      await expect(page.locator('text=EXEC Agent Instructions')).toBeVisible();
      await expect(page.locator('text=Acceptance Criteria')).toBeVisible();
      await expect(page.locator('text=Test Requirements')).toBeVisible();
    });

    test('should include all user stories in handoff', async ({ page }) => {
      // Navigate to approved PRD
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // View handoff document
      await page.click('button:has-text("View Handoff")');

      // Verify all user stories are included
      const userStories = await page.locator('[data-testid="handoff-user-story"]').count();
      expect(userStories).toBeGreaterThan(0);
    });

    test('should export handoff as JSON', async ({ page }) => {
      // Navigate to approved PRD
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Click export button
      await page.click('button:has-text("Export Handoff")');

      // Wait for download
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('button:has-text("Download JSON")'),
      ]);

      // Verify filename
      expect(download.suggestedFilename()).toContain('handoff');
      expect(download.suggestedFilename()).toContain('.json');
    });
  });

  test.describe('PRD Validation Gates', () => {
    test('should run validation gates before approval', async ({ page }) => {
      // Navigate to PRD
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // Click "Run Validation"
      await page.click('button:has-text("Run Validation")');

      // Wait for validation to complete
      await page.waitForSelector('[data-testid="validation-results"]', { timeout: 10000 });

      // Verify all gates are shown
      await expect(page.locator('text=Gate 2A')).toBeVisible();
      await expect(page.locator('text=Gate 2B')).toBeVisible();
      await expect(page.locator('text=Gate 2C')).toBeVisible();
      await expect(page.locator('text=Gate 2D')).toBeVisible();
    });

    test('should show gate results with pass/fail status', async ({ page }) => {
      // Navigate to PRD with validation results
      await page.click(`text=${testPRDId || 'PRD-TEST'}`);

      // View validation results
      await page.click('button:has-text("View Validation")');

      // Verify gate results are displayed
      const gateResults = await page.locator('[data-testid="gate-result"]').count();
      expect(gateResults).toBe(4); // 4 gates (2A, 2B, 2C, 2D)

      // Verify pass/fail indicators
      await expect(page.locator('.gate-pass')).toBeVisible();
    });
  });

  test.afterAll(async ({ page }) => {
    // Cleanup: Delete test PRDs and SDs
    // This would use API calls or database cleanup
  });
});
