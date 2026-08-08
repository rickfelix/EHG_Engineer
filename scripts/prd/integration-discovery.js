/**
 * Integration Discovery Module
 *
 * Scans the codebase surrounding an SD's target files to discover integration surfaces:
 * - Barrel exports (index.js/ts re-exports)
 * - Router registrations (Express/Fastify route wiring)
 * - Registry/DI container registrations
 * - Validation schema references
 *
 * Produces a structured integration_contract for PRD metadata.
 *
 * Part of SD-LEO-INFRA-INTEGRATION-AWARE-PRD-001 (FR-1)
 */

import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
// crypto import removed - unused

/** Feature flag for enabling/disabling integration discovery */
const INTEGRATION_DISCOVERY_ENABLED = process.env.GATE_INTEGRATION_CONTRACT_ENABLED !== 'false';

/** Cache TTL in milliseconds (default: 10 minutes) */
const CACHE_TTL_MS = parseInt(process.env.INTEGRATION_DISCOVERY_CACHE_TTL_MS || '600000', 10);

/** Timeout for scanning operations in milliseconds */
const SCAN_TIMEOUT_MS = parseInt(process.env.INTEGRATION_DISCOVERY_TIMEOUT_MS || '30000', 10);

/** In-memory cache keyed by repoCommitSha + sdId */
const scanCache = new Map();

/**
 * Determine the current commit SHA for cache keying.
 * @param {string} repoRoot - Repository root path
 * @returns {string} Short SHA or 'unknown'
 */
function getCommitSha(repoRoot) {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      cwd: repoRoot,
      timeout: 5000
    }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Build a cache key from commit SHA and SD ID.
 * @param {string} commitSha
 * @param {string} sdId
 * @returns {string}
 */
function buildCacheKey(commitSha, sdId) {
  return `${commitSha}:${sdId}`;
}

/**
 * Check if SD type is code-producing (requires integration discovery).
 * @param {string} sdType
 * @returns {boolean}
 */
export function isCodeProducingSdType(sdType) {
  const codeProducingTypes = [
    'feature', 'implementation', 'bugfix', 'refactor',
    'performance', 'enhancement', 'security', 'database'
  ];
  return codeProducingTypes.includes(sdType?.toLowerCase());
}

/**
 * Scan for barrel exports (index.js/ts files that re-export).
 *
 * @param {string} repoRoot - Repository root path
 * @param {string[]} scopePaths - Paths to scan (relative to repo root)
 * @returns {Array<{ file: string, exports: string[] }>}
 */
export function scanBarrelExports(repoRoot, scopePaths = ['lib', 'scripts']) {
  const results = [];

  for (const scopePath of scopePaths) {
    const fullPath = path.join(repoRoot, scopePath);
    if (!fs.existsSync(fullPath)) continue;

    try {
      // Find index.js/ts files
      const indexFiles = execSync(
        `git ls-files "${scopePath}/**/index.js" "${scopePath}/**/index.ts" "${scopePath}/**/index.mjs" 2>/dev/null || echo ""`,
        { encoding: 'utf8', cwd: repoRoot, timeout: SCAN_TIMEOUT_MS }
      ).trim().split('\n').filter(Boolean);

      for (const indexFile of indexFiles) {
        const filePath = path.join(repoRoot, indexFile);
        if (!fs.existsSync(filePath)) continue;

        const content = fs.readFileSync(filePath, 'utf8');
        const exports = [];

        // Match: export { X } from './module.js'
        const reExportMatches = content.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g);
        for (const match of reExportMatches) {
          const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop().trim());
          exports.push(...names);
        }

        // Match: export * from './module.js'
        const starExportMatches = content.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/g);
        for (const match of starExportMatches) {
          exports.push(`* from ${match[1]}`);
        }

        // Match: export default X or export { default as X }
        if (/export\s+default\s+/.test(content)) {
          exports.push('default');
        }

        if (exports.length > 0) {
          results.push({
            file: indexFile,
            exports,
            type: 'barrel_export'
          });
        }
      }
    } catch (_err) {
      // Continue scanning other paths
    }
  }

  return results;
}

/**
 * Run `git grep -l -E <pattern> -- <paths>` with NO shell involved.
 *
 * WHY ARGV AND NOT A SHELL. The previous form interpolated the alternation regex into a shell
 * string. On Windows `execSync` runs it through cmd.exe, which reads the `|` between patterns
 * as a PIPE: it split the command and tried to execute `router\.post\(` as a program. Measured
 * on win32 — shell form exits 255 with "'router\.post\' is not recognized as an internal or
 * external command"; this argv form returns 7 files for the identical pattern. Every caller
 * wrapped the call in a bare `catch {}`, so the scan returned EMPTY on every Windows seat and
 * STEP 0 reported a successful discovery that had examined nothing.
 *
 * WHY `status === 1` IS NOT A FAILURE. git grep exits 1 for "no matches found", and that
 * includes a scope path that does not exist — measured: a nonexistent pathspec exits 1 with
 * EMPTY stderr, indistinguishable from an ordinary empty result, so it cannot be treated as an
 * error. Genuine failures (not a repository, malformed regex, git missing, timeout) exit 128
 * or fail to spawn; those are rethrown so they surface instead of degrading into a silent
 * empty scan, which is the exact defect this replaces.
 *
 * @param {string} repoRoot - Repository root to scan from
 * @param {string} pattern - Extended-regex pattern, passed as ONE argv element
 * @param {string[]} scopePaths - Pathspecs, each its own argv element
 * @returns {string} Newline-separated matching file paths, or '' when there are no matches
 */
function gitGrepFiles(repoRoot, pattern, scopePaths) {
  try {
    return execFileSync(
      'git',
      ['grep', '-l', '-E', pattern, '--', ...scopePaths],
      { encoding: 'utf8', cwd: repoRoot, timeout: SCAN_TIMEOUT_MS }
    ).trim();
  } catch (err) {
    if (err.status === 1) return '';
    throw err;
  }
}

/**
 * Scan for router registrations (Express/Fastify route patterns).
 *
 * @param {string} repoRoot - Repository root path
 * @param {string[]} scopePaths - Paths to scan
 * @returns {Array<{ file: string, routes: string[] }>}
 */
export function scanRouterRegistrations(repoRoot, scopePaths = ['lib', 'scripts', 'src']) {
  const results = [];

  try {
    // Search for common route registration patterns
    const routePatterns = [
      'router\\.get\\(',
      'router\\.post\\(',
      'router\\.put\\(',
      'router\\.delete\\(',
      'router\\.patch\\(',
      'app\\.get\\(',
      'app\\.post\\(',
      'app\\.use\\(',
      'fastify\\.get\\(',
      'fastify\\.post\\(',
    ];

    const grepPattern = routePatterns.join('|');

    const output = gitGrepFiles(repoRoot, grepPattern, scopePaths);

    if (!output) return results;

    for (const file of output.split('\n').filter(Boolean)) {
      const filePath = path.join(repoRoot, file);
      if (!fs.existsSync(filePath)) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      const routes = [];

      // Extract route paths
      const routeMatches = content.matchAll(/(?:router|app|fastify)\.(get|post|put|delete|patch|use)\s*\(\s*['"]([^'"]+)['"]/g);
      for (const match of routeMatches) {
        routes.push(`${match[1].toUpperCase()} ${match[2]}`);
      }

      if (routes.length > 0) {
        results.push({
          file,
          routes,
          type: 'router_registration'
        });
      }
    }
  } catch (err) {
    // LOUD, not silent. This bare catch is the second half of the defect: it swallowed the
    // cmd.exe breakage whole, so STEP 0 reported a discovery that had scanned nothing.
    console.error(`   scanRouterRegistrations failed: ${String(err.message).split('\n')[0]}`);
  }

  return results;
}

/**
 * Scan for registry/DI container patterns.
 *
 * @param {string} repoRoot - Repository root path
 * @param {string[]} scopePaths - Paths to scan
 * @returns {Array<{ file: string, registrations: string[] }>}
 */
export function scanRegistryPatterns(repoRoot, scopePaths = ['lib', 'scripts', 'config']) {
  const results = [];

  try {
    const registryPatterns = [
      'register\\(',
      'registerModule\\(',
      'registerProvider\\(',
      'container\\.bind\\(',
      'addProvider\\(',
      'createClient\\(',
    ];

    const grepPattern = registryPatterns.join('|');

    const output = gitGrepFiles(repoRoot, grepPattern, scopePaths);

    if (!output) return results;

    for (const file of output.split('\n').filter(Boolean)) {
      const filePath = path.join(repoRoot, file);
      if (!fs.existsSync(filePath)) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      const registrations = [];

      const regMatches = content.matchAll(/(?:register|registerModule|registerProvider|addProvider|container\.bind)\s*\(\s*['"]?([^'")\s,]+)/g);
      for (const match of regMatches) {
        registrations.push(match[1]);
      }

      if (registrations.length > 0) {
        results.push({
          file,
          registrations,
          type: 'registry_pattern'
        });
      }
    }
  } catch (err) {
    console.error(`   scanRegistryPatterns failed: ${String(err.message).split('\n')[0]}`);
  }

  return results;
}

/**
 * Scan for validation schema references.
 *
 * @param {string} repoRoot - Repository root path
 * @param {string[]} scopePaths - Paths to scan
 * @returns {Array<{ file: string, schemas: string[] }>}
 */
export function scanValidationSchemas(repoRoot, scopePaths = ['lib', 'scripts', 'src']) {
  const results = [];

  try {
    const schemaPatterns = [
      'z\\.object\\(',
      'z\\.string\\(',
      'z\\.number\\(',
      'Joi\\.object\\(',
      'yup\\.object\\(',
      'validate[A-Z]',
      'Schema\\s*=',
    ];

    const grepPattern = schemaPatterns.join('|');

    const output = gitGrepFiles(repoRoot, grepPattern, scopePaths);

    if (!output) return results;

    for (const file of output.split('\n').filter(Boolean)) {
      const filePath = path.join(repoRoot, file);
      if (!fs.existsSync(filePath)) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      const schemas = [];

      // Match exported validation functions/schemas
      const validatorMatches = content.matchAll(/export\s+(?:function|const|class)\s+(validate[A-Za-z]+|[A-Za-z]+Schema|[A-Za-z]+Validator)/g);
      for (const match of validatorMatches) {
        schemas.push(match[1]);
      }

      if (schemas.length > 0) {
        results.push({
          file,
          schemas,
          type: 'validation_schema'
        });
      }
    }
  } catch (err) {
    console.error(`   scanValidationSchemas failed: ${String(err.message).split('\n')[0]}`);
  }

  return results;
}

/**
 * Identify which modules consume the SD's target files.
 *
 * @param {string} repoRoot - Repository root path
 * @param {string[]} targetFiles - Files the SD is expected to modify
 * @returns {Array<{ file: string, importedFrom: string }>}
 */
export function scanConsumers(repoRoot, targetFiles = []) {
  const results = [];

  for (const targetFile of targetFiles) {
    try {
      // Search for imports of this file
      const baseName = path.basename(targetFile, path.extname(targetFile));
      const _dirName = path.dirname(targetFile);

      const output = gitGrepFiles(
        repoRoot,
        `from\\s+['"].*${baseName}['"]`,
        ['lib', 'scripts', 'src']
      );

      if (!output) continue;

      for (const file of output.split('\n').filter(Boolean)) {
        if (file === targetFile) continue; // Skip self-references
        results.push({
          file,
          importedFrom: targetFile,
          type: 'consumer'
        });
      }
    } catch (err) {
      console.error(`   scanConsumers failed for ${targetFile}: ${String(err.message).split('\n')[0]}`);
    }
  }

  return results;
}

/**
 * Build the structured integration_contract from scan results.
 *
 * @param {Object} scanResults - Results from all scan functions
 * @param {Object} sdData - Strategic Directive data
 * @returns {Object} Integration contract
 */
export function buildIntegrationContract(scanResults, sdData) {
  const {
    barrelExports = [],
    routerRegistrations = [],
    registryPatterns = [],
    validationSchemas = [],
    consumers = []
  } = scanResults;

  return {
    version: '1.0.0',
    sd_id: sdData.sd_key || sdData.id,
    generated_at: new Date().toISOString(),
    consumed_by: consumers.map(c => ({
      file: c.file,
      imports_from: c.importedFrom,
      required: true
    })),
    barrel_exports: barrelExports.map(b => ({
      file: b.file,
      symbols: b.exports,
      required: true
    })),
    contract_registrations: [
      ...routerRegistrations.map(r => ({
        file: r.file,
        type: 'router',
        entries: r.routes,
        required: true
      })),
      ...registryPatterns.map(r => ({
        file: r.file,
        type: 'registry',
        entries: r.registrations,
        required: false
      }))
    ],
    sibling_data_flow: validationSchemas.map(v => ({
      file: v.file,
      schemas: v.schemas,
      required: false
    })),
    evidence_links: {
      barrel_export_files: barrelExports.map(b => b.file),
      router_files: routerRegistrations.map(r => r.file),
      registry_files: registryPatterns.map(r => r.file),
      validation_files: validationSchemas.map(v => v.file)
    },
    summary: {
      total_barrel_exports: barrelExports.reduce((sum, b) => sum + b.exports.length, 0),
      total_routes: routerRegistrations.reduce((sum, r) => sum + r.routes.length, 0),
      total_registrations: registryPatterns.reduce((sum, r) => sum + r.registrations.length, 0),
      total_validators: validationSchemas.reduce((sum, v) => sum + v.schemas.length, 0),
      total_consumers: consumers.length
    }
  };
}

/**
 * Extract target file paths from SD scope/metadata.
 *
 * @param {Object} sdData - Strategic Directive data
 * @returns {string[]} Target file paths
 */
function extractTargetFiles(sdData) {
  const files = [];

  // Extract from scope text
  const scope = sdData.scope || sdData.description || '';
  const fileMatches = scope.matchAll(/(?:scripts|lib|src)\/[^\s,)'"]+\.(?:js|ts|mjs)/g);
  for (const match of fileMatches) {
    files.push(match[0]);
  }

  // Extract from key_changes
  if (Array.isArray(sdData.key_changes)) {
    for (const change of sdData.key_changes) {
      const changeText = typeof change === 'string' ? change : change.description || '';
      const changeFileMatches = changeText.matchAll(/(?:scripts|lib|src)\/[^\s,)'"]+\.(?:js|ts|mjs)/g);
      for (const match of changeFileMatches) {
        files.push(match[0]);
      }
    }
  }

  return [...new Set(files)];
}

/**
 * Run the full Integration Discovery pipeline.
 *
 * @param {Object} sdData - Strategic Directive data
 * @param {Object} options
 * @param {string} [options.repoRoot] - Repository root path
 * @param {boolean} [options.bypassCache=false] - Skip cache
 * @param {Function} [options.logger] - Logger function
 * @returns {Promise<{ contract: Object, cache_hit: boolean, duration_ms: number } | null>}
 */
export async function runIntegrationDiscovery(sdData, options = {}) {
  const startTime = Date.now();
  const logger = options.logger || console.log;
  const repoRoot = options.repoRoot || process.cwd();

  if (!INTEGRATION_DISCOVERY_ENABLED) {
    logger('   Integration Discovery: DISABLED (GATE_INTEGRATION_CONTRACT_ENABLED=false)');
    return null;
  }

  const sdType = sdData.sd_type || 'feature';
  if (!isCodeProducingSdType(sdType)) {
    logger(`   Integration Discovery: SKIPPED (sd_type='${sdType}' is not code-producing)`);
    return null;
  }

  // Check cache
  const commitSha = getCommitSha(repoRoot);
  const sdId = sdData.sd_key || sdData.id;
  const cacheKey = buildCacheKey(commitSha, sdId);

  if (!options.bypassCache && scanCache.has(cacheKey)) {
    const cached = scanCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      logger('   Integration Discovery: cache hit');
      return {
        contract: cached.contract,
        cache_hit: true,
        duration_ms: Date.now() - startTime
      };
    }
    scanCache.delete(cacheKey);
  }

  logger('   Running Integration Discovery...');

  try {
    // Determine scope paths from SD
    const targetFiles = extractTargetFiles(sdData);
    const scopePaths = ['lib', 'scripts', 'src'];

    // Run all scans
    const barrelExports = scanBarrelExports(repoRoot, scopePaths);
    const routerRegistrations = scanRouterRegistrations(repoRoot, scopePaths);
    const registryPatterns = scanRegistryPatterns(repoRoot, scopePaths);
    const validationSchemas = scanValidationSchemas(repoRoot, scopePaths);
    const consumers = scanConsumers(repoRoot, targetFiles);

    const scanResults = {
      barrelExports,
      routerRegistrations,
      registryPatterns,
      validationSchemas,
      consumers
    };

    const contract = buildIntegrationContract(scanResults, sdData);

    // Cache the result
    scanCache.set(cacheKey, {
      contract,
      timestamp: Date.now()
    });

    const duration = Date.now() - startTime;
    logger(`   Integration Discovery complete (${duration}ms)`);
    logger(`      Barrel exports: ${contract.summary.total_barrel_exports}`);
    logger(`      Routes: ${contract.summary.total_routes}`);
    logger(`      Registrations: ${contract.summary.total_registrations}`);
    logger(`      Validators: ${contract.summary.total_validators}`);
    logger(`      Consumers: ${contract.summary.total_consumers}`);

    return {
      contract,
      cache_hit: false,
      duration_ms: duration
    };

  } catch (err) {
    const duration = Date.now() - startTime;
    // FR-1 AC3: If discovery cannot complete, report error
    const errorArtifact = {
      sd_id: sdId,
      reason: err.message,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      status: 'error'
    };

    logger(`   Integration Discovery FAILED: ${err.message}`);

    throw Object.assign(
      new Error(`Integration Discovery failed for ${sdId}: ${err.message}`),
      { artifact: errorArtifact }
    );
  }
}

/**
 * Validate an integration_contract against its schema.
 *
 * @param {Object} contract - Integration contract to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateIntegrationContract(contract) {
  const errors = [];

  if (!contract || typeof contract !== 'object') {
    return { valid: false, errors: ['Contract must be a non-null object'] };
  }

  const requiredFields = ['consumed_by', 'barrel_exports', 'contract_registrations', 'sibling_data_flow'];
  for (const field of requiredFields) {
    if (!Array.isArray(contract[field])) {
      errors.push(`${field} must be an array`);
    }
  }

  if (contract.consumed_by) {
    for (const item of contract.consumed_by) {
      if (!item.file) errors.push('consumed_by entry missing file');
    }
  }

  if (contract.barrel_exports) {
    for (const item of contract.barrel_exports) {
      if (!item.file) errors.push('barrel_exports entry missing file');
      if (!Array.isArray(item.symbols)) errors.push('barrel_exports entry missing symbols array');
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Clear the scan cache (for testing) */
export function clearCache() {
  scanCache.clear();
}
