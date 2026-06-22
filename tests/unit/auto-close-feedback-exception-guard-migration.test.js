/**
 * SD-REFILL-003T5I5M — static parity test for the feedback auto-close EXCEPTION-guard migration.
 *
 * Verifies the UP migration adds the non-blocking guard (parity with the sibling auto-close
 * triggers), that the auto-close UPDATE logic is unchanged vs the DOWN (un-guarded) definition,
 * and that the DOWN restores the pre-guard function. Pure file reads — no DB.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG = resolve(__dirname, '../../database/migrations');
const UP = readFileSync(resolve(MIG, '20260621_auto_close_feedback_exception_guard.sql'), 'utf8');
const DOWN = readFileSync(resolve(MIG, '20260621_auto_close_feedback_exception_guard_DOWN.sql'), 'utf8');

// The two auto-close UPDATE statements — must be byte-identical in UP and DOWN (only the guard differs).
const updateBlocks = (sql) => (sql.match(/UPDATE feedback[\s\S]*?status NOT IN \('resolved', 'wont_fix', 'shipped'\);/g) || []);

describe('SD-REFILL-003T5I5M — feedback auto-close EXCEPTION-guard migration', () => {
  it('UP CREATE OR REPLACEs the feedback auto-close function', () => {
    expect(UP).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_auto_close_feedback_on_sd_completion\(\)/);
  });

  it('UP adds the non-blocking EXCEPTION guard (parity with sibling auto-close triggers)', () => {
    expect(UP).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(UP).toMatch(/RAISE WARNING 'fn_auto_close_feedback_on_sd_completion failed for SD %: %', NEW\.id, SQLERRM;/);
    // the guard must RETURN NEW so completion is never blocked
    const tail = UP.slice(UP.indexOf('EXCEPTION WHEN OTHERS THEN'));
    expect(tail).toMatch(/RETURN NEW;/);
  });

  it('DOWN restores the pre-guard function (no EXCEPTION handler)', () => {
    expect(DOWN).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_auto_close_feedback_on_sd_completion\(\)/);
    expect(DOWN).not.toMatch(/EXCEPTION WHEN OTHERS THEN/);
  });

  it('auto-close UPDATE logic is byte-identical between UP and DOWN (only the guard changes)', () => {
    const up = updateBlocks(UP);
    const down = updateBlocks(DOWN);
    expect(up).toHaveLength(2);        // FK linkage + legacy resolution_sd_id linkage
    expect(down).toHaveLength(2);
    expect(up).toEqual(down);
  });

  it('UP fires only on the transition TO completed (logic unchanged)', () => {
    expect(UP).toMatch(/NEW\.status = 'completed' AND \(OLD\.status IS NULL OR OLD\.status != 'completed'\)/);
  });
});
