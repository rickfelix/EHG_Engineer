/**
 * SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 — regression test for the incident, 2026-08-21:
 * a bare `import('./scripts/one-off/backfill-solomon-ledger-decision-by.mjs')`, done purely to
 * check ESM/CJS interop, executed main() for real against LIVE PRODUCTION because the script had
 * no main-guard — 1212 solomon_advice_outcome_ledger.decision_by rows mutated irreversibly.
 *
 * A main-guard (fileURLToPath(import.meta.url) === process.argv[1]) was added, but per the
 * EXEC-phase SECURITY review: "the guard has ZERO regression test coverage... the sole control
 * against recurrence of a 1212-row irreversible data-loss event can be deleted by any refactor
 * with a fully green suite." This closes that gap directly: mock @supabase/supabase-js so that IF
 * main() ran, createClient would be observably called — then prove it is NOT called merely by
 * importing the module.
 */
import { describe, it, expect, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

describe('backfill-solomon-ledger-decision-by.mjs — import safety (main-guard regression)', () => {
  it('importing the module for inspection never constructs a Supabase client — proves main() did not run', async () => {
    await import('../../scripts/one-off/backfill-solomon-ledger-decision-by.mjs');
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
