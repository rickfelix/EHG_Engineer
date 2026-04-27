/**
 * FilePathClaimValidator — verifies a brainstorm-cited file path exists on disk.
 *
 * Part of: SD-LEO-INFRA-BRAINSTORM-SOURCE-TRUTH-CHECK-001 (FR-2)
 *
 * Claim shape:
 *   { type: 'file_path', path: 'src/foo/bar.ts' [, repo_root: '<absolute>'] }
 *
 * Validator interface (all validators):
 *   async validate(claim, context) =>
 *     { passed, expected, observed, source_path, line_number, severity, remediation_hint, validator_id }
 */

import { existsSync } from 'fs';
import { resolve } from 'path';

export const VALIDATOR_ID = 'file-path-claim-validator';

const PATH_RE = /^[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._/-]+)+\.(ts|tsx|js|mjs|cjs|jsx|md|yaml|yml|json|sql|sh|ps1)$/;

export function isFilePathToken(token) {
  return typeof token === 'string' && PATH_RE.test(token);
}

export async function validate(claim, context = {}) {
  const path = claim?.path;
  const repoRoot = claim?.repo_root || context.repo_root || process.cwd();

  if (!path || typeof path !== 'string') {
    return {
      passed: false,
      expected: 'non-empty string path',
      observed: typeof path,
      source_path: null,
      line_number: null,
      severity: 'error',
      remediation_hint: 'Provide claim.path as a string relative to repo root.',
      validator_id: VALIDATOR_ID,
    };
  }

  const absolute = resolve(repoRoot, path);
  const found = existsSync(absolute);

  return {
    passed: found,
    expected: `file exists at ${path}`,
    observed: found ? `file present at ${absolute}` : `file NOT FOUND at ${absolute}`,
    source_path: path,
    line_number: null,
    severity: found ? 'info' : 'error',
    remediation_hint: found
      ? null
      : `Confirm path is correct relative to repo root (${repoRoot}). Common cause: wrong app (EHG_Engineer vs ehg) or stale brainstorm content.`,
    validator_id: VALIDATOR_ID,
  };
}

export default { VALIDATOR_ID, validate, isFilePathToken };
