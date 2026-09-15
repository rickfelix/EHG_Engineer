/**
 * MAST FM-1.3 broken fixture: step repetition. Real field used: none (synthetic history[]).
 * Injects 3 consecutive identical step entries, simulating a stuck/looping task.
 */
import { buildMockVentureOrganization, cloneOrganization } from '../mock-venture.mjs';

export function buildBrokenFixture() {
  const org = cloneOrganization(buildMockVentureOrganization());
  org.tasks[0].history = [
    { step: 1, description: 'gather_market_data' },
    { step: 2, description: 'gather_market_data' },
    { step: 3, description: 'gather_market_data' },
  ];
  return org;
}
