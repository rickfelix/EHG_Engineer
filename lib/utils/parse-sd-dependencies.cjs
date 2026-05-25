/**
 * Canonical SD-dependency blocker rule (CJS) — QF-20260525-542 /
 * PAT-COORDINATOR-DEP-EVAL-DIVERGENCE-001.
 *
 * Mirrors the ESM SSOT parseDependencies() in
 * scripts/modules/sd-next/dependency-resolver.js for CJS consumers (the
 * coordinator scripts can't import the ESM module). An entry counts as a real
 * blocker ONLY if it carries an SD-key (string value, or sd_key/id/sd_id field)
 * matching /^SD-[A-Z0-9-]+/. Object-shaped "none/available" placeholders and
 * free-text prerequisites are ignored — so a no-dependency SD is never falsely
 * flagged BLOCKED. Returns an array of blocker SD-key strings (deduped).
 *
 * @param {string|Array|null|undefined} dependencies
 * @returns {string[]} blocker SD-keys (empty when there are no real deps)
 */
const SD_KEY_RE = /^(SD-[A-Z0-9-]+)/;

function parseSdDependencies(dependencies) {
  if (!dependencies) return [];

  let deps = dependencies;
  if (typeof dependencies === 'string') {
    try {
      const parsed = JSON.parse(dependencies);
      deps = Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (!Array.isArray(deps)) return [];

  const keys = deps
    .map((dep) => {
      if (typeof dep === 'string') {
        const m = dep.match(SD_KEY_RE);
        return m ? m[1] : null;
      }
      if (dep && typeof dep === 'object') {
        const candidate = dep.sd_key || dep.id || dep.sd_id;
        if (typeof candidate === 'string') {
          const m = candidate.match(SD_KEY_RE);
          return m ? m[1] : null;
        }
      }
      return null;
    })
    .filter(Boolean);

  return [...new Set(keys)];
}

module.exports = { parseSdDependencies, SD_KEY_RE };
