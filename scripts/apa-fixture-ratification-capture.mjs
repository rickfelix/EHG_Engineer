#!/usr/bin/env node
// SD-LEO-INFRA-DECISION-BINDING-PRIMITIVE-001 FR-3: ratification-capture consumer.
//
// review-packet.html's Confirm/Flag-for-swap buttons are visual-only and CANNOT
// reach a network endpoint -- the Artifact publishing surface enforces a strict
// CSP that blocks all fetch/XHR. This script is the actual capture path: run it
// after the chairman states his ratification decisions in conversation (the
// established pattern for chairman-stated decisions in this codebase — see
// coordinator-ack-adam.cjs --disposition), and it persists each decision as a
// disposition_row keyed on (fixture_set_id, fixture_id) via the shared
// decision-binding primitive.
//
// Usage:
//   node scripts/apa-fixture-ratification-capture.mjs \
//     --fixture-set apa-calibration-2026-07-08 \
//     --confirmed G1,G2,G4,D1,D2,D3,D4,D6,B1,B2,I1,I2 \
//     --flagged G3,D5,B3,I3 \
//     --authority chairman
//
// Idempotent: re-running with the same fixture-set + fixture_id dedups against
// the existing disposition row (question_key is content-derived, not
// correlation-derived) instead of creating a duplicate.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { recordDisposition } from '../lib/decision-binding/disposition.js';

function parseArgs(argv) {
  const out = { fixtureSet: null, confirmed: [], flagged: [], authority: 'chairman' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fixture-set') out.fixtureSet = argv[++i];
    else if (a === '--confirmed') out.confirmed = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--flagged') out.flagged = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--authority') out.authority = argv[++i];
  }
  if (!out.fixtureSet) throw new Error('--fixture-set is required');
  return out;
}

export async function captureRatifications(supabase, { fixtureSet, confirmed, flagged, authority }) {
  const results = [];
  for (const fixtureId of confirmed) {
    const { row, created } = await recordDisposition(supabase, {
      decisionType: 'ratification',
      subject: { fixture_set_id: fixtureSet, fixture_id: fixtureId },
      decisionKey: `${fixtureSet}:${fixtureId}:ratification`,
      authority,
      answerPayload: { confirmed: true, flagged: false },
    });
    results.push({ fixtureId, verdict: 'confirmed', created, questionKey: row.payload.question_key });
  }
  for (const fixtureId of flagged) {
    const { row, created } = await recordDisposition(supabase, {
      decisionType: 'ratification',
      subject: { fixture_set_id: fixtureSet, fixture_id: fixtureId },
      decisionKey: `${fixtureSet}:${fixtureId}:ratification`,
      authority,
      answerPayload: { confirmed: false, flagged: true },
    });
    results.push({ fixtureId, verdict: 'flagged', created, questionKey: row.payload.question_key });
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const results = await captureRatifications(supabase, args);
  for (const r of results) {
    console.log(`${r.fixtureId}: ${r.verdict} -> ${r.created ? 'NEW' : 'DEDUPED (already recorded)'} disposition row (question_key=${r.questionKey})`);
  }
  console.log(`\n${results.length} ratification(s) captured for fixture-set "${args.fixtureSet}".`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('apa-fixture-ratification-capture: FAILED:', err.message);
    process.exit(1);
  });
}
