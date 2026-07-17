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

// ── FR-1 (SD-LEO-INFRA-MAKE-WSJF-SELF-001): superset dependency-ref extractor ──
// ONE function returning every dependency ref an SD row declares, across ALL live sources:
//   top-level `dependencies` column + metadata.dependencies + metadata.depends_on
//   + metadata.blocked_by_sd_key + metadata.blocked_on_sd.
// Per-entry ref rule is the loose draftDepsSatisfied / claim-gate heritage (NOT the strict
// SD_KEY_RE above): string -> first whitespace token; object -> sd_id || sd_key || id — so
// uuid-shaped refs survive for id-column resolution. 'none'/'None' sentinels are DROPPED
// (non-blocking), never returned as refs. A self-referential ref (an SD listing itself) is
// returned as-is — extraction is flat, so callers simply resolve it against live status
// (a non-completed self blocks); no recursion/looping is possible here. Deduped.
const NONE_SENTINELS = new Set(['none', 'None']);

function refFromDependencyEntry(entry) {
  let k = null;
  if (typeof entry === 'string') k = entry.split(/\s/)[0];
  else if (entry && typeof entry === 'object') k = entry.sd_id || entry.sd_key || entry.id || null;
  if (typeof k !== 'string' || !k || NONE_SENTINELS.has(k)) return null;
  return k;
}

function toDependencyArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* not a JSON array -> no refs from this source */ }
  }
  return [];
}

/**
 * @param {object|null|undefined} sd - SD row with `dependencies` and/or `metadata`
 * @returns {string[]} deduped dependency refs (sd_keys or uuids); sentinels dropped
 */
function extractAllDependencyRefs(sd) {
  const row = sd || {};
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const refs = [];
  for (const source of [row.dependencies, meta.dependencies]) {
    for (const entry of toDependencyArray(source)) {
      const k = refFromDependencyEntry(entry);
      if (k) refs.push(k);
    }
  }
  // metadata.depends_on: a single ref (string/object) or an array of them.
  for (const entry of Array.isArray(meta.depends_on) ? meta.depends_on : [meta.depends_on]) {
    const k = entry == null ? null : refFromDependencyEntry(entry);
    if (k) refs.push(k);
  }
  // Single-ref string holds, kept WHOLE (no token split — existing blocked_on_sd semantics):
  // blocked_by_sd_key (coordinator ranker) + blocked_on_sd (QF-20260706-786 live re-check).
  for (const single of [meta.blocked_by_sd_key, meta.blocked_on_sd]) {
    if (typeof single === 'string' && single && !NONE_SENTINELS.has(single)) refs.push(single);
  }
  return [...new Set(refs)];
}

module.exports = { parseSdDependencies, SD_KEY_RE, extractAllDependencyRefs };
