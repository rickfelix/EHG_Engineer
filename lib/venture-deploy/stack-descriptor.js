/**
 * stack-descriptor
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-A (Child A / FR-1)
 *
 * Canonical per-venture STACK DESCRIPTOR — the single source of truth for which
 * infrastructure a venture targets (database, deployment, storage).
 *
 * Pure (no fs / DB / network); all validation is hand-rolled with no dependencies.
 *
 * Decision rule used by emitters:
 *   descriptor ABSENT or deployment_target === 'replit-autoscale'  →  REPLIT (default)
 *   otherwise                                                       →  CLOUD
 */

// ── Enums ──────────────────────────────────────────────────────────────────

/** Allowed values for db_provider (REQUIRED field). */
export const DB_PROVIDERS = /** @type {const} */ (['d1', 'neon', 'replit-postgres']);

/** Allowed values for deployment_target (REQUIRED field). */
export const DEPLOYMENT_TARGETS = /** @type {const} */ ([
  'cloudflare-pages',
  'cloudflare-workers',
  'cloud-run',
  'replit-autoscale',
]);

/** Cloud (non-Replit) deployment targets. */
export const CLOUD_TARGETS = /** @type {const} */ ([
  'cloudflare-pages',
  'cloudflare-workers',
  'cloud-run',
]);

/** Cloudflare-specific deployment targets (subset of CLOUD_TARGETS). */
export const CLOUDFLARE_TARGETS = /** @type {const} */ (['cloudflare-pages', 'cloudflare-workers']);

/** Allowed values for storage (optional field). */
export const STORAGE_PROVIDERS = /** @type {const} */ (['r2', 'replit-object-storage']);

// ── JSON Schema (draft-07) ──────────────────────────────────────────────────

/**
 * JSON Schema draft-07 definition for the stack descriptor.
 * The published artifact (contracts/stack-descriptor.schema.json) must deep-equal
 * this object — enforced by test suite.
 */
export const STACK_DESCRIPTOR_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ehg.dev/contracts/stack-descriptor.schema.json',
  title: 'EHG Venture Stack Descriptor',
  type: 'object',
  required: ['db_provider', 'deployment_target'],
  properties: {
    db_provider: {
      type: 'string',
      enum: DB_PROVIDERS,
      description: 'Database provider for this venture.',
    },
    deployment_target: {
      type: 'string',
      enum: DEPLOYMENT_TARGETS,
      description: 'Deployment platform for this venture.',
    },
    storage: {
      type: 'string',
      enum: STORAGE_PROVIDERS,
      description: 'Object storage provider (optional).',
    },
    region: {
      type: 'string',
      description: 'Deployment region hint (optional).',
    },
    graduation: {
      type: 'object',
      description: 'Graduation trigger config (meaning owned by sibling B — passthrough only).',
      additionalProperties: true,
    },
    connection: {
      type: 'object',
      description: 'Resolved connection details — written by sibling B (provisioning: DB connection string / Hyperdrive binding / Cloud Run service URL), read by sibling D (publish). Passthrough only here.',
      additionalProperties: true,
    },
  },
  additionalProperties: true,
};

// ── Internal helpers ────────────────────────────────────────────────────────

/** True for a plain non-array, non-null object. */
function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate a stack descriptor object.
 * Pure hand-rolled — no ajv or external deps.
 *
 * @param {unknown} d - value to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateStackDescriptor(d) {
  const errors = [];

  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    errors.push('descriptor must be a non-null object');
    return { valid: false, errors };
  }

  const obj = /** @type {Record<string,unknown>} */ (d);

  // Required field: db_provider
  if (!('db_provider' in obj) || obj.db_provider === undefined || obj.db_provider === null) {
    errors.push("missing required field 'db_provider'");
  } else if (!DB_PROVIDERS.includes(/** @type {string} */ (obj.db_provider))) {
    errors.push(
      `invalid value '${obj.db_provider}' for 'db_provider' — must be one of: ${DB_PROVIDERS.join(', ')}`
    );
  }

  // Required field: deployment_target
  if (!('deployment_target' in obj) || obj.deployment_target === undefined || obj.deployment_target === null) {
    errors.push("missing required field 'deployment_target'");
  } else if (!DEPLOYMENT_TARGETS.includes(/** @type {string} */ (obj.deployment_target))) {
    errors.push(
      `invalid value '${obj.deployment_target}' for 'deployment_target' — must be one of: ${DEPLOYMENT_TARGETS.join(', ')}`
    );
  }

  // Optional field: storage (only validate if present)
  if ('storage' in obj && obj.storage !== undefined && obj.storage !== null) {
    if (!STORAGE_PROVIDERS.includes(/** @type {string} */ (obj.storage))) {
      errors.push(
        `invalid value '${obj.storage}' for 'storage' — must be one of: ${STORAGE_PROVIDERS.join(', ')}`
      );
    }
  }

  // F2: enforce the schema's own object shape for the passthrough slots. The JSON
  // Schema declares graduation/connection as `type: object` — the hand-rolled
  // validator must agree (a string/array/number under these keys is malformed).
  if ('graduation' in obj && obj.graduation !== undefined && obj.graduation !== null) {
    if (!isPlainObject(obj.graduation)) {
      errors.push("field 'graduation' must be a plain object when present");
    }
  }
  if ('connection' in obj && obj.connection !== undefined && obj.connection !== null) {
    if (!isPlainObject(obj.connection)) {
      errors.push("field 'connection' must be a plain object when present");
    }
  }

  // F4: cross-field coherence — reject clearly-contradictory deployment/db/storage
  // combos. Only evaluated once the individual fields are themselves valid enum
  // values (otherwise the enum errors above already explain the problem).
  const dt = /** @type {string} */ (obj.deployment_target);
  const dbp = /** @type {string} */ (obj.db_provider);
  const store = /** @type {string} */ (obj.storage);
  const dtValid = DEPLOYMENT_TARGETS.includes(dt);
  const dbValid = DB_PROVIDERS.includes(dbp);
  const storeValid = store === undefined || store === null || STORAGE_PROVIDERS.includes(store);

  if (dtValid && dbValid && storeValid) {
    const isCloudDt = CLOUD_TARGETS.includes(dt);
    const isReplitDt = dt === 'replit-autoscale';
    if (isCloudDt) {
      if (dbp === 'replit-postgres') {
        errors.push(
          `incoherent stack: deployment_target '${dt}' (cloud) cannot use db_provider 'replit-postgres'`
        );
      }
      if (store === 'replit-object-storage') {
        errors.push(
          `incoherent stack: deployment_target '${dt}' (cloud) cannot use storage 'replit-object-storage'`
        );
      }
    } else if (isReplitDt) {
      if (dbp === 'd1' || dbp === 'neon') {
        errors.push(
          `incoherent stack: deployment_target 'replit-autoscale' cannot use db_provider '${dbp}'`
        );
      }
      if (store === 'r2') {
        errors.push(
          'incoherent stack: deployment_target \'replit-autoscale\' cannot use storage \'r2\''
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Target predicates ───────────────────────────────────────────────────────

/**
 * Resolve the deployment-target FAMILY for an emitter to dispatch on.
 *
 * F1 (discriminator) + F5 (fail-safe default): an absent descriptor, a
 * 'replit-autoscale' target, OR any unknown/invalid/missing deployment_target
 * routes to 'replit' — the safe DEFAULT path. Cloudflare-* targets => 'cloudflare';
 * 'cloud-run' => 'cloud-run'.
 *
 * @param {unknown} d
 * @returns {'replit'|'cloudflare'|'cloud-run'}
 */
export function deployTargetFamily(d) {
  if (!isPlainObject(d)) return 'replit';
  const dt = /** @type {any} */ (d).deployment_target;
  if (CLOUDFLARE_TARGETS.includes(dt)) return 'cloudflare';
  if (dt === 'cloud-run') return 'cloud-run';
  // 'replit-autoscale' AND any unknown/invalid/missing value => fail-safe to replit.
  return 'replit';
}

/**
 * True when the descriptor targets Replit (absent descriptor, replit-autoscale,
 * OR an invalid/unknown deployment_target — fail-safe DEFAULT).
 *
 * @param {unknown} d
 * @returns {boolean}
 */
export function isReplitTarget(d) {
  return deployTargetFamily(d) === 'replit';
}

/**
 * True when the descriptor targets a cloud platform (Cloudflare or Cloud Run).
 *
 * @param {unknown} d
 * @returns {boolean}
 */
export function isCloudTarget(d) {
  return !isReplitTarget(d);
}

/**
 * True when the descriptor targets Cloudflare (pages or workers).
 *
 * @param {unknown} d
 * @returns {boolean}
 */
export function isCloudflareTarget(d) {
  return deployTargetFamily(d) === 'cloudflare';
}

// ── Label helpers ───────────────────────────────────────────────────────────

/**
 * Resolve a human-readable prose token for the db_provider.
 *
 * F6: the default (unknown/absent) is a NEUTRAL label — never 'Replit Postgres'.
 * The Replit DEFAULT build-tasks path uses its own hardcoded Replit lines, so this
 * helper is only consulted on the cloud path; leaking the Replit label there is wrong.
 *
 * @param {unknown} d
 * @returns {string}
 */
export function resolveDbLabel(d) {
  const provider = isPlainObject(d) ? /** @type {any} */ (d).db_provider : undefined;
  switch (provider) {
    case 'd1': return 'Cloudflare D1';
    case 'neon': return 'Neon Postgres';
    case 'replit-postgres': return 'Replit Postgres';
    default: return 'the configured database';
  }
}

/**
 * Resolve a human-readable prose token for the storage provider.
 *
 * F7: the default (unknown/absent) is a NEUTRAL label — never 'Replit Object Storage'.
 *
 * @param {unknown} d
 * @returns {string}
 */
export function resolveStorageLabel(d) {
  const provider = isPlainObject(d) ? /** @type {any} */ (d).storage : undefined;
  switch (provider) {
    case 'r2': return 'Cloudflare R2';
    case 'replit-object-storage': return 'Replit Object Storage';
    default: return 'platform-native object storage';
  }
}
