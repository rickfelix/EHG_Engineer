/**
 * SD-LEO-INFRA-BIND-OBSERVE-ONLY-001, TS-6 + TS-8.
 *
 * Integration coverage against the LIVE system_events table (no mocks). Read-only: the
 * checker module never writes, so there is no fixture setup/teardown needed here -- these
 * tests observe today's actual data rather than manufacturing it.
 */
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { describeDb, itDb, HAS_REAL_DB } from '../helpers/db-available.js';
import {
  CANDIDATE_GATE_STRINGS,
  fetchExitGateObserveRows,
  fetchVentureStackObserveRows,
  groupRowsByGateString,
  evaluateExitGateCriterion,
  evaluateVentureStackCriterion,
} from '../../lib/eva/lifecycle/bind-criterion-checker.js';

const supabase = HAS_REAL_DB
  ? createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

describeDb('bind-criterion-checker against live system_events (TS-6, TS-8)', () => {
  // Adversarial-review fix: this used to hardcode verdict='NOT_MET'. That is today's live
  // state, but NOT_MET-forever is the opposite of what this tool is FOR -- once VENTURE_STACK
  // observation data naturally accumulates past the criterion (the tool's own purpose), this
  // assertion would start failing as a false CI "regression" with no code defect involved.
  // Assert the verdict is a valid member of the enum instead, matching TS-8's own pattern below.
  itDb('TS-6: VENTURE_STACK evaluator on the live table returns a valid verdict without throwing or NaN', async () => {
    const rows = await fetchVentureStackObserveRows(supabase);
    const result = evaluateVentureStackCriterion(rows);
    expect(['MEETS_CRITERION', 'NOT_MET']).toContain(result.verdict);
    if (result.verdict === 'NOT_MET') {
      expect(['insufficient_rows', 'insufficient_span']).toContain(result.reason);
    }
    expect(typeof result.row_count).toBe('number');
    expect(Number.isNaN(result.span_hours)).toBe(false);
    if (result.false_positive_proxy_rate !== null) {
      expect(Number.isNaN(result.false_positive_proxy_rate)).toBe(false);
    }
  });

  itDb('TS-8: live run against all 5 candidate gate-strings reports a verdict for each, none throwing', async () => {
    const exitRows = await fetchExitGateObserveRows(supabase);
    const { groups, malformed } = groupRowsByGateString(exitRows);

    expect(groups.size).toBe(CANDIDATE_GATE_STRINGS.length);
    expect(Array.isArray(malformed)).toBe(true);

    for (const candidate of CANDIDATE_GATE_STRINGS) {
      const key = `${candidate.stage_number}::${candidate.gate_string}`;
      const rows = groups.get(key) || [];
      const result = evaluateExitGateCriterion(rows);
      expect(['MEETS_CRITERION', 'NOT_MET']).toContain(result.verdict);
      if (result.verdict === 'NOT_MET') {
        expect(['insufficient_rows', 'insufficient_span', 'flagship_veto']).toContain(result.reason);
      }
      expect(Number.isNaN(result.span_hours)).toBe(false);
    }
  });

  // Adversarial-review fix: the prior version of this test only checked returned-row SHAPE,
  // which is guaranteed by fetchExitGateObserveRows's own mapper regardless of whether the
  // event_type filter is actually applied -- it would pass unchanged even with the .eq() call
  // deleted. This version proves the filter is real: an independent, ground-truth exact count
  // for the SAME event_type must match what the function returns. Since system_events holds
  // 141k+ rows across all event types combined, an accidentally-removed filter would return a
  // count wildly larger than this independent count, failing loudly.
  itDb('fetchExitGateObserveRows genuinely filters by event_type at the DB layer (not a post-fetch JS filter)', async () => {
    const { count: groundTruthCount, error } = await supabase
      .from('system_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'EXIT_GATE_OBSERVE_ONLY');
    expect(error).toBeNull();

    const rows = await fetchExitGateObserveRows(supabase);
    expect(rows.length).toBe(groundTruthCount);
  });
});

describe('bind-criterion-checker DB-skip contract', () => {
  it('HAS_REAL_DB guard exists and is a boolean', () => {
    expect(typeof HAS_REAL_DB).toBe('boolean');
  });
});
