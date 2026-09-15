/**
 * MAST FM-2.5 broken fixture: ignored other agent's input. Real field used: none (synthetic
 * contributions[] / incorporated_inputs). The baseline task has 2 contributions (cross-entity per
 * FR-2 AC-4); this drops VP_PRODUCT's contribution from incorporated_inputs while
 * VP_STRATEGY's remains incorporated, so a discrimination test can prove the check flags only
 * the ignored one.
 */
import { buildMockVentureOrganization, cloneOrganization } from '../mock-venture.mjs';

export function buildBrokenFixture() {
  const org = cloneOrganization(buildMockVentureOrganization());
  org.tasks[0].produced.incorporated_inputs = ['market_data_snapshot'];
  return org;
}
