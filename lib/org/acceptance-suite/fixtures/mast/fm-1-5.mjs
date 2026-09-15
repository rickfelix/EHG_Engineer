/**
 * MAST FM-1.5 broken fixture: unaware of termination conditions. Real field used: none
 * (synthetic produced.terminated / termination_condition_met). Task reports terminated:true while
 * termination_condition_met stays false.
 */
import { buildMockVentureOrganization, cloneOrganization } from '../mock-venture.mjs';

export function buildBrokenFixture() {
  const org = cloneOrganization(buildMockVentureOrganization());
  org.tasks[0].produced.termination_condition_met = false;
  return org;
}
