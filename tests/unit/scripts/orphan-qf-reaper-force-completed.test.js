// QF-20260508-847: orphan-qf-reaper UPDATE must include force_completed:true
// to satisfy quick_fixes CHECK constraint completed_requires_verification:
//   (tests_passing AND uat_verified) OR force_completed
//
// Both UPDATE call-sites in scripts/orphan-qf-reaper.mjs are reaper-driven
// retroactive completions — neither path can vouch for tests_passing or
// uat_verified at row-level. force_completed:true is the canonical override
// (mirrors the database-agent canonical UPDATE pattern used for QF-20260508-515
// retro-reconcile and the complete-quick-fix.js --force-complete flag).
//
// Prior witness: QF-20260508-182 added verified_by + verification_notes but
// missed force_completed; reaper still hit the CHECK on every cron run since
// 2026-05-08T23:32Z, leaving QF-911/-492/-182/-648 stuck as orphans.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildMergedReconcileUpdate } from '../../../scripts/modules/complete-quick-fix/orchestrator.js';
import { alreadyWitnessed, WITNESS_MARKER } from '../../../scripts/orphan-qf-reaper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REAPER_PATH = join(__dirname, '..', '..', '..', 'scripts', 'orphan-qf-reaper.mjs');

describe('orphan-qf-reaper.mjs — force_completed coverage (QF-847 static guard)', () => {
  const source = readFileSync(REAPER_PATH, 'utf8');

  // Shared with the drift-style scans below: a source test that reads its own explanatory
  // prose measures the documentation, not the code.
  function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  }

  // Robust to formatting: count `.update({` blocks targeting quick_fixes that
  // also contain `force_completed: true` somewhere in the same block (until
  // the matching `})`). Both sites must qualify.
  function findUpdateBlocks(src) {
    const blocks = [];
    let cursor = 0;
    while (true) {
      const start = src.indexOf('.update({', cursor);
      if (start === -1) break;
      // Find matching closing `})` by tracking braces, naive but sufficient
      let depth = 1;
      let i = src.indexOf('{', start) + 1;
      while (i < src.length && depth > 0) {
        const ch = src[i];
        if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
        i += 1;
      }
      blocks.push(src.slice(start, i));
      cursor = i;
    }
    return blocks;
  }

  it('contains exactly two .update({...}) blocks (pr_url + branch-derived paths)', () => {
    const blocks = findUpdateBlocks(source);
    expect(blocks.length).toBe(2);
  });

  // QF-20260807-745 RESTATES this guard; it does not retire it. QF-847's invariant was
  // "never write status:'completed' without force_completed:true", because the reaper had
  // been violating completed_requires_verification on every cron run since 2026-05-08 and
  // stranded QF-911/-492/-182/-648. That invariant is still correct — the reaper simply no
  // longer writes a terminal status at all, because a merged PR witnesses that CODE LANDED
  // and never that this QF's SCOPE WAS SATISFIED.
  //
  // Stated CONDITIONALLY so it stays armed rather than becoming vacuously true: if any
  // future edit reintroduces a terminal close here, force_completed must come with it.
  it('no UPDATE block writes a terminal status — and any that ever does must carry force_completed', () => {
    // Comments MUST be stripped first. The fix documents itself by quoting the code it
    // replaced ("was status:'completed' ..."), so a raw scan matches the explanation and
    // reports the very defect that was removed. Caught by this test failing on its own prose.
    const blocks = findUpdateBlocks(stripComments(source));
    expect(blocks.length).toBeGreaterThan(0); // vacuity: a zero-block scan must not pass
    for (const [idx, block] of blocks.entries()) {
      const writesTerminal = /status:\s*'completed'/.test(block);
      expect(writesTerminal, `block #${idx + 1} writes status:'completed' — the reaper witnesses a merge, it cannot vouch for scope (QF-20260807-745)`).toBe(false);
      if (writesTerminal) {
        // QF-20260508-847 preserved for the day someone reintroduces a terminal close.
        expect(block, `block #${idx + 1} writes completed without force_completed:true — violates completed_requires_verification`).toMatch(/force_completed:\s*true/);
      }
    }
  });

  it('both UPDATE blocks route through the shared reconcile contract, not a local restatement', () => {
    // The drift this prevents is the reason the defect existed: complete-quick-fix already
    // decided what a merged PR proves (QF-20260725-691) and the reaper answered differently.
    const blocks = findUpdateBlocks(source);
    expect(blocks.length).toBe(2);
    for (const [idx, block] of blocks.entries()) {
      expect(block, `block #${idx + 1} does not spread buildMergedReconcileUpdate`).toMatch(/\.\.\.buildMergedReconcileUpdate\(/);
    }
    expect(source).toMatch(/import\s*\{[^}]*buildMergedReconcileUpdate[^}]*\}\s*from/);
  });

  it('still references the SD origin (FR1) in the file header', () => {
    expect(source).toMatch(/SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001.*FR1/);
  });

  // QF-20260807-745: a defect the FIX created. Terminal `completed` removed a row from the
  // candidate query; non-terminal `in_progress` does not, so without a guard the reaper
  // re-witnesses the same QF every 15 minutes and appends to verification_notes forever.
  // The old code could not exhibit this — the bug was masked by the behaviour being fixed.
  describe('re-witness guard (the loop the terminal close was hiding)', () => {
    const witnessed = (prUrl) => ({
      verification_notes: `PR ${prUrl} MERGED and reachable from origin/main — ${WITNESS_MARKER}. Attest with: ...`,
    });

    it('does not re-witness the SAME PR', () => {
      expect(alreadyWitnessed(witnessed('https://github.com/o/r/pull/7'), 'https://github.com/o/r/pull/7')).toBe(true);
    });

    it('DOES admit a DIFFERENT PR on the same QF — that is the guard-then-fix case', () => {
      // QF-647 merged a guard PR first and the real fix 65 minutes later. A second, later PR
      // is new information; suppressing it would rebuild the blindness from the other side.
      expect(alreadyWitnessed(witnessed('https://github.com/o/r/pull/7'), 'https://github.com/o/r/pull/8')).toBe(false);
    });

    it('admits a row that has never been witnessed', () => {
      expect(alreadyWitnessed({ verification_notes: null }, 'https://github.com/o/r/pull/7')).toBe(false);
      expect(alreadyWitnessed({}, 'https://github.com/o/r/pull/7')).toBe(false);
      expect(alreadyWitnessed({ verification_notes: 'some unrelated note' }, 'https://github.com/o/r/pull/7')).toBe(false);
    });

    it('BOTH candidate queries select verification_notes — the guard reads it', () => {
      // Without this the predicate reads undefined and is silently false on every run, AND
      // buildMergedReconcileUpdate PREPENDS the same column, so prior notes are overwritten.
      // One omission, two defects; this pins the column that prevents both.
      // Anchor on target_application: it appears ONLY in the two CANDIDATE queries. Matching
      // `id, status` alone also catches the `.select('id, status')` on each UPDATE's return,
      // which found 4 and would have made this assertion mean something else entirely.
      const selects = (stripComments(source).match(/\.select\('[^']*'\)/g) || [])
        .filter((s) => s.includes('target_application'));
      expect(selects.length, 'expected exactly the 2 candidate queries').toBe(2);
      for (const [idx, sel] of selects.entries()) {
        expect(sel, `candidate select #${idx + 1} omits verification_notes`).toContain('verification_notes');
      }
    });

    it('preserves existing verification_notes rather than overwriting them', () => {
      const payload = buildMergedReconcileUpdate({
        qf: { id: 'QF-20260101-004', verification_notes: 'EARLIER HISTORY' },
        prUrl: 'https://github.com/o/r/pull/9',
        mergeSha: 'sha9',
        nowIso: '2026-01-01T00:00:00Z',
        scopeAcceptedBy: null,
      });
      expect(payload.verification_notes).toContain('EARLIER HISTORY');
      expect(payload.verification_notes).toContain(WITNESS_MARKER);
    });
  });

  // SD-LEO-INFRA-ORPHAN-REAPER-INTEGRATION-001 FR-1: per-path UPDATE column allowlist
  // and FORBIDDEN-column guard. Closes the writer/consumer asymmetry regression class
  // that produced QF-911/-492/-182/-847 in 24h.
  describe('FR-1: per-path UPDATE column allowlist + forbidden columns', () => {
    const REQUIRED_BOTH_PATHS = [
      'status', 'completed_at', 'commit_sha',
      'compliance_verdict', 'compliance_details',
      'verified_by', 'verification_notes', 'force_completed',
    ];
    const REQUIRED_BRANCH_DERIVED_ONLY = ['pr_url'];
    const FORBIDDEN_COLUMNS = ['metadata', 'merged_via', 'escalation_target', 'audit_log'];

    function blockHasKey(block, key) {
      // Match `<key>:` at top level of the block (allow whitespace)
      return new RegExp(`\\b${key}\\s*:`).test(block);
    }

    // QF-20260807-745: these two were source-greps for literal `<key>:` text. Both blocks now
    // spread the shared contract, so the columns are REAL but INVISIBLE to a text scan — a
    // grep for a statement form is not a test for the behaviour. Assert the payload the
    // reaper actually sends instead, which is strictly stronger than what it replaced.
    it('pr_url path payload carries the witness columns and NO terminal-close columns', () => {
      const payload = {
        ...buildMergedReconcileUpdate({
          qf: { id: 'QF-20260101-001', verification_notes: null },
          prUrl: 'https://github.com/o/r/pull/1',
          mergeSha: 'abc123',
          nowIso: '2026-01-01T00:00:00Z',
          scopeAcceptedBy: null,
        }),
        compliance_details: 'Merge witnessed by orphan-qf-reaper (pr_url path, PR #1) — NOT a scope acceptance.',
      };
      expect(payload.status).toBe('in_progress');
      expect(payload.pr_url).toBe('https://github.com/o/r/pull/1');
      expect(payload.commit_sha).toBe('abc123');
      expect(payload.verification_notes).toContain(WITNESS_MARKER);
      expect(payload.compliance_details).toContain('NOT a scope acceptance');
      // The whole point: nothing here may assert the QF is finished.
      expect(payload.force_completed).toBeUndefined();
      expect(payload.compliance_verdict).toBeUndefined();
      expect(payload.completed_at).toBeUndefined();
    });

    it('branch-derived path payload sets pr_url (it was null) and is likewise non-terminal', () => {
      const payload = buildMergedReconcileUpdate({
        qf: { id: 'QF-20260101-002', verification_notes: null },
        prUrl: 'https://github.com/o/r/pull/2',
        mergeSha: 'def456',
        nowIso: '2026-01-01T00:00:00Z',
        scopeAcceptedBy: null,
      });
      expect(payload.status).toBe('in_progress');
      expect(payload.pr_url).toBe('https://github.com/o/r/pull/2');
      expect(payload.force_completed).toBeUndefined();
    });

    it('the SAME contract still reaches terminal WITH a scope attestation (QF-594 control)', () => {
      // Two-sided: proves the non-terminal result above is caused by the missing attestation,
      // not by the contract being incapable of completing anything.
      const payload = buildMergedReconcileUpdate({
        qf: { id: 'QF-20260101-003', verification_notes: null },
        prUrl: 'https://github.com/o/r/pull/3',
        mergeSha: 'ghi789',
        nowIso: '2026-01-01T00:00:00Z',
        scopeAcceptedBy: 'Bravo — scope verified',
      });
      expect(payload.status).toBe('completed');
      expect(payload.force_completed).toBe(true); // QF-847's constraint still honoured here
    });

    it('neither UPDATE block contains forbidden columns', () => {
      const blocks = findUpdateBlocks(source);
      for (const [idx, block] of blocks.entries()) {
        for (const col of FORBIDDEN_COLUMNS) {
          expect(blockHasKey(block, col), `block #${idx + 1} contains forbidden column: ${col}`).toBe(false);
        }
      }
    });
  });

  // FR-2: idempotency .eq('status', qf.status) chain pinned on both UPDATE call sites.
  describe('FR-2: idempotency guard on both UPDATE blocks', () => {
    it('source contains exactly two .eq(\'id\', qf.id).eq(\'status\', qf.status) chains', () => {
      // Match `.eq('id', qf.id)` followed (allowing whitespace/newlines) by `.eq('status', qf.status)`
      const re = /\.eq\(\s*['"]id['"]\s*,\s*qf\.id\s*\)\s*\.eq\(\s*['"]status['"]\s*,\s*qf\.status\s*\)/g;
      const matches = source.match(re) || [];
      expect(matches.length).toBe(2);
    });
  });

  // FR-3: SUMMARY counter shape pin (10 keys) — protects GitHub Action observability.
  describe('FR-3: summary object key shape', () => {
    const EXPECTED_KEYS = [
      'evaluated', 'reconciled',
      'skipped_pr_not_merged', 'skipped_pr_not_found', 'skipped_already_completed',
      'orphan_evaluated', 'orphan_reconciled',
      'orphan_skipped_no_merged_pr', 'orphan_skipped_already_completed',
      // QF-20260807-745: landing non-terminal keeps a witnessed row in the candidate query,
      // so re-witnessing had to be counted as well as prevented — a silent skip is a skip
      // nobody can see in the Action log.
      'skipped_already_witnessed',
      'errored',
    ];

    function extractSummaryBlock(src) {
      const start = src.indexOf('const summary = {');
      if (start === -1) return null;
      let depth = 1;
      let i = src.indexOf('{', start) + 1;
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') depth -= 1;
        i += 1;
      }
      return src.slice(start, i);
    }

    it('summary block declares all expected counter keys', () => {
      const block = extractSummaryBlock(source);
      expect(block, 'summary block not found').not.toBeNull();
      for (const key of EXPECTED_KEYS) {
        expect(new RegExp(`\\b${key}\\s*:`).test(block), `summary missing key: ${key}`).toBe(true);
      }
    });

    it('summary block declares ONLY the expected counter keys (no extras)', () => {
      const block = extractSummaryBlock(source);
      expect(block).not.toBeNull();
      // Count `<word>:` occurrences at top level (rough — but valid since summary is a flat object)
      const keyMatches = block.match(/^\s*[a-z_]+\s*:/gm) || [];
      expect(keyMatches.length).toBe(EXPECTED_KEYS.length);
    });
  });
});
