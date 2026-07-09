/**
 * T0 source-EXISTS static probe — L1 runtime anti-stub dimension
 * (docs/design/value-authenticity-system-design.md §1-L1, criterion
 * VA-T0-source-exists). SD-LEO-INFRA-VALUE-AUTHENTICITY-APA-001.
 *
 * AST/grep-based static check: a value-engine module must reference at
 * least one external dependency (model/LLM call, external fetch, DB/corpus
 * read) somewhere in its own source. A module that is a pure function of
 * only its own input arguments — no external I/O anywhere in its source —
 * is an automatic finding (catches the "honest stub": no external
 * dependency, no attempt to hide it).
 *
 * Zero live-instance dependency: runs on source text alone.
 *
 * @module lib/apa/value-authenticity-t0
 */

/** Patterns indicating a real external dependency is present in source. */
const EXTERNAL_DEPENDENCY_PATTERNS = [
  /\bfetch\s*\(/,
  /\baxios\b/,
  /\bawait\s+.*\.(get|post|put|patch|delete)\s*\(/i,
  /\bsupabase\b.*\.from\s*\(/,
  /\b(openai|anthropic|gemini)\b/i,
  /\brequire\s*\(\s*['"]https?:/,
  /\bnew\s+URL\s*\(/,
  /\breadFile(Sync)?\s*\(/,
  /\bquery\s*\(\s*['"]SELECT/i,
];

/**
 * Statically check a value-engine module's source for any external
 * dependency reference. Returns a finding when none is present.
 * @param {{modulePath: string, sourceText: string}} target
 * @returns {{finding: boolean, reason: string}}
 */
export function checkSourceExists(target) {
  const { modulePath, sourceText } = target;
  if (typeof sourceText !== 'string' || sourceText.length === 0) {
    throw new Error(`[value-authenticity-t0] checkSourceExists: empty or missing sourceText for ${modulePath}`);
  }

  const hasExternalDependency = EXTERNAL_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(sourceText));

  if (!hasExternalDependency) {
    return {
      finding: true,
      reason: `T0 source-EXISTS: ${modulePath} has no detectable external dependency (model call, fetch, DB/corpus read) — pure function of its own input arguments. Automatic finding per VA-T0-source-exists.`,
    };
  }

  return { finding: false, reason: `T0 source-EXISTS: ${modulePath} references at least one external dependency.` };
}

export default { checkSourceExists };
