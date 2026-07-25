#!/usr/bin/env node
/**
 * Mirror the migration disposition ledger into public.audit_log.
 * SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001 (FR-5).
 *
 * The committed JSON stays the SOURCE OF TRUTH; this is a durable governance trail on top of
 * it. That direction matters: every audit_log writer in this repo needs SUPABASE_SERVICE_ROLE_KEY,
 * so if the CI gate read audit_log it would need service-role credentials just to decide whether
 * a migration is dispositioned. The gate reads the JSON and never calls this script.
 *
 * Convention copied from recordTierAudit() in
 * scripts/modules/handoff/pre-checks/pending-migrations-check.js, including its non-fatal
 * posture: a governance mirror must never break the caller.
 *
 * LIVE COLUMNS ONLY. public.audit_log is (id, event_type, entity_type, entity_id, old_value,
 * new_value, metadata, severity, created_by, created_at) — verified against the live table.
 * There are NO `action` or `details` columns; lib/claim-validity-gate.js documents a prior
 * runtime break caused by inserting exactly those.
 *
 * Usage:
 *   node scripts/mirror-migration-dispositions-to-audit.mjs           # dry run
 *   node scripts/mirror-migration-dispositions-to-audit.mjs --write
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { DEFAULT_LEDGER_PATH, isSuppressingEntry, KNOWN_DISPOSITIONS } from './lib/migration-disposition-ledger.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EVENT_TYPE = 'MIGRATION_DISPOSITION';

/**
 * Rows to insert, given the ledger and what audit_log already holds. PURE — no DB, no disk.
 *
 * IDEMPOTENT BY DISPOSITION, not by mere presence: an entity already mirrored is skipped only
 * when its recorded disposition still matches. If a human re-adjudicates DEFERRED -> RETIRED, a
 * NEW row is written so the trail shows the change rather than silently keeping the stale one.
 *
 * @param {Record<string, object>} ledger
 * @param {Map<string,string>} mirrored entity_id -> most recent disposition already in audit_log
 * @returns {{rows: object[], skipped: string[], invalid: string[]}}
 */
/**
 * Stable fingerprint of the DECISION an entry records — everything an auditor would consider a
 * different decision. Deliberately excludes recorded_at, so re-seeding alone never churns rows.
 *
 * @param {object} entry
 * @returns {string}
 */
export function decisionFingerprint(entry) {
  return JSON.stringify([
    entry?.disposition ?? null,
    (entry?.reason ?? '').trim(),
    entry?.owner ?? null,
    entry?.corroborated ?? null,
    entry?.review_by ?? null,
  ]);
}

export function buildAuditRows(ledger, mirrored = new Map(), actor = null) {
  const rows = [];
  const skipped = [];
  const invalid = [];

  for (const [basename, entry] of Object.entries(ledger || {})) {
    if (!entry || typeof entry !== 'object' || !KNOWN_DISPOSITIONS.includes(entry.disposition)) {
      invalid.push(basename);
      continue;
    }
    // Keyed on the DECISION CONTENT, not the disposition alone. Keying on disposition let a
    // materially reworded reason never reach the trail — observed for real: all three reasons
    // were rewritten to add the self-assertion disclosure while the dispositions stayed
    // DEFERRED, and this loop would have skipped every one of them.
    if (mirrored.get(basename) === decisionFingerprint(entry)) {
      skipped.push(basename);
      continue;
    }
    rows.push({
      event_type: EVENT_TYPE,
      entity_type: 'migration',
      entity_id: basename,
      severity: 'info', // a recorded decision is not a warning
      // The subject of this trail is "who authorised removing a migration from the CI fail
      // set", so an actor is the one field it cannot omit. metadata.owner is an auto-derived
      // ROLE (e.g. "chairman"), which is not the same as the identity that ran the write.
      created_by: actor,
      metadata: {
        disposition: entry.disposition,
        owner: entry.owner || null,
        reason: entry.reason || null,
        decided_at: entry.recorded_at || null,
        sd_key: entry.sd_key || null,
        source: entry.source || null,
        // Provenance quality, as a queryable FIELD rather than only inside free-text prose:
        // false means the grounds are self-asserted in the migration file and uncorroborated.
        corroborated: entry.corroborated ?? null,
        // When this suppression lapses and the file resurfaces as drift. null = never expires.
        review_by: entry.review_by || null,
        decision_fingerprint: decisionFingerprint(entry),
        // Whether this disposition actually removes the file from the strict fail set. APPLIED
        // is a legitimate record but NEVER suppresses (FR-2b), so a reader can tell a decision
        // that changed gate behaviour from one that only documented a fact.
        suppresses_gate: isSuppressingEntry(entry),
      },
    });
  }
  return { rows, skipped, invalid };
}

// ── isMain: all I/O below ────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const write = process.argv.includes('--write');
  const ledgerPath = path.join(ROOT, DEFAULT_LEDGER_PATH);
  if (!existsSync(ledgerPath)) {
    console.log(`No ledger at ${DEFAULT_LEDGER_PATH} — nothing to mirror.`);
    process.exit(0);
  }
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

  require('dotenv').config({ path: path.join(ROOT, '.env') });
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE credentials — the JSON ledger remains the source of truth; skipping mirror.');
    process.exit(0); // non-fatal by design
  }
  const supabase = createClient(url, key);

  // PAGINATE. PostgREST caps a select at 1000 rows and returns the cap SILENTLY, so an
  // unpaginated read past 1000 MIGRATION_DISPOSITION rows would build `mirrored` from the
  // oldest 1000 and re-insert everything newer — defeating the idempotence this is built on.
  // Ascending order + last-write-wins means the final value per entity is its current one.
  const mirrored = new Map();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('audit_log').select('entity_id, metadata, created_at')
      .eq('event_type', EVENT_TYPE).order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`Could not read existing audit rows (${error.message}) — refusing to write, to avoid duplicating the trail.`);
      process.exit(0);
    }
    for (const r of data || []) mirrored.set(r.entity_id, r.metadata?.decision_fingerprint ?? null);
    if (!data || data.length < PAGE) break;
  }

  // Actor identity for created_by — the same source the migration approver factor uses.
  let actor = null;
  try {
    const { execFileSync } = await import('node:child_process');
    actor = execFileSync('git', ['config', 'user.email'], { cwd: ROOT, encoding: 'utf8' }).trim() || null;
  } catch { /* unattributed is better than a failed mirror */ }

  const { rows, skipped, invalid } = buildAuditRows(ledger, mirrored, actor);
  console.log(`ledger entries: ${Object.keys(ledger).length}`);
  console.log(`already mirrored (unchanged): ${skipped.length}`);
  console.log(`to write: ${rows.length}`);
  if (invalid.length) console.log(`SKIPPED as malformed: ${invalid.join(', ')}`);
  for (const r of rows) console.log(`   ${r.metadata.disposition.padEnd(9)} ${r.entity_id}  suppresses_gate=${r.metadata.suppresses_gate}`);

  if (!write) {
    console.log('\n(dry run — pass --write to persist)');
  } else if (rows.length) {
    const { error: insErr } = await supabase.from('audit_log').insert(rows);
    if (insErr) console.error(`⚠️ non-fatal: audit mirror failed (${insErr.message}). JSON ledger is unaffected.`);
    else console.log(`\nwrote ${rows.length} audit_log row(s)`);
  } else {
    console.log('\nnothing to write — audit trail already matches the ledger');
  }
}
