/**
 * Central-registry tables eligible for DB content parity assertions.
 * SD: SD-LEO-INFRA-CODE-CONTENT-PARITY-001 (FR-2)
 *
 * Adding a table requires explicit chairman-approved PR. Each addition compounds
 * gate runtime and false-positive surface area, so the seed is intentionally narrow.
 */

export const REGISTRY_TABLES = Object.freeze([
  'stage_config',
  'chairman_dashboard_config',
]);

export function isAllowedRegistryTable(name) {
  return typeof name === 'string' && REGISTRY_TABLES.includes(name);
}
