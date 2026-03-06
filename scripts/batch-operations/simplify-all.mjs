/**
 * Simplify All Operation Adapter
 * Wraps SimplificationEngine for codebase-wide simplification sweeps.
 *
 * SD: SD-LEO-SIMPLIFY-ENFORCEMENT-AND-ORCH-001-C (FR-003)
 */

export default {
  key: 'simplify-all',
  description: 'Run codebase-wide simplification sweep',
  supportsDryRun: true,
  requiresServiceRole: false,
  flags: [
    { name: 'path', description: 'Root path to scan (default: cwd)', values: [] }
  ],
  async execute(supabase, { dryRun, flags = {} }) {
    const result = { total: 0, processed: 0, skipped: 0, failed: 0, details: [] };

    let SimplificationEngine;
    try {
      const mod = await import('../../lib/simplifier/simplification-engine.js');
      SimplificationEngine = mod.SimplificationEngine;
    } catch (err) {
      result.details.push({
        error: `Failed to load SimplificationEngine: ${err.message}`,
        remediation: 'Verify lib/simplifier/simplification-engine.js exists and exports SimplificationEngine'
      });
      result.failed = 1;
      return result;
    }

    const engine = new SimplificationEngine(supabase);

    // Get files that have changed in current session
    let files;
    try {
      files = engine.getSessionChangedFiles();
    } catch (err) {
      result.details.push({
        error: `Failed to get changed files: ${err.message}`,
        remediation: 'Ensure git is available and the working directory is a git repository'
      });
      result.failed = 1;
      return result;
    }

    result.total = files.length;

    if (result.total === 0) {
      result.details.push({ status: 'no_changed_files_found' });
      return result;
    }

    try {
      const simplifyResult = await engine.simplify(files, { dryRun: true });

      if (!simplifyResult || simplifyResult.totalChanges === 0) {
        result.details.push({ status: 'no_simplifications_found', files_scanned: files.length });
        result.skipped = files.length;
        return result;
      }

      // Report per-file results
      for (const fileResult of (simplifyResult.results || [])) {
        if (fileResult.changes && fileResult.changes.length > 0) {
          result.processed++;
          result.details.push({
            file: fileResult.file,
            changes: fileResult.changes.length,
            types: fileResult.changes.map(c => c.rule || c.type),
            status: dryRun ? 'would_simplify' : 'simplified'
          });
        } else {
          result.skipped++;
        }
      }

      // Apply if not dry-run
      if (!dryRun && simplifyResult.totalChanges > 0) {
        try {
          await engine.simplify(files, { dryRun: false });
        } catch (applyErr) {
          result.failed++;
          result.details.push({
            error: `Apply failed: ${applyErr.message}`,
            remediation: 'Review simplification results and apply manually'
          });
        }
      }
    } catch (err) {
      result.failed++;
      result.details.push({
        error: `Simplification scan failed: ${err.message}`,
        remediation: 'Check SimplificationEngine configuration and file permissions'
      });
    }

    return result;
  }
};
