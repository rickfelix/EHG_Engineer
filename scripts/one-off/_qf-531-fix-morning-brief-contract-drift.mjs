#!/usr/bin/env node
/**
 * QF-20260720-531: fix leo_protocol_sections id=601 (Adam role contract, clause c4) — it
 * claimed "each subsequent heartbeat checks morning-brief-delivered-today and sends it late if
 * the 6:00 fire was ever missed", but no such check ever existed anywhere in the codebase
 * (verified: heartbeat-sms's own prompt has zero morning_brief reference; no
 * delivered-today/sent-today helper exists in lib/ or scripts/). This is the contract-vs-code
 * drift that let the missed 2026-07-20 fire go unnoticed until the chairman asked.
 *
 * Replaces the false claim with an accurate description of the real fix: a durable, self-healing
 * GitHub Actions cron (scripts/cron/chairman-morning-brief-sweep.mjs +
 * .github/workflows/chairman-morning-brief-cron.yml) that needs no live Adam session at all.
 *
 * Surgical string replace — touches ONLY this one sentence, not the surrounding clause.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { pathToFileURL } from 'url';
dotenv.config();

const SECTION_ID = 601;
const OLD = 'it is RECONCILED, never fire-and-forget: each subsequent heartbeat checks morning-brief-delivered-today and sends it late if the 6:00 fire was ever missed (late > never — the 2026-07-18 missed-morning-review RCA).';
const NEW = 'it is DURABLE and self-healing without any live Adam session: a GitHub Actions cron (scripts/cron/chairman-morning-brief-sweep.mjs, .github/workflows/chairman-morning-brief-cron.yml) runs every 15 minutes from 6:00-11:59 AM ET and enqueues via the per-ET-date dedupe key — the first tick past 6:00 does the real send, every later tick is a no-op UNLESS the first attempt failed, in which case the next tick sends it late (QF-20260720-531; the prior design relied on a live Adam session re-arming this via ADAM_LOOPS, which is exactly the "session CronCreate expires in 7 days" failure class QF-20260719-196/QF-20260719-997 fixed for two sibling duties the same day — morning-brief-sms was not migrated then and missed its very next fire).';

// ADVERSARIAL-REVIEW NOTE (known, accepted limitation): this is a compare-and-replace, not a
// compare-and-swap -- the write is not conditioned on row.content matching what was just read
// (e.g. .eq('content', row.content)), so a concurrent edit to id=601 landing between the read and
// the write could be silently clobbered. Accepted here because this is a one-shot, already-run
// migration script (kept for audit trail per this repo's scripts/one-off/ convention): re-running
// it is the only way the race could matter, and the OLD-substring guard below already makes a
// second run a loud no-op once this fix has landed once.
export async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url, key);

  const { data: row, error: readErr } = await supabase.from('leo_protocol_sections').select('id, content').eq('id', SECTION_ID).maybeSingle();
  if (readErr) throw readErr;
  if (!row) throw new Error(`section id=${SECTION_ID} not found`);
  if (!row.content.includes(OLD)) throw new Error('OLD string not found verbatim — content may have drifted since this script was written; re-verify before re-running');

  const updated = row.content.replace(OLD, NEW);
  const { error: writeErr } = await supabase.from('leo_protocol_sections').update({ content: updated }).eq('id', SECTION_ID);
  if (writeErr) throw writeErr;

  console.log(`Updated leo_protocol_sections id=${SECTION_ID}: ${row.content.length} -> ${updated.length} chars`);
}

// ADVERSARIAL-REVIEW FIX: mirror chairman-morning-brief-sweep.mjs's entrypoint guard -- a bare
// module-scope main() call fires this DB write on IMPORT (a test-glob, coverage tool, or script
// indexer scanning scripts/), not just on direct invocation. Never auto-run on import.
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
}
