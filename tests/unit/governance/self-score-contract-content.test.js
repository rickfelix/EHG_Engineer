/**
 * FR-5: the role contracts must SAY the three things, and a test must actually READ them.
 * SD-LEO-INFRA-ROLE-SESSION-SELF-001.
 *
 * WHY NOT check-claude-md-drift.cjs, which was the PRD's original guarantor and had to be replaced.
 * That script is a DIGEST-EQUALITY check between leo_protocol_sections and
 * claude-generation-manifest.json: it verifies the markdown was regenerated after a DB edit and has
 * NO IDEA WHAT THE TEXT SAYS. One could write "the scorers ship live and leo_feature_flags is a
 * gate" — the exact opposite of the requirement — and it would pass clean. It is also a global
 * exit 0/1, so "passes against sections 601/611" is not even expressible.
 *
 * Naming it as the guarantee for a CONTENT claim would have installed a check that cannot see its
 * subject as the guardian of the fix for checks that cannot see their subject. Drift-check keeps
 * its real job (did the docs propagate?); this asserts what they propagated.
 *
 * DB-backed by necessity: the contract lives in leo_protocol_sections, so reading a file would be
 * reading a copy. Skips cleanly when no service credentials are present rather than failing CI for
 * an unrelated reason.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// THE GUARD HAS TO SEE THROUGH THE TEST HARNESS'S OWN PLACEHOLDER.
// tests/setup.unit.js does `SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key-not-real'`, so a
// bare Boolean(KEY) is ALWAYS true and describe.skipIf never skips — the suite then fails in CI
// (unit-tier.yml passes no env) for want of credentials rather than for a real defect. A guard that
// cannot distinguish a real key from the harness's stand-in is itself a check that cannot see its
// subject, which is the defect this SD exists to remove. Reject the known placeholder explicitly.
const PLACEHOLDER = /not-real|placeholder|^test-/i;
const CAN_RUN = Boolean(URL_ && KEY && !PLACEHOLDER.test(KEY) && !PLACEHOLDER.test(URL_));

const SECTIONS = [
  { id: 601, role: 'Adam', flag: 'ADAM_SELF_SCORE_CADENCE' },
  { id: 611, role: 'Solomon', flag: 'SOLOMON_SELF_SCORE_CADENCE' },
];

const content = new Map();

beforeAll(async () => {
  if (!CAN_RUN) return;
  const db = createClient(URL_, KEY);
  const { data } = await db.from('leo_protocol_sections').select('id, content').in('id', SECTIONS.map((s) => s.id));
  for (const row of data || []) content.set(row.id, row.content || '');
});

describe.skipIf(!CAN_RUN)('FR-5 — the contract states the self-score operating reality', () => {
  for (const { id, role, flag } of SECTIONS) {
    describe(`section ${id} (${role})`, () => {
      it('names the flag that gates the scorer', () => {
        expect(content.get(id), `section ${id} not readable`).toBeTruthy();
        expect(content.get(id)).toContain(flag);
      });

      it('CLAIM 1 — says the scorer ships inert', () => {
        expect(content.get(id)).toMatch(/ships inert/i);
      });

      it('CLAIM 2 — says --force is the operating path, not a workaround', () => {
        // The distinction matters: DEFECT-2 of this SD described a ratified operating path as
        // though it were a lucky override, because the contract never said otherwise.
        const c = content.get(id);
        expect(c).toMatch(/--force/);
        expect(c).toMatch(/operating path/i);
      });

      it('CLAIM 3 — says leo_feature_flags is a GAUGE, not a gate', () => {
        // Without this, the natural remedy ("flip the flag row") is a silent no-op: the writers
        // read process.env only and nothing hydrates that table into the environment.
        //
        // ASSERTED AS A PHRASE, not as separate words. Section 601 already mentioned both
        // "gauge" and "leo_feature_flags" elsewhere for unrelated reasons, so `toMatch(/gauge/i)`
        // passed with or without this block — an assertion that cannot fail is not evidence, which
        // is the very failure mode this SD exists to remove. The conjunction is what bites.
        const c = content.get(id);
        expect(c).toMatch(/GAUGE FOR THIS FLAG, NOT A GATE/i);
        expect(c).toMatch(/no runtime effect/i);
      });

      it('RECONCILES the inert flag with the mandated cadence', () => {
        // "Ships inert" read as "no score is expected" would contradict a 6h armed loop and an 8h
        // staleness gauge. The contract has to hold both at once or it trades one confusion for another.
        //
        // ASSERTED AS ONE PHRASE. A bare /6h/ was vacuous on section 601: it already said "6h"
        // twice for unrelated reasons (the delta-first judgment window and the self-adherence tick),
        // so that half passed with or without this block. Only /8h/ was load-bearing. Requiring the
        // two to appear TOGETHER in the reconciliation sentence is what actually bites.
        expect(content.get(id)).toMatch(/every ~6h via[\s\S]{0,120}8h/i);
      });
    });
  }

  it('NEGATIVE CONTROL — the sections are not trivially matching everything', () => {
    // Guards against a content assertion that would pass on any large document: if these sections
    // "contained" an arbitrary phrase, every assertion above would be meaningless.
    for (const { id } of SECTIONS) {
      expect(content.get(id)).not.toMatch(/the scorers ship live/i);
      expect(content.get(id)).not.toMatch(/zzz-not-in-any-contract-zzz/);
    }
  });
});
