#!/usr/bin/env node
'use strict';
/**
 * fw3-cmv-rejecter.cjs CLI — SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-D (FR-2).
 *
 * The STRUCTURAL-SEPARATION surface of the adversarial CMV-rejecter: a cheap,
 * separate session lists pending instrument-class framings, performs the
 * adversarial CMV-rejection REASONING itself (the judgment is deliberately not
 * in code — spine §3.3 owns the objective function), and records the verdict.
 * The CLI hard-refuses when the invoking session IS the active Solomon:
 * the proposer must never be its own rejecter (CONST-002 correction,
 * docs/design/fw3-effort-distribution-tier-design.md §3).
 *
 * Usage:
 *   node scripts/fw3-cmv-rejecter.cjs list
 *   node scripts/fw3-cmv-rejecter.cjs record <row-id> rejected|survived --grounds "<why>"
 *
 * Env (read HERE, injected into the pure core per DESIGN A2):
 *   FW3_REJECTER_MIN_SAMPLE (default 10), FW3_REJECTER_EPSILON (default 0.05)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const {
  listPendingFramings, recordVerdict, checkStructuralSeparation, detectFakeSeparation,
} = require('../lib/governance/fw3-cmv-rejecter.cjs');
const { getActiveSolomonId } = require('../lib/coordinator/solomon-identity.cjs');

async function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  if (mode !== 'list' && mode !== 'record' && mode !== 'gauge') {
    console.error('Usage: node scripts/fw3-cmv-rejecter.cjs list | record <row-id> rejected|survived --grounds "<why>" | gauge');
    process.exit(2);
  }
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (mode === 'list') {
    const { items, error } = await listPendingFramings(supabase);
    if (error) { console.error('ERROR:', error); process.exit(1); }
    if (!items.length) {
      console.log('No pending instrument-class framings (benign pre-Child-A empty world, or all verdicted).');
      return;
    }
    console.log(`${items.length} pending instrument-class framing(s) awaiting an adversarial CMV pass:`);
    for (const f of items) {
      console.log(`\n• id=${f.id} from=${String(f.sender_session).slice(0, 8)} at=${f.created_at}`);
      console.log(`  subject: ${f.subject}`);
      const body = (f.payload && f.payload.body) || '';
      console.log(`  body: ${String(body).slice(0, 400)}${body.length > 400 ? '…' : ''}`);
    }
    console.log('\nAdversarial pass: for each framing, try to REJECT on CMV grounds (does it drift from the north-star? is the framing foreclosing the real problem?). Then: record <id> rejected|survived --grounds "..."');
    return;
  }

  if (mode === 'gauge') {
    const minSample = Number(process.env.FW3_REJECTER_MIN_SAMPLE) || 10;
    const epsilon = Number(process.env.FW3_REJECTER_EPSILON) || 0.05;
    console.log(JSON.stringify(await detectFakeSeparation(supabase, { minSample, epsilon }), null, 2));
    return;
  }

  // record — the structural-separation guard runs FIRST (fail-closed, FR-2 AC2).
  const invokerSession = process.env.CLAUDE_SESSION_ID || null;
  let activeSolomonSession = null;
  try { activeSolomonSession = await getActiveSolomonId(supabase); } catch { activeSolomonSession = null; }
  const sep = checkStructuralSeparation({ invokerSession, activeSolomonSession });
  if (!sep.ok) {
    console.error(`ERROR: [STRUCTURAL_SEPARATION] ${sep.reason}`);
    process.exit(4);
  }

  const rowId = argv[1];
  const verdict = argv[2];
  const gIdx = argv.indexOf('--grounds');
  const grounds = gIdx >= 0 ? argv[gIdx + 1] : null;
  const r = await recordVerdict(supabase, { rowId, verdict, grounds, rejecterSession: invokerSession });
  if (r.alreadyVerdicted) { console.error('REFUSED: framing already carries a cmv_rejecter verdict (first verdict wins).'); process.exit(3); }
  if (!r.ok) { console.error('ERROR:', r.error); process.exit(1); }
  console.log(`✓ Verdict recorded: ${r.verdict.verdict} on ${rowId}`);
  console.log(`  grounds: ${r.verdict.grounds}`);
}

if (require.main === module) {
  main().catch((e) => { console.error('UNHANDLED:', (e && e.message) || e); process.exit(1); });
}
