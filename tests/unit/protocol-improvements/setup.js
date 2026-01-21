/**
 * Shared Setup and Mocks for Protocol Improvement Tests
 *
 * This file re-exports from modular mock files for backward compatibility.
 */

// Re-export fixtures and Supabase factories
export {
  sampleRetrospective,
  sampleImprovementQueue,
  expectedExtraction,
  createExtractorMockSupabase,
  createApplicatorMockSupabase,
  createTrackerMockSupabase
} from './mocks/fixtures.js';

// Re-export mock classes
export { ImprovementExtractor } from './mocks/improvement-extractor.js';
export { ImprovementApplicator } from './mocks/improvement-applicator.js';
export { EffectivenessTracker } from './mocks/effectiveness-tracker.js';
