/**
 * EHG App Pre-Launch Smoke Tests
 *
 * Uses the venture-smoke template to validate the EHG application
 * meets minimum quality standards before launch.
 *
 * Run: npx playwright test tests/e2e/smoke/ehg-smoke.spec.ts
 */

import { createVentureSmokeTests } from '../templates/venture-smoke.template';
import { EHG_SMOKE_CONFIG } from '../templates/smoke-config';

// Create smoke tests for EHG App
createVentureSmokeTests(EHG_SMOKE_CONFIG);
