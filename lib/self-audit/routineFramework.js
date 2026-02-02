/**
 * Discovery Routine Framework
 * SD-LEO-SELF-IMPROVE-002B: Phase 2 - Self-Discovery Infrastructure
 *
 * Framework for creating self-audit discovery routines that scan
 * the codebase for drift, orphaned rules, and gaps.
 *
 * Modes:
 * - finding: Output findings only (read-only audit)
 * - proposal: Output improvement proposals
 * - both: Output both findings and proposals
 */

import { createHash } from 'crypto';
import { validateEvidencePack, EVIDENCE_TYPES } from './validateEvidencePack.js';

/**
 * Discovery modes
 */
export const DISCOVERY_MODES = {
  FINDING: 'finding',
  PROPOSAL: 'proposal',
  BOTH: 'both'
};

/**
 * Severity levels
 */
export const SEVERITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Finding status
 */
export const FINDING_STATUS = {
  OPEN: 'open',
  ACKNOWLEDGED: 'acknowledged',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed'
};

/**
 * Base class for discovery routines
 */
export class DiscoveryRoutine {
  /**
   * @param {Object} config - Routine configuration
   * @param {string} config.key - Unique routine identifier (e.g., 'spec_drift')
   * @param {string} config.name - Human-readable name
   * @param {string} config.description - Description of what the routine detects
   * @param {string[]} [config.modes] - Supported modes (default: all)
   */
  constructor(config) {
    if (!config.key) throw new Error('Routine key is required');
    if (!config.name) throw new Error('Routine name is required');

    this.key = config.key;
    this.name = config.name;
    this.description = config.description || '';
    this.modes = config.modes || Object.values(DISCOVERY_MODES);
    this.repoRoot = config.repoRoot || process.cwd();
  }

  /**
   * Execute the discovery routine
   * Must be overridden by subclasses
   *
   * @param {Object} options - Execution options
   * @param {string} options.mode - Discovery mode
   * @param {string} options.repoRef - Repository reference
   * @param {string} options.commitSha - Current commit SHA
   * @returns {Promise<Finding[]>} Array of findings
   */
  async execute(options) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Validate that mode is supported
   * @param {string} mode - Mode to validate
   */
  validateMode(mode) {
    if (!this.modes.includes(mode)) {
      throw new Error(
        `Mode '${mode}' not supported by routine '${this.key}'. ` +
        `Supported modes: ${this.modes.join(', ')}`
      );
    }
  }

  /**
   * Create a finding with proper structure
   *
   * @param {Object} params - Finding parameters
   * @returns {Finding} Formatted finding
   */
  createFinding({
    title,
    summary,
    severity,
    confidence,
    evidencePack,
    repoRef,
    commitSha,
    mode = DISCOVERY_MODES.FINDING,
    metadata = {}
  }) {
    // Validate evidence pack
    const validation = validateEvidencePack(evidencePack, { repoRoot: this.repoRoot });
    if (!validation.valid) {
      throw new Error(`Invalid evidence pack: ${validation.errors.join('; ')}`);
    }

    // Generate fingerprint for deduplication
    const fingerprint = this.generateFingerprint({
      title,
      evidencePack,
      severity
    });

    return {
      routine_key: this.key,
      mode,
      title,
      summary,
      severity: severity || SEVERITY_LEVELS.MEDIUM,
      confidence: Math.min(1, Math.max(0, confidence || 0.5)),
      repo_ref: repoRef,
      commit_sha: commitSha,
      evidence_pack: evidencePack,
      fingerprint,
      status: FINDING_STATUS.OPEN,
      metadata: {
        ...metadata,
        routine_name: this.name,
        generated_at: new Date().toISOString()
      }
    };
  }

  /**
   * Generate a fingerprint for deduplication
   * @param {Object} params - Parameters to hash
   * @returns {string} SHA-256 fingerprint
   */
  generateFingerprint({ title, evidencePack, severity }) {
    const content = JSON.stringify({
      routine: this.key,
      title,
      paths: evidencePack.map(e => e.path).sort(),
      severity
    });
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
}

/**
 * Registry of all discovery routines
 */
class RoutineRegistry {
  constructor() {
    this.routines = new Map();
  }

  /**
   * Register a routine
   * @param {DiscoveryRoutine} routine - Routine to register
   */
  register(routine) {
    if (!(routine instanceof DiscoveryRoutine)) {
      throw new Error('Must register a DiscoveryRoutine instance');
    }
    if (this.routines.has(routine.key)) {
      throw new Error(`Routine '${routine.key}' already registered`);
    }
    this.routines.set(routine.key, routine);
  }

  /**
   * Get a routine by key
   * @param {string} key - Routine key
   * @returns {DiscoveryRoutine|undefined}
   */
  get(key) {
    return this.routines.get(key);
  }

  /**
   * Get all registered routines
   * @returns {DiscoveryRoutine[]}
   */
  getAll() {
    return Array.from(this.routines.values());
  }

  /**
   * Get routine keys
   * @returns {string[]}
   */
  keys() {
    return Array.from(this.routines.keys());
  }

  /**
   * Check if routine exists
   * @param {string} key - Routine key
   * @returns {boolean}
   */
  has(key) {
    return this.routines.has(key);
  }
}

// Global registry instance
export const routineRegistry = new RoutineRegistry();

/**
 * Run discovery routines
 *
 * @param {Object} options - Run options
 * @param {string[]} [options.routines] - Routine keys to run (default: all)
 * @param {string} options.mode - Discovery mode
 * @param {string} options.repoRef - Repository reference
 * @param {string} options.commitSha - Current commit SHA
 * @param {boolean} [options.dryRun=false] - Dry run mode (don't persist)
 * @returns {Promise<Finding[]>} All findings from all routines
 */
export async function runDiscoveryRoutines(options) {
  const {
    routines: routineKeys,
    mode,
    repoRef,
    commitSha,
    dryRun = false
  } = options;

  // Validate mode
  if (!Object.values(DISCOVERY_MODES).includes(mode)) {
    throw new Error(
      `Invalid mode '${mode}'. Must be one of: ${Object.values(DISCOVERY_MODES).join(', ')}`
    );
  }

  // Get routines to run
  const routinesToRun = routineKeys
    ? routineKeys.map(key => {
        const routine = routineRegistry.get(key);
        if (!routine) {
          throw new Error(`Unknown routine: ${key}`);
        }
        return routine;
      })
    : routineRegistry.getAll();

  if (routinesToRun.length === 0) {
    console.warn('[RoutineFramework] No routines registered');
    return [];
  }

  const allFindings = [];

  // Run each routine
  for (const routine of routinesToRun) {
    try {
      routine.validateMode(mode);

      console.log(`[${routine.key}] Starting discovery (mode: ${mode})...`);
      const findings = await routine.execute({
        mode,
        repoRef,
        commitSha,
        dryRun
      });

      if (findings && findings.length > 0) {
        console.log(`[${routine.key}] Found ${findings.length} item(s)`);
        allFindings.push(...findings);
      } else {
        console.log(`[${routine.key}] No findings`);
      }
    } catch (error) {
      console.error(`[${routine.key}] Error: ${error.message}`);
      // Continue with other routines
    }
  }

  return allFindings;
}

/**
 * Get current git info
 * @returns {Promise<{repoRef: string, commitSha: string}>}
 */
export async function getGitInfo() {
  const { execSync } = await import('child_process');

  try {
    const commitSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const repoRef = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
    return { repoRef, commitSha };
  } catch (error) {
    return {
      repoRef: 'unknown',
      commitSha: 'unknown'
    };
  }
}

// Re-export EVIDENCE_TYPES for convenience
export { EVIDENCE_TYPES } from './validateEvidencePack.js';

export default {
  DiscoveryRoutine,
  routineRegistry,
  runDiscoveryRoutines,
  getGitInfo,
  DISCOVERY_MODES,
  SEVERITY_LEVELS,
  FINDING_STATUS,
  EVIDENCE_TYPES
};
