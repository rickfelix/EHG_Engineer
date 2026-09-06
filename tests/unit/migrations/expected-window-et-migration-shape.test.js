// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A / FR-6, TS-7 (migration shape; no scratch-DB harness).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG_DIR = path.resolve(here, '../../../database/migrations');
const up = fs.readFileSync(path.join(MIG_DIR, '20260906_periodic_process_registry_expected_window_et.sql'), 'utf8');
const down = fs.readFileSync(path.join(MIG_DIR, '20260906_periodic_process_registry_expected_window_et_DOWN.sql'), 'utf8');

describe('expected_window_et migration shape (FR-6)', () => {
  it('adds a nullable jsonb column additively (IF NOT EXISTS) with a shape CHECK and a COMMENT', () => {
    expect(up).toMatch(/ADD COLUMN IF NOT EXISTS expected_window_et JSONB NULL/);
    expect(up).toMatch(/ADD CONSTRAINT periodic_process_registry_expected_window_et_shape_check/);
    expect(up).toMatch(/expected_window_et IS NULL/);
    expect(up).toMatch(/'\^\[0-2\]\[0-9\]:\[0-5\]\[0-9\]\$'/);
    expect(up).toMatch(/COMMENT ON COLUMN public\.periodic_process_registry\.expected_window_et/);
  });

  it('self-verifies: column present, round-trip, malformed rejected, NULL legal, synthetic row deleted', () => {
    expect(up).toContain("column_name = 'expected_window_et'");
    expect(up).toContain('EXCEPTION WHEN check_violation THEN');
    expect(up).toContain("ASSERT v_rejected, 'EXPECTED-WINDOW-ET: malformed window was NOT rejected");
    expect(up).toContain('DELETE FROM public.periodic_process_registry WHERE process_key = v_key');
  });

  it('is dormant-but-safe (no approved-by marker) and the DOWN drops exactly the CHECK and the column', () => {
    expect(up).not.toMatch(/^--\s*@approved-by/m);
    expect(down).toMatch(/DROP CONSTRAINT IF EXISTS periodic_process_registry_expected_window_et_shape_check/);
    expect(down).toMatch(/DROP COLUMN IF EXISTS expected_window_et/);
    expect((down.match(/DROP /g) || []).length).toBe(2);
  });
});
