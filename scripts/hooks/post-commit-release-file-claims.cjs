#!/usr/bin/env node
/**
 * Post-Commit File-Claim Auto-Release
 * SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001 (FR-5a)
 *
 * Reads HEAD commit's file list via `git show --name-only` and DELETEs
 * matching file_claim_locks rows held by the current session.
 *
 * Triggered from .husky/post-commit. Fail-open — any error must not block
 * the post-commit phase (file is already in git).
 */

require('dotenv').config({ path: '.env' });
const { execSync } = require('child_process');

(async () => {
  try {
    const sessionId = process.env.CLAUDE_SESSION_ID;
    if (!sessionId) {
      // No session context — nothing to scope to. Skip.
      return;
    }

    let filesRaw;
    try {
      filesRaw = execSync('git show --name-only --pretty=format: HEAD', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
    } catch {
      return; // Not a git repo or no HEAD commit yet
    }

    const filePaths = filesRaw
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (filePaths.length === 0) return;

    const { releaseClaimsForFiles } = require('./lib/file-claim-guard.cjs');
    const result = await releaseClaimsForFiles({
      filePaths,
      holderSessionId: sessionId,
    });

    if (result.released > 0) {
      console.log(`[post-commit] released ${result.released} file_claim_locks for session ${sessionId.slice(0, 8)}...`);
    }
  } catch (err) {
    // Fail-open
    if (process.env.LEO_TELEMETRY_DEBUG === '1') {
      console.error('[post-commit-release-file-claims] error:', err.message);
    }
  }
})();
