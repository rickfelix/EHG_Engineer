/**
 * Unit Tests: Protocol Improvement System
 *
 * This file is a thin wrapper that re-exports all tests from the
 * protocol-improvements/ subdirectory for backwards compatibility.
 *
 * Test Coverage:
 * - ImprovementExtractor: Extract improvements from retrospectives
 * - ImprovementApplicator: Apply improvements to database tables
 * - EffectivenessTracker: Track improvement effectiveness over time
 *
 * Individual test files:
 * - tests/unit/protocol-improvements/improvement-extractor.test.js
 * - tests/unit/protocol-improvements/improvement-applicator.test.js
 * - tests/unit/protocol-improvements/effectiveness-tracker.test.js
 *
 * Shared setup and mocks:
 * - tests/unit/protocol-improvements/setup.js
 */

// Import all test modules from the subdirectory
import './protocol-improvements/index.test.js';
