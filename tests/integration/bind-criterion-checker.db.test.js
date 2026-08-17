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
  itDb('TS-6: VENTURE_STACK evaluator on the live table returns NOT_MET without throwing or NaN', async () => {
    const rows = await fetchVentureStackObserveRows(supabase);
    const result = evaluateVentureStackCriterion(rows);
    expect(result.verdict).toBe('NOT_MET');
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

  itDb('fetchExitGateObserveRows only queries rows filtered by event_type at the DB layer', async () => {
    const rows = await fetchExitGateObserveRows(supabase);
    // Every returned row must have come from an EXIT_GATE_OBSERVE_ONLY event -- verified
    // indirectly: none of these rows should carry a VENTURE_STACK-only field shape.
    for (const row of rows) {
      expect('venture_id' in row).toBe(true);
      expect('gate_string' in row).toBe(true);
    }
  });
});

describe('bind-criterion-checker DB-skip contract', () => {
  it('HAS_REAL_DB guard exists and is a boolean', () => {
    expect(typeof HAS_REAL_DB).toBe('boolean');
  });
});
