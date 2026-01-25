/**
 * Enhanced Testing & Debugging Sub-Agents
 * Part of SD-LEO-REFAC-TEST-DEBUG-004
 *
 * Main re-export module for backward compatibility.
 * Implements structured handoffs, self-healing selectors, and actionable fixes.
 *
 * Domain modules:
 * - test-handoff.js - Structured handoff protocol interface
 * - testing-sub-agent.js - Enhanced testing with self-healing selectors
 * - debugging-sub-agent.js - Debugging with actionable fixes
 * - collaboration-coordinator.js - Real-time collaboration coordinator
 *
 * Usage:
 *   import { EnhancedTestingSubAgent, EnhancedDebuggingSubAgent } from './enhanced-testing-debugging/index.js';
 *
 * @module enhanced-testing-debugging
 * @see SD-LEO-REFAC-TEST-DEBUG-004
 */

// Test handoff protocol
export { TestHandoff } from './test-handoff.js';

// Testing sub-agent
export { EnhancedTestingSubAgent } from './testing-sub-agent.js';

// Debugging sub-agent
export { EnhancedDebuggingSubAgent } from './debugging-sub-agent.js';

// Collaboration coordinator
export { TestCollaborationCoordinator } from './collaboration-coordinator.js';

// Default export for backward compatibility
import { TestHandoff } from './test-handoff.js';
import { EnhancedTestingSubAgent } from './testing-sub-agent.js';
import { EnhancedDebuggingSubAgent } from './debugging-sub-agent.js';
import { TestCollaborationCoordinator } from './collaboration-coordinator.js';

export default {
  TestHandoff,
  EnhancedTestingSubAgent,
  EnhancedDebuggingSubAgent,
  TestCollaborationCoordinator
};
