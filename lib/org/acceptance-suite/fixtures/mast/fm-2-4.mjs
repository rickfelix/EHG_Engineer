/**
 * MAST FM-2.4 broken fixture: information withholding. Real field used: none (synthetic
 * handoffs[]). The mock-venture baseline already has 2 handoffs (cross-entity per FR-2 AC-4) --
 * this breaks only the first (strategy -> product) by dropping "methodology" from its payload,
 * leaving the second (product -> tech) well-formed, so a discrimination test can prove the check
 * flags only the broken one.
 */
import { buildMockVentureOrganization, cloneOrganization } from '../mock-venture.mjs';

export function buildBrokenFixture() {
  const org = cloneOrganization(buildMockVentureOrganization());
  const handoff = org.handoffs.find((h) => h.id === 'handoff-strategy-to-product');
  delete handoff.payload.methodology;
  return org;
}
