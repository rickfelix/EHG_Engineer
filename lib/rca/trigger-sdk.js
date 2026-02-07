/**
 * RCA Trigger SDK - Unified inline trigger for LEO Protocol failures
 * SD-LEO-ENH-ENHANCE-RCA-SUB-001
 *
 * Provides a lightweight, synchronous-safe trigger mechanism that works
 * from within CLI scripts (handoff.js, gate validators, provider-adapters)
 * without requiring background Realtime subscriptions.
 *
 * Key features:
 * - Standardized TriggerEvent schema
 * - Automatic redaction of secrets/PII
 * - Rate limiting (prevents runaway triggers)
 * - Deterministic fingerprinting for deduplication
 * - Context capture helpers per trigger type
 *
 * @module lib/rca/trigger-sdk
 */

import { createHash } from 'crypto';

// Rate limiting: max triggers per fingerprint within time window
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_PER_FINGERPRINT = 3;
const MAX_CONTEXT_CHARS = 20_000;
const _MAX_LOG_LINES = 200; // Reserved for future log truncation

// In-memory rate limit tracker (per-process)
const rateLimitMap = new Map();

/**
 * Trigger types that the SDK supports
 */
export const TRIGGER_TYPES = {
  HANDOFF_FAILURE: 'handoff_failure',
  GATE_VALIDATION_FAILURE: 'gate_validation_failure',
  API_FAILURE: 'api_failure',
  MIGRATION_FAILURE: 'migration_failure',
  SCRIPT_CRASH: 'script_crash',
  TEST_FAILURE_RETRY_EXHAUSTED: 'test_failure_retry_exhausted',
  PRD_VALIDATION_FAILURE: 'prd_validation_failure',
  STATE_MISMATCH: 'state_mismatch'
};

/**
 * RCA classification categories (extended from existing)
 */
export const CLASSIFICATIONS = {
  CODE_BUG: 'code_bug',
  PROCESS_ISSUE: 'process_issue',
  INFRASTRUCTURE: 'infrastructure',
  DATA_QUALITY: 'data_quality',
  ENCODING: 'encoding',
  CROSS_CUTTING: 'cross_cutting',
  PROTOCOL_PROCESS: 'protocol_process',
  CONFIGURATION: 'configuration'
};

/**
 * Patterns for auto-classifying trigger events
 */
const CLASSIFICATION_PATTERNS = {
  [CLASSIFICATIONS.ENCODING]: [
    /surrogate/i, /unicode/i, /utf-?8/i, /utf-?16/i, /encoding/i,
    /\\ud[89a-f]/i, /invalid.*json/i, /serialization/i
  ],
  [CLASSIFICATIONS.DATA_QUALITY]: [
    /invalid.*data/i, /corrupt/i, /malformed/i, /parse.*error/i,
    /unexpected.*token/i, /json.*parse/i
  ],
  [CLASSIFICATIONS.CONFIGURATION]: [
    /env.*var/i, /config/i, /missing.*key/i, /undefined.*variable/i,
    /process\.env/i, /\.env/i
  ],
  [CLASSIFICATIONS.INFRASTRUCTURE]: [
    /timeout/i, /ECONNREFUSED/i, /ENOTFOUND/i, /network/i,
    /database.*connection/i, /supabase.*error/i, /postgres/i
  ],
  [CLASSIFICATIONS.PROTOCOL_PROCESS]: [
    /handoff/i, /gate.*fail/i, /validation.*fail/i, /phase.*transition/i,
    /workflow/i, /sd_type/i, /smoke.*test/i
  ]
};

/**
 * Secrets patterns to redact
 */
const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey|secret|token|password|auth|bearer)\s*[:=]\s*['"]?[A-Za-z0-9_\-./]{8,}['"]?/gi,
  /sk-[A-Za-z0-9]{20,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /(?:SUPABASE|ANTHROPIC|OPENAI|GOOGLE|GEMINI)[_A-Z]*(?:KEY|SECRET|TOKEN|URL)\s*=\s*\S+/gi,
  /Authorization:\s*Bearer\s+\S+/gi
];

/**
 * Redact secrets and PII from a string
 * @param {string} text - Text to redact
 * @returns {string} Redacted text
 */
export function redactSecrets(text) {
  if (typeof text !== 'string') return text;
  let redacted = text;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

/**
 * Truncate text to max chars, preserving the last portion (most relevant for errors)
 * @param {string} text - Text to truncate
 * @param {number} maxChars - Maximum characters
 * @returns {string} Truncated text
 */
export function truncateContext(text, maxChars = MAX_CONTEXT_CHARS) {
  if (typeof text !== 'string') return text;
  if (text.length <= maxChars) return text;
  const ellipsis = `\n...[truncated ${text.length - maxChars} chars]...\n`;
  return text.slice(0, maxChars / 2) + ellipsis + text.slice(-(maxChars / 2));
}

/**
 * Generate a deterministic fingerprint for deduplication
 * Based on: trigger_type + normalized error signature + top module
 *
 * @param {string} triggerType - The trigger type
 * @param {string} errorSignature - Normalized error message/signature
 * @param {string} module - Top stack frame module or script name
 * @returns {string} SHA-256 hex fingerprint (first 16 chars)
 */
export function generateFingerprint(triggerType, errorSignature, module) {
  const normalized = `${triggerType}:${normalizeError(errorSignature)}:${module || 'unknown'}`;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Normalize an error message for fingerprinting
 * Strips variable parts (IDs, timestamps, paths) to group similar errors
 */
function normalizeError(error) {
  if (!error) return '';
  return error
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.Z\d]*/g, '<TIMESTAMP>')
    .replace(/line \d+ column \d+/g, 'line <N> column <N>')
    .replace(/char \d+/g, 'char <N>')
    .replace(/\d{4,}/g, '<NUM>')
    .replace(/\/[^\s:]+\.(js|ts|mjs)/g, '<FILE>')
    .trim()
    .toLowerCase();
}

/**
 * Check rate limit for a fingerprint
 * @param {string} fingerprint - Event fingerprint
 * @returns {boolean} true if within rate limit, false if suppressed
 */
export function checkRateLimit(fingerprint) {
  const now = Date.now();
  const entry = rateLimitMap.get(fingerprint);

  if (!entry) {
    rateLimitMap.set(fingerprint, { count: 1, windowStart: now });
    return true;
  }

  // Reset window if expired
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(fingerprint, { count: 1, windowStart: now });
    return true;
  }

  // Check limit
  if (entry.count >= MAX_PER_FINGERPRINT) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Build a standardized TriggerEvent from a failure context
 *
 * @param {Object} params
 * @param {string} params.triggerType - One of TRIGGER_TYPES
 * @param {string} params.errorMessage - Error message or summary
 * @param {string} [params.errorStack] - Stack trace (will be redacted)
 * @param {string} [params.sdId] - Strategic Directive ID
 * @param {string} [params.module] - Script/module that triggered
 * @param {Object} [params.context] - Additional context (will be redacted/truncated)
 * @param {string} [params.stdout] - Process stdout (last 10k chars)
 * @param {string} [params.stderr] - Process stderr (last 10k chars)
 * @param {number} [params.exitCode] - Process exit code
 * @returns {Object} Standardized TriggerEvent
 */
export function buildTriggerEvent(params) {
  const {
    triggerType,
    errorMessage,
    errorStack,
    sdId,
    module: moduleName,
    context = {},
    stdout,
    stderr,
    exitCode
  } = params;

  const fingerprint = generateFingerprint(
    triggerType,
    errorMessage,
    moduleName
  );

  const classification = autoClassify(errorMessage, errorStack, context);

  return {
    trigger_type: triggerType,
    fingerprint,
    timestamp: new Date().toISOString(),
    sd_id: sdId || null,
    module: moduleName || 'unknown',
    error_message: redactSecrets(errorMessage || ''),
    error_stack: redactSecrets(truncateContext(errorStack || '', 5000)),
    exit_code: exitCode ?? null,
    classification: classification.category,
    classification_confidence: classification.confidence,
    context: sanitizeContext(context),
    stdout: stdout ? redactSecrets(truncateContext(stdout, 10000)) : null,
    stderr: stderr ? redactSecrets(truncateContext(stderr, 10000)) : null,
    git_sha: getGitSha(),
    working_directory: process.cwd()
  };
}

/**
 * Auto-classify an error based on patterns
 */
function autoClassify(errorMessage, errorStack, context) {
  const fullText = [errorMessage, errorStack, JSON.stringify(context)].join(' ');

  for (const [category, patterns] of Object.entries(CLASSIFICATION_PATTERNS)) {
    const matchCount = patterns.filter(p => p.test(fullText)).length;
    if (matchCount >= 2) {
      return { category, confidence: Math.min(0.9, 0.5 + matchCount * 0.1) };
    }
    if (matchCount === 1) {
      return { category, confidence: 0.5 };
    }
  }

  return { category: CLASSIFICATIONS.CODE_BUG, confidence: 0.3 };
}

/**
 * Sanitize context object - redact secrets and truncate large values
 */
function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return {};
  const sanitized = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string') {
      sanitized[key] = redactSecrets(truncateContext(value, 2000));
    } else if (typeof value === 'object' && value !== null) {
      const serialized = JSON.stringify(value);
      if (serialized.length > 5000) {
        sanitized[key] = redactSecrets(truncateContext(serialized, 5000));
      } else {
        sanitized[key] = value;
      }
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Get current git SHA (best-effort, non-blocking)
 */
import { execSync } from 'child_process';

let cachedGitSha = null;
function getGitSha() {
  if (cachedGitSha) return cachedGitSha;
  try {
    cachedGitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    return cachedGitSha;
  } catch {
    return 'unknown';
  }
}

// --- Context Capture Helpers ---

/**
 * Build context for a handoff failure
 */
export function buildHandoffContext({ command, args, exitCode, stdout, stderr, sdId, handoffType }) {
  return buildTriggerEvent({
    triggerType: TRIGGER_TYPES.HANDOFF_FAILURE,
    errorMessage: `Handoff ${handoffType || 'unknown'} failed with exit code ${exitCode}`,
    sdId,
    module: 'handoff.js',
    exitCode,
    stdout,
    stderr,
    context: {
      command,
      args: Array.isArray(args) ? args.join(' ') : args,
      handoff_type: handoffType
    }
  });
}

/**
 * Build context for a gate validation failure
 */
export function buildGateContext({ gateName, score, threshold, breakdown, sdId, handoffType }) {
  return buildTriggerEvent({
    triggerType: TRIGGER_TYPES.GATE_VALIDATION_FAILURE,
    errorMessage: `Gate ${gateName} failed: score ${score}/${threshold}`,
    sdId,
    module: `gate:${gateName}`,
    context: {
      gate_name: gateName,
      score,
      threshold,
      handoff_type: handoffType,
      breakdown: breakdown ? JSON.stringify(breakdown).slice(0, 2000) : null
    }
  });
}

/**
 * Build context for an API/LLM failure
 */
export function buildApiContext({ provider, model, endpoint, httpStatus, errorCode, errorMessage, requestSummary }) {
  return buildTriggerEvent({
    triggerType: TRIGGER_TYPES.API_FAILURE,
    errorMessage: `${provider} API error: ${errorCode || httpStatus || 'unknown'} - ${errorMessage}`,
    module: `api:${provider}`,
    context: {
      provider,
      model,
      endpoint: redactSecrets(endpoint || ''),
      http_status: httpStatus,
      error_code: errorCode,
      request_summary: requestSummary ? redactSecrets(truncateContext(requestSummary, 1000)) : null
    }
  });
}

/**
 * Build context for a migration failure
 */
export function buildMigrationContext({ migrationFile, errorMessage, errorStack, sdId }) {
  return buildTriggerEvent({
    triggerType: TRIGGER_TYPES.MIGRATION_FAILURE,
    errorMessage: `Migration failed: ${migrationFile} - ${errorMessage}`,
    errorStack,
    sdId,
    module: `migration:${migrationFile}`,
    context: { migration_file: migrationFile }
  });
}

/**
 * Build context for a state mismatch
 */
export function buildStateMismatchContext({ entityType, entityId, dbState, gitState, sdId }) {
  return buildTriggerEvent({
    triggerType: TRIGGER_TYPES.STATE_MISMATCH,
    errorMessage: `State mismatch: ${entityType} ${entityId} - DB:${dbState} vs Git:${gitState}`,
    sdId,
    module: 'state-reconciliation',
    context: {
      entity_type: entityType,
      entity_id: entityId,
      db_state: dbState,
      git_state: gitState,
      mismatch_type: `${dbState} != ${gitState}`
    }
  });
}

export default {
  TRIGGER_TYPES,
  CLASSIFICATIONS,
  buildTriggerEvent,
  buildHandoffContext,
  buildGateContext,
  buildApiContext,
  buildMigrationContext,
  buildStateMismatchContext,
  redactSecrets,
  truncateContext,
  generateFingerprint,
  checkRateLimit
};
