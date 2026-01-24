/**
 * Signal Storage Layer
 * SD-LEO-ENH-INTELLIGENT-RETROSPECTIVE-TRIGGERS-001
 *
 * Handles persistence of captured learning signals.
 * Non-blocking async storage with SD association.
 */

import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Storage backends
 */
export const STORAGE_BACKENDS = {
  FILE: 'file',
  DATABASE: 'database'
};

/**
 * Default storage directory for file-based storage
 */
export const DEFAULT_STORAGE_DIR = path.join(process.cwd(), '.signals');

/**
 * In-memory buffer for batched writes
 */
let signalBuffer = [];
const BUFFER_FLUSH_THRESHOLD = 10;
const BUFFER_FLUSH_INTERVAL_MS = 30000; // 30 seconds

/**
 * Store a signal (non-blocking)
 * @param {Object} signal - Signal to store
 * @param {Object} options - Storage options
 * @param {string} options.backend - Storage backend (file|database)
 * @returns {Promise<string>} Signal ID
 */
export async function storeSignal(signal, options = {}) {
  const { backend = STORAGE_BACKENDS.FILE } = options;

  // Generate signal ID
  const signalId = generateSignalId(signal);
  const enrichedSignal = {
    ...signal,
    id: signalId,
    storedAt: new Date().toISOString()
  };

  // Add to buffer
  signalBuffer.push(enrichedSignal);

  // Non-blocking flush if threshold reached
  if (signalBuffer.length >= BUFFER_FLUSH_THRESHOLD) {
    flushBuffer(backend).catch(err => {
      console.error('[SignalStorage] Buffer flush error:', err.message);
    });
  }

  return signalId;
}

/**
 * Store multiple signals
 * @param {Array<Object>} signals - Signals to store
 * @param {Object} options - Storage options
 * @returns {Promise<Array<string>>} Signal IDs
 */
export async function storeSignals(signals, options = {}) {
  const ids = [];
  for (const signal of signals) {
    const id = await storeSignal(signal, options);
    ids.push(id);
  }
  return ids;
}

/**
 * Flush buffer to storage
 * @param {string} backend - Storage backend
 */
export async function flushBuffer(backend = STORAGE_BACKENDS.FILE) {
  if (signalBuffer.length === 0) return;

  const toFlush = [...signalBuffer];
  signalBuffer = [];

  if (backend === STORAGE_BACKENDS.FILE) {
    await flushToFile(toFlush);
  } else if (backend === STORAGE_BACKENDS.DATABASE) {
    await flushToDatabase(toFlush);
  }
}

/**
 * Flush signals to file storage
 * @param {Array<Object>} signals - Signals to flush
 */
async function flushToFile(signals) {
  try {
    await fs.mkdir(DEFAULT_STORAGE_DIR, { recursive: true });

    // Group by session
    const bySession = groupBy(signals, 'sessionId');

    for (const [sessionId, sessionSignals] of Object.entries(bySession)) {
      const filename = `signals-${sessionId || 'unknown'}-${Date.now()}.json`;
      const filepath = path.join(DEFAULT_STORAGE_DIR, filename);

      await fs.writeFile(filepath, JSON.stringify(sessionSignals, null, 2));
    }
  } catch (err) {
    console.error('[SignalStorage] File flush error:', err.message);
    // Re-add to buffer for retry
    signalBuffer = [...signals, ...signalBuffer];
  }
}

/**
 * Flush signals to database
 * @param {Array<Object>} signals - Signals to flush
 */
async function flushToDatabase(signals) {
  try {
    // Dynamic import to avoid circular dependencies
    const { createDatabaseClient } = await import('../supabase-connection.js');

    const client = await createDatabaseClient('engineer', { verify: false });

    // Transform signals for database insertion
    const rows = signals.map(signal => ({
      session_id: signal.sessionId,
      sd_id: signal.sdId,
      category: signal.category,
      pattern: signal.pattern,
      matched_text: signal.matchedText,
      context: signal.context,
      weight: signal.weight,
      metadata: signal.metadata,
      captured_at: signal.timestamp
    }));

    // Insert into session_learning_signals table (if exists)
    // Fallback: store in SD metadata if table doesn't exist
    const { error } = await client
      .from('session_learning_signals')
      .insert(rows);

    if (error) {
      // Table may not exist, log and continue
      console.warn('[SignalStorage] Database insert warning:', error.message);
      // Fallback to file storage
      await flushToFile(signals);
    }
  } catch (err) {
    console.error('[SignalStorage] Database flush error:', err.message);
    // Fallback to file storage
    await flushToFile(signals);
  }
}

/**
 * Retrieve signals for an SD
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Retrieval options
 * @returns {Promise<Array<Object>>} Retrieved signals
 */
export async function getSignalsForSD(sdId, options = {}) {
  const { backend = STORAGE_BACKENDS.FILE } = options;

  if (backend === STORAGE_BACKENDS.DATABASE) {
    return getSignalsFromDatabase(sdId);
  }

  return getSignalsFromFiles(sdId);
}

/**
 * Get signals from database
 * @param {string} sdId - SD ID
 * @returns {Promise<Array<Object>>} Signals
 */
async function getSignalsFromDatabase(sdId) {
  try {
    const { createDatabaseClient } = await import('../supabase-connection.js');
    const client = await createDatabaseClient('engineer', { verify: false });

    const { data, error } = await client
      .from('session_learning_signals')
      .select('*')
      .eq('sd_id', sdId)
      .order('captured_at', { ascending: false });

    if (error) {
      console.warn('[SignalStorage] Database query warning:', error.message);
      return getSignalsFromFiles(sdId);
    }

    return data || [];
  } catch (err) {
    console.error('[SignalStorage] Database query error:', err.message);
    return getSignalsFromFiles(sdId);
  }
}

/**
 * Get signals from file storage
 * @param {string} sdId - SD ID
 * @returns {Promise<Array<Object>>} Signals
 */
async function getSignalsFromFiles(sdId) {
  try {
    const files = await fs.readdir(DEFAULT_STORAGE_DIR);
    const signals = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filepath = path.join(DEFAULT_STORAGE_DIR, file);
      const content = await fs.readFile(filepath, 'utf-8');
      const fileSignals = JSON.parse(content);

      for (const signal of fileSignals) {
        if (signal.sdId === sdId) {
          signals.push(signal);
        }
      }
    }

    return signals;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return []; // No signals directory yet
    }
    console.error('[SignalStorage] File read error:', err.message);
    return [];
  }
}

/**
 * Get all signals for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Array<Object>>} Signals
 */
export async function getSignalsForSession(sessionId) {
  try {
    const files = await fs.readdir(DEFAULT_STORAGE_DIR);
    const signals = [];

    for (const file of files) {
      if (!file.includes(sessionId) || !file.endsWith('.json')) continue;

      const filepath = path.join(DEFAULT_STORAGE_DIR, file);
      const content = await fs.readFile(filepath, 'utf-8');
      const fileSignals = JSON.parse(content);
      signals.push(...fileSignals);
    }

    return signals;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    console.error('[SignalStorage] Session read error:', err.message);
    return [];
  }
}

/**
 * Generate unique signal ID
 * @param {Object} signal - Signal object
 * @returns {string} Signal ID
 */
function generateSignalId(signal) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `sig-${signal.category}-${timestamp}-${random}`;
}

/**
 * Group array by key
 * @param {Array} arr - Array to group
 * @param {string} key - Key to group by
 * @returns {Object} Grouped object
 */
function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const groupKey = item[key] || 'unknown';
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(item);
    return acc;
  }, {});
}

// SD-SEC-ERROR-HANDLING-001: Store interval reference for proper cleanup
let flushIntervalId = null;

/**
 * Start periodic buffer flush
 */
function startPeriodicFlush() {
  // Clear any existing interval
  if (flushIntervalId) {
    clearInterval(flushIntervalId);
  }

  flushIntervalId = setInterval(() => {
    if (signalBuffer.length > 0) {
      flushBuffer().catch(err => {
        console.error('[SignalStorage] Periodic flush error:', err.message);
      });
    }
  }, BUFFER_FLUSH_INTERVAL_MS);
}

/**
 * Stop periodic buffer flush
 * SD-SEC-ERROR-HANDLING-001: Prevent memory leaks on shutdown
 */
export function stopPeriodicFlush() {
  if (flushIntervalId) {
    clearInterval(flushIntervalId);
    flushIntervalId = null;
    console.log('[SignalStorage] Periodic flush stopped');
  }
}

// Start periodic flush on module load
startPeriodicFlush();
