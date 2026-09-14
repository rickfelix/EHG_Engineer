/**
 * Shared content-hash primitive for venture_artifacts.
 *
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G: extracted out of artifact-versioning.js so
 * artifact-persistence-service.js (writeArtifact's stamping) can reuse the SAME hash
 * algorithm without a circular import -- artifact-versioning.js itself imports
 * writeArtifact from artifact-persistence-service.js. artifact-versioning.js re-exports
 * this for backward compatibility; no other production code imported computeContentHash
 * from artifact-versioning.js directly (verified by repo-wide grep before this move).
 *
 * @module lib/eva/artifact-content-hash
 */

// eva-logger-lint-ignore: pure, synchronous hash primitive -- no I/O, no branching, no
// failure mode; nothing here is worth logging.
import { createHash } from 'crypto';

/**
 * Compute SHA256 content hash for artifact content.
 * SD-MAN-INFRA-CORRECTIVE-V05-DATA-CONTRACTS-001: FR-004
 *
 * @param {*} content - Artifact content (will be JSON.stringify'd if not string)
 * @returns {string} SHA256 hex digest
 */
export function computeContentHash(content) {
  const serialized = typeof content === 'string' ? content : JSON.stringify(content);
  return createHash('sha256').update(serialized).digest('hex');
}
