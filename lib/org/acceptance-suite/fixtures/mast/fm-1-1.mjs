/**
 * MAST FM-1.1 broken fixture: disobey task spec. Real field used: none (task/handoff synthetic
 * extension only, per FR-2's shape-correction). Clones the mock-venture baseline and removes a
 * required output field from its one task's produced output.
 */
import { buildMockVentureOrganization, cloneOrganization } from '../mock-venture.mjs';

export function buildBrokenFixture() {
  const org = cloneOrganization(buildMockVentureOrganization());
  delete org.tasks[0].produced.output.methodology;
  return org;
}
