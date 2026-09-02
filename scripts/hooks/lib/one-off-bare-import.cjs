'use strict';

/**
 * ENF-18 bare-import-of-dangerous-one-off-script detection (SD-LEO-FIX-TEST-FIXTURE-LANE-001).
 *
 * THE INCIDENT THIS EXISTS FOR (2026-08-21): a Claude Code sub-agent ran an ad hoc ESM/CJS
 * interop check that bare-imported scripts/one-off/backfill-solomon-ledger-decision-by.mjs; the
 * script had no main-guard, so the mere `import()` executed a live prod backfill (1,241-row
 * decision_by overwrite). Confirmed at LEAD (live measurement): PreToolUse hooks DO fire for a
 * sub-agent's own Bash tool calls, identically to the main session -- this control is not
 * dead-by-construction.
 *
 * Mirrors force-push-operative.cjs (ENF-15) / no-verify-guard.cjs (ENF-16): a pure, unit-testable
 * decision module. The hook (pre-tool-enforce.cjs) owns audit-logging and the block/allow exit;
 * this module owns detection + the manifest lookup.
 *
 * OPERATIVE BOUNDARY (same convention as ENF-15/16): only an import()/require() call that starts
 * the command or follows a true shell separator (; & | ( \n && ||) is operative -- a MENTION of a
 * one-off path inside grep/cat/git-commit-message/etc. is never blocked, matching FR-3.
 *
 * KNOWN GAPS (documented, not silently claimed closed; security-agent EXEC review, SEC-F2): this
 * is a regex-based literal-shape detector, not a parser, so it is blind to: a dynamically-built
 * import specifier (string concatenation, a variable holding the path); any prefix before `node`
 * on the same command (an env var assignment, `npx`, `timeout`, `nohup`); a non-node runtime
 * (`tsx`, `bun`); file-indirection (a wrapper script that itself imports the target); a
 * `file://`/absolute-path specifier; and an uppercase path segment (matching is case-sensitive).
 * Every gap degrades to today's (pre-ENF-18) status quo, never worse. The manifest + this control
 * are defense-in-depth for the highest-frequency LITERAL bare-import shape that caused the
 * incident, not a proof against every possible obfuscation.
 */

const path = require('path');
const fs = require('fs');

const MANIFEST_PATH = path.resolve(__dirname, '..', '..', 'lint', 'one-off-mutate-key-manifest.json');

// Matches `import('...')`, `import "..."` (static form), `await import(...)`, and `require(...)`,
// each gated on the SAME operative-command boundary ENF-15/16 use, and requiring the specifier to
// reference a scripts/one-off/ path.
const OPERATIVE_ONE_OFF_IMPORT_RE =
  /(?:^|[;&|(\n]|&&|\|\|)\s*node\b[^\n]*?(?:\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(["'`])((?:\.{0,2}[/\\]+)?(?:[\w.-]+[/\\]+)*?scripts[/\\]+one-off[/\\]+[\w.-]+\.(?:mjs|cjs|js))\1/;

/**
 * Extract the scripts/one-off/** path an operative import()/require() targets, or null.
 * @param {string} cmd
 * @returns {string|null} repo-relative path (e.g. "scripts/one-off/foo.mjs"), normalized to `/`
 */
function extractOperativeOneOffImportPath(cmd) {
  if (typeof cmd !== 'string' || cmd.length === 0) return null;
  const m = OPERATIVE_ONE_OFF_IMPORT_RE.exec(cmd);
  if (!m) return null;
  const raw = m[2].replace(/\\+/g, '/');
  const idx = raw.indexOf('scripts/one-off/');
  return idx === -1 ? null : raw.slice(idx);
}

/**
 * A DIRECT execution (`node scripts/one-off/foo.mjs`, no import/require) is never operative for
 * this rule -- FR-3 explicitly allows it. Matched separately so extractOperativeOneOffImportPath
 * (which requires an import(/require( token) never fires on a direct-run command in the first
 * place; this helper exists for callers/tests that want to assert the negative explicitly.
 */
function isDirectExecution(cmd) {
  if (typeof cmd !== 'string') return false;
  return /(?:^|[;&|(\n]|&&|\|\|)\s*node\s+(?!.*\b(?:import|require)\s*\()[^\n]*?scripts\/one-off\/[\w.-]+\.(?:mjs|cjs|js)\b/.test(cmd);
}

/**
 * Load the dangerous-file manifest. FAIL OPEN on any read/parse error (TR-2): an unreadable or
 * corrupt manifest must never block a command -- it can only ever widen what is allowed.
 * @param {string} [manifestPath]
 * @returns {{ dangerous: Record<string,unknown>, ok: boolean }}
 */
function loadManifest(manifestPath = MANIFEST_PATH) {
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const json = JSON.parse(raw);
    const dangerous = json && typeof json.dangerous === 'object' && json.dangerous !== null ? json.dangerous : {};
    return { dangerous, ok: true };
  } catch {
    return { dangerous: {}, ok: false };
  }
}

/**
 * Decide the ENF-18 outcome for a Bash command.
 *
 * Override: a single env var LEO_ALLOW_ONE_OFF_IMPORT whose non-empty VALUE is the audited
 * reason (mirrors ENF-16's LEO_ALLOW_NO_VERIFY convention).
 *
 * @param {string} cmd
 * @param {Object} [env=process.env]
 * @param {{loadManifest?: Function}} [deps] - injectable for tests
 * @returns {{matched: boolean, outcome?: 'block'|'override'|'allow', reason?: string, targetPath?: string, overrideReason?: string|null, manifestOk?: boolean}}
 */
function decideOneOffBareImport(cmd, env = process.env, deps = {}) {
  const targetPath = extractOperativeOneOffImportPath(cmd);
  if (!targetPath) return { matched: false };

  const { loadManifest: load = loadManifest } = deps;
  const { dangerous, ok: manifestOk } = load();

  // Fail-open (TR-2): a manifest we could not read/parse must never block.
  if (!manifestOk) {
    return { matched: true, outcome: 'allow', reason: 'manifest_unreadable_fail_open', targetPath, manifestOk: false };
  }

  if (!(targetPath in dangerous)) {
    return { matched: true, outcome: 'allow', reason: 'not_in_dangerous_manifest', targetPath, manifestOk: true };
  }

  const overrideReason = ((env && env.LEO_ALLOW_ONE_OFF_IMPORT) || '').trim();
  if (overrideReason.length > 0) {
    return { matched: true, outcome: 'override', reason: 'override_granted', targetPath, overrideReason, manifestOk: true };
  }

  return { matched: true, outcome: 'block', reason: 'dangerous_bare_import', targetPath, overrideReason: null, manifestOk: true };
}

module.exports = {
  OPERATIVE_ONE_OFF_IMPORT_RE,
  MANIFEST_PATH,
  extractOperativeOneOffImportPath,
  isDirectExecution,
  loadManifest,
  decideOneOffBareImport,
};
