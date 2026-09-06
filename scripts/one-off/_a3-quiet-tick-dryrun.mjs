/**
 * DRY RUN — what checkRatificationRegressions WOULD flag once it goes multi-target.
 * SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B, PR3 precondition (PRD FR-6 AC-2).
 *
 * WHY THIS RUNS BEFORE THE CHANGE, not after. The gauge is LIVE: defined at
 * scripts/adam-quiet-tick.mjs:789 and invoked at :1203 on every non-hash-skipped tick. It flags 0
 * today. Flipping it to multi-target without knowing the new count would put an unknown number of
 * findings into a live lane on the very next tick, and rows that nobody can repair — the ledger's
 * append-only freeze trigger permits only NULL->set, so the historical misses are unfixable
 * in-child. An alert that fires on rows nobody can act on trains everyone to ignore the alert.
 *
 * Read-only. Touches no row, writes no state.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveContractTargets } from '../../lib/chairman/contract-target-resolver.mjs';
import { resolveEncodeCommit, readContractAtCommit } from '../../lib/chairman/pinned-contract-read.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const { data, error } = await sb
  .from('chairman_ratifications')
  .select('id, encoded_at, encoded_ref, marker_text, target_contracts')
  .not('encoded_at', 'is', null)
  .limit(999);

if (error) { console.error('read failed:', error.message); process.exit(1); }

const rows = data || [];
const out = {
  measured_at: new Date().toISOString(),
  encoded_rows: rows.length,
  would_flag: 0,
  clean: 0,
  unmeasurable: 0,
  by_contract: {},
  by_reason: {},
  rows: [],
};

for (const row of rows) {
  const ref = row.encoded_ref || {};
  const contracts = Array.isArray(row.target_contracts) ? row.target_contracts.filter(Boolean) : [];
  const rec = { id: String(row.id).slice(0, 8), contracts, missing: [], reason: null };

  if (!ref.section_id || contracts.length === 0) {
    rec.reason = 'not_section_id_or_no_contracts';
    out.unmeasurable++; out.by_reason[rec.reason] = (out.by_reason[rec.reason] || 0) + 1;
    out.rows.push(rec); continue;
  }

  const pin = await resolveEncodeCommit({ encoded_ref: ref, encoded_at: row.encoded_at }, { repoRoot: REPO_ROOT });
  if (!pin.commit) {
    rec.reason = 'no_commit_pin';
    out.unmeasurable++; out.by_reason[rec.reason] = (out.by_reason[rec.reason] || 0) + 1;
    out.rows.push(rec); continue;
  }
  rec.pin_tier = pin.tier;

  let anyReadable = false;
  for (const contract of contracts) {
    let files;
    try { files = resolveContractTargets(contract, { repoRoot: REPO_ROOT }); }
    catch { rec.missing.push(`${contract}:unresolvable`); continue; }
    let found = false, readAny = false;
    for (const rel of files) {
      let content;
      try { content = await readContractAtCommit(pin.commit, rel, { repoRoot: REPO_ROOT }); }
      catch { continue; }
      readAny = true; anyReadable = true;
      if (content.includes(row.marker_text)) { found = true; break; }
    }
    if (readAny && !found) {
      rec.missing.push(contract);
      out.by_contract[contract] = (out.by_contract[contract] || 0) + 1;
    }
  }

  if (!anyReadable) {
    rec.reason = 'no_targets_readable_at_pin';
    out.unmeasurable++; out.by_reason[rec.reason] = (out.by_reason[rec.reason] || 0) + 1;
  } else if (rec.missing.length > 0) {
    out.would_flag++;
  } else {
    out.clean++;
  }
  out.rows.push(rec);
}

mkdirSync(join(REPO_ROOT, '.artifacts', 'testing'), { recursive: true });
const path = join(REPO_ROOT, '.artifacts', 'testing', 'quiet-tick-multi-target-dryrun.json');
writeFileSync(path, JSON.stringify(out, null, 2));

console.log('=== DRY RUN: what the multi-target gauge would flag ===');
console.log('encoded rows      :', out.encoded_rows);
console.log('WOULD FLAG        :', out.would_flag);
console.log('clean             :', out.clean);
console.log('unmeasurable      :', out.unmeasurable, JSON.stringify(out.by_reason));
console.log('missing by contract:', JSON.stringify(out.by_contract));
console.log('artifact          :', path);
