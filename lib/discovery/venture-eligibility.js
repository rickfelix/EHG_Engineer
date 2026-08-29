/**
 * Venture eligibility for the recurring competitive-baseline pass.
 * SD: SD-LEO-INFRA-COMPETITIVE-BASELINES-RECURRING-001
 *
 * NOT a reuse of lib/chairman/chairman-actionable.mjs's isFixtureVenture as-is: that predicate
 * deliberately FAILS OPEN (null/unreadable venture => not-a-fixture => included), which is
 * correct for its own console-fairness use case and wrong for a Tavily-spending, gate-table-
 * writing loop. This wrapper fails CLOSED -- a venture with a missing/unreadable name is
 * EXCLUDED, never included by default.
 */
import { isFixtureVenture } from '../chairman/chairman-actionable.mjs';

/**
 * @param {{name?: string, is_demo?: boolean, status?: string}|null|undefined} venture
 * @returns {boolean} true only for a real, named, non-fixture, active venture.
 */
export function isEligibleForBaselineResearch(venture) {
  if (!venture) return false;
  if (typeof venture.name !== 'string' || venture.name.trim() === '') return false;
  if (venture.status !== 'active') return false;
  if (isFixtureVenture(venture)) return false;
  return true;
}
