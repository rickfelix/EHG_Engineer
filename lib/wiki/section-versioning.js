/**
 * Pure versioning/validation logic for EHG Wiki sections, extracted from
 * scripts/wiki-section-upsert.js so it is unit-testable without a live DB.
 *
 * SD: SD-LEO-INFRA-EHG-WIKI-DURABLE-001
 */

export const WIKI_DOMAINS = ['identity', 'ventures', 'factory', 'personas', 'governance'];

export function isValidDomain(domain) {
  return WIKI_DOMAINS.includes(domain);
}

/**
 * Given the existing row (or null for a fresh insert) and the new content,
 * return the version the row should end up with. Content-identical updates
 * are a no-op version-wise.
 */
export function computeNextVersion(existing, newContent) {
  if (!existing) return 1;
  return existing.content === newContent ? existing.version : existing.version + 1;
}
