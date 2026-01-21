/**
 * SD Creation Module - Main Entry Point
 *
 * Shared utilities for creating Strategic Directive scripts.
 * Provides consistent patterns for:
 * - Supabase client initialization
 * - SD database operations (upsert, batch, query)
 * - Console logging and output formatting
 * - SD templates and validation
 */

// Re-export all modules
export * from './supabase-client.js';
export * from './sd-operations.js';
export * from './console-logger.js';
export * from './sd-templates.js';

// Named exports for convenience
export { default as supabase } from './supabase-client.js';
