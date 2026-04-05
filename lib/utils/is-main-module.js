/**
 * Cross-platform ESM entry-point guard.
 * Replaces the duplicated pattern: import.meta.url === `file://${process.argv[1]}`
 *
 * Handles: null argv, Unix paths, Windows backslash paths, triple-slash variant.
 * SD-LEO-INFRA-CENTRALIZE-ESM-ENTRY-001
 *
 * @param {string} importMetaUrl - The calling module's import.meta.url
 * @returns {boolean} true if the script was invoked directly via node
 */
export function isMainModule(importMetaUrl) {
  const arg = process.argv[1];
  if (!arg) return false;
  const normalized = `file:///${arg.replace(/\\/g, '/')}`;
  return importMetaUrl === `file://${arg}` || importMetaUrl === normalized;
}
