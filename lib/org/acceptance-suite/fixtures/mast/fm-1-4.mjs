/**
 * MAST FM-1.4 broken fixture: context truncation (proxy). Removes conversation turn 1 from
 * conversation_log while the task's spec still requires it -- simulating a truncated context
 * window.
 */
import { buildMockVentureOrganization, cloneOrganization } from '../mock-venture.mjs';

export function buildBrokenFixture() {
  const org = cloneOrganization(buildMockVentureOrganization());
  org.conversation_log = org.conversation_log.filter((entry) => entry.turn !== 1);
  return org;
}
