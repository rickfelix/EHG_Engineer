/**
 * TS-3 (hardened per TESTING sub-agent review, sub_agent_execution_results id
 * cdb92643-a3df-471d-8a3b-a603a3edea71): in the SAME test run, against the SAME fixture and the
 * SAME Postgres connection, the bracket-class [0-9] query must return exactly 2 matches AND the
 * naive \d query must return 0 matches -- both asserted live, not documented as a prior
 * observation. This reproduces the exact hazard VALIDATION found on this SD's own LEAD-TO-PLAN
 * gate: regexp_match(text, 'Stage(\d+)') silently returned NULL/0-rows on a corpus provably
 * containing matches. Fixture is a self-contained VALUES() CTE -- no live table dependency, so
 * this test never depends on venture_stages' current contents.
 */
import { it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import { describeDb } from '../helpers/db-available.js';

let client;

beforeAll(async () => {
  client = await createDatabaseClient('engineer', { verify: false });
}, 30000);

afterAll(async () => {
  if (client) await client.end();
});

const FIXTURE_CTE = `
  WITH fixture(component_path) AS (
    VALUES ('Stage22DistributionSetup.tsx'), ('Stage21VisualAssets.tsx')
  )
`;

describeDb('TS-3: bracket-class regex vs naive \\d escape, same fixture, same run', () => {
  it('bracket-class [0-9] matches both fixture rows', async () => {
    const { rows } = await client.query(`${FIXTURE_CTE} SELECT component_path FROM fixture WHERE component_path ~ 'Stage[0-9]+'`);
    expect(rows.length).toBe(2);
  });

  it('the naive \\d escape reproduces the hazard: 0 matches on the identical fixture', async () => {
    const { rows } = await client.query(`${FIXTURE_CTE} SELECT component_path FROM fixture WHERE component_path ~ 'Stage\\d+'`);
    expect(rows.length).toBe(0);
  });
});
