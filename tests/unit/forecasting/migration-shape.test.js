// SD-LEO-FEAT-FORECAST-LEDGER-001 — FR-1 static shape assertion for the STAGED forecast_ledger
// migration. The migration is chairman-gated (cannot be applied in CI), so we assert the DDL TEXT.
// Pure fs read, no DB, no supabase import.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const sql = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../database/migrations/20260719_forecast_ledger_STAGED.sql'),
  'utf8',
);

describe('forecast_ledger migration shape (FR-1)', () => {
  it('is chairman-gated (@chairman-gated header)', () => {
    expect(sql).toMatch(/@chairman-gated/);
  });
  it('creates the table additively with the full row shape', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.forecast_ledger/);
    for (const col of ['question', 'question_class', 'p', 'horizon', 'resolution_criteria', 'model', 'status', 'resolved_outcome', 'brier_score', 'registered_by', 'registered_at', 'resolved_by', 'resolved_at']) {
      expect(sql).toMatch(new RegExp('\\b' + col + '\\b'));
    }
  });
  it('constrains p to [0,1] and status to open|resolved', () => {
    expect(sql).toMatch(/CHECK \(p >= 0 AND p <= 1\)/);
    expect(sql).toMatch(/status IN \('open','resolved'\)/);
  });
  it('enables RLS at create with a service-role-only policy (no broad authenticated read)', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/CREATE POLICY forecast_ledger_service_all/);
    // Least privilege: internal org-service ledger, no tenant column — a broad authenticated
    // USING(true) SELECT would leak every forecast (rls-anon-tenant-predicate-lint class).
    expect(sql).not.toMatch(/TO authenticated/);
  });
  it('installs a sealed-immutability UPDATE guard trigger (immutable registered fields + no re-resolve)', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.forecast_ledger_seal_guard/);
    expect(sql).toMatch(/BEFORE UPDATE ON public\.forecast_ledger/);
    expect(sql).toMatch(/sealed pre-registration/);
    expect(sql).toMatch(/already resolved/);
  });
});
