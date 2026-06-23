// @wire-check-exempt: audit-guard library — its consumer is the regression test
// (tests/unit/session-hook-nodemodules-guard.test.js), not production runtime, by design.
/**
 * SD-REFILL-00BEALYD — SessionStart hook node_modules-wipe regression guard.
 *
 * Store-wipe #3 diagnostic: node_modules was wiped during a fleet-DORMANT window. The worktree-reaper,
 * scratch-sweep, and SD-completion teardown were exonerated by logs/timestamps. The 3 unaudited
 * SessionStart hooks (session-start-loader.ps1, telemetry-auto-trigger.cjs, agent-compiler-hook.cjs)
 * AND their spawned scripts were then audited and found to contain ZERO destructive node_modules
 * operations — exonerating them too (narrowing the remaining suspect to an external OS agent /
 * dormant-CC-crash, which the coordinator canary covers). This module makes that exoneration DURABLE:
 * a pure scanner + a settings.json resolver so a guard test fails if any SessionStart hook script
 * ever introduces a node_modules-wipe path. Recovery-side complement: the auto-heal SD-REFILL-00RXDLKM.
 */

// Strip comments so the guard flags EXECUTABLE destructive ops, not documentation. Without this, the
// recovery auto-heal hook (node-modules-autoheal.cjs) false-positives on its own defensive comments
// ("NEVER `npm ci` / `rm -rf node_modules`") while its actual code is additive (`npm install`).
// Removes JS block (/* */) and line (//) comments and shell/PowerShell line (#) comments.
export function stripComments(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // JS block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1') // JS line comments (avoid http:// via the preceding-char guard)
    .replace(/(^|\s)#[^\n]*/g, '$1');     // shell / PowerShell line comments
}

// Destructive node_modules operations a SessionStart hook must never contain (in executable code).
// `npm ci` / `npm prune` are included because they `rm -rf node_modules` first.
export const DESTRUCTIVE_PATTERNS = [
  { label: 'rm-rf-node_modules', re: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*\s+[^\n]*node_modules/ },
  { label: 'powershell-remove-item-node_modules', re: /Remove-Item\b[^\n]*node_modules/i },
  { label: 'rimraf-node_modules', re: /\brimraf\b[^\n]*node_modules/i },
  { label: 'rmdir-node_modules', re: /\brmdir\b[^\n]*node_modules|\bdel\b[^\n]*node_modules/i },
  { label: 'fs-rm-node_modules', re: /\bfs\.(rmSync|rmdirSync|rm|rmdir|unlinkSync)\s*\([^)]*node_modules/i },
  { label: 'npm-ci-or-prune', re: /\bnpm\s+(ci|prune|clean)\b/i },
];

/**
 * Pure: return the labels of any destructive node_modules operation found in a hook script's text.
 * @param {string} text
 * @returns {string[]} matched pattern labels (empty = clean)
 */
export function scanForDestructiveNodeModules(text) {
  if (typeof text !== 'string' || !text) return [];
  const code = stripComments(text); // guard executable code, not comments/docs
  const hits = [];
  for (const { label, re } of DESTRUCTIVE_PATTERNS) {
    try { if (re.test(code)) hits.push(label); } catch { /* never throw */ }
  }
  return hits;
}

/**
 * Pure: resolve the local script paths referenced by SessionStart hook commands in a settings object.
 * Handles `node <path> [args]` and `powershell ... -File <path>` forms; expands ${CLAUDE_PROJECT_DIR}
 * (and a leading ${VAR}) against `root`. Commands with no resolvable local .cjs/.js/.mjs/.ps1 script
 * are skipped.
 * @param {object} settings - parsed .claude/settings.json
 * @param {string} root - project root for relative resolution
 * @returns {string[]} resolved (or root-relative) script paths
 */
export function sessionStartHookScripts(settings, root = '.') {
  const out = [];
  const groups = settings?.hooks?.SessionStart;
  if (!Array.isArray(groups)) return out;
  const SCRIPT_RE = /([^\s"']+\.(?:cjs|mjs|js|ps1))/i;
  for (const g of groups) {
    for (const h of (g?.hooks || [])) {
      const cmd = typeof h?.command === 'string' ? h.command : '';
      if (!cmd) continue;
      const m = cmd.match(SCRIPT_RE);
      if (!m) continue;
      let p = m[1].replace(/\$\{CLAUDE_PROJECT_DIR\}|\$\{[A-Z_]+\}/g, root).replace(/^["']|["']$/g, '');
      // collapse a doubled root if the var already expanded to root
      out.push(p);
    }
  }
  return out;
}
