import { describe, it, expect, vi } from 'vitest';
import {
  sweepStageBearingColumnsSchemaWide,
  sweepCheckConstraintsContainingLiteral,
  countRowsInStageRange,
  countRowsMatchingStageEnumValues,
} from '../../lib/audits/stage-census/db-sweep.mjs';

// SD-LEO-INFRA-STAGE-KEYED-DATA-001 FR-1/FR-2/TR-1/TR-2: unit coverage for the schema-wide sweep
// functions added by this SD, using the file's existing injected-client pattern (a stub, not a
// live connection -- live-DB proof is TS-1/TS-2, standalone .mjs probes per TR-6).
function stubClient(rows) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

describe('sweepStageBearingColumnsSchemaWide', () => {
  it('queries information_schema.columns with NO table_name allowlist (schema-wide, unlike sweepStageBearingColumns)', async () => {
    const rows = [{ table_name: 'workflow_executions', column_name: 'current_stage', data_type: 'integer' }];
    const client = stubClient(rows);
    const result = await sweepStageBearingColumnsSchemaWide(client);
    expect(result).toEqual(rows);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/information_schema\.columns/);
    expect(sql).not.toMatch(/table_name\s*=\s*ANY/);
    expect(params).toBeUndefined();
  });

  it('returns an empty array when no stage-bearing columns exist', async () => {
    const client = stubClient([]);
    const result = await sweepStageBearingColumnsSchemaWide(client);
    expect(result).toEqual([]);
  });
});

describe('sweepCheckConstraintsContainingLiteral', () => {
  it('binds the literal as a query parameter, never interpolated into the SQL text', async () => {
    const rows = [{ table_name: 'eva_ventures', constraint_name: 'chk_lifecycle_stage', definition: 'CHECK (x <= 26)', columns: ['current_lifecycle_stage'] }];
    const client = stubClient(rows);
    const result = await sweepCheckConstraintsContainingLiteral(client, '26');
    expect(result).toEqual(rows);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).not.toContain("'26'");
    expect(sql).toMatch(/pg_constraint/);
    expect(sql).toMatch(/LIKE/);
    expect(params).toEqual(['26']);
  });

  it('enriches rows with constrained column names via a non-exclusionary LEFT JOIN (no HAVING filter)', async () => {
    const client = stubClient([]);
    await sweepCheckConstraintsContainingLiteral(client, '26');
    const [sql] = client.query.mock.calls[0];
    expect(sql).toMatch(/LEFT JOIN/);
    expect(sql).not.toMatch(/HAVING/);
  });

  it('returns an empty array when no CHECK constraint contains the literal', async () => {
    const client = stubClient([]);
    const result = await sweepCheckConstraintsContainingLiteral(client, '99');
    expect(result).toEqual([]);
  });
});

describe('countRowsInStageRange', () => {
  it('returns the count from the query result', async () => {
    const client = stubClient([{ n: 42 }]);
    const result = await countRowsInStageRange(client, 'workflow_executions', 'current_stage', 23, 26);
    expect(result).toBe(42);
    const [, params] = client.query.mock.calls[0];
    expect(params).toEqual([23, 26]);
  });

  it('quotes the table and column as DISTINCT identifiers, not the same value twice', async () => {
    const client = stubClient([{ n: 5 }]);
    await countRowsInStageRange(client, 'eva_ventures', 'current_lifecycle_stage', 23, 26);
    const [sql] = client.query.mock.calls[0];
    expect(sql).toContain('"eva_ventures"');
    expect(sql).toContain('"current_lifecycle_stage"::int');
    // Regression guard: an earlier draft substituted BOTH placeholders with the table name,
    // producing `WHERE "eva_ventures"::int BETWEEN ...` instead of the column.
    expect(sql).not.toContain('"eva_ventures"::int');
  });

  it('defaults to the 23-26 range when bounds are omitted', async () => {
    const client = stubClient([{ n: 0 }]);
    await countRowsInStageRange(client, 'compliance_violations', 'stage_number');
    const [, params] = client.query.mock.calls[0];
    expect(params).toEqual([23, 26]);
  });

  it('returns 0 when the query yields no row', async () => {
    const client = stubClient([]);
    const result = await countRowsInStageRange(client, 'stage_executions', 'lifecycle_stage');
    expect(result).toBe(0);
  });
});

describe('countRowsMatchingStageEnumValues', () => {
  it('generates the candidate value list and binds it as an array parameter', async () => {
    const client = stubClient([{ n: 3 }]);
    const result = await countRowsMatchingStageEnumValues(client, 'venture_artifacts', 'artifact_type', 'stage_', '_analysis', 23, 26);
    expect(result).toBe(3);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('"venture_artifacts"');
    expect(sql).toContain('"artifact_type"::text = ANY($1::text[])');
    expect(params).toEqual([['stage_23_analysis', 'stage_24_analysis', 'stage_25_analysis', 'stage_26_analysis']]);
  });

  it('returns 0 when no row matches', async () => {
    const client = stubClient([]);
    const result = await countRowsMatchingStageEnumValues(client, 't', 'c', 'stage_', '_analysis');
    expect(result).toBe(0);
  });
});
