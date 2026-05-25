/**
 * QF-20260524-711 — pocock-weekly-deepening insufficient-findings is a no-op
 *
 * Regression guard: "no unconsumed findings to deepen this week" must be a
 * graceful no-op (exit 0), NOT a CI failure (emitFailureFeedback + exit 1).
 * The post-emission shortfall path (findings existed but emission fell short)
 * must REMAIN a real failure. Source-level pins (no DB / network required).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(
  __dirname,
  '../../../scripts/pocock/weekly-deepening-report.mjs'
);

const source = fs.readFileSync(SCRIPT, 'utf8');

describe('pocock weekly-deepening: insufficient findings is a no-op (QF-20260524-711)', () => {
  // Isolate the insufficient-INPUT branch precisely: from its message up to the
  // next structural delimiter (`if (opts.dryRun)` — the emit-path early return
  // that immediately follows the branch). This window is exactly the branch body.
  const branch = (() => {
    const start = source.indexOf('Insufficient unconsumed findings');
    expect(start).toBeGreaterThan(-1);
    const after = source.indexOf('if (opts.dryRun)', start);
    expect(after).toBeGreaterThan(start);
    return source.slice(start, after);
  })();

  it('exits 0 (no-op) on insufficient input — both modes', () => {
    expect(branch).toMatch(/no_op:\s*true/);
    expect(branch).toMatch(/process\.exit\(0\)/);
  });

  it('does NOT emit failure feedback or exit 1 on insufficient input', () => {
    expect(branch).not.toMatch(/emitFailureFeedback/);
    expect(branch).not.toMatch(/process\.exit\(1\)/);
  });

  it('PRESERVES the post-emission shortfall path as a real failure', () => {
    // "Emitted N < min" path (findings existed but emission fell short) must
    // still surface as a failure — guards against over-broadening the fix.
    const block = source.slice(source.indexOf('`Emitted '), source.indexOf('`Emitted ') + 400);
    expect(block).toMatch(/emitFailureFeedback/);
    expect(block).toMatch(/process\.exit\(1\)/);
  });
});
