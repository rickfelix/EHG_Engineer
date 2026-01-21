/**
 * Protocol Improvements Test Suite - Index
 *
 * This file imports and runs all protocol improvement tests as a single suite.
 * Each test module can also be run independently.
 *
 * Test Modules:
 * - improvement-extractor.test.js: Extract improvements from retrospectives
 * - improvement-applicator.test.js: Apply improvements to database tables
 * - effectiveness-tracker.test.js: Track improvement effectiveness over time
 */

// Import all test modules to run them as a complete suite
import './improvement-extractor.test.js';
import './improvement-applicator.test.js';
import './effectiveness-tracker.test.js';
