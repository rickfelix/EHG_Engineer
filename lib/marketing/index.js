/**
 * Marketing Engine - Module Index
 * SD-EVA-FEAT-MARKETING-FOUNDATION-001
 *
 * Central exports for the marketing subsystem.
 */

export { generateContent, transitionContentState } from './content-generator.js';
export { publish, getSupportedPlatforms } from './publisher/index.js';
export { generateUTMParams, buildUTMQueryString, appendUTMToUrl } from './utm.js';
export { checkBudget, recordSpend, getBudgetSummary, resetDailySpend } from './budget-governor.js';
export { createQueues, createWorkers, addJob, getQueueHealth, shutdown, getQueueConfigs } from './queues/index.js';
