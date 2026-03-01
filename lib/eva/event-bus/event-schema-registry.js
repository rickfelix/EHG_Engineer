/**
 * Event Schema Registry — Schema Versioning & Validation
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-01-A
 *
 * Maintains a version map of event types to their payload schemas.
 * Supports schema evolution with backward-compatible changes and
 * validates payloads against registered schemas before dispatch.
 *
 * Architecture dimension: A04 (event_rounds_priority_queue_work_routing)
 * Architecture dimension: A05 (event_bus_integration)
 */

/**
 * @typedef {Object} SchemaDefinition
 * @property {Object<string, 'string'|'number'|'boolean'|'object'|'array'>} required - Required fields and their types
 * @property {Object<string, 'string'|'number'|'boolean'|'object'|'array'>} [optional] - Optional fields and their types
 */

/**
 * @typedef {Object} SchemaEntry
 * @property {string} eventType
 * @property {string} version - Semver string (e.g., '1.0.0')
 * @property {SchemaDefinition} schema
 * @property {string} registeredAt - ISO timestamp
 */

// Map<eventType, Map<version, SchemaEntry>>
const _registry = new Map();

// Cache for latest version per event type
const _latestVersionCache = new Map();

// Supabase client reference for DB persistence (set via initPersistence)
let _supabase = null;

/**
 * Register a schema for an event type at a specific version.
 *
 * @param {string} eventType - e.g., 'stage.completed'
 * @param {string} version - Semver version string (e.g., '1.0.0')
 * @param {SchemaDefinition} schema - { required: { field: type }, optional: { field: type } }
 * @returns {{ eventType: string, version: string, registered: boolean }}
 */
export function registerSchema(eventType, version, schema) {
  if (!eventType || typeof eventType !== 'string') {
    throw new Error('eventType must be a non-empty string');
  }
  if (!version || typeof version !== 'string') {
    throw new Error('version must be a non-empty string');
  }
  if (!schema || typeof schema !== 'object' || !schema.required) {
    throw new Error('schema must have a "required" object mapping field names to types');
  }

  if (!_registry.has(eventType)) {
    _registry.set(eventType, new Map());
  }

  const versions = _registry.get(eventType);
  versions.set(version, {
    eventType,
    version,
    schema,
    registeredAt: new Date().toISOString(),
  });

  // Invalidate latest version cache
  _latestVersionCache.delete(eventType);

  // Write-behind: persist to DB asynchronously (fire-and-forget)
  persistSchemaToDB(eventType, version, schema).catch((err) => {
    console.warn(`[SchemaRegistry] Async persist failed for ${eventType}@${version}: ${err.message}`);
  });

  return { eventType, version, registered: true };
}

/**
 * Get the latest registered version for an event type.
 * Uses semver-like comparison (splits on '.', compares numerically).
 *
 * @param {string} eventType
 * @returns {string|null} Latest version string or null if not registered
 */
export function getLatestVersion(eventType) {
  if (_latestVersionCache.has(eventType)) {
    return _latestVersionCache.get(eventType);
  }

  const versions = _registry.get(eventType);
  if (!versions || versions.size === 0) return null;

  const sorted = Array.from(versions.keys()).sort((a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });

  const latest = sorted[sorted.length - 1];
  _latestVersionCache.set(eventType, latest);
  return latest;
}

/**
 * Get a schema for a specific event type and version.
 *
 * @param {string} eventType
 * @param {string} [version] - If omitted, returns the latest version
 * @returns {SchemaEntry|null}
 */
export function getSchema(eventType, version) {
  const versions = _registry.get(eventType);
  if (!versions) return null;

  const targetVersion = version || getLatestVersion(eventType);
  return versions.get(targetVersion) || null;
}

const VALID_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array']);

/**
 * Check if a value matches the expected type string.
 * @param {*} value
 * @param {string} expectedType
 * @returns {boolean}
 */
function matchesType(value, expectedType) {
  if (value === null || value === undefined) return false;
  switch (expectedType) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'object': return typeof value === 'object' && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    default: return true; // Unknown types pass (forward-compatible)
  }
}

/**
 * Validate a payload against a registered schema.
 *
 * - If no schema is registered for the event type, validation passes (open schema).
 * - If a schema is registered, all required fields must be present and match types.
 * - Optional fields are only type-checked if present.
 * - Extra fields not in the schema are allowed (backward-compatible evolution).
 *
 * @param {string} eventType
 * @param {object} payload
 * @param {object} [options]
 * @param {string} [options.version] - Specific version to validate against
 * @param {boolean} [options.strict] - If true, reject unknown fields (default: false)
 * @returns {{ valid: boolean, errors: string[], schemaVersion: string|null }}
 */
export function validate(eventType, payload, options = {}) {
  const errors = [];
  const schemaEntry = getSchema(eventType, options.version);

  // No schema registered → open validation (pass)
  if (!schemaEntry) {
    return { valid: true, errors: [], schemaVersion: null };
  }

  const { schema, version: schemaVersion } = schemaEntry;

  if (!payload || typeof payload !== 'object') {
    return {
      valid: false,
      errors: ['Payload must be a non-null object'],
      schemaVersion,
    };
  }

  // Check required fields
  for (const [field, expectedType] of Object.entries(schema.required)) {
    if (!(field in payload)) {
      errors.push(`Missing required field: ${field}`);
    } else if (VALID_TYPES.has(expectedType) && !matchesType(payload[field], expectedType)) {
      errors.push(`Field "${field}" expected type "${expectedType}", got "${typeof payload[field]}"`);
    }
  }

  // Check optional field types (only if present)
  if (schema.optional) {
    for (const [field, expectedType] of Object.entries(schema.optional)) {
      if (field in payload && payload[field] !== null && payload[field] !== undefined) {
        if (VALID_TYPES.has(expectedType) && !matchesType(payload[field], expectedType)) {
          errors.push(`Optional field "${field}" expected type "${expectedType}", got "${typeof payload[field]}"`);
        }
      }
    }
  }

  // Strict mode: reject unknown fields
  if (options.strict) {
    const allKnown = new Set([
      ...Object.keys(schema.required),
      ...Object.keys(schema.optional || {}),
    ]);
    for (const key of Object.keys(payload)) {
      if (!allKnown.has(key)) {
        errors.push(`Unknown field: "${key}" (strict mode)`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    schemaVersion,
  };
}

/**
 * List all registered event types and their versions.
 * @returns {Array<{ eventType: string, versions: string[], latestVersion: string }>}
 */
export function listSchemas() {
  const result = [];
  for (const [eventType, versions] of _registry) {
    result.push({
      eventType,
      versions: Array.from(versions.keys()),
      latestVersion: getLatestVersion(eventType),
    });
  }
  return result;
}

/**
 * Check if a schema is registered for an event type.
 * @param {string} eventType
 * @returns {boolean}
 */
export function hasSchema(eventType) {
  return _registry.has(eventType) && _registry.get(eventType).size > 0;
}

/**
 * Clear all registered schemas (for testing).
 */
export function clearSchemas() {
  _registry.clear();
  _latestVersionCache.clear();
}

/**
 * Get total count of registered schemas.
 * @returns {number}
 */
export function getSchemaCount() {
  let count = 0;
  for (const versions of _registry.values()) {
    count += versions.size;
  }
  return count;
}

// ─── DB Persistence Layer ─────────────────────────────────────────────

/**
 * Initialize DB persistence for the schema registry.
 * Call once at startup with a supabase client. After initialization,
 * registerSchema() will persist to DB alongside in-memory storage.
 *
 * @param {object} supabase - Supabase client instance
 */
export function initPersistence(supabase) {
  _supabase = supabase;
}

/**
 * Load all schemas from the eva_event_schemas table into the in-memory registry.
 * Called on startup before registerDefaultSchemas() so DB schemas take precedence.
 * Falls back gracefully if DB is unavailable.
 *
 * @param {object} [supabase] - Supabase client (uses stored client if not provided)
 * @returns {Promise<{ loaded: number, errors: string[] }>}
 */
export async function loadSchemasFromDB(supabase) {
  const client = supabase || _supabase;
  if (!client) {
    return { loaded: 0, errors: ['No supabase client available'] };
  }

  try {
    const { data, error } = await client
      .from('eva_event_schemas')
      .select('event_type, version, schema_definition, registered_at')
      .order('event_type');

    if (error) {
      console.warn(`[SchemaRegistry] DB load failed: ${error.message}`);
      return { loaded: 0, errors: [error.message] };
    }

    if (!data || data.length === 0) {
      return { loaded: 0, errors: [] };
    }

    let loaded = 0;
    for (const row of data) {
      if (!_registry.has(row.event_type)) {
        _registry.set(row.event_type, new Map());
      }
      const versions = _registry.get(row.event_type);
      versions.set(row.version, {
        eventType: row.event_type,
        version: row.version,
        schema: row.schema_definition,
        registeredAt: row.registered_at,
      });
      _latestVersionCache.delete(row.event_type);
      loaded++;
    }

    return { loaded, errors: [] };
  } catch (err) {
    console.warn(`[SchemaRegistry] DB load error: ${err.message}`);
    return { loaded: 0, errors: [err.message] };
  }
}

/**
 * Persist a schema to the eva_event_schemas table.
 * Uses upsert so newer registrations update existing rows.
 * Failures are logged but do not throw (write-behind pattern).
 *
 * @param {string} eventType
 * @param {string} version
 * @param {object} schema
 * @returns {Promise<boolean>} true if persisted successfully
 */
async function persistSchemaToDB(eventType, version, schema) {
  if (!_supabase) return false;

  try {
    const { error } = await _supabase
      .from('eva_event_schemas')
      .upsert({
        event_type: eventType,
        version,
        schema_definition: schema,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'event_type,version' });

    if (error) {
      console.warn(`[SchemaRegistry] DB persist failed for ${eventType}@${version}: ${error.message}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[SchemaRegistry] DB persist error for ${eventType}@${version}: ${err.message}`);
    return false;
  }
}

/**
 * Sync all in-memory schemas to the database. Useful after registerDefaultSchemas()
 * to ensure DB has the latest code-defined schemas.
 *
 * @param {object} [supabase] - Supabase client (uses stored client if not provided)
 * @returns {Promise<{ synced: number, failed: number }>}
 */
export async function syncSchemasToDB(supabase) {
  const client = supabase || _supabase;
  if (!client) return { synced: 0, failed: 0 };

  const rows = [];
  for (const [eventType, versions] of _registry) {
    for (const [version, entry] of versions) {
      rows.push({
        event_type: eventType,
        version,
        schema_definition: entry.schema,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length === 0) return { synced: 0, failed: 0 };

  const { error } = await client
    .from('eva_event_schemas')
    .upsert(rows, { onConflict: 'event_type,version' });

  if (error) {
    console.warn(`[SchemaRegistry] Bulk sync failed: ${error.message}`);
    return { synced: 0, failed: rows.length };
  }

  return { synced: rows.length, failed: 0 };
}

// ─── Built-in Schemas for Existing Event Types ───────────────────────

/**
 * Register default schemas for all known event types.
 * Called during event bus initialization.
 */
export function registerDefaultSchemas() {
  registerSchema('stage.completed', '1.0.0', {
    required: { ventureId: 'string', stageId: 'string' },
    optional: { completedAt: 'string', metadata: 'object' },
  });

  registerSchema('decision.submitted', '1.0.0', {
    required: { ventureId: 'string', decisionId: 'string' },
    optional: { decisionType: 'string', outcome: 'string', metadata: 'object' },
  });

  registerSchema('gate.evaluated', '1.0.0', {
    required: { ventureId: 'string', gateId: 'string', outcome: 'string' },
    optional: { score: 'number', details: 'object', metadata: 'object' },
  });

  registerSchema('sd.completed', '1.0.0', {
    required: { sdKey: 'string', ventureId: 'string' },
    optional: { completedAt: 'string', summary: 'string', metadata: 'object' },
  });

  registerSchema('venture.created', '1.0.0', {
    required: { ventureId: 'string' },
    optional: { ventureName: 'string', createdBy: 'string', metadata: 'object' },
  });

  registerSchema('venture.killed', '1.0.0', {
    required: { ventureId: 'string' },
    optional: { reason: 'string', killedBy: 'string', metadata: 'object' },
  });

  registerSchema('budget.exceeded', '1.0.0', {
    required: { ventureId: 'string' },
    optional: { currentBudget: 'number', threshold: 'number', overage: 'number', metadata: 'object' },
  });

  registerSchema('chairman.override', '1.0.0', {
    required: { ventureId: 'string' },
    optional: { overrideType: 'string', reason: 'string', decidedBy: 'string', metadata: 'object' },
  });

  registerSchema('stage.failed', '1.0.0', {
    required: { ventureId: 'string', stageId: 'string' },
    optional: { errorMessage: 'string', retryable: 'boolean', metadata: 'object' },
  });

  // Vision events (fire-and-forget, lighter schemas)
  registerSchema('vision.scored', '1.0.0', {
    required: { scoreId: 'string' },
    optional: { sdId: 'string', totalScore: 'number', dimensionScores: 'object', metadata: 'object' },
  });

  registerSchema('vision.gap_detected', '1.0.0', {
    required: { gapId: 'string' },
    optional: { dimensionCode: 'string', severity: 'string', description: 'string', metadata: 'object' },
  });

  registerSchema('vision.process_gap_detected', '1.0.0', {
    required: { gapId: 'string' },
    optional: { processArea: 'string', severity: 'string', description: 'string', metadata: 'object' },
  });

  registerSchema('vision.corrective_sd_created', '1.0.0', {
    required: { sdKey: 'string' },
    optional: { gapId: 'string', targetDimension: 'string', metadata: 'object' },
  });

  registerSchema('vision.rescore_completed', '1.0.0', {
    required: { scoreId: 'string' },
    optional: { previousScore: 'number', newScore: 'number', sdId: 'string', metadata: 'object' },
  });

  registerSchema('leo.pattern_resolved', '1.0.0', {
    required: { patternId: 'string' },
    optional: { sdKey: 'string', resolution: 'string', metadata: 'object' },
  });

  registerSchema('feedback.quality_updated', '1.0.0', {
    required: { feedbackId: 'string' },
    optional: { qualityScore: 'number', classification: 'string', metadata: 'object' },
  });
}
