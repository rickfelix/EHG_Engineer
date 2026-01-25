#!/usr/bin/env node

/**
 * Enhanced Testing & Debugging Sub-Agents with Pareto Optimizations
 *
 * Purpose: Implements structured handoffs, self-healing selectors, and actionable fixes.
 *
 * This file is a re-export wrapper for backward compatibility.
 * The implementation has been refactored into domain modules:
 *
 * - enhanced-testing-debugging/test-handoff.js - Structured handoff protocol
 * - enhanced-testing-debugging/testing-sub-agent.js - Self-healing selectors and testing
 * - enhanced-testing-debugging/debugging-sub-agent.js - Actionable fixes and diagnosis
 * - enhanced-testing-debugging/collaboration-coordinator.js - Real-time collaboration
 * - enhanced-testing-debugging/index.js - Main re-export module
 *
 * @module enhanced-testing-debugging-agents
 * @see SD-LEO-REFAC-TEST-DEBUG-004
 */

// Re-export everything from the modular implementation
export {
  TestHandoff,
  EnhancedTestingSubAgent,
  EnhancedDebuggingSubAgent,
  TestCollaborationCoordinator
} from './enhanced-testing-debugging/index.js';

// Default export for backward compatibility
export { default } from './enhanced-testing-debugging/index.js';
