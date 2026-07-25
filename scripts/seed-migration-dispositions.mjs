#!/usr/bin/env node
/**
 * Seed the migration disposition ledger from sources that already exist.
 * SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001 (FR-2).
 *
 * PURE CORE + isMain WRITES, mirroring buildInventory() in
 * scripts/audit/count-truncation-inventory.mjs: buildLedger() takes everything it needs as
 * arguments and returns a plain object, so it is unit-testable with no disk and no DB. All
 * writes happen in the isMain block at the bottom.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 *   It does not reach 126/126. The PRD named
 *   scripts/audit/migration-column-reachability.mjs as the RETIRE-bucket source; that file is
 *   UNTRACKED in git, exports nothing, and line 15 reads a cols.tsv from an expired session's
 *   scratchpad, so it throws at import and can never run in CI or from a worktree. The PRD
 *   carried a blocking AC for exactly this. Measured coverage of the surviving TRACKED sources
 *   is 17 of 126; the rest is honestly left UNDISPOSITIONED and reported.
 *
 *   It NEVER emits APPLIED (FR-2b). A file in the verifier's gap set is by definition not
 *   applied, so seeding APPLIED there would assert a falsehood AND suppress the gap — the
 *   ghost-completion this SD exists to correct. APPLIED is only ever a post-apply fact.
 *
 *   It does not invent decisions to drive the undispositioned count to zero. A number moved by
 *   fabricated reasons is worse than a number that stays high, because it looks finished.
 *
 * Usage:
 *   node scripts/seed-migration-dispositions.mjs           # report only, writes nothing
 *   node scripts/seed-migration-dispositions.mjs --write   # write the ledger
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOWN_DISPOSITIONS, DEFAULT_LEDGER_PATH } from './lib/migration-disposition-ledger.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SD_KEY = 'SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001';

/** How long an auto-seeded, uncorroborated deferral suppresses before it must be revisited. */
export const REVIEW_WINDOW_DAYS = 90;

/** The 3-factor guard's approver regex, verbatim from scripts/lib/migration-guards.js:30. */
const APPROVED_BY_RE = /^\s*--\s*@approved-by:\s*([^\s<>"]+@[^\s<>"]+)\s*$/m;

/** The chairman gate marker, verbatim from parseChairmanGatedMarker() in check-migration-readiness.mjs. */
const CHAIRMAN_GATED_RE = /^\s*--\s*(@chairman-gated|requires[-_]chairman[-_]apply)\b\s*[:=]?.*$/im;

/**
 * Parse the 2026-06-10 human sweep doc into object -> verdict.
 *
 * The doc is keyed by OBJECT with a defining-SQL path, under two headed sections. Only its
 * `database/migrations/` citations can ever match a verifier gap file (the verifier scans that
 * directory alone), so schema/, manual-updates/ and backups/ rows are parsed but never match.
 *
 * @returns {Map<string, {verdict:'DEFERRED'|'RETIRED', file:string}>} keyed by object name
 */
export function parseSweepDoc(markdown) {
  const out = new Map();
  let verdict = null;
  for (const line of String(markdown || '').split(/\r?\n/)) {
    if (/^##\s+DEFERRED/i.test(line)) { verdict = 'DEFERRED'; continue; }
    if (/^##\s+RETIRE-CANDIDATES/i.test(line)) { verdict = 'RETIRED'; continue; }
    if (/^##\s/.test(line)) { verdict = null; continue; } // e.g. the APPLIED-by-that-SD section
    if (!verdict) continue;

    // DEFERRED rows are markdown table rows: | object | refs | consumers | path |
    const row = line.match(/^\|\s*([a-z0-9_]+)\s*\|.*\|\s*(database\/[^\s|]+\.sql)\s*\|/i);
    if (row) { out.set(row[1].toLowerCase(), { verdict, file: row[2].split('/').pop() }); continue; }
    // RETIRE rows are bullets: - object_name (path/to.sql)
    const bullet = line.match(/^-\s+([a-z0-9_]+)\s+\((database\/[^\s)]+\.sql)\)/i);
    if (bullet) out.set(bullet[1].toLowerCase(), { verdict, file: bullet[2].split('/').pop() });
  }
  return out;
}

/**
 * Build the seeded ledger. PURE: no disk, no DB, no clock beyond the injected `now`.
 *
 * @param {object} args
 * @param {Array<{file:string, missing:Array<{cls:string,name:string}>}>} args.gaps verifier gap set
 * @param {Map<string,string>} args.sql basename -> file contents (only what the caller read)
 * @param {Map<string,{verdict:string,file:string}>} args.sweep parsed sweep-doc verdicts
 * @param {object} [args.existing] the ledger already committed on disk
 * @param {string} args.now ISO timestamp for NEW entries only
 * @returns {{ledger:object, seeded:string[], preserved:string[], residue:string[], reasons:object}}
 */
export function buildLedger({ gaps, sql, sweep, existing = {}, now }) {
  const ledger = {};
  const seeded = [];
  const preserved = [];
  const residue = [];
  const reasons = {};

  // CARRY FORWARD EVERY EXISTING ENTRY FIRST, including ones whose file is no longer in the
  // gap set. Seeding only over `gaps` would silently DELETE a recorded decision the moment its
  // migration got applied or retired and therefore left the gap set — the audit trail erasing
  // itself at exactly the moment a decision was fulfilled, which is the opposite of an audit
  // trail. A disposition is a permanent record of a judgement, not a cache of current state.
  for (const [basename, entry] of Object.entries(existing)) ledger[basename] = entry;

  for (const gap of gaps) {
    const base = String(gap.file).replace(/^.*[\\/]/, '');

    // IDEMPOTENCE + HAND-ADJUDICATION SURVIVAL: an entry already on disk is copied through
    // byte-for-byte, so recorded_at is never regenerated and a human verdict is never
    // overwritten by a re-seed. This is what makes `git diff --exit-code` in CI meaningful.
    if (existing[base]) {
      ledger[base] = existing[base];
      preserved.push(base);
      continue;
    }

    // RULE A — chairman-gated with no valid approver stamp => DEFERRED.
    // Fully machine-verifiable and re-derivable from the file itself: the gate marker is
    // present and the 3-factor guard's own regex finds no usable @approved-by, so the apply
    // is genuinely waiting on a chairman signature. That is a real deferral, not a guess.
    const body = sql.get(base) || '';
    if (CHAIRMAN_GATED_RE.test(body) && !APPROVED_BY_RE.test(body)) {
      ledger[base] = {
        disposition: 'DEFERRED',
        reason: 'Chairman-gated migration carrying no parseable "-- @approved-by: <email>" stamp, '
          + 'so the 3-factor guard in scripts/lib/migration-guards.js cannot admit it. Apply is '
          + 'blocked on chairman sign-off, not on engineering work. NOTE: the gate marker is '
          + 'SELF-ASSERTED in the migration file and is not corroborated against an external '
          + 'registry, so an author can obtain this deferral by adding one comment line to their '
          + 'own SQL. Treat as disclosed-but-unverified provenance when auditing.',
        owner: 'chairman',
        sd_key: SD_KEY,
        recorded_at: now,
        // A self-asserted, uncorroborated deferral must be time-boxed, or one comment line in
        // the author's own SQL buys a PERMANENT gate exemption. At expiry the file resurfaces
        // as real drift and as undispositioned, forcing a fresh decision rather than decaying
        // into a silent allowance.
        review_by: new Date(Date.parse(now) + REVIEW_WINDOW_DAYS * 86400000).toISOString(),
        source: 'auto:chairman-gate-marker',
        corroborated: false,
      };
      seeded.push(base);
      reasons[base] = 'A';
      continue;
    }

    // RULE B — the 2026-06-10 human sweep, but ONLY at full object coverage.
    //
    // The doc records verdicts per OBJECT while this ledger is per FILE, and a single file can
    // host objects with DIFFERENT verdicts (uat-structured-reports.sql appears under both
    // DEFERRED and RETIRE-CANDIDATES). Promoting a partial object verdict to a file verdict
    // would over-claim: the sweep simply never looked at the uncovered objects. So the file is
    // dispositioned only when EVERY object the verifier reports missing is covered by the doc.
    // FILE ANCHOR (the PRD's content-anchor requirement, FR-1). Matching on object NAME alone
    // silently re-targets a verdict onto a different migration. Observed for real: the doc
    // adjudicates v_sd_test_readiness in 20251210_unified_test_evidence.sql, but the verifier's
    // lifecycle fold attributes that view to 20251211_unified_test_evidence_fixed.sql, which
    // RECREATED it — so a name-only match stamped a "zero live references, retire-candidate"
    // verdict onto a file the sweep never looked at. Requiring the doc's cited file to BE this
    // file makes a drifted key fail safe to undispositioned instead of re-targeting.
    const missing = Array.isArray(gap.missing) ? gap.missing : [];
    const verdicts = missing.map((m) => {
      const hit = sweep.get(String(m.name).toLowerCase());
      return hit && hit.file === base ? hit.verdict : undefined;
    });
    if (missing.length && verdicts.every(Boolean)) {
      // DEFERRED dominates RETIRED: one live-referenced object is enough to make retiring the
      // whole file wrong. Conservative direction — never retire something still in use.
      const verdict = verdicts.includes('DEFERRED') ? 'DEFERRED' : 'RETIRED';
      ledger[base] = {
        disposition: verdict,
        reason: `Human sweep triage docs/database/committed-unapplied-sweep-2026-06-10.md `
          + `(status: approved) classified all ${missing.length} missing object(s) `
          + `[${missing.map((m) => m.name).join(', ')}] as ${verdict === 'RETIRED' ? 'zero-live-reference retire-candidates' : 'live-referenced, pending a per-case apply-vs-retire decision'}. `
          + `File-level verdict is the conservative join over those objects.`,
        owner: 'SD-LEO-INFRA-APPLY-RETIRE-COMMITTED-001',
        sd_key: SD_KEY,
        recorded_at: now,
        source: 'auto:sweep-2026-06-10',
      };
      seeded.push(base);
      reasons[base] = 'B';
      continue;
    }

    // RULE C — no derivable verdict. Left OUT of the ledger on purpose so it keeps counting as
    // UNDISPOSITIONED. Writing a placeholder here would move the metric without deciding
    // anything, which is precisely the failure mode FR-3 exists to expose.
    residue.push(base);
  }

  return { ledger, seeded, preserved, residue, reasons };
}

/** Sort keys so re-seeding produces a stable file and `git diff --exit-code` is meaningful. */
export function serializeLedger(ledger) {
  const sorted = {};
  for (const k of Object.keys(ledger).sort()) sorted[k] = ledger[k];
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

// ── isMain: all I/O lives below this line ────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const write = process.argv.includes('--write');
  const gapsArg = process.argv.find((a) => a.startsWith('--gaps='));
  if (!gapsArg) {
    console.error('Usage: node scripts/seed-migration-dispositions.mjs --gaps=<verifier --json output> [--write]');
    process.exit(2);
  }

  // The verifier prepends a dotenvx banner to stdout before its JSON (pre-existing on
  // origin/main), so slice from the first line that is exactly '{' rather than parsing raw.
  const lines = readFileSync(gapsArg.slice('--gaps='.length), 'utf8').split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === '{');
  const report = JSON.parse(lines.slice(start).join('\n'));

  const ledgerPath = path.join(ROOT, DEFAULT_LEDGER_PATH);
  const existing = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : {};

  const sql = new Map();
  for (const g of report.gaps) {
    const base = String(g.file).replace(/^.*[\\/]/, '');
    const p = path.join(ROOT, 'database', 'migrations', base);
    if (existsSync(p)) sql.set(base, readFileSync(p, 'utf8'));
  }
  const sweep = parseSweepDoc(readFileSync(path.join(ROOT, 'docs/database/committed-unapplied-sweep-2026-06-10.md'), 'utf8'));

  const { ledger, seeded, preserved, residue, reasons } = buildLedger({
    gaps: report.gaps, sql, sweep, existing, now: new Date().toISOString(),
  });

  const byRule = (r) => seeded.filter((f) => reasons[f] === r).length;
  console.log(`gap files:      ${report.gaps.length}`);
  console.log(`preserved:      ${preserved.length} (existing entries, untouched — recorded_at not regenerated)`);
  console.log(`seeded:         ${seeded.length}  [rule A chairman-gate=${byRule('A')}, rule B sweep-doc=${byRule('B')}]`);
  console.log(`UNDISPOSITIONED residue requiring human adjudication: ${residue.length}`);
  console.log(`\nsweep doc parsed: ${sweep.size} object verdicts`);
  if (seeded.length) {
    console.log('\nSEEDED:');
    for (const f of seeded) console.log(`   ${ledger[f].disposition.padEnd(9)} ${f}  (rule ${reasons[f]})`);
  }

  // Guard the FR-2b invariant at the point of writing, not only in the ledger reader: a future
  // rule that emitted APPLIED for a gap file would suppress a genuinely-unapplied migration.
  const bad = Object.entries(ledger).filter(([, e]) => !KNOWN_DISPOSITIONS.includes(e.disposition) || e.disposition === 'APPLIED');
  if (bad.length) {
    console.error(`\nREFUSING TO WRITE: ${bad.length} entr(ies) carry APPLIED or an unknown disposition: ${bad.map(([f]) => f).join(', ')}`);
    console.error('A file in the gap set is by definition NOT applied (FR-2b).');
    process.exit(1);
  }

  if (write) {
    mkdirSync(path.dirname(ledgerPath), { recursive: true });
    writeFileSync(ledgerPath, serializeLedger(ledger), 'utf8');
    console.log(`\nwrote ${Object.keys(ledger).length} entries -> ${DEFAULT_LEDGER_PATH}`);
  } else {
    console.log('\n(dry run — pass --write to persist)');
  }
}
