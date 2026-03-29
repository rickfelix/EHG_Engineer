/**
 * Venture Document Routing
 *
 * Resolves documentation directory for a target_application.
 * Used by /document command to route doc updates to correct repo.
 * SD-LEO-INFRA-VENTURE-DEVWORKFLOW-AWARENESS-001-Q
 *
 * @module lib/venture-doc-router
 */

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { resolveRepoPath, isVentureRepo, ENGINEER_ROOT } from './repo-paths.js';

/**
 * Resolve the documentation directory for a given target application.
 *
 * @param {string|null} targetApp - Application name from SD target_application field
 * @returns {{ repoPath: string, docsDir: string, isVenture: boolean }}
 */
export function resolveDocDirectory(targetApp) {
  if (!targetApp || !isVentureRepo(targetApp)) {
    return {
      repoPath: ENGINEER_ROOT,
      docsDir: join(ENGINEER_ROOT, 'docs'),
      isVenture: false,
    };
  }

  const repoPath = resolveRepoPath(targetApp);
  if (!repoPath) {
    return {
      repoPath: ENGINEER_ROOT,
      docsDir: join(ENGINEER_ROOT, 'docs'),
      isVenture: false,
    };
  }

  const docsDir = join(repoPath, 'docs');
  if (!existsSync(docsDir)) {
    mkdirSync(docsDir, { recursive: true });
  }

  return { repoPath, docsDir, isVenture: true };
}

export default { resolveDocDirectory };
