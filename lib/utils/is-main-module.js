import { pathToFileURL } from 'node:url';

/**
 * Cross-platform ESM entry-point guard.
 * Replaces the duplicated pattern: import.meta.url === `file://${process.argv[1]}`
 *
 * Handles: null argv, Unix paths, Windows backslash paths, and paths with characters
 * (spaces, #, unicode) that a manual string-replace normalization mis-encodes —
 * pathToFileURL applies Node's own URL percent-encoding, the same encoding
 * import.meta.url itself uses.
 * SD-LEO-INFRA-CENTRALIZE-ESM-ENTRY-001 / SD-LEO-INFRA-ISMAINMODULE-WINDOWS-GUARD-CLASSFIX-001-A
 *
 * @param {string} importMetaUrl - The calling module's import.meta.url
 * @returns {boolean} true if the script was invoked directly via node
 */
export function isMainModule(importMetaUrl) {
  const arg = process.argv[1];
  if (!arg) return false;
  return importMetaUrl === pathToFileURL(arg).href;
}
