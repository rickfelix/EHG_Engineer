/**
 * MAST FM-2.3 broken fixture: task derailment. Real field used: none (synthetic goal_topic /
 * output_topic). Task's output drifts to an unrelated topic.
 */
import { buildMockVentureOrganization, cloneOrganization } from '../mock-venture.mjs';

export function buildBrokenFixture() {
  const org = cloneOrganization(buildMockVentureOrganization());
  org.tasks[0].produced.output_topic = 'unrelated_hiring_plan';
  return org;
}
