/**
 * TESTING Sub-Agent (QA Engineering Director v3.1 - Modular Architecture)
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: Mission-Critical Testing Automation - Comprehensive E2E validation
 * Code: TESTING
 * Priority: 5
 *
 * Philosophy: "Do it right, not fast." E2E testing is MANDATORY, not optional.
 *
 * REFACTORED: v3.1 (2026-01-23)
 * This file now re-exports from modular structure for maintainability.
 * See lib/sub-agents/testing/ directory for implementation:
 *   - index.js - Main orchestrator (~550 LOC)
 *   - phases/phase1-preflight.js - Pre-flight checks
 *   - phases/phase2-generation.js - Test case generation
 *   - phases/phase3-execution.js - E2E test execution
 *   - phases/phase4-evidence.js - Evidence collection
 *   - phases/phase5-verdict.js - Verdict generation
 *   - utils/troubleshooting.js - Troubleshooting tactics
 *
 * SD: SD-LEO-REFAC-TESTING-INFRA-001
 *
 * Original: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 * Updated: 2025-11-15 (SD-LEO-PROTOCOL-V4-4-0: Adaptive validation support)
 * Updated: 2025-11-21 (v3.0: Phase 1 Intelligence Module - SD-FOUND-DATA-003)
 * Refactored: 2026-01-23 (v3.1: Modular architecture - SD-LEO-REFAC-TESTING-INFRA-001)
 */

// Re-export from modular structure
export { execute } from './testing/index.js';
