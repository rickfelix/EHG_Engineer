/**
 * Static-pin regression test for QF-20260520-436.
 *
 * autoCloseFeedback resolves feedback by metadata.deferred_from_sd_key, but that
 * key is OVERLOADED: emit-feedback sets it on bundled-CAPA the SD addresses
 * (auto-close correct), while log-harness-bug.js sets it on items merely DEFERRED
 * to a future campaign (auto-close WRONG — silently drops backlog work). The fix
 * marks deferred items metadata.defer_only=true and excludes them from the sweep.
 *
 * Pins (matching the QF-20260510-925 dual-anchor convention):
 *   - the reader (autoCloseFeedback) excludes defer_only=true from the deferred_from query
 *   - the writer (log-harness-bug.js) stamps defer_only=true
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXECUTOR_PATH = resolve(__dirname, '../../../scripts/modules/handoff/executors/lead-final-approval/index.js');
const WRITER_PATH = resolve(__dirname, '../../../scripts/log-harness-bug.js');

describe('QF-20260520-436: deferred harness_backlog items are not auto-closed on SD completion', () => {
  const executorSrc = readFileSync(EXECUTOR_PATH, 'utf8');
  const writerSrc = readFileSync(WRITER_PATH, 'utf8');

  it('reader: autoCloseFeedback excludes metadata.defer_only=true from the deferred_from sweep', () => {
    // Scope to the QF-20260510-925 deferred_from block so the exclusion is on the
    // right query (not a coincidental match elsewhere).
    const startIdx = executorSrc.indexOf('// 3. QF-20260510-925');
    expect(startIdx).toBeGreaterThan(-1);
    const slice = executorSrc.slice(startIdx, startIdx + 1100);
    // The deferred_from query must carry BOTH the deferred_from filter and the new exclusion.
    expect(slice).toMatch(/'metadata->>deferred_from_sd_key',\s*'eq',\s*sdKey/);
    expect(slice).toMatch(/\.not\('metadata->>defer_only',\s*'eq',\s*'true'\)/);
  });

  it('reader: terminalStatuses exclusion is still preserved (no regression)', () => {
    const startIdx = executorSrc.indexOf('// 3. QF-20260510-925');
    const slice = executorSrc.slice(startIdx, startIdx + 1600);
    expect(slice).toMatch(/\.not\('status',\s*'in',\s*terminalStatuses\)/);
  });

  it('writer: log-harness-bug.js stamps defer_only=true in feedback metadata', () => {
    // defer_only rides alongside deferred_from_sd_key in the emitFeedback metadata.
    const mdIdx = writerSrc.indexOf('deferred_from_sd_key: sd');
    expect(mdIdx).toBeGreaterThan(-1);
    const slice = writerSrc.slice(mdIdx, mdIdx + 600);
    expect(slice).toMatch(/defer_only:\s*true/);
  });
});
