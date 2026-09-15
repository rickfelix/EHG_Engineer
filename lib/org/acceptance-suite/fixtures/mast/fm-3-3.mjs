/**
 * MAST FM-3.3 broken fixture: incorrect verification. Real field used: none (synthetic
 * verification.claimed_pass / actual_pass). Verifier claims pass while the independent
 * ground-truth signal is false.
 */
import { buildMockVentureOrganization, cloneOrganization } from '../mock-venture.mjs';

export function buildBrokenFixture() {
  const org = cloneOrganization(buildMockVentureOrganization());
  org.tasks[0].produced.verification.actual_pass = false;
  return org;
}
