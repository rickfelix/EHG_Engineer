/**
 * LineNumberClaimValidator — verifies a file:line:content claim by reading the
 * file and fuzzy-matching the expected text token at the cited line.
 *
 * Part of: SD-LEO-INFRA-BRAINSTORM-SOURCE-TRUTH-CHECK-001 (FR-2)
 *
 * Claim shape:
 *   { type: 'line_content', path: 'src/...', line: 270, expected_excerpt: 'gateType:' [, repo_root] }
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';

export const VALIDATOR_ID = 'line-number-claim-validator';

function fuzzyContains(haystack, needle) {
  if (!haystack || !needle) return false;
  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  return norm(haystack).includes(norm(needle));
}

export async function validate(claim, context = {}) {
  const repoRoot = claim?.repo_root || context.repo_root || process.cwd();
  const path = claim?.path;
  const line = Number(claim?.line);
  const expected = claim?.expected_excerpt;

  if (!path || !Number.isInteger(line) || line < 1 || !expected) {
    return {
      passed: false,
      expected: 'claim with path:string, line:int>=1, expected_excerpt:string',
      observed: JSON.stringify({ path, line: claim?.line, expected_excerpt: typeof expected }),
      source_path: path || null,
      line_number: Number.isInteger(line) ? line : null,
      severity: 'error',
      remediation_hint: 'Fix claim shape.',
      validator_id: VALIDATOR_ID,
    };
  }

  const absolute = resolve(repoRoot, path);
  let content;
  try {
    content = await readFile(absolute, 'utf-8');
  } catch (err) {
    return {
      passed: false,
      expected: `readable file at ${path}`,
      observed: `read error: ${err.code || err.message}`,
      source_path: path,
      line_number: line,
      severity: 'error',
      remediation_hint: 'Verify file path; brainstorm may reference moved/renamed file.',
      validator_id: VALIDATOR_ID,
    };
  }

  const lines = content.split('\n');
  if (line > lines.length) {
    return {
      passed: false,
      expected: `line ${line} within file (${lines.length} lines)`,
      observed: `file has only ${lines.length} lines`,
      source_path: path,
      line_number: line,
      severity: 'error',
      remediation_hint: 'Brainstorm cites out-of-bounds line; file may have shrunk since claim authored.',
      validator_id: VALIDATOR_ID,
    };
  }

  const actualLine = lines[line - 1];
  const passed = fuzzyContains(actualLine, expected);

  return {
    passed,
    expected: `line ${line} contains '${expected}'`,
    observed: `line ${line}: '${actualLine.trim().slice(0, 200)}'`,
    source_path: path,
    line_number: line,
    severity: passed ? 'info' : 'warning',
    remediation_hint: passed
      ? null
      : `Brainstorm cites text not at expected location. File may have been edited; consider updating brainstorm or recomputing line numbers.`,
    validator_id: VALIDATOR_ID,
  };
}

export default { VALIDATOR_ID, validate };
