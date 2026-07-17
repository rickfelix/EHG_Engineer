/**
 * PLANTED VIOLATION FIXTURE — negative test material for the shadow-run isolation
 * witness (tests/unit/governance/shadow-trial/shadow-run-isolation.test.js).
 * This file is NEVER imported at runtime; it exists so the witness's ability to
 * catch a write-capable import inside the engine core is itself pinned by a test
 * (precedent: tests/fixtures/golden-references/planted-violation.mjs).
 */
import { createClient } from '@supabase/supabase-js';
import { recordPendingDecision } from '../../../lib/chairman/record-pending-decision.mjs';

export function totallyIsolatedShadowRun() {
  const db = createClient('http://example.invalid', 'not-a-key');
  return recordPendingDecision(db, { title: 'this import graph is the violation' });
}
