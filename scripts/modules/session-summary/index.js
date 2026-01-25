/**
 * Session Summary Module
 *
 * Provides session summary generation for the AUTO-PROCEED orchestrator.
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-08
 *
 * @see docs/discovery/auto-proceed-enhancement-discovery.md
 */

// Import from default exports and re-export
import SessionEventCollectorModule from './SessionEventCollector.js';
import SummaryGeneratorModule from './SummaryGenerator.js';

export const { SessionEventCollector, createCollector, VALID_STATUSES, VALID_SEVERITIES } = SessionEventCollectorModule;
export const { SummaryGenerator, createGenerator, SCHEMA_VERSION, COMPILATION_TIMEOUT_MS, MAX_DIGEST_LINES } = SummaryGeneratorModule;
export { redactSecrets, redactObject, containsSecrets } from './secret-redactor.js';

/**
 * Generate and emit a session summary
 * @param {SessionEventCollector} collector - Event collector with session data
 * @param {object} options - Options
 * @param {boolean} options.emitLog - Whether to emit structured log (default: true)
 * @param {boolean} options.emitDigest - Whether to emit human-readable digest (default: true)
 * @param {boolean} options.persistArtifact - Whether to persist to artifact file (default: false)
 * @param {string} options.artifactPath - Path for artifact persistence
 * @returns {Promise<{ json: object, digest: string, generation_time_ms: number, degraded: boolean }>}
 */
export async function generateAndEmitSummary(collector, options = {}) {
  const { createGenerator } = await import('./SummaryGenerator.js');

  // Mark session as complete
  collector.complete();

  // Get snapshot
  const snapshot = collector.getSnapshot();

  // Generate summary
  const generator = createGenerator();
  const result = await generator.generate(snapshot);

  // Emit structured log
  if (options.emitLog !== false) {
    console.log(`\n   [SESSION_SUMMARY_LOG] ${JSON.stringify({
      report_type: result.json.report_type,
      session_id: result.json.session_id,
      schema_version: result.json.schema_version,
      overall_status: result.json.overall_status,
      total_sds: result.json.total_sds,
      issues_count: result.json.issues.length,
      generation_time_ms: result.generation_time_ms,
      degraded: result.degraded
    })}`);
  }

  // Emit human-readable digest
  if (options.emitDigest !== false) {
    console.log('\n' + result.digest);
  }

  // Persist artifact if requested
  if (options.persistArtifact && options.artifactPath) {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const artifactDir = path.dirname(options.artifactPath);
      if (!fs.existsSync(artifactDir)) {
        fs.mkdirSync(artifactDir, { recursive: true });
      }

      fs.writeFileSync(options.artifactPath, JSON.stringify(result.json, null, 2));
      console.log(`   📄 Session summary persisted to: ${options.artifactPath}`);
    } catch (err) {
      console.warn(`   ⚠️  Could not persist session summary: ${err.message}`);
    }
  }

  return result;
}

export default {
  generateAndEmitSummary
};
