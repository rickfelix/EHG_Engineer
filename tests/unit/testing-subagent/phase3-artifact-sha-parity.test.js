/**
 * VALIDATION sub-agent VERIFY review (SD-LEARN-FIX-LEARNING-IMPROVEMENT-005, evidence
 * 82c7605b): phases/phase3-execution.js:222 hashes the just-parsed report object inline
 * (sha256(JSON.stringify(report))) rather than calling computeArtifactSha() a second time
 * (SEC-1 fix -- single read, no split-read TOCTOU). This pins that the two independent
 * expressions are byte-identical on the same input, so a future gate comparing a
 * mainline-stamped artifact_sha against computeArtifactSha()'s own output (or against
 * test_runs.report_hash, computed the same way by scripts/lib/test-evidence-ingest.js) is
 * comparing like with like, not silently drifting.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { computeArtifactSha } from '../../../lib/sub-agents/testing/artifact-verification.js';

describe('phase3-execution.js inline hash === computeArtifactSha() (SEC-1 parity)', () => {
  it('produces the identical sha256 for the same Playwright report content', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'phase3-sha-parity-'));
    try {
      const reportPath = path.join(dir, 'playwright-results.json');
      const report = { stats: { expected: 42, unexpected: 1, skipped: 3, flaky: 0 } };
      writeFileSync(reportPath, JSON.stringify(report));

      // The EXACT expression phases/phase3-execution.js:203/222 uses: parse the raw file
      // content once, then hash the re-serialized object.
      const parsedInline = JSON.parse(readFileSync(reportPath, 'utf8'));
      const inlineSha = createHash('sha256').update(JSON.stringify(parsedInline)).digest('hex');

      const referenceSha = computeArtifactSha(reportPath);

      expect(inlineSha).toBe(referenceSha);
      expect(inlineSha).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
