/**
 * MAST FM-3.2 broken fixture: no or incomplete verification. Real field used: none (synthetic
 * verification.covers). Drops "methodology_non_empty" from the covered checks while the task's
 * spec still requires it.
 */
import { buildMockVentureOrganization, cloneOrganization } from '../mock-venture.mjs';

export function buildBrokenFixture() {
  const org = cloneOrganization(buildMockVentureOrganization());
  org.tasks[0].produced.verification.covers = ['tam_usd_is_number'];
  return org;
}
