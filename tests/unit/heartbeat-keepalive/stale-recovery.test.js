/**
 * SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001 FR-3 + FR-6 TS-15.
 *
 * Unit test verifying lib/session-manager.mjs::updateHeartbeat now recovers
 * sessions from BOTH 'released' AND 'stale' statuses (was only 'released'
 * before this SD).
 *
 * Static-pin pattern (mocking-independent): reads source file via fs.readFileSync
 * + regex assertions on the recover-released-OR-stale UPDATE block.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sessionManagerPath = path.resolve(__dirname, '../../../lib/session-manager.mjs');

describe('FR-3 lib/session-manager.mjs::updateHeartbeat — stale-status recovery', () => {
  const src = fs.readFileSync(sessionManagerPath, 'utf-8');

  it('recover-released conditional now uses .in("status", [...]) with both released AND stale', () => {
    // Find the recovery UPDATE block
    expect(src).toMatch(
      /\.in\(\s*['"]status['"],\s*\[\s*['"]released['"]\s*,\s*['"]stale['"]\s*\]\s*\)/
    );
  });

  it('recovery UPDATE includes status=active', () => {
    // Find the UPDATE call with status: 'active' near the recovery block
    expect(src).toMatch(
      /\.update\(\s*\{\s*status:\s*['"]active['"]/
    );
  });

  it('recovery UPDATE clears stale_reason and stale_at on reactivation', () => {
    // The UPDATE payload should null out the cron-written stale fields
    expect(src).toMatch(/stale_reason:\s*null/);
    expect(src).toMatch(/stale_at:\s*null/);
  });

  it('SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001 marker comment present (traceability)', () => {
    expect(src).toMatch(/SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001/);
  });

  it('does NOT regress to .eq("status", "released") only (pre-fix shape)', () => {
    // The recovery block must NOT use .eq for status — that's the pre-fix shape.
    // Find the lines around the recovery UPDATE and check the status filter shape.
    const recoverStart = src.indexOf("Recover released OR stale sessions");
    expect(recoverStart).toBeGreaterThan(0);
    const recoverBlock = src.slice(recoverStart, recoverStart + 1500);
    // Recovery block must use .in for status, not .eq
    expect(recoverBlock).not.toMatch(/\.eq\(\s*['"]status['"],\s*['"]released['"]\s*\)/);
  });
});

describe('FR-3 sd-start.js wires startHeartbeat after claim verification', () => {
  const sdStartPath = path.resolve(__dirname, '../../../scripts/sd-start.js');
  const src = fs.readFileSync(sdStartPath, 'utf-8');

  it('imports startHeartbeat from heartbeat-manager', () => {
    expect(src).toMatch(
      /import\s+\{[^}]*\bstartHeartbeat\b[^}]*\}\s+from\s+['"]\.\.\/lib\/heartbeat-manager\.mjs['"]/
    );
  });

  it('invokes startHeartbeat with cooperative ownership mode', () => {
    expect(src).toMatch(
      /startHeartbeat\([^)]*\{\s*ownershipMode:\s*['"]cooperative['"]/
    );
  });

  it('startHeartbeat invocation is wrapped in try/catch (non-fatal)', () => {
    // Find the FR-3 region by marker comment
    const fr3Start = src.indexOf('SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001 FR-3');
    expect(fr3Start).toBeGreaterThan(0);
    const fr3Region = src.slice(fr3Start, fr3Start + 2000);
    expect(fr3Region).toMatch(/try\s*\{/);
    expect(fr3Region).toMatch(/catch\s*\(\s*hbErr/);
  });
});
