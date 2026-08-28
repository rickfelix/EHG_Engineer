/**
 * Central-registry tables eligible for DB content parity assertions.
 * SD: SD-LEO-INFRA-CODE-CONTENT-PARITY-001 (FR-2)
 *
 * Adding a table requires explicit chairman-approved PR. Each addition compounds
 * gate runtime and false-positive surface area, so the seed is intentionally narrow.
 */

export const REGISTRY_TABLES = Object.freeze([
  // SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001 / FR-7: 'stage_config' was never a real table
  // (the live stage registry is `venture_stages`) -- this entry could never have matched
  // a row, silently no-oping any parity assertion registered against it.
  'venture_stages',
  'chairman_dashboard_config',
]);

export function isAllowedRegistryTable(name) {
  return typeof name === 'string' && REGISTRY_TABLES.includes(name);
}
