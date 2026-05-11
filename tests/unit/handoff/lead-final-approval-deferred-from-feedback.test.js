/**
 * Static-pin regression test for QF-20260510-925.
 *
 * Pins the metadata.deferred_from_sd_key channel in
 * LeadFinalApprovalExecutor.autoCloseFeedback so future refactors cannot
 * silently re-introduce the 18th-witness writer-consumer asymmetry
 * (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001). The dual-anchor pattern
 * matches established practice (SD-FDBK-ENH-CADENCE-VOCAB-DISCRIMINATOR-001
 * project memory): scoped-slice regex on the autoCloseFeedback method body
 * + whole-file regex on the JSONB filter literal.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE_PATH = resolve(
  __dirname,
  '../../../scripts/modules/handoff/executors/lead-final-approval/index.js'
);

describe('QF-20260510-925: autoCloseFeedback metadata.deferred_from_sd_key channel', () => {
  const src = readFileSync(SOURCE_PATH, 'utf8');

  it('source file imports and method exists (sanity)', () => {
    expect(src).toMatch(/async autoCloseFeedback\(sd\)/);
  });

  it('file contains the canonical JSONB filter literal', () => {
    // PostgREST JSONB ->> operator with exact key name; case-sensitive.
    expect(src).toMatch(/'metadata->>deferred_from_sd_key',\s*'eq',\s*sdKey/);
  });

  it('linkedByDeferredFrom variable is declared and included in dedup', () => {
    // Scope to autoCloseFeedback body so unrelated future code can not
    // accidentally satisfy the pin.
    const startIdx = src.indexOf('async autoCloseFeedback(sd)');
    expect(startIdx).toBeGreaterThan(-1);
    // closing brace of the method (next line beginning with `  }`)
    const endIdx = src.indexOf('\n  }', startIdx);
    expect(endIdx).toBeGreaterThan(startIdx);
    const body = src.slice(startIdx, endIdx);

    expect(body).toMatch(/let\s+linkedByDeferredFrom\s*=\s*\[\]/);
    expect(body).toMatch(/\.\.\.linkedByDeferredFrom\.map\(f\s*=>\s*f\.id\)/);
  });

  it('new query is gated on sdKey (same defensive shape as linkedByBranch)', () => {
    const startIdx = src.indexOf('// 3. QF-20260510-925');
    expect(startIdx).toBeGreaterThan(-1);
    // Match a slice that captures the if-gate immediately following the comment.
    const slice = src.slice(startIdx, startIdx + 600);
    expect(slice).toMatch(/let\s+linkedByDeferredFrom\s*=\s*\[\];\s*if\s*\(sdKey\)/);
  });

  it('terminalStatuses exclusion is preserved on the new query', () => {
    const startIdx = src.indexOf('// 3. QF-20260510-925');
    const slice = src.slice(startIdx, startIdx + 900);
    expect(slice).toMatch(/\.not\('status',\s*'in',\s*terminalStatuses\)/);
  });
});
