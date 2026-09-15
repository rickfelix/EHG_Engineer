/**
 * MAST FM-3.1 broken fixture: premature termination. Real field used: none (synthetic
 * completion_checklist / completion_status). Task terminates with "methodology_present" still
 * unchecked.
 */
import { buildMockVentureOrganization, cloneOrganization } from '../mock-venture.mjs';

export function buildBrokenFixture() {
  const org = cloneOrganization(buildMockVentureOrganization());
  org.tasks[0].produced.completion_status.methodology_present = false;
  return org;
}
