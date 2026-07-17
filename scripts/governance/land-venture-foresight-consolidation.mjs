#!/usr/bin/env node
/**
 * Land the Venture Foresight Board spec + supersede the stub + stamp consolidation constraints.
 * SD-LEO-INFRA-LAND-VENTURE-FORESIGHT-001 (Solomon Mode-C hand-off #3, ledger 299c7f9f)
 *
 * Governance-record mutations ONLY — the Phase-1 BUILD is DEFERRED-with-trigger (v3 selection
 * cycle) and is NOT sourced here. Idempotent: safe to re-run.
 *
 *   FR-1  verify docs/design/ehg-venture-foresight-board-spec.md is durable on origin/main.
 *   FR-2  supersede the deferred duplicate stub SD-REFILL-00X2A49J via the CANONICAL
 *         scripts/cancel-sd.js superseded path (never a hand-rolled status write — its
 *         evidence guard verifies the spec exists on origin/main).
 *   FR-3  stamp THREE binding anti-fork consolidation constraints as durable structured
 *         metadata on THIS SD (the concrete governance record for the deferred build).
 */
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export const SPEC_PATH = 'docs/design/ehg-venture-foresight-board-spec.md';
export const THIS_SD = 'SD-LEO-INFRA-LAND-VENTURE-FORESIGHT-001';
export const STUB_SD = 'SD-REFILL-00X2A49J';

/**
 * FR-3: the three binding anti-fork consolidation constraints (pure — unit-tested).
 * Each future Phase-1 build SD inherits these so it cannot fork the plan.
 */
export function buildConsolidationConstraints() {
  return [
    { id: 'C1-signal-scan-is-market-signal-scanner', constraint: "The board's Signal-Scan mode IS the ratified Market-Signal Scanner — one signal system, never a parallel second.", relation: 'is', target: 'Market-Signal Scanner (ratified)' },
    { id: 'C2-routing-consumes-model-capability-reference', constraint: 'The spec §17 model routing CONSUMES model_capability_reference from the model-eval-harness SD — same table, no second routing doctrine.', relation: 'consumes', target: 'SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-HARNESS-001 / model_capability_reference' },
    { id: 'C3-venture-screen-extends-selection-demand', constraint: 'The Venture-Screen mode EXTENDS the shipped permanent stage SD-LEO-INFRA-VENTURE-SELECTION-DEMAND-001 — not a parallel screen.', relation: 'extends', target: 'SD-LEO-INFRA-VENTURE-SELECTION-DEMAND-001' },
  ];
}

/**
 * FR-2: the supersession reason string (pure). Matches cancel-sd.js's already-shipped/
 * superseded pattern (/superseded|duplicate[\s-]?of[\s-]?merged/i) AND names the spec + SD.
 */
export function buildSupersessionReason(thisSd = THIS_SD, specPath = SPEC_PATH) {
  return `Superseded by ${thisSd} — the Venture Foresight Board spec is durably landed at ${specPath} (one capture surface, anti-fork consolidation per Solomon hand-off #3).`;
}

/**
 * FR-3 idempotence: merge incoming constraints into existing metadata by id (no dupes). Pure.
 * @param {Array} existing
 * @param {Array} incoming
 * @returns {Array}
 */
export function mergeConstraints(existing, incoming) {
  const byId = new Map();
  for (const c of Array.isArray(existing) ? existing : []) { if (c && c.id) byId.set(c.id, c); }
  for (const c of incoming) { byId.set(c.id, c); } // incoming wins — canonical text is authoritative
  return [...byId.values()];
}

/**
 * FR-1: verdict on spec presence (pure). Loud failure when absent — never a silent pass.
 * @param {boolean} presentOnMain
 * @returns {{ok: boolean, message: string}}
 */
export function assessSpecPresence(presentOnMain) {
  return presentOnMain
    ? { ok: true, message: `FR-1 OK: ${SPEC_PATH} is durable on origin/main.` }
    : { ok: false, message: `FR-1 FAIL: ${SPEC_PATH} is NOT on origin/main — the spec regressed; landing required before superseding the stub.` };
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/** git: is SPEC_PATH present on origin/main? (fetches first). */
function specOnOriginMain() {
  const cwd = repoRoot();
  try { execFileSync('git', ['fetch', 'origin', 'main', '--quiet'], { cwd, stdio: 'ignore' }); } catch { /* offline — fall through to cat-file */ }
  try {
    execFileSync('git', ['cat-file', '-e', `origin/main:${SPEC_PATH}`], { cwd, stdio: 'ignore' });
    return true;
  } catch { return false; }
}

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // FR-1
  const fr1 = assessSpecPresence(specOnOriginMain());
  console.log(fr1.message);
  if (!fr1.ok) { process.exit(1); }

  // FR-2 — supersede the stub via the canonical tool (idempotent: skip if already cancelled)
  const { data: stub } = await supabase
    .from('strategic_directives_v2').select('sd_key, status, metadata').eq('sd_key', STUB_SD).maybeSingle();
  if (!stub) {
    console.log(`FR-2 note: stub ${STUB_SD} not found — nothing to supersede (treating as satisfied).`);
  } else if (stub.status === 'cancelled') {
    console.log(`FR-2 OK (idempotent): stub ${STUB_SD} already superseded/cancelled.`);
  } else {
    console.log(`FR-2: superseding ${STUB_SD} via scripts/cancel-sd.js …`);
    execFileSync('node', [
      'scripts/cancel-sd.js', STUB_SD,
      '--reason', buildSupersessionReason(),
      '--evidence-file', SPEC_PATH,
    ], { cwd: repoRoot(), stdio: 'inherit' });
    // stamp the discoverable pointer on the stub's metadata (additive)
    const supMeta = { ...(stub.metadata || {}), superseded_by: THIS_SD, superseded_by_spec: SPEC_PATH };
    await supabase.from('strategic_directives_v2').update({ metadata: supMeta }).eq('sd_key', STUB_SD);
    console.log(`FR-2 OK: ${STUB_SD} superseded, metadata.superseded_by pointer stamped.`);
  }

  // FR-3 — stamp the 3 consolidation constraints on THIS SD (idempotent merge by id)
  const { data: self } = await supabase
    .from('strategic_directives_v2').select('metadata').eq('sd_key', THIS_SD).maybeSingle();
  const merged = mergeConstraints((self?.metadata || {}).consolidation_constraints, buildConsolidationConstraints());
  const newMeta = { ...(self?.metadata || {}), consolidation_constraints: merged };
  await supabase.from('strategic_directives_v2').update({ metadata: newMeta }).eq('sd_key', THIS_SD);
  console.log(`FR-3 OK: ${merged.length} consolidation constraints stamped on ${THIS_SD}.`);

  console.log('\n✓ Foresight-board land + supersede + stamp complete (Phase-1 build remains DEFERRED-with-trigger).');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
}
