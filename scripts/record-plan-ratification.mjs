#!/usr/bin/env node
// Governed path for recording a chairman PLAN ratification
// (SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001, FR-1).
//
// Every plan ratification MUST carry an explicit wave disposition — the
// disposition primitive (lib/decision-binding/disposition.js, decision type
// 'plan_ratification') throws without one, so a disposition-less ratification
// is unrecordable on this path. Both disposition kinds stamp roadmap
// freshness; idempotent (same workstream twice returns the existing row).
//
// Usage:
//   node scripts/record-plan-ratification.mjs --workstream "<name>" \
//     (--wave <roadmap_waves.id> | --no-wave "<reason>") \
//     [--authority chairman] [--key "<decision label>"]

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { recordDisposition } from '../lib/decision-binding/disposition.js';

function usage(msg) {
  if (msg) console.error(`\n❌ ${msg}`);
  console.error('\nUsage: node scripts/record-plan-ratification.mjs --workstream "<name>" (--wave <wave-id> | --no-wave "<reason>") [--authority chairman] [--key "<label>"]');
  process.exit(1);
}

const args = process.argv.slice(2);
const val = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const workstream = val('--workstream');
if (!workstream) usage('--workstream is required');

const waveId = val('--wave');
const noWave = val('--no-wave');
const waveDisposition = waveId ? { waveId } : (noWave ? { noWave } : null);

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

try {
  const { row, created } = await recordDisposition(supabase, {
    decisionType: 'plan_ratification',
    subject: { workstream },
    decisionKey: val('--key') || workstream,
    authority: val('--authority') || 'chairman',
    answerPayload: { ratified: true },
    waveDisposition,
  });
  console.log(`✓ plan ratification ${created ? 'recorded' : 'already recorded (idempotent)'}`);
  console.log(`  question_key: ${row.payload.question_key}`);
  console.log(`  workstream:   ${workstream}`);
  console.log(`  disposition:  ${waveId ? `wave ${waveId}` : `no_wave (${noWave})`}`);
  process.exit(0);
} catch (err) {
  usage(err.message);
}
