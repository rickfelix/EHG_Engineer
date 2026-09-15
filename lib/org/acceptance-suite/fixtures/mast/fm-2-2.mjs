/**
 * MAST FM-2.2 broken fixture: fail to ask for clarification. Real field used: none (synthetic
 * spec.ambiguous_input / produced.clarification_request). Marks the task's input ambiguous but
 * lets it terminate without ever requesting clarification.
 */
import { buildMockVentureOrganization, cloneOrganization } from '../mock-venture.mjs';

export function buildBrokenFixture() {
  const org = cloneOrganization(buildMockVentureOrganization());
  org.tasks[0].spec.ambiguous_input = true;
  return org;
}
