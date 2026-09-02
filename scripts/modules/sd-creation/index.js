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

// SD-LEO-FIX-CLIENT-FACTORY-FALLBACK-001: the `supabase` re-export named the removed
// default export of ./supabase-client.js -- that default export is gone (see the file
// for why: a caller of the default export could silently receive an anon-permissioned
// client under a name implying service-role access). Line 13's `export *` already
// re-exports getSupabaseClient and createSupabaseClient by name; no replacement needed.
