#!/usr/bin/env node
// scripts/michael/capture.mjs — stage a capture (a thought, a task idea, a ruling to encode later)
// in michael_staged_items; never applied unprompted (spec §2/§7).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B (FR-3).
//
// Usage: node scripts/michael/capture.mjs --text "Call the dentist" [--kind capture] [--payload '{"...":1}'] [--dry-run] [--json]
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, writeRows, refusal, emit } from '../../lib/michael/db.mjs';

export const CAPTURE_KINDS = Object.freeze(['capture', 'rule_edit', 'ruling', 'proposal']);

export async function runCapture({ sb, argv = [], now = new Date() } = {}) {
  const a = parseArgs(argv);
  if (!a.text) return refusal('MISSING_ARGS', '--text is required');
  const kind = typeof a.kind === 'string' ? a.kind : 'capture';
  if (!CAPTURE_KINDS.includes(kind)) return refusal('INVALID_KIND', `kind ${kind} not in ${CAPTURE_KINDS.join('|')}`);
  let extra = {};
  if (typeof a.payload === 'string') {
    try { extra = JSON.parse(a.payload); } catch (e) { return refusal('PAYLOAD_INVALID', `--payload is not JSON: ${e.message}`); }
    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return refusal('PAYLOAD_INVALID', '--payload must be a JSON object');
  }
  const row = { kind, payload: { ...extra, text: String(a.text), captured_by: process.env.CLAUDE_SESSION_ID || 'cli', captured_at: now.toISOString() }, staged_at: now.toISOString() };
  if (a['dry-run']) return { ok: true, dry_run: true, would_write: row };
  const w = await writeRows(sb, 'michael_staged_items', (t) => t.insert(row).select('id').single());
  if (!w.ok) return refusal(w.refusal, w.error);
  return { ok: true, id: w.data ? w.data.id : null, kind };
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runCapture({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  process.exitCode = r.ok ? 0 : 2;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[MICHAEL-CAPTURE] ${e && e.message ? e.message : e}`); process.exitCode = 1; });
}
