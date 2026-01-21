#!/usr/bin/env node

/**
 * LEO Protocol v4.2 - PRD to Playwright Test Generator
 * Re-export wrapper for backward compatibility
 *
 * The implementation has been modularized into:
 * - modules/prd-playwright/prd-fetcher.js
 * - modules/prd-playwright/scenario-generator.js
 * - modules/prd-playwright/test-file-generator.js
 * - modules/prd-playwright/page-object-generator.js
 * - modules/prd-playwright/fixture-generator.js
 * - modules/prd-playwright/documentation-generator.js
 * - modules/prd-playwright/index.js
 */

export { default, PRDPlaywrightGenerator } from './modules/prd-playwright/index.js';
export * from './modules/prd-playwright/index.js';
