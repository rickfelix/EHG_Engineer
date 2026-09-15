/**
 * MAST FM-1.2 broken fixture: disobey role spec. Real field used: capabilities (ROLE_FIELD_KEYS).
 * VP_STRATEGY is assigned a task requiring "code_generation" -- a capability it does not carry
 * (that belongs to VP_TECH in STANDARD_VENTURE_TEMPLATE).
 */
import { buildMockVentureOrganization, cloneOrganization } from '../mock-venture.mjs';

export function buildBrokenFixture() {
  const org = cloneOrganization(buildMockVentureOrganization());
  org.tasks[0].spec.required_capability = 'code_generation';
  return org;
}
