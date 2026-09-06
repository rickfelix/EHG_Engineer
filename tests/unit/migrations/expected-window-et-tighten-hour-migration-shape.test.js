// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A / FR-6 follow-up: SEC-M4 hour-class tightening (shape only).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG_DIR = path.resolve(here, '../../../database/migrations');
const up = fs.readFileSync(path.join(MIG_DIR, '20260906_periodic_process_registry_expected_window_et_tighten_hour.sql'), 'utf8');
const down = fs.readFileSync(path.join(MIG_DIR, '20260906_periodic_process_registry_expected_window_et_tighten_hour_DOWN.sql'), 'utf8');

const TIGHT = /'\^\(\[01\]\[0-9\]\|2\[0-3\]\):\[0-5\]\[0-9\]\$'/g;
const LOOSE = /'\^\[0-2\]\[0-9\]:\[0-5\]\[0-9\]\$'/g;

describe('expected_window_et hour-class tightening (SEC-M4)', () => {
  it('replaces the CHECK with a 00-23 hour class and never touches the column', () => {
    expect(up).toMatch(/DROP CONSTRAINT IF EXISTS periodic_process_registry_expected_window_et_shape_check/);
    expect(up).toMatch(/ADD CONSTRAINT periodic_process_registry_expected_window_et_shape_check/);
    expect((up.match(TIGHT) || []).length).toBe(2);
    // The loose class appears only inside the header comment that explains what it replaced.
    expect((up.replace(/^--.*$/gm, '').match(LOOSE) || []).length).toBe(0);
    expect(up).not.toMatch(/COLUMN/);
  });

  it('self-verifies that 25:00 is rejected and cleans its synthetic row', () => {
    expect(up).toContain('EXCEPTION WHEN check_violation THEN');
    expect(up).toContain("ASSERT v_rejected, 'EXPECTED-WINDOW-ET: out-of-range hour 25:00 was NOT rejected");
    expect(up).toContain('DELETE FROM public.periodic_process_registry WHERE process_key = v_key');
  });

  it('has no approved-by marker and the DOWN restores exactly the original CHECK without dropping the column', () => {
    expect(up).not.toMatch(/^--\s*@approved-by/m);
    expect((down.match(LOOSE) || []).length).toBe(2);
    expect(down).not.toMatch(/DROP COLUMN/);
  });
});
