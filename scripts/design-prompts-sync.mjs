#!/usr/bin/env node
/**
 * design-prompts-sync — checksum guard for the vendored shared design-prompts source.
 * SD-LEO-INFRA-UNIFY-STAGE-DESIGN-001
 *
 * `lib/eva/bridge/shared-design-prompts.json` is a VENDORED copy of the shared source
 * (3 audits + Feedback page) — byte-equivalent to the ehg copy
 * (src/components/stage17/gvos/shared-design-prompts.json). design-prompts-writer.js
 * builds docs/design-prompts.md from it. This computes the SAME canonical sha256 the
 * ehg sync script computes; the twinned cross-repo CI workflow diffs the two so the
 * S17 and S19 shared bodies can never silently diverge.
 *
 *   node scripts/design-prompts-sync.mjs            # write the checksum
 *   node scripts/design-prompts-sync.mjs --check    # exit 1 if the checksum is stale
 */
import { readFileSync, writeFileSync, realpathSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'lib', 'eva', 'bridge', 'shared-design-prompts.json');
const SUM = join(here, '..', 'lib', 'eva', 'bridge', 'shared-design-prompts.sha256');

/** Canonical hash — MUST match ehg scripts/design-prompts-sync.mjs (parse + compact
 *  stringify + NFC) so the cross-repo checksum comparison is apples-to-apples. */
export function canonicalChecksum(jsonText) {
  const parsed = JSON.parse(jsonText);
  const norm = JSON.parse(JSON.stringify(parsed), (_k, v) => (typeof v === 'string' ? v.normalize('NFC') : v));
  return createHash('sha256').update(JSON.stringify(norm)).digest('hex');
}

// Run the CLI body ONLY when executed directly (`node scripts/design-prompts-sync.mjs`),
// not when imported for canonicalChecksum. Otherwise importing this module (the parity
// test, the cross-repo check) would rewrite SUM as a side effect and silently defeat the
// freshness gate — a corrupted committed checksum would be overwritten before the test
// ever reads it. (SD-LEO-INFRA-UNIFY-STAGE-DESIGN-001 Phase 3)
const invokedDirectly =
  process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const sum = canonicalChecksum(readFileSync(SRC, 'utf8'));
  const check = process.argv.includes('--check');

  if (check) {
    let committed = '';
    try { committed = readFileSync(SUM, 'utf8').trim(); } catch { /* missing */ }
    if (committed !== sum) {
      console.error(`[design-prompts] checksum STALE\n  committed: ${committed || '(none)'}\n  actual:    ${sum}\n  run: npm run design-prompts:sync`);
      process.exit(1);
    }
    console.log('[design-prompts] checksum OK', sum);
  } else {
    writeFileSync(SUM, sum + '\n', 'utf8');
    console.log('[design-prompts] wrote checksum', sum);
  }
}
