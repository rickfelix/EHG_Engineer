#!/usr/bin/env node
// solomon-self-adherence-review — Solomon audits its OWN role-contract adherence.
//
// SD: SD-LEO-INFRA-SOLOMON-CONSULT-001E-C (Phase E3). Mirrors the adam-self-adherence-review
// pattern: probe the durable role-contract duties (from CLAUDE_SOLOMON.md), compare them against the
// armed SOLOMON_LOOPS, and emit a propose-only remediation summary when a duty has drifted out of the
// tooling. Solomon never builds the fix (propose, never execute) — it surfaces the drift for the
// coordinator. Fail-open: always exits 0; a hiccup never blocks the tick.

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SOLOMON_LOOPS, ROLE_CONTEXT_DOC, missingDurableDuties } from './solomon-startup-check.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

/**
 * Pure: build the self-adherence verdict. Reads CLAUDE_SOLOMON.md (if present) and reports which
 * durable contract duties have drifted out of SOLOMON_LOOPS. Returns { ok, drifted:[], note }.
 * ok=true means parity holds (or the contract isn't seeded yet — a skip, not a failure). Exported.
 */
export function buildSelfAdherenceVerdict(repoRoot = REPO_ROOT) {
  let md = null;
  try { md = readFileSync(resolve(repoRoot, ROLE_CONTEXT_DOC), 'utf8'); } catch { md = null; }
  if (!md) {
    return { ok: true, drifted: [], note: `${ROLE_CONTEXT_DOC} not present yet (Phase E-B seeds it) — parity check skipped (fail-open).` };
  }
  const drifted = missingDurableDuties(md, SOLOMON_LOOPS);
  if (drifted.length === 0) return { ok: true, drifted: [], note: 'all durable Solomon role-contract duties are present in SOLOMON_LOOPS.' };
  return {
    ok: false,
    drifted,
    note: `CONTRACT DRIFT: ${drifted.length} durable duty(ies) declared in ${ROLE_CONTEXT_DOC} but absent from SOLOMON_LOOPS: ${drifted.join(', ')}. PROPOSE-ONLY remediation: add them to SOLOMON_LOOPS (scripts/solomon-startup-check.mjs) — Solomon surfaces the drift, the coordinator routes the fix (Solomon never builds).`,
  };
}

export function renderReport(repoRoot = REPO_ROOT) {
  const v = buildSelfAdherenceVerdict(repoRoot);
  const head = '═══ SOLOMON SELF-ADHERENCE AUDIT ═══\n  ';
  return head + (v.ok ? `✅ ${v.note}` : `⚠️ ${v.note}`);
}

function main() {
  try { console.log(renderReport()); } catch (err) { console.log('solomon-self-adherence-review fail-open:', err?.message || String(err)); }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('solomon-self-adherence-review.mjs')) {
  main();
}
