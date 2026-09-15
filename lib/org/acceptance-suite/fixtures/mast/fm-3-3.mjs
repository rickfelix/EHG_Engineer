/**
 * MAST FM-3.3 broken fixture: incorrect verification. Real field used: none (synthetic
 * verification.claimed_pass / actual_pass). CROSS-ENTITY (FR-2 AC-4: "any FC3 check that compares
 * a verifier's claim against an actual outcome" is named explicitly as needing this treatment,
 * same as FM-2.4/FM-2.5) -- the fixture carries 2 tasks, each with its own verification object.
 * The first (task-strategy-review) is broken: its verifier claims pass while the independent
 * ground-truth signal is false. The second (task-product-spec-review) is left well-formed
 * (claimed_pass and actual_pass both true), so a discrimination test can prove the check flags
 * only the broken verification, not merely "any task with a verification object present" (this
 * session's single-candidate mutation-testing gotcha).
 */
import { buildMockVentureOrganization, cloneOrganization } from '../mock-venture.mjs';

export function buildBrokenFixture() {
  const org = cloneOrganization(buildMockVentureOrganization());
  org.tasks[0].produced.verification.actual_pass = false;

  const wellFormedTask = cloneOrganization(org.tasks[0]);
  wellFormedTask.id = 'task-product-spec-review';
  wellFormedTask.produced.verification.actual_pass = true; // this second task's own verifier is correct
  org.tasks.push(wellFormedTask);

  return org;
}
