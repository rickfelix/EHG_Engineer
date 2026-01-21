/**
 * UAT PRD Generation Module
 * Comprehensive PRD creation for automated UAT testing
 *
 * @module uat-prd
 */

export { authStories } from './auth-stories.js';
export { dashboardStories } from './dashboard-stories.js';
export { ventureStories } from './venture-stories.js';
export { formStories } from './form-stories.js';
export { performanceStories, accessibilityStories, errorStories } from './quality-stories.js';
export { generateUserStories, generatePRD } from './generate-prd.js';
