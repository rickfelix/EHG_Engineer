// SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A -- FR-5, TS-8. Source-pin the producer claim: both
// existing artifact-type-producer-parity guards iterate the JS ARTIFACT_TYPES registry only and
// cannot see into a DB function body, so registering LAUNCH_USAGE_SIGNAL there would make the
// producer-parity test pass on a claim nothing in JS actually implements -- the RPC does, in SQL.
// This test reads the migration file IN-TEST, asserts the anchor is actually found (so a stale
// test cannot silently pass on nothing), then proves the check is mutation-sensitive.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATION_PATH = fileURLToPath(
  new URL('../../../database/chairman-gated/20260826_venture_usage_events_rpc.sql', import.meta.url),
);

function migrationProducesArtifact(sql) {
  return (
    /INSERT INTO public\.venture_artifacts/.test(sql) &&
    /'launch_usage_signal'/.test(sql) &&
    /fn_submit_venture_usage_event/.test(sql)
  );
}

describe('SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A FR-5: RPC producer source-pin', () => {
  it('the staged migration file exists and is readable', () => {
    expect(() => fs.readFileSync(MIGRATION_PATH, 'utf8')).not.toThrow();
  });

  it('the real migration file DOES contain the venture_artifacts producer INSERT for launch_usage_signal', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8').replace(/\r\n/g, '\n');
    expect(migrationProducesArtifact(sql)).toBe(true);
  });

  it('MUTATION: removing the producer INSERT is detected -- proves this check is not vacuous', () => {
    const original = fs.readFileSync(MIGRATION_PATH, 'utf8').replace(/\r\n/g, '\n');
    const anchor = "INSERT INTO public.venture_artifacts (\n      venture_id, lifecycle_stage, artifact_type, title, is_current, metadata\n    ) VALUES (\n      p_venture_id, v_stage_number, 'launch_usage_signal', 'Usage Signal Wired', true,";
    const mutated = original.replace(anchor, '-- PRODUCER REMOVED BY TEST MUTATION\n    SELECT NULL WHERE FALSE; --');
    expect(mutated, 'mutation anchor not found -- test is stale against the real migration file').not.toBe(original);
    expect(migrationProducesArtifact(mutated)).toBe(false);
    // original is never written back to disk -- this test only mutates an in-memory string.
    expect(migrationProducesArtifact(original)).toBe(true);
  });

  it('a migration file that merely MENTIONS launch_usage_signal without the RPC context is correctly rejected', () => {
    const fakeMinimal = "-- some comment about 'launch_usage_signal' with no INSERT and no RPC name";
    expect(migrationProducesArtifact(fakeMinimal)).toBe(false);
  });
});
