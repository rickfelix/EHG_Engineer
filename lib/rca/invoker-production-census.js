/**
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-6.
 *
 * Repo-wide census of references to lib/error-triggered-sub-agent-invoker.js, accounting
 * for static `import ... from`, `require(...)`, AND dynamic `await import(...)` — unlike the
 * pre-existing pin at lib/handoff/preflight-auto-invoke.test.js:83-98, which only scans 2
 * named files with a static-import-only regex (blind to dynamic import()/require()/a third
 * importing file/barrel re-exports).
 *
 * This is the FR-6 verification tool: confirms zero NEW production call sites in this SD's
 * changes. The invoker is expected/known to be imported by exactly one pre-existing test
 * (tests/integration/error-triggered-invocation.integration.test.js) — that is not a
 * production call site and does not violate DESIGN-only status.
 */
import { execSync } from 'child_process';

export const INVOKER_MODULE_TOKEN = 'error-triggered-sub-agent-invoker';

/** An actual import-like reference: static import, require(), or dynamic import(). */
const IMPORT_LIKE_RE = new RegExp(
  `\\b(?:from\\s+['"]|require\\(\\s*['"]|import\\(\\s*['"])[^'"]*${INVOKER_MODULE_TOKEN}`
);

/** True for a path that is itself a test file (expected/acceptable importer). */
export function isTestFilePath(filePath) {
  return /(^|\/)tests\//i.test(filePath) || /\.(test|spec)\.[jt]sx?$/i.test(filePath);
}

/** A comment line — JSDoc continuation (`*`), line comment (`//`), or block-open (`/**`). */
const COMMENT_LINE_RE = /^\s*(?:\*|\/\/|\/\*)/;

/**
 * Parse `git grep -n` output lines of the form "path/to/file.js:123:<line content>" into
 * structured matches, filtered to only actual import-like references. Comment lines (JSDoc
 * usage examples, `//` notes) are excluded — the invoker's own file documents its usage in a
 * header comment, which is not a real call site.
 */
export function parseGrepOutput(output) {
  const lines = String(output || '').trim().split('\n').filter(Boolean);
  const matches = [];
  for (const line of lines) {
    const firstColon = line.indexOf(':');
    const secondColon = line.indexOf(':', firstColon + 1);
    if (firstColon === -1 || secondColon === -1) continue;
    const file = line.slice(0, firstColon);
    const lineNo = line.slice(firstColon + 1, secondColon);
    const content = line.slice(secondColon + 1);
    if (COMMENT_LINE_RE.test(content)) continue;
    if (IMPORT_LIKE_RE.test(content)) {
      matches.push({ file, line: Number(lineNo), content: content.trim() });
    }
  }
  return matches;
}

/** Classify import-like matches into production vs test-file call sites. */
export function classifyMatches(matches) {
  const productionMatches = matches.filter((m) => !isTestFilePath(m.file));
  const testMatches = matches.filter((m) => isTestFilePath(m.file));
  return { productionMatches, testMatches };
}

/**
 * Run the repo-wide census via `git grep` (fast, respects tracked files). Returns a
 * structured report; never throws on "zero matches found" (git grep's own exit code 1).
 *
 * @param {string} repoRoot
 * @param {Function} [execFn] - injectable for testing; defaults to child_process.execSync
 */
export function censusInvokerReferences(repoRoot, execFn = execSync) {
  let output = '';
  try {
    output = execFn(`git grep -n -I -e "${INVOKER_MODULE_TOKEN}"`, { cwd: repoRoot, encoding: 'utf-8' });
  } catch (err) {
    if (err && err.status === 1) {
      return { matches: [], productionMatches: [], testMatches: [] };
    }
    throw err;
  }
  const matches = parseGrepOutput(output);
  const { productionMatches, testMatches } = classifyMatches(matches);
  return { matches, productionMatches, testMatches };
}
