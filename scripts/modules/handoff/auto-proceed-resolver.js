/**
 * AUTO-PROCEED Resolver for LEO Protocol Handoff System
 *
 * Resolves AUTO-PROCEED mode using deterministic precedence:
 * 1. CLI flags (--auto-proceed, --no-auto-proceed)
 * 2. Environment variable (AUTO_PROCEED=true|false|1|0|yes|no)
 * 3. Session store (claude_sessions.metadata.auto_proceed)
 * 4. Database default (false)
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-02
 *
 * @see docs/discovery/auto-proceed-enhancement-discovery.md for design decisions
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Resolution sources in precedence order
 */
export const RESOLUTION_SOURCES = {
  CLI: 'cli',
  ENV: 'env',
  SESSION: 'session',
  DATABASE: 'database',
  DEFAULT: 'default'
};

/**
 * Default AUTO-PROCEED value when no source provides it
 */
export const DEFAULT_AUTO_PROCEED = false;

/**
 * Parse CLI arguments for AUTO-PROCEED flags
 * @param {string[]} args - Command line arguments
 * @returns {{ value: boolean | null, source: string | null }}
 */
export function parseCliFlags(args = process.argv) {
  const hasAutoProeed = args.includes('--auto-proceed');
  const hasNoAutoProceed = args.includes('--no-auto-proceed');

  // Explicit disable takes precedence over enable (conservative)
  if (hasNoAutoProceed) {
    return { value: false, source: RESOLUTION_SOURCES.CLI };
  }

  if (hasAutoProeed) {
    return { value: true, source: RESOLUTION_SOURCES.CLI };
  }

  return { value: null, source: null };
}

/**
 * Parse environment variable for AUTO-PROCEED
 * @returns {{ value: boolean | null, source: string | null }}
 */
export function parseEnvVar() {
  const envValue = process.env.AUTO_PROCEED;

  if (envValue === undefined || envValue === '') {
    return { value: null, source: null };
  }

  const normalizedValue = String(envValue).toLowerCase().trim();

  // Truthy values
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalizedValue)) {
    return { value: true, source: RESOLUTION_SOURCES.ENV };
  }

  // Falsy values
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalizedValue)) {
    return { value: false, source: RESOLUTION_SOURCES.ENV };
  }

  // Unknown value - ignore and fall through
  console.warn(`⚠️  AUTO-PROCEED: Unrecognized env value '${envValue}', falling through to session/database`);
  return { value: null, source: null };
}

/**
 * Read AUTO-PROCEED from session store
 * @param {object} supabase - Supabase client
 * @returns {Promise<{ value: boolean | null, source: string | null, sessionId: string | null }>}
 */
export async function readFromSession(supabase) {
  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id, metadata')
      .eq('status', 'active')
      .order('heartbeat_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No active session found
        return { value: null, source: null, sessionId: null };
      }
      console.warn(`⚠️  AUTO-PROCEED: Session read error: ${error.message}`);
      return { value: null, source: null, sessionId: null };
    }

    if (data?.metadata?.auto_proceed !== undefined) {
      return {
        value: Boolean(data.metadata.auto_proceed),
        source: RESOLUTION_SOURCES.SESSION,
        sessionId: data.session_id
      };
    }

    return { value: null, source: null, sessionId: data?.session_id || null };
  } catch (err) {
    console.warn(`⚠️  AUTO-PROCEED: Session read exception: ${err.message}`);
    return { value: null, source: null, sessionId: null };
  }
}

/**
 * Write AUTO-PROCEED state to session (idempotent)
 * @param {object} supabase - Supabase client
 * @param {boolean} autoProceed - Value to write
 * @param {string} sessionId - Optional existing session ID to update
 * @returns {Promise<{ success: boolean, sessionId: string | null }>}
 */
export async function writeToSession(supabase, autoProceed, sessionId = null) {
  try {
    const targetSessionId = sessionId || `session_${Date.now()}`;

    const { error } = await supabase
      .from('claude_sessions')
      .upsert({
        session_id: targetSessionId,
        status: 'active',
        heartbeat_at: new Date().toISOString(),
        metadata: { auto_proceed: autoProceed }
      }, { onConflict: 'session_id' });

    if (error) {
      console.warn(`⚠️  AUTO-PROCEED: Session write error: ${error.message}`);
      return { success: false, sessionId: null };
    }

    return { success: true, sessionId: targetSessionId };
  } catch (err) {
    console.warn(`⚠️  AUTO-PROCEED: Session write exception: ${err.message}`);
    return { success: false, sessionId: null };
  }
}

/**
 * Main resolver: Determine AUTO-PROCEED state using precedence order
 * @param {object} options - Resolution options
 * @param {string[]} options.args - CLI arguments (defaults to process.argv)
 * @param {object} options.supabase - Supabase client (auto-created if not provided)
 * @param {boolean} options.persist - Whether to persist resolved value to session (default: true)
 * @param {boolean} options.verbose - Whether to log resolution details (default: true)
 * @returns {Promise<{ autoProceed: boolean, source: string, sessionId: string | null }>}
 */
export async function resolveAutoProceed(options = {}) {
  const {
    args = process.argv,
    supabase: injectedSupabase = null,
    persist = true,
    verbose = true
  } = options;

  if (verbose) {
    console.log('\n🔄 AUTO-PROCEED Resolution');
    console.log('-'.repeat(40));
  }

  // Step 1: Check CLI flags (highest precedence)
  const cliResult = parseCliFlags(args);
  if (cliResult.value !== null) {
    if (verbose) {
      console.log('   ✅ Source: CLI flag');
      console.log(`   📌 Value: ${cliResult.value ? 'ENABLED' : 'DISABLED'}`);
    }
    return {
      autoProceed: cliResult.value,
      source: cliResult.source,
      sessionId: null
    };
  }

  // Step 2: Check environment variable
  const envResult = parseEnvVar();
  if (envResult.value !== null) {
    if (verbose) {
      console.log('   ✅ Source: Environment variable');
      console.log(`   📌 Value: ${envResult.value ? 'ENABLED' : 'DISABLED'}`);
    }
    return {
      autoProceed: envResult.value,
      source: envResult.source,
      sessionId: null
    };
  }

  // Step 3: Check session store (needs Supabase)
  let supabase = injectedSupabase;
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      if (verbose) {
        console.log('   ⚠️  Supabase not configured, skipping session lookup');
        console.log('   ℹ️  Source: Default');
        console.log(`   📌 Value: ${DEFAULT_AUTO_PROCEED ? 'ENABLED' : 'DISABLED'}`);
      }
      return {
        autoProceed: DEFAULT_AUTO_PROCEED,
        source: RESOLUTION_SOURCES.DEFAULT,
        sessionId: null
      };
    }

    supabase = createClient(supabaseUrl, supabaseKey);
  }

  const sessionResult = await readFromSession(supabase);
  if (sessionResult.value !== null) {
    if (verbose) {
      console.log('   ✅ Source: Session store');
      console.log(`   📌 Value: ${sessionResult.value ? 'ENABLED' : 'DISABLED'}`);
      console.log(`   🔑 Session: ${sessionResult.sessionId}`);
    }
    return {
      autoProceed: sessionResult.value,
      source: sessionResult.source,
      sessionId: sessionResult.sessionId
    };
  }

  // Step 4: Use default value
  if (verbose) {
    console.log('   ℹ️  Source: Default');
    console.log(`   📌 Value: ${DEFAULT_AUTO_PROCEED ? 'ENABLED' : 'DISABLED'}`);
  }

  // Persist default to session if requested
  let persistedSessionId = sessionResult.sessionId;
  if (persist) {
    const writeResult = await writeToSession(supabase, DEFAULT_AUTO_PROCEED, sessionResult.sessionId);
    if (writeResult.success && verbose) {
      console.log(`   💾 Persisted to session: ${writeResult.sessionId}`);
      persistedSessionId = writeResult.sessionId;
    }
  }

  return {
    autoProceed: DEFAULT_AUTO_PROCEED,
    source: RESOLUTION_SOURCES.DEFAULT,
    sessionId: persistedSessionId
  };
}

/**
 * Create AUTO-PROCEED metadata for handoff payloads
 * @param {boolean} autoProceed - Resolved AUTO-PROCEED value
 * @param {string} source - Resolution source
 * @returns {object} Metadata object for handoff
 */
export function createHandoffMetadata(autoProceed, source) {
  return {
    autoProceed,
    autoProceedSource: source,
    autoProceedResolvedAt: new Date().toISOString()
  };
}

/**
 * Get chain_orchestrators setting from active session
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-05 (Configurable Orchestrator Chaining)
 *
 * @param {object} supabase - Supabase client
 * @returns {Promise<{ chainOrchestrators: boolean, sessionId: string | null }>}
 */
export async function getChainOrchestrators(supabase) {
  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id, metadata')
      .eq('status', 'active')
      .order('heartbeat_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No active session found - default to false (pause at boundary)
        return { chainOrchestrators: false, sessionId: null };
      }
      console.warn(`⚠️  CHAIN_ORCHESTRATORS: Session read error: ${error.message}`);
      return { chainOrchestrators: false, sessionId: null };
    }

    // Default to false if not set (conservative - pause at orchestrator boundary)
    const chainOrchestrators = Boolean(data?.metadata?.chain_orchestrators ?? false);

    return {
      chainOrchestrators,
      sessionId: data?.session_id || null
    };
  } catch (err) {
    console.warn(`⚠️  CHAIN_ORCHESTRATORS: Exception: ${err.message}`);
    return { chainOrchestrators: false, sessionId: null };
  }
}

/**
 * Set chain_orchestrators preference in session
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-05 (Configurable Orchestrator Chaining)
 *
 * @param {object} supabase - Supabase client
 * @param {boolean} chainOrchestrators - Whether to enable chaining
 * @param {string} sessionId - Optional session ID to update
 * @returns {Promise<{ success: boolean, sessionId: string | null }>}
 */
export async function setChainOrchestrators(supabase, chainOrchestrators, sessionId = null) {
  try {
    // First get existing session to preserve other metadata
    const { data: existingSession } = await supabase
      .from('claude_sessions')
      .select('session_id, metadata')
      .eq('status', 'active')
      .order('heartbeat_at', { ascending: false })
      .limit(1)
      .single();

    const targetSessionId = sessionId || existingSession?.session_id || `session_${Date.now()}`;
    const existingMetadata = existingSession?.metadata || {};

    const { error } = await supabase
      .from('claude_sessions')
      .upsert({
        session_id: targetSessionId,
        status: 'active',
        heartbeat_at: new Date().toISOString(),
        metadata: {
          ...existingMetadata,
          chain_orchestrators: chainOrchestrators
        }
      }, { onConflict: 'session_id' });

    if (error) {
      console.warn(`⚠️  CHAIN_ORCHESTRATORS: Write error: ${error.message}`);
      return { success: false, sessionId: null };
    }

    return { success: true, sessionId: targetSessionId };
  } catch (err) {
    console.warn(`⚠️  CHAIN_ORCHESTRATORS: Write exception: ${err.message}`);
    return { success: false, sessionId: null };
  }
}

export default {
  resolveAutoProceed,
  parseCliFlags,
  parseEnvVar,
  readFromSession,
  writeToSession,
  createHandoffMetadata,
  getChainOrchestrators,
  setChainOrchestrators,
  RESOLUTION_SOURCES,
  DEFAULT_AUTO_PROCEED
};
